// io.js — CHỖ DUY NHẤT NÓI CHUYỆN VỚI GOOGLE
//
// Mọi hàm trong file này CHỈ chạy được trong Apps Script (dùng SpreadsheetApp /
// DriveApp / UrlFetchApp / PropertiesService), nên KHÔNG test được bằng Node —
// đó chính là lý do file này cố tình chỉ chứa đọc/ghi, không chứa quyết định
// nghiệp vụ nào. Muốn kiểm chứng phần này thì dùng các hàm probe_* trong main.js.
//
// Bốn phần:
//   1. ĐỌC/GHI 2 sheet output (顧客作品マスタ, コピーライトマスタ)
//   2. ĐỌC file TSV trên Drive (nguồn 掲載停止日付)
//   3. GHI 3 tab log (GAS1ログ, GAS1変更詳細, GAS1警告)
//   4. GỬI Slack

// ==============================================================================
// PHẦN 1 — ĐỌC/GHI 2 SHEET OUTPUT
// ==============================================================================

/**
 * Đọc TOÀN BỘ dữ liệu thô (bao gồm cả hàng header) của 1 sheet, dùng chung
 * cho việc đọc cả 3 nguồn input (parseRegulationRows/parseCmsRows/...) lẫn
 * bước đọc thô ban đầu. Đây là hàm SƠ KHAI nhất — mọi src/sources/*.js đều
 * nhận rawRows là kết quả của hàm này.
 *
 * @param {string} spreadsheetId - ID spreadsheet (lấy từ CONFIG.SOURCES.*)
 * @param {string} sheetName - Tên sheet/tab cụ thể trong spreadsheet đó
 * @returns {Array<Array<*>>} Toàn bộ giá trị ô, dạng mảng 2 chiều [hàng][cột]
 */
function readSheetValues(spreadsheetId, sheetName) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  return sheet.getDataRange().getValues();
}

/**
 * Đọc 1 sheet output, TỰ DÒ hàng header (không giả định hàng 1), build header
 * index (tên cột -> số cột) và kiểm tra sheet có ĐỦ các cột bắt buộc — throw lỗi
 * ngay nếu thiếu, thay vì để hàm gọi sau ghi nhầm cột.
 *
 * TẠI SAO PHẢI TỰ DÒ (2026-08-03): ガワ mới của 顧客作品マスタ có header ở HÀNG 15
 * — 14 hàng trên là tiêu đề, 更新チーム/更新日, 3 dòng [1]更新ルール, và 1 hàng đánh
 * dấu '自動入力/GAS'. Bản cũ của hàm này hardcode `getRange(1, 1, ...)` nên sẽ đọc
 * hàng tiêu đề làm header và throw "Không tìm thấy cột header" ngay lần chạy đầu
 * tiên. CỐ TÌNH không hardcode số 15: findHeaderRowIndex() (common.js) đã
 * làm đúng việc này cho các sheet nguồn, và ガワ đã đổi 2 lần trong 1 ngày —
 * hardcode là mời gọi lần thứ 3.
 *
 * Trả về luôn `values` (toàn bộ dữ liệu đã đọc) để hàm gọi không phải
 * getDataRange() lần thứ hai — mỗi lần gọi Apps Script API là một round-trip.
 *
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @param {Array<string>} requiredHeaders - Tên các cột BẮT BUỘC phải tồn tại
 * @returns {{sheet: Sheet, headerIndex: Map<string,number>, headerRowIndex: number,
 *   columnCount: number, values: Array<Array<*>>}}
 *   headerRowIndex: index 0-based của hàng header trong `values` (hàng thật trên
 *     sheet = headerRowIndex + 1)
 *   columnCount: bề rộng vùng ghi — max(getLastColumn(), độ rộng hàng header) để
 *     không bao giờ ghi hẹp hơn số cột đã biết
 */
function resolveMasterHeader(spreadsheetId, sheetName, requiredHeaders) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName + ' (spreadsheet ' + spreadsheetId + ')');
  var values = sheet.getDataRange().getValues();
  var headerRowIndex = findHeaderRowIndex(values, requiredHeaders);
  var headerRow = values[headerRowIndex];
  var headerIndex = buildHeaderIndex(headerRow);
  requiredHeaders.forEach(function (name) { col(headerIndex, name); });
  return {
    sheet: sheet,
    headerIndex: headerIndex,
    headerRowIndex: headerRowIndex,
    columnCount: Math.max(sheet.getLastColumn(), headerRow.length, 1),
    values: values,
  };
}

// ==================== 顧客作品マスタ (ガワ mới 2026-08-03) ====================
//
// Layout ガワ mới: header HÀNG 15, dữ liệu từ hàng 16, cột A là cột đệm trống,
// dữ liệu ở B→U. Thứ tự cột đã đổi hoàn toàn so với bản cũ (vd タイトル名 từ cột E
// sang cột K) nhưng KHÔNG cần sửa gì ở đây ngoài danh sách dưới, vì mọi truy cập
// đều qua col(headerIndex, 'tên cột').
//
// 6 CỘT GAS KHÔNG SỞ HỮU (phải giữ nguyên giá trị người ta điền tay):
//   A (đệm), E タイトル区分 (nguồn 出稿コミット管理表 chưa có file),
//   J LP制作, R 先行終了日（延長）, S 先行終了日（最終確定）,
//   T/U 大量無料開始日・終了日 (nguồn chưa có).
// Xem customerRecordToRow() để biết cách bảo toàn.
//
// Cột I 掲載停止日付 là trường hợp RIÊNG: GAS ĐIỀN nhưng chỉ khi ô đang TRỐNG —
// ghi một lần, không bao giờ ghi đè (nguồn: multi_title_yyyyMMdd.tsv trên Drive,
// join theo タイトルID). Cũng xem customerRecordToRow().

// Cột GAS ĐỌC + GHI. Thiếu bất kỳ cột nào trong đây -> throw ngay, vì ghi thiếu
// cột nghĩa là dữ liệu master sai một cách âm thầm.
var CUSTOMER_REQUIRED_HEADERS = [
  'タイトルNo', 'CMS ID', 'タイトルID', 'タイトル名', '作家名', 'ジャンル', '出版社',
  'レーベル名', '先行開始日', '先行終了日', '①広告出稿ポリシー', '②一般面出稿NG', '③シーモアロゴ判定',
  '掲載停止日付',
];

/**
 * Đọc toàn bộ dòng dữ liệu hiện có trên 顧客作品マスタ — đầu vào cho
 * filterAndMatchWorks()/resolveNumbersFromMatches() (logic/*) ở main.js.
 *
 * Bỏ qua dòng không có タイトル名 (thay vì CMS ID như bản cũ): タイトル名 là trường
 * duy nhất chắc chắn có giá trị ở mọi dòng do GAS ghi (spec §5.5), và nó cũng là
 * 1 trong 2 trường của khoá cascade — lọc theo đúng trường mà khoá đang dùng là
 * bài học đã ghi trong docs/gas1-van-hanh.md §3c.
 *
 * Trả về thêm 2 field KHÔNG có trên sheet:
 *   - sheetRow: số dòng THẬT (1-based) của dòng đó. Đường ghi dùng trực tiếp giá
 *     trị này thay vì tính rowOffset + 2 như bản cũ — công thức cũ ngầm giả định
 *     header ở hàng 1 VÀ không có dòng trống xen giữa, cả 2 đều sai với ガワ mới.
 *   - rawRow: mảng giá trị gốc của dòng, để customerRecordToRow() bảo toàn các cột
 *     GAS không sở hữu khi ghi đè.
 *
 * @returns {Array<{
 *   titleNo: *, cmsId: *, titleId: *, titleName: string, author: string,
 *   genre: string, publisher: string, label: string, preStart: *, preEnd: *,
 *   policy: string, general: string, logoJudgement: string, suspensionDate: *,
 *   sheetRow: number, rawRow: Array<*>
 * }>}
 */
function readCustomerWorkMaster() {
  var cfg = CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER;
  var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName, CUSTOMER_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colTitleNo = col(idx, 'タイトルNo');
  var colCmsId = col(idx, 'CMS ID');
  var colTitleId = col(idx, 'タイトルID');
  var colTitleName = col(idx, 'タイトル名');
  var colAuthor = col(idx, '作家名');
  var colGenre = col(idx, 'ジャンル');
  var colPublisher = col(idx, '出版社');
  var colLabel = col(idx, 'レーベル名');
  var colPreStart = col(idx, '先行開始日');
  var colPreEnd = col(idx, '先行終了日');
  var colPolicy = col(idx, '①広告出稿ポリシー');
  var colGeneral = col(idx, '②一般面出稿NG');
  var colLogo = col(idx, '③シーモアロゴ判定');
  var colSuspension = col(idx, '掲載停止日付');

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < resolved.values.length; i++) {
    var row = resolved.values[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[colTitleName]) === '') continue;
    records.push({
      titleNo: row[colTitleNo],
      cmsId: row[colCmsId],
      titleId: row[colTitleId],
      titleName: row[colTitleName],
      author: row[colAuthor],
      genre: row[colGenre],
      publisher: row[colPublisher],
      label: row[colLabel],
      preStart: row[colPreStart],
      preEnd: row[colPreEnd],
      policy: row[colPolicy],
      general: row[colGeneral],
      logoJudgement: row[colLogo],
      suspensionDate: row[colSuspension],
      sheetRow: i + 1,
      rawRow: row,
    });
  }
  return records;
}

/**
 * Chuyển 1 "work record" thành mảng giá trị theo ĐÚNG vị trí cột thật của sheet —
 * dùng bởi writeCustomerWorkMaster() cho cả update dòng cũ lẫn append dòng mới.
 *
 * ĐIỂM QUAN TRỌNG NHẤT — dòng ghi được dựng TỪ BẢN COPY CỦA DÒNG CŨ, rồi chỉ ghi
 * đè các cột GAS sở hữu. ガワ mới có 6 cột GAS KHÔNG ghi (タイトル区分, LP制作,
 * 先行終了日（延長）, 先行終了日（最終確定）, 大量無料開始日/終了日) — có cột do người
 * điền tay, có cột chờ nguồn dữ liệu chưa tồn tại. Cách cũ
 * (`new Array(columnCount).fill('')`) sẽ XOÁ TRẮNG cả 6 cột đó mỗi lần dòng bị
 * update, không có lỗi nào để nhận ra — chỉ là dữ liệu người ta nhập tự nhiên
 * biến mất sau 9h sáng. Dựng từ dòng cũ còn bền với việc 池永 thêm cột mới: cột lạ
 * được giữ nguyên thay vì bị xoá, không cần sửa code.
 *
 * @param {object} record - Work record đã qua resolveNumbersFromMatches()
 * @param {Map<string,number>} headerIndex - Từ resolveMasterHeader()
 * @param {number} columnCount - Bề rộng hàng cần ghi
 * @param {Array<*>|undefined} previousRow - rawRow của dòng cũ (chỉ có khi UPDATE);
 *   undefined khi append dòng mới -> các cột không sở hữu để trống
 * @returns {Array<*>} Mảng giá trị, sẵn sàng đưa vào Range.setValues([...])
 */
function customerRecordToRow(record, headerIndex, columnCount, previousRow) {
  var row = [];
  for (var c = 0; c < columnCount; c++) {
    var previousValue = previousRow ? previousRow[c] : '';
    row.push(previousValue === null || previousValue === undefined ? '' : previousValue);
  }

  row[col(headerIndex, 'タイトルNo')] = record.titleNo;
  row[col(headerIndex, 'CMS ID')] = record.cmsId;
  row[col(headerIndex, 'タイトルID')] = record.titleId;
  row[col(headerIndex, 'タイトル名')] = record.titleName;
  row[col(headerIndex, '作家名')] = record.author;
  row[col(headerIndex, 'ジャンル')] = record.genre;
  row[col(headerIndex, '出版社')] = record.publisher;
  row[col(headerIndex, 'レーベル名')] = record.label;
  row[col(headerIndex, '先行開始日')] = record.preStart;
  row[col(headerIndex, '先行終了日')] = record.preEnd;
  // 3 cột phán định: NGUYÊN VĂN từ レギュレーション (spec §4.4)
  row[col(headerIndex, '①広告出稿ポリシー')] = record.policy || '';
  row[col(headerIndex, '②一般面出稿NG')] = record.general || '';
  row[col(headerIndex, '③シーモアロゴ判定')] = record.logoJudgement || '';

  // Cột I 掲載停止日付 — GHI MỘT LẦN: chỉ điền khi ô đang trống. row[] tại đây đang
  // giữ giá trị của dòng cũ (hoặc '' nếu là dòng mới), nên điều kiện dưới đây đọc
  // đúng "ô trên sheet có trống không". Giá trị đã có — dù do GAS ghi lần trước
  // hay do người gõ tay — không bao giờ bị ghi đè.
  var colSuspension = col(headerIndex, '掲載停止日付');
  if (normalizeJapaneseText(row[colSuspension]) === '' && record.suspensionDate) {
    row[colSuspension] = record.suspensionDate;
  }
  return row;
}

/**
 * Ghi kết quả diffUpsertFromMatches() (common.js/master.js) vào 顧客作品マスタ thật —
 * bước GHI DUY NHẤT cho master này trong toàn bộ luồng.
 *
 * - toUpdate: ghi ĐÈ đúng dòng cũ theo `item.sheetRow` (số dòng thật 1-based, do
 *   readCustomerWorkMaster() gắn) — KHÔNG tính lại từ rowOffset như bản cũ.
 *   Truyền `item.previous.rawRow` vào customerRecordToRow() để bảo toàn các cột
 *   GAS không sở hữu.
 * - toAdd: nối thêm ngay sau dòng cuối cùng hiện có, ghi 1 lần bằng setValues()
 *   cho cả khối thay vì từng dòng. Dùng max(getLastRow(), hàng header) để trường
 *   hợp sheet mới (chưa có dòng dữ liệu nào) vẫn ghi vào ngay dưới header thay vì
 *   đè lên vùng ghi chú phía trên.
 *
 * KHÔNG BAO GIỜ xoá dòng nào — spec §3.4 (`削除等はしない`).
 *
 * @param {{toUpdate: Array<{record: object, previous: object, sheetRow: number}>, toAdd: Array<object>}} diffResult
 * @returns {void}
 */
function writeCustomerWorkMaster(diffResult) {
  var cfg = CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER;
  var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName, CUSTOMER_REQUIRED_HEADERS);
  var sheet = resolved.sheet;
  var headerIndex = resolved.headerIndex;
  var columnCount = resolved.columnCount;
  var headerRowNumber = resolved.headerRowIndex + 1;

  diffResult.toUpdate.forEach(function (item) {
    var values = customerRecordToRow(item.record, headerIndex, columnCount, item.previous.rawRow);
    sheet.getRange(item.sheetRow, 1, 1, columnCount).setValues([values]);
  });

  if (diffResult.toAdd.length > 0) {
    var startRow = Math.max(sheet.getLastRow(), headerRowNumber) + 1;
    var values = diffResult.toAdd.map(function (record) {
      return customerRecordToRow(record, headerIndex, columnCount, undefined);
    });
    sheet.getRange(startRow, 1, values.length, columnCount).setValues(values);
  }
}

// ==================== コピーライトマスタ (spec §4.2) ====================

var COPYRIGHT_REQUIRED_HEADERS = [
  'タイトルNo', 'タイトル名', '著者名', '出版社(雑誌名/レーベル)',
  '正規コピーライト', 'CopyRight(個別ルールの場合)', 'CopyRight自動生成',
];

/**
 * Tên header thật của 1 cột lịch sử CopyRight過去N trên sheet (vd slot=1 ->
 * "CopyRight過去1"). Tách thành hàm riêng vì tên này được dùng ở CẢ
 * readCopyrightMaster() lẫn copyrightRecordToRow() — tránh lặp chuỗi ghép.
 *
 * @param {number} slot - Số thứ tự slot lịch sử, từ 1 đến CONFIG.COPYRIGHT_HISTORY_SLOTS
 * @returns {string} Tên header tương ứng (vd "CopyRight過去1")
 */
function copyrightHistoryHeaderName(slot) {
  return 'CopyRight過去' + slot;
}

/**
 * Đọc toàn bộ dòng dữ liệu hiện có trên コピーライトマスタ, kèm khôi phục mảng
 * copyrightHistory từ 10 cột CopyRight過去1..10 (chỉ giữ giá trị non-empty,
 * nên độ dài mảng trả về có thể ngắn hơn 10 nếu chưa đủ lịch sử).
 *
 * LƯU Ý: record trả về KHÔNG có trường titleId/cmsId — コピーライトマスタ
 * không có cột đó trên sheet thật, chỉ có タイトルNo (dùng chung với 顧客作品
 * マスタ). Đây là lý do main.js phải key コピーライトマスタ theo titleNo,
 * KHÔNG theo titleId (xem comment trong runGas1(), main.js).
 *
 * @returns {Array<{
 *   titleNo: number, titleName: string, author: string, publisher: string,
 *   copyrightCurrent: string, copyrightHistory: Array<string>
 * }>}
 */
function readCopyrightMaster() {
  var cfg = CONFIG.OUTPUTS.COPYRIGHT_MASTER;
  var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName, COPYRIGHT_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colTitleNo = col(idx, 'タイトルNo');
  var colTitleName = col(idx, 'タイトル名');
  var colAuthor = col(idx, '著者名');
  var colPublisher = col(idx, '出版社(雑誌名/レーベル)');
  var colCurrent = col(idx, '正規コピーライト');
  var historyCols = [];
  for (var h = 1; h <= CONFIG.COPYRIGHT_HISTORY_SLOTS; h++) {
    historyCols.push(col(idx, copyrightHistoryHeaderName(h)));
  }

  // Dùng resolved.values + headerRowIndex thay vì đọc lại sheet và giả định header
  // ở hàng 1: コピーライトマスタ hiện vẫn header hàng 1, nhưng ガワ của nó cũng đang
  // được thiết kế lại (header hàng 15, xem plan) — viết theo headerRowIndex thì lần
  // đó không phải sửa hàm này nữa.
  var rows = resolved.values;
  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[colTitleNo]) continue;
    var history = [];
    historyCols.forEach(function (c) {
      if (row[c]) history.push(row[c]);
    });
    records.push({
      titleNo: row[colTitleNo],
      titleName: row[colTitleName],
      author: row[colAuthor],
      publisher: row[colPublisher],
      copyrightCurrent: row[colCurrent],
      copyrightHistory: history,
    });
  }
  return records;
}

/**
 * Chuyển 1 "copyright record" thành mảng giá trị theo đúng vị trí cột thật —
 * tương tự customerRecordToRow() nhưng cho コピーライトマスタ.
 *
 * Cột CopyRight(個別ルールの場合)/CopyRight自動生成 chỉ được điền khi
 * record.tier tương ứng đúng tầng đó (tier===2 -> 個別ルール, tier===3 ->
 * 自動生成) — record.tier do copyright.js: resolveCopyright() trả về và
 * được main.js gắn thêm vào record trước khi gọi hàm này, để 2 cột đó phản
 * ánh ĐÚNG bản quyền đến từ tầng nào, phục vụ việc audit sau này.
 *
 * @param {object} record - Copyright record (từ main.js, sau shiftCopyrightHistory())
 * @param {Map<string,number>} headerIndex
 * @param {number} columnCount
 * @returns {Array<*>}
 */
function copyrightRecordToRow(record, headerIndex, columnCount) {
  var row = new Array(columnCount).fill('');
  row[col(headerIndex, 'タイトルNo')] = record.titleNo;
  row[col(headerIndex, 'タイトル名')] = record.titleName;
  row[col(headerIndex, '著者名')] = record.author;
  row[col(headerIndex, '出版社(雑誌名/レーベル)')] = record.publisher;
  row[col(headerIndex, '正規コピーライト')] = record.copyrightCurrent || '';
  row[col(headerIndex, 'CopyRight(個別ルールの場合)')] = record.tier === 2 ? record.copyrightCurrent : '';
  row[col(headerIndex, 'CopyRight自動生成')] = record.tier === 3 ? record.copyrightCurrent : '';
  for (var h = 1; h <= CONFIG.COPYRIGHT_HISTORY_SLOTS; h++) {
    row[col(headerIndex, copyrightHistoryHeaderName(h))] = record.copyrightHistory[h - 1] || '';
  }
  return row;
}

/**
 * Ghi kết quả diffUpsert() vào コピーライトマスタ thật — logic giống hệt
 * writeCustomerWorkMaster() (update theo rowOffset, append dòng mới ở cuối,
 * không bao giờ xoá), chỉ khác header/số cột.
 *
 * @param {{toUpdate: Array<{key:string, record:object, rowOffset:number}>, toAdd: Array<object>}} diffResult
 * @returns {void}
 */
function writeCopyrightMaster(diffResult) {
  var cfg = CONFIG.OUTPUTS.COPYRIGHT_MASTER;
  var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName, COPYRIGHT_REQUIRED_HEADERS);
  var sheet = resolved.sheet;
  var headerIndex = resolved.headerIndex;
  var columnCount = resolved.columnCount;

  var headerRowNumber = resolved.headerRowIndex + 1;
  diffResult.toUpdate.forEach(function (item) {
    var sheetRowIndex = headerRowNumber + item.rowOffset + 1; // +header, +1 chuyển 0-based -> 1-based
    sheet.getRange(sheetRowIndex, 1, 1, columnCount).setValues([copyrightRecordToRow(item.record, headerIndex, columnCount)]);
  });

  if (diffResult.toAdd.length > 0) {
    var startRow = Math.max(sheet.getLastRow(), headerRowNumber) + 1;
    var values = diffResult.toAdd.map(function (record) { return copyrightRecordToRow(record, headerIndex, columnCount); });
    sheet.getRange(startRow, 1, values.length, columnCount).setValues(values);
  }
}


// ==============================================================================
// PHẦN 2 — ĐỌC FILE TSV TRÊN DRIVE
// ==============================================================================

/**
 * Tìm file TSV mới nhất trong folder mà không vượt quá ngày chạy.
 *
 * So sánh bằng CHUỖI 'yyyyMMdd' thay vì parse ra Date: chuỗi yyyyMMdd có thứ tự
 * từ điển trùng khớp với thứ tự thời gian, nên so chuỗi vừa đúng vừa không gặp
 * bất kỳ vấn đề timezone nào.
 *
 * Bỏ qua file có ngày TRONG TƯƠNG LAI (nếu ai đó đặt sẵn file cho ngày mai) để
 * kết quả không phụ thuộc việc hôm nay là ngày nào của người đọc log.
 *
 * @param {{folderId: string, filePattern: string}} config - CONFIG.SOURCES.SUSPENSION
 * @param {Date} today - Thời điểm chạy (truyền startedAt của runGas1 vào)
 * @returns {{file: File, dateKey: string}|null} null nếu folder không có file nào khớp
 */
function findLatestSuspensionFile(config, today) {
  var folder = DriveApp.getFolderById(config.folderId);
  var pattern = new RegExp(config.filePattern);
  var todayKey = Utilities.formatDate(today, CONFIG.TRIGGER_TIMEZONE, 'yyyyMMdd');

  var files = folder.getFiles();
  var best = null;
  while (files.hasNext()) {
    var file = files.next();
    var matched = pattern.exec(file.getName());
    if (!matched) continue;
    if (matched[1] > todayKey) continue;
    if (best === null || matched[1] > best.dateKey) best = { file: file, dateKey: matched[1] };
  }
  return best;
}

/**
 * Đọc 1 file TSV thành mảng 2 chiều, cùng dạng với kết quả
 * sheet.getDataRange().getValues() — nhờ vậy các hàm parse trong sources/ dùng
 * được resolveHeaderIndex()/col() y như với dữ liệu đọc từ Sheets.
 *
 * KHÔNG xử lý dấu ngoặc kép kiểu CSV (TSV xuất từ hệ thống thường không quote, và
 * ký tự tab không thể xuất hiện trong tên tác phẩm). Nếu về sau phát hiện file có
 * quote, đây là chỗ phải sửa.
 *
 * Bỏ dòng rỗng (file TSV hay có 1 dòng trắng ở cuối).
 *
 * @param {File} file - Từ findLatestSuspensionFile()
 * @param {string} encoding - vd 'UTF-8' hoặc 'Shift_JIS' (CONFIG.SOURCES.SUSPENSION.encoding)
 * @returns {Array<Array<string>>}
 */
function readTsvRows(file, encoding) {
  var text = file.getBlob().getDataAsString(encoding);
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(function (line) { return line !== ''; })
    .map(function (line) { return line.split('\t'); });
}


// ==============================================================================
// PHẦN 3 — GHI 3 TAB LOG
// ==============================================================================

var LOG_SHEET_NAME = 'GAS1ログ';
// 7 cột số đếm ở giữa được thêm 2026-08-03 (spec §6). Từ nay tác phẩm có thể biến
// mất khỏi master một cách im lặng (595 NG + 3.353 未判定 trên dữ liệu hôm nay),
// nên 1 dòng log phải đủ để biết lần chạy đó có gì bất thường mà không cần mở tab
// GAS1警告.
var LOG_HEADER = ['開始日時', '終了日時', '追加件数', '更新件数',
  '除外_NG件数', '除外_未判定件数', '照合注意件数', '照合曖昧件数', '孤立行件数',
  '外部出稿NG注意件数', '掲載停止注意件数',
  '個別対応タイトル', 'エラー'];

var CHANGE_DETAIL_SHEET_NAME = 'GAS1変更詳細';
var CHANGE_DETAIL_HEADER = ['実行日時', '対象マスタ', 'タイトルNo', 'タイトル名', '変更フィールド', '変更前', '変更後'];

var WARNING_SHEET_NAME = 'GAS1警告';
var WARNING_HEADER = ['実行日時', '種別', 'タイトルNo', 'タイトルID', 'タイトル名', '詳細'];

/**
 * Đảm bảo hàng 1 của 1 sheet log đúng bằng `header`.
 *
 * Cần thiết vì GAS1ログ ĐÃ TỒN TẠI với 6 cột (bản trước 2026-08-03) trong
 * spreadsheet 顧客作品マスタ. Nếu chỉ appendRow() 13 giá trị vào sheet header 6 cột
 * thì 7 cột số mới sẽ nằm dưới ô header TRỐNG — không ai đọc được đó là số gì.
 *
 * CHỈ ghi lại đúng hàng header, KHÔNG đụng dòng dữ liệu cũ. Dòng cũ vẫn đúng ở 4
 * cột đầu, còn 2 cột cuối (個別対応タイトル/エラー) sẽ lệch so với header mới — chấp
 * nhận được: đây là sheet log của chính GAS❶, không phải master, và mọi dòng từ
 * nay về sau đều đúng.
 *
 * @param {Sheet} sheet
 * @param {Array<string>} header
 * @returns {void}
 */
function ensureLogHeaderRow(sheet, header) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
    return;
  }
  var width = Math.max(sheet.getLastColumn(), header.length);
  var current = sheet.getRange(1, 1, 1, width).getValues()[0];
  var same = header.every(function (name, i) { return String(current[i] === undefined || current[i] === null ? '' : current[i]) === name; });
  if (!same) sheet.getRange(1, 1, 1, header.length).setValues([header]);
}

/**
 * Lấy sheet log, tự tạo mới (kèm ghi hàng header) nếu tab "GAS1ログ" chưa tồn tại
 * trong spreadsheet 顧客作品マスタ, và tự NÂNG CẤP hàng header nếu tab đã tồn tại
 * với bộ cột cũ.
 *
 * @returns {Sheet} Đối tượng Sheet của tab GAS1ログ
 */
function getOrCreateLogSheet() {
  var ss = SpreadsheetApp.openById(CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER.spreadsheetId);
  var sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(LOG_SHEET_NAME);
  ensureLogHeaderRow(sheet, LOG_HEADER);
  return sheet;
}

/**
 * Ghi thêm 1 dòng log ứng với 1 lần chạy runGas1() (dù thành công hay lỗi —
 * xem khối catch trong main.js, hàm này được gọi ở CẢ 2 nhánh try và catch).
 *
 * @param {{
 *   startedAt: Date, finishedAt: Date, addedCount: number, updatedCount: number,
 *   irregularTitles: Array<string>, errors: Array<string>
 * }} entry
 *   addedCount/updatedCount: số dòng 顧客作品マスタ được thêm mới/cập nhật ở lần
 *     chạy này (KHÔNG tính コピーライトマスタ riêng — chỉ log phía 顧客作品マスタ
 *     vì 2 master luôn đổi cùng lúc theo cùng tập tác phẩm)
 *   excludedNgCount/excludedUnjudgedCount: số tác phẩm CMS bị bộ lọc レギュレーション
 *     loại khỏi master ở lần chạy này (spec §6). Đây là 2 con số quan trọng nhất
 *     của bộ lọc mới — không có chúng thì việc tác phẩm biến mất khỏi master là
 *     hoàn toàn im lặng.
 *   matchNoticeCount/matchAmbiguousCount/orphanCount/ngTitleNoticeCount/
 *     suspensionNoticeCount: số dòng của từng loại cảnh báo đã ghi vào GAS1警告.
 *   irregularTitles: danh sách "titleId titleName" của các tác phẩm rơi vào
 *     tầng 4 (cá biệt) khi resolve bản quyền — xem runGas1() ở main.js
 *   errors: rỗng nếu chạy thành công; có 1 phần tử (String(error)) nếu
 *     runGas1() bị exception giữa chừng
 *
 * Mọi field số đếm đều TUỲ CHỌN (thiếu thì ghi 0) — nhờ vậy nhánh catch của
 * runGas1() và hàm probe_appendLogEntry() gọi được với entry tối thiểu.
 *
 * @returns {void}
 */
function appendLogEntry(entry) {
  var sheet = getOrCreateLogSheet();
  sheet.appendRow([
    entry.startedAt,
    entry.finishedAt,
    entry.addedCount,
    entry.updatedCount,
    entry.excludedNgCount || 0,
    entry.excludedUnjudgedCount || 0,
    entry.matchNoticeCount || 0,
    entry.matchAmbiguousCount || 0,
    entry.orphanCount || 0,
    entry.ngTitleNoticeCount || 0,
    entry.suspensionNoticeCount || 0,
    entry.irregularTitles.join(', '),
    entry.errors.join(', '),
  ]);
}

/**
 * Lấy sheet log chi tiết theo field, tự tạo mới (kèm ghi hàng header) nếu tab
 * "GAS1変更詳細" chưa tồn tại.
 *
 * @returns {Sheet} Đối tượng Sheet của tab GAS1変更詳細
 */
function getOrCreateChangeDetailSheet() {
  var ss = SpreadsheetApp.openById(CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER.spreadsheetId);
  var sheet = ss.getSheetByName(CHANGE_DETAIL_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CHANGE_DETAIL_SHEET_NAME);
    sheet.appendRow(CHANGE_DETAIL_HEADER);
  }
  return sheet;
}

/**
 * Ghi thêm NHIỀU dòng log chi tiết (1 dòng = 1 field của 1 tác phẩm đã đổi)
 * trong 1 lần gọi setValues() duy nhất — dùng cho kết quả
 * logic/master.js: buildChangeDetailRows() của CẢ 顧客作品マスタ lẫn
 * コピーライトマスタ trong cùng 1 lần chạy (main.js gộp cả 2 danh sách rồi
 * gọi hàm này 1 lần, thay vì gọi 2 lần riêng).
 *
 * Nếu rows rỗng (không có field nào đổi ở lần chạy này), KHÔNG làm gì cả —
 * tránh tạo dòng trống vô nghĩa trên sheet.
 *
 * @param {Array<{
 *   runAt: Date, master: string, titleNo: *, titleName: string,
 *   field: string, oldValue: *, newValue: *
 * }>} rows - Kết quả logic/master.js: buildChangeDetailRows()
 * @returns {void}
 */
function appendChangeDetailRows(rows) {
  if (!rows || rows.length === 0) return;
  var sheet = getOrCreateChangeDetailSheet();
  var startRow = sheet.getLastRow() + 1;
  var values = rows.map(function (row) {
    return [row.runAt, row.master, row.titleNo, row.titleName, row.field, row.oldValue, row.newValue];
  });
  sheet.getRange(startRow, 1, values.length, CHANGE_DETAIL_HEADER.length).setValues(values);
}

/**
 * Lấy tab GAS1警告, tự tạo kèm header nếu chưa có.
 *
 * VÌ SAO LÀ TAB RIÊNG chứ không nhồi vào 1 ô của GAS1ログ: mô phỏng spec §5.4 lần 3
 * cho 110 ca 照合注意 trong MỘT lần chạy. Nhồi 110 tên tác phẩm vào một ô thì không
 * ai đọc được, và sẽ đụng giới hạn 50.000 ký tự/ô của Google Sheets khi dữ liệu
 * lớn hơn. 1 dòng = 1 cảnh báo thì lọc/sort/tìm được như dữ liệu bình thường —
 * cùng lý do vì sao GAS1変更詳細 là tab riêng.
 *
 * @returns {Sheet} Đối tượng Sheet của tab GAS1警告
 */
function getOrCreateWarningSheet() {
  var ss = SpreadsheetApp.openById(CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER.spreadsheetId);
  var sheet = ss.getSheetByName(WARNING_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(WARNING_SHEET_NAME);
  ensureLogHeaderRow(sheet, WARNING_HEADER);
  return sheet;
}

/**
 * Ghi thêm nhiều dòng cảnh báo trong 1 lần setValues() duy nhất — nhận kết quả đã
 * gộp của cả 5 hàm build trong master.js (照合注意, 照合曖昧, 孤立行,
 * 外部出稿NG注意, 掲載停止注意).
 *
 * Rows rỗng -> không làm gì: không tạo dòng trống, và cũng không tạo tab GAS1警告
 * nếu lần chạy đó hoàn toàn sạch sẽ.
 *
 * @param {Array<{runAt: Date, kind: string, titleNo: *, titleId: *, titleName: string, detail: string}>} rows
 *   Kết quả master.js
 * @returns {void}
 */
function appendWarningRows(rows) {
  if (!rows || rows.length === 0) return;
  var sheet = getOrCreateWarningSheet();
  var startRow = sheet.getLastRow() + 1;
  var values = rows.map(function (row) {
    return [row.runAt, row.kind, row.titleNo, row.titleId, row.titleName, row.detail];
  });
  sheet.getRange(startRow, 1, values.length, WARNING_HEADER.length).setValues(values);
}


// ==============================================================================
// PHẦN 4 — SLACK
// ==============================================================================

/**
 * Gửi 1 tin nhắn text tới kênh Slack đã cấu hình.
 *
 * AN TOÀN KHI CHƯA CẤU HÌNH: nếu SLACK_BOT_TOKEN hoặc SLACK_CHANNEL_ID chưa
 * được điền trong Script Properties, hàm này KHÔNG throw lỗi — chỉ ghi vào
 * Logger.log() rồi return, để không làm gián đoạn luồng chính (runGas1() ở
 * main.js gọi notifySlack() cả trong trường hợp tác phẩm cá biệt LẪN khi có
 * lỗi runtime — nếu Slack tự nó lỗi/chưa cấu hình, không được vì thế mà khiến
 * cả script fail theo).
 *
 * muteHttpExceptions: true — để lỗi HTTP (vd token sai, bot chưa được invite
 * vào channel) không tự động throw exception làm dừng script; nếu cần debug
 * lỗi gửi Slack thất bại, có thể sửa tạm thành false hoặc log response ra.
 *
 * @param {string} message - Nội dung tin nhắn (text thường, không cần format Slack markdown)
 * @returns {void}
 */
function notifySlack(message) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty(CONFIG.SLACK_PROPERTY_KEYS.BOT_TOKEN);
  var channel = props.getProperty(CONFIG.SLACK_PROPERTY_KEYS.CHANNEL_ID);

  if (!token || !channel) {
    Logger.log('notifySlack: chưa cấu hình SLACK_BOT_TOKEN/SLACK_CHANNEL_ID, bỏ qua Slack. Nội dung: ' + message);
    return;
  }

  UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ channel: channel, text: message }),
    muteHttpExceptions: true,
  });
}

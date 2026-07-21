// io/sheetIO.js — đọc/ghi Google Sheets thật qua SpreadsheetApp (chỉ chạy được
// trong Apps Script, không chạy được ở máy local/Node — khác với các file
// trong sources/ và logic/ vốn là hàm thuần JS).
//
// Cột được tra theo TÊN header thật của sheet (qua util/headerMap.js), không
// hardcode số cột — nếu ai đó chèn/xoá/đổi thứ tự cột trên 2 file output,
// code vẫn đọc/ghi đúng chỗ (miễn tên cột không đổi).

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
 * Đọc HÀNG 1 (header) của 1 sheet output, build header index (tên cột ->
 * số cột) và kiểm tra sheet có ĐỦ các cột bắt buộc hay không — throw lỗi
 * ngay nếu thiếu, thay vì để hàm gọi sau ghi nhầm cột do thiếu dữ liệu.
 *
 * Khác với readSheetValues() (đọc toàn bộ dữ liệu), hàm này CHỈ đọc 1 hàng
 * header — dùng khi cần biết "cột nào ở đâu" TRƯỚC khi quyết định đọc/ghi gì
 * tiếp theo (cả readCustomerWorkMaster/readCopyrightMaster và
 * writeCustomerWorkMaster/writeCopyrightMaster đều gọi hàm này đầu tiên).
 *
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @param {Array<string>} requiredHeaders - Tên các cột BẮT BUỘC phải tồn tại
 *   trên sheet này (không tính cột tuỳ chọn như 配信NGフラグ — xem tryCol() ở headerMap.js)
 * @returns {{sheet: Sheet, headerIndex: Map<string,number>, columnCount: number}}
 *   sheet: đối tượng Sheet của Apps Script, dùng để gọi getRange()/getLastRow()/...
 *   headerIndex: dùng với col()/tryCol() để tra số cột theo tên
 *   columnCount: số cột thực tế của sheet (= độ rộng hàng header), dùng làm
 *     bề rộng vùng ghi (getRange(row, 1, n, columnCount)) để đảm bảo ghi đủ
 *     hết các cột đã biết, không thiếu không thừa
 */
function resolveMasterHeader(spreadsheetId, sheetName, requiredHeaders) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  var columnCount = Math.max(sheet.getLastColumn(), 1);
  var headerRow = sheet.getRange(1, 1, 1, columnCount).getValues()[0];
  var headerIndex = buildHeaderIndex(headerRow);
  requiredHeaders.forEach(function (name) { col(headerIndex, name); });
  return { sheet: sheet, headerIndex: headerIndex, columnCount: columnCount };
}

// ==================== 顧客作品マスタ (spec §4.1) ====================

var CUSTOMER_REQUIRED_HEADERS = [
  'タイトルNo', 'CMS ID', 'タイトルID', 'タイトル名', '作家名', 'ジャンル',
  '出版社', '先行開始日', '先行終了日', 'コピーライト', '③シーモアロゴ判定', '備考',
];
// 配信NGフラグ: cột MỚI đề xuất (spec §4.1, §9.2) — CÓ THỂ CHƯA tồn tại trên
// sheet thật cho tới khi ai đó thêm header đó vào, nên KHÔNG đưa vào danh
// sách bắt buộc ở trên — tra bằng tryCol() (không throw) ở 2 hàm bên dưới.

/**
 * Đọc toàn bộ dòng dữ liệu hiện có trên 顧客作品マスタ, dùng làm "existingRecords"
 * đầu vào cho resolveNumbers()/diffUpsert() (logic/upsert.js) ở main.js —
 * đây là bước "biết cái gì ĐÃ có trên sheet" trước khi so sánh với dữ liệu
 * vừa build lại từ nguồn.
 *
 * Bỏ qua dòng không có タイトルID (coi là dòng trống/dòng cuối sheet).
 *
 * @returns {Array<{
 *   titleNo: number, cmsId: *, titleId: *, titleName: string, author: string,
 *   genre: string, publisher: string, preStart: Date, preEnd: Date,
 *   copyright: string, logoJudgement: string, remark: string,
 *   distributionNgFlag: string
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
  var colPreStart = col(idx, '先行開始日');
  var colPreEnd = col(idx, '先行終了日');
  var colCopyright = col(idx, 'コピーライト');
  var colLogo = col(idx, '③シーモアロゴ判定');
  var colRemark = col(idx, '備考');
  var colDistributionNg = tryCol(idx, '配信NGフラグ');

  var rows = resolved.sheet.getDataRange().getValues();
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    // Lọc theo CMS ID (KHÔNG phải タイトルID): タイトルID có thể trống ở ~3.5%
    // tác phẩm thật (xem cmsSource.js) — nếu lọc theo タイトルID như trước, các
    // dòng đó bị coi là "trống/chưa tồn tại" mỗi lần đọc lại existingCustomerRows,
    // nên bị thêm lặp lại vô hạn dù đã đổi khoá upsert sang CMSID (đây chính là
    // nguyên nhân gây trùng dòng còn sót lại sau lần fix trước).
    if (!row[colCmsId]) continue;
    records.push({
      titleNo: row[colTitleNo],
      cmsId: row[colCmsId],
      titleId: row[colTitleId],
      titleName: row[colTitleName],
      author: row[colAuthor],
      genre: row[colGenre],
      publisher: row[colPublisher],
      preStart: row[colPreStart],
      preEnd: row[colPreEnd],
      copyright: row[colCopyright],
      logoJudgement: row[colLogo],
      remark: row[colRemark],
      distributionNgFlag: colDistributionNg !== undefined ? row[colDistributionNg] : '',
    });
  }
  return records;
}

/**
 * Chuyển 1 "work record" (object) thành 1 mảng giá trị theo ĐÚNG vị trí cột
 * thật của sheet (headerIndex) — dùng bởi writeCustomerWorkMaster() cho cả
 * việc update dòng cũ lẫn append dòng mới, để không lặp lại logic 2 nơi.
 *
 * @param {object} record - Work record (từ customerWorkMaster.js + resolveCopyright + resolveNumbers)
 * @param {Map<string,number>} headerIndex - Từ resolveMasterHeader()
 * @param {number} columnCount - Bề rộng hàng cần ghi (từ resolveMasterHeader())
 * @returns {Array<*>} Mảng giá trị, sẵn sàng đưa vào Range.setValues([...])
 */
function customerRecordToRow(record, headerIndex, columnCount) {
  var row = new Array(columnCount).fill('');
  row[col(headerIndex, 'タイトルNo')] = record.titleNo;
  row[col(headerIndex, 'CMS ID')] = record.cmsId;
  row[col(headerIndex, 'タイトルID')] = record.titleId;
  row[col(headerIndex, 'タイトル名')] = record.titleName;
  row[col(headerIndex, '作家名')] = record.author;
  row[col(headerIndex, 'ジャンル')] = record.genre;
  row[col(headerIndex, '出版社')] = record.publisher;
  row[col(headerIndex, '先行開始日')] = record.preStart;
  row[col(headerIndex, '先行終了日')] = record.preEnd;
  row[col(headerIndex, 'コピーライト')] = record.copyright || '';
  row[col(headerIndex, '③シーモアロゴ判定')] = record.logoJudgement;
  row[col(headerIndex, '備考')] = record.remark;
  var colDistributionNg = tryCol(headerIndex, '配信NGフラグ');
  if (colDistributionNg !== undefined) row[colDistributionNg] = record.distributionNgFlag || '';
  return row;
}

/**
 * Ghi kết quả diffUpsert() (logic/upsert.js) vào 顧客作品マスタ thật —
 * bước GHI DUY NHẤT cho master này trong toàn bộ luồng.
 *
 * - toUpdate: ghi ĐÈ đúng dòng cũ, xác định vị trí bằng item.rowOffset
 *   (index 0-based trong existingCustomerRows — do main.attachRowOffsets()
 *   gán, KHÔNG tự tính trong hàm này). Công thức chuyển rowOffset -> số
 *   dòng thật trên sheet: header chiếm 1 hàng (index 0 trong mảng ứng với
 *   dòng sheet số 2), nên sheetRowIndex = 1 (bù header) + rowOffset + 1
 *   (đổi 0-based -> 1-based) = rowOffset + 2.
 * - toAdd: nối thêm vào NGAY SAU dòng cuối cùng hiện có (sheet.getLastRow() + 1),
 *   ghi 1 lần bằng setValues() cho cả khối thay vì từng dòng — nhanh hơn và
 *   giảm số lần gọi Apps Script API.
 *
 * KHÔNG BAO GIỜ xoá dòng nào — đúng nguyên tắc "upsert only" của spec §7.
 *
 * @param {{toUpdate: Array<{key:string, record:object, rowOffset:number}>, toAdd: Array<object>}} diffResult
 * @returns {void}
 */
function writeCustomerWorkMaster(diffResult) {
  var cfg = CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER;
  var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName, CUSTOMER_REQUIRED_HEADERS);
  var sheet = resolved.sheet;
  var headerIndex = resolved.headerIndex;
  var columnCount = resolved.columnCount;

  diffResult.toUpdate.forEach(function (item) {
    var sheetRowIndex = 1 + item.rowOffset + 1; // +1 header, +1 chuyển 0-based -> 1-based
    sheet.getRange(sheetRowIndex, 1, 1, columnCount).setValues([customerRecordToRow(item.record, headerIndex, columnCount)]);
  });

  if (diffResult.toAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    var values = diffResult.toAdd.map(function (record) { return customerRecordToRow(record, headerIndex, columnCount); });
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

  var rows = resolved.sheet.getDataRange().getValues();
  var records = [];
  for (var i = 1; i < rows.length; i++) {
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
 * 自動生成) — record.tier do copyrightResolver.resolveCopyright() trả về và
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

  diffResult.toUpdate.forEach(function (item) {
    var sheetRowIndex = 1 + item.rowOffset + 1;
    sheet.getRange(sheetRowIndex, 1, 1, columnCount).setValues([copyrightRecordToRow(item.record, headerIndex, columnCount)]);
  });

  if (diffResult.toAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    var values = diffResult.toAdd.map(function (record) { return copyrightRecordToRow(record, headerIndex, columnCount); });
    sheet.getRange(startRow, 1, values.length, columnCount).setValues(values);
  }
}

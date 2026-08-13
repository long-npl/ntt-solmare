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

// Nhãn ô 更新日 trong khối ghi chú phía trên vùng dữ liệu của CẢ HAI master. Ô ngay
// BÊN PHẢI nhãn này là ô nhận thời điểm chạy (trên ガワ hiện tại: nhãn ở B5, giá trị
// ở C5, kèm ghi chú D5 '→GAS回した日に更新').
var UPDATED_AT_LABEL = '更新日';

/**
 * Ghi thời điểm chạy vào ô 更新日 của một master.
 *
 * DÒ THEO NHÃN, KHÔNG HARDCODE 'C5': tìm ô có chữ 更新日 trong khối ghi chú rồi ghi
 * vào ô kế bên phải. Cùng lý do với mọi chỗ khác trong file này — 池永 chèn thêm một
 * hàng ghi chú phía trên là C5 thành C6, và một hằng 'C5' sẽ âm thầm ghi đè lên ô
 * 更新チーム hoặc một ô ghi chú nào đó thay vì báo lỗi.
 *
 * CHỈ QUÉT CÁC HÀNG TRÊN HÀNG HEADER: dưới đó là dữ liệu thật, và 1.730 dòng dữ liệu
 * hoàn toàn có thể chứa chữ 更新日 trong một ô 備考 nào đó. So khớp là ĐÚNG BẰNG
 * (sau normalizeHeaderText) chứ không phải chứa — nếu không thì '①更新タイミング：…'
 * và '[1]更新ルール' ở ngay các hàng bên cạnh cũng khớp.
 *
 * Ghi Date object chứ không phải chuỗi: ô đó đang được định dạng ngày trên sheet
 * (giá trị cũ '2026-07-21 00:00:00'), nên Date giữ được định dạng người ta đã đặt và
 * vẫn sắp xếp/so sánh được. Muốn thấy cả giờ thì đổi định dạng ô, không phải đổi code.
 *
 * @param {Sheet} sheet - Sheet đích (từ resolveMasterHeader)
 * @param {Array<Array<*>>} values - Toàn bộ giá trị đã đọc (từ resolveMasterHeader)
 * @param {number} headerRowIndex - Index 0-based của hàng header dữ liệu
 * @param {Date} runAt - Thời điểm chạy, dùng chung cho cả lần chạy
 * @returns {string|null} Ô đã ghi dạng A1 (vd 'C5'), null nếu không tìm thấy nhãn
 */
function stampUpdatedAt(sheet, values, headerRowIndex, runAt) {
  for (var r = 0; r < headerRowIndex; r++) {
    var row = values[r];
    if (!row) continue;
    // row.length - 1: nhãn nằm ở cột cuối cùng thì không có ô nào bên phải để ghi.
    for (var c = 0; c < row.length - 1; c++) {
      if (normalizeHeaderText(row[c]) !== UPDATED_AT_LABEL) continue;
      sheet.getRange(r + 1, c + 2).setValue(runAt);
      return columnIndexToLetter(c + 1) + (r + 1);
    }
  }
  return null;
}

// ==================== 顧客作品マスタ (ガワ mới 2026-08-03) ====================
//
// Layout ガワ mới: header HÀNG 15, dữ liệu từ hàng 16, cột A là cột đệm trống,
// dữ liệu ở B→U. Thứ tự cột đã đổi hoàn toàn so với bản cũ (vd タイトル名 từ cột E
// sang cột K) nhưng KHÔNG cần sửa gì ở đây ngoài danh sách dưới, vì mọi truy cập
// đều qua col(headerIndex, 'tên cột').
//
// CỘT GAS KHÔNG SỞ HỮU (phải giữ nguyên giá trị người ta điền tay):
//   A (đệm) — và bất kỳ cột nào 池永 thêm về sau.
// Xem customerRecordToRow() để biết cách bảo toàn.
//
// 2 CỘT VỪA CHUYỂN SANG GAS SỞ HỮU (2026-08-13, xem NGUỒN 7 trong sources.js và
// resolveLpProduction() trong master.js):
//   E タイトル区分 <- 出稿コミット管理表, コミット / 独占 (không bao giờ trống)
//   J LP制作      <- suy ra từ ジャンル + ③シーモアロゴ判定 của chính dòng này
// 2 cột này có 2 CƠ CHẾ GHI KHÁC NHAU, xem customerRecordToRow().
//
// 4 CỘT VỪA CHUYỂN SANG GAS SỞ HỮU (2026-08-07, xem NGUỒN 5/6 trong sources.js):
//   R 先行終了日（延長）  <- 【先行作品】独占期間の延長, lần 回目 CUỐI có 期日
//   S 先行終了日（最終確定）<- R nếu R có ngày, ngược lại Q
//   T/U 大量無料開始日・終了日 <- 大量無料希望作品リスト_CA様（★出稿回答シート）
// 4 cột này GAS GHI ĐÈ HOÀN TOÀN (kể cả ghi rỗng), khác cột I bên dưới — nguồn là
// nơi duy nhất đúng, giá trị gõ tay không khớp nguồn sẽ bị thay ở lần chạy sau.
// NGOẠI LỆ: nếu nguồn tương ứng đọc KHÔNG được (hoặc chưa có spreadsheetId, như
// MASS_FREE hiện nay), main.js gán lại chính giá trị đang có trên sheet vào record
// nên diff coi là "không đổi" và cột được giữ nguyên — xem runGas1().
//
// Cột I 掲載停止日付 là trường hợp RIÊNG: GAS ĐIỀN nhưng chỉ khi ô đang TRỐNG —
// ghi một lần, không bao giờ ghi đè (nguồn: multi_title_yyyyMMdd.tsv trên Drive,
// join theo タイトルID). Cũng xem customerRecordToRow().

// Cột GAS ĐỌC + GHI. Thiếu bất kỳ cột nào trong đây -> throw ngay, vì ghi thiếu
// cột nghĩa là dữ liệu master sai một cách âm thầm.
//
// 4 tên cột cuối phải ghi ĐẦY ĐỦ, KHÔNG dùng colByPrefix('先行終了日'): ガワ có 3 cột
// bắt đầu bằng 先行終了日 nên tiền tố đó nhập nhằng — colByPrefix() cố tình throw ở
// trường hợp này (xem JSDoc của nó trong common.js). Ký tự ngoặc là ngoặc FULL-WIDTH
// （）đúng như trên sheet; ô thật còn có '\n' trước ngoặc, nhưng normalizeHeaderText()
// bỏ newline nên không cần viết vào đây.
var CUSTOMER_REQUIRED_HEADERS = [
  'タイトルNo', 'CMS ID', 'タイトルID', 'タイトル名', '作家名', 'ジャンル', '出版社',
  'レーベル名', '先行開始日', '先行終了日', '①広告出稿ポリシー', '②一般面出稿NG', '③シーモアロゴ判定',
  '掲載停止日付',
  '先行終了日（延長）', '先行終了日（最終確定）', '大量無料開始日', '大量無料終了日',
  'タイトル区分', 'LP制作',
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
 *   preEndExtended: *, preEndFinal: *, massFreeStart: *, massFreeEnd: *,
 *   titleCategory: *, lpProduction: *,
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
  // 4 cột GAS mới sở hữu từ 2026-08-07. PHẢI đọc lại (không chỉ ghi): runGas1() cần
  // giá trị đang có trên sheet cho 2 việc — (a) so diff để dòng không đổi không bị ghi
  // lại vô ích, (b) giữ nguyên cột khi nguồn tương ứng đọc không được.
  var colPreEndExtended = col(idx, '先行終了日（延長）');
  var colPreEndFinal = col(idx, '先行終了日（最終確定）');
  var colMassFreeStart = col(idx, '大量無料開始日');
  var colMassFreeEnd = col(idx, '大量無料終了日');
  // 2 cột GAS mới sở hữu từ 2026-08-13, cùng lý do (a)+(b) như 4 cột ngay trên. Riêng
  // LP制作 còn thêm lý do (c): giá trị đang có trên sheet là thứ được GIỮ LẠI khi
  // resolveLpProduction() không phán định được — không đọc thì không giữ được.
  var colTitleCategory = col(idx, 'タイトル区分');
  var colLpProduction = col(idx, 'LP制作');

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
      preEndExtended: row[colPreEndExtended],
      preEndFinal: row[colPreEndFinal],
      massFreeStart: row[colMassFreeStart],
      massFreeEnd: row[colMassFreeEnd],
      titleCategory: row[colTitleCategory],
      lpProduction: row[colLpProduction],
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
 * đè các cột GAS sở hữu. Cách cũ (`new Array(columnCount).fill('')`) sẽ XOÁ TRẮNG
 * mọi cột GAS không ghi mỗi lần dòng bị update, không có lỗi nào để nhận ra — chỉ là
 * dữ liệu người ta nhập tự nhiên biến mất sau 9h sáng. Dựng từ dòng cũ còn bền với
 * việc 池永 thêm cột mới: cột lạ được giữ nguyên thay vì bị xoá, không cần sửa code.
 * Nó cũng là nền cho cơ chế "giữ nguyên ô" của cột J LP制作 bên dưới.
 *
 * 2026-08-07: 4 cột R/S/T/U đã CHUYỂN từ nhóm "không ghi" sang nhóm GAS ghi đè (nguồn
 * 5/6 trong sources.js). Chúng vẫn được lợi từ cách dựng-từ-dòng-cũ ở trên: khi nguồn
 * đọc không được, main.js gán giá trị cũ của sheet vào record nên dòng bị coi là không
 * đổi và không được ghi lại chút nào.
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

  // 4 cột R/S/T/U — GHI ĐÈ VÔ ĐIỀU KIỆN, kể cả ghi rỗng (khác cột I ngay bên dưới).
  // Tác phẩm bị rút khỏi nguồn gia hạn/大量無料 thì ô tương ứng PHẢI được xoá, nếu
  // không master sẽ giữ mãi một hạn độc quyền đã không còn hiệu lực — sai nguy hiểm
  // hơn là để trống. `|| ''` để undefined không bị ghi thành chuỗi "undefined".
  //
  // KHÔNG có nhánh "nguồn lỗi thì bỏ qua" ở đây là CÓ Ý: main.js đã gán giá trị cũ của
  // sheet vào 4 field này khi nguồn lỗi, nên tới đây record luôn mang giá trị ĐÚNG cần
  // ghi. Đặt điều kiện ở cả 2 chỗ là chia đôi một quy tắc ra 2 file.
  row[col(headerIndex, '先行終了日（延長）')] = record.preEndExtended || '';
  row[col(headerIndex, '先行終了日（最終確定）')] = record.preEndFinal || '';
  row[col(headerIndex, '大量無料開始日')] = record.massFreeStart || '';
  row[col(headerIndex, '大量無料終了日')] = record.massFreeEnd || '';

  // Cột E タイトル区分 — GHI ĐÈ VÔ ĐIỀU KIỆN, cùng nhóm với R/S/T/U ở trên. Giá trị
  // luôn là コミット hoặc 独占 (lookupTitleCategory() không bao giờ trả '') nên `|| ''`
  // ở đây chỉ chặn undefined của dòng mới khi nguồn lỗi — không phải là nhánh xoá ô.
  // Nguồn lỗi -> main.js đã gán lại giá trị cũ của sheet, giống hệt 4 cột kia.
  row[col(headerIndex, 'タイトル区分')] = record.titleCategory || '';

  // Cột J LP制作 — GHI ĐÈ CÓ ĐIỀU KIỆN, cơ chế RIÊNG không giống cột nào khác:
  // ghi khi tính ra 必要/不要, GIỮ NGUYÊN ô khi tính ra '' (未判定).
  //
  // Khác cột E ngay trên (ghi đè cả khi rỗng) và khác cột I ngay dưới (ô đã có chữ
  // thì không bao giờ đụng tới). Ở đây phán định MỚI phải thắng được giá trị cũ —
  // tác phẩm đổi từ ロゴなし sang ロゴあり thì J phải đổi 必要 -> 不要 — nhưng "chưa
  // phán định được" thì không được phép xoá chữ 営業 gõ tay. Điều kiện tương ứng ở
  // đường diff là sameKeepWhenBlankValue() (common.js), 2 chỗ phải khớp nhau.
  var lpProduction = normalizeJapaneseText(record.lpProduction);
  if (lpProduction !== '') {
    row[col(headerIndex, 'LP制作')] = record.lpProduction;
  }

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
 * Ô 更新日 được đóng dấu ở CUỐI hàm, tức chỉ khi mọi dòng đã ghi xong: ô đó nói "dữ
 * liệu bên dưới cập nhật tới lúc này", nên đóng dấu trước khi ghi là nói dối nếu bước
 * ghi throw giữa chừng. Đóng dấu KỂ CẢ khi diff không có dòng nào đổi — theo đúng ghi
 * chú ô D5 của ガワ (`→GAS回した日に更新`): người đọc cần biết GAS có chạy hay không,
 * và "chạy mà không có gì đổi" khác hẳn "GAS chết từ hôm kia".
 *
 * @param {{toUpdate: Array<{record: object, previous: object, sheetRow: number}>, toAdd: Array<object>}} diffResult
 * @param {Date} runAt - Thời điểm chạy, ghi vào ô 更新日
 * @returns {{updatedAtCell: string|null}} Ô đã đóng dấu dạng A1, null nếu không thấy nhãn
 */
function writeCustomerWorkMaster(diffResult, runAt) {
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

  return {
    updatedAtCell: stampUpdatedAt(sheet, resolved.values, resolved.headerRowIndex, runAt),
  };
}

// ==================== コピーライトマスタ (ガワ mới 2026-08-04) ====================
//
// Layout ガワ mới: header HÀNG 15, dữ liệu từ hàng 16, cột A là cột đệm trống, dữ
// liệu ở B→P. Toàn bộ 15 cột đều do GAS ghi (hàng 13 của sheet đánh dấu
// '自動入力/GAS' cho cả 15) — khác 顧客作品マスタ, ở đây không có cột nào phải bảo
// toàn cho người nhập tay.
//
// Ba thay đổi lớn so với ガワ cũ:
//   1. Bỏ cột `正規コピーライト`. Thay bằng 2 cột độc lập: J
//      `タイトル個別コピーライト(あれば優先使用)` (từ CMS) và K `出版社コピーライト`
//      (GAS sinh). Giá trị "hiệu lực" = J nếu có, không thì K — quan hệ đó giờ nằm
//      trong code (effectiveCopyright() ở copyright.js), không nằm trên sheet.
//   2. Bỏ 2 cột `CopyRight(個別ルールの場合)` / `CopyRight自動生成` — chúng vốn chỉ
//      để phân biệt giá trị đến từ tầng nào, việc mà 2 cột J/K nay làm rõ hơn.
//   3. Lịch sử đổi tên `CopyRight過去1..10` -> `コピーライト_過去分1..5` (10 -> 5 slot).
//
// Thêm 4 cột định danh lấy từ 顧客作品マスタ (CMS ID / タイトルID / ジャンル /
// レーベル名) — trước đây master này chỉ có タイトルNo nên không tra ngược được về
// CMS mà không đi qua 顧客作品マスタ.

var COPYRIGHT_REQUIRED_HEADERS = [
  'タイトルNo', 'CMS ID', 'タイトルID', 'タイトル名', '作家名', 'ジャンル', '出版社', 'レーベル名',
  'タイトル個別コピーライト(あれば優先使用)', '出版社コピーライト',
];

// Cột Q 出版社事前確認 (user bổ sung 2026-08-13, nguồn: cột L của 出版社別コピーライトマスタ).
//
// CỐ TÌNH KHÔNG nằm trong COPYRIGHT_REQUIRED_HEADERS: cột này CHƯA TỒN TẠI trên
// ガワ hiện tại (nó dừng ở P コピーライト_過去分5) và 池永 phải thêm tay. Đưa vào danh
// sách bắt buộc thì mọi lần chạy sẽ throw ngay ở resolveMasterHeader() cho tới lúc
// cột được thêm — tức là một cột thông tin phụ chặn đứng cả 2 master.
//
// Vì vậy nó được tra bằng tryCol(): có cột thì GAS ghi, chưa có thì bỏ qua + 1 dòng
// GAS1警告 mỗi lần chạy. Thêm cột với ĐÚNG tên này là đủ để kích hoạt, không phải
// sửa code. Tên lấy theo ô AA của sheet タイトルマスタ trong ガワ (giá trị 必要/不要).
var COPYRIGHT_PRE_CONFIRMATION_HEADER = '出版社事前確認';

/**
 * Tên header thật của 1 cột lịch sử trên sheet (slot=1 -> 'コピーライト_過去分1').
 *
 * Tách thành hàm riêng vì tên này được dùng ở CẢ readCopyrightMaster() lẫn
 * copyrightRecordToRow() — tránh lặp chuỗi ghép ở 2 nơi rồi lệch nhau.
 *
 * @param {number} slot - Từ 1 đến CONFIG.COPYRIGHT_HISTORY_SLOTS (= 5)
 * @returns {string}
 */
function copyrightHistoryHeaderName(slot) {
  return 'コピーライト_過去分' + slot;
}

/**
 * Đọc toàn bộ dòng dữ liệu hiện có trên コピーライトマスタ, kèm khôi phục mảng
 * copyrightHistory từ 5 cột コピーライト_過去分1..5 (chỉ giữ giá trị non-empty, nên
 * mảng trả về có thể ngắn hơn 5 nếu chưa đủ lịch sử).
 *
 * Trả thêm `sheetRow` (số dòng thật 1-based) vì đường ghi dùng trực tiếp giá trị
 * đó — cùng lý do với readCustomerWorkMaster(): công thức rowOffset + 2 ngầm giả
 * định header ở hàng 1, sai với ガワ mới (header hàng 15).
 *
 * TRẢ VỀ OBJECT chứ không phải mảng records như trước: người gọi cần biết cột Q
 * 出版社事前確認 đã tồn tại trên sheet chưa, và ĐÂY là nơi duy nhất biết được điều đó
 * mà không phải đọc sheet thêm một lần nữa.
 *
 * VÌ SAO PHẢI BIẾT TRƯỚC KHI DIFF (không phải lúc ghi): cột chưa tồn tại thì mọi
 * record đọc lên đều có preConfirmation = '' trong khi giá trị vừa tra được là
 * 必要/不要 — nếu cứ đem so thì cả 1.303 dòng bị coi là "cần update" ở MỌI lần chạy,
 * ghi lại y nguyên nội dung cũ và đổ 1.303 dòng vô nghĩa vào GAS1変更詳細. runGas1()
 * dùng cờ này để bỏ hẳn field đó ra khỏi phép so khi cột chưa có.
 *
 * @returns {{hasPreConfirmationColumn: boolean, records: Array<{
 *   titleNo: *, cmsId: *, titleId: *, titleName: string, author: string,
 *   genre: string, publisher: string, label: string,
 *   individualCopyright: *, publisherCopyright: *, preConfirmation: *,
 *   copyrightHistory: Array<*>, sheetRow: number
 * }>}}
 */
function readCopyrightMaster() {
  var cfg = CONFIG.OUTPUTS.COPYRIGHT_MASTER;
  var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName, COPYRIGHT_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colTitleNo = col(idx, 'タイトルNo');
  var colCmsId = col(idx, 'CMS ID');
  var colTitleId = col(idx, 'タイトルID');
  var colTitleName = col(idx, 'タイトル名');
  var colAuthor = col(idx, '作家名');
  var colGenre = col(idx, 'ジャンル');
  var colPublisher = col(idx, '出版社');
  var colLabel = col(idx, 'レーベル名');
  var colIndividual = col(idx, 'タイトル個別コピーライト(あれば優先使用)');
  var colPublisherCopyright = col(idx, '出版社コピーライト');
  // undefined khi cột Q chưa được thêm vào sheet — xem COPYRIGHT_PRE_CONFIRMATION_HEADER.
  var colPreConfirmation = tryCol(idx, COPYRIGHT_PRE_CONFIRMATION_HEADER);
  var historyCols = [];
  for (var h = 1; h <= CONFIG.COPYRIGHT_HISTORY_SLOTS; h++) {
    historyCols.push(col(idx, copyrightHistoryHeaderName(h)));
  }

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < resolved.values.length; i++) {
    var row = resolved.values[i];
    if (!row) continue;
    if (!row[colTitleNo]) continue;
    var history = [];
    historyCols.forEach(function (c) {
      if (row[c] !== '' && row[c] !== null && row[c] !== undefined) history.push(row[c]);
    });
    records.push({
      titleNo: row[colTitleNo],
      cmsId: row[colCmsId],
      titleId: row[colTitleId],
      titleName: row[colTitleName],
      author: row[colAuthor],
      genre: row[colGenre],
      publisher: row[colPublisher],
      label: row[colLabel],
      individualCopyright: row[colIndividual],
      publisherCopyright: row[colPublisherCopyright],
      preConfirmation: colPreConfirmation === undefined ? '' : row[colPreConfirmation],
      copyrightHistory: history,
      sheetRow: i + 1,
    });
  }
  return {
    hasPreConfirmationColumn: colPreConfirmation !== undefined,
    records: records,
  };
}

/**
 * Chuyển 1 copyright record thành mảng giá trị theo đúng vị trí cột thật.
 *
 * Khác customerRecordToRow(): ở đây KHÔNG cần dựng từ bản copy dòng cũ, vì MỌI cột
 * của master này đều do GAS ghi — không có cột nào của người nhập tay để mà bảo
 * toàn. Cột A (đệm) vẫn được để trống đúng như trên sheet.
 *
 * @param {object} record - Copyright record (từ main.js, sau shiftCopyrightHistory())
 * @param {Map<string,number>} headerIndex
 * @param {number} columnCount
 * @returns {Array<*>}
 */
function copyrightRecordToRow(record, headerIndex, columnCount) {
  var row = new Array(columnCount).fill('');
  row[col(headerIndex, 'タイトルNo')] = record.titleNo;
  row[col(headerIndex, 'CMS ID')] = record.cmsId;
  row[col(headerIndex, 'タイトルID')] = record.titleId;
  row[col(headerIndex, 'タイトル名')] = record.titleName;
  row[col(headerIndex, '作家名')] = record.author;
  row[col(headerIndex, 'ジャンル')] = record.genre;
  row[col(headerIndex, '出版社')] = record.publisher;
  row[col(headerIndex, 'レーベル名')] = record.label;
  // 2 cột bản quyền độc lập. J nguyên văn từ CMS; K là giá trị GAS sinh, để TRỐNG
  // khi không sinh được (không bao giờ ghi câu chỉ thị hay giá trị đoán — xem
  // resolvePublisherCopyright() ở copyright.js).
  row[col(headerIndex, 'タイトル個別コピーライト(あれば優先使用)')] = record.individualCopyright || '';
  row[col(headerIndex, '出版社コピーライト')] = record.publisherCopyright || '';
  for (var h = 1; h <= CONFIG.COPYRIGHT_HISTORY_SLOTS; h++) {
    row[col(headerIndex, copyrightHistoryHeaderName(h))] = record.copyrightHistory[h - 1] || '';
  }
  // Cột Q 出版社事前確認 — chỉ ghi khi cột thật sự tồn tại trên sheet. Chưa có cột thì
  // bỏ qua im lặng ở ĐÂY là đúng: cảnh báo đã được main.js ghi 1 lần cho cả lần chạy
  // (báo ở đây sẽ thành 1.303 dòng giống hệt nhau).
  var colPreConfirmation = tryCol(headerIndex, COPYRIGHT_PRE_CONFIRMATION_HEADER);
  if (colPreConfirmation !== undefined) {
    row[colPreConfirmation] = record.preConfirmation || '';
  }
  return row;
}

/**
 * Ghi kết quả diffUpsert() vào コピーライトマスタ thật — update theo `item.sheetRow`
 * (số dòng thật do readCopyrightMaster() gắn), append dòng mới ở cuối, không bao
 * giờ xoá dòng nào.
 *
 * Ô 更新日 đóng dấu ở cuối hàm — cùng lý do đã ghi ở writeCustomerWorkMaster().
 *
 * @param {{toUpdate: Array<{record: object, sheetRow: number}>, toAdd: Array<object>}} diffResult
 * @param {Date} runAt - Thời điểm chạy, ghi vào ô 更新日
 * @returns {{updatedAtCell: string|null}} Ô đã đóng dấu dạng A1, null nếu không thấy nhãn
 */
function writeCopyrightMaster(diffResult, runAt) {
  var cfg = CONFIG.OUTPUTS.COPYRIGHT_MASTER;
  var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName, COPYRIGHT_REQUIRED_HEADERS);
  var sheet = resolved.sheet;
  var headerIndex = resolved.headerIndex;
  var columnCount = resolved.columnCount;
  var headerRowNumber = resolved.headerRowIndex + 1;

  diffResult.toUpdate.forEach(function (item) {
    sheet.getRange(item.sheetRow, 1, 1, columnCount)
      .setValues([copyrightRecordToRow(item.record, headerIndex, columnCount)]);
  });

  if (diffResult.toAdd.length > 0) {
    var startRow = Math.max(sheet.getLastRow(), headerRowNumber) + 1;
    var values = diffResult.toAdd.map(function (record) {
      return copyrightRecordToRow(record, headerIndex, columnCount);
    });
    sheet.getRange(startRow, 1, values.length, columnCount).setValues(values);
  }

  return {
    updatedAtCell: stampUpdatedAt(sheet, resolved.values, resolved.headerRowIndex, runAt),
  };
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
// 8 cột số đếm ở giữa được thêm 2026-08-03/08-04 (spec §6). Từ nay tác phẩm có thể biến
// mất khỏi master một cách im lặng (595 NG + 3.353 未判定 trên dữ liệu hôm nay),
// nên 1 dòng log phải đủ để biết lần chạy đó có gì bất thường mà không cần mở tab
// GAS1警告.
// 2026-08-07: thêm 2 cột đếm cho nguồn cột R/S và T/U. ensureLogHeaderRow() tự
// NÂNG CẤP hàng header của tab đang có, nên không phải xoá tab cũ — nhưng CHÚ Ý:
// dòng log của những lần chạy TRƯỚC không dịch theo, nên 2 cột mới sẽ trống ở các
// dòng cũ và 2 cột cuối (個別対応タイトル/エラー) của dòng cũ nằm lệch sang trái 2 ô.
var LOG_HEADER = ['開始日時', '終了日時', '追加件数', '更新件数',
  '除外_NG件数', '除外_未判定件数', '照合注意件数', '照合曖昧件数', '孤立行件数',
  '外部出稿NG注意件数', '掲載停止注意件数', 'コピーライト注意件数',
  '先行延長注意件数', '大量無料注意件数',
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
    entry.copyrightNoticeCount || 0,
    entry.preEndExtensionNoticeCount || 0,
    entry.massFreeNoticeCount || 0,
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
 * gộp của cả 7 hàm build trong master.js (照合注意, 照合曖昧, 孤立行,
 * 外部出稿NG注意, 掲載停止注意, コピーライト注意, 先行延長注意, 大量無料注意).
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

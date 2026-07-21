// io/logSheet.js — ghi log mỗi lần chạy GAS❶ vào 2 sheet log riêng biệt
// (cả 2 nằm TRONG CÙNG spreadsheet với 顧客作品マスタ — tự tạo tab mới nếu
// chưa có, không phải 1 spreadsheet riêng — xem spec §8):
//   - "GAS1ログ": 1 dòng = 1 LẦN CHẠY, chỉ có số lượng tổng hợp (thêm/sửa bao
//     nhiêu, có lỗi không) — dùng để biết NHANH lần chạy nào đó thành công
//     hay thất bại.
//   - "GAS1変更詳細": 1 dòng = 1 FIELD của 1 tác phẩm đã đổi (giá trị cũ ->
//     mới) — dùng để BACKUP/AUDIT: khi phát hiện có vấn đề (vd giá trị nào
//     đó bị sai), tra ngược lại sheet này để biết chính xác nó đã đổi lúc
//     nào, từ giá trị gì sang giá trị gì (xem logic/changeDetail.js để biết
//     cách các dòng này được tính ra).

var LOG_SHEET_NAME = 'GAS1ログ';
var LOG_HEADER = ['開始日時', '終了日時', '追加件数', '更新件数', '個別対応タイトル', 'エラー'];

var CHANGE_DETAIL_SHEET_NAME = 'GAS1変更詳細';
var CHANGE_DETAIL_HEADER = ['実行日時', '対象マスタ', 'タイトルNo', 'タイトル名', '変更フィールド', '変更前', '変更後'];

/**
 * Lấy sheet log, tự tạo mới (kèm ghi hàng header) nếu đây là lần đầu tiên
 * chạy và tab "GAS1ログ" chưa tồn tại trong spreadsheet 顧客作品マスタ.
 *
 * @returns {Sheet} Đối tượng Sheet của tab GAS1ログ
 */
function getOrCreateLogSheet() {
  var ss = SpreadsheetApp.openById(CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER.spreadsheetId);
  var sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET_NAME);
    sheet.appendRow(LOG_HEADER);
  }
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
 *   irregularTitles: danh sách "titleId titleName" của các tác phẩm rơi vào
 *     tầng 4 (cá biệt) trong copyrightResolver — xem runGas1() ở main.js
 *   errors: rỗng nếu chạy thành công; có 1 phần tử (String(error)) nếu
 *     runGas1() bị exception giữa chừng
 * @returns {void}
 */
function appendLogEntry(entry) {
  var sheet = getOrCreateLogSheet();
  sheet.appendRow([
    entry.startedAt,
    entry.finishedAt,
    entry.addedCount,
    entry.updatedCount,
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
 * logic/changeDetail.buildChangeDetailRows() của CẢ 顧客作品マスタ lẫn
 * コピーライトマスタ trong cùng 1 lần chạy (main.js gộp cả 2 danh sách rồi
 * gọi hàm này 1 lần, thay vì gọi 2 lần riêng).
 *
 * Nếu rows rỗng (không có field nào đổi ở lần chạy này), KHÔNG làm gì cả —
 * tránh tạo dòng trống vô nghĩa trên sheet.
 *
 * @param {Array<{
 *   runAt: Date, master: string, titleNo: *, titleName: string,
 *   field: string, oldValue: *, newValue: *
 * }>} rows - Kết quả logic/changeDetail.buildChangeDetailRows()
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

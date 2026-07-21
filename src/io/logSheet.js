// io/logSheet.js — ghi log mỗi lần chạy GAS❶ vào sheet "GAS1ログ"
// (nằm TRONG CÙNG spreadsheet với 顧客作品マスタ — tự tạo tab mới nếu chưa có,
// không phải 1 spreadsheet riêng — xem spec §8).

var LOG_SHEET_NAME = 'GAS1ログ';
var LOG_HEADER = ['開始日時', '終了日時', '追加件数', '更新件数', '個別対応タイトル', 'エラー'];

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

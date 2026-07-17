// io/logSheet.js — ghi log mỗi lần chạy GAS❶ vào sheet "GAS1ログ"
// (nằm trong cùng spreadsheet 顧客作品マスタ, tự tạo nếu chưa có)

var LOG_SHEET_NAME = 'GAS1ログ';
var LOG_HEADER = ['開始日時', '終了日時', '追加件数', '更新件数', '個別対応タイトル', 'エラー'];

function getOrCreateLogSheet() {
  var ss = SpreadsheetApp.openById(CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER.spreadsheetId);
  var sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET_NAME);
    sheet.appendRow(LOG_HEADER);
  }
  return sheet;
}

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

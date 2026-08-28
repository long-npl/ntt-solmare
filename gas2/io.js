// gas2/io.js — CHỖ DUY NHẤT NÓI CHUYỆN VỚI GOOGLE.
//
// Mọi hàm ở đây CHỈ chạy được trong Apps Script (SpreadsheetApp / UrlFetchApp /
// PropertiesService), nên KHÔNG test được bằng Node — đó chính là lý do file này cố tình
// chỉ chứa đọc/ghi, không chứa quyết định nghiệp vụ nào. Kiểm phần này bằng các hàm
// probe_* trong gas2/main.js.
//
// NGOẠI LỆ DUY NHẤT: stampUpdatedAt() — mọi lời gọi API của nó nằm trong thân hàm, còn
// logic là dò vị trí trên một mảng, nên test được bằng sheet giả (xem test_updatedAt).
//
// Ba phần:
//   1. ĐỌC 2 master nguồn + ĐỌC/GHI タイトルマスタ
//   2. GHI 3 tab log (GAS2ログ, GAS2警告, GAS2変更詳細)
//   3. GỬI Slack

// ==============================================================================
// PHẦN 1 — ĐỌC/GHI SHEET
// ==============================================================================

/**
 * Đọc TOÀN BỘ giá trị ô của 1 sheet, kể cả hàng header và các hàng ghi chú phía trên.
 *
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @returns {Array<Array<*>>}
 * @throws {Error} Nếu spreadsheet không có sheet tên đó
 */
function readSheetValues(spreadsheetId, sheetName) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName + ' (spreadsheet ' + spreadsheetId + ')');
  return sheet.getDataRange().getValues();
}

/**
 * @returns {Array<object>} Kết quả parseCustomerMasterRows()
 */
function readCustomerMaster() {
  var cfg = CONFIG.SOURCES.CUSTOMER_WORK_MASTER;
  return parseCustomerMasterRows(readSheetValues(cfg.spreadsheetId, cfg.sheetName));
}

/**
 * @returns {{records: Array<object>, hasPreConfirmation: boolean}}
 */
function readCopyrightMaster() {
  var cfg = CONFIG.SOURCES.COPYRIGHT_MASTER;
  return parseCopyrightMasterRows(readSheetValues(cfg.spreadsheetId, cfg.sheetName));
}

/**
 * Mở タイトルマスタ và trả về mọi thứ mà một lần chạy cần — sheet để ghi, values để
 * stampUpdatedAt() dò ô 更新日, và kết quả parse.
 *
 * Trả `values` luôn để bên gọi không phải getDataRange() lần thứ hai: mỗi lời gọi
 * Apps Script API là một round-trip.
 *
 * columnCount = max(getLastColumn(), bề rộng hàng header) — không bao giờ ghi hẹp hơn số
 * cột đã biết, kể cả khi các cột bên phải đang trống nên getLastColumn() trả về ít hơn.
 *
 * @returns {{sheet: Sheet, values: Array<Array<*>>, headerRowIndex: number,
 *   headerIndex: Map<string,number>, columnCount: number, rows: Array<object>}}
 */
function readTitleMaster() {
  var cfg = CONFIG.OUTPUTS.TITLE_MASTER;
  var ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  var sheet = ss.getSheetByName(cfg.sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + cfg.sheetName + ' (spreadsheet ' + cfg.spreadsheetId + ')');
  var values = sheet.getDataRange().getValues();
  var parsed = parseTitleMasterRows(values);
  var headerRow = values[parsed.headerRowIndex];
  return {
    sheet: sheet,
    values: values,
    headerRowIndex: parsed.headerRowIndex,
    headerIndex: parsed.headerIndex,
    columnCount: Math.max(sheet.getLastColumn(), headerRow.length, 1),
    rows: parsed.rows,
  };
}

/**
 * Đặt kết quả diff lên sheet: update từng dòng, append các dòng mới trong 1 lệnh.
 *
 * Append bắt đầu từ max(getLastRow(), hàng header) + 1 — dùng getLastRow() chứ không phải
 * số dòng đã parse, vì phía dưới vùng dữ liệu có thể có ô ghi chú (ガワ mẫu có ghi chú ở
 * hàng 27 và 29). Ghi đè lên chúng là mất chú thích của 池永.
 *
 * @param {object} sheetContext - Kết quả readTitleMaster()
 * @param {{toUpdate: Array<object>, toAdd: Array<object>}} diffResult
 * @param {Date} runAt
 * @returns {{updatedAtCell: string|null}}
 */
function writeTitleMaster(sheetContext, diffResult, runAt) {
  var sheet = sheetContext.sheet;
  var columnCount = sheetContext.columnCount;

  diffResult.toUpdate.forEach(function (item) {
    sheet.getRange(item.sheetRow, 1, 1, columnCount).setValues([item.values]);
  });

  if (diffResult.toAdd.length > 0) {
    var startRow = Math.max(sheet.getLastRow(), sheetContext.headerRowIndex + 1) + 1;
    var values = diffResult.toAdd.map(function (item) { return item.values; });
    sheet.getRange(startRow, 1, values.length, columnCount).setValues(values);
  }

  return { updatedAtCell: stampUpdatedAt(sheet, sheetContext.values, sheetContext.headerRowIndex, runAt) };
}

// Nhãn ô 更新日 trong khối ghi chú phía trên vùng dữ liệu. Ô ngay BÊN PHẢI nhãn này nhận
// thời điểm chạy (trên ガワ hiện tại: nhãn B5, giá trị C5).
var UPDATED_AT_LABEL = '更新日';

/**
 * Ghi thời điểm chạy vào ô 更新日.
 *
 * DÒ THEO NHÃN, KHÔNG HARDCODE 'C5': 池永 chèn thêm một hàng ghi chú phía trên là C5 thành
 * C6, và hằng 'C5' sẽ âm thầm ghi đè lên một ô ghi chú thay vì báo lỗi.
 *
 * CHỈ QUÉT CÁC HÀNG TRÊN HÀNG HEADER: dưới đó là dữ liệu thật, và hàng nghìn dòng hoàn
 * toàn có thể chứa chữ 更新日 trong một ô 備考. So khớp là ĐÚNG BẰNG (sau
 * normalizeHeaderText) chứ không phải "chứa" — nếu không thì '①更新タイミング：…' và
 * '[1]更新ルール' ở ngay các hàng bên cạnh cũng khớp.
 *
 * Ghi Date object chứ không phải chuỗi: ô đó đang được định dạng ngày trên sheet.
 *
 * @param {Sheet} sheet
 * @param {Array<Array<*>>} values
 * @param {number} headerRowIndex
 * @param {Date} runAt
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

// ==============================================================================
// PHẦN 2 — 3 TAB LOG
// ==============================================================================
//
// Cả 3 tab nằm trong CHÍNH spreadsheet タイトルマスタ, không phải nơi khác: đó là chỗ
// người dùng đang mở khi họ thắc mắc "sao dòng này đổi".

var LOG_SHEET_NAME = 'GAS2ログ';
var WARNING_SHEET_NAME = 'GAS2警告';
var CHANGE_DETAIL_SHEET_NAME = 'GAS2変更詳細';

// Thêm cột vào đây là đủ — getOrCreateLogTab() tự ghi đè hàng header của tab đang có,
// không phải xoá tab bằng tay. Cột mới chèn TRƯỚC エラー để エラー luôn ở ngoài cùng bên
// phải, chỗ mắt tìm nó.
var LOG_HEADER = ['開始時刻', '終了時刻', '追加行数', '更新行数',
  'タイトルNo欠落', 'タイトルNo重複', 'コピーライト未登録', '孤立行', '設定注意', 'エラー'];
var WARNING_HEADER = ['実行時刻', '種別', 'タイトルNo', 'タイトルID', 'タイトル名', '詳細'];
var CHANGE_DETAIL_HEADER = ['実行時刻', 'タイトルNo', 'タイトル名', '項目', '変更前', '変更後'];

/**
 * Lấy 1 tab log, tự tạo nếu chưa có, và tự NÂNG CẤP hàng header nếu tab đã tồn tại với
 * bộ cột cũ (thêm cột vào LOG_HEADER về sau mà không phải xoá tab bằng tay).
 *
 * @param {string} sheetName
 * @param {Array<string>} header
 * @returns {Sheet}
 */
function getOrCreateLogTab(sheetName, header) {
  var ss = SpreadsheetApp.openById(CONFIG.OUTPUTS.TITLE_MASTER.spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
    return sheet;
  }
  var width = Math.max(sheet.getLastColumn(), header.length);
  var current = sheet.getRange(1, 1, 1, width).getValues()[0];
  var same = header.every(function (name, i) {
    return String(current[i] === undefined || current[i] === null ? '' : current[i]) === name;
  });
  if (!same) sheet.getRange(1, 1, 1, header.length).setValues([header]);
  return sheet;
}

/**
 * Ghi 1 dòng log cho 1 lần chạy — gọi ở CẢ nhánh thành công lẫn nhánh catch của runGas2().
 *
 * Mọi field số đếm đều TUỲ CHỌN (thiếu thì ghi 0) để nhánh catch gọi được với entry tối thiểu.
 *
 * @param {{startedAt: Date, finishedAt: Date, addedCount: number, updatedCount: number,
 *   missingNoCount: number, duplicateNoCount: number, noCopyrightCount: number,
 *   configNoticeCount: number, orphanCount: number, errors: Array<string>}} entry
 * @returns {void}
 */
function appendLogEntry(entry) {
  var sheet = getOrCreateLogTab(LOG_SHEET_NAME, LOG_HEADER);
  sheet.appendRow([
    entry.startedAt,
    entry.finishedAt,
    entry.addedCount || 0,
    entry.updatedCount || 0,
    entry.missingNoCount || 0,
    entry.duplicateNoCount || 0,
    entry.noCopyrightCount || 0,
    entry.orphanCount || 0,
    entry.configNoticeCount || 0,
    (entry.errors || []).join(' / '),
  ]);
}

/**
 * Ghi nhiều dòng cảnh báo trong 1 lệnh setValues().
 *
 * Rows rỗng -> không làm gì: không tạo dòng trống, và cũng không tạo tab GAS2警告 nếu lần
 * chạy đó hoàn toàn sạch.
 *
 * @param {Array<{runAt: Date, kind: string, titleNo: *, titleId: *, titleName: *, detail: string}>} rows
 * @returns {void}
 */
function appendWarningRows(rows) {
  if (!rows || rows.length === 0) return;
  var sheet = getOrCreateLogTab(WARNING_SHEET_NAME, WARNING_HEADER);
  var startRow = sheet.getLastRow() + 1;
  var values = rows.map(function (row) {
    return [row.runAt, row.kind, row.titleNo, row.titleId, row.titleName, row.detail];
  });
  sheet.getRange(startRow, 1, values.length, WARNING_HEADER.length).setValues(values);
}

/**
 * Ghi nhiều dòng log chi tiết (1 dòng = 1 cột của 1 tác phẩm đã đổi).
 *
 * @param {Array<{runAt: Date, titleNo: *, titleName: *, field: string, oldValue: *, newValue: *}>} rows
 * @returns {void}
 */
function appendChangeDetailRows(rows) {
  if (!rows || rows.length === 0) return;
  var sheet = getOrCreateLogTab(CHANGE_DETAIL_SHEET_NAME, CHANGE_DETAIL_HEADER);
  var startRow = sheet.getLastRow() + 1;
  var values = rows.map(function (row) {
    return [row.runAt, row.titleNo, row.titleName, row.field, row.oldValue, row.newValue];
  });
  sheet.getRange(startRow, 1, values.length, CHANGE_DETAIL_HEADER.length).setValues(values);
}

// ==============================================================================
// PHẦN 3 — SLACK
// ==============================================================================

/**
 * Gửi 1 tin nhắn Slack. Không cấu hình token/channel thì IM LẶNG bỏ qua.
 *
 * Im lặng là cố ý: Slack là kênh thông báo phụ, không phải điều kiện để GAS❷ chạy được.
 * Throw ở đây sẽ biến "chưa điền Script Property" thành "cả lần chạy thất bại".
 *
 * Điền 2 giá trị thật qua Apps Script editor > Project Settings > Script Properties, tên
 * property lấy từ CONFIG.SLACK_PROPERTY_KEYS.
 *
 * @param {string} message
 * @returns {void}
 */
function notifySlack(message) {
  var properties = PropertiesService.getScriptProperties();
  var token = properties.getProperty(CONFIG.SLACK_PROPERTY_KEYS.BOT_TOKEN);
  var channel = properties.getProperty(CONFIG.SLACK_PROPERTY_KEYS.CHANNEL_ID);
  if (!token || !channel) return;
  UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ channel: channel, text: message }),
    muteHttpExceptions: true,
  });
}

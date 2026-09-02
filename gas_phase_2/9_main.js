// 9_main.js — nhac truong cua GAS❷, cong 3 tab log va Slack.
//
// GAS❷ doc 2 output cua GAS❶ roi dung タイトルマスタ. No khong tinh gi tu nguon ngoai.
//
// GUARD CHONG CHAY SOM: truoc khi lam gi, so o 更新日 cua 顧客作品マスタ voi hom nay.
// Khac ngay -> bo qua lan chay, de khong dung タイトルマスタ tu du lieu nua voi.

// ==============================================================================

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
 * @param {{startedAt: Date, finishedAt: Date, addedCount: number, updatedCount: number,
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


/**
 * Một lần chạy GAS❷: đọc 2 master nguồn, diff với タイトルマスタ, ghi phần khác biệt,
 * đóng dấu 更新日, ghi 3 tab log.
 * @returns {void}
 * @throws {Error} Re-throw nguyên vẹn lỗi gốc sau khi đã log + báo Slack.
 */
function runGas2() {
  var startedAt = new Date();
  var errors = [];
  var addedCount = 0;
  var updatedCount = 0;
  var warnings = [];

  try {
    // Nguồn chính — không bọc try/catch: hỏng thì cả lần chạy phải dừng.
    var customer = readCustomerMaster();
    var customerRecords = customer.records;

    // ---- CHỐNG CHẠY SỚM (xem JSDoc) ----
    // updatedAt === null nghĩa là không dò được nhãn 更新日 trên sheet. Đó là "không
    // biết", không phải "chưa chạy" — vẫn chạy tiếp và để buildWarning nói ra, chứ
    if (customer.updatedAt !== null && !sameDateValue(customer.updatedAt, startedAt)) {
      warnings.push({
        runAt: startedAt, kind: WARNING_KIND_CONFIG,
        titleNo: '', titleId: '', titleName: '',
        detail: '顧客作品マスタ の 更新日 が本日ではありません（' + toDateKey(customer.updatedAt)
          + '）。GAS❶ が今日まだ完了していないため、タイトルマスタ への書き込みをスキップしました。',
      });
      appendWarningRows(warnings);
      return;
    }

    // Nguồn phụ.
    var copyrightRecords = [];
    var copyrightAvailable = true;
    var preConfirmationAvailable = false;
    try {
      var copyright = readCopyrightMaster();
      copyrightRecords = copyright.records;
      preConfirmationAvailable = copyright.hasPreConfirmation;
      if (!preConfirmationAvailable) {
        // WARNING_KIND_CONFIG, KHÔNG phải WARNING_KIND_NO_COPYRIGHT: đây là việc nguồn
        // THIẾU MỘT CỘT, không phải việc một tác phẩm không có copyright. Dùng chung
        // loại thì cột 未登録件数 của GAS2ログ bị cộng thêm 1 ở mọi lần chạy cho tới khi
        warnings.push({
          runAt: startedAt, kind: WARNING_KIND_CONFIG,
          titleNo: '', titleId: '', titleName: '',
          detail: 'コピーライトマスタ chưa có cột 出版社事前確認 — cột AA của タイトルマスタ được giữ nguyên. Thêm cột đúng tên này vào nguồn là đủ để kích hoạt.',
        });
      }
    } catch (copyrightError) {
      copyrightAvailable = false;
      errors.push('コピーライトマスタ đọc không được (3 cột S/T/AA giữ nguyên): ' + String(copyrightError));
    }

    var titleMaster = readTitleMaster();
    var result = diffTitleMaster({
      customerRecords: customerRecords,
      copyrightLookup: buildCopyrightLookup(copyrightRecords),
      copyrightAvailable: copyrightAvailable,
      preConfirmationAvailable: preConfirmationAvailable,
      existing: titleMaster.rows,
      headerIndex: titleMaster.headerIndex,
      columnCount: titleMaster.columnCount,
      runAt: startedAt,
    });

    writeTitleMaster(titleMaster, result, startedAt);
    addedCount = result.toAdd.length;
    updatedCount = result.toUpdate.length;
    warnings = warnings.concat(result.warnings);
    appendWarningRows(warnings);
    appendChangeDetailRows(result.changeDetails);
  } catch (error) {
    errors.push(String(error));
    notifySlack('GAS❷ タイトルマスタ thất bại: ' + String(error));
    throw error;
  } finally {
    // finally, KHÔNG phải sau khối try/catch: nhánh lỗi giờ re-throw, nên code đặt
    // sau khối sẽ không bao giờ chạy khi có lỗi — mà đó chính là lần chạy cần dòng
    // log nhất.
    appendLogEntry({
      startedAt: startedAt,
      finishedAt: new Date(),
      addedCount: addedCount,
      updatedCount: updatedCount,
      missingNoCount: countWarnings(warnings, WARNING_KIND_MISSING_NO),
      duplicateNoCount: countWarnings(warnings, WARNING_KIND_DUPLICATE_NO),
      noCopyrightCount: countWarnings(warnings, WARNING_KIND_NO_COPYRIGHT),
      configNoticeCount: countWarnings(warnings, WARNING_KIND_CONFIG),
      orphanCount: countWarnings(warnings, WARNING_KIND_ORPHAN),
      errors: errors,
    });
  }
}

/**
 * Đếm số cảnh báo thuộc 1 loại — dùng cho các cột đếm của GAS2ログ.
 * @param {Array<{kind: string}>} warnings
 * @param {string} kind
 * @returns {number}
 */
function countWarnings(warnings, kind) {
  var count = 0;
  warnings.forEach(function (w) { if (w.kind === kind) count += 1; });
  return count;
}

/**
 * Xoá mọi trigger cũ của runGas2 rồi cài lại theo CONFIG.TRIGGER_HOURS.
 * @returns {void}
 */
function createGas2Trigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'runGas2') ScriptApp.deleteTrigger(trigger);
  });
  CONFIG.TRIGGER_HOURS.forEach(function (hour) {
    ScriptApp.newTrigger('runGas2')
      .timeBased()
      .atHour(hour)
      .nearMinute(CONFIG.TRIGGER_MINUTE)
      .everyDays(1)
      .inTimezone(CONFIG.TRIGGER_TIMEZONE)
      .create();
  });
}

// ==============================================================================
// PROBE — chạy tay trong Apps Script editor, KHÔNG ghi gì lên sheet
// ==============================================================================

/**
 * Xác nhận タイトルマスタ đọc được: đúng sheet, đúng hàng header, đủ 24 tên cột.
 * @returns {void}
 */
function probe_readTitleMasterHeader() {
  var titleMaster = readTitleMaster();
  Logger.log('sheet: ' + CONFIG.OUTPUTS.TITLE_MASTER.sheetName);
  Logger.log('hàng header (1-based): ' + (titleMaster.headerRowIndex + 1));
  Logger.log('columnCount: ' + titleMaster.columnCount);
  Logger.log('số dòng có タイトルNo: ' + titleMaster.rows.length);
  // columnIndexToLetter() nhận index 0-BASED, còn col() vốn đã trả 0-based — truyền
  // thẳng, KHÔNG cộng 1 (cộng 1 sẽ in lệch đúng 1 cột và biến log chẩn đoán thành thứ
  // gây hiểu nhầm).
  TITLE_COLUMNS.forEach(function (column) {
    Logger.log(column.header + ' -> cột ' + columnIndexToLetter(col(titleMaster.headerIndex, column.header)));
  });
}

/**
 * @returns {void}
 * @returns {void}
 */
function probe_readCustomerMaster() {
  var customer = readCustomerMaster();
  Logger.log('số dòng đọc được: ' + customer.records.length);
  // 更新日 là thứ guard chạy-sớm dựa vào — in ra để biết vì sao một lần chạy bị bỏ qua.
  Logger.log('更新日 trên sheet: ' + (customer.updatedAt === null
    ? '(không dò được nhãn)' : toDateKey(customer.updatedAt)));
  Logger.log('hôm nay: ' + toDateKey(new Date()));
  Logger.log('dòng đầu: ' + JSON.stringify(customer.records[0]));
}

/**
 * @returns {void}
 * @returns {void}
 */
function probe_readCopyrightMaster() {
  var result = readCopyrightMaster();
  Logger.log('số dòng đọc được: ' + result.records.length);
  Logger.log('có cột 出版社事前確認: ' + result.hasPreConfirmation);
  Logger.log('dòng đầu: ' + JSON.stringify(result.records[0]));
}

/**
 * Chạy trọn vẹn phần TÍNH TOÁN của một lần chạy rồi in kết quả — KHÔNG ghi gì lên sheet,
 * không ghi cả log.
 * @returns {void}
 */
function probe_dryRunDiff() {
  var runAt = new Date();
  var customer = readCustomerMaster();
  var copyright = readCopyrightMaster();
  var titleMaster = readTitleMaster();
  // CỐ TÌNH bỏ qua guard chạy-sớm: probe này để xem diff sẽ ra gì, và câu hỏi đó vẫn
  // đáng trả lời kể cả khi GAS❶ chưa chạy hôm nay. runGas2() mới là chỗ guard chặn.
  var result = diffTitleMaster({
    customerRecords: customer.records,
    copyrightLookup: buildCopyrightLookup(copyright.records),
    copyrightAvailable: true,
    preConfirmationAvailable: copyright.hasPreConfirmation,
    existing: titleMaster.rows,
    headerIndex: titleMaster.headerIndex,
    columnCount: titleMaster.columnCount,
    runAt: runAt,
  });
  Logger.log('sẽ THÊM: ' + result.toAdd.length + ' dòng');
  Logger.log('sẽ SỬA: ' + result.toUpdate.length + ' dòng');
  Logger.log('cảnh báo: ' + result.warnings.length + ' dòng');
  Logger.log('chi tiết thay đổi: ' + result.changeDetails.length + ' dòng');
  result.warnings.slice(0, 20).forEach(function (w) {
    Logger.log('[' + w.kind + '] ' + w.titleNo + ' ' + w.titleName + ' — ' + w.detail);
  });
}

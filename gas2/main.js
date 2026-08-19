// gas2/main.js — TẦNG DÀN DỰNG của GAS❷.
//
// File này KHÔNG được nạp vào harness Node (tools/verify-gas2/run.js): nó chỉ ghép các
// mảnh đã test lại với nhau và gọi tầng io. Kiểm nó bằng các hàm probe_* ở cuối file,
// chạy tay trong Apps Script editor.
//
// Điểm vào: runGas2(). Cài lịch: chạy tay createGas2Trigger() MỘT lần.

/**
 * Một lần chạy GAS❷: đọc 2 master nguồn, diff với タイトルマスタ, ghi phần khác biệt,
 * đóng dấu 更新日, ghi 3 tab log.
 *
 * HAI MỨC LỖI NGUỒN, CỐ Ý KHÁC NHAU (spec §7):
 *   顧客作品マスタ (nguồn CHÍNH) đọc không được -> throw ra ngoài, KHÔNG ghi một ô nào lên
 *     タイトルマスタ. Ghi tiếp với danh sách rỗng sẽ biến mọi tác phẩm thành 孤立行.
 *   コピーライトマスタ (nguồn PHỤ) đọc không được -> copyrightAvailable = false, 3 cột
 *     S/T/AA giữ nguyên giá trị đang có và lần chạy VẪN tiếp tục. Bắt buộc phải vậy: S/T
 *     là cột GAS❷ ghi đè hoàn toàn, coi "không đọc được" = "rỗng" sẽ xoá sạch copyright
 *     của toàn bộ tác phẩm chỉ vì một lần mất quyền truy cập.
 *
 * @returns {void}
 */
function runGas2() {
  var startedAt = new Date();
  var errors = [];
  var addedCount = 0;
  var updatedCount = 0;
  var warnings = [];

  try {
    // Nguồn chính — không bọc try/catch: hỏng thì cả lần chạy phải dừng.
    var customerRecords = readCustomerMaster();

    // Nguồn phụ.
    var copyrightRecords = [];
    var copyrightAvailable = true;
    var preConfirmationAvailable = false;
    try {
      var copyright = readCopyrightMaster();
      copyrightRecords = copyright.records;
      preConfirmationAvailable = copyright.hasPreConfirmation;
      if (!preConfirmationAvailable) {
        warnings.push({
          runAt: startedAt, kind: WARNING_KIND_NO_COPYRIGHT,
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
  }

  appendLogEntry({
    startedAt: startedAt,
    finishedAt: new Date(),
    addedCount: addedCount,
    updatedCount: updatedCount,
    missingNoCount: countWarnings(warnings, WARNING_KIND_MISSING_NO),
    duplicateNoCount: countWarnings(warnings, WARNING_KIND_DUPLICATE_NO),
    noCopyrightCount: countWarnings(warnings, WARNING_KIND_NO_COPYRIGHT),
    orphanCount: countWarnings(warnings, WARNING_KIND_ORPHAN),
    errors: errors,
  });
}

/**
 * Đếm số cảnh báo thuộc 1 loại — dùng cho các cột đếm của GAS2ログ.
 *
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
 *
 * PHẢI CHẠY TAY MỘT LẦN sau khi đổi CONFIG.TRIGGER_HOURS — Apps Script không tự đọc lại.
 *
 * nearMinute(): trigger everyDays() của Apps Script chỉ nhận "gần phút thứ N", Google chạy
 * trong khoảng ±15 phút. Không có API đặt đúng phút cho trigger hằng ngày.
 *
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
 *
 * CHẠY HÀM NÀY TRƯỚC LẦN CHẠY THẬT ĐẦU TIÊN. Nó là chỗ duy nhất phát hiện được việc một
 * tên trong TITLE_COLUMNS lệch so với sheet thật (thường là ngoặc full-width vs half-width)
 * mà không phải ghi thử lên master.
 *
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
 */
function probe_readCustomerMaster() {
  var records = readCustomerMaster();
  Logger.log('số dòng đọc được: ' + records.length);
  Logger.log('dòng đầu: ' + JSON.stringify(records[0]));
}

/**
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
 *
 * Đây là hàm để chạy trước lần chạy thật: nếu nó báo "sẽ thêm 8.000 dòng, sửa 8.000 dòng"
 * thì có gì đó sai với khoá join, và biết điều đó TRƯỚC khi ghi rẻ hơn nhiều so với sau.
 *
 * @returns {void}
 */
function probe_dryRunDiff() {
  var runAt = new Date();
  var customerRecords = readCustomerMaster();
  var copyright = readCopyrightMaster();
  var titleMaster = readTitleMaster();
  var result = diffTitleMaster({
    customerRecords: customerRecords,
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

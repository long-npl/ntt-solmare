// main.js — điều phối GAS❶: đọc 3 nguồn -> build 顧客作品マスタ -> tính bản
// quyền 4 tầng -> build コピーライトマスタ -> ghi upsert cả 2 -> log -> Slack
// khi có tác phẩm cá biệt hoặc lỗi.

function buildRowOffsetIndex(existingRecords, keyFn) {
  var index = new Map();
  existingRecords.forEach(function (record, i) {
    index.set(keyFn(record), i);
  });
  return index;
}

function attachRowOffsets(diffResult, existingRecords, keyFn) {
  var offsetByKey = buildRowOffsetIndex(existingRecords, keyFn);
  diffResult.toUpdate.forEach(function (item) {
    item.rowOffset = offsetByKey.get(item.key);
  });
  return diffResult;
}

function runGas1() {
  var startedAt = new Date();
  var errors = [];
  var irregularTitles = [];

  try {
    var regulationRaw = readSheetValues(CONFIG.SOURCES.REGULATION.spreadsheetId, CONFIG.SOURCES.REGULATION.sheetName);
    var cmsRaw = readSheetValues(CONFIG.SOURCES.CMS.spreadsheetId, CONFIG.SOURCES.CMS.sheetName);
    var ngTitleRaw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.NG_TITLES);
    var basicNotationRaw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.BASIC_NOTATION);

    var regulationRecords = parseRegulationRows(regulationRaw);
    var regulationLookup = buildRegulationLookup(regulationRecords);

    var cmsRecords = parseCmsRows(cmsRaw);
    var cmsCopyrightLookup = buildCmsCopyrightLookup(cmsRecords);

    var ngTitleRecords = parseNgTitles(ngTitleRaw);
    var ngTitleLookup = buildNgTitleLookup(ngTitleRecords);

    var basicNotationMap = parseBasicNotation(basicNotationRaw);

    var publisherMaps = {};
    PUBLISHER_SHEET_PARSERS.forEach(function (entry) {
      var rawRows = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, entry.sheetName);
      publisherMaps[entry.key] = entry.parse(rawRows);
    });

    // ---- 顧客作品マスタ ----
    var customerKeyFn = function (r) { return String(r.titleId); };
    var existingCustomerRows = readCustomerWorkMaster();

    var builtCustomerRows = buildCustomerWorkRows(cmsRecords, regulationLookup, ngTitleLookup);

    // Tính bản quyền TRƯỚC khi diff/đánh số 顧客作品マスタ: cột コピーライト của
    // 顧客作品マスタ phản ánh giá trị đã resolve, và コピーライトマスタ không có
    // cột タイトルID riêng — nó dùng chung タイトルNo với 顧客作品マスタ, nên
    // タイトルNo phải được chốt ở đây trước khi build コピーライトマスタ.
    builtCustomerRows.forEach(function (work) {
      var resolved = resolveCopyright(work, cmsCopyrightLookup, PUBLISHER_SHEET_PARSERS, publisherMaps, basicNotationMap);
      work.copyright = resolved.value;
      work.copyrightTier = resolved.tier;
      if (resolved.tier === 4) irregularTitles.push(work.titleId + ' ' + work.titleName);
    });

    var numberedCustomerRows = resolveNumbers(existingCustomerRows, builtCustomerRows, customerKeyFn, 'titleNo');

    var customerIsEqualFn = function (a, b) {
      return a.author === b.author && a.genre === b.genre && a.publisher === b.publisher
        && a.logoJudgement === b.logoJudgement && a.remark === b.remark && a.copyright === b.copyright;
    };
    var customerDiff = diffUpsert(existingCustomerRows, numberedCustomerRows, customerKeyFn, customerIsEqualFn);
    attachRowOffsets(customerDiff, existingCustomerRows, customerKeyFn);

    // ---- コピーライトマスタ (key theo タイトルNo, dùng lại số vừa gán ở trên) ----
    var copyrightKeyFn = function (r) { return String(r.titleNo); };
    var existingCopyrightRows = readCopyrightMaster();
    var existingCopyrightByTitleNo = new Map();
    existingCopyrightRows.forEach(function (r) {
      existingCopyrightByTitleNo.set(copyrightKeyFn(r), r);
    });

    var newCopyrightRows = numberedCustomerRows.map(function (work) {
      var prior = existingCopyrightByTitleNo.get(String(work.titleNo)) || { copyrightCurrent: null, copyrightHistory: [] };
      var shifted = shiftCopyrightHistory(prior, work.copyright, CONFIG.COPYRIGHT_HISTORY_SLOTS);

      return {
        titleNo: work.titleNo,
        titleName: work.titleName,
        author: work.author,
        publisher: work.publisher,
        copyrightCurrent: shifted.copyrightCurrent,
        copyrightHistory: shifted.copyrightHistory,
        tier: work.copyrightTier,
      };
    });

    var copyrightIsEqualFn = function (a, b) {
      return a.copyrightCurrent === b.copyrightCurrent && a.author === b.author && a.publisher === b.publisher;
    };
    var copyrightDiff = diffUpsert(existingCopyrightRows, newCopyrightRows, copyrightKeyFn, copyrightIsEqualFn);
    attachRowOffsets(copyrightDiff, existingCopyrightRows, copyrightKeyFn);

    // ---- ghi kết quả ----
    writeCustomerWorkMaster(customerDiff);
    writeCopyrightMaster(copyrightDiff);

    if (irregularTitles.length > 0) {
      notifySlack('GAS❶: ' + irregularTitles.length + '件のタイトルが個別対応(コピーライト特定不可)になりました:\n' + irregularTitles.join('\n'));
    }

    appendLogEntry({
      startedAt: startedAt,
      finishedAt: new Date(),
      addedCount: customerDiff.toAdd.length,
      updatedCount: customerDiff.toUpdate.length,
      irregularTitles: irregularTitles,
      errors: errors,
    });
  } catch (error) {
    errors.push(String(error));
    notifySlack('GAS❶ 実行エラー: ' + String(error));
    appendLogEntry({
      startedAt: startedAt,
      finishedAt: new Date(),
      addedCount: 0,
      updatedCount: 0,
      irregularTitles: irregularTitles,
      errors: errors,
    });
    throw error;
  }
}

// Tạo trigger tự động chạy runGas1() lúc 9h và 18h (Asia/Tokyo) mỗi ngày.
// Chỉ cần chạy hàm này 1 LẦN DUY NHẤT (thủ công) để cài trigger; chạy lại
// cũng an toàn vì nó tự xoá trigger runGas1 cũ trước khi tạo lại.
function createGas1Trigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'runGas1') ScriptApp.deleteTrigger(trigger);
  });

  CONFIG.TRIGGER_HOURS.forEach(function (hour) {
    ScriptApp.newTrigger('runGas1')
      .timeBased()
      .everyDays(1)
      .atHour(hour)
      .inTimezone(CONFIG.TRIGGER_TIMEZONE)
      .create();
  });
}

// ============================================================
// Các hàm "probe" để bạn chạy thử từng bước trong Apps Script
// editor (chọn tên hàm trong dropdown > Run > xem Logger log).
// Có thể xoá các hàm probe_* này sau khi debug xong.
// ============================================================

function probe_readRegulation() {
  var raw = readSheetValues(CONFIG.SOURCES.REGULATION.spreadsheetId, CONFIG.SOURCES.REGULATION.sheetName);
  var records = parseRegulationRows(raw);
  Logger.log('Tổng số dòng 判定済み: ' + records.length);
  Logger.log(JSON.stringify(records.slice(0, 3), null, 2));
}

function probe_readCms() {
  var raw = readSheetValues(CONFIG.SOURCES.CMS.spreadsheetId, CONFIG.SOURCES.CMS.sheetName);
  var records = parseCmsRows(raw);
  Logger.log('Tổng số dòng CMS: ' + records.length);
  Logger.log(JSON.stringify(records.slice(0, 3), null, 2));
}

function probe_readNgTitles() {
  var raw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.NG_TITLES);
  var records = parseNgTitles(raw);
  Logger.log('Tổng số dòng NG title: ' + records.length);
  Logger.log(JSON.stringify(records.slice(0, 3), null, 2));
}

function probe_readBasicNotation() {
  var raw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.BASIC_NOTATION);
  var map = parseBasicNotation(raw);
  Logger.log('Tổng số label 基本のC表記: ' + map.size);
  Logger.log('A-KAGURA -> ' + map.get('A-KAGURA'));
}

function probe_readPublisherSheets() {
  PUBLISHER_SHEET_PARSERS.forEach(function (entry) {
    var raw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, entry.sheetName);
    var map = entry.parse(raw);
    Logger.log(entry.key + ' (' + entry.sheetName + '): ' + map.size + ' entries');
  });
}

function probe_readCustomerMaster() {
  Logger.log(JSON.stringify(readCustomerWorkMaster().slice(0, 3), null, 2));
}

function probe_readCopyrightMaster() {
  Logger.log(JSON.stringify(readCopyrightMaster().slice(0, 3), null, 2));
}

function probe_resolveCopyrightForOneWork() {
  // Sửa các giá trị bên dưới để thử với 1 tác phẩm cụ thể
  var work = { cmsId: 999999, titleId: 111111, titleName: 'サンプルタイトル', author: 'サンプル作家', publisher: 'アルファポリス' };

  var cmsRaw = readSheetValues(CONFIG.SOURCES.CMS.spreadsheetId, CONFIG.SOURCES.CMS.sheetName);
  var cmsCopyrightLookup = buildCmsCopyrightLookup(parseCmsRows(cmsRaw));

  var basicNotationRaw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.BASIC_NOTATION);
  var basicNotationMap = parseBasicNotation(basicNotationRaw);

  var publisherMaps = {};
  PUBLISHER_SHEET_PARSERS.forEach(function (entry) {
    var rawRows = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, entry.sheetName);
    publisherMaps[entry.key] = entry.parse(rawRows);
  });

  var result = resolveCopyright(work, cmsCopyrightLookup, PUBLISHER_SHEET_PARSERS, publisherMaps, basicNotationMap);
  Logger.log(JSON.stringify(result));
}

function probe_notifySlackNoop() {
  notifySlack('test message, không nên thực sự gửi nếu chưa cấu hình Script Properties');
}

function probe_appendLogEntry() {
  appendLogEntry({
    startedAt: new Date(),
    finishedAt: new Date(),
    addedCount: 0,
    updatedCount: 0,
    irregularTitles: ['probe run'],
    errors: [],
  });
}

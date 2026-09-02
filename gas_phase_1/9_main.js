// 9_main.js — nhạc trưởng của GAS❶, cộng 3 tab log và Slack.
//
// File này TỰ NÓ không chứa quyết định nghiệp vụ nào. Muốn biết một cột được tính
// thế nào, mở 4_customer_master.js; muốn biết thứ tự các bước và VÌ SAO chúng nối
// với nhau như vậy, đọc runGas1() ở cuối file.
//
// BA RÀNG BUỘC THỨ TỰ, không được đảo (docs/decisions.md #order-01):
//   đọc master  ->  lọc  ->  cấp タイトルNo  ->  build コピーライトマスタ

// ==============================================================================
// 3 TAB LOG
// ==============================================================================

var LOG_SHEET_NAME = 'GAS1ログ';
// 8 cột số đếm ở giữa được thêm 2026-08-03/08-04 (spec §6). Từ nay tác phẩm có thể biến
// mất khỏi master một cách im lặng (595 NG + 3.353 未判定 trên dữ liệu hôm nay),
// nên 1 dòng log phải đủ để biết lần chạy đó có gì bất thường mà không cần mở tab
var LOG_HEADER = ['開始日時', '終了日時', '追加件数', '更新件数',
  '除外_NG件数', '除外_未判定件数', '照合注意件数', '照合曖昧件数', '孤立行件数',
  '外部出稿NG注意件数', '掲載停止注意件数', 'コピーライト注意件数',
  '先行延長注意件数', '大量無料注意件数',
  // 2026-09-01: 判定消失注意件数 — số tác phẩm đang GIỮ NGUYÊN ①②③ vì tra không ra
  // dòng 判定済み. Cột này là chuông báo cháy của nguồn ①: xấp xỉ tổng số dòng master
  // nghĩa là sheet nguồn đã gãy, không phải vài tác phẩm lẻ đổi ステータス.
  '判定消失注意件数',
  '個別対応タイトル', 'エラー'];

var CHANGE_DETAIL_SHEET_NAME = 'GAS1変更詳細';
var CHANGE_DETAIL_HEADER = ['実行日時', '対象マスタ', 'タイトルNo', 'タイトル名', '変更フィールド', '変更前', '変更後'];

var WARNING_SHEET_NAME = 'GAS1警告';
var WARNING_HEADER = ['実行日時', '種別', 'タイトルNo', 'タイトルID', 'タイトル名', '詳細'];

/**
 * Đảm bảo hàng 1 của 1 sheet log đúng bằng `header`.
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
 * @param {{
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
    entry.regulationLostNoticeCount || 0,
    entry.irregularTitles.join(', '),
    entry.errors.join(', '),
  ]);
}

/**
 * Lấy sheet log chi tiết theo field, tự tạo mới (kèm ghi hàng header) nếu tab
 * "GAS1変更詳細" chưa tồn tại.
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
 * @param {Array<{
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
 * @param {Array<{runAt: Date, kind: string, titleNo: *, titleId: *, titleName: string, detail: string}>} rows
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


// ==============================================================================
// GAS❶
// ==============================================================================

/** Rút record ra khỏi match — nhiều hàm cảnh báo nhận mảng record, không nhận match. */
function recordOf(match) { return match.record; }

/**
 * Sinh 2 cột bản quyền + cột 出版社事前確認 cho từng tác phẩm được giữ.
 *
 * Nguồn quy tắc lỗi -> đánh dấu để bước build コピーライトマスタ giữ nguyên giá trị
 * đang có, chứ không xoá bản quyền đã sinh. Xem docs/decisions.md #sources-02
 *
 * @returns {Array<object>} Các ca không sinh được, để ghi コピーライト注意.
 */
function resolveCopyrightFor(matches, loaded) {
  var warnings = [];
  var rulesLookup = loaded.values.publisherCopyright;
  matches.forEach(function (match) {
    var work = match.record;
    work.individualCopyright = work.copyrightU;

    if (loaded.errors.publisherCopyright !== null) {
      work.publisherCopyrightSkipped = true;
      return;
    }
    var resolved = resolvePublisherCopyright(work, rulesLookup);
    work.publisherCopyright = resolved.value === null ? '' : resolved.value;
    // Tra ĐỘC LẬP với việc sinh được bản quyền hay không: 「02：個別ルール」nói bản
    // quyền phải viết tay, không nói NXB miễn kiểm duyệt trước.
    work.preConfirmation = resolvePublisherPreConfirmation(work, rulesLookup);
    if (resolved.reason !== COPYRIGHT_REASON_OK) {
      warnings.push({ record: work, copyrightReason: resolved.reason, copyrightDetail: resolved.detail });
    }
  });
  return warnings;
}

/**
 * Build コピーライトマスタ từ chính danh sách đã lọc, khoá là タイトルNo.
 *
 * Master này không có cột nào dùng làm khoá được (2 tác phẩm có thể chung タイトルID)
 * nên nó dùng chung số với 顧客作品マスタ — đó là lý do resolveNumbersFromMatches()
 * bắt buộc phải chạy xong trước. Xem docs/decisions.md #order-01
 */
function buildCopyrightDiff(matches, existingCopyright) {
  var priorByNo = new Map();
  existingCopyright.records.forEach(function (r) { priorByNo.set(String(r.titleNo), r); });

  var incoming = matches.map(function (match) {
    var prior = priorByNo.get(String(match.record.titleNo)) || null;
    // Nguồn quy tắc lỗi -> giữ nguyên 2 cột đang có trên sheet (dòng mới thì trống).
    if (match.record.publisherCopyrightSkipped) {
      match.record.publisherCopyright = prior === null ? '' : prior.publisherCopyright;
      match.record.preConfirmation = prior === null ? '' : prior.preConfirmation;
    }
    return buildCopyrightRecord(match.record, prior);
  });

  return diffUpsert(existingCopyright.records, incoming,
    function (r) { return String(r.titleNo); },
    function (a, b) { return recordsEqual(a, b, COPYRIGHT_COLUMNS); });
}

/** Báo Slack các tác phẩm không có bản quyền nào dùng được (cả 2 cột đều rỗng). */
function notifyIrregular(matches) {
  var irregular = [];
  matches.forEach(function (match) {
    if (normalizeJapaneseText(effectiveCopyright(match.record)) !== '') return;
    irregular.push(match.record.titleId + ' ' + match.record.titleName);
  });
  if (irregular.length === 0) return [];
  Logger.log('個別対応（コピーライト無し）: ' + irregular.length + ' 件');
  notifySlack('GAS❶: ' + irregular.length
    + '件のタイトルが個別対応(コピーライト特定不可)になりました:\n' + irregular.join('\n'));
  return irregular;
}

/** Dòng log tổng hợp. `filtered`/`diff` là null khi lần chạy lỗi giữa chừng. */
function buildLogEntry(startedAt, filtered, diff, counts, irregular, errors) {
  return {
    startedAt: startedAt,
    finishedAt: new Date(),
    addedCount: diff ? diff.toAdd.length : 0,
    updatedCount: diff ? diff.toUpdate.length : 0,
    excludedNgCount: filtered ? filtered.excludedNg.length : 0,
    excludedUnjudgedCount: filtered ? filtered.excludedUnjudged.length : 0,
    matchNoticeCount: counts[WARNING_KIND_MATCH] || 0,
    matchAmbiguousCount: counts[WARNING_KIND_AMBIGUOUS] || 0,
    orphanCount: counts[WARNING_KIND_ORPHAN] || 0,
    ngTitleNoticeCount: counts[WARNING_KIND_NG_TITLE] || 0,
    suspensionNoticeCount: counts[WARNING_KIND_SUSPENSION] || 0,
    copyrightNoticeCount: counts[WARNING_KIND_COPYRIGHT] || 0,
    preEndExtensionNoticeCount: counts[WARNING_KIND_PRE_END_EXTENSION] || 0,
    massFreeNoticeCount: counts[WARNING_KIND_MASS_FREE] || 0,
    regulationLostNoticeCount: counts[WARNING_KIND_REGULATION_LOST] || 0,
    irregularTitles: irregular,
    errors: errors,
  };
}

/**
 * GAS❶ — đọc nguồn, lọc theo レギュレーション, ghi 2 master, log + cảnh báo.
 *
 * Chạy tự động 9h và 17h (Asia/Tokyo) qua trigger, hoặc chạy tay trong editor.
 *
 * XỬ LÝ LỖI: mọi bước throw đều được ghi log + báo Slack rồi RE-THROW, để lần chạy
 * hiển thị đúng là THẤT BẠI trong execution log. Hai lệnh ghi nằm SAU mọi bước tính
 * nên khi lỗi xảy ra, không ô nào bị ghi dữ liệu thiếu.
 */
function runGas1() {
  var startedAt = new Date();
  var errors = [];
  Logger.log('GAS❶ 開始: ' + startedAt.toISOString());

  try {
    var loaded = loadSources(startedAt);

    // Đọc master TRƯỚC khi lọc: rule 2 cần biết tác phẩm đã có trên master chưa.
    var existingCustomer = readMaster(CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER, CUSTOMER_COLUMNS);
    var works = loaded.values.cms.map(function (cms) {
      return buildCustomerRecord(cms, loaded);
    });

    var filtered = filterAndMatchWorks(works, existingCustomer.records);
    Logger.log('レギュレーションフィルタ: 対象 ' + filtered.matches.length + ' 件 / 除外(NG) '
      + filtered.excludedNg.length + ' 件 / 除外(未判定) ' + filtered.excludedUnjudged.length
      + ' 件（CMS 全 ' + works.length + ' 件、既存マスタ ' + existingCustomer.records.length + ' 行）');

    // Chỉ tính cho tác phẩm được giữ — tính cho tác phẩm bị loại là vô nghĩa.
    applyLookups(filtered.matches, loaded);
    var copyrightWarnings = resolveCopyrightFor(filtered.matches, loaded);
    applyRules(filtered.matches, CUSTOMER_COLUMNS, loaded);

    var matches = resolveNumbersFromMatches(filtered.matches, existingCustomer.records, 'titleNo');
    var customerDiff = diffUpsertFromMatches(matches, CUSTOMER_COLUMNS);
    Logger.log('顧客作品マスタ 集計: 追加 ' + customerDiff.toAdd.length + ' 件 / 更新 '
      + customerDiff.toUpdate.length + ' 件 / 変化なし ' + customerDiff.unchangedKeys.length
      + ' 件 / 孤立行 ' + filtered.orphanOffsets.length + ' 行');

    var existingCopyright = readMaster(CONFIG.OUTPUTS.COPYRIGHT_MASTER, COPYRIGHT_COLUMNS);
    var copyrightDiff = buildCopyrightDiff(matches, existingCopyright);
    Logger.log('コピーライトマスタ 集計: 追加 ' + copyrightDiff.toAdd.length + ' 件 / 更新 '
      + copyrightDiff.toUpdate.length + ' 件 / 変化なし ' + copyrightDiff.unchangedKeys.length + ' 件');

    // runAt lấy MỘT lần ở đây: ô 更新日, tab 変更詳細 và tab 警告 dùng chung một mốc
    // thời gian nên 3 nơi đối chiếu được với nhau cho cùng một lần chạy.
    var runAt = new Date();
    var customerStamp = writeMaster(CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER, CUSTOMER_COLUMNS,
      customerDiff, runAt);
    var copyrightStamp = writeMaster(CONFIG.OUTPUTS.COPYRIGHT_MASTER, COPYRIGHT_COLUMNS,
      copyrightDiff, runAt);
    Logger.log('書き込み完了（更新日: 顧客作品マスタ ' + (customerStamp || '書き込めず')
      + ' / コピーライトマスタ ' + (copyrightStamp || '書き込めず') + '）');

    appendChangeDetailRows(
      buildChangeDetailRows('顧客作品マスタ', customerDiff.toUpdate, CUSTOMER_COLUMNS, runAt)
        .concat(buildChangeDetailRows('コピーライトマスタ', copyrightDiff.toUpdate,
          COPYRIGHT_COLUMNS, runAt)));

    var warningRows = buildAllWarnings({
      matches: matches,
      records: matches.map(recordOf),
      existingCustomerRows: existingCustomer.records,
      orphanOffsets: filtered.orphanOffsets,
      ngTitleLookup: loaded.values.ngTitle || new Map(),
      suspensionLookup: loaded.values.suspension || new Map(),
      suspensionFileName: SUSPENSION_FILE_NAME,
      preEndLookup: loaded.values.preEnd || new Map(),
      massFreeLookup: loaded.values.massFree || new Map(),
      commitLookup: loaded.values.commit || new Map(),
      copyrightWarnings: copyrightWarnings,
      hasPreConfirmationColumn: existingCopyright.headerIndex.has(
        normalizeHeaderText('出版社事前確認')),
      publisherCopyrightRules: [],
      errors: loaded.errors,
      runAt: runAt,
      stamps: [{ label: '顧客作品マスタ', cell: customerStamp },
        { label: 'コピーライトマスタ', cell: copyrightStamp }],
    });
    appendWarningRows(warningRows);
    var counts = countWarningsByKind(warningRows);
    Logger.log('GAS1警告 記録: ' + warningRows.length + ' 件 — ' + JSON.stringify(counts));

    var irregular = notifyIrregular(matches);
    appendLogEntry(buildLogEntry(startedAt, filtered, customerDiff, counts, irregular, errors));
    Logger.log('GAS❶ 完了（所要 ' + Math.round((new Date() - startedAt) / 1000) + '秒）');
  } catch (error) {
    Logger.log('GAS❶ エラーで中断: ' + String(error));
    errors.push(String(error));
    notifySlack('GAS❶ 実行エラー: ' + String(error));
    appendLogEntry(buildLogEntry(startedAt, null, null, {}, [], errors));
    throw error;
  }
}

/**
 * Cài (hoặc cài lại) trigger cho runGas1 chạy 9h và 17h giờ Nhật mỗi ngày.
 *
 * CHỈ CẦN CHẠY TAY 1 LẦN. An toàn khi chạy lại: luôn xoá hết trigger cũ trỏ tới
 * runGas1 trước, nên không bao giờ bị nhân đôi.
 */
function createGas1Trigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'runGas1') ScriptApp.deleteTrigger(trigger);
  });
  CONFIG.TRIGGER_HOURS.forEach(function (hour) {
    ScriptApp.newTrigger('runGas1').timeBased().atHour(hour).everyDays(1)
      .inTimezone(CONFIG.TRIGGER_TIMEZONE).create();
  });
  Logger.log('Đã cài trigger runGas1 lúc ' + CONFIG.TRIGGER_HOURS.join('時, ') + '時 ('
    + CONFIG.TRIGGER_TIMEZONE + ')');
}

// ==============================================================================
// PROBE — chạy tay trong Apps Script editor để kiểm từng mảnh
// ==============================================================================

/** In layout đã dò được của 顧客作品マスタ. Kỳ vọng: header hàng 15. */
function probe_readCustomerMasterHeader() {
  var resolved = readMaster(CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER, CUSTOMER_COLUMNS);
  Logger.log('顧客作品マスタ: ヘッダー行 ' + (resolved.headerRowIndex + 1) + ' 行目 / 列数 '
    + resolved.columnCount + ' / データ ' + resolved.records.length + ' 行');
}

/** In layout đã dò được của コピーライトマスタ, kèm việc cột tuỳ chọn có tồn tại không. */
function probe_readCopyrightMasterHeader() {
  var resolved = readMaster(CONFIG.OUTPUTS.COPYRIGHT_MASTER, COPYRIGHT_COLUMNS);
  Logger.log('コピーライトマスタ: ヘッダー行 ' + (resolved.headerRowIndex + 1) + ' 行目 / 列数 '
    + resolved.columnCount + ' / データ ' + resolved.records.length + ' 行'
    + ' / 出版社事前確認 列: ' + (resolved.headerIndex.has(normalizeHeaderText('出版社事前確認'))
      ? 'あり' : 'なし'));
}

/** Đọc 8 nguồn rồi in kết quả lọc — KHÔNG ghi gì lên sheet nào. */
function probe_dryRunFilter() {
  var loaded = loadSources(new Date());
  Object.keys(loaded.errors).forEach(function (key) {
    if (loaded.errors[key] !== null) Logger.log('  nguồn ' + key + ' LỖI: ' + loaded.errors[key]);
  });
  var existing = readMaster(CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER, CUSTOMER_COLUMNS);
  var works = loaded.values.cms.map(function (cms) { return buildCustomerRecord(cms, loaded); });
  var filtered = filterAndMatchWorks(works, existing.records);
  Logger.log('CMS ' + works.length + ' 件 -> 対象 ' + filtered.matches.length
    + ' / 除外(NG) ' + filtered.excludedNg.length
    + ' / 除外(未判定) ' + filtered.excludedUnjudged.length
    + ' / 孤立行 ' + filtered.orphanOffsets.length);
}

/**
 * Chẩn đoán: in ĐÚNG những gì GAS đang nhìn thấy ở 2 master. KHÔNG ghi gì.
 *
 * Dùng khi con số trong log không khớp với thứ nhìn thấy trên sheet — nó phân biệt
 * "GAS đọc sai" với "GAS đang mở nhầm spreadsheet".
 */
function probe_diagnose() {
  [['顧客作品マスタ', CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER, CUSTOMER_COLUMNS],
    ['コピーライトマスタ', CONFIG.OUTPUTS.COPYRIGHT_MASTER, COPYRIGHT_COLUMNS]]
    .forEach(function (item) {
      var label = item[0];
      var cfg = item[1];
      var columns = item[2];
      Logger.log('--- ' + label + ' ---');
      Logger.log('  spreadsheetId: ' + cfg.spreadsheetId);
      Logger.log('  URL: https://docs.google.com/spreadsheets/d/' + cfg.spreadsheetId + '/edit');
      var ss = SpreadsheetApp.openById(cfg.spreadsheetId);
      Logger.log('  tên file: ' + ss.getName());
      Logger.log('  các sheet: ' + ss.getSheets().map(function (s) {
        return s.getName() + '(' + s.getLastRow() + ' hàng)';
      }).join(' | '));

      var sheet = ss.getSheetByName(cfg.sheetName);
      if (!sheet) { Logger.log('  KHÔNG có sheet tên ' + cfg.sheetName); return; }
      Logger.log('  sheet đang dùng: ' + cfg.sheetName
        + ' — getLastRow=' + sheet.getLastRow() + ' getLastColumn=' + sheet.getLastColumn());

      var resolved = readMaster(cfg, columns);
      Logger.log('  header ở hàng: ' + (resolved.headerRowIndex + 1)
        + ' / values.length=' + resolved.values.length
        + ' / readMaster đọc ra: ' + resolved.records.length + ' record');
      if (resolved.records.length > 0) {
        var nos = resolved.records.map(function (r) { return r.titleNo; });
        Logger.log('  タイトルNo đầu=' + nos[0] + ' cuối=' + nos[nos.length - 1]);
      } else {
        // Không đọc ra record nào: in 3 hàng ngay dưới header để thấy vì sao.
        for (var k = 1; k <= 3; k++) {
          var row = resolved.values[resolved.headerRowIndex + k];
          Logger.log('  hàng ' + (resolved.headerRowIndex + k + 1) + ': '
            + (row ? JSON.stringify(row.slice(0, 12)) : '(không có)'));
        }
      }
    });
}

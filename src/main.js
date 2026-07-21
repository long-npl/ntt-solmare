// main.js — điều phối GAS❶: đọc 3 nguồn -> build 顧客作品マスタ -> tính bản
// quyền 4 tầng -> build コピーライトマスタ -> ghi upsert cả 2 -> log -> Slack
// khi có tác phẩm cá biệt hoặc lỗi.
//
// Đây là file "nhạc trưởng" — TỰ NÓ không chứa logic nghiệp vụ (parse/tính
// toán), chỉ gọi đúng thứ tự các hàm từ sources/*.js, logic/*.js, io/*.js.
// Muốn hiểu 1 bước cụ thể làm gì, xem JSDoc ở file tương ứng; muốn hiểu THỨ
// TỰ và LÝ DO các bước nối với nhau, đọc comment trong runGas1() bên dưới.
//
// Xem thêm sơ đồ luồng tổng thể: docs/gas1-van-hanh.md

/**
 * Build bảng tra "khoá -> vị trí (index) trong existingRecords" — dùng để
 * biết 1 record đã tồn tại nằm ở DÒNG THỨ MẤY trên sheet thật, phục vụ việc
 * ghi đè đúng chỗ (xem attachRowOffsets() ngay dưới đây).
 *
 * @param {Array<object>} existingRecords - Dữ liệu đọc từ sheet output (trước khi build mới)
 * @param {function(object): string} keyFn - Hàm lấy khoá định danh 1 record
 * @returns {Map<string, number>} Map khoá -> index (0-based) trong existingRecords
 */
function buildRowOffsetIndex(existingRecords, keyFn) {
  var index = new Map();
  existingRecords.forEach(function (record, i) {
    index.set(keyFn(record), i);
  });
  return index;
}

/**
 * Gắn thêm field `rowOffset` vào từng phần tử diffResult.toUpdate — đây là
 * "cầu nối" giữa logic/upsert.js (thuần, không biết gì về vị trí dòng trên
 * sheet) và io/sheetIO.js (cần biết CHÍNH XÁC dòng nào để ghi đè). diffUpsert()
 * chỉ trả về record nào cần update theo KHOÁ, còn hàm này tra ngược lại khoá
 * đó nằm ở dòng thứ mấy trong existingRecords ban đầu.
 *
 * @param {{toUpdate: Array<{key: string, record: object}>}} diffResult - Kết quả diffUpsert()
 * @param {Array<object>} existingRecords - Dữ liệu đọc từ sheet output
 * @param {function(object): string} keyFn - PHẢI giống hệt keyFn đã dùng khi gọi diffUpsert()
 * @returns {object} Chính diffResult đầu vào (đã sửa in-place, trả về để tiện chain)
 */
function attachRowOffsets(diffResult, existingRecords, keyFn) {
  var offsetByKey = buildRowOffsetIndex(existingRecords, keyFn);
  diffResult.toUpdate.forEach(function (item) {
    item.rowOffset = offsetByKey.get(item.key);
  });
  return diffResult;
}

/**
 * Hàm chính của GAS❶ — được gọi bởi trigger tự động (9h/18h, xem
 * createGas1Trigger() bên dưới) hoặc chạy tay trong Apps Script editor.
 *
 * THỨ TỰ CÁC BƯỚC (quan trọng, không được đảo lộn):
 *
 *  1. Đọc thô 3 nguồn (readSheetValues, io/sheetIO.js) + parse từng nguồn
 *     thành record/Map (sources/*.js).
 *  2. buildCustomerWorkRows() (logic/customerWorkMaster.js): ghép CMS +
 *     regulation + NG-title thành danh sách "work" — DANH SÁCH TÁC PHẨM
 *     chính thức của lần chạy này (theo đúng CMS, nguồn nền tảng).
 *  3. Với TỪNG work, gọi resolveCopyright() (logic/copyrightResolver.js) và
 *     GẮN THÊM 2 field work.copyright/work.copyrightTier — làm bước này TRƯỚC
 *     khi đánh số/upsert 顧客作品マスタ, vì cột コピーライト của chính
 *     顧客作品マスタ cần phản ánh giá trị đã resolve (spec §4.1 — cột này giữ
 *     lại để tra cứu nhanh, nguồn chân lý vẫn là コピーライトマスタ).
 *  4. resolveNumbers() (logic/upsert.js), key theo CMSID: gán/tái sử dụng
 *     タイトルNo cho TỪNG work — PHẢI làm trước diffUpsert() và trước khi build
 *     コピーライトマスタ, vì コピーライトマスタ không có cột タイトルID riêng, nó
 *     dùng CHUNG タイトルNo với 顧客作品マスタ (xem sheetIO.readCopyrightMaster()).
 *  5. diffUpsert() + attachRowOffsets() cho 顧客作品マスタ, rồi
 *     writeCustomerWorkMaster() ghi thật lên sheet.
 *  6. Build コピーライトマスタ: với mỗi work đã có タイトルNo, tra bản ghi
 *     コピーライトマスタ đang có (theo タイトルNo), gọi shiftCopyrightHistory()
 *     (logic/copyrightHistory.js) để quyết định giá trị mới + lịch sử 過去.
 *  7. diffUpsert() + attachRowOffsets() cho コピーライトマスタ, rồi
 *     writeCopyrightMaster() ghi thật lên sheet.
 *  8. buildChangeDetailRows() (logic/changeDetail.js) cho CẢ 2 master, rồi
 *     appendChangeDetailRows() ghi audit log field-by-field vào sheet
 *     "GAS1変更詳細" (io/logSheet.js) — 1 dòng = 1 field của 1 tác phẩm đã
 *     đổi, kèm giá trị cũ/mới, để backup/tra cứu khi phát hiện vấn đề sau này.
 *  9. Nếu có tác phẩm tầng 4 (cá biệt): notifySlack() báo danh sách.
 * 10. appendLogEntry() ghi log tổng hợp (luôn chạy, kể cả khi lỗi — xem khối catch).
 *
 * XỬ LÝ LỖI: nếu BẤT KỲ bước nào throw (vd 1 sheet nguồn bị đổi tên/xoá cột,
 * hoặc mất quyền truy cập), khối catch sẽ: ghi lỗi vào log, báo Slack, rồi
 * RE-THROW error đó (throw error ở cuối catch) — để lần chạy này hiển thị rõ
 * là THẤT BẠI trong Apps Script execution log (không nuốt lỗi âm thầm), đồng
 * thời KHÔNG ghi dữ liệu thiếu/sai vào 2 sheet output (vì 2 lệnh
 * writeCustomerWorkMaster/writeCopyrightMaster nằm SAU bước lỗi trong try,
 * nên chưa kịp chạy tới).
 *
 * @returns {void}
 * @throws {Error} Re-throw nguyên vẹn lỗi gốc sau khi đã log + báo Slack, để
 *   Apps Script (và trigger) biết lần chạy này thất bại.
 */
function runGas1() {
  var startedAt = new Date();
  var errors = [];
  var irregularTitles = [];

  Logger.log('GAS❶ 開始: ' + startedAt.toISOString());

  try {
    // ---- Bước 1: đọc thô + parse 3 nguồn ----
    var regulationRaw = readSheetValues(CONFIG.SOURCES.REGULATION.spreadsheetId, CONFIG.SOURCES.REGULATION.sheetName);
    var cmsRaw = readSheetValues(CONFIG.SOURCES.CMS.spreadsheetId, CONFIG.SOURCES.CMS.sheetName);
    var ngTitleRaw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.NG_TITLES);
    var basicNotationRaw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.BASIC_NOTATION);

    var regulationRecords = parseRegulationRows(regulationRaw);
    var regulationLookup = buildRegulationLookup(regulationRecords);
    Logger.log('作品レギュレーション判定: ' + regulationRecords.length + ' 件（判定済み）読み込み完了');

    var cmsRecords = parseCmsRows(cmsRaw);
    var cmsCopyrightLookup = buildCmsCopyrightLookup(cmsRecords);
    // cmsRaw.length - 1 = tổng số dòng data thô (trừ header). Số dòng KHÔNG
    // được đưa vào cmsRecords là dòng CMSID trống (bị parseCmsRows loại) hoặc
    // dòng trống thật sự cuối sheet — CỐ TÌNH log ra con số này để dòng dữ
    // liệu bị loại không biến mất trong im lặng (đã gặp trường hợp thật: file
    // nguồn bị lệch cột ở hàng loạt dòng khiến CMSID trống, nếu không log sẽ
    // không ai biết các tác phẩm đó bị bỏ qua).
    var cmsSkippedCount = (cmsRaw.length - 1) - cmsRecords.length;
    Logger.log('先行タイトル情報(CMS): ' + cmsRecords.length + ' 件読み込み完了（コピーライトU列あり: ' + cmsCopyrightLookup.size + ' 件、'
      + 'CMSID欠落等でスキップ: ' + cmsSkippedCount + ' 件）');

    var ngTitleRecords = parseNgTitles(ngTitleRaw);
    var ngTitleLookup = buildNgTitleLookup(ngTitleRecords);
    Logger.log('外部出稿用NGタイトル: ' + ngTitleRecords.length + ' 件読み込み完了');

    var basicNotationMap = parseBasicNotation(basicNotationRaw);
    Logger.log('基本のC表記: ' + basicNotationMap.size + ' レーベル読み込み完了');

    // Đọc + parse cả 5 sheet quy tắc riêng NXB (LINE/スクエニ/リブレ/オーバー
    // ラップ/ヒーローズ) theo registry — thêm NXB mới chỉ cần sửa
    // PUBLISHER_SHEET_PARSERS ở sources/copyrightRules.js, không cần sửa dòng nào ở đây.
    var publisherMaps = {};
    PUBLISHER_SHEET_PARSERS.forEach(function (entry) {
      var rawRows = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, entry.sheetName);
      publisherMaps[entry.key] = entry.parse(rawRows);
      Logger.log(entry.key + ' (' + entry.sheetName + '): ' + publisherMaps[entry.key].size + ' 件読み込み完了');
    });

    // ---- Bước 2-5: 顧客作品マスタ ----
    // Key theo CMSID, KHÔNG theo タイトルID: dữ liệu thật cho thấy ~3.5% dòng
    // 先行タイトル情報(CMS) có タイトルID trống, và nhiều tác phẩm khác nhau dùng
    // chung giá trị placeholder "ー" làm タイトルID — key theo タイトルID khiến các
    // tác phẩm đó bị gộp chung 1 khoá, không so khớp đúng được với dòng đã ghi ở
    // lần chạy trước, nên bị thêm lặp lại mỗi lần runGas1() chạy. CMSID luôn có
    // giá trị (0 dòng trống trong 5649 dòng kiểm tra thực tế) nên đáng tin cậy hơn.
    var customerKeyFn = function (r) { return String(r.cmsId); };
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

    // isEqualFn quyết định "coi là không đổi" -> KHÔNG ghi lại dòng đó (spec
    // §7). So sánh đủ các field hiển thị trên 顧客作品マスタ, kể cả copyright
    // (vì cột コピーライト của master này cũng đổi theo nếu tầng resolve đổi).
    // Dùng sameValue() (logic/upsert.js) thay vì `===` trực tiếp: giá trị vừa
    // build lại có thể là `undefined` (vd logoJudgement/remark không match gì),
    // trong khi giá trị đọc lại từ sheet cho cùng "không có gì" đó là chuỗi
    // rỗng `''` — so `===` trực tiếp sẽ coi là "đã đổi" và ghi đè lại GẦN NHƯ
    // TOÀN BỘ sheet ở mỗi lần chạy (đã kiểm chứng qua dữ liệu thật: ~99% dòng
    // bị đánh dấu update sai do đúng lỗi này).
    var customerIsEqualFn = function (a, b) {
      return sameValue(a.author, b.author) && sameValue(a.genre, b.genre) && sameValue(a.publisher, b.publisher)
        && sameValue(a.logoJudgement, b.logoJudgement) && sameValue(a.remark, b.remark) && sameValue(a.copyright, b.copyright);
    };
    var customerDiff = diffUpsert(existingCustomerRows, numberedCustomerRows, customerKeyFn, customerIsEqualFn);
    attachRowOffsets(customerDiff, existingCustomerRows, customerKeyFn);
    Logger.log('顧客作品マスタ 集計: 追加 ' + customerDiff.toAdd.length + ' 件 / 更新 ' + customerDiff.toUpdate.length
      + ' 件 / 変化なし ' + customerDiff.unchangedKeys.length + ' 件（既存 ' + existingCustomerRows.length + ' 件）');

    // ---- Bước 6-7: コピーライトマスタ (key theo タイトルNo, dùng lại số vừa gán ở trên) ----
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
      return sameValue(a.copyrightCurrent, b.copyrightCurrent) && sameValue(a.author, b.author) && sameValue(a.publisher, b.publisher);
    };
    var copyrightDiff = diffUpsert(existingCopyrightRows, newCopyrightRows, copyrightKeyFn, copyrightIsEqualFn);
    attachRowOffsets(copyrightDiff, existingCopyrightRows, copyrightKeyFn);
    Logger.log('コピーライトマスタ 集計: 追加 ' + copyrightDiff.toAdd.length + ' 件 / 更新 ' + copyrightDiff.toUpdate.length
      + ' 件 / 変化なし ' + copyrightDiff.unchangedKeys.length + ' 件（既存 ' + existingCopyrightRows.length + ' 件）');
    if (irregularTitles.length > 0) {
      Logger.log('個別対応（コピーライト特定不可）: ' + irregularTitles.length + ' 件 -> ' + irregularTitles.join(' / '));
    }

    // ---- Bước 5b/7b: ghi thật lên 2 sheet output ----
    writeCustomerWorkMaster(customerDiff);
    writeCopyrightMaster(copyrightDiff);
    Logger.log('顧客作品マスタ・コピーライトマスタへの書き込み完了');

    // ---- Bước 8: log audit chi tiết (backup từng field đã đổi, để tra
    // ngược lại nếu sau này phát hiện giá trị nào đó bị sai — xem
    // io/logSheet.js). CHỈ ghi field mà GAS❶ đang thực sự theo dõi (KHÔNG
    // gồm ①広告出稿ポリシー/②一般面出稿NG — 2 cột đó ngoài phạm vi 顧客作品
    // マスタ hiện tại).
    var runAt = new Date();
    var customerChangeRows = buildChangeDetailRows('顧客作品マスタ', customerDiff.toUpdate, [
      { key: 'author', label: '作家名' },
      { key: 'genre', label: 'ジャンル' },
      { key: 'publisher', label: '出版社' },
      { key: 'logoJudgement', label: '③シーモアロゴ判定' },
      { key: 'remark', label: '備考' },
      { key: 'copyright', label: 'コピーライト' },
    ], runAt);
    var copyrightChangeRows = buildChangeDetailRows('コピーライトマスタ', copyrightDiff.toUpdate, [
      { key: 'copyrightCurrent', label: '正規コピーライト' },
    ], runAt);
    var allChangeRows = customerChangeRows.concat(copyrightChangeRows);
    appendChangeDetailRows(allChangeRows);
    Logger.log('GAS1変更詳細 記録: ' + allChangeRows.length + ' フィールド分');

    // ---- Bước 9-10: Slack (nếu có cá biệt) + log tổng hợp (luôn luôn) ----
    if (irregularTitles.length > 0) {
      notifySlack('GAS❶: ' + irregularTitles.length + '件のタイトルが個別対応(コピーライト特定不可)になりました:\n' + irregularTitles.join('\n'));
    }

    var finishedAt = new Date();
    appendLogEntry({
      startedAt: startedAt,
      finishedAt: finishedAt,
      addedCount: customerDiff.toAdd.length,
      updatedCount: customerDiff.toUpdate.length,
      irregularTitles: irregularTitles,
      errors: errors,
    });
    Logger.log('GAS❶ 完了: ' + finishedAt.toISOString() + '（所要 ' + Math.round((finishedAt - startedAt) / 1000) + '秒）');
  } catch (error) {
    // Lỗi giữa chừng: log + báo Slack, rồi re-throw để Apps Script/trigger
    // hiển thị đúng lần chạy này là THẤT BẠI, không âm thầm coi là thành công.
    Logger.log('GAS❶ エラーで中断: ' + String(error));
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

/**
 * Cài đặt (hoặc CÀI LẠI) time-based trigger để runGas1() tự chạy 9h và 18h
 * (Asia/Tokyo) mỗi ngày. CHỈ CẦN CHẠY HÀM NÀY 1 LẦN THỦ CÔNG (chọn trong
 * dropdown Apps Script editor > Run) để kích hoạt lịch tự động — không phải
 * chạy mỗi ngày.
 *
 * An toàn khi chạy lại nhiều lần: luôn XOÁ hết trigger cũ đang trỏ tới
 * runGas1 trước khi tạo trigger mới, nên không bao giờ bị nhân đôi trigger
 * (vd chạy hàm này 2 lần sẽ vẫn chỉ có đúng 2 trigger — 9h và 18h — không phải 4).
 *
 * @returns {void}
 */
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
// Các hàm "probe" để chạy thử TỪNG BƯỚC riêng lẻ trong Apps Script
// editor (chọn tên hàm trong dropdown > Run > xem Logger log, hoặc
// View > Logs / Ctrl+Enter). Hữu ích khi debug: chạy lần lượt probe_readXxx()
// để biết bước đọc/parse nào đang lỗi hoặc trả dữ liệu không như mong đợi,
// TRƯỚC KHI chạy toàn bộ runGas1() (vốn ghi thật lên sheet). Có thể xoá các
// hàm probe_* này bất cứ lúc nào mà không ảnh hưởng tới runGas1()/createGas1Trigger().
// ============================================================

/** Chạy thử: đọc + lọc 作品レギュレーション判定, in ra 3 dòng đầu để kiểm tra. */
function probe_readRegulation() {
  var raw = readSheetValues(CONFIG.SOURCES.REGULATION.spreadsheetId, CONFIG.SOURCES.REGULATION.sheetName);
  var records = parseRegulationRows(raw);
  Logger.log('Tổng số dòng 判定済み: ' + records.length);
  Logger.log(JSON.stringify(records.slice(0, 3), null, 2));
}

/** Chạy thử: đọc 先行タイトル情報(CMS), in ra 3 dòng đầu để kiểm tra. */
function probe_readCms() {
  var raw = readSheetValues(CONFIG.SOURCES.CMS.spreadsheetId, CONFIG.SOURCES.CMS.sheetName);
  var records = parseCmsRows(raw);
  Logger.log('Tổng số dòng CMS: ' + records.length);
  Logger.log(JSON.stringify(records.slice(0, 3), null, 2));
}

/** Chạy thử: đọc 外部出稿用NGタイトル, in ra 3 dòng đầu để kiểm tra. */
function probe_readNgTitles() {
  var raw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.NG_TITLES);
  var records = parseNgTitles(raw);
  Logger.log('Tổng số dòng NG title: ' + records.length);
  Logger.log(JSON.stringify(records.slice(0, 3), null, 2));
}

/** Chạy thử: đọc 基本のC表記, kiểm tra 1 label mẫu ("A-KAGURA") có tra đúng rule không. */
function probe_readBasicNotation() {
  var raw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.BASIC_NOTATION);
  var map = parseBasicNotation(raw);
  Logger.log('Tổng số label 基本のC表記: ' + map.size);
  Logger.log('A-KAGURA -> ' + map.get('A-KAGURA'));
}

/** Chạy thử: đọc cả 5 sheet quy tắc riêng NXB, in ra số dòng đọc được mỗi sheet. */
function probe_readPublisherSheets() {
  PUBLISHER_SHEET_PARSERS.forEach(function (entry) {
    var raw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, entry.sheetName);
    var map = entry.parse(raw);
    Logger.log(entry.key + ' (' + entry.sheetName + '): ' + map.size + ' entries');
  });
}

/** Chạy thử: đọc dữ liệu ĐANG có trên 顧客作品マスタ, in ra 3 dòng đầu. */
function probe_readCustomerMaster() {
  Logger.log(JSON.stringify(readCustomerWorkMaster().slice(0, 3), null, 2));
}

/** Chạy thử: đọc dữ liệu ĐANG có trên コピーライトマスタ, in ra 3 dòng đầu. */
function probe_readCopyrightMaster() {
  Logger.log(JSON.stringify(readCopyrightMaster().slice(0, 3), null, 2));
}

/**
 * Chạy thử logic 4 tầng resolveCopyright() với 1 tác phẩm GIẢ ĐỊNH (sửa
 * trực tiếp object `work` bên trong hàm này để test với dữ liệu tác phẩm
 * thật mà bạn nghi ngờ đang bị resolve sai tầng).
 */
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

/** Chạy thử notifySlack() khi CHƯA cấu hình Script Properties — phải thấy log "bỏ qua Slack", không được lỗi. */
function probe_notifySlackNoop() {
  notifySlack('test message, không nên thực sự gửi nếu chưa cấu hình Script Properties');
}

/** Chạy thử appendLogEntry() — kiểm tra tab GAS1ログ được tạo/ghi đúng. */
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

/** Chạy thử appendChangeDetailRows() — kiểm tra tab GAS1変更詳細 được tạo/ghi đúng. */
function probe_appendChangeDetailRows() {
  appendChangeDetailRows([
    {
      runAt: new Date(),
      master: '顧客作品マスタ',
      titleNo: 9999,
      titleName: 'probe run タイトル',
      field: '③シーモアロゴ判定',
      oldValue: 'ロゴなし',
      newValue: 'ロゴあり',
    },
  ]);
}

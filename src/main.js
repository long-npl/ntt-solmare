// main.js — điều phối GAS❶: đọc nguồn -> LỌC theo レギュレーション -> build
// 顧客作品マスタ -> tính bản quyền 4 tầng -> build コピーライトマスタ -> ghi upsert
// cả 2 -> log + cảnh báo -> Slack khi có tác phẩm cá biệt hoặc lỗi.
//
// Đây là file "nhạc trưởng" — TỰ NÓ không chứa logic nghiệp vụ (parse/tính
// toán), chỉ gọi đúng thứ tự các hàm từ sources.js, master.js, copyright.js, io.js.
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
 * "cầu nối" giữa common.js/master.js (thuần, không biết gì về vị trí dòng trên
 * sheet) và io.js (cần biết CHÍNH XÁC dòng nào để ghi đè). diffUpsert()
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
 * Hàm chính của GAS❶ — được gọi bởi trigger tự động (9h/17h, xem
 * createGas1Trigger() bên dưới) hoặc chạy tay trong Apps Script editor.
 *
 * THỨ TỰ CÁC BƯỚC (quan trọng, không được đảo lộn — spec §8):
 *
 *  1. Đọc thô + parse các nguồn (io.js: readSheetValues + sources.js), kèm
 *     nguồn 掲載停止日付 là 1 file TSV trên Drive (io.js).
 *  2. buildRegulationLookup(): Map normalize(タイトル名) -> phán định, chỉ dòng
 *     ステータス=判定済み, tên trùng thì dòng NG thắng.
 *  3. buildCustomerWorkRows(): gắn 3 cột phán định + cờ judged/isNg cho TỪNG tác
 *     phẩm CMS (chưa lọc gì).
 *  4. readCustomerWorkMaster(): PHẢI đọc TRƯỚC bước 5, vì rule 2 (spec §3.4) cần
 *     biết "tác phẩm này đã có trên master chưa".
 *  5. filterAndMatchWorks(): lọc theo rule 1 + rule 2 VÀ gán dòng master (cascade
 *     3 tầng + chiếm-một-lần) trong CÙNG MỘT LƯỢT. Đây là bước quyết định tác phẩm
 *     nào tồn tại trong lần chạy này.
 *  6. resolveCopyright() + tra 掲載停止日付 cho TỪNG tác phẩm được giữ — chỉ tác
 *     phẩm được giữ, không tính cho tác phẩm bị loại (vô nghĩa và tốn thời gian).
 *  7. resolveNumbersFromMatches(): cấp/dùng lại タイトルNo. PHẢI sau bước 5 (tác
 *     phẩm bị loại không được chiếm số) và TRƯỚC bước 9 (コピーライトマスタ dùng
 *     chung タイトルNo, nó không có cột タイトルID riêng).
 *  8. diffUpsertFromMatches() -> writeCustomerWorkMaster().
 *  9. Build コピーライトマスタ từ CHÍNH danh sách đã lọc ở bước 5: với mỗi work đã có
 *     タイトルNo, tra bản ghi đang có (theo タイトルNo) rồi gọi shiftCopyrightHistory()
 *     (copyright.js) để quyết định giá trị mới + lịch sử 過去.
 * 10. buildChangeDetailRows() cho CẢ 2 master -> appendChangeDetailRows() ghi audit
 *     log field-by-field vào tab "GAS1変更詳細".
 * 11. 5 loại cảnh báo (master.js) -> appendWarningRows() ghi vào tab
 *     "GAS1警告" (spec §6).
 * 12. notifySlack() nếu có tác phẩm tầng 4, rồi appendLogEntry() ghi log tổng hợp
 *     (luôn chạy, kể cả khi lỗi — xem khối catch).
 *
 * LƯU Ý LẦN CHẠY ĐẦU TIÊN (spec §10b): bước 4 đọc về mảng rỗng, nên MỌI tác phẩm
 * đều rơi vào nhánh "chưa có trong master" — rule 2 không bảo vệ ai và toàn bộ 595
 * tác phẩm NG bị loại thẳng, kể cả những cái đang tồn tại ở sheet 顧客作品マスタ_元.
 * Rule 2 chỉ có tác dụng TỪ LẦN CHẠY THỨ HAI. コピーライトマスタ cũng phải được xoá
 * sạch trước lần chạy đầu, vì タイトルNo được cấp lại từ 1 và số cũ sẽ trỏ sai tác phẩm.
 *
 *
 * NGOẠI LỆ DUY NHẤT: bước đọc nguồn 掲載停止日付 (file TSV trên Drive) có try/catch
 * RIÊNG và KHÔNG làm cả lần chạy thất bại — cột I là dữ liệu phụ, ghi-một-lần, nên
 * "không có dữ liệu mới" là vô hại; để việc chưa cấp quyền Drive hay CONFIG chưa
 * điền tên cột chặn toàn bộ cập nhật master là đánh đổi sai. Lỗi đó vẫn hiện ra ở
 * Logger.log + tab GAS1警告 + cột 掲載停止注意件数 của GAS1ログ.
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
    // ---- Bước 1: đọc thô + parse các nguồn ----
    var regulationRaw = readSheetValues(CONFIG.SOURCES.REGULATION.spreadsheetId, CONFIG.SOURCES.REGULATION.sheetName);
    var cmsRaw = readSheetValues(CONFIG.SOURCES.CMS.spreadsheetId, CONFIG.SOURCES.CMS.sheetName);
    var ngTitleRaw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.NG_TITLES);
    var basicNotationRaw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.BASIC_NOTATION);

    var regulationRecords = parseRegulationRows(regulationRaw);
    var regulationLookup = buildRegulationLookup(regulationRecords);
    Logger.log('作品レギュレーション判定: ' + regulationRecords.length + ' 件（判定済み）読み込み完了、'
      + 'タイトル名ユニーク ' + regulationLookup.size + ' 件');

    var cmsRecords = parseCmsRows(cmsRaw);
    // cmsRaw.length - 1 = tổng số dòng data thô (trừ header). Số dòng KHÔNG được đưa
    // vào cmsRecords là dòng タイトル名 trống hoặc dòng trống cuối sheet — CỐ TÌNH
    // log để dòng bị loại không biến mất trong im lặng (đã gặp trường hợp thật: file
    // nguồn lệch cột ở hàng loạt dòng).
    var cmsSkippedCount = (cmsRaw.length - 1) - cmsRecords.length;
    // Dòng có タイトル名 nhưng KHÔNG có CMSID: trên dữ liệu 2026-08-04 có 29 dòng như
    // vậy, và cả 29 đều là DÒNG LỆCH CỘT (ô タイトルID chứa chuỗi copyright, ô
    // タイトル名 chứa あらすじ). Bộ lọc CMSID cũ vô tình chặn được chúng; bộ lọc theo
    // タイトル名 (spec §5.5) thì không. Hiện cả 29 dòng đều 未判定 nên không vào
    // master, nhưng phải log RIÊNG để chúng không lẫn im lặng vào 除外_未判定件数.
    var cmsNoIdCount = cmsRecords.filter(function (record) {
      return String(record.cmsId === null || record.cmsId === undefined ? '' : record.cmsId).trim() === '';
    }).length;
    Logger.log('先行タイトル情報(CMS): ' + cmsRecords.length + ' 件読み込み完了（タイトル名欠落等でスキップ: '
      + cmsSkippedCount + ' 件、CMSID なしの行: ' + cmsNoIdCount + ' 件＝列ずれの可能性）');

    var ngTitleRecords = parseNgTitles(ngTitleRaw);
    var ngTitleLookup = buildNgTitleLookup(ngTitleRecords);
    Logger.log('外部出稿用NGタイトル: ' + ngTitleRecords.length + ' 件読み込み完了');

    var basicNotationMap = parseBasicNotation(basicNotationRaw);
    Logger.log('基本のC表記: ' + basicNotationMap.size + ' レーベル読み込み完了');

    // Đọc + parse cả 5 sheet quy tắc riêng NXB (LINE/スクエニ/リブレ/オーバー
    // ラップ/ヒーローズ) theo registry — thêm NXB mới chỉ cần sửa
    // PUBLISHER_SHEET_PARSERS ở copyright.js, không cần sửa dòng nào ở đây.
    var publisherMaps = {};
    PUBLISHER_SHEET_PARSERS.forEach(function (entry) {
      var rawRows = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, entry.sheetName);
      publisherMaps[entry.key] = entry.parse(rawRows);
      Logger.log(entry.key + ' (' + entry.sheetName + '): ' + publisherMaps[entry.key].size + ' 件読み込み完了');
    });

    // ---- Nguồn cột I 掲載停止日付 (ghi một lần, join theo タイトルID) ----
    // Không tìm thấy file thì KHÔNG throw: cột I là cột ghi-một-lần nên "không có
    // dữ liệu mới" là trạng thái vô hại (giá trị đang có được giữ nguyên). Chỉ cảnh
    // báo, để việc nguồn ngừng xuất file không im lặng mãi.
    // CỐ TÌNH BỌC try/catch CHỈ QUANH KHỐI NÀY (khác với mọi bước khác của
    // runGas1(), vốn để lỗi lan ra ngoài và làm cả lần chạy thất bại).
    //
    // Lý do: cột I là cột GHI MỘT LẦN và là dữ liệu phụ — "không có dữ liệu mới"
    // là trạng thái vô hại vì giá trị đang có được giữ nguyên. Trong khi đó nguồn
    // này có 3 kiểu lỗi hoàn toàn nằm ngoài tầm kiểm soát của 1.730 dòng master:
    // chưa cấp quyền Drive (scope OAuth đổi vì DriveApp là API mới dùng), 2 tên
    // cột trong CONFIG.SOURCES.SUSPENSION chưa được điền, hoặc folder bị đổi
    // quyền truy cập. Để 1 trong 3 thứ đó chặn toàn bộ việc cập nhật master là
    // đánh đổi sai hoàn toàn.
    //
    // KHÔNG phải nuốt lỗi: lỗi được ghi vào Logger.log VÀ vào tab GAS1警告 dưới
    // dạng 掲載停止注意, nên nó hiện ra ở cột 掲載停止注意件数 của GAS1ログ. Chỉ
    // KHÔNG đưa vào `errors` — vì cột đó nghĩa là "lần chạy này thất bại", mà
    // lần chạy vẫn thành công với 20/21 cột.
    var suspensionFileName = null;
    var suspensionLookup = new Map();
    var suspensionError = null;
    try {
      var suspensionFound = findLatestSuspensionFile(CONFIG.SOURCES.SUSPENSION, startedAt);
      if (suspensionFound === null) {
        Logger.log('掲載停止日付: フォルダに ' + CONFIG.SOURCES.SUSPENSION.filePattern
          + ' に一致するファイルがありません -> I列は据え置き');
      } else {
        suspensionFileName = suspensionFound.file.getName();
        var suspensionRaw = readTsvRows(suspensionFound.file, CONFIG.SOURCES.SUSPENSION.encoding);
        suspensionLookup = buildSuspensionLookup(parseSuspensionRows(suspensionRaw,
          CONFIG.SOURCES.SUSPENSION.titleIdColumn, CONFIG.SOURCES.SUSPENSION.suspensionDateColumn));
        Logger.log('掲載停止日付: ' + suspensionFileName + ' から ' + suspensionLookup.size + ' 件読み込み完了');
      }
    } catch (suspensionFailure) {
      suspensionError = String(suspensionFailure);
      suspensionFileName = null;
      suspensionLookup = new Map();
      Logger.log('掲載停止日付: 読み込み失敗 -> I列は据え置きのまま処理を継続します。' + suspensionError);
    }

    // ---- Bước 3-5: gắn phán định -> đọc master -> LỌC + khớp dòng ----
    var existingCustomerRows = readCustomerWorkMaster();
    var builtCustomerRows = buildCustomerWorkRows(cmsRecords, regulationLookup);

    // BỘ LỌC + KHỚP DÒNG trong CÙNG MỘT LƯỢT (master.js). Đây là
    // thay đổi lớn nhất của bản 2026-08-03: trước đây MỌI tác phẩm CMS đều vào
    // master; nay chỉ tác phẩm có dòng レギュレーション 判定済み và không NG được vào
    // (rule 1), cộng với tác phẩm ĐÃ CÓ trên master thì luôn được giữ (rule 2).
    //
    // KHOÁ UPSERT giờ là cascade 3 tầng bên trong hàm này (không còn keyFn theo
    // CMSID): tầng 1 ID+tên, tầng 2 ID số, tầng 3 tên — xem common.js/master.js.
    var filtered = filterAndMatchWorks(builtCustomerRows, existingCustomerRows);
    Logger.log('レギュレーションフィルタ: 対象 ' + filtered.matches.length + ' 件 / 除外(NG) '
      + filtered.excludedNg.length + ' 件 / 除外(未判定) ' + filtered.excludedUnjudged.length
      + ' 件（CMS 全 ' + builtCustomerRows.length + ' 件、既存マスタ ' + existingCustomerRows.length + ' 行）');

    // ---- Bước 6: bản quyền + 掲載停止日付, CHỈ cho tác phẩm được giữ ----
    // Tính cho tác phẩm bị loại là vô nghĩa (chúng không có dòng nào trên master)
    // và tốn thời gian thực thi — 3.948 tác phẩm bị loại trên dữ liệu hôm nay.
    filtered.matches.forEach(function (match) {
      var work = match.record;
      var resolved = resolveCopyright(work, PUBLISHER_SHEET_PARSERS, publisherMaps, basicNotationMap);
      work.copyright = resolved.value;
      work.copyrightTier = resolved.tier;
      if (resolved.tier === 4) irregularTitles.push(work.titleId + ' ' + work.titleName);
      work.suspensionDate = lookupSuspensionDate(work, suspensionLookup);
    });

    // ---- Bước 7-8: cấp số + diff + ghi ----
    var numberedMatches = resolveNumbersFromMatches(filtered.matches, existingCustomerRows, 'titleNo');
    var numberedCustomerRows = numberedMatches.map(function (match) { return match.record; });

    // isEqualFn quyết định "coi là không đổi" -> KHÔNG ghi lại dòng đó.
    //
    // PHẢI có titleId và titleName: chúng là 2 trường của khoá cascade, và 110 dòng
    // khớp ở tầng 2/3 (mô phỏng spec §5.4 lần 3) khớp được CHÍNH VÌ một trong hai
    // vừa đổi giá trị. Nếu không so 2 trường này thì những dòng đó bị coi là "không
    // đổi", giá trị mới không bao giờ được ghi, và tầng 2/3 phải chạy lại mỗi ngày
    // mãi mãi.
    //
    // 2 field ngày dùng sameDateValue() (không phải sameValue()): String(Date) chứa
    // cả giờ + timezone nên 2 spreadsheet khác timezone sẽ churn vĩnh viễn — xem
    // JSDoc của sameDateValue trong common.js/master.js.
    //
    // Cột I 掲載停止日付 dùng sameWriteOnceValue(): ô đã có giá trị thì LUÔN coi là
    // không đổi (ghi một lần, không ghi đè). CHÚ Ý thứ tự tham số — a là existing,
    // b là incoming; đảo 2 vế sẽ cho hành vi ngược lại.
    //
    // Các field còn lại dùng sameValue() thay vì '===': giá trị vừa build có thể là
    // undefined trong khi giá trị đọc lại từ sheet cho cùng "không có gì" đó là
    // chuỗi rỗng — so '===' trực tiếp từng gây update sai ~99% số dòng.
    var customerIsEqualFn = function (a, b) {
      return sameValue(a.cmsId, b.cmsId)
        && sameValue(a.titleId, b.titleId)
        && sameValue(a.titleName, b.titleName)
        && sameValue(a.author, b.author)
        && sameValue(a.genre, b.genre)
        && sameValue(a.publisher, b.publisher)
        && sameValue(a.label, b.label)
        && sameValue(a.policy, b.policy)
        && sameValue(a.general, b.general)
        && sameValue(a.logoJudgement, b.logoJudgement)
        && sameDateValue(a.preStart, b.preStart)
        && sameDateValue(a.preEnd, b.preEnd)
        && sameWriteOnceValue(a.suspensionDate, b.suspensionDate);
    };
    var customerDiff = diffUpsertFromMatches(numberedMatches, customerIsEqualFn);
    Logger.log('顧客作品マスタ 集計: 追加 ' + customerDiff.toAdd.length + ' 件 / 更新 ' + customerDiff.toUpdate.length
      + ' 件 / 変化なし ' + customerDiff.unchangedKeys.length + ' 件 / 孤立行 ' + filtered.orphanOffsets.length + ' 行');

    // ---- Bước 9: コピーライトマスタ (key theo タイトルNo, dùng lại số vừa gán ở trên) ----
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

    // ---- Bước 8b/9b: ghi thật lên 2 sheet output ----
    writeCustomerWorkMaster(customerDiff);
    writeCopyrightMaster(copyrightDiff);
    Logger.log('顧客作品マスタ・コピーライトマスタへの書き込み完了');

    // ---- Bước 10: log audit chi tiết (backup từng field đã đổi, để tra ngược
    // lại nếu sau này phát hiện giá trị nào đó bị sai — xem io.js).
    //
    // Danh sách field PHẢI khớp với các cột mà customerRecordToRow() thực sự ghi
    // (io.js): field không có cột thì log ra chỉ gây nhiễu. Cột 備考 và
    // コピーライト đã bị bỏ khỏi ガワ mới nên bị xoá khỏi đây; 3 cột phán định
    // ①/②/③ được thêm vào vì giờ chúng là dữ liệu GAS ghi.
    var runAt = new Date();
    var customerChangeRows = buildChangeDetailRows('顧客作品マスタ', customerDiff.toUpdate, [
      { key: 'titleId', label: 'タイトルID' },
      { key: 'titleName', label: 'タイトル名' },
      { key: 'cmsId', label: 'CMS ID' },
      { key: 'author', label: '作家名' },
      { key: 'genre', label: 'ジャンル' },
      { key: 'publisher', label: '出版社' },
      { key: 'label', label: 'レーベル名' },
      { key: 'preStart', label: '先行開始日', compare: sameDateValue },
      { key: 'preEnd', label: '先行終了日', compare: sameDateValue },
      { key: 'policy', label: '①広告出稿ポリシー' },
      { key: 'general', label: '②一般面出稿NG' },
      { key: 'logoJudgement', label: '③シーモアロゴ判定' },
      { key: 'suspensionDate', label: '掲載停止日付', compare: sameWriteOnceValue },
    ], runAt);
    var copyrightChangeRows = buildChangeDetailRows('コピーライトマスタ', copyrightDiff.toUpdate, [
      { key: 'copyrightCurrent', label: '正規コピーライト' },
    ], runAt);
    var allChangeRows = customerChangeRows.concat(copyrightChangeRows);
    appendChangeDetailRows(allChangeRows);
    Logger.log('GAS1変更詳細 記録: ' + allChangeRows.length + ' フィールド分');

    // ---- Bước 11: 5 loại cảnh báo (spec §6) ----
    // Gộp cả 5 loại rồi ghi 1 lần, để mỗi lần chạy là 1 khối dòng liền nhau trên
    // GAS1警告 — dễ đọc theo thời điểm chạy.
    var warningRows = buildMatchWarningRows(numberedMatches, runAt)
      .concat(buildOrphanWarningRows(existingCustomerRows, filtered.orphanOffsets, runAt))
      .concat(buildNgTitleWarningRows(numberedCustomerRows, ngTitleLookup, runAt))
      .concat(buildSuspensionWarningRows(numberedCustomerRows, suspensionLookup, suspensionFileName, runAt, suspensionError));
    appendWarningRows(warningRows);
    var warningCounts = { match: 0, ambiguous: 0, orphan: 0, ngTitle: 0, suspension: 0 };
    warningRows.forEach(function (row) {
      if (row.kind === WARNING_KIND_MATCH) warningCounts.match += 1;
      else if (row.kind === WARNING_KIND_AMBIGUOUS) warningCounts.ambiguous += 1;
      else if (row.kind === WARNING_KIND_ORPHAN) warningCounts.orphan += 1;
      else if (row.kind === WARNING_KIND_NG_TITLE) warningCounts.ngTitle += 1;
      else if (row.kind === WARNING_KIND_SUSPENSION) warningCounts.suspension += 1;
    });
    Logger.log('GAS1警告 記録: ' + warningRows.length + ' 件（照合注意 ' + warningCounts.match
      + ' / 照合曖昧 ' + warningCounts.ambiguous + ' / 孤立行 ' + warningCounts.orphan
      + ' / 外部出稿NG注意 ' + warningCounts.ngTitle + ' / 掲載停止注意 ' + warningCounts.suspension + '）');

    // ---- Bước 12: Slack (nếu có cá biệt) + log tổng hợp (luôn luôn) ----
    if (irregularTitles.length > 0) {
      notifySlack('GAS❶: ' + irregularTitles.length + '件のタイトルが個別対応(コピーライト特定不可)になりました:\n' + irregularTitles.join('\n'));
    }

    var finishedAt = new Date();
    appendLogEntry({
      startedAt: startedAt,
      finishedAt: finishedAt,
      addedCount: customerDiff.toAdd.length,
      updatedCount: customerDiff.toUpdate.length,
      excludedNgCount: filtered.excludedNg.length,
      excludedUnjudgedCount: filtered.excludedUnjudged.length,
      matchNoticeCount: warningCounts.match,
      matchAmbiguousCount: warningCounts.ambiguous,
      orphanCount: warningCounts.orphan,
      ngTitleNoticeCount: warningCounts.ngTitle,
      suspensionNoticeCount: warningCounts.suspension,
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
 * Cài đặt (hoặc CÀI LẠI) time-based trigger để runGas1() tự chạy 9h và 17h
 * (Asia/Tokyo) mỗi ngày. CHỈ CẦN CHẠY HÀM NÀY 1 LẦN THỦ CÔNG (chọn trong
 * dropdown Apps Script editor > Run) để kích hoạt lịch tự động — không phải
 * chạy mỗi ngày.
 *
 * An toàn khi chạy lại nhiều lần: luôn XOÁ hết trigger cũ đang trỏ tới
 * runGas1 trước khi tạo trigger mới, nên không bao giờ bị nhân đôi trigger
 * (vd chạy hàm này 2 lần sẽ vẫn chỉ có đúng 2 trigger — 9h và 17h — không phải 4).
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

/** Chạy thử: đọc + lọc 作品レギュレーション判定, in ra 3 dòng đầu + số dòng NG. */
function probe_readRegulation() {
  var raw = readSheetValues(CONFIG.SOURCES.REGULATION.spreadsheetId, CONFIG.SOURCES.REGULATION.sheetName);
  var records = parseRegulationRows(raw);
  var lookup = buildRegulationLookup(records);
  var ngCount = 0;
  lookup.forEach(function (value) { if (value.isNg) ngCount += 1; });
  Logger.log('判定済み: ' + records.length + ' 件 / タイトル名ユニーク: ' + lookup.size
    + ' 件 / うち NG 判定: ' + ngCount + ' 件');
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
  // Sửa các giá trị bên dưới để thử với 1 tác phẩm cụ thể.
  // copyrightU chính là TẦNG 1 — để '' nếu muốn thử các tầng dưới, hoặc điền giá
  // trị thật của cột コピーライト (CMS) để xác nhận tầng 1 hoạt động.
  var work = { titleId: 111111, titleName: 'サンプルタイトル', author: 'サンプル作家',
    publisher: 'アルファポリス', copyrightU: '' };

  var basicNotationRaw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.BASIC_NOTATION);
  var basicNotationMap = parseBasicNotation(basicNotationRaw);

  var publisherMaps = {};
  PUBLISHER_SHEET_PARSERS.forEach(function (entry) {
    var rawRows = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, entry.sheetName);
    publisherMaps[entry.key] = entry.parse(rawRows);
  });

  var result = resolveCopyright(work, PUBLISHER_SHEET_PARSERS, publisherMaps, basicNotationMap);
  Logger.log(JSON.stringify(result));
}

/**
 * Chạy thử CHỈ ĐỌC: xác nhận GAS❶ dò đúng hàng header của ガワ mới 顧客作品マスタ và
 * thấy đủ các cột bắt buộc. CHẠY HÀM NÀY TRƯỚC khi chạy runGas1() lần đầu sau khi
 * đổi ガワ — nó không ghi gì, chỉ đọc.
 *
 * Kỳ vọng với ガワ 2026-08-03: 'ヘッダー行: 15 行目 / 列数: 21'.
 * Nếu throw 'Không tìm thấy dòng header chứa đủ các cột' -> sheet live CHƯA được
 * cập nhật sang ガワ mới; đừng sửa CUSTOMER_REQUIRED_HEADERS cho khớp sheet cũ.
 */
function probe_readCustomerMasterHeader() {
  var cfg = CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER;
  var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName, CUSTOMER_REQUIRED_HEADERS);
  Logger.log('ヘッダー行: ' + (resolved.headerRowIndex + 1) + ' 行目 / 列数: ' + resolved.columnCount
    + ' / データ行: ' + Math.max(resolved.values.length - resolved.headerRowIndex - 1, 0) + ' 行');
  var names = [];
  resolved.headerIndex.forEach(function (index, name) { names.push(index + ':' + name); });
  names.sort(function (a, b) { return Number(a.split(':')[0]) - Number(b.split(':')[0]); });
  Logger.log(names.join('\n'));
}

/**
 * Chạy thử CHỈ ĐỌC toàn bộ luồng lọc + khớp dòng, KHÔNG ghi gì lên sheet nào.
 *
 * Đây là hàm cần chạy trước lần runGas1() đầu tiên: nó in ra đúng những con số mà
 * spec §12 đã đo (đối tượng vào master / bị loại NG / bị loại 未判定) để đối chiếu,
 * cộng thêm phân bố tầng khớp và số ca nhập nhằng — nhìn là biết ngay lần chạy thật
 * sẽ làm gì.
 *
 * Kỳ vọng khi master còn trống (dữ liệu 2026-08-04):
 *   CMS 全: 5678 / 対象: 1730（新規 1730）/ 除外: NG 595、未判定 3353
 */
function probe_dryRunFilter() {
  var regulationRaw = readSheetValues(CONFIG.SOURCES.REGULATION.spreadsheetId, CONFIG.SOURCES.REGULATION.sheetName);
  var cmsRaw = readSheetValues(CONFIG.SOURCES.CMS.spreadsheetId, CONFIG.SOURCES.CMS.sheetName);

  var regulationLookup = buildRegulationLookup(parseRegulationRows(regulationRaw));
  var works = buildCustomerWorkRows(parseCmsRows(cmsRaw), regulationLookup);
  var existingRows = readCustomerWorkMaster();
  var filtered = filterAndMatchWorks(works, existingRows);

  var tiers = [0, 0, 0, 0];
  var ambiguous = 0;
  filtered.matches.forEach(function (match) {
    tiers[match.tier] += 1;
    if (match.ambiguous) ambiguous += 1;
  });

  Logger.log('CMS 全: ' + works.length + ' 件 / 既存マスタ: ' + existingRows.length + ' 行');
  Logger.log('対象: ' + filtered.matches.length + ' 件（新規 ' + tiers[0] + ' / 第1層 ' + tiers[1]
    + ' / 第2層 ' + tiers[2] + ' / 第3層 ' + tiers[3] + '）');
  Logger.log('除外: NG ' + filtered.excludedNg.length + ' 件、未判定 ' + filtered.excludedUnjudged.length + ' 件');
  Logger.log('照合曖昧: ' + ambiguous + ' 件 / 孤立行: ' + filtered.orphanOffsets.length + ' 行');
  Logger.log('除外(NG) の先頭5件: ' + filtered.excludedNg.slice(0, 5).map(function (w) {
    return w.titleName + '【' + w.policy + '/' + w.general + '】';
  }).join(' | '));
}

/**
 * Chạy thử CHỈ ĐỌC: tìm file multi_title_yyyyMMdd.tsv mới nhất và in ra 3 dòng đầu
 * theo CẢ 2 encoding, để xác nhận 3 giá trị CONFIG.SOURCES.SUSPENSION
 * (encoding / titleIdHeader / suspensionDateHeader) trước lần chạy thật.
 *
 * Dùng khi cần kiểm lại 2 thứ: (1) encoding nào cho ra tiếng Nhật đọc được, và
 * (2) cột A/D có đúng là タイトルID/掲載停止日付 hay nguồn đã dịch cột.
 *
 * Lần đầu chạy, Google sẽ hỏi cấp quyền Drive (Review permissions -> Allow) vì đây
 * là hàm đầu tiên trong project dùng DriveApp.
 */
function probe_dumpSuspensionTsv() {
  var config = CONFIG.SOURCES.SUSPENSION;
  var found = findLatestSuspensionFile(config, new Date());
  if (found === null) {
    Logger.log('Không tìm thấy file nào khớp ' + config.filePattern + ' trong folder ' + config.folderId);
    return;
  }
  Logger.log('File: ' + found.file.getName() + ' (' + found.dateKey + '), '
    + found.file.getSize() + ' bytes, updated ' + found.file.getLastUpdated());

  ['UTF-8', 'Shift_JIS'].forEach(function (encoding) {
    Logger.log('===== ' + encoding + ' =====');
    try {
      var rows = readTsvRows(found.file, encoding);
      Logger.log('Số dòng: ' + rows.length + ' / số cột dòng đầu: ' + rows[0].length);
      rows.slice(0, 3).forEach(function (row, i) {
        Logger.log('[' + i + '] ' + row.map(function (cell, c) { return c + ':' + cell; }).join(' | '));
      });
    } catch (error) {
      Logger.log('Lỗi đọc với ' + encoding + ': ' + String(error));
    }
  });
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

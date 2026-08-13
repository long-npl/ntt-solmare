// main.js — điều phối GAS❶: đọc nguồn -> LỌC theo レギュレーション -> build
// 顧客作品マスタ -> sinh 2 cột bản quyền -> build コピーライトマスタ -> ghi upsert
// cả 2 -> log + cảnh báo -> Slack khi có tác phẩm cá biệt hoặc lỗi.
//
// Đây là file "nhạc trưởng" — TỰ NÓ không chứa logic nghiệp vụ (parse/tính
// toán), chỉ gọi đúng thứ tự các hàm từ sources.js, master.js, copyright.js, io.js.
// Muốn hiểu 1 bước cụ thể làm gì, xem JSDoc ở file tương ứng; muốn hiểu THỨ
// TỰ và LÝ DO các bước nối với nhau, đọc comment trong runGas1() bên dưới.
//
// Xem thêm sơ đồ luồng tổng thể: docs/gas1-van-hanh.md

// buildRowOffsetIndex() và attachRowOffsets() ĐÃ BỊ XOÁ (2026-08-04).
//
// Chúng tồn tại để đổi "index trong mảng existingRecords" thành "số dòng trên
// sheet" bằng công thức rowOffset + 2 — công thức ngầm giả định header ở hàng 1 VÀ
// không có dòng trống xen giữa. Cả 2 giả định đều sai với ガワ mới (header hàng 15).
// Nay readCustomerWorkMaster()/readCopyrightMaster() gắn thẳng `sheetRow` (số dòng
// thật) vào từng record, và diffUpsert()/diffUpsertFromMatches() chuyển nó sang
// item toUpdate — không còn phép quy đổi nào để mà sai.

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
 *  6. resolvePublisherCopyright() + tra 掲載停止日付 cho TỪNG tác phẩm được giữ — chỉ tác
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
 * 11. 6 loại cảnh báo (master.js) -> appendWarningRows() ghi vào tab
 *     "GAS1警告" (spec §6).
 * 12. notifySlack() nếu có tác phẩm không có bản quyền nào, rồi appendLogEntry()
 *     ghi log tổng hợp
 *     (luôn chạy, kể cả khi lỗi — xem khối catch).
 *
 * LƯU Ý LẦN CHẠY ĐẦU TIÊN (spec §10b): bước 4 đọc về mảng rỗng, nên MỌI tác phẩm
 * đều rơi vào nhánh "chưa có trong master" — rule 2 không bảo vệ ai và toàn bộ 595
 * tác phẩm NG bị loại thẳng, kể cả những cái đang tồn tại ở sheet 顧客作品マスタ_元.
 * Rule 2 chỉ có tác dụng TỪ LẦN CHẠY THỨ HAI. コピーライトマスタ cũng phải được xoá
 * sạch trước lần chạy đầu, vì タイトルNo được cấp lại từ 1 và số cũ sẽ trỏ sai tác phẩm.
 *
 *
 * HAI NGOẠI LỆ: bước đọc nguồn 掲載停止日付 (file TSV trên Drive) và bước đọc
 * 出版社別コピーライトマスタ đều có try/catch RIÊNG và KHÔNG làm cả lần chạy thất bại.
 * Cả 2 là nguồn PHỤ, cấp đúng 1 cột: để việc chưa cấp quyền Drive / chưa có
 * spreadsheetId chặn toàn bộ việc cập nhật 20 cột còn lại của 1.730 dòng là đánh
 * đổi sai. Lỗi vẫn hiện ra ở Logger.log + tab GAS1警告 + cột số đếm của GAS1ログ.
 *
 * Khác nhau ở cách xử lý khi thiếu dữ liệu: cột I 掲載停止日付 là GHI MỘT LẦN nên
 * "không có dữ liệu mới" tự nhiên là vô hại; còn cột K 出版社コピーライト được TÍNH
 * LẠI mỗi lần chạy, nên phải chủ động GIỮ NGUYÊN giá trị đang có — coi nó là rỗng
 * sẽ xoá sạch bản quyền đã sinh của 1.303 tác phẩm.
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

    // ---- Nguồn quy tắc sinh 出版社コピーライト (cột K của コピーライトマスタ) ----
    // CỐ TÌNH bọc try/catch, giống nguồn 掲載停止日付: đây là nguồn PHỤ. Không đọc
    // được nó (chưa có spreadsheetId, mất quyền, sheet bị đổi tên) thì cột K không
    // được cập nhật — nhưng 20 cột còn lại của 2 master vẫn phải được cập nhật.
    //
    // QUAN TRỌNG — khi không đọc được thì cột K được GIỮ NGUYÊN giá trị đang có,
    // KHÔNG bị coi là rỗng. Khác cột 掲載停止日付 (ghi-một-lần), cột K được tính lại
    // MỖI LẦN CHẠY, nên nếu coi "không đọc được" = "rỗng" thì một lần sheet quy tắc
    // tạm không truy cập được sẽ XOÁ SẠCH bản quyền đã sinh của 1.303 tác phẩm.
    var publisherCopyrightLookup = new Map();
    var publisherCopyrightError = null;
    try {
      var publisherCopyrightRaw = readSheetValues(CONFIG.SOURCES.PUBLISHER_COPYRIGHT.spreadsheetId,
        CONFIG.SOURCES.PUBLISHER_COPYRIGHT.sheetName);
      var publisherCopyrightRules = parsePublisherCopyrightRules(publisherCopyrightRaw);
      publisherCopyrightLookup = buildPublisherCopyrightLookup(publisherCopyrightRules);
      var manualRuleCount = publisherCopyrightRules.filter(function (rule) {
        return normalizeJapaneseText(rule.flag).indexOf('01') !== 0;
      }).length;
      Logger.log('出版社別コピーライトマスタ: ' + publisherCopyrightRules.length + ' ルール読み込み完了（'
        + publisherCopyrightLookup.size + ' キー、うち自動化対象外 ' + manualRuleCount + ' 件）');
    } catch (publisherCopyrightFailure) {
      publisherCopyrightError = String(publisherCopyrightFailure);
      Logger.log('出版社別コピーライトマスタ: 読み込み失敗 -> K列は据え置きのまま処理を継続します。'
        + publisherCopyrightError);
    }

    // ---- Nguồn cột R 先行終了日（延長）→ suy ra cột S （最終確定）----
    // Cùng khuôn với 出版社別コピーライトマスタ ở trên và vì cùng một lý do: nguồn PHỤ,
    // đọc không được thì 2 cột đó GIỮ NGUYÊN và lần chạy vẫn tiếp tục. Bắt buộc phải
    // "giữ nguyên" chứ không phải "coi như rỗng" — cột R là cột GAS ghi đè hoàn toàn,
    // nên coi như rỗng sẽ xoá sạch ngày gia hạn của 532 tác phẩm chỉ vì một lần nguồn
    // tạm không truy cập được.
    var preEndExtensionLookup = new Map();
    var preEndExtensionError = null;
    try {
      var preEndExtensionRaw = readSheetValues(CONFIG.SOURCES.PRE_END_EXTENSION.spreadsheetId,
        CONFIG.SOURCES.PRE_END_EXTENSION.sheetName);
      var preEndExtensionRecords = parsePreEndExtensionRows(preEndExtensionRaw);
      preEndExtensionLookup = buildPreEndExtensionLookup(preEndExtensionRecords);
      Logger.log('【先行作品】独占期間の延長: ' + preEndExtensionRecords.length + ' 行読み込み完了（'
        + preEndExtensionLookup.size + ' 件が期日あり → R列の対象）');
    } catch (preEndExtensionFailure) {
      preEndExtensionError = String(preEndExtensionFailure);
      preEndExtensionLookup = new Map();
      Logger.log('【先行作品】独占期間の延長: 読み込み失敗 -> R列・S列は据え置きのまま処理を継続します。'
        + preEndExtensionError);
    }

    // ---- Nguồn cột T/U 大量無料開始日・終了日 ----
    // spreadsheetId CHƯA ĐƯỢC CẤP (2026-08-07) nên nhánh "chưa cấu hình" là nhánh
    // đang chạy thật, không phải nhánh phòng xa. Nó được xử lý GIỐNG HỆT lỗi đọc:
    // T/U giữ nguyên + 1 dòng vào GAS1警告. Điền spreadsheetId trong config.js là đủ
    // để kích hoạt, không phải sửa gì ở đây.
    var massFreeLookup = new Map();
    var massFreeError = null;
    if (normalizeJapaneseText(CONFIG.SOURCES.MASS_FREE.spreadsheetId) === '') {
      massFreeError = 'CONFIG.SOURCES.MASS_FREE.spreadsheetId が未設定です（ID を入れれば自動で有効化されます）';
      Logger.log('大量無料希望作品リスト_CA様: ' + massFreeError + ' -> T列・U列は据え置き');
    } else {
      try {
        var massFreeRaw = readSheetValues(CONFIG.SOURCES.MASS_FREE.spreadsheetId,
          CONFIG.SOURCES.MASS_FREE.sheetName);
        var massFreeRecords = parseMassFreeRows(massFreeRaw);
        massFreeLookup = buildMassFreeLookup(massFreeRecords);
        Logger.log('大量無料希望作品リスト_CA様: ' + massFreeRecords.length + ' 行読み込み完了（'
          + massFreeLookup.size + ' タイトルID → T/U列の対象）');
      } catch (massFreeFailure) {
        massFreeError = String(massFreeFailure);
        massFreeLookup = new Map();
        Logger.log('大量無料希望作品リスト_CA様: 読み込み失敗 -> T列・U列は据え置きのまま処理を継続します。'
          + massFreeError);
      }
    }

    // ---- Nguồn cột E タイトル区分 (コミット / 独占) ----
    // spreadsheetId CHƯA ĐƯỢC CẤP (2026-08-13) — cùng khuôn "nguồn PHỤ chưa cấu hình"
    // với 大量無料 ở trên: E giữ nguyên + 1 dòng vào GAS1警告, điền ID vào config.js là
    // đủ để kích hoạt.
    //
    // Phải "giữ nguyên" chứ không phải "coi như rỗng" vì cùng lý do với cột R: E là
    // cột GAS ghi đè hoàn toàn, coi như rỗng sẽ xoá sạch 区分 của mọi dòng master chỉ
    // vì một lần nguồn không đọc được.
    var commitFlagLookup = new Map();
    var commitManagementError = null;
    if (normalizeJapaneseText(CONFIG.SOURCES.COMMIT_MANAGEMENT.spreadsheetId) === '') {
      commitManagementError = 'CONFIG.SOURCES.COMMIT_MANAGEMENT.spreadsheetId が未設定です（ID を入れれば自動で有効化されます）';
      Logger.log('出稿コミット管理表: ' + commitManagementError + ' -> E列は据え置き');
    } else {
      try {
        var commitManagementRaw = readSheetValues(CONFIG.SOURCES.COMMIT_MANAGEMENT.spreadsheetId,
          CONFIG.SOURCES.COMMIT_MANAGEMENT.sheetName);
        var commitManagementRecords = parseCommitManagementRows(commitManagementRaw);
        commitFlagLookup = buildCommitFlagLookup(commitManagementRecords);
        var committedNameCount = 0;
        commitFlagLookup.forEach(function (entry) { if (entry.committed) committedNameCount += 1; });
        Logger.log('出稿コミット管理表: ' + commitManagementRecords.length + ' 行読み込み完了（タイトル名ユニーク '
          + commitFlagLookup.size + ' 件、うちコミットフラグ ' + committedNameCount + ' 件 → E列「コミット」の対象）');
      } catch (commitManagementFailure) {
        commitManagementError = String(commitManagementFailure);
        commitFlagLookup = new Map();
        Logger.log('出稿コミット管理表: 読み込み失敗 -> E列は据え置きのまま処理を継続します。'
          + commitManagementError);
      }
    }

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
    // 2 cột bản quyền của コピーライトマスタ, tính ĐỘC LẬP với nhau (ガワ mới bỏ cột
    // 正規コピーライト, xem copyright.js):
    //   individualCopyright = cột コピーライト của CMS, nguyên văn  -> cột J
    //   publisherCopyright  = GAS sinh từ 出版社別コピーライトマスタ  -> cột K
    var copyrightWarnings = [];
    filtered.matches.forEach(function (match) {
      var work = match.record;
      work.individualCopyright = work.copyrightU;

      if (publisherCopyrightError !== null) {
        // Không có nguồn quy tắc: đánh dấu để bước build コピーライトマスタ giữ nguyên
        // giá trị cột K đang có trên sheet. Cũng không kết luận "cá biệt" được, vì
        // chưa biết cột K đang có gì.
        work.publisherCopyrightSkipped = true;
      } else {
        var resolved = resolvePublisherCopyright(work, publisherCopyrightLookup);
        work.publisherCopyright = resolved.value === null ? '' : resolved.value;
        if (resolved.reason !== COPYRIGHT_REASON_OK) {
          copyrightWarnings.push({
            record: work,
            copyrightReason: resolved.reason,
            copyrightDetail: resolved.detail,
          });
        }
        // 個別対応 = KHÔNG có bản quyền nào dùng được (cả 2 cột trống). Tác phẩm có
        // cột J thì vẫn dùng được dù cột K trống, nên không tính là cá biệt — nhưng
        // vẫn có dòng cảnh báo ở trên, vì quy tắc NXB đó đang thiếu và tác phẩm sau
        // của cùng NXB cũng sẽ không sinh được.
        if (normalizeJapaneseText(effectiveCopyright(work)) === '') {
          irregularTitles.push(work.titleId + ' ' + work.titleName + '【' + resolved.reason + '】');
        }
      }

      work.suspensionDate = lookupSuspensionDate(work, suspensionLookup);

      // ---- Cột R 先行終了日（延長）+ cột S 先行終了日（最終確定）----
      // Nguồn lỗi -> gán lại CHÍNH giá trị đang có trên sheet (match.existing), thay vì
      // đặt cờ "bỏ qua" rồi phải kiểm cờ đó ở cả customerIsEqualFn lẫn
      // customerRecordToRow. Record khi đó mô tả đúng những gì sheet đang có, nên diff
      // tự kết luận "không đổi" và không dòng nào bị ghi lại — cùng cách xử lý mà cột K
      // của コピーライトマスタ đang dùng. Dòng MỚI (match.existing === null) nhận '' vì
      // không có gì để giữ.
      //
      // S vẫn được TÍNH LẠI trong cả 2 nhánh (không phải copy từ sheet): công thức của
      // nó là R || Q, và Q có thể vừa đổi hôm nay dù nguồn R không đọc được. Tính lại
      // từ R-đang-giữ-nguyên + Q-mới cho ra giá trị đúng ở cả 2 trường hợp.
      if (preEndExtensionError !== null) {
        work.preEndExtended = match.existing ? match.existing.preEndExtended : '';
      } else {
        work.preEndExtended = lookupPreEndExtension(work, preEndExtensionLookup);
      }
      work.preEndFinal = resolvePreEndFinal(work.preEnd, work.preEndExtended);

      // ---- Cột T/U 大量無料開始日・終了日 ---- (cùng cơ chế giữ nguyên như trên)
      if (massFreeError !== null) {
        work.massFreeStart = match.existing ? match.existing.massFreeStart : '';
        work.massFreeEnd = match.existing ? match.existing.massFreeEnd : '';
      } else {
        var massFreePeriod = lookupMassFreePeriod(work, massFreeLookup);
        work.massFreeStart = massFreePeriod.start;
        work.massFreeEnd = massFreePeriod.end;
      }

      // ---- Cột E タイトル区分 ---- (cùng cơ chế giữ nguyên như trên)
      if (commitManagementError !== null) {
        work.titleCategory = match.existing ? match.existing.titleCategory : '';
      } else {
        work.titleCategory = lookupTitleCategory(work, commitFlagLookup);
      }

      // ---- Cột J LP制作 ----
      // KHÔNG có nhánh "nguồn lỗi" vì cột này không phụ thuộc nguồn ngoài nào: nó chỉ
      // đọc work.genre (CMS) và work.logoJudgement (レギュレーション), cả 2 đều là nguồn
      // BẮT BUỘC — không đọc được thì cả lần chạy đã dừng từ Bước 1.
      //
      // Trả về '' nghĩa là chưa phán định được; io.js giữ nguyên ô thay vì xoá, và
      // buildLpProductionWarningRows() ghi 1 dòng cảnh báo cho từng tác phẩm như vậy.
      work.lpProduction = resolveLpProduction(work);
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
        && sameWriteOnceValue(a.suspensionDate, b.suspensionDate)
        // 4 cột R/S/T/U đều là NGÀY -> sameDateValue(), không phải sameValue(): giá trị
        // ghi ra là Date thật, và String(Date) mang cả giờ + timezone nên so bằng chuỗi
        // sẽ churn vĩnh viễn (lý do đầy đủ trong JSDoc sameDateValue ở common.js).
        // KHÔNG dùng sameWriteOnceValue() như cột I: 4 cột này được tính lại mỗi lần
        // chạy và PHẢI ghi đè được, kể cả ghi rỗng khi tác phẩm bị rút khỏi nguồn.
        && sameDateValue(a.preEndExtended, b.preEndExtended)
        && sameDateValue(a.preEndFinal, b.preEndFinal)
        && sameDateValue(a.massFreeStart, b.massFreeStart)
        && sameDateValue(a.massFreeEnd, b.massFreeEnd)
        // Cột E: chuỗi thuần, ghi đè bình thường -> sameValue().
        && sameValue(a.titleCategory, b.titleCategory)
        // Cột J: sameKeepWhenBlankValue() — incoming rỗng (未判定) coi là "không đổi"
        // để ô không bị xoá. PHẢI khớp với điều kiện ghi trong customerRecordToRow():
        // nếu ở đây dùng sameValue() thì dòng chỉ khác mỗi J-rỗng sẽ bị đánh dấu
        // "cần update" mỗi lần chạy rồi ghi ra đúng giá trị cũ — churn vĩnh viễn.
        // CHÚ Ý THỨ TỰ: a là existing, b là incoming (xem JSDoc trong common.js).
        && sameKeepWhenBlankValue(a.lpProduction, b.lpProduction);
    };
    var customerDiff = diffUpsertFromMatches(numberedMatches, customerIsEqualFn);
    Logger.log('顧客作品マスタ 集計: 追加 ' + customerDiff.toAdd.length + ' 件 / 更新 ' + customerDiff.toUpdate.length
      + ' 件 / 変化なし ' + customerDiff.unchangedKeys.length + ' 件 / 孤立行 ' + filtered.orphanOffsets.length + ' 行');

    // ---- Bước 9: コピーライトマスタ (key theo タイトルNo, dùng lại số vừa gán ở trên) ----
    // Master này KHÔNG có cột タイトルID riêng làm khoá được (2 tác phẩm có thể dùng
    // chung タイトルID) nên nó dùng chung タイトルNo với 顧客作品マスタ — đó là lý do
    // resolveNumbersFromMatches() phải chạy xong TRƯỚC khối này.
    var copyrightKeyFn = function (r) { return String(r.titleNo); };
    var existingCopyrightRows = readCopyrightMaster();
    var existingCopyrightByTitleNo = new Map();
    existingCopyrightRows.forEach(function (r) {
      existingCopyrightByTitleNo.set(copyrightKeyFn(r), r);
    });

    var newCopyrightRows = numberedCustomerRows.map(function (work) {
      var prior = existingCopyrightByTitleNo.get(String(work.titleNo)) || null;
      // Không đọc được nguồn quy tắc -> giữ nguyên cột K đang có trên sheet (dòng
      // mới thì để trống), thay vì xoá bản quyền đã sinh trước đó.
      if (work.publisherCopyrightSkipped) {
        work.publisherCopyright = prior === null ? '' : prior.publisherCopyright;
      }
      var nextEffective = effectiveCopyright(work);
      var priorEffective = prior === null ? '' : effectiveCopyright(prior);
      var shifted = shiftCopyrightHistory(prior, priorEffective, nextEffective, CONFIG.COPYRIGHT_HISTORY_SLOTS);

      // 8 cột định danh đầu (B~I) lấy từ chính danh sách đã lọc của 顧客作品マスタ,
      // đúng theo ghi chú ô B9 của ガワ: `①顧客作品マスタ＞B~I列`.
      return {
        titleNo: work.titleNo,
        cmsId: work.cmsId,
        titleId: work.titleId,
        titleName: work.titleName,
        author: work.author,
        genre: work.genre,
        publisher: work.publisher,
        label: work.label,
        individualCopyright: work.individualCopyright,
        publisherCopyright: work.publisherCopyright,
        copyrightHistory: shifted.copyrightHistory,
      };
    });

    // So đủ cả 2 cột bản quyền + 4 cột định danh có thể đổi. KHÔNG so
    // copyrightHistory: nó là hệ quả của việc bản quyền đổi, không phải nguyên
    // nhân — so nó sẽ tạo vòng "đổi lịch sử -> ghi -> đọc lại -> thấy đổi".
    var copyrightIsEqualFn = function (a, b) {
      return sameValue(a.individualCopyright, b.individualCopyright)
        && sameValue(a.publisherCopyright, b.publisherCopyright)
        && sameValue(a.titleId, b.titleId)
        && sameValue(a.titleName, b.titleName)
        && sameValue(a.author, b.author)
        && sameValue(a.genre, b.genre)
        && sameValue(a.publisher, b.publisher)
        && sameValue(a.label, b.label);
    };
    var copyrightDiff = diffUpsert(existingCopyrightRows, newCopyrightRows, copyrightKeyFn, copyrightIsEqualFn);
    Logger.log('コピーライトマスタ 集計: 追加 ' + copyrightDiff.toAdd.length + ' 件 / 更新 ' + copyrightDiff.toUpdate.length
      + ' 件 / 変化なし ' + copyrightDiff.unchangedKeys.length + ' 件（既存 ' + existingCopyrightRows.length + ' 件）');
    if (publisherCopyrightError === null) {
      Logger.log('出版社コピーライト: 生成できず ' + copyrightWarnings.length + ' 件（内訳は GAS1警告 の コピーライト注意）');
    } else {
      Logger.log('出版社コピーライト: 今回は生成せず（K列据え置き）。原因は GAS1警告 の コピーライト注意 を参照');
    }
    if (irregularTitles.length > 0) {
      Logger.log('個別対応（コピーライト無し）: ' + irregularTitles.length + ' 件 -> ' + irregularTitles.slice(0, 20).join(' / ')
        + (irregularTitles.length > 20 ? ' ...' : ''));
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
      { key: 'preEndExtended', label: '先行終了日（延長）', compare: sameDateValue },
      { key: 'preEndFinal', label: '先行終了日（最終確定）', compare: sameDateValue },
      { key: 'massFreeStart', label: '大量無料開始日', compare: sameDateValue },
      { key: 'massFreeEnd', label: '大量無料終了日', compare: sameDateValue },
      { key: 'titleCategory', label: 'タイトル区分' },
      // compare PHẢI trùng với customerIsEqualFn ở trên: dùng sameValue() ở đây sẽ log
      // "必要 -> (trống)" cho mọi tác phẩm 未判定, trong khi ô thật không hề bị đổi.
      { key: 'lpProduction', label: 'LP制作', compare: sameKeepWhenBlankValue },
    ], runAt);
    var copyrightChangeRows = buildChangeDetailRows('コピーライトマスタ', copyrightDiff.toUpdate, [
      { key: 'individualCopyright', label: 'タイトル個別コピーライト' },
      { key: 'publisherCopyright', label: '出版社コピーライト' },
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
      .concat(buildSuspensionWarningRows(numberedCustomerRows, suspensionLookup, suspensionFileName, runAt, suspensionError))
      .concat(buildCopyrightWarningRows(copyrightWarnings, runAt, publisherCopyrightError))
      .concat(buildPreEndExtensionWarningRows(numberedCustomerRows, preEndExtensionLookup, runAt, preEndExtensionError))
      .concat(buildMassFreeWarningRows(numberedCustomerRows, massFreeLookup, runAt, massFreeError))
      .concat(buildTitleCategoryWarningRows(numberedCustomerRows, commitFlagLookup, runAt, commitManagementError))
      .concat(buildLpProductionWarningRows(numberedCustomerRows, runAt));
    appendWarningRows(warningRows);
    var warningCounts = {
      match: 0, ambiguous: 0, orphan: 0, ngTitle: 0, suspension: 0, copyright: 0,
      preEndExtension: 0, massFree: 0, titleCategory: 0, lpProduction: 0,
    };
    warningRows.forEach(function (row) {
      if (row.kind === WARNING_KIND_MATCH) warningCounts.match += 1;
      else if (row.kind === WARNING_KIND_AMBIGUOUS) warningCounts.ambiguous += 1;
      else if (row.kind === WARNING_KIND_ORPHAN) warningCounts.orphan += 1;
      else if (row.kind === WARNING_KIND_NG_TITLE) warningCounts.ngTitle += 1;
      else if (row.kind === WARNING_KIND_SUSPENSION) warningCounts.suspension += 1;
      else if (row.kind === WARNING_KIND_COPYRIGHT) warningCounts.copyright += 1;
      else if (row.kind === WARNING_KIND_PRE_END_EXTENSION) warningCounts.preEndExtension += 1;
      else if (row.kind === WARNING_KIND_MASS_FREE) warningCounts.massFree += 1;
      else if (row.kind === WARNING_KIND_TITLE_CATEGORY) warningCounts.titleCategory += 1;
      else if (row.kind === WARNING_KIND_LP_PRODUCTION) warningCounts.lpProduction += 1;
    });
    Logger.log('GAS1警告 記録: ' + warningRows.length + ' 件（照合注意 ' + warningCounts.match
      + ' / 照合曖昧 ' + warningCounts.ambiguous + ' / 孤立行 ' + warningCounts.orphan
      + ' / 外部出稿NG注意 ' + warningCounts.ngTitle + ' / 掲載停止注意 ' + warningCounts.suspension
      + ' / 先行延長注意 ' + warningCounts.preEndExtension
      + ' / 大量無料注意 ' + warningCounts.massFree
      + ' / タイトル区分注意 ' + warningCounts.titleCategory
      + ' / LP制作注意 ' + warningCounts.lpProduction + '）');

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
      copyrightNoticeCount: warningCounts.copyright,
      preEndExtensionNoticeCount: warningCounts.preEndExtension,
      massFreeNoticeCount: warningCounts.massFree,
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

/**
 * Chạy thử: đọc 出稿コミット管理表, in ra phân bố các giá trị C列 + số tên mang cờ コミット.
 *
 * Phân bố C列 là thứ đáng nhìn nhất: nó cho thấy ngay 「4.既存作品（出稿コミット）」 (và
 * mọi cách viết mới mà 安蒜 thêm vào) đang có bao nhiêu dòng KHÔNG được tính là コミット —
 * xem quyết định 2 ở đầu NGUỒN 7 trong sources.js.
 */
function probe_readCommitManagement() {
  var cfg = CONFIG.SOURCES.COMMIT_MANAGEMENT;
  if (normalizeJapaneseText(cfg.spreadsheetId) === '') {
    Logger.log('CONFIG.SOURCES.COMMIT_MANAGEMENT.spreadsheetId が未設定です。');
    return;
  }
  var raw = readSheetValues(cfg.spreadsheetId, cfg.sheetName);
  var records = parseCommitManagementRows(raw);
  var lookup = buildCommitFlagLookup(records);

  var byCategory = {};
  records.forEach(function (r) {
    var key = normalizeJapaneseText(r.titleCategory) || '(空欄)';
    byCategory[key] = (byCategory[key] || 0) + 1;
  });
  var committedNames = 0;
  var multiCategoryNames = 0;
  lookup.forEach(function (entry) {
    if (entry.committed) committedNames += 1;
    if (entry.rowCount >= 2 && entry.categories.length >= 2) multiCategoryNames += 1;
  });

  Logger.log(records.length + ' 行 / タイトル名ユニーク ' + lookup.size + ' 件');
  Logger.log('コミットフラグ対象（E列「コミット」）: ' + committedNames + ' 件');
  Logger.log('同名で区分が複数ある タイトル名: ' + multiCategoryNames + ' 件（GAS1警告 の タイトル区分注意）');
  Logger.log('C列 タイトル区分 の内訳: ' + JSON.stringify(byCategory, null, 2));
  Logger.log('コミット判定に使う値: ' + JSON.stringify(COMMIT_FLAG_VALUES));
}

/** Chạy thử: đọc 出版社別コピーライトマスタ, in ra vài quy tắc + số dòng không tự sinh được. */
function probe_readPublisherCopyrightRules() {
  var cfg = CONFIG.SOURCES.PUBLISHER_COPYRIGHT;
  var raw = readSheetValues(cfg.spreadsheetId, cfg.sheetName);
  var rules = parsePublisherCopyrightRules(raw);
  var lookup = buildPublisherCopyrightLookup(rules);
  var manual = rules.filter(function (r) { return normalizeJapaneseText(r.flag).indexOf('01') !== 0; });
  var badTemplate = rules.filter(function (r) {
    return normalizeJapaneseText(r.flag).indexOf('01') === 0 && !looksLikeCopyrightTemplate(r.template);
  });
  Logger.log(rules.length + ' ルール / ' + lookup.size + ' キー（出版社+レーベル 含む）');
  Logger.log('自動化対象外 (02：個別ルール等): ' + manual.length + ' 件');
  Logger.log('テンプレートが著作権表記でない (© なし、指示文の可能性): ' + badTemplate.length + ' 件 -> '
    + badTemplate.slice(0, 10).map(function (r) { return r.publisher + ': ' + r.template; }).join(' | '));
  Logger.log(JSON.stringify(rules.slice(0, 5), null, 2));
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
 * Chạy thử việc sinh 出版社コピーライト cho 1 tác phẩm GIẢ ĐỊNH (sửa trực tiếp object
 * `work` bên dưới để thử với tác phẩm thật mà bạn nghi đang ra bản quyền sai).
 *
 * In ra cả `reason` và `detail`, nên khi cột K trống thì thấy ngay là do NXB chưa
 * có quy tắc, do cờ 02：個別ルール, hay do template không dùng được.
 */
function probe_resolvePublisherCopyrightForOneWork() {
  var work = {
    titleName: 'サンプルタイトル',
    author: 'サンプル作家',
    publisher: '集英社',
    label: '',
    copyrightU: '',
  };

  var cfg = CONFIG.SOURCES.PUBLISHER_COPYRIGHT;
  var lookup = buildPublisherCopyrightLookup(parsePublisherCopyrightRules(readSheetValues(cfg.spreadsheetId, cfg.sheetName)));
  var resolved = resolvePublisherCopyright(work, lookup);
  Logger.log('出版社コピーライト: ' + JSON.stringify({ value: resolved.value, reason: resolved.reason, detail: resolved.detail }, null, 2));
  work.individualCopyright = work.copyrightU;
  work.publisherCopyright = resolved.value === null ? '' : resolved.value;
  Logger.log('有効なコピーライト (J優先, なければK): 「' + effectiveCopyright(work) + '」');
}

/**
 * Chạy thử CHỈ ĐỌC: xem sheet 顧客作品マスタ hiện có layout nào, và GAS❶ có dò được
 * hàng header hay không. CHẠY HÀM NÀY TRƯỚC khi chạy runGas1() lần đầu sau khi đổi
 * ガワ, và chạy lại mỗi khi runGas1() báo 'Không tìm thấy dòng header'.
 *
 * Kỳ vọng với ガワ 2026-08-03: 'ヘッダー行: 15 行目 / 列数: 21'.
 *
 * CỐ TÌNH KHÔNG để hàm này throw khi thiếu cột: nó là công cụ CHẨN ĐOÁN đúng lỗi
 * đó, nên nếu nó chết cùng cách với runGas1() thì vô dụng đúng lúc cần nhất. Thay
 * vào đó, nó tìm hàng GIỐNG header nhất, in ra cột nào có / cột nào thiếu, và in
 * luôn 25 hàng đầu để mắt người đối chiếu.
 */
function probe_readCustomerMasterHeader() {
  var cfg = CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER;
  probeMasterHeader('顧客作品マスタ', cfg, CUSTOMER_REQUIRED_HEADERS);
}

/**
 * Giống probe_readCustomerMasterHeader() nhưng cho コピーライトマスタ (ガワ mới:
 * header hàng 15, cột B→P). Kỳ vọng: 'ヘッダー行: 15 行目 / 列数: 16'.
 */
function probe_readCopyrightMasterHeader() {
  var cfg = CONFIG.OUTPUTS.COPYRIGHT_MASTER;
  var required = COPYRIGHT_REQUIRED_HEADERS.slice();
  for (var h = 1; h <= CONFIG.COPYRIGHT_HISTORY_SLOTS; h++) required.push(copyrightHistoryHeaderName(h));
  probeMasterHeader('コピーライトマスタ', cfg, required);
}

/**
 * Ruột dùng chung của 2 probe header ở trên — 1 chỗ duy nhất để sửa nếu cần đổi
 * cách chẩn đoán.
 *
 * @param {string} label - Tên master, chỉ để in ra log
 * @param {{spreadsheetId: string, sheetName: string}} cfg
 * @param {Array<string>} requiredHeaders
 * @returns {void}
 */
function probeMasterHeader(label, cfg, requiredHeaders) {
  var ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  var sheet = ss.getSheetByName(cfg.sheetName);
  if (!sheet) {
    Logger.log('KHÔNG tìm thấy sheet "' + cfg.sheetName + '" trong spreadsheet ' + cfg.spreadsheetId);
    Logger.log('Các sheet đang có: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(' / '));
    return;
  }
  var values = sheet.getDataRange().getValues();
  Logger.log('[' + label + '] ' + ss.getName() + ' / sheet: ' + cfg.sheetName
    + ' / ' + values.length + ' hàng x ' + sheet.getLastColumn() + ' cột');

  // Tìm hàng chứa NHIỀU cột bắt buộc nhất (không cần đủ) — hàng đó gần như chắc
  // chắn là hàng header thật, kể cả khi sheet đang ở layout cũ.
  var best = { rowIndex: -1, found: [], missing: requiredHeaders };
  for (var i = 0; i < values.length; i++) {
    var normalizedRow = values[i].map(normalizeHeaderText);
    var found = requiredHeaders.filter(function (name) {
      return normalizedRow.indexOf(normalizeHeaderText(name)) !== -1;
    });
    if (found.length > best.found.length) {
      best = {
        rowIndex: i,
        found: found,
        missing: requiredHeaders.filter(function (name) {
          return normalizedRow.indexOf(normalizeHeaderText(name)) === -1;
        }),
      };
    }
  }

  if (best.rowIndex === -1) {
    Logger.log('KHÔNG hàng nào chứa dù chỉ 1 cột bắt buộc — sheet này có đúng là ' + label + ' không?');
  } else if (best.missing.length === 0) {
    Logger.log('OK — ヘッダー行: ' + (best.rowIndex + 1) + ' 行目, đủ ' + best.found.length + '/'
      + requiredHeaders.length + ' cột bắt buộc. runGas1() sẽ đọc/ghi được.');
  } else {
    Logger.log('THIẾU CỘT — hàng giống header nhất là hàng ' + (best.rowIndex + 1) + ', có '
      + best.found.length + '/' + requiredHeaders.length + ' cột bắt buộc.');
    Logger.log('  Thiếu ' + best.missing.length + ' cột: ' + best.missing.join(' , '));
    Logger.log('  -> Sheet đang ở layout CŨ. Phải cập nhật sheet sang ガワ mới, KHÔNG sửa danh'
      + ' sách cột bắt buộc trong code cho khớp layout cũ: làm vậy là để GAS ghi dữ liệu vào cột sai.');
  }

  // In 25 hàng đầu, chỉ ô có giá trị, kèm chữ cái cột — để đối chiếu bằng mắt.
  Logger.log('--- 25 hàng đầu (chỉ ô có giá trị) ---');
  for (var r = 0; r < Math.min(values.length, 25); r++) {
    var cells = [];
    for (var c = 0; c < values[r].length; c++) {
      var value = values[r][c];
      if (value === '' || value === null || value === undefined) continue;
      cells.push(columnIndexToLetter(c) + '=' + String(value).slice(0, 28));
    }
    if (cells.length > 0) Logger.log('hàng ' + (r + 1) + ': ' + cells.join(' | '));
  }
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
 * theo CẢ 2 encoding.
 *
 * Dùng khi cần kiểm lại 2 thứ: (1) encoding nào cho ra tiếng Nhật đọc được, và
 * (2) cột A/D có đúng là タイトルID/掲載停止日付 hay nguồn đã dịch cột — 2 giá trị đó
 * nằm ở CONFIG.SOURCES.SUSPENSION.titleIdColumn / suspensionDateColumn.
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
  Logger.log('CONFIG đang đọc: タイトルID = cột ' + config.titleIdColumn
    + ', 掲載停止日付 = cột ' + config.suspensionDateColumn + ', encoding = ' + config.encoding);

  ['UTF-8', 'Shift_JIS'].forEach(function (encoding) {
    Logger.log('===== ' + encoding + ' =====');
    try {
      var rows = readTsvRows(found.file, encoding);
      Logger.log('Số dòng: ' + rows.length + ' / số cột dòng đầu: ' + rows[0].length);
      rows.slice(0, 3).forEach(function (row, i) {
        var cells = row.map(function (cell, c) { return columnIndexToLetter(c) + '=' + String(cell).slice(0, 24); });
        Logger.log('[' + i + '] ' + cells.join(' | '));
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

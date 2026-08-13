// sources.js — ĐỌC 7 NGUỒN ĐẦU VÀO
//
// Mỗi phần dưới đây parse 1 nguồn thành record/Map để tầng nghiệp vụ dùng. Toàn
// bộ là hàm PURE: nhận vào mảng 2 chiều đã đọc sẵn (io.js đọc), không tự gọi
// SpreadsheetApp — nhờ vậy test được bằng Node (tools/verify/).
//
// 7 nguồn, theo đúng thứ tự quan trọng:
//   1. 作品レギュレーション判定  -> BỘ LỌC + 3 cột phán định ①②③
//   2. 先行タイトル情報(CMS)     -> DANH SÁCH tác phẩm (nguồn nền tảng)
//   3. 外部出稿用NGタイトル      -> nội dung cảnh báo (không còn điền cột nào)
//   4. multi_title_yyyyMMdd.tsv -> 掲載停止日付 (cột I)
//   5. 【先行作品】独占期間の延長  -> 先行終了日（延長）(cột R) + suy ra （最終確定）(cột S)
//   6. 大量無料希望作品リスト_CA様 -> 大量無料開始日・終了日 (cột T/U)
//   7. 出稿コミット管理表         -> タイトル区分 (cột E: コミット / 独占)
//
// Cột J LP制作 KHÔNG có nguồn riêng — nó được suy ra từ ジャンル + ③シーモアロゴ判定
// của chính dòng master, nên hàm tính nằm ở master.js (resolveLpProduction).
//
// Nguồn quy tắc bản quyền (基本のC表記 + 5 sheet NXB riêng) nằm ở copyright.js,
// vì nó chỉ được dùng bởi đúng logic bản quyền.

// ==============================================================================
// NGUỒN 1 — 作品レギュレーション判定 (bộ lọc + cột ①②③)
// ==============================================================================

//
// VAI TRÒ (đã đổi 2026-08-03, xem spec §2): trước đây nguồn này chỉ cấp thêm 1
// cột (③シーモアロゴ判定) cho tác phẩm đã có trong CMS. Bây giờ nó là BỘ LỌC
// quyết định tác phẩm nào ĐƯỢC vào 顧客作品マスタ, đồng thời cấp 3 cột
// ①広告出稿ポリシー / ②一般面出稿NG / ③シーモアロゴ判定.
//
// KHOÁ JOIN với CMS là タイトル名, so 完全一致 (sau chuẩn hoá Unicode) — KHÔNG
// dùng CMSID/タイトルID nữa (spec §4). Vì vậy file này không còn đọc 2 cột ID
// đó, và 3 map tra theo ID (byCmsIdAndTitleId/byCmsId/byTitleId) cùng hàm
// lookupRegulation() đã bị xoá.
//
// HỆ QUẢ ĐÃ BIẾT VÀ ĐƯỢC USER CHẤP NHẬN (spec §4.5): 73 tác phẩm アダルト sẽ
// vào master vì CMS và レギュレーション viết tên khác nhau (vd CMS ghi
// '超肉食系年下男子たちに溺愛されて困っています(フルカラー)' còn レギュレーション ghi
// '超肉食系年下男子たちに溺愛されて困っています'). Tra bằng ID thì ra, tra bằng tên
// thì không. Nếu 営業 phản ánh có tác phẩm アダルト lọt xuống bước sau, ĐÂY là
// chỗ xem lại đầu tiên (spec §4.5 có bảng đối chiếu số liệu).
//
// Đặc điểm riêng của sheet シート1: 3 hàng đầu là ghi chú giải thích, hàng 4 mới
// là header thật — findHeaderRowIndex() (trong common.js) tự dò ra đúng hàng
// này, không cần hardcode số 4.

// CHỈ gồm những tên cột KHỚP TOÀN BỘ và ổn định — 2 cột ①/② có hậu tố ghi chú
// trong chính ô header nên được tra riêng bằng colByPrefix() (xem bên dưới).
var REGULATION_REQUIRED_HEADERS = ['ステータス', 'タイトル名', '③シーモアロゴ判定'];

var REGULATION_STATUS_OK = '判定済み';

// Prefix của 2 cột có ghi chú kèm trong ô header:
//   '①広告出稿ポリシー\n（出稿NG）'
//   '②一般面出稿NG\n（アダルト作品扱い）'
var REGULATION_POLICY_PREFIX = '①広告出稿ポリシー';
var REGULATION_GENERAL_PREFIX = '②一般面出稿NG';

// Định nghĩa NG — nguyên văn yêu cầu nghiệp vụ (spec §3.1/§3.2):
//   ①広告出稿ポリシー「問題あり」or ②一般面出稿NG「アダルト作品扱い」「アダルトジャンル」
//
// CỐ TÌNH KHÔNG có '出稿NG' trong danh sách ② dù nghe như phải chặn: nghiệp vụ
// chỉ định đúng 2 giá trị trên, đã nêu lại với user và user không yêu cầu đổi
// (spec §3.2 — 6 dòng thật đang mang giá trị này). Nếu 営業 phản ánh, đây là chỗ
// sửa đầu tiên.
var REGULATION_NG_POLICY_VALUE = '問題あり';
var REGULATION_NG_GENERAL_VALUES = ['アダルト作品扱い', 'アダルトジャンル'];

/**
 * Đọc + lọc dữ liệu thô của sheet 作品レギュレーション判定.
 *
 * CHỈ lấy dòng có ステータス = "判定済み". Căn cứ là ghi chú của chính sheet
 * nguồn (ô B3): "B列（ステータス）が「判定済み」のもののみ進行可　それ以外は判定中
 * のためお待ちください。" — NỬA SAU của câu mới là điểm quyết định: trạng thái
 * khác 判定済み KHÔNG có nghĩa "không có vấn đề" mà là "đang chấm, hãy chờ". Vì
 * vậy tác phẩm không tra ra dòng 判定済み nào sẽ bị LOẠI khỏi 顧客作品マスタ (xem
 * master.js), khác hẳn hành vi cũ là vẫn ghi vào master với cột
 * phán định để trống — tức âm thầm coi như đã thông qua.
 *
 * Các trạng thái bị bỏ qua trên dữ liệu thật (spec §12): 削除 145,
 * Wチェック完了 16, Wチェック待ち 11, 担当者依頼中 9, 再判定依頼 6, 依頼中 1,
 * trống 10 — tổng 198 dòng trên 5.356.
 *
 * GIÁ TRỊ TRẢ VỀ LÀ NGUYÊN VĂN — không chuẩn hoá gì. Chuẩn hoá chỉ xảy ra khi
 * DỰNG KHOÁ và SO SÁNH (spec §4.4), vì 3 cột này sẽ được ghi thẳng vào cột
 * F/G/H của 顧客作品マスタ.
 *
 * @param {Array<Array<*>>} rawRows - Kết quả sheet.getDataRange().getValues() của sheet シート1
 * @returns {Array<{titleName: string, policy: string, general: string, logoJudgement: string}>}
 */
function parseRegulationRows(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, REGULATION_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colStatus = col(idx, 'ステータス');
  var colTitleName = col(idx, 'タイトル名');
  var colPolicy = colByPrefix(idx, REGULATION_POLICY_PREFIX);
  var colGeneral = colByPrefix(idx, REGULATION_GENERAL_PREFIX);
  var colLogo = col(idx, '③シーモアロゴ判定');

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[colStatus]) !== REGULATION_STATUS_OK) continue;
    records.push({
      titleName: row[colTitleName],
      policy: row[colPolicy],
      general: row[colGeneral],
      logoJudgement: row[colLogo],
    });
  }
  return records;
}

/**
 * Tác phẩm này có bị coi là NG (không được đưa vào 顧客作品マスタ) hay không —
 * spec §3.2:
 *
 *   isNg  <=>  normalize(①広告出稿ポリシー) === '問題あり'
 *          ||  normalize(②一般面出稿NG)   ∈ { 'アダルト作品扱い', 'アダルトジャンル' }
 *
 * Chuẩn hoá qua normalizeJapaneseText() CẢ 2 VẾ (giá trị lẫn hằng số) để không
 * bị trượt vì khoảng trắng full-width hay biến thể Unicode — nhưng KHÔNG dùng
 * giá trị đã chuẩn hoá đó để ghi ra sheet.
 *
 * LƯU Ý về dữ liệu thật (spec §4.5): quy tắc ① hiện KHÔNG loại được dòng nào —
 * レギュレーション có 20 dòng '問題あり' nhưng 19 dòng không tồn tại trong danh
 * sách 先行タイトル của CMS, dòng thứ 20 (ヒグマグマ【単話版】) thì tên không khớp.
 * Toàn bộ 595 ca loại được đều đến từ quy tắc ②. Nghĩa là nhánh ① của hàm này
 * CHƯA được kiểm chứng bằng ca thật nào — chỉ bằng test đơn vị.
 *
 * @param {{policy: *, general: *}} record - 1 phần tử từ parseRegulationRows()
 * @returns {boolean}
 */
function isRegulationNg(record) {
  if (normalizeJapaneseText(record.policy) === normalizeJapaneseText(REGULATION_NG_POLICY_VALUE)) return true;
  var general = normalizeJapaneseText(record.general);
  for (var i = 0; i < REGULATION_NG_GENERAL_VALUES.length; i++) {
    if (general === normalizeJapaneseText(REGULATION_NG_GENERAL_VALUES[i])) return true;
  }
  return false;
}

/**
 * Build bảng tra DUY NHẤT của nguồn này: normalize(タイトル名) -> phán định.
 *
 * Khoá là タイトル名 đã chuẩn hoá, so 完全一致 — không cắt hậu tố 【】/(), không
 * fuzzy, không fallback sang ID (spec §4.1). Lý do bỏ phương án chuẩn hoá mạnh
 * (spec §4.3): phần bị cắt lại mang phán định KHÁC NHAU —
 *   'ひとつ屋根の下、幼馴染はふしだらに。【白抜き修正版】' = 一般面OK
 *   'ひとつ屋根の下、幼馴染はふしだらに。【棒消し修正版】' = アダルトジャンル
 * Cắt 【】 sẽ gộp 2 dòng này thành 1 và làm 179 tác phẩm tra sang phán định của
 * tác phẩm khác.
 *
 * TÊN TRÙNG NHAU -> DÒNG NGHIÊM NGẶT NHẤT THẮNG (có NG thì NG thắng), khác với
 * code cũ là "dòng sau đè dòng trước". Trên dữ liệu hôm nay có 14 tên trùng và
 * 0 ca phán định mâu thuẫn, nên quy tắc này chưa được dùng tới ca thật nào —
 * nhưng nếu ngày mai xuất hiện 2 dòng cùng tên khác phán định, hướng an toàn là
 * chặn, không phải cho qua.
 *
 * @param {Array<object>} records - Kết quả từ parseRegulationRows()
 * @returns {Map<string, {policy: string, general: string, logoJudgement: string, isNg: boolean}>}
 *   Giá trị trong map là NGUYÊN VĂN từ sheet (để ghi ra cột F/G/H), chỉ KHOÁ là
 *   giá trị đã chuẩn hoá.
 */
function buildRegulationLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    var key = normalizeJapaneseText(record.titleName);
    if (!key) return;
    var incoming = {
      policy: record.policy,
      general: record.general,
      logoJudgement: record.logoJudgement,
      isNg: isRegulationNg(record),
    };
    var current = lookup.get(key);
    if (current === undefined || (incoming.isNg && !current.isNg)) lookup.set(key, incoming);
  });
  return lookup;
}

// ==============================================================================
// NGUỒN 2 — 先行タイトル情報(CMS) (danh sách tác phẩm)
// ==============================================================================

//
// Vai trò trong toàn bộ luồng: đây là nguồn NỀN TẢNG (基幹データ) của
// 顧客作品マスタ — mỗi dòng trong sheet ★列追加の場合は増渕まで★ ứng với 1 tác
// phẩm, và buildCustomerWorkRows() (master.js) lặp qua
// TỪNG record ở đây để tạo 1 dòng 顧客作品マスタ tương ứng. Ngoài ra cột
// コピーライト (trước đây gọi là "cột U") là nguồn ưu tiên TẦNG 1 khi xác định
// bản quyền — xem copyright.js.
//
// LƯU Ý QUAN TRỌNG — bộ lọc "dòng có dữ liệu" đổi sang タイトル名 (2026-08-03,
// spec §5.5): trước đây file này bỏ dòng có CMSID rỗng, vì CMSID là khoá upsert
// của 顧客作品マスタ. Nay CMSID KHÔNG còn được dùng trong bất kỳ logic tra
// cứu/khoá nào (vẫn được GHI vào cột C của master để tra ngược khi điều tra sự
// cố), nên lọc theo nó là lọc theo một trường mà hệ thống không còn quan tâm.
// Đổi sang タイトル名 vì đó là trường AN TOÀN NHẤT trong 3 trường: 0 dòng trống
// trong 5.649 dòng CMS thật, so với タイトルID có 104 dòng trống (~6% số dòng vào
// master) và nhiều giá trị dùng ô ID để ghi chú ('ー', '4415行目と同一',
// '※既に配信済みのためCMS削除', '確認中').

var CMS_REQUIRED_HEADERS = [
  'CMSID', 'タイトルID', 'タイトル名', '作家名', 'ジャンル', 'レーベル名',
  '出版社', '先行開始日', '先行終了日', 'コピーライト',
];

/**
 * Đọc dữ liệu thô của sheet 先行タイトル情報(CMS), bỏ qua dòng trống (không có
 * CMSID — thường là các dòng cuối sheet không có dữ liệu).
 *
 * @param {Array<Array<*>>} rawRows - Kết quả sheet.getDataRange().getValues()
 * @returns {Array<{
 *   cmsId: *, titleId: *, titleName: string, author: string, genre: string,
 *   label: string, publisher: string, preStart: Date, preEnd: Date,
 *   copyrightU: string
 * }>} Mảng bản ghi, mỗi phần tử ứng với 1 tác phẩm. copyrightU là giá trị
 *   thô của cột コピーライト — có thể rỗng/null nếu tác phẩm chưa có bản quyền
 *   CMS xác nhận (khi đó copyright.js sẽ rơi xuống tầng ưu tiên thấp hơn).
 */
function parseCmsRows(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, CMS_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colCmsId = col(idx, 'CMSID');
  var colTitleId = col(idx, 'タイトルID');
  var colTitleName = col(idx, 'タイトル名');
  var colAuthor = col(idx, '作家名');
  var colGenre = col(idx, 'ジャンル');
  var colLabel = col(idx, 'レーベル名');
  var colPublisher = col(idx, '出版社');
  var colPreStart = col(idx, '先行開始日');
  var colPreEnd = col(idx, '先行終了日');
  var colCopyright = col(idx, 'コピーライト');

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    // Lọc theo タイトル名 (KHÔNG phải CMSID): xem comment đầu file + spec §5.5.
    // Dùng normalizeJapaneseText() để ô chỉ chứa khoảng trắng (kể cả khoảng
    // trắng full-width '　') cũng được coi là trống.
    if (!row || normalizeJapaneseText(row[colTitleName]) === '') continue;
    records.push({
      cmsId: row[colCmsId],
      titleId: row[colTitleId],
      titleName: row[colTitleName],
      author: row[colAuthor],
      genre: row[colGenre],
      label: row[colLabel],
      publisher: row[colPublisher],
      preStart: row[colPreStart],
      preEnd: row[colPreEnd],
      copyrightU: row[colCopyright],
    });
  }
  return records;
}

// buildCmsCopyrightLookup() ĐÃ BỊ XOÁ (2026-08-03, spec §9.1).
//
// Nó build 1 Map từ chính cmsRecords rồi để bước resolve bản quyền tra lại bằng
// cmsId của một work vốn sinh ra từ đúng cmsRecord đó — một self-join không cần
// thiết. Nay buildCustomerWorkRows() mang thẳng copyrightU vào work và
// main.js copy thẳng work.copyrightU sang cột J của コピーライトマスタ.
//
// Đừng "khôi phục lại nhưng đổi khoá sang タイトル名": làm vậy chỉ mang bài toán
// trùng tên vào chỗ vốn không cần khoá nào cả.

// ==============================================================================
// NGUỒN 3 — 外部出稿用NGタイトル (nguồn cảnh báo)
// ==============================================================================

// (nằm trong file 出版社からの追記ルールと外部出稿NGタイトル)
//
// Vai trò trong toàn bộ luồng: cung cấp ghi chú "cấm xuất bản ngoài" cho từng
// tác phẩm, được buildCustomerWorkRows() (master.js) ghi
// vào cột 備考 của 顧客作品マスタ. LƯU Ý: đây CHỈ là cảnh báo/ghi chú — GAS
// KHÔNG tự động chặn phân phối tác phẩm nào, chỉ phản ánh thông tin để con
// người tự quyết định (đúng theo info.md mô tả ban đầu).
//
// Header ở hàng 2, một số ô header có khoảng trắng full-width ở đầu
// (vd "　出版社") — normalizeHeaderText (trong common.js) tự bỏ, nên tra
// bằng tên gốc không có khoảng trắng vẫn khớp đúng.

var NG_REQUIRED_HEADERS = ['出版社', 'タイトルID', 'タイトル名', '備考'];

/**
 * Đọc dữ liệu thô của sheet 外部出稿用NGタイトル.
 *
 * Giữ lại dòng nếu có ÍT NHẤT MỘT trong 2 giá trị titleId/titleName (một số
 * dòng trong sheet thật chỉ có titleName mà không có titleId — vd dòng ghi
 * chung cho cả 1 nhóm tác phẩm theo điều kiện, không phải 1 ID cụ thể).
 *
 * @param {Array<Array<*>>} rawRows - Kết quả sheet.getDataRange().getValues()
 * @returns {Array<{titleId: *, titleName: string, remark: string}>}
 */
function parseNgTitles(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, NG_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colTitleId = col(idx, 'タイトルID');
  var colTitleName = col(idx, 'タイトル名');
  var colRemark = col(idx, '備考');

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || (!row[colTitleId] && !row[colTitleName])) continue;
    records.push({
      titleId: row[colTitleId],
      titleName: row[colTitleName],
      remark: row[colRemark],
    });
  }
  return records;
}

/**
 * Build bảng tra "khoá tác phẩm" -> nội dung 備考 cảnh báo.
 *
 * Key ưu tiên titleId nếu có (ép String để so khớp nhất quán); nếu dòng đó
 * không có titleId (chỉ có titleName), dùng titleName đã chuẩn hoá qua
 * normalizeJapaneseText() (common.js/master.js) làm key thay thế — nhất quán với
 * cách các lookup theo titleName khác trong codebase xử lý (xem
 * copyright.js). buildCustomerWorkRows() hiện CHỈ tra lookup
 * này bằng titleId (xem comment trong master.js), nên
 * chuẩn hoá key titleName ở đây chưa đổi hành vi hiện tại — chỉ giữ map này
 * nhất quán, sẵn sàng cho khi có logic tra theo tên được thêm vào sau.
 *
 * @param {Array<object>} records - Kết quả từ parseNgTitles()
 * @returns {Map<string, string>} Map key (titleId hoặc titleName) -> remark
 */
function buildNgTitleLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    var key = record.titleId ? String(record.titleId) : normalizeJapaneseText(record.titleName);
    if (!key) return;
    lookup.set(key, record.remark);
  });
  return lookup;
}

// ==============================================================================
// NGUỒN 4 — multi_title_yyyyMMdd.tsv (掲載停止日付)
// ==============================================================================

// 掲載停止日付 (cột I của 顧客作品マスタ).
//
// Hàm PURE — nhận mảng 2 chiều đã đọc sẵn (io/io.js: readTsvRows()).
//
// KHOÁ JOIN LÀ タイトルID (user chốt 2026-08-03), so khớp CHỈ KHI cả hai vế là số
// thật. Vì sao phải chặn (cùng lý do tầng 2 của cascade, spec §5.2): タイトルID
// của CMS có 104 dòng trống và nhiều ô bị dùng để ghi chú ('ー', '4415行目と同一',
// '※既に配信済みのためCMS削除') — không chặn thì các dòng đó khớp lẫn nhau qua khoá
// rỗng/khoá trùng và nhận ngày dừng của nhau.
//
// HAI HỆ QUẢ ĐÃ BIẾT, đều được ghi cảnh báo chứ không im lặng:
//   (a) ~6% dòng master không bao giờ nhận được 掲載停止日付 vì タイトルID
//       trống/không phải số.
//   (b) 2 tác phẩm dùng chung 1 タイトルID (có thật: 冬すぎて桜 và
//       冬すぎて桜【タテヨミ】 cùng 266030) sẽ cùng nhận một ngày dừng.
//
// GIÁ TRỊ NGÀY được giữ NGUYÊN VĂN, không parse thành Date và không format lại
// (spec §4.4): ta không biết chắc định dạng trong TSV, và parse sai một ngày dừng
// phân phối là loại lỗi im lặng tệ nhất. Cột I lại là cột GHI MỘT LẦN nên không
// có nguy cơ churn do lệch định dạng.

/**
 * Parse nội dung TSV thành danh sách bản ghi thô, định vị cột theo CHỮ CÁI CỘT.
 *
 * VÌ SAO KHÔNG TRA THEO TÊN HEADER như mọi nguồn khác trong file này: đã thử và
 * không dùng được. File TSV do hệ thống khác xuất ra, hàng đầu không phải hàng
 * header đáng tin — thứ duy nhất xác định được là vị trí cột (user xác nhận
 * 2026-08-04: cột A = タイトルID, cột D = 掲載停止日付). Với các nguồn là Google
 * Sheet thì tra theo tên vẫn tốt hơn hẳn (bền với việc chèn/xoá/đổi thứ tự cột) —
 * đừng "cho đồng bộ" bằng cách đổi những nguồn kia sang tra theo vị trí.
 *
 * KHÔNG cần biết file có hàng header hay không: nếu có, hàng đó sẽ cho ra record
 * `{titleId: 'TitleID', ...}` và bị buildSuspensionLookup() bỏ đi vì titleId
 * không phải số thật (isDigits). Nghĩa là hàm này an toàn với CẢ 2 dạng file, và
 * không phải đoán xem dòng 0 là header hay dữ liệu.
 *
 * @param {Array<Array<string>>} rawRows - Kết quả io.js: readTsvRows()
 * @param {string} titleIdColumn - Chữ cái cột chứa タイトルID (CONFIG...titleIdColumn, vd 'A')
 * @param {string} suspensionDateColumn - Chữ cái cột chứa ngày dừng (vd 'D')
 * @returns {Array<{titleId: *, suspensionDate: *}>} Mọi dòng của file, KHÔNG lọc —
 *   việc lọc do buildSuspensionLookup() làm
 * @throws {Error} Nếu chữ cái cột trong CONFIG không hợp lệ
 */
function parseSuspensionRows(rawRows, titleIdColumn, suspensionDateColumn) {
  var colTitleId = columnLetterToIndex(titleIdColumn);
  var colDate = columnLetterToIndex(suspensionDateColumn);

  var records = [];
  for (var i = 0; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    records.push({
      titleId: row[colTitleId],
      suspensionDate: row[colDate],
    });
  }
  return records;
}

/**
 * Build bảng tra normalize(タイトルID) -> 掲載停止日付 (nguyên văn).
 *
 * Bỏ qua dòng có タイトルID không phải số thật, và dòng không có ngày dừng (dòng
 * như vậy không mang thông tin gì để ghi).
 *
 * ID trùng nhau -> DÒNG ĐẦU TIÊN THẮNG. Chọn "đầu tiên" thay vì "cuối cùng" để
 * kết quả không đổi khi hệ thống nguồn thêm dòng vào cuối file; nếu về sau phát
 * hiện TSV chứa nhiều dòng cho cùng 1 ID với ngày khác nhau và ngày cuối mới là
 * ngày đúng, đây là chỗ sửa.
 *
 * @param {Array<object>} records - Kết quả parseSuspensionRows()
 * @returns {Map<string, *>}
 */
function buildSuspensionLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    if (!isDigits(record.titleId)) return;
    if (normalizeJapaneseText(record.suspensionDate) === '') return;
    var key = normalizeJapaneseText(record.titleId);
    if (!lookup.has(key)) lookup.set(key, record.suspensionDate);
  });
  return lookup;
}

/**
 * Tra 掲載停止日付 cho 1 tác phẩm theo タイトルID.
 *
 * @param {{titleId: *}} work
 * @param {Map<string, *>} suspensionLookup - Kết quả buildSuspensionLookup()
 * @returns {*} Ngày dừng nguyên văn, hoặc '' nếu không tra ra
 */
function lookupSuspensionDate(work, suspensionLookup) {
  if (!isDigits(work.titleId)) return '';
  var value = suspensionLookup.get(normalizeJapaneseText(work.titleId));
  return value === undefined ? '' : value;
}

// ==============================================================================
// NGUỒN 5 — 【先行作品】独占期間の延長（代理店共有）
//           -> cột R 先行終了日（延長）, và từ đó suy ra cột S 先行終了日（最終確定）
// ==============================================================================

// QUY TẮC NGHIỆP VỤ (user cung cấp 2026-08-07), nguyên văn:
//
//   ▼R列「先行終了日(延長)」: データ取得元のG∼M列に記載のある期日のみを記載
//     ❶ G列1回目に期日記載あり＋H〜Mに記載なし -> G列「1回目」の期日をR列に記載
//     ❷ G列「1回目」に期日記載あり＋H列「2回目」に期日記載あり -> H列「2回目」の期日をR列に記載
//
//   ▼S列「先行終了日(最終確定)」: 顧客作品マスタ_Q列「先行終了日」or R列「先行終了日(延長)」
//
// 2 ví dụ ❶❷ nói cùng một quy tắc: LẦN GIA HẠN CUỐI CÙNG thắng. Đã kiểm trên toàn
// bộ 532 dòng thật (2026-08-07): 7 cột 1回目〜7回目 LUÔN được điền từ trái sang phải
// liền mạch, 0 dòng bị trống ở giữa — nên "lần cuối cùng" = "ô có ngày ở xa nhất về
// bên phải", và không phải xử lý ca "G trống nhưng H có ngày".
//
// KHOÁ JOIN là タイトルID, so khớp CHỈ KHI cả 2 vế là số thật (isDigits) — cùng lý do
// đã ghi ở nguồn 4: タイトルID của CMS có ô trống và ô bị dùng để ghi chú, không chặn
// thì các dòng đó khớp lẫn nhau qua khoá rỗng. Trên nguồn này 532 dòng có タイトルID
// duy nhất, không trùng dòng nào (đã kiểm), nên không cần quy tắc phá vỡ trùng lặp —
// nếu về sau xuất hiện trùng, dòng ĐẦU TIÊN thắng (giống nguồn 4) và có cảnh báo.
//
// 149 ô 'NG' + ~15 ô ghi chú tự do trong dải 1回目〜7回目 bị BỎ QUA, theo đúng chữ
// 「期日のみ」của spec — xem JSDoc của toDateOrNull() trong common.js để biết danh
// sách giá trị thật và 3 quyết định của việc nhận/không nhận một ô là 期日.

var PRE_END_EXTENSION_ID_HEADERS = ['タイトルID', 'タイトル'];

// 2 tên cột đủ để dò ra HÀNG chứa 1回目〜7回目 (hàng 3 trên dữ liệu thật). Chỉ cần 2
// cột đầu là vì hàng đó không có tên cột nào khác trùng với hàng header thật (hàng 1).
var PRE_END_EXTENSION_ROUND_HEADERS = ['1回目', '2回目'];

// Tên cột của MỘT lần gia hạn: '1回目', '2回目', ... Dùng regex thay vì danh sách cố
// định 1〜7 để 8回目 (khi 安蒜 thêm) tự được nhận — xem comment CONFIG.
var PRE_END_EXTENSION_ROUND_PATTERN = /^(\d+)回目$/;

/**
 * Parse sheet 【先行作品】独占期間の延長 thành danh sách {titleId, titleName, rounds}.
 *
 * `rounds` là mảng ĐÃ SẮP THEO SỐ LẦN TĂNG DẦN (1回目 -> 2回目 -> ...), mỗi phần tử
 * là {roundName, value} với value là giá trị ô NGUYÊN BẢN (chưa lọc ngày). Việc chọn
 * lần nào thắng và loại ô không phải ngày do resolvePreEndExtension() làm — tách vậy
 * để test được riêng phần "đọc đúng dải cột" và phần "chọn đúng lần".
 *
 * DÒ 2 HÀNG HEADER RIÊNG BIỆT — đây là điểm khác mọi nguồn khác trong file này, và
 * là hệ quả trực tiếp của việc sheet nguồn có header 3 tầng (xem CONFIG):
 *   - hàng có タイトルID + タイトル -> cấp khoá join và tên tác phẩm (để cảnh báo đọc được)
 *   - hàng có 1回目 + 2回目        -> cấp dải cột gia hạn
 * Hàng dữ liệu bắt đầu SAU hàng header nằm THẤP NHẤT trong 2 hàng đó, chứ không phải
 * sau hàng header thật — dùng hàng thật (hàng 1) sẽ hút luôn 2 hàng header còn lại
 * vào làm dữ liệu.
 *
 * @param {Array<Array<*>>} rawRows - getDataRange().getValues() của sheet Sheet1
 * @returns {Array<{titleId: *, titleName: *, rounds: Array<{roundName: string, value: *}>}>}
 * @throws {Error} Nếu thiếu cột タイトルID/タイトル hoặc không tìm được hàng 1回目/2回目
 */
function parsePreEndExtensionRows(rawRows) {
  var idResolved = resolveHeaderIndex(rawRows, PRE_END_EXTENSION_ID_HEADERS);
  var colTitleId = col(idResolved.headerIndex, 'タイトルID');
  var colTitleName = col(idResolved.headerIndex, 'タイトル');

  // findHeaderRowIndex() tự throw khi không thấy; bọc lại chỉ để thông báo nói rõ ĐANG
  // ĐỌC NGUỒN NÀO và hàng header nào bị mất — lỗi trần chỉ ghi '1回目, 2回目', không đủ
  // để người đọc log biết phải mở sheet nào ra xem.
  var roundRowIndex;
  try {
    roundRowIndex = findHeaderRowIndex(rawRows, PRE_END_EXTENSION_ROUND_HEADERS);
  } catch (notFound) {
    throw new Error('【先行作品】独占期間の延長: không tìm thấy hàng header chứa '
      + PRE_END_EXTENSION_ROUND_HEADERS.join(' / ') + ' (dải cột 延長 → cột R). '
      + 'Sheet đã bị đổi cấu trúc — xem parsePreEndExtensionRows() trong sources.js. '
      + String(notFound));
  }

  // Thu mọi cột '<n>回目' của hàng đó rồi SẮP THEO n (không theo vị trí cột): nếu
  // 安蒜 chèn 8回目 vào giữa thay vì thêm vào cuối, thứ tự nghiệp vụ vẫn đúng.
  var roundColumns = [];
  buildHeaderIndex(rawRows[roundRowIndex]).forEach(function (columnIndex, headerName) {
    var matched = PRE_END_EXTENSION_ROUND_PATTERN.exec(headerName);
    if (!matched) return;
    roundColumns.push({ round: Number(matched[1]), roundName: headerName, columnIndex: columnIndex });
  });
  roundColumns.sort(function (a, b) { return a.round - b.round; });

  var firstDataRow = Math.max(idResolved.headerRowIndex, roundRowIndex) + 1;
  var records = [];
  for (var i = firstDataRow; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[colTitleId]) === '') continue;
    records.push({
      titleId: row[colTitleId],
      titleName: row[colTitleName],
      rounds: roundColumns.map(function (column) {
        return { roundName: column.roundName, value: row[column.columnIndex] };
      }),
    });
  }
  return records;
}

/**
 * Chọn LẦN GIA HẠN CUỐI CÙNG có 期日 trong 1 dòng nguồn — trái tim của quy tắc R列.
 *
 * Quét từ lần LỚN NHẤT về lần nhỏ nhất và lấy ô đầu tiên là 期日 thật. Ô 'NG' /
 * ghi chú tự do bị bỏ qua chứ KHÔNG dừng vòng quét: dòng thật có G=期日 + H='NG'
 * (86 dòng dạng này) phải cho ra ngày ở G, đúng theo 「期日のみを記載」.
 *
 * GIÁ TRỊ TRẢ VỀ LÀ NGUYÊN BẢN của ô, không phải Date đã parse (spec §4.4 — chuẩn
 * hoá chỉ để so khớp, không bao giờ để ghi). Date đã parse chỉ dùng để quyết định
 * ô đó có phải 期日 hay không.
 *
 * @param {{rounds: Array<{roundName: string, value: *}>}} record - 1 phần tử của parsePreEndExtensionRows()
 * @returns {{value: *, roundName: string, skipped: Array<{roundName: string, value: *}>}|null}
 *   null nếu cả dải 1回目〜n回目 không có ô nào là 期日.
 *   `skipped` = các ô CÓ nội dung nhưng KHÔNG phải 期日 và nằm SAU lần thắng (tức
 *   nội dung mới hơn nhưng không dùng được) — main.js ghi chúng vào GAS1警告 để
 *   'NG'/'一旦無期限先行' không biến mất trong im lặng.
 */
function resolvePreEndExtension(record) {
  var rounds = record.rounds || [];
  for (var i = rounds.length - 1; i >= 0; i--) {
    if (toDateOrNull(rounds[i].value) === null) continue;
    var skipped = [];
    for (var j = i + 1; j < rounds.length; j++) {
      if (normalizeJapaneseText(rounds[j].value) === '') continue;
      skipped.push({ roundName: rounds[j].roundName, value: rounds[j].value });
    }
    return { value: rounds[i].value, roundName: rounds[i].roundName, skipped: skipped };
  }
  return null;
}

/**
 * Build bảng tra normalize(タイトルID) -> kết quả resolvePreEndExtension().
 *
 * Bỏ dòng có タイトルID không phải số thật, và dòng không có lần gia hạn nào là 期日
 * (dòng như vậy không mang thông tin gì để ghi vào cột R).
 *
 * ID trùng -> dòng ĐẦU TIÊN thắng, giống buildSuspensionLookup(). Trên dữ liệu thật
 * 2026-08-07 không có ID nào trùng, nên đây chỉ là hành vi dự phòng — và nó được
 * cảnh báo, xem buildPreEndExtensionWarningRows() trong master.js.
 *
 * @param {Array<object>} records - Kết quả parsePreEndExtensionRows()
 * @returns {Map<string, {value: *, roundName: string, skipped: Array<object>, titleName: *}>}
 */
function buildPreEndExtensionLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    if (!isDigits(record.titleId)) return;
    var resolved = resolvePreEndExtension(record);
    if (resolved === null) return;
    var key = normalizeJapaneseText(record.titleId);
    if (lookup.has(key)) return;
    lookup.set(key, {
      value: resolved.value,
      roundName: resolved.roundName,
      skipped: resolved.skipped,
      titleName: record.titleName,
    });
  });
  return lookup;
}

/**
 * Tra 先行終了日（延長）(cột R) cho 1 tác phẩm theo タイトルID.
 *
 * @param {{titleId: *}} work
 * @param {Map<string, object>} extensionLookup - Kết quả buildPreEndExtensionLookup()
 * @returns {*} Ngày gia hạn NGUYÊN BẢN, hoặc '' nếu tác phẩm không có trong nguồn
 */
function lookupPreEndExtension(work, extensionLookup) {
  if (!isDigits(work.titleId)) return '';
  var found = extensionLookup.get(normalizeJapaneseText(work.titleId));
  return found === undefined ? '' : found.value;
}

/**
 * Quy tắc cột S 先行終了日（最終確定）— user chốt 2026-08-07: R có ngày thì lấy R,
 * không thì lấy Q.
 *
 * VÌ SAO CẦN CHỐT LẠI: 2 gạch đầu dòng của spec gốc ghi ĐIỀU KIỆN GIỐNG NHAU
 * ('Q列に期日記載あり、R列に期日あり') nhưng KẾT QUẢ khác nhau (một dòng nói lấy Q, dòng
 * kia nói lấy R) — tức spec tự mâu thuẫn. User xác nhận gạch đầu dòng thứ nhất
 * thiếu chữ 'なし', ý đúng là: có gia hạn thì ngày gia hạn MỚI là ngày chốt cuối.
 *
 * Bảng chân lý đầy đủ (đã xác nhận với user):
 *   Q có ngày + R trống  -> S = Q
 *   Q có ngày + R có ngày -> S = R
 *   Q trống   + R có ngày -> S = R
 *   Q trống   + R trống   -> S = ''
 *
 * Điều kiện là "R KHÔNG RỖNG", không phải "R là 期日": cột R chỉ có thể chứa 期日 hoặc
 * rỗng (lookupPreEndExtension đã lọc), nên 2 cách viết tương đương — nhưng viết theo
 * "không rỗng" thì hàm này vẫn đúng khi ai đó gõ tay giá trị lạ vào ô R.
 *
 * @param {*} preEnd - Cột Q 先行終了日 (từ CMS)
 * @param {*} preEndExtended - Cột R 先行終了日（延長）
 * @returns {*} Giá trị NGUYÊN BẢN của Q hoặc R (không parse, không format lại)
 */
function resolvePreEndFinal(preEnd, preEndExtended) {
  if (normalizeJapaneseText(preEndExtended) !== '') return preEndExtended;
  if (normalizeJapaneseText(preEnd) !== '') return preEnd;
  return '';
}

// ==============================================================================
// NGUỒN 6 — 大量無料希望作品リスト_CA様, sheet ★出稿回答シート
//           -> cột T 大量無料開始日 / cột U 大量無料終了日
// ==============================================================================

// QUY TẮC NGHIỆP VỤ (spec 2026-08-07):
//   H列「キャンペーン開始日」-> T列「大量無料開始日」
//   I列「キャンペーン終了日」-> U列「大量無料終了日」
//
// 2 QUYẾT ĐỊNH user chốt 2026-08-07, đều xuất phát từ dữ liệu thật chứ không có
// trong spec gốc:
//
// 1. MỘT タイトルID XUẤT HIỆN NHIỀU DÒNG (65/372 dòng trên dữ liệu thật). Nguyên nhân
//    là 1 chiến dịch được gia hạn theo từng tháng: cột 新規/延長 cho thấy ID 267846 có
//    新規 5/1-5/31 rồi 延長 6/1-6/30, 7/1-7/31, 8/1-8/31. User chốt: coi cả chuỗi đó
//    là MỘT kỳ 大量無料 -> T = 開始日 NHỎ NHẤT, U = 終了日 LỚN NHẤT (ID trên -> T=5/1,
//    U=8/31). Đây là cùng tinh thần với cột Q/R/S phía trên: gia hạn thì lấy mốc cuối.
//    LƯU Ý: T và U được lấy ĐỘC LẬP (min của mọi 開始日, max của mọi 終了日), không phải
//    lấy nguyên cặp H/I của một dòng nào — đúng ý "toàn kỳ" mà user chọn.
//
// 2. LỌC THEO CỘT 出稿回答: dòng 出稿回答 = ✕ (không xuất) bị BỎ. Dòng ◯ và dòng TRỐNG
//    đều được tính — trống nghĩa là "chưa trả lời", không phải "không xuất", nên bỏ nó
//    sẽ làm rỗng 159/372 dòng. Trên dữ liệu thật chỉ có 2 dòng ✕.
//
// Cột 開始日/終了日 của sheet này SẠCH (0 ô không phải ngày trên 372 dòng) nhưng vẫn đi
// qua toDateOrNull(): đây là ô người gõ tay, sạch hôm nay không có nghĩa sạch mãi.

var MASS_FREE_REQUIRED_HEADERS = ['タイトルID', 'キャンペーン開始日', 'キャンペーン終了日'];

// Tên cột 出稿回答 dùng để LỌC. tryCol() chứ không col(): mất cột này thì mọi dòng
// được tính (hành vi cũ, an toàn) chứ không làm sập cả lần chạy.
var MASS_FREE_ANSWER_HEADER = '出稿回答';

// Các cách viết "không xuất" bị loại. So sau normalizeJapaneseText() nên NFKC đã gộp
// Ｘ/ｘ full-width về X/x; 3 ký hiệu chéo Unicode (✕ U+2715 — ký tự thật đang có trong
// sheet, × U+00D7, ✗ U+2717) thì NFKC KHÔNG gộp nên phải liệt kê từng cái.
var MASS_FREE_REJECT_VALUES = ['✕', '×', '✗', 'X', 'x'];

/**
 * Parse sheet ★出稿回答シート thành danh sách {titleId, titleName, start, end, rejected}.
 *
 * Header thật ở HÀNG 2 (hàng 1 là ghi chú ※編集禁止※) — findHeaderRowIndex() tự dò,
 * không hardcode.
 *
 * KHÔNG lọc gì ở đây (kể cả dòng ✕): mọi việc lọc/gộp do buildMassFreeLookup() làm,
 * để hàm này thuần "đọc sheet" và test được riêng.
 *
 * @param {Array<Array<*>>} rawRows - getDataRange().getValues() của sheet ★出稿回答シート
 * @returns {Array<{titleId: *, titleName: *, start: *, end: *, rejected: boolean}>}
 * @throws {Error} Nếu thiếu 1 trong 3 cột bắt buộc
 */
function parseMassFreeRows(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, MASS_FREE_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colTitleId = col(idx, 'タイトルID');
  var colStart = col(idx, 'キャンペーン開始日');
  var colEnd = col(idx, 'キャンペーン終了日');
  // tryCol() trả về undefined (KHÔNG phải null) khi cột chưa tồn tại — xem JSDoc của
  // nó trong common.js. So sai kiểu ở đây sẽ cho colAnswer = undefined rồi
  // row[undefined] = undefined, tức mọi dòng đều được coi là không bị ✕: hỏng bộ lọc
  // mà không có lỗi nào để nhận ra.
  var colTitleName = tryCol(idx, 'タイトル名');
  var colAnswer = tryCol(idx, MASS_FREE_ANSWER_HEADER);

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[colTitleId]) === '') continue;
    var answer = colAnswer === undefined ? '' : normalizeJapaneseText(row[colAnswer]);
    records.push({
      titleId: row[colTitleId],
      titleName: colTitleName === undefined ? '' : row[colTitleName],
      start: row[colStart],
      end: row[colEnd],
      rejected: MASS_FREE_REJECT_VALUES.indexOf(answer) >= 0,
    });
  }
  return records;
}

/**
 * Build bảng tra normalize(タイトルID) -> {start, end} của TOÀN KỲ 大量無料.
 *
 * Gộp mọi dòng cùng タイトルID (trừ dòng ✕): start = 開始日 nhỏ nhất, end = 終了日 lớn
 * nhất — quy tắc user chốt, xem comment đầu NGUỒN 6.
 *
 * start và end được gộp ĐỘC LẬP, và một dòng chỉ có 1 trong 2 ô vẫn góp ô đó — dòng
 * đang được điền dở không nên làm mất mốc còn lại.
 *
 * GIÁ TRỊ TRẢ VỀ LÀ NGUYÊN BẢN của ô đã thắng, không phải Date đã parse (spec §4.4).
 * Date parse chỉ dùng để SO SÁNH tìm min/max.
 *
 * @param {Array<object>} records - Kết quả parseMassFreeRows()
 * @returns {Map<string, {start: *, end: *, rowCount: number, rejectedCount: number, titleName: *}>}
 */
function buildMassFreeLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    if (!isDigits(record.titleId)) return;
    var key = normalizeJapaneseText(record.titleId);
    if (!lookup.has(key)) {
      lookup.set(key, {
        start: '', end: '', rowCount: 0, rejectedCount: 0, titleName: record.titleName,
        startDate: null, endDate: null,
      });
    }
    var entry = lookup.get(key);
    if (record.rejected) {
      entry.rejectedCount += 1;
      return;
    }
    entry.rowCount += 1;

    var startDate = toDateOrNull(record.start);
    if (startDate !== null && (entry.startDate === null || startDate.getTime() < entry.startDate.getTime())) {
      entry.startDate = startDate;
      entry.start = record.start;
    }
    var endDate = toDateOrNull(record.end);
    if (endDate !== null && (entry.endDate === null || endDate.getTime() > entry.endDate.getTime())) {
      entry.endDate = endDate;
      entry.end = record.end;
    }
  });

  // Bỏ hẳn ID mà mọi dòng đều bị loại (✕) hoặc không có ô ngày nào dùng được: giữ lại
  // chỉ để cột T/U nhận '' thì không khác gì không có trong map, mà lại làm cảnh báo
  // "ID này được N dòng chia sẻ" đếm cả những ID không ghi ra gì.
  var keysToDrop = [];
  lookup.forEach(function (entry, key) {
    if (normalizeJapaneseText(entry.start) === '' && normalizeJapaneseText(entry.end) === '') {
      keysToDrop.push(key);
    }
  });
  keysToDrop.forEach(function (key) { lookup.delete(key); });
  return lookup;
}

/**
 * Tra cặp 大量無料開始日 / 大量無料終了日 (cột T/U) cho 1 tác phẩm theo タイトルID.
 *
 * @param {{titleId: *}} work
 * @param {Map<string, object>} massFreeLookup - Kết quả buildMassFreeLookup()
 * @returns {{start: *, end: *}} Giá trị nguyên bản, cả 2 là '' nếu không tra ra
 */
function lookupMassFreePeriod(work, massFreeLookup) {
  if (!isDigits(work.titleId)) return { start: '', end: '' };
  var found = massFreeLookup.get(normalizeJapaneseText(work.titleId));
  if (found === undefined) return { start: '', end: '' };
  return { start: found.start, end: found.end };
}


// ==============================================================================
// NGUỒN 7 — 出稿コミット管理表（新作・既存・キャン強化）, sheet 広告出稿必須タイトル
//           -> cột E タイトル区分
// ==============================================================================

// QUY TẮC NGHIỆP VỤ (user chốt 2026-08-13):
//   C列のフラグ × F列のタイトル名 → 先行タイトル情報 と掛け算
//   ┗コミットフラグ: có trong 先行タイトル情報 VÀ C列 = 「2.先行配信（出稿コミット）」
//   ┗独占フラグ    : mọi tác phẩm còn lại của 先行タイトル情報
//
// Hệ quả quan trọng: cột E KHÔNG BAO GIỜ TRỐNG. Danh sách dòng của 顧客作品マスタ vốn
// đã là tập con của 先行タイトル情報 (CMS là nguồn nền tảng, xem NGUỒN 2), nên "không
// tra ra cờ コミット" đồng nghĩa với 独占 — không cần tra thêm nguồn nào để xác nhận.
//
// 4 QUYẾT ĐỊNH rút ra từ dữ liệu thật (4.217 dòng, bản 2026-08-12):
//
// 1. KHOÁ JOIN LÀ タイトル名, không phải タイトルID. Đúng như user viết, và cũng là
//    lựa chọn duy nhất chạy được: cột タイトルID của nguồn này trống ở gần hết số dòng
//    (chỉ 3 dòng đầu tiên có ID trong 26 dòng mẫu). Cùng cách chuẩn hoá
//    normalizeJapaneseText() mà tầng 3 của khoá cascade đang dùng.
//
// 2. CHỈ 「2.先行配信（出稿コミット）」 LÀ CỜ コミット. C列 có 9 giá trị khác nhau; đáng
//    chú ý là 「4.既存作品（出稿コミット）」 (32 dòng) CŨNG chứa chữ 出稿コミット nhưng
//    KHÔNG được tính — quy tắc user viết nêu đích danh một chuỗi. So bằng
//    normalizeJapaneseText() (NFKC) chứ không indexOf('出稿コミット'), để 32 dòng đó
//    không lọt vào một cách âm thầm. Nếu sau này 安蒜 muốn tính cả nó thì thêm vào
//    COMMIT_FLAG_VALUES bên dưới, không phải sửa logic.
//
// 3. MỘT タイトル名 XUẤT HIỆN NHIỀU DÒNG (64 tên trên dữ liệu thật): chỉ cần MỘT dòng
//    mang cờ コミット là cả tên đó thành コミット. Đúng tinh thần 「先行タイトル情報に
//    含まれるタイトル＋Ｃ列：…」 — hỏi "có dòng nào cam kết không", không phải "mọi
//    dòng có cam kết không".
//
// 4. DÒNG THIẾU タイトル名 BỊ BỎ (1 dòng trên dữ liệu thật). Không có khoá join thì
//    dòng đó không thể ứng với tác phẩm nào.

var COMMIT_MANAGEMENT_REQUIRED_HEADERS = ['タイトル区分', 'タイトル名'];

// Giá trị C列 được coi là "có cam kết xuất稿". Mảng (không phải hằng chuỗi) vì đây
// là chỗ 安蒜 nhiều khả năng sẽ nới ra — xem quyết định 2 ở trên.
//
// Viết NGUYÊN VĂN như trên sheet (ngoặc full-width （）) để đối chiếu bằng mắt được,
// nhưng PHẢI so qua isCommitFlagValue() bên dưới chứ không phải indexOf() trực tiếp:
// normalizeJapaneseText() áp NFKC nên giá trị đọc từ ô đã thành ngoặc nửa-rộng ()
// và không bao giờ khớp chuỗi này. Đây đúng là cái bẫy đã làm 3.099 dòng lặng lẽ
// rơi hết sang 独占 ở lần chạy test đầu tiên.
var COMMIT_FLAG_VALUES = ['2.先行配信（出稿コミット）'];

/**
 * Giá trị C列 (ĐÃ qua normalizeJapaneseText) có phải cờ コミット không.
 *
 * @param {string} normalizedCategory - Kết quả normalizeJapaneseText(ô C列)
 * @returns {boolean}
 */
function isCommitFlagValue(normalizedCategory) {
  for (var i = 0; i < COMMIT_FLAG_VALUES.length; i++) {
    if (normalizeJapaneseText(COMMIT_FLAG_VALUES[i]) === normalizedCategory) return true;
  }
  return false;
}

var TITLE_CATEGORY_COMMIT = 'コミット';
var TITLE_CATEGORY_EXCLUSIVE = '独占';

/**
 * Parse sheet 広告出稿必須タイトル thành danh sách {titleCategory, titleId, cmsId, titleName}.
 *
 * KHÔNG lọc/gộp gì ở đây (kể cả dòng thiếu タイトル名 thì cũng chỉ bỏ đúng dòng đó):
 * mọi việc phân loại do buildCommitFlagLookup() làm, để hàm này thuần "đọc sheet".
 *
 * titleId/cmsId KHÔNG dùng làm khoá (xem quyết định 1 ở đầu NGUỒN 7) nhưng vẫn được
 * đọc ra: chúng là thứ duy nhất để người đối chiếu tay tìm lại dòng nguồn khi một
 * tác phẩm bị gắn 区分 trông có vẻ sai. Cả 2 dùng tryCol() vì không bắt buộc phải có.
 *
 * @param {Array<Array<*>>} rawRows - getDataRange().getValues() của sheet 広告出稿必須タイトル
 * @returns {Array<{titleCategory: string, titleId: *, cmsId: *, titleName: *}>}
 * @throws {Error} Nếu thiếu cột タイトル区分 hoặc タイトル名
 */
function parseCommitManagementRows(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, COMMIT_MANAGEMENT_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colCategory = col(idx, 'タイトル区分');
  var colTitleName = col(idx, 'タイトル名');
  // tryCol() trả về undefined (KHÔNG null) khi cột chưa có — xem JSDoc trong common.js.
  var colTitleId = tryCol(idx, 'タイトルID');
  var colCmsId = tryCol(idx, 'CMS ID');

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[colTitleName]) === '') continue;
    records.push({
      titleCategory: row[colCategory],
      titleId: colTitleId === undefined ? '' : row[colTitleId],
      cmsId: colCmsId === undefined ? '' : row[colCmsId],
      titleName: row[colTitleName],
    });
  }
  return records;
}

/**
 * Build bảng tra normalize(タイトル名) -> {committed, rowCount, commitRowCount, categories}.
 *
 * committed = true nếu CÓ ÍT NHẤT MỘT dòng cùng tên mang cờ trong COMMIT_FLAG_VALUES
 * (quyết định 3 ở đầu NGUỒN 7).
 *
 * categories giữ danh sách các giá trị C列 ĐÃ THẤY của tên đó (không trùng lặp, theo
 * thứ tự gặp) — chỉ để dựng câu cảnh báo đọc được, không tham gia phán định.
 *
 * @param {Array<object>} records - Kết quả parseCommitManagementRows()
 * @returns {Map<string, {committed: boolean, rowCount: number, commitRowCount: number, categories: Array<string>, titleName: *}>}
 */
function buildCommitFlagLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    var key = normalizeJapaneseText(record.titleName);
    if (key === '') return;
    if (!lookup.has(key)) {
      lookup.set(key, {
        committed: false, rowCount: 0, commitRowCount: 0, categories: [], titleName: record.titleName,
      });
    }
    var entry = lookup.get(key);
    entry.rowCount += 1;

    var category = normalizeJapaneseText(record.titleCategory);
    if (category !== '' && entry.categories.indexOf(category) < 0) {
      entry.categories.push(category);
    }
    if (isCommitFlagValue(category)) {
      entry.committed = true;
      entry.commitRowCount += 1;
    }
  });
  return lookup;
}

/**
 * Tra 区分 (cột E) cho 1 tác phẩm theo タイトル名.
 *
 * LUÔN trả về một trong 2 chuỗi コミット / 独占, không bao giờ '' — xem "Hệ quả quan
 * trọng" ở đầu NGUỒN 7. Hàm gọi phải tự xử lý trường hợp nguồn đọc không được
 * (main.js gán lại giá trị đang có trên sheet, KHÔNG gọi hàm này).
 *
 * @param {{titleName: *}} work
 * @param {Map<string, object>} commitFlagLookup - Kết quả buildCommitFlagLookup()
 * @returns {string} TITLE_CATEGORY_COMMIT hoặc TITLE_CATEGORY_EXCLUSIVE
 */
function lookupTitleCategory(work, commitFlagLookup) {
  var found = commitFlagLookup.get(normalizeJapaneseText(work.titleName));
  if (found !== undefined && found.committed === true) return TITLE_CATEGORY_COMMIT;
  return TITLE_CATEGORY_EXCLUSIVE;
}


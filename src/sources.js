// sources.js — ĐỌC 4 NGUỒN ĐẦU VÀO
//
// Mỗi phần dưới đây parse 1 nguồn thành record/Map để tầng nghiệp vụ dùng. Toàn
// bộ là hàm PURE: nhận vào mảng 2 chiều đã đọc sẵn (io.js đọc), không tự gọi
// SpreadsheetApp — nhờ vậy test được bằng Node (tools/verify/).
//
// 4 nguồn, theo đúng thứ tự quan trọng:
//   1. 作品レギュレーション判定  -> BỘ LỌC + 3 cột phán định ①②③
//   2. 先行タイトル情報(CMS)     -> DANH SÁCH tác phẩm (nguồn nền tảng)
//   3. 外部出稿用NGタイトル      -> nội dung cảnh báo (không còn điền cột nào)
//   4. multi_title_yyyyMMdd.tsv -> 掲載停止日付 (cột I)
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


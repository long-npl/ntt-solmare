// copyright.js — BẢN QUYỀN: quy tắc theo NXB -> sinh 出版社コピーライト -> lịch sử
//
// VIẾT LẠI 2026-08-04 theo ガワ mới của コピーライトマスタ. Thay đổi cốt lõi: bản
// quyền không còn là MỘT giá trị đi qua 4 tầng ưu tiên, mà là HAI CỘT ĐỘC LẬP:
//
//   J `タイトル個別コピーライト(あれば優先使用)` = cột コピーライト của CMS, nguyên văn
//   K `出版社コピーライト`                      = GAS sinh từ 出版社別コピーライトマスタ
//
// Giá trị "hiệu lực" (dùng cho lịch sử 過去分, và là cái bước sau đọc) = J nếu có,
// không thì K — xem effectiveCopyright(). Sheet mới KHÔNG còn cột 正規コピーライト,
// nên quan hệ ưu tiên đó giờ chỉ tồn tại trong code, không nằm trên sheet nữa.
//
// ĐÃ XOÁ (user chốt 2026-08-04 "thay thế hoàn toàn"): `基本のC表記` và 5 sheet quy
// tắc riêng NXB (LINE/スクエニ/リブレ/オーバーラップ/ヒーローズ), cùng toàn bộ
// PUBLISHER_SHEET_PARSERS / resolvePublisherAliasMatch / applyBasicNotationTemplate
// / resolveCopyright 4 tầng. Cả 6 sheet đó được thay bằng MỘT nguồn duy nhất:
// `出版社別コピーライトマスタ` (381 dòng, 292 NXB). Đừng khôi phục lại theo kiểu "cho
// chắc": 2 nguồn quy tắc song song cho cùng một tác phẩm là công thức của việc 2
// người sửa 2 chỗ rồi không ai biết chỗ nào đang thắng.
//
// Ba phần:
//   1. PARSE  `出版社別コピーライトマスタ` -> Map tra theo 出版社 (+ レーベル)
//   2. SINH   出版社コピーライト từ template, kèm 3 lý do KHÔNG sinh được
//   3. LỊCH SỬ コピーライト_過去分1..5
//
// Toàn bộ là hàm PURE (không đụng SpreadsheetApp) — được test bằng Node.

// ==============================================================================
// PHẦN 1 — PARSE 出版社別コピーライトマスタ
// ==============================================================================

// Header thật (hàng 15 của sheet): E 出版社 / G 雑誌名/レーベル / H 自動化フラグ /
// N 著者名区切り方 / O テンプレート. Tra theo TÊN nên không phụ thuộc vị trí cột.
var PUBLISHER_COPYRIGHT_REQUIRED_HEADERS = ['出版社', '雑誌名/レーベル', '自動化フラグ'];

// Cờ ở cột 自動化フラグ. Chỉ '01：自動化' (360 dòng) mới được GAS tự sinh;
// '02：個別ルール' (11 dòng) là quy tắc con người phải tự viết cho từng tác phẩm.
var PUBLISHER_COPYRIGHT_FLAG_AUTO_PREFIX = '01';

/**
 * Parse sheet 出版社別コピーライトマスタ.
 *
 * Chỉ đọc 4 cột cần cho việc sinh bản quyền. Các cột còn lại (危険, 要注意作品あり,
 * 順番指定, 3 cột 事前確認, その他注意, 要注意作品, 別紙参照) là thông tin cho con
 * người trong quy trình duyệt creative — CỐ TÌNH không đọc, để không ai tưởng GAS
 * đang xử lý chúng.
 *
 * KHÔNG đọc cột 著者名区切り方 (N): user chốt 2026-08-04 bỏ qua cột này. Lý do thực
 * tế: cột đó nói cách NỐI NHIỀU tác giả, nhưng CMS chỉ cấp MỘT chuỗi tác giả đã
 * định dạng tự do (`原作：Shigeky 漫画：こくだかや`, `Djade(作画) ┴KRE(ストーリー)`,
 * `福,YTA`, `コミック：コヤマナユ/原作：柊一葉/キャラクター原案：三浦ひらく`) — không có
 * dấu phân cách nào đáng tin để tách ra rồi nối lại. Chèn nguyên văn chuỗi CMS thì
 * bản quyền có thể còn dính `原作：`, nhưng KHÔNG bóp méo tên tác giả — đánh đổi
 * đúng, vì tên người là thứ không được đoán.
 *
 * @param {Array<Array<*>>} rawRows - Kết quả io.js: readSheetValues()
 * @returns {Array<{publisher: *, label: *, flag: *, template: *}>} Giá trị nguyên văn
 */
function parsePublisherCopyrightRules(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, PUBLISHER_COPYRIGHT_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colPublisher = col(idx, '出版社');
  var colLabel = col(idx, '雑誌名/レーベル');
  var colFlag = col(idx, '自動化フラグ');
  // Header thật là 'テンプレート\n(タイトルマスタで参照)' — phần trong ngoặc là ghi
  // chú, tra bằng tiền tố cho bền với việc sửa lời ghi chú đó.
  var colTemplate = colByPrefix(idx, 'テンプレート');

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[colPublisher]) === '') continue;
    records.push({
      publisher: row[colPublisher],
      label: row[colLabel],
      flag: row[colFlag],
      template: row[colTemplate],
    });
  }
  return records;
}

/** Khoá tra: có レーベル thì khoá gồm cả レーベル, không thì chỉ 出版社. */
function publisherCopyrightKey(publisher, label) {
  var publisherKey = normalizeJapaneseText(publisher);
  var labelKey = normalizeJapaneseText(label);
  return labelKey === '' ? publisherKey : publisherKey + '\u0000' + labelKey;
}

/**
 * Build bảng tra quy tắc bản quyền, 2 tầng: (出版社 + レーベル) và (出版社).
 *
 * VÌ SAO PHẢI 2 TẦNG VÀ TẦNG CÓ レーベル THẮNG: 100 trong 381 dòng có レーベル, và
 * chúng CỐ TÌNH khác dòng chỉ có 出版社 của cùng NXB đó. Ví dụ thật:
 *   集英社               -> '©.集英社/作家名/タイトル名'
 *   集英社 + ブリンク       -> '『タイトル名』©著者名／ホーム社'
 *   集英社 + Office YOU  -> '『タイトル名』©著者名／集英社クリエイティブ'
 * Tra theo 出版社 trước sẽ cho ra bản quyền ghi TÊN CÔNG TY SAI. Luôn thử khoá cụ
 * thể nhất trước — xem resolvePublisherCopyright().
 *
 * Khoá trùng -> DÒNG ĐẦU TIÊN THẮNG (dữ liệu thật có `オトナ恋 + ライブコミックス`
 * xuất hiện 2 lần). Chọn "đầu tiên" để kết quả không đổi khi ai đó thêm dòng vào
 * cuối sheet.
 *
 * @param {Array<object>} records - Kết quả parsePublisherCopyrightRules()
 * @returns {Map<string, object>} Khoá từ publisherCopyrightKey() -> record
 */
function buildPublisherCopyrightLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    var key = publisherCopyrightKey(record.publisher, record.label);
    if (key === '') return;
    if (!lookup.has(key)) lookup.set(key, record);
  });
  return lookup;
}

// ==============================================================================
// PHẦN 2 — SINH 出版社コピーライト TỪ TEMPLATE
// ==============================================================================

// Placeholder trong cột テンプレート — QUY LUẬT CHÍNH: mọi placeholder đều kết thúc
// bằng 名. Đã quét toàn bộ 381 dòng để xác nhận (2026-08-04), số dòng dùng mỗi cái:
//   タイトル名 308 / 作品名 1 / タイトル 3   -> tên tác phẩm
//   著者名 273 / 作家名 13 / 作者名 12       -> tên tác giả
//   レーベル名 9 / 雑誌名 1                 -> レーベル
//   出版社名 4                             -> NXB
//
// ⚠️ TUYỆT ĐỐI KHÔNG thêm `出版社` (không có 名) vào danh sách này. Có 2 template
// chứa `出版社` mà đó là TÊN NXB THẬT, không phải placeholder:
//   '『タイトル名』©著者名/英和出版社'   -> thay sẽ ra '英和英和出版社'
//   '『タイトル名』©著者名/笠倉出版社'   -> thay sẽ ra '笠倉笠倉出版社'
// Cùng lý do, `レーベル` (không có 名) cũng không nằm đây — 0 template dùng dạng đó,
// và thay nó vào 'レーベル名' sẽ ra '<レーベル>名'.
//
// Bản đầu (2026-08-04) có cả `出版社` và `レーベル` và đã sinh ra đúng 4 giá trị sai
// đó. Hôm nay chưa tác phẩm nào thuộc mấy NXB ấy nên dữ liệu thật không phát hiện
// được — bug tiềm ẩn, chỉ nổ khi có tác phẩm mới. Xem test_copyright.
var COPYRIGHT_TEMPLATE_TOKENS = [
  { tokens: ['タイトル名', '作品名', 'タイトル'], field: 'titleName' },
  { tokens: ['著者名', '作家名', '作者名'], field: 'author' },
  { tokens: ['レーベル名', '雑誌名'], field: 'label' },
  { tokens: ['出版社名'], field: 'publisher' },
];

// Placeholder KHÔNG THỂ điền từ dữ liệu CMS — mỗi cái đòi một thông tin mà CMS
// không cấp riêng lẻ:
//   原作者名 / 漫画家名 / 作画者名       -> tách riêng vai trò tác giả; CMS gộp 1 chuỗi
//   英字作者名 / 英字著者名 / ローマ字著者名 -> tên tác giả dạng chữ Latin; CMS chỉ có tên gốc
//   イラストレーター名                  -> tên hoạ sĩ minh hoạ; CMS không có trường này
//   会社名 / 発行元社名                 -> xuất hiện trong câu ghi chú, không phải mẫu
// Gặp những dòng này thì để trống cột K + cảnh báo, KHÔNG đoán.
//
// KIỂM TRÊN TEMPLATE GỐC, TRƯỚC KHI THAY, và danh sách này phải chứa dạng DÀI NHẤT:
// '原作者名' chứa '作者名', 'ローマ字著者名' chứa '著者名' — kiểm sau khi thay thì mất
// dấu hiệu để nhận ra.
var COPYRIGHT_TEMPLATE_UNSUPPORTED_TOKENS = [
  'ローマ字著者名', '英字著者名', '英字作者名', 'イラストレーター名', '原作者名',
  '漫画家名', '作画者名', '発行元社名', '会社名', 'ローマ字', '漫画著者', '原作者',
];

// 2 placeholder viết tắt kiểu '©著 ©原作 ©SANKYO ©デジタルアトラクション' (nghĩa là
// ©<tác giả> ©<nguyên tác> ...) — cũng không điền được vì CMS gộp mọi vai trò vào
// 1 chuỗi.
//
// PHẢI dùng regex có negative lookahead, KHÔNG dùng so chuỗi thường: '©著' là TIỀN
// TỐ của '©著者名' — placeholder phổ biến nhất của nguồn này (273/381 dòng). Bản
// đầu dùng indexOf('©著') và nó khớp luôn '©著者名', tức LOẠI 273 quy tắc hợp lệ và
// làm cột 出版社コピーライト trống gần hết. Test đơn vị bắt được — đừng đổi lại thành
// so chuỗi thường.
var COPYRIGHT_TEMPLATE_UNSUPPORTED_PATTERNS = [
  { label: '©著', pattern: /[©Ⓒⓒ]著(?!者名)/ },
  { label: '©原作', pattern: /[©Ⓒⓒ]原作(?!者)/ },
];

var COPYRIGHT_REASON_OK = 'ok';
var COPYRIGHT_REASON_NO_RULE = 'ルール無し';
var COPYRIGHT_REASON_MANUAL_FLAG = '個別ルール';
var COPYRIGHT_REASON_BAD_TEMPLATE = 'テンプレート不備';

/**
 * Template này là một bản quyền sinh được, hay chỉ là CHỈ THỊ cho con người?
 *
 * ĐÂY LÀ CÁI BẪY QUAN TRỌNG NHẤT CỦA NGUỒN NÀY: 19 dòng có cột テンプレート nhưng
 * không chứa placeholder nào, và một số trong đó là CÂU LỆNH chứ không phải mẫu:
 *   'コピーライトについて都度確認'
 *   '都度問い合わせ要'
 *   'コピーライトルール参照して個別記載'
 * Nếu chỉ tin cờ '01：自動化' rồi ghi thẳng cột テンプレート ra sheet, GAS sẽ ghi câu
 * "都度問い合わせ要" vào ô bản quyền như thể đó LÀ bản quyền — và nó trông hoàn
 * toàn bình thường với người đọc sheet.
 *
 * Cách nhận diện CỐ TÌNH KHÔNG dùng danh sách đen các câu chỉ thị (danh sách đó
 * lỗi thời ngay khi ai đó viết câu mới): mọi bản quyền thật đều PHẢI có ký hiệu ©
 * (hoặc biến thể Ⓒ/ⓒ/(C)/（Ｃ）), câu chỉ thị thì không. Nhờ vậy những dòng như
 * '©Big Fields Publishing', '©レジンコミックス', '©ブリック出版' (bản quyền cứng,
 * không có placeholder) vẫn hợp lệ — đúng, vì đó là bản quyền hoàn chỉnh.
 *
 * @param {*} template
 * @returns {boolean}
 */
function looksLikeCopyrightTemplate(template) {
  var text = String(template === null || template === undefined ? '' : template);
  if (normalizeJapaneseText(text) === '') return false;
  return /[©Ⓒⓒ]/.test(text) || /[（(][CcＣｃ][）)]/.test(text);
}

/**
 * Điền giá trị thật của tác phẩm vào template.
 *
 * @param {*} template - Cột テンプレート, nguyên văn
 * @param {{titleName: *, author: *, label: *, publisher: *}} work
 * @returns {{value: string, unfilled: Array<string>}}
 *   unfilled: placeholder KHÔNG điền được — token không hỗ trợ, HOẶC token hỗ trợ
 *     nhưng tác phẩm không có giá trị (vd template cần レーベル mà CMS để trống).
 *     Rỗng = điền xong sạch sẽ.
 */
function applyCopyrightTemplate(template, work) {
  var text = String(template);
  var unfilled = [];

  // Bước 1: chặn placeholder không hỗ trợ — trên template GỐC (xem comment ở
  // COPYRIGHT_TEMPLATE_UNSUPPORTED_TOKENS về lý do phải làm trước khi thay).
  COPYRIGHT_TEMPLATE_UNSUPPORTED_TOKENS.forEach(function (token) {
    if (text.indexOf(token) !== -1) unfilled.push(token);
  });
  COPYRIGHT_TEMPLATE_UNSUPPORTED_PATTERNS.forEach(function (entry) {
    if (entry.pattern.test(text)) unfilled.push(entry.label);
  });

  // Bước 2: thay trong MỘT LƯỢT quét, mỗi vị trí thử token DÀI NHẤT trước.
  //
  // Vì sao không dùng chuỗi .split().join() cho từng token: cách đó quét lại cả
  // phần vừa thay, nên nếu tên tác phẩm/tác giả tình cờ chứa một token (vd tác
  // phẩm có chữ '作品名' trong tên) thì lần thay sau sẽ ăn vào giá trị vừa chèn.
  // Quét 1 lượt thì giá trị đã chèn không bao giờ bị đọc lại.
  var pairs = [];
  COPYRIGHT_TEMPLATE_TOKENS.forEach(function (group) {
    group.tokens.forEach(function (token) { pairs.push({ token: token, field: group.field }); });
  });
  pairs.sort(function (a, b) { return b.token.length - a.token.length; });

  var result = '';
  var i = 0;
  while (i < text.length) {
    var matched = null;
    for (var k = 0; k < pairs.length; k++) {
      if (text.substr(i, pairs[k].token.length) === pairs[k].token) {
        matched = pairs[k];
        break;
      }
    }
    if (matched === null) {
      result += text.charAt(i);
      i += 1;
      continue;
    }
    var value = work[matched.field];
    if (normalizeJapaneseText(value) === '') {
      // Template đòi thông tin này mà tác phẩm không có -> KHÔNG thay bằng chuỗi
      // rỗng (sẽ ra bản quyền khuyết kiểu '『』©/小学館'). Giữ nguyên token trong
      // kết quả để dòng cảnh báo cho thấy chỗ nào thiếu.
      unfilled.push(matched.token);
      result += matched.token;
    } else {
      result += String(value);
    }
    i += matched.token.length;
  }

  return { value: result, unfilled: unfilled };
}

/**
 * Sinh 出版社コピーライト (cột K) cho 1 tác phẩm.
 *
 * Tra quy tắc theo 出版社 (+ レーベル nếu khớp) rồi điền template. Trả `value: null`
 * kèm `reason` cho 3 tình huống KHÔNG sinh được — cả 3 đều dẫn tới "để trống cột K
 * + ghi cảnh báo", theo quyết định của user 2026-08-04:
 *
 *   ルール無し        NXB của tác phẩm không có dòng nào trong 出版社別コピーライトマスタ
 *   個別ルール        cờ '02：個別ルール' — quy tắc con người phải tự viết
 *   テンプレート不備   template là câu chỉ thị, hoặc đòi placeholder không điền được
 *
 * KHÔNG bao giờ tự bịa giá trị: một ô bản quyền TRỐNG là chuyện người ta thấy và
 * xử lý được; một ô bản quyền SAI thì đi thẳng ra creative của khách.
 *
 * @param {{titleName: *, author: *, label: *, publisher: *}} work
 * @param {Map<string, object>} rulesLookup - buildPublisherCopyrightLookup()
 * @returns {{value: string|null, reason: string, rule: object|null, detail: string}}
 */
function resolvePublisherCopyright(work, rulesLookup) {
  var rule = rulesLookup.get(publisherCopyrightKey(work.publisher, work.label));
  if (rule === undefined) rule = rulesLookup.get(publisherCopyrightKey(work.publisher, ''));
  if (rule === undefined) {
    return {
      value: null,
      reason: COPYRIGHT_REASON_NO_RULE,
      rule: null,
      detail: '出版社「' + String(work.publisher || '(空欄)') + '」のルールが出版社別コピーライトマスタにありません',
    };
  }

  if (normalizeJapaneseText(rule.flag).indexOf(PUBLISHER_COPYRIGHT_FLAG_AUTO_PREFIX) !== 0) {
    return {
      value: null,
      reason: COPYRIGHT_REASON_MANUAL_FLAG,
      rule: rule,
      detail: '自動化フラグ「' + String(rule.flag) + '」→ 個別対応（テンプレート: 「' + String(rule.template) + '」）',
    };
  }

  if (!looksLikeCopyrightTemplate(rule.template)) {
    return {
      value: null,
      reason: COPYRIGHT_REASON_BAD_TEMPLATE,
      rule: rule,
      detail: 'テンプレートが著作権表記ではありません（©なし）: 「' + String(rule.template) + '」',
    };
  }

  var applied = applyCopyrightTemplate(rule.template, work);
  if (applied.unfilled.length > 0) {
    return {
      value: null,
      reason: COPYRIGHT_REASON_BAD_TEMPLATE,
      rule: rule,
      detail: '埋められないプレースホルダ [' + applied.unfilled.join(', ') + '] テンプレート: 「'
        + String(rule.template) + '」',
    };
  }

  return { value: applied.value, reason: COPYRIGHT_REASON_OK, rule: rule, detail: '' };
}

/**
 * Giá trị bản quyền HIỆU LỰC của 1 dòng master: cột J nếu có, không thì cột K.
 *
 * ガワ mới bỏ cột 正規コピーライト, nên quan hệ ưu tiên này chỉ còn trong code —
 * theo ghi chú ô B10 của sheet: `①「タイトル個別コピーライト」がある場合は優先して
 * 設定を行う`. Dùng cho lịch sử 過去分 (người ta muốn thấy "bản quyền cũ", không
 * phải "cột K cũ") và cho các bước sau đọc lại master này.
 *
 * @param {{individualCopyright: *, publisherCopyright: *}} record
 * @returns {*} Giá trị nguyên văn của cột J hoặc K, hoặc '' nếu cả 2 trống
 */
function effectiveCopyright(record) {
  if (normalizeJapaneseText(record.individualCopyright) !== '') return record.individualCopyright;
  if (normalizeJapaneseText(record.publisherCopyright) !== '') return record.publisherCopyright;
  return '';
}

// ==============================================================================
// PHẦN 3 — LỊCH SỬ コピーライト_過去分1..5
// ==============================================================================

/**
 * Tính mảng lịch sử mới cho 1 tác phẩm, dựa trên giá trị hiệu lực cũ và mới.
 *
 * Chỉ dịch chuyển lịch sử khi giá trị hiệu lực THỰC SỰ đổi — so bằng sameValue()
 * nên 2 giá trị chỉ khác nhau ở biến thể ký hiệu ©/Ⓒ/(C) hoặc ký tự vô hình thì
 * KHÔNG tính là đổi. Nếu không có điều kiện này, mỗi lần chạy sẽ đẩy lịch sử đi 1
 * ô, và sau 5 lần chạy là mất sạch lịch sử thật (số slot chỉ còn 5).
 *
 * Số slot giảm 10 -> 5 theo ghi chú ô B10 của ガワ mới:
 * `②旧コピーライトは5つまで保存(6つ以前はマスタから削除)`. Giá trị cũ hơn slot 5 bị
 * CẮT BỎ — đó là yêu cầu nghiệp vụ, không phải giới hạn kỹ thuật.
 *
 * @param {{copyrightHistory: Array<*>}|null} prior - Bản ghi đang có trên sheet
 * @param {*} priorEffective - Giá trị hiệu lực ĐANG có trên sheet (effectiveCopyright(prior))
 * @param {*} nextEffective - Giá trị hiệu lực vừa tính cho lần chạy này
 * @param {number} slots - CONFIG.COPYRIGHT_HISTORY_SLOTS (= 5)
 * @returns {{copyrightHistory: Array<*>, changed: boolean}}
 */
function shiftCopyrightHistory(prior, priorEffective, nextEffective, slots) {
  var history = (prior && prior.copyrightHistory ? prior.copyrightHistory : []).slice();

  // Dòng mới (chưa có giá trị cũ) hoặc giá trị không đổi -> lịch sử giữ nguyên.
  if (normalizeJapaneseText(priorEffective) === '') return { copyrightHistory: history.slice(0, slots), changed: false };
  if (sameValue(priorEffective, nextEffective)) return { copyrightHistory: history.slice(0, slots), changed: false };

  history.unshift(priorEffective);
  return { copyrightHistory: history.slice(0, slots), changed: true };
}

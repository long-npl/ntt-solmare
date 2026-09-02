// 5_copyright_master.js — định nghĩa TRỌN VẸN của コピーライトマスタ.
//
// Bảng 16 cột ở cuối file, quy tắc sinh 出版社コピーライト ở trên. Toàn bộ cột đều do
// GAS ghi — khác 顧客作品マスタ, ở đây không có cột nào phải bảo toàn cho người nhập tay.
//
// Master này KHÔNG có cột nào dùng làm khoá được (2 tác phẩm có thể chung タイトルID)
// nên nó dùng chung タイトルNo với 顧客作品マスタ. Xem docs/decisions.md #order-01

// ==============================================================================
// PHẦN 1 — PARSE 出版社別コピーライトマスタ
// ==============================================================================

// Header thật (hàng 15 của sheet): E 出版社 / G 雑誌名/レーベル / H 自動化フラグ /
// N 著者名区切り方 / O テンプレート. Tra theo TÊN nên không phụ thuộc vị trí cột.
var PUBLISHER_COPYRIGHT_REQUIRED_HEADERS = ['出版社', '雑誌名/レーベル', '自動化フラグ'];

// Cờ ở cột 自動化フラグ. Chỉ '01：自動化' (360 dòng) mới được GAS tự sinh;
// '02：個別ルール' (11 dòng) là quy tắc con người phải tự viết cho từng tác phẩm.
var PUBLISHER_COPYRIGHT_FLAG_AUTO_PREFIX = '01';

// Cột L `(出版社)事前確認` -> cột Q 出版社事前確認 của コピーライトマスタ (user bổ sung
// 2026-08-13: "出版社コピーライトマスタのL列の情報をコピーライトマスタに入れ忘れていた").
//
var PUBLISHER_PRE_CONFIRMATION_HEADER = '(出版社)事前確認';

/**
 * Parse sheet 出版社別コピーライトマスタ.
 * @param {Array<Array<*>>} rawRows - Kết quả io.js: readSheetValues()
 * @returns {Array<{publisher: *, label: *, flag: *, template: *, preConfirmation: *}>}
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
  // tryCol() chứ không col(): cột 事前確認 chỉ nuôi cột Q — một cột thông tin. Mất
  // nó mà throw ở đây thì cả parse hỏng -> publisherCopyrightError -> cột K của
  // 1.303 tác phẩm bị 据え置き theo. Đánh đổi sai. Mất cột thì Q rỗng + 1 dòng cảnh
  var colPreConfirmation = tryCol(idx, PUBLISHER_PRE_CONFIRMATION_HEADER);

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
      preConfirmation: colPreConfirmation === undefined ? '' : row[colPreConfirmation],
    });
  }
  return records;
}

function publisherCopyrightKey(publisher, label) {
  var publisherKey = normalizeJapaneseText(publisher);
  var labelKey = normalizeJapaneseText(label);
  return labelKey === '' ? publisherKey : publisherKey + '\u0000' + labelKey;
}

/**
 * Build bảng tra quy tắc bản quyền, 2 tầng: (出版社 + レーベル) và (出版社).
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
var COPYRIGHT_TEMPLATE_TOKENS = [
  { tokens: ['タイトル名', '作品名', 'タイトル'], field: 'titleName' },
  { tokens: ['著者名', '作家名', '作者名'], field: 'author' },
  { tokens: ['レーベル名', '雑誌名'], field: 'label' },
  { tokens: ['出版社名'], field: 'publisher' },
];

// Placeholder KHÔNG THỂ điền từ dữ liệu CMS — mỗi cái đòi một thông tin mà CMS
// không cấp riêng lẻ:
//   原作者名 / 漫画家名 / 作画者名       -> tách riêng vai trò tác giả; CMS gộp 1 chuỗi
var COPYRIGHT_TEMPLATE_UNSUPPORTED_TOKENS = [
  'ローマ字著者名', '英字著者名', '英字作者名', 'イラストレーター名', '原作者名',
  '漫画家名', '作画者名', '発行元社名', '会社名', 'ローマ字', '漫画著者', '原作者',
];

// 2 placeholder viết tắt kiểu '©著 ©原作 ©SANKYO ©デジタルアトラクション' (nghĩa là
// ©<tác giả> ©<nguyên tác> ...) — cũng không điền được vì CMS gộp mọi vai trò vào
// 1 chuỗi.
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
 * @param {*} template - Cột テンプレート, nguyên văn
 * @param {{titleName: *, author: *, label: *, publisher: *}} work
 * @returns {{value: string, unfilled: Array<string>}}
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
 * Tra 出版社事前確認 (cột Q của コピーライトマスタ) cho 1 tác phẩm.
 * @param {{publisher: *, label: *}} work
 * @param {Map<string, object>} rulesLookup - buildPublisherCopyrightLookup()
 * @returns {*} Giá trị cột L, hoặc '' nếu không có dòng quy tắc / ô trống
 */
function resolvePublisherPreConfirmation(work, rulesLookup) {
  var rule = rulesLookup.get(publisherCopyrightKey(work.publisher, work.label));
  if (rule === undefined) rule = rulesLookup.get(publisherCopyrightKey(work.publisher, ''));
  if (rule === undefined) return '';
  return rule.preConfirmation === null || rule.preConfirmation === undefined ? '' : rule.preConfirmation;
}

/**
 * Giá trị bản quyền HIỆU LỰC của 1 dòng master: cột J nếu có, không thì cột K.
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


// ==============================================================================
// BẢNG 16 CỘT
// ==============================================================================

/** Tên header thật của 1 cột lịch sử (slot=1 -> 'コピーライト_過去分1'). */
function copyrightHistoryHeaderName(slot) {
  return 'コピーライト_過去分' + slot;
}

/**
 * コピーライトマスタ — mỗi cột một dòng.
 *
 * 8 cột định danh đầu copy nguyên văn từ danh sách đã lọc của 顧客作品マスタ, đúng
 * ghi chú ô B9 của ガワ: `①顧客作品マスタ＞B~I列`.
 *
 * 5 slot lịch sử mang skipCompare: chúng là HỆ QUẢ của việc bản quyền đổi, không
 * phải nguyên nhân — so chúng sẽ tạo vòng "đổi lịch sử -> ghi -> đọc lại -> thấy đổi".
 *
 * 出版社事前確認 là optional: cột này 池永 phải thêm tay và có thể chưa tồn tại trên
 * ガワ. Cột tuỳ chọn không vào requiredHeaders nên sheet thiếu nó vẫn chạy được.
 */
var COPYRIGHT_COLUMNS = [
  { header: 'タイトルNo', field: 'titleNo', from: 'customer', write: '上書' },
  { header: 'CMS ID', field: 'cmsId', from: 'customer', write: '上書' },
  { header: 'タイトルID', field: 'titleId', from: 'customer', write: '上書' },
  { header: 'タイトル名', field: 'titleName', from: 'customer', write: '上書' },
  { header: '作家名', field: 'author', from: 'customer', write: '上書' },
  { header: 'ジャンル', field: 'genre', from: 'customer', write: '上書' },
  { header: '出版社', field: 'publisher', from: 'customer', write: '上書' },
  { header: 'レーベル名', field: 'label', from: 'customer', write: '上書' },
  { header: 'タイトル個別コピーライト(あれば優先使用)', field: 'individualCopyright', from: 'customer', write: '上書' },
  { header: '出版社コピーライト', field: 'publisherCopyright', from: 'derive', rule: null, write: '上書' },
  { header: 'コピーライト_過去分1', field: 'history1', from: 'derive', rule: null, write: '上書', skipCompare: true },
  { header: 'コピーライト_過去分2', field: 'history2', from: 'derive', rule: null, write: '上書', skipCompare: true },
  { header: 'コピーライト_過去分3', field: 'history3', from: 'derive', rule: null, write: '上書', skipCompare: true },
  { header: 'コピーライト_過去分4', field: 'history4', from: 'derive', rule: null, write: '上書', skipCompare: true },
  { header: 'コピーライト_過去分5', field: 'history5', from: 'derive', rule: null, write: '上書', skipCompare: true },
  { header: '出版社事前確認', field: 'preConfirmation', from: 'derive', rule: null, write: '上書', optional: true },
];

/**
 * Dựng 1 dòng コピーライトマスタ từ 1 work đã có タイトルNo và bản ghi cũ (nếu có).
 *
 * `prior` là dòng đang có trên sheet, tra theo タイトルNo — cần nó để shift lịch sử.
 */
function buildCopyrightRecord(work, prior) {
  var nextEffective = effectiveCopyright(work);
  var priorEffective = prior === null ? '' : effectiveCopyright(prior);
  var shifted = shiftCopyrightHistory(prior, priorEffective, nextEffective,
    CONFIG.COPYRIGHT_HISTORY_SLOTS);

  var record = {
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
    preConfirmation: work.preConfirmation,
  };
  // Mảng lịch sử -> 5 field phẳng, để engine ghi được như mọi cột khác.
  for (var slot = 1; slot <= CONFIG.COPYRIGHT_HISTORY_SLOTS; slot++) {
    record['history' + slot] = shifted.copyrightHistory[slot - 1] || '';
  }
  return record;
}

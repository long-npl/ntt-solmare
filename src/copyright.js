// copyright.js — BẢN QUYỀN: quy tắc NXB -> resolve 4 tầng -> lịch sử 過去
//
// Gom 3 file cũ (copyright.js + copyright.js +
// copyright.js) vì cả 3 chỉ phục vụ đúng một vấn đề: xác định
// 正規コピーライト cho 1 tác phẩm, và không có chỗ nào khác trong GAS❶ dùng tới.
//
// Ba phần, theo đúng thứ tự dùng:
//   1. PARSE quy tắc  — 基本のC表記 (tầng 3) + 5 sheet riêng NXB (tầng 2)
//   2. RESOLVE 4 tầng — CMS cột コピーライト -> sheet NXB -> công thức chung -> cá biệt
//   3. LỊCH SỬ        — dịch chuyển CopyRight過去1-10 khi giá trị đổi
//
// Toàn bộ là hàm PURE (không đụng SpreadsheetApp).

// ==============================================================================
// PHẦN 1 — PARSE QUY TẮC BẢN QUYỀN THEO NXB
// ==============================================================================

var BASIC_NOTATION_REQUIRED_HEADERS = ['事前確認', '©表記記載有無', '©表記ルール'];

/**
 * Parse sheet 基本のC表記 — bảng "công thức" bản quyền mặc định theo từng
 * NXB/レーベル, dùng khi KHÔNG có bản quyền xác nhận cụ thể nào khác (tầng 3,
 * xem copyright.js: applyBasicNotationTemplate() để biết cách công thức
 * này được điền giá trị thật).
 *
 * NGOẠI LỆ DUY NHẤT trong toàn bộ codebase không tra được cột bằng tên: header
 * "雑誌・レーベル" (tên NXB/レーベル) hiển thị LỆCH 1 CỘT sang phải so với dữ liệu
 * thật — ô ngay dưới header "雑誌・レーベル" luôn TRỐNG, còn tên NXB thật nằm ở
 * cột bên TRÁI nó. Đã xác minh thủ công (không phải merged cell, không phải
 * lỗi đọc file — đây là cách sheet gốc được người dùng tạo ra từ đầu). Vì cột
 * dữ liệu đó không có header text của riêng nó để tra theo tên, phải định vị
 * bằng OFFSET TƯƠNG ĐỐI: luôn nằm 2 cột về bên trái của cột "事前確認"
 * (label | <cột luôn trống> | 事前確認). Nếu sau này ai chèn thêm cột NẰM
 * GIỮA label và "事前確認", offset -2 này cần được cập nhật lại thủ công.
 *
 * @param {Array<Array<*>>} rawRows - Kết quả sheet.getDataRange().getValues()
 * @returns {Map<string, string>} Map tên NXB/レーベル (đã chuẩn hoá qua
 *   normalizeJapaneseText() — xem common.js/master.js) -> chuỗi công thức bản
 *   quyền thô (vd "©著者名/A-KAGURA", còn chứa placeholder text cần
 *   applyBasicNotationTemplate() thay thế sau)
 */
function parseBasicNotation(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, BASIC_NOTATION_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colRule = col(idx, '©表記ルール');
  var colPreCheck = col(idx, '事前確認');
  var colLabel = colPreCheck - 2; // xem giải thích NGOẠI LỆ ở JSDoc phía trên

  var map = new Map();
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[colLabel]) continue;
    var label = normalizeJapaneseText(row[colLabel]);
    var rule = row[colRule];
    if (rule) map.set(label, rule);
  }
  return map;
}

// LINEコピーライト一覧: không có cột タイトルID riêng -> key theo tên tác phẩm
var LINE_REQUIRED_HEADERS = ['タイトル', '著者', '備考'];

/**
 * Parse sheet LINEコピーライト一覧 (bản quyền các tác phẩm hợp tác với LINE).
 * Không có cột タイトルID trên sheet này, nên chỉ có thể tra theo tên tác phẩm.
 *
 * @param {Array<Array<*>>} rawRows
 * @returns {Map<string, string>} Map tên tác phẩm (đã chuẩn hoá qua normalizeJapaneseText()) -> bản quyền (©欧文表記 1)
 */
function parseLineSheet(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, LINE_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colTitle = col(idx, 'タイトル');
  var colCopyright = col(idx, '©欧文表記 1');

  var map = new Map();
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[colTitle]) continue;
    var titleName = normalizeJapaneseText(row[colTitle]);
    var copyright = row[colCopyright];
    if (copyright) map.set(titleName, copyright);
  }
  return map;
}

// スクエニコピーライト一覧: header thật nằm sau vài dòng ghi chú -> tự dò vị trí hàng
var SQEX_REQUIRED_HEADERS = ['タイトル名', '著者名', 'コピーライト'];

/**
 * Parse sheet スクエニコピーライト一覧 (bản quyền các tác phẩm SQUARE ENIX).
 * Sheet này có 2 dòng ghi chú dài ở đầu trước khi tới header thật —
 * resolveHeaderIndex() tự dò ra đúng hàng, không hardcode số hàng.
 *
 * Cố tình lấy cột "コピーライト" (dạng đầy đủ), KHÔNG lấy "コピーライト(省略)"
 * (dạng viết tắt cho banner hẹp chỗ) — vì "コピーライト" và "コピーライト(省略)"
 * là 2 tên khác nhau sau normalize nên col() sẽ không nhầm lẫn giữa 2 cột này.
 *
 * @param {Array<Array<*>>} rawRows
 * @returns {Map<string, string>} Map tên tác phẩm (đã chuẩn hoá qua normalizeJapaneseText()) -> bản quyền dạng đầy đủ
 */
function parseSquareEnixSheet(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, SQEX_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colTitle = col(idx, 'タイトル名');
  var colCopyright = col(idx, 'コピーライト'); // dạng đầy đủ, không phải "コピーライト(省略)"

  var map = new Map();
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[colTitle]) continue;
    var copyright = row[colCopyright];
    if (copyright) map.set(normalizeJapaneseText(row[colTitle]), copyright);
  }
  return map;
}

// リブレコピーライト: có cả タイトルＩＤ và タイトル -> key theo cả 2
var LIBRE_REQUIRED_HEADERS = ['タイトルＩＤ', 'タイトル', 'コピーライト'];

/**
 * Parse sheet リブレコピーライト (bản quyền các tác phẩm NXB Libre — riêng cho
 * trường hợp đặc biệt "vẫn giữ copyright libre dù chạy trên kênh quảng cáo
 * người lớn"). Sheet này có cả タイトルＩＤ lẫn タイトル nên map được key theo
 * CẢ HAI, để resolver.js match được dù chỉ có 1 trong 2 giá trị.
 *
 * @param {Array<Array<*>>} rawRows
 * @returns {Map<string, string>} Map key (titleId dạng String, hoặc titleName
 *   đã chuẩn hoá qua normalizeJapaneseText()) -> bản quyền. Cùng 1 tác phẩm
 *   có thể xuất hiện 2 lần trong map (1 lần theo ID, 1 lần theo tên) trỏ tới
 *   cùng giá trị bản quyền.
 */
function parseLibreSheet(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, LIBRE_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colId = col(idx, 'タイトルＩＤ');
  var colTitle = col(idx, 'タイトル');
  var colCopyright = col(idx, 'コピーライト');

  var map = new Map();
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[colCopyright]) continue;
    var copyright = row[colCopyright];
    if (row[colId]) map.set(String(row[colId]), copyright);
    if (row[colTitle]) map.set(normalizeJapaneseText(row[colTitle]), copyright);
  }
  return map;
}

// オーバーラップ_コピーライト一覧: header lệch sang cột B trở đi, cột A luôn trống
var OVERLAP_REQUIRED_HEADERS = ['タイトルＩＤ', 'タイトル', 'コピーライト'];

/**
 * Parse sheet オーバーラップ_コピーライト一覧 (bản quyền các tác phẩm NXB Overlap).
 * Cấu trúc giống hệt リブレコピーライト (key theo cả ID lẫn tên) nhưng nằm ở
 * vị trí hàng/cột khác — resolveHeaderIndex() tự xử lý khác biệt này.
 *
 * @param {Array<Array<*>>} rawRows
 * @returns {Map<string, string>} Map key (titleId hoặc titleName đã chuẩn hoá qua normalizeJapaneseText()) -> bản quyền
 */
function parseOverlapSheet(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, OVERLAP_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colId = col(idx, 'タイトルＩＤ');
  var colTitle = col(idx, 'タイトル');
  var colCopyright = col(idx, 'コピーライト');

  var map = new Map();
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[colCopyright]) continue;
    var copyright = row[colCopyright];
    if (row[colId]) map.set(String(row[colId]), copyright);
    if (row[colTitle]) map.set(normalizeJapaneseText(row[colTitle]), copyright);
  }
  return map;
}

// ヒーローズコピーライト一覧: header ở hàng đầu tiên
var HEROES_REQUIRED_HEADERS = ['タイトル名', 'TID', 'COPYRIGHT'];

/**
 * Parse sheet ヒーローズコピーライト一覧 (bản quyền các tác phẩm NXB Heroes).
 * Header dùng tên cột tiếng Anh (TID, COPYRIGHT) thay vì tiếng Nhật như các
 * sheet khác — vẫn tra bằng tên như bình thường, chỉ khác chuỗi truyền vào col().
 *
 * @param {Array<Array<*>>} rawRows
 * @returns {Map<string, string>} Map key (titleId hoặc titleName đã chuẩn hoá qua normalizeJapaneseText()) -> bản quyền
 */
function parseHeroesSheet(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, HEROES_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colTitle = col(idx, 'タイトル名');
  var colId = col(idx, 'TID');
  var colCopyright = col(idx, 'COPYRIGHT');

  var map = new Map();
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[colCopyright]) continue;
    var copyright = row[colCopyright];
    if (row[colId]) map.set(String(row[colId]), copyright);
    if (row[colTitle]) map.set(normalizeJapaneseText(row[colTitle]), copyright);
  }
  return map;
}

/**
 * Registry các sheet quy tắc riêng theo NXB — đây là "danh sách NXB nào có
 * sheet bản quyền riêng" mà copyright.js: resolveCopyright() dùng ở TẦNG 2.
 *
 * Mỗi entry gồm:
 *   - key: định danh nội bộ, dùng làm key trong object publisherMaps ở main.js
 *     (vd publisherMaps['LINE'] = kết quả parseLineSheet())
 *   - sheetName: tên sheet thật trong Google Sheets (dùng để readSheetValues())
 *   - publisherAliases: các chuỗi con để nhận diện 1 NXB thuộc registry này —
 *     xem resolvePublisherAliasMatch() bên dưới. Vd tác phẩm có 出版社 =
 *     "株式会社スクウェア・エニックス" sẽ khớp entry SQUARE_ENIX vì alias
 *     "スクウェア・エニックス" là 1 chuỗi con của tên NXB đó.
 *   - parse: hàm parse tương ứng ở trên
 *
 * MUỐN THÊM NXB MỚI CÓ SHEET RIÊNG: chỉ cần thêm 1 entry vào mảng này (viết
 * thêm 1 hàm parseXxxSheet() theo cấu trúc sheet mới, rồi thêm entry) —
 * KHÔNG cần sửa logic ở copyright.js hay main.js.
 */
var PUBLISHER_SHEET_PARSERS = [
  { key: 'LINE', sheetName: 'LINEコピーライト一覧', publisherAliases: ['LINE'], parse: parseLineSheet },
  { key: 'SQUARE_ENIX', sheetName: 'スクエニコピーライト一覧', publisherAliases: ['スクエニ', 'スクウェア・エニックス', 'SQUARE ENIX', 'SQEX'], parse: parseSquareEnixSheet },
  { key: 'LIBRE', sheetName: 'リブレコピーライト', publisherAliases: ['リブレ', 'libre'], parse: parseLibreSheet },
  { key: 'OVERLAP', sheetName: 'オーバーラップ_コピーライト一覧', publisherAliases: ['オーバーラップ'], parse: parseOverlapSheet },
  { key: 'HEROES', sheetName: 'ヒーローズコピーライト一覧', publisherAliases: ['ヒーローズ'], parse: parseHeroesSheet },
];

/**
 * Tìm entry registry ĐẦU TIÊN có publisherAliases khớp (substring, phân biệt
 * hoa/thường) với tên NXB của 1 tác phẩm. Dùng bởi copyright.js để
 * quyết định tác phẩm này có nên tra ở tầng 2 (sheet riêng NXB) hay không, và
 * nếu có thì tra ở sheet/map nào.
 *
 * @param {string} publisherName - Tên NXB của tác phẩm (cột 出版社)
 * @param {Array<object>} registry - Thường truyền PUBLISHER_SHEET_PARSERS vào đây
 * @returns {object|null} Entry registry khớp đầu tiên, hoặc null nếu không NXB nào khớp
 */
function resolvePublisherAliasMatch(publisherName, registry) {
  if (!publisherName) return null;
  var normalizedPublisherName = normalizeJapaneseText(publisherName);
  for (var i = 0; i < registry.length; i++) {
    var entry = registry[i];
    for (var j = 0; j < entry.publisherAliases.length; j++) {
      if (normalizedPublisherName.indexOf(normalizeJapaneseText(entry.publisherAliases[j])) !== -1) return entry;
    }
  }
  return null;
}


// ==============================================================================
// PHẦN 2 — RESOLVE 4 TẦNG
// ==============================================================================

var COPYRIGHT_TITLE_TOKENS = ['作品名', 'タイトル名'];
var COPYRIGHT_AUTHOR_TOKENS = ['漫画家名・原作者名', '著者名', '作家名'];

/**
 * Thay các placeholder text trong công thức 基本のC表記 (vd "著者名", "作品名")
 * bằng giá trị thật của tác phẩm — dùng ở TẦNG 3.
 *
 * Cách hoạt động: quét COPYRIGHT_TITLE_TOKENS theo thứ tự, thay TOKEN ĐẦU
 * TIÊN tìm thấy trong template bằng work.titleName (chỉ thay 1 lần, dùng
 * String.replace không có cờ /g); tương tự với COPYRIGHT_AUTHOR_TOKENS và
 * work.author. Đây là xử lý HEURISTIC đơn giản — các công thức trong sheet
 *基本のC表記 là text tự do do con người viết (có thể nhiều dòng, có điều kiện
 * "nếu... thì..."), nên hàm này KHÔNG bao phủ được mọi trường hợp phức tạp,
 * chỉ xử lý được các mẫu placeholder đơn giản, phổ biến nhất.
 *
 * @param {string} template - Chuỗi công thức thô từ parseBasicNotation() (vd "©著者名/A-KAGURA")
 * @param {{titleName: string, author: string}} work - Tác phẩm cần điền giá trị thật vào
 * @returns {string} Chuỗi bản quyền đã thay placeholder (vd "©Nguyễn Văn A/A-KAGURA")
 */
function applyBasicNotationTemplate(template, work) {
  var text = template;
  COPYRIGHT_TITLE_TOKENS.some(function (token) {
    if (text.indexOf(token) === -1) return false;
    text = text.replace(token, work.titleName);
    return true;
  });
  COPYRIGHT_AUTHOR_TOKENS.some(function (token) {
    if (text.indexOf(token) === -1) return false;
    text = text.replace(token, work.author);
    return true;
  });
  return text;
}

/**
 * Xác định bản quyền chính thức (正規コピーライト) cho 1 tác phẩm, theo đúng 4
 * tầng ưu tiên mô tả ở đầu file. Đây là hàm được main.js gọi cho TỪNG tác
 * phẩm trong builtCustomerRows, trước khi build コピーライトマスタ.
 *
 * @param {{titleId: *, titleName: string, author: string, publisher: string, copyrightU: *}} work
 *   Tác phẩm cần xác định bản quyền (1 phần tử từ buildCustomerWorkRows()).
 *   copyrightU (cột コピーライト của CMS) CHÍNH LÀ TẦNG 1 — đọc trực tiếp từ
 *   work, không qua map tra theo cmsId như trước (spec §9.1). work.cmsId KHÔNG
 *   còn được dùng ở hàm này.
 * @param {Array<object>} publisherRegistry - Danh sách NXB có sheet riêng, truyền
 *   PUBLISHER_SHEET_PARSERS (copyright.js) vào đây
 * @param {Object<string, Map<string,string>>} publisherMaps - Kết quả parse của
 *   từng sheet riêng NXB, key = registry entry.key (vd publisherMaps['LINE'])
 * @param {Map<string, string>} basicNotationMap - Tầng 3, từ copyright.js: parseBasicNotation()
 * @returns {{value: string|null, tier: 1|2|3|4}}
 *   value: chuỗi bản quyền đã xác định, hoặc null nếu rơi vào tầng 4 (cá biệt)
 *   tier: tầng nào đã cho ra kết quả — dùng để ghi vào đúng cột
 *   CopyRight(個別ルールの場合)/CopyRight自動生成 khi ghi コピーライトマスタ
 *   (xem io.js: copyrightRecordToRow())
 */
function resolveCopyright(work, publisherRegistry, publisherMaps, basicNotationMap) {
  // Tầng 1: CMS cột コピーライト — ưu tiên cao nhất vì đây là giá trị con người
  // đã trực tiếp xác nhận trong hệ thống CMS cho chính tác phẩm này. Đọc TRỰC
  // TIẾP từ work (buildCustomerWorkRows() đã mang sẵn copyrightU sang), không
  // qua map tra theo cmsId như trước — xem spec §9.1.
  if (work.copyrightU) return { value: work.copyrightU, tier: 1 };

  // Tầng 2: sheet riêng theo NXB — dùng resolvePublisherAliasMatch()
  // (copyright.js) để tìm xem NXB của tác phẩm này có sheet
  // bản quyền riêng hay không, rồi tra map tương ứng theo titleId (ưu tiên)
  // hoặc titleName (dự phòng nếu sheet đó không có cột ID).
  var registryEntry = resolvePublisherAliasMatch(work.publisher, publisherRegistry);
  if (registryEntry) {
    var map = publisherMaps[registryEntry.key];
    if (map) {
      var byId = work.titleId !== undefined ? map.get(String(work.titleId)) : undefined;
      var byName = work.titleName ? map.get(normalizeJapaneseText(work.titleName)) : undefined;
      var tier2Value = byId || byName;
      if (tier2Value) return { value: tier2Value, tier: 2 };
    }
  }

  // Tầng 3: 基本のC表記 tự sinh — tra công thức chung theo NXB, điền giá trị
  // thật của tác phẩm vào chỗ placeholder.
  var template = work.publisher ? basicNotationMap.get(normalizeJapaneseText(work.publisher)) : undefined;
  if (template) return { value: applyBasicNotationTemplate(template, work), tier: 3 };

  // Tầng 4: cá biệt — không tầng nào khớp. CỐ TÌNH trả về null thay vì tự bịa
  // 1 giá trị nào đó — main.js sẽ đưa tác phẩm này vào danh sách irregularTitles
  // để ghi log + báo Slack, chờ con người xử lý tay.
  return { value: null, tier: 4 };
}


// ==============================================================================
// PHẦN 3 — LỊCH SỬ CopyRight過去1-10
// ==============================================================================

/**
 * Quyết định giá trị 正規コピーライト mới và mảng lịch sử CopyRight過去1..N cho
 * 1 tác phẩm, dựa trên giá trị ĐANG LƯU (existingRecord, đọc từ コピーライト
 * マスタ trước khi chạy) và giá trị MỚI vừa tính ra (newValue).
 *
 * QUY TẮC: chỉ dịch chuyển lịch sử khi giá trị THỰC SỰ THAY ĐỔI so với lần
 * trước — nếu newValue giống hệt currentValue, trả về y nguyên, KHÔNG đụng
 * vào mảng lịch sử (dù hàm này được gọi lại ở MỌI lần chạy 9h/17h, kể cả khi
 * không có gì thay đổi). Khi có thay đổi thật, giá trị CŨ được đẩy vào ĐẦU
 * mảng lịch sử (unshift, tức "過去1" luôn là giá trị gần nhất trước đó), các
 * giá trị cũ hơn bị đẩy lùi ra sau; nếu mảng vượt quá maxSlots, giá trị CŨ
 * NHẤT (cuối mảng) bị loại bỏ.
 *
 * Trường hợp tác phẩm CHƯA từng có 正規コピーライト (currentValue null/rỗng —
 * vd tác phẩm mới, hoặc trước đó rơi vào tầng 4/cá biệt): không coi đó là
 * "thay đổi cần lưu lịch sử" — không có gì để đẩy vào 過去1 cả (nếu không có
 * check này, lần đầu tiên có giá trị sẽ tạo ra 1 mục lịch sử rỗng vô nghĩa).
 *
 * So sánh bằng sameValue() (common.js/master.js), KHÔNG dùng `===` trực tiếp:
 * newValue có thể là `undefined` (resolveCopyright() không thay đổi placeholder
 * cho tier 4), còn currentValue đọc lại từ sheet sau khi đã ghi 1 giá trị
 * rỗng trước đó sẽ là chuỗi `''`, không phải `undefined`/`null` — so sánh
 * `===` trực tiếp sẽ coi đây là "đã đổi" và dịch chuyển lịch sử một cách sai
 * lệch ở MỌI lần chạy cho các tác phẩm cá biệt (đã kiểm chứng bug này qua dữ
 * liệu thật, cùng gốc với bug tương tự ở customerIsEqualFn/copyrightIsEqualFn
 * trong main.js).
 *
 * @param {{copyrightCurrent: string|null, copyrightHistory: Array<string>}} existingRecord
 *   Bản ghi コピーライトマスタ hiện tại của tác phẩm này (đọc từ sheet, hoặc
 *   {copyrightCurrent: null, copyrightHistory: []} nếu tác phẩm chưa từng có dòng)
 * @param {string|null} newValue - Giá trị 正規コピーライト vừa tính ra ở lần chạy này
 *   (kết quả resolveCopyright().value — có thể null nếu tầng 4/cá biệt)
 * @param {number} maxSlots - Số cột lịch sử tối đa được phép giữ (CONFIG.COPYRIGHT_HISTORY_SLOTS = 10)
 * @returns {{copyrightCurrent: string|null, copyrightHistory: Array<string>}}
 *   Giá trị mới để main.js đưa vào record ghi lên コピーライトマスタ
 */
function shiftCopyrightHistory(existingRecord, newValue, maxSlots) {
  var currentValue = existingRecord.copyrightCurrent || null;
  var history = existingRecord.copyrightHistory ? existingRecord.copyrightHistory.slice() : [];

  if (sameValue(newValue, currentValue)) {
    return { copyrightCurrent: currentValue, copyrightHistory: history };
  }

  if (currentValue) {
    history.unshift(currentValue);
    if (history.length > maxSlots) history = history.slice(0, maxSlots);
  }

  return { copyrightCurrent: newValue, copyrightHistory: history };
}

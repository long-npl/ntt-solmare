// sources/copyrightRules.js — 基本のC表記 + 5 sheet quy tắc riêng theo NXB
// (tất cả nằm trong file 出版社からの追記ルールと外部出稿NGタイトル)
//
// Vai trò trong toàn bộ luồng: cung cấp dữ liệu cho TẦNG 2 và TẦNG 3 của
// logic ưu tiên bản quyền (xem logic/copyrightResolver.js):
//   - Tầng 2 (ưu tiên hơn): 5 hàm parseXxxSheet() bên dưới + registry
//     PUBLISHER_SHEET_PARSERS — mỗi NXB lớn (LINE, スクエニ, リブレ,
//     オーバーラップ, ヒーローズ) có 1 sheet riêng liệt kê bản quyền CHÍNH XÁC
//     đã xác nhận cho từng tác phẩm của họ.
//   - Tầng 3 (dự phòng khi không có gì ở trên): parseBasicNotation() —
//     mỗi NXB/レーベル có 1 "công thức" chung để GAS tự sinh bản quyền khi
//     chưa ai xác nhận số liệu cụ thể (vd "©著者名/A-KAGURA").
//
// Tất cả các cột đều tra theo TÊN header (tự dò cả vị trí hàng header, vì mỗi
// sheet header nằm ở hàng khác nhau), ngoại trừ 1 ngoại lệ đã biết ở
// parseBasicNotation (xem comment bên trong hàm đó).

var BASIC_NOTATION_REQUIRED_HEADERS = ['事前確認', '©表記記載有無', '©表記ルール'];

/**
 * Parse sheet 基本のC表記 — bảng "công thức" bản quyền mặc định theo từng
 * NXB/レーベル, dùng khi KHÔNG có bản quyền xác nhận cụ thể nào khác (tầng 3,
 * xem copyrightResolver.applyBasicNotationTemplate() để biết cách công thức
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
 * @returns {Map<string, string>} Map tên NXB/レーベル (đã trim) -> chuỗi công
 *   thức bản quyền thô (vd "©著者名/A-KAGURA", còn chứa placeholder text cần
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
    var label = String(row[colLabel]).trim();
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
 * @returns {Map<string, string>} Map tên tác phẩm (đã trim) -> bản quyền (©欧文表記 1)
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
    var titleName = String(row[colTitle]).trim();
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
 * @returns {Map<string, string>} Map tên tác phẩm (đã trim) -> bản quyền dạng đầy đủ
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
    if (copyright) map.set(String(row[colTitle]).trim(), copyright);
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
 *   đã trim) -> bản quyền. Cùng 1 tác phẩm có thể xuất hiện 2 lần trong map
 *   (1 lần theo ID, 1 lần theo tên) trỏ tới cùng giá trị bản quyền.
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
    if (row[colTitle]) map.set(String(row[colTitle]).trim(), copyright);
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
 * @returns {Map<string, string>} Map key (titleId hoặc titleName đã trim) -> bản quyền
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
    if (row[colTitle]) map.set(String(row[colTitle]).trim(), copyright);
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
 * @returns {Map<string, string>} Map key (titleId hoặc titleName đã trim) -> bản quyền
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
    if (row[colTitle]) map.set(String(row[colTitle]).trim(), copyright);
  }
  return map;
}

/**
 * Registry các sheet quy tắc riêng theo NXB — đây là "danh sách NXB nào có
 * sheet bản quyền riêng" mà copyrightResolver.resolveCopyright() dùng ở TẦNG 2.
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
 * KHÔNG cần sửa logic ở copyrightResolver.js hay main.js.
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
 * hoa/thường) với tên NXB của 1 tác phẩm. Dùng bởi copyrightResolver.js để
 * quyết định tác phẩm này có nên tra ở tầng 2 (sheet riêng NXB) hay không, và
 * nếu có thì tra ở sheet/map nào.
 *
 * @param {string} publisherName - Tên NXB của tác phẩm (cột 出版社)
 * @param {Array<object>} registry - Thường truyền PUBLISHER_SHEET_PARSERS vào đây
 * @returns {object|null} Entry registry khớp đầu tiên, hoặc null nếu không NXB nào khớp
 */
function resolvePublisherAliasMatch(publisherName, registry) {
  if (!publisherName) return null;
  for (var i = 0; i < registry.length; i++) {
    var entry = registry[i];
    for (var j = 0; j < entry.publisherAliases.length; j++) {
      if (publisherName.indexOf(entry.publisherAliases[j]) !== -1) return entry;
    }
  }
  return null;
}

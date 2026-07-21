// sources/copyrightRules.js — 基本のC表記 + 5 sheet quy tắc riêng theo NXB
// (tất cả nằm trong file 出版社からの追記ルールと外部出稿NGタイトル)
//
// Tất cả các cột đều tra theo TÊN header (tự dò cả vị trí hàng header, vì mỗi
// sheet header nằm ở hàng khác nhau), ngoại trừ 1 ngoại lệ đã biết ở
// parseBasicNotation (xem comment bên trong).

var BASIC_NOTATION_REQUIRED_HEADERS = ['事前確認', '©表記記載有無', '©表記ルール'];

function parseBasicNotation(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, BASIC_NOTATION_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colRule = col(idx, '©表記ルール');
  var colPreCheck = col(idx, '事前確認');

  // NGOẠI LỆ DUY NHẤT không tra được bằng tên: trong sheet này, header
  // "雑誌・レーベル" hiển thị lệch 1 cột so với dữ liệu NXB/レーベル thật (cột ngay
  // dưới header đó luôn trống, dữ liệu nằm ở cột bên trái nó) — đã xác minh thủ
  // công (không phải merged cell, không phải bug đọc file). Cột dữ liệu label
  // vì vậy không có header text riêng để tra theo tên; định vị bằng offset
  // tương đối 2 cột về bên trái của "事前確認" (label | <cột luôn trống> | 事前確認).
  // Nếu ai đó chèn thêm cột giữa "雑誌・レーベル"/label và "事前確認", offset này
  // cần được cập nhật lại thủ công.
  var colLabel = colPreCheck - 2;

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

// Registry các sheet quy tắc riêng theo NXB (tầng ưu tiên 2, spec §6).
// Muốn thêm NXB mới: thêm 1 entry vào đây (không cần sửa logic resolver).
var PUBLISHER_SHEET_PARSERS = [
  { key: 'LINE', sheetName: 'LINEコピーライト一覧', publisherAliases: ['LINE'], parse: parseLineSheet },
  { key: 'SQUARE_ENIX', sheetName: 'スクエニコピーライト一覧', publisherAliases: ['スクエニ', 'スクウェア・エニックス', 'SQUARE ENIX', 'SQEX'], parse: parseSquareEnixSheet },
  { key: 'LIBRE', sheetName: 'リブレコピーライト', publisherAliases: ['リブレ', 'libre'], parse: parseLibreSheet },
  { key: 'OVERLAP', sheetName: 'オーバーラップ_コピーライト一覧', publisherAliases: ['オーバーラップ'], parse: parseOverlapSheet },
  { key: 'HEROES', sheetName: 'ヒーローズコピーライト一覧', publisherAliases: ['ヒーローズ'], parse: parseHeroesSheet },
];

// Trả về registry entry đầu tiên có publisherAliases khớp (substring) với publisherName, hoặc null
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

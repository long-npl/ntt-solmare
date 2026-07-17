// sources/copyrightRules.js — 基本のC表記 + 5 sheet quy tắc riêng theo NXB
// (tất cả nằm trong file 出版社からの追記ルールと外部出稿NGタイトル)

// 基本のC表記: header hàng 1 (index 0). LƯU Ý QUAN TRỌNG: nhãn cột
// "雑誌・レーベル" hiển thị ở cột B (index 1) nhưng dữ liệu tên NXB/レーベル thật
// lại nằm ở cột A (index 0) — cột B luôn trống. Các cột còn lại (事前確認,
// ©表記ルール...) thẳng hàng bình thường với header của chúng.
function parseBasicNotation(rawRows) {
  var map = new Map();
  for (var i = 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[0]) continue;
    var label = String(row[0]).trim();
    var rule = row[6]; // ©表記ルール
    if (rule) map.set(label, rule);
  }
  return map;
}

// LINEコピーライト一覧: header hàng 2 (index 1), không có cột タイトルID -> key theo tên
function parseLineSheet(rawRows) {
  var map = new Map();
  for (var i = 2; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[0]) continue;
    var titleName = String(row[0]).trim();
    var copyright = row[2]; // ©欧文表記 1
    if (copyright) map.set(titleName, copyright);
  }
  return map;
}

// スクエニコピーライト一覧: header thật ở hàng 10 (index 9), data từ hàng 11 (index 10)
function parseSquareEnixSheet(rawRows) {
  var map = new Map();
  for (var i = 10; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[3]) continue;
    var titleName = String(row[3]).trim();
    var copyright = row[5]; // コピーライト (dạng đầy đủ)
    if (copyright) map.set(titleName, copyright);
  }
  return map;
}

// リブレコピーライト: header hàng 2 (index 1): タイトルＩＤ, タイトル, コピーライト
function parseLibreSheet(rawRows) {
  var map = new Map();
  for (var i = 2; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[2]) continue;
    var copyright = row[2];
    if (row[0]) map.set(String(row[0]), copyright);
    if (row[1]) map.set(String(row[1]).trim(), copyright);
  }
  return map;
}

// オーバーラップ_コピーライト一覧: header hàng 3 (index 2), cột lệch sang B-E
function parseOverlapSheet(rawRows) {
  var map = new Map();
  for (var i = 3; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[3]) continue;
    var copyright = row[3];
    if (row[1]) map.set(String(row[1]), copyright);
    if (row[2]) map.set(String(row[2]).trim(), copyright);
  }
  return map;
}

// ヒーローズコピーライト一覧: header hàng 1 (index 0): タイトル名, TID, COPYRIGHT
function parseHeroesSheet(rawRows) {
  var map = new Map();
  for (var i = 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[2]) continue;
    var copyright = row[2];
    if (row[1]) map.set(String(row[1]), copyright);
    if (row[0]) map.set(String(row[0]).trim(), copyright);
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

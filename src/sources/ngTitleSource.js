// sources/ngTitleSource.js — parse 外部出稿用NGタイトル
// (nằm trong file 出版社からの追記ルールと外部出稿NGタイトル)
//
// Header ở hàng 2 (index 1), data từ hàng 3 (index 2).
// Cột: 出版社(0), 記入日(1), 更新日(2), タイトルID(3), タイトル名(4), 作家名(5), ジャンル(6), 備考(7)

var NG_COL = { PUBLISHER: 0, TITLE_ID: 3, TITLE_NAME: 4, REMARK: 7 };
var NG_HEADER_ROW_COUNT = 2;

function parseNgTitles(rawRows) {
  var records = [];
  for (var i = NG_HEADER_ROW_COUNT; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || (!row[NG_COL.TITLE_ID] && !row[NG_COL.TITLE_NAME])) continue;
    records.push({
      titleId: row[NG_COL.TITLE_ID],
      titleName: row[NG_COL.TITLE_NAME],
      remark: row[NG_COL.REMARK],
    });
  }
  return records;
}

// Map<key, remark> — key = String(titleId) nếu có, nếu không thì trimmed titleName
function buildNgTitleLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    var key = record.titleId ? String(record.titleId) : String(record.titleName || '').trim();
    if (!key) return;
    lookup.set(key, record.remark);
  });
  return lookup;
}

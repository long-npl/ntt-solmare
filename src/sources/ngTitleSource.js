// sources/ngTitleSource.js — parse 外部出稿用NGタイトル
// (nằm trong file 出版社からの追記ルールと外部出稿NGタイトル)
//
// Header ở hàng 2, một số ô header có khoảng trắng full-width ở đầu
// (vd "　出版社") — normalizeHeaderText tự bỏ, nên tra bằng tên gốc vẫn khớp.

var NG_REQUIRED_HEADERS = ['出版社', 'タイトルID', 'タイトル名', '備考'];

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

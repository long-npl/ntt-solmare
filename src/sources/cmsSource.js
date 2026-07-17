// sources/cmsSource.js — parse 【マスタ】先行タイトル情報（CMS）_代理店共通
//
// Sheet ★列追加の場合は増渕まで★: header ở hàng 1 (index 0), data từ hàng 2
// (index 1). Cột U (index 20) = コピーライト — nguồn ưu tiên tầng 1 cho
// コピーライトマスタ (spec §3.2, §6).

var CMS_COL = {
  CMS_ID: 0,
  TITLE_ID: 4,
  TITLE_NAME: 5,
  AUTHOR: 7,
  GENRE: 8,
  LABEL: 10,
  PUBLISHER: 11,
  PRE_START: 12,
  PRE_END: 13,
  COPYRIGHT_U: 20, // column U
};

function parseCmsRows(rawRows) {
  var records = [];
  for (var i = 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || row[CMS_COL.CMS_ID] === null || row[CMS_COL.CMS_ID] === undefined || row[CMS_COL.CMS_ID] === '') continue;
    records.push({
      cmsId: row[CMS_COL.CMS_ID],
      titleId: row[CMS_COL.TITLE_ID],
      titleName: row[CMS_COL.TITLE_NAME],
      author: row[CMS_COL.AUTHOR],
      genre: row[CMS_COL.GENRE],
      label: row[CMS_COL.LABEL],
      publisher: row[CMS_COL.PUBLISHER],
      preStart: row[CMS_COL.PRE_START],
      preEnd: row[CMS_COL.PRE_END],
      copyrightU: row[CMS_COL.COPYRIGHT_U],
    });
  }
  return records;
}

// Map<String(cmsId), copyrightU> — chỉ gồm những dòng có giá trị コピーライト non-empty
function buildCmsCopyrightLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    if (!record.copyrightU) return;
    lookup.set(String(record.cmsId), record.copyrightU);
  });
  return lookup;
}

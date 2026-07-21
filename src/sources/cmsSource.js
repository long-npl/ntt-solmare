// sources/cmsSource.js — parse 【マスタ】先行タイトル情報（CMS）_代理店共通
//
// Header ở hàng 1, tự dò bằng tên cột (trước đây "cột U" là コピーライト —
// giờ tra theo tên "コピーライト" nên vẫn đúng dù cột đó có bị dịch chuyển).

var CMS_REQUIRED_HEADERS = [
  'CMSID', 'タイトルID', 'タイトル名', '作家名', 'ジャンル', 'レーベル名',
  '出版社', '先行開始日', '先行終了日', 'コピーライト',
];

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
    if (!row || row[colCmsId] === null || row[colCmsId] === undefined || row[colCmsId] === '') continue;
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

// Map<String(cmsId), copyrightU> — chỉ gồm những dòng có giá trị コピーライト non-empty
function buildCmsCopyrightLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    if (!record.copyrightU) return;
    lookup.set(String(record.cmsId), record.copyrightU);
  });
  return lookup;
}

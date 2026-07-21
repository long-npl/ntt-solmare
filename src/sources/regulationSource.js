// sources/regulationSource.js — parse 【社外用】作品レギュレーション判定
//
// Sheet シート1: hàng 1-3 là ghi chú, hàng 4 mới là header thật (tự dò bằng
// tên cột, không hardcode số hàng/cột). Chỉ lấy dòng có ステータス = "判定済み".

var REGULATION_REQUIRED_HEADERS = ['ステータス', 'ＣＭＳID', 'タイトルＩＤ', 'タイトル名', '③シーモアロゴ判定'];
var REGULATION_STATUS_OK = '判定済み';

function parseRegulationRows(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, REGULATION_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colStatus = col(idx, 'ステータス');
  var colCmsId = col(idx, 'ＣＭＳID');
  var colTitleId = col(idx, 'タイトルＩＤ');
  var colTitleName = col(idx, 'タイトル名');
  var colLogo = col(idx, '③シーモアロゴ判定');

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || row[colStatus] !== REGULATION_STATUS_OK) continue;
    records.push({
      cmsId: row[colCmsId],
      titleId: row[colTitleId],
      titleName: row[colTitleName],
      logoJudgement: row[colLogo],
    });
  }
  return records;
}

// Map<String(cmsId), logoJudgement>
function buildRegulationLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    if (record.cmsId === null || record.cmsId === undefined || record.cmsId === '') return;
    lookup.set(String(record.cmsId), record.logoJudgement);
  });
  return lookup;
}

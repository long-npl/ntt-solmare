// sources/regulationSource.js — parse 【社外用】作品レギュレーション判定
//
// Sheet シート1: hàng 1-4 là ghi chú/tiêu đề (KHÔNG phải data), header thật ở
// hàng 4 (index 3), data bắt đầu từ hàng 5 (index 4). Chỉ lấy dòng có
// ステータス (cột B / index 1) = "判定済み" — dòng khác đang chờ xử lý.

var REGULATION_HEADER_ROW_COUNT = 4;
var REGULATION_STATUS_OK = '判定済み';

function parseRegulationRows(rawRows) {
  var records = [];
  for (var i = REGULATION_HEADER_ROW_COUNT; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || row[1] !== REGULATION_STATUS_OK) continue;
    records.push({
      cmsId: row[3],
      titleId: row[4],
      titleName: row[5],
      logoJudgement: row[10], // ③シーモアロゴ判定
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

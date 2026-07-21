// sources/regulationSource.js — parse 【社外用】作品レギュレーション判定
//
// Vai trò trong toàn bộ luồng: đây là 1 trong 3 nguồn dùng để build
// 顧客作品マスタ (xem buildCustomerWorkRows() ở logic/customerWorkMaster.js).
// Cụ thể, nguồn này cung cấp cột ③シーモアロゴ判定 (đã/chưa được phép gắn logo
// シーモア lên creative) cho từng tác phẩm, tra theo CMS ID.
//
// Đặc điểm riêng của sheet シート1: 3 hàng đầu là ghi chú giải thích, hàng 4
// mới là header thật — findHeaderRowIndex() (trong headerMap.js) tự dò ra
// đúng hàng này, không cần hardcode số 4.

var REGULATION_REQUIRED_HEADERS = ['ステータス', 'ＣＭＳID', 'タイトルＩＤ', 'タイトル名', '③シーモアロゴ判定'];
var REGULATION_STATUS_OK = '判定済み';

/**
 * Đọc + lọc dữ liệu thô của sheet 作品レギュレーション判定.
 *
 * CHỈ lấy những dòng có cột ステータス = "判定済み" (đã có kết luận). Dòng có
 * ステータス khác (vd "判定中" - đang chờ xử lý) bị bỏ qua hoàn toàn, vì theo
 * ghi chú gốc trên sheet: "B列（ステータス）が「判定済み」のもののみ進行可" —
 * dòng chưa判定済み nghĩa là con người chưa xác nhận xong, GAS không được tự
 * ý dùng dữ liệu đó.
 *
 * @param {Array<Array<*>>} rawRows - Kết quả sheet.getDataRange().getValues() của sheet シート1
 * @returns {Array<{cmsId: *, titleId: *, titleName: string, logoJudgement: string}>}
 *   Mảng bản ghi đã lọc, mỗi phần tử ứng với 1 dòng判定済み trên sheet gốc.
 *   logoJudgement là giá trị thô của cột ③シーモアロゴ判定 (vd "ロゴなし"/"ロゴあり").
 */
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

/**
 * Build bảng tra nhanh CMS ID -> logoJudgement, để buildCustomerWorkRows()
 * join vào dữ liệu CMS mà không phải quét lại mảng records mỗi lần.
 *
 * Key được ép về String() vì Google Sheets có thể trả CMS ID dưới dạng số
 * (Number) hoặc chuỗi tuỳ ô, ép kiểu để so khớp nhất quán giữa các nguồn khác
 * nhau (CMS ID trong sheet này và trong 先行タイトル情報(CMS) phải khớp được
 * với nhau dù kiểu dữ liệu gốc trên Sheets có khác nhau).
 *
 * @param {Array<object>} records - Kết quả từ parseRegulationRows()
 * @returns {Map<string, string>} Map String(cmsId) -> logoJudgement
 *   (chỉ gồm những record có cmsId hợp lệ, không rỗng)
 */
function buildRegulationLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    if (record.cmsId === null || record.cmsId === undefined || record.cmsId === '') return;
    lookup.set(String(record.cmsId), record.logoJudgement);
  });
  return lookup;
}

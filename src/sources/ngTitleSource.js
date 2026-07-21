// sources/ngTitleSource.js — parse 外部出稿用NGタイトル
// (nằm trong file 出版社からの追記ルールと外部出稿NGタイトル)
//
// Vai trò trong toàn bộ luồng: cung cấp ghi chú "cấm xuất bản ngoài" cho từng
// tác phẩm, được buildCustomerWorkRows() (logic/customerWorkMaster.js) ghi
// vào cột 備考 của 顧客作品マスタ. LƯU Ý: đây CHỈ là cảnh báo/ghi chú — GAS
// KHÔNG tự động chặn phân phối tác phẩm nào, chỉ phản ánh thông tin để con
// người tự quyết định (đúng theo info.md mô tả ban đầu).
//
// Header ở hàng 2, một số ô header có khoảng trắng full-width ở đầu
// (vd "　出版社") — normalizeHeaderText (trong headerMap.js) tự bỏ, nên tra
// bằng tên gốc không có khoảng trắng vẫn khớp đúng.

var NG_REQUIRED_HEADERS = ['出版社', 'タイトルID', 'タイトル名', '備考'];

/**
 * Đọc dữ liệu thô của sheet 外部出稿用NGタイトル.
 *
 * Giữ lại dòng nếu có ÍT NHẤT MỘT trong 2 giá trị titleId/titleName (một số
 * dòng trong sheet thật chỉ có titleName mà không có titleId — vd dòng ghi
 * chung cho cả 1 nhóm tác phẩm theo điều kiện, không phải 1 ID cụ thể).
 *
 * @param {Array<Array<*>>} rawRows - Kết quả sheet.getDataRange().getValues()
 * @returns {Array<{titleId: *, titleName: string, remark: string}>}
 */
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

/**
 * Build bảng tra "khoá tác phẩm" -> nội dung 備考 cảnh báo.
 *
 * Key ưu tiên titleId nếu có (ép String để so khớp nhất quán); nếu dòng đó
 * không có titleId (chỉ có titleName), dùng titleName đã trim làm key thay
 * thế — đây là lý do buildCustomerWorkRows() tra lookup này bằng titleId
 * TRƯỚC, và có thể cần bổ sung logic tra theo tên nếu muốn bắt cả những dòng
 * chỉ ghi theo tên (hiện tại buildCustomerWorkRows chỉ tra theo titleId, xem
 * comment trong logic/customerWorkMaster.js).
 *
 * @param {Array<object>} records - Kết quả từ parseNgTitles()
 * @returns {Map<string, string>} Map key (titleId hoặc titleName) -> remark
 */
function buildNgTitleLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    var key = record.titleId ? String(record.titleId) : String(record.titleName || '').trim();
    if (!key) return;
    lookup.set(key, record.remark);
  });
  return lookup;
}

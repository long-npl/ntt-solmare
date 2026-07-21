// logic/changeDetail.js — tính diff TỪNG FIELD (không chỉ "có đổi hay không")
// cho các dòng update, phục vụ log audit chi tiết dạng:
//   作品名: <タイトル名>
//   【<field>】「<cũ>」→「<mới>」
//
// Đây là hàm PURE — nhận vào diffUpsert().toUpdate (đã có field `previous`,
// xem logic/upsert.js) và trả về danh sách "1 dòng log = 1 field đổi", để
// io/logSheet.appendChangeDetailRows() ghi thẳng lên sheet.

/**
 * Với mỗi item trong toUpdateItems, so sánh previous[field.key] và
 * record[field.key] cho TỪNG field trong fieldDefs — chỉ tạo 1 dòng log cho
 * field THỰC SỰ thay đổi (previous/record giống hệt nhau thì bỏ qua field
 * đó, không phải cả item). 1 tác phẩm đổi 2 field sẽ tạo ra 2 dòng log riêng
 * (không gộp chung 1 dòng nhiều field), để mỗi dòng log là 1 sự kiện đơn giản,
 * dễ lọc/tìm kiếm sau này trên sheet.
 *
 * So sánh bằng sameValue() (logic/upsert.js), KHÔNG dùng `===` trực tiếp —
 * cùng lý do với customerIsEqualFn/copyrightIsEqualFn (main.js): oldValue đọc
 * từ sheet có thể là `''`, còn newValue vừa tính lại có thể là `undefined`,
 * dù cả 2 đều là "không có gì". Nếu dùng `===`, 1 tác phẩm dù CHỈ đổi đúng 1
 * field thật cũng sẽ bị log thêm các field khác "trống -> trống" một cách
 * sai lệch (đã kiểm chứng qua dữ liệu thật: 备考/③シーモアロゴ判定 chiếm ~97%
 * số dòng log, toàn bộ đều trống cả 2 phía).
 *
 * @param {string} masterLabel - Tên master để phân biệt khi 2 master cùng ghi
 *   chung 1 sheet log chi tiết (vd '顧客作品マスタ' hoặc 'コピーライトマスタ')
 * @param {Array<{key: string, record: object, previous: object}>} toUpdateItems
 *   Từ diffUpsert().toUpdate
 * @param {Array<{key: string, label: string}>} fieldDefs - Danh sách field cần
 *   theo dõi thay đổi: key = tên property trên record/previous, label = tên
 *   hiển thị trong log (thường trùng tên cột trên sheet, vd '③シーモアロゴ判定')
 * @param {Date} runAt - Thời điểm chạy (dùng chung 1 giá trị cho cả lần chạy,
 *   truyền vào thay vì tự gọi `new Date()` ở đây để tất cả dòng log cùng 1
 *   lần chạy có cùng 1 timestamp, dễ nhóm lại khi xem log)
 * @returns {Array<{
 *   runAt: Date, master: string, titleNo: *, titleName: string,
 *   field: string, oldValue: *, newValue: *
 * }>}
 */
function buildChangeDetailRows(masterLabel, toUpdateItems, fieldDefs, runAt) {
  var rows = [];
  toUpdateItems.forEach(function (item) {
    fieldDefs.forEach(function (fieldDef) {
      var oldValue = item.previous[fieldDef.key];
      var newValue = item.record[fieldDef.key];
      if (sameValue(oldValue, newValue)) return;
      rows.push({
        runAt: runAt,
        master: masterLabel,
        titleNo: item.record.titleNo,
        titleName: item.record.titleName,
        field: fieldDef.label,
        oldValue: oldValue,
        newValue: newValue,
      });
    });
  });
  return rows;
}

// util/headerMap.js — tra cột theo TÊN header thay vì số cột cố định, để không
// vỡ khi ai đó chèn/xoá/đổi thứ tự cột trong file nguồn. Đồng thời tự dò luôn
// vị trí HÀNG header (khác nhau tuỳ sheet: có sheet header ở hàng 1, có sheet
// header ở hàng 10 sau vài dòng ghi chú).

function normalizeHeaderText(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/　/g, '') // khoảng trắng full-width hay dùng để canh lề trong header
    .replace(/\s+/g, '')
    .trim();
}

// Tìm dòng đầu tiên trong rawRows có chứa ĐỦ tất cả tên trong requiredHeaderNames
// (so khớp sau khi normalize, exact match). Throw lỗi rõ ràng nếu không tìm thấy
// dòng nào khớp đủ — thà dừng sớm còn hơn âm thầm đọc sai cột.
function findHeaderRowIndex(rawRows, requiredHeaderNames) {
  var normalizedRequired = requiredHeaderNames.map(normalizeHeaderText);
  for (var i = 0; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    var normalizedRow = row.map(normalizeHeaderText);
    var hasAll = normalizedRequired.every(function (name) {
      return normalizedRow.indexOf(name) !== -1;
    });
    if (hasAll) return i;
  }
  throw new Error('Không tìm thấy dòng header chứa đủ các cột: ' + requiredHeaderNames.join(', '));
}

// Map<normalizedHeaderName, columnIndex> từ 1 dòng header cụ thể.
// Nếu có 2 cột trùng tên sau normalize, giữ cột đầu tiên (bên trái).
function buildHeaderIndex(headerRow) {
  var map = new Map();
  headerRow.forEach(function (cell, index) {
    var name = normalizeHeaderText(cell);
    if (name && !map.has(name)) map.set(name, index);
  });
  return map;
}

// Tiện ích gộp: vừa dò hàng header, vừa build map tên -> cột, trong 1 bước
function resolveHeaderIndex(rawRows, requiredHeaderNames) {
  var headerRowIndex = findHeaderRowIndex(rawRows, requiredHeaderNames);
  var headerIndex = buildHeaderIndex(rawRows[headerRowIndex]);
  return { headerRowIndex: headerRowIndex, headerIndex: headerIndex };
}

// Lấy số cột theo tên; throw lỗi rõ ràng nếu tên không tồn tại trong headerIndex
function col(headerIndex, name) {
  var index = headerIndex.get(normalizeHeaderText(name));
  if (index === undefined) throw new Error('Không tìm thấy cột header: ' + name);
  return index;
}

// Giống col(), nhưng trả về undefined thay vì throw nếu không tìm thấy —
// dùng cho cột tuỳ chọn (vd 配信NGフラグ, cột mới đề xuất nhưng có thể chưa
// tồn tại trên sheet thật cho tới khi ai đó thêm header đó vào).
function tryCol(headerIndex, name) {
  return headerIndex.get(normalizeHeaderText(name));
}

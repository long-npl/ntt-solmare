// util/headerMap.js — tra cột theo TÊN header thay vì số cột cố định, để không
// vỡ khi ai đó chèn/xoá/đổi thứ tự cột trong file nguồn. Đồng thời tự dò luôn
// vị trí HÀNG header (khác nhau tuỳ sheet: có sheet header ở hàng 1, có sheet
// header ở hàng 10 sau vài dòng ghi chú).
//
// Được dùng bởi TẤT CẢ các file trong src/sources/*.js và src/io/sheetIO.js.
// Đây là lớp nền tảng thấp nhất của toàn bộ GAS❶ — mọi việc đọc/ghi cột đều
// đi qua 4 hàm ở đây.

/**
 * Chuẩn hoá 1 chuỗi header để so sánh: bỏ khoảng trắng thường, khoảng trắng
 * full-width (　), xuống dòng (\n)... Lý do cần hàm này: cùng 1 tên cột có thể
 * viết khác nhau chút xíu giữa các sheet thật (vd "CMS ID" vs "CMSID", hoặc
 * "①広告出稿ポリシー\n（出稿NG）" có xuống dòng giữa chừng) — nếu so sánh chuỗi
 * y hệt (===) sẽ bị trật, nên mọi so khớp tên cột trong file này đều đi qua
 * normalize trước.
 *
 * @param {*} value - Giá trị ô header thô (có thể null/undefined/số/chuỗi)
 * @returns {string} Chuỗi đã bỏ hết khoảng trắng các loại, dùng để so khớp
 */
function normalizeHeaderText(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/　/g, '') // khoảng trắng full-width hay dùng để canh lề trong header
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Dò xem HÀNG NÀO trong rawRows là hàng header thật, bằng cách tìm hàng đầu
 * tiên chứa ĐỦ tất cả các tên cột bắt buộc (requiredHeaderNames), so khớp sau
 * khi normalize. Cần hàm này vì các sheet nguồn không thống nhất: có sheet
 * header ở hàng 1, có sheet có vài hàng ghi chú/tiêu đề phía trên nên header
 * thật nằm ở hàng 2, 4, hay thậm chí hàng 10 (vd スクエニコピーライト一覧).
 *
 * Nếu không tìm thấy hàng nào khớp đủ, THROW lỗi ngay — cố tình không âm thầm
 * trả về hàng đoán mò, vì đọc nhầm hàng header sẽ kéo theo đọc sai TOÀN BỘ cột
 * phía sau mà không ai nhận ra cho tới khi dữ liệu ra sai lệch khó truy vết.
 *
 * @param {Array<Array<*>>} rawRows - Toàn bộ dữ liệu thô của sheet (kết quả getValues())
 * @param {Array<string>} requiredHeaderNames - Danh sách tên cột bắt buộc phải có trên hàng header
 * @returns {number} Index (0-based) của hàng header trong rawRows
 * @throws {Error} Nếu không có hàng nào chứa đủ các tên cột yêu cầu
 */
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

/**
 * Từ 1 hàng header cụ thể, build ra bảng tra "tên cột (đã normalize)" -> "số
 * cột (0-based)". Đây là cái cho phép code viết `col(idx, 'コピーライト')` thay vì
 * `row[20]` — dù NXB có chèn thêm cột ở giữa, tên "コピーライト" vẫn trỏ đúng cột
 * mới vì map này được build lại mỗi lần đọc sheet, không hardcode.
 *
 * Nếu 2 cột có tên trùng nhau sau khi normalize, chỉ giữ cột ĐẦU TIÊN (bên
 * trái) — trường hợp này không gặp trong dữ liệu thật hiện tại nhưng xử lý an
 * toàn cho tương lai.
 *
 * @param {Array<*>} headerRow - 1 hàng header thô (1 phần tử của rawRows)
 * @returns {Map<string, number>} Map tên cột đã normalize -> số cột (0-based)
 */
function buildHeaderIndex(headerRow) {
  var map = new Map();
  headerRow.forEach(function (cell, index) {
    var name = normalizeHeaderText(cell);
    if (name && !map.has(name)) map.set(name, index);
  });
  return map;
}

/**
 * Hàm tiện ích gộp 2 bước findHeaderRowIndex + buildHeaderIndex làm 1 —
 * đây là hàm mà các file src/sources/*.js gọi ở đầu mỗi parse function.
 *
 * @param {Array<Array<*>>} rawRows - Toàn bộ dữ liệu thô của sheet
 * @param {Array<string>} requiredHeaderNames - Tên các cột bắt buộc phải có
 * @returns {{headerRowIndex: number, headerIndex: Map<string, number>}}
 *   headerRowIndex: dùng để biết data thật bắt đầu từ hàng nào (headerRowIndex + 1)
 *   headerIndex: dùng với hàm col()/tryCol() bên dưới để tra số cột theo tên
 */
function resolveHeaderIndex(rawRows, requiredHeaderNames) {
  var headerRowIndex = findHeaderRowIndex(rawRows, requiredHeaderNames);
  var headerIndex = buildHeaderIndex(rawRows[headerRowIndex]);
  return { headerRowIndex: headerRowIndex, headerIndex: headerIndex };
}

/**
 * Lấy số cột (0-based) theo tên header. Đây là hàm dùng TRỰC TIẾP nhiều nhất
 * trong toàn bộ codebase — mỗi lần thấy `row[colXxx]` ở nơi khác, `colXxx` gần
 * như chắc chắn đến từ 1 lệnh gọi col(idx, 'Tên cột') ở đầu function đó.
 *
 * Bắt buộc (không phải tuỳ chọn): nếu tên cột không tồn tại trong headerIndex,
 * THROW lỗi ngay lập tức, thà dừng chương trình sớm còn hơn đọc nhầm cột do
 * gõ sai tên hoặc cột đã bị đổi tên/xoá trên sheet thật.
 *
 * @param {Map<string, number>} headerIndex - Kết quả từ buildHeaderIndex()/resolveHeaderIndex()
 * @param {string} name - Tên cột cần tìm (không cần normalize trước, hàm tự làm)
 * @returns {number} Số cột (0-based)
 * @throws {Error} Nếu không tìm thấy tên cột này trong headerIndex
 */
function col(headerIndex, name) {
  var index = headerIndex.get(normalizeHeaderText(name));
  if (index === undefined) throw new Error('Không tìm thấy cột header: ' + name);
  return index;
}

/**
 * Giống hệt col(), nhưng trả về `undefined` thay vì throw nếu không tìm thấy.
 * Dùng cho những cột TUỲ CHỌN — hiện tại chỉ có 1 chỗ dùng: cột 配信NGフラグ
 * trong 顧客作品マスタ, một cột MỚI được đề xuất thêm (spec §4.1) nhưng có thể
 * CHƯA tồn tại trên sheet thật cho tới khi ai đó thêm header đó vào. Nếu dùng
 * col() ở đây, code sẽ throw lỗi ngay từ lần chạy đầu tiên trước khi cột được
 * thêm — dùng tryCol() để code vẫn chạy bình thường, chỉ để giá trị đó trống.
 *
 * @param {Map<string, number>} headerIndex
 * @param {string} name
 * @returns {number|undefined} Số cột (0-based), hoặc undefined nếu cột chưa tồn tại
 */
function tryCol(headerIndex, name) {
  return headerIndex.get(normalizeHeaderText(name));
}

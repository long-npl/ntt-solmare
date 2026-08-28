// gas2/sources.js — TẦNG THUẦN: biến mảng 2 chiều thô của 2 master nguồn thành record.
//
// Không có lời gọi Google API nào ở đây (đó là việc của gas2/io.js), nên toàn bộ file
// này test được bằng Node — xem tools/verify-gas2/tests.js: test_sources.
//
// Cả 2 hàm đều TỰ DÒ hàng header thay vì giả định hàng 15: ガワ của 2 master này đã đổi
// nhiều lần và 池永 vẫn còn chèn hàng ghi chú phía trên. Xem findHeaderRowIndex().

// Tên cột BẮT BUỘC phải có trên 顧客作品マスタ. Thiếu 1 cột -> throw ngay ở
// resolveHeaderIndex(): ghi thiếu cột nghĩa là タイトルマスタ sai một cách âm thầm, mà
// đây lại là master 営業 dùng để chọn tác phẩm.
//
// CUSTOMER_REQUIRED_HEADERS nằm ở gas2/masterHeaders.js (sinh ra từ shared/) — cùng một
// danh sách với src/, vì nó mô tả HÌNH DẠNG của sheet 顧客作品マスタ chứ không phải nhu
// cầu riêng của GAS❷. Xem comment đầu shared/masterHeaders.js.

// Tên cột BẮT BUỘC trên コピーライトマスタ. Chỉ 4 cột: GAS❷ chỉ lấy 3 giá trị từ master
// này (+ khoá join), mọi cột định danh khác đã có sẵn bên 顧客作品マスタ.
//
// Ngoặc trong 'タイトル個別コピーライト(あれば優先使用)' là ngoặc HALF-WIDTH — khác
// '先行終了日（延長）' ở trên. Đã kiểm trên file thật, đừng "sửa cho nhất quán".
var COPYRIGHT_REQUIRED_HEADERS = [
  'タイトルNo', 'タイトル名', 'タイトル個別コピーライト(あれば優先使用)', '出版社コピーライト',
];

// CỐ TÌNH KHÔNG nằm trong COPYRIGHT_REQUIRED_HEADERS: cột này có thể CHƯA TỒN TẠI trên
// コピーライトマスタ thật (GAS❶ ghi nó bằng tryCol vì 池永 phải thêm tay — xem
// COPYRIGHT_PRE_CONFIRMATION_HEADER trong src/io.js). Đưa vào danh sách bắt buộc thì mọi
// lần chạy GAS❷ throw ngay chỉ vì một cột thông tin phụ chưa được thêm.
var COPYRIGHT_PRE_CONFIRMATION_HEADER = '出版社事前確認';

/**
 * Đọc toàn bộ dòng dữ liệu của 顧客作品マスタ thành record.
 *
 * Bỏ qua dòng không có タイトル名 — cùng quy ước với readCustomerWorkMaster() của GAS❶:
 * タイトル名 là trường duy nhất chắc chắn có giá trị ở mọi dòng do GAS❶ ghi.
 *
 * KHÔNG trả về sheetRow/rawRow như GAS❶: master này chỉ được ĐỌC, GAS❷ không bao giờ
 * ghi ngược lên nó, nên không cần biết dòng nằm ở đâu.
 *
 * @param {Array<Array<*>>} rawRows - Toàn bộ giá trị ô (kết quả getDataRange().getValues())
 * @returns {Array<object>} Mỗi phần tử là 1 tác phẩm, 20 field theo bảng map của spec §3
 */
function parseCustomerMasterRows(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, CUSTOMER_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[col(idx, 'タイトル名')]) === '') continue;
    records.push({
      titleNo: row[col(idx, 'タイトルNo')],
      cmsId: row[col(idx, 'CMS ID')],
      titleId: row[col(idx, 'タイトルID')],
      titleCategory: row[col(idx, 'タイトル区分')],
      policy: row[col(idx, '①広告出稿ポリシー')],
      general: row[col(idx, '②一般面出稿NG')],
      logoJudgement: row[col(idx, '③シーモアロゴ判定')],
      suspensionDate: row[col(idx, '掲載停止日付')],
      lpProduction: row[col(idx, 'LP制作')],
      titleName: row[col(idx, 'タイトル名')],
      author: row[col(idx, '作家名')],
      genre: row[col(idx, 'ジャンル')],
      publisher: row[col(idx, '出版社')],
      label: row[col(idx, 'レーベル名')],
      preStart: row[col(idx, '先行開始日')],
      preEnd: row[col(idx, '先行終了日')],
      preEndExtended: row[col(idx, '先行終了日（延長）')],
      preEndFinal: row[col(idx, '先行終了日（最終確定）')],
      massFreeStart: row[col(idx, '大量無料開始日')],
      massFreeEnd: row[col(idx, '大量無料終了日')],
    });
  }
  return records;
}

/**
 * Đọc コピーライトマスタ thành record + cho biết cột 出版社事前確認 có tồn tại hay không.
 *
 * hasPreConfirmation là thứ QUAN TRỌNG phải trả về, không phải chi tiết phụ: nếu cột
 * chưa được thêm bên nguồn mà GAS❷ vẫn ghi '' vào cột AA của タイトルマスタ, nó sẽ XOÁ
 * giá trị 必要/不要 mà 営業 đang có. Bên gọi dùng cờ này để bỏ hẳn cột AA ra khỏi lượt ghi.
 *
 * Bỏ qua dòng không có タイトルNo: khoá rỗng không tra được, và コピーライトマスタ do GAS❶
 * sinh ra nên dòng thiếu khoá là dòng rác/dòng mẫu.
 *
 * @param {Array<Array<*>>} rawRows
 * @returns {{records: Array<object>, hasPreConfirmation: boolean}}
 */
function parseCopyrightMasterRows(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, COPYRIGHT_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  // tryCol() trả về `undefined` (KHÔNG phải null) khi cột không tồn tại — nó chỉ là
  // `headerIndex.get(...)` trần. Đã kiểm trong src/common.js; so bằng `=== undefined`.
  var colPreConfirm = tryCol(idx, COPYRIGHT_PRE_CONFIRMATION_HEADER);
  var hasPreConfirmation = colPreConfirm !== undefined;
  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[col(idx, 'タイトルNo')]) === '') continue;
    records.push({
      titleNo: row[col(idx, 'タイトルNo')],
      titleName: row[col(idx, 'タイトル名')],
      individualCopyright: row[col(idx, 'タイトル個別コピーライト(あれば優先使用)')],
      publisherCopyright: row[col(idx, '出版社コピーライト')],
      preConfirmation: hasPreConfirmation ? row[colPreConfirm] : '',
    });
  }
  return { records: records, hasPreConfirmation: hasPreConfirmation };
}

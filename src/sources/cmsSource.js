// sources/cmsSource.js — parse 【マスタ】先行タイトル情報（CMS）_代理店共通
//
// Vai trò trong toàn bộ luồng: đây là nguồn NỀN TẢNG (基幹データ) của
// 顧客作品マスタ — mỗi dòng trong sheet ★列追加の場合は増渕まで★ ứng với 1 tác
// phẩm, và buildCustomerWorkRows() (logic/customerWorkMaster.js) lặp qua
// TỪNG record ở đây để tạo 1 dòng 顧客作品マスタ tương ứng. Ngoài ra cột
// コピーライト (trước đây gọi là "cột U") là nguồn ưu tiên TẦNG 1 khi xác định
// bản quyền — xem copyrightResolver.js.
//
// LƯU Ý QUAN TRỌNG (đã kiểm chứng trên dữ liệu thật, xem báo cáo lỗi trùng
// dòng): ~3.5% dòng có タイトルID trống, và một số tác phẩm dùng chung giá trị
// placeholder "ー". Vì vậy CMSID — chứ KHÔNG PHẢI タイトルID — mới là định
// danh đáng tin cậy duy nhất (0 dòng trống trong 5649 dòng kiểm tra thực tế).
// Đây là lý do main.js dùng cmsId làm khoá upsert cho 顧客作品マスタ.

var CMS_REQUIRED_HEADERS = [
  'CMSID', 'タイトルID', 'タイトル名', '作家名', 'ジャンル', 'レーベル名',
  '出版社', '先行開始日', '先行終了日', 'コピーライト',
];

/**
 * Đọc dữ liệu thô của sheet 先行タイトル情報(CMS), bỏ qua dòng trống (không có
 * CMSID — thường là các dòng cuối sheet không có dữ liệu).
 *
 * @param {Array<Array<*>>} rawRows - Kết quả sheet.getDataRange().getValues()
 * @returns {Array<{
 *   cmsId: *, titleId: *, titleName: string, author: string, genre: string,
 *   label: string, publisher: string, preStart: Date, preEnd: Date,
 *   copyrightU: string
 * }>} Mảng bản ghi, mỗi phần tử ứng với 1 tác phẩm. copyrightU là giá trị
 *   thô của cột コピーライト — có thể rỗng/null nếu tác phẩm chưa có bản quyền
 *   CMS xác nhận (khi đó copyrightResolver.js sẽ rơi xuống tầng ưu tiên thấp hơn).
 */
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

/**
 * Build bảng tra CMS ID -> giá trị コピーライト, dùng làm TẦNG 1 (ưu tiên cao
 * nhất) trong copyrightResolver.resolveCopyright(). Chỉ những tác phẩm có
 * giá trị コピーライト non-empty mới được đưa vào map này — tác phẩm chưa có
 * giá trị sẽ không match ở tầng 1 và resolver tự rơi xuống tầng 2/3/4.
 *
 * @param {Array<object>} records - Kết quả từ parseCmsRows()
 * @returns {Map<string, string>} Map String(cmsId) -> copyrightU
 */
function buildCmsCopyrightLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    if (!record.copyrightU) return;
    lookup.set(String(record.cmsId), record.copyrightU);
  });
  return lookup;
}

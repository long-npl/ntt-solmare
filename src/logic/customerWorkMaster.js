// logic/customerWorkMaster.js — build dòng dữ liệu cho 顧客作品マスタ
//
// Đây là hàm PURE (không đụng SpreadsheetApp) — nhận vào dữ liệu đã parse
// sẵn từ 3 nguồn (sources/*.js) và tạo ra 1 "work object" cho mỗi tác phẩm.
// main.js gọi hàm này ngay sau khi đọc xong 3 nguồn, TRƯỚC khi tính bản quyền
// (resolveCopyright) và trước khi upsert vào sheet thật.

/**
 * Build mảng "work" (1 phần tử = 1 tác phẩm, ứng với 1 dòng tương lai trên
 * 顧客作品マスタ) bằng cách lấy CMS làm nền tảng rồi join thêm 2 nguồn kia.
 *
 * - cmsRecords quyết định DANH SÁCH tác phẩm nào tồn tại (nếu CMS không có
 *   tác phẩm nào, tác phẩm đó sẽ không xuất hiện trong 顧客作品マスタ dù có ở
 *   nguồn khác).
 * - regulationLookup bổ sung 1 trường (logoJudgement) cho tác phẩm ĐÃ có
 *   trong CMS — tra theo 3 TẦNG ưu tiên qua lookupRegulation()
 *   (regulationSource.js): (1) khớp CẢ CMS ID lẫn タイトルID cùng lúc —
 *   chắc chắn nhất, (2) chỉ CMS ID, (3) chỉ タイトルID. Bắt buộc phải có tầng
 *   タイトルID: dữ liệu thật cho thấy 53.6% dòng 判定済み trong 作品レギュ
 *   レーション判定 KHÔNG CÓ CMSID (quy trình phán定 logo nhiều khi làm trước
 *   khi tác phẩm được đăng ký CMS, tức CMSID "đến sau" タイトルID) — nếu chỉ
 *   tra theo CMS ID sẽ bỏ sót phần lớn kết quả một cách âm thầm (logoJudgement
 *   luôn undefined, không có lỗi nào để nhận ra).
 * - ngTitleLookup bổ sung 備考 cảnh báo "cấm xuất bản ngoài" — tra theo
 *   titleId. LƯU Ý: vì タイトルID có thể trống/dùng chung placeholder "ー" ở
 *   một số dòng CMS (xem cmsSource.js), việc tra remark theo titleId ở đây có
 *   thể bỏ sót cảnh báo cho đúng những tác phẩm đó — đây là giới hạn đã biết,
 *   chưa quan trọng bằng lỗi khoá upsert (đã fix bằng CMSID) nên chưa xử lý,
 *   nhưng cần lưu ý nếu thấy 備考 bị thiếu ở tác phẩm không có タイトルID.
 *
 * KHÔNG gán copyright/copyrightTier/titleNo ở đây — những trường đó được
 * main.js gán THÊM vào object trả về, sau khi hàm này chạy xong (xem
 * runGas1() trong main.js để biết thứ tự chính xác và lý do).
 *
 * @param {Array<object>} cmsRecords - Kết quả cmsSource.parseCmsRows()
 * @param {{byCmsIdAndTitleId: Map, byCmsId: Map<string,string>, byTitleId: Map<string,string>}} regulationLookup
 *   Kết quả regulationSource.buildRegulationLookup()
 * @param {Map<string, string>} ngTitleLookup - Kết quả ngTitleSource.buildNgTitleLookup()
 * @returns {Array<{
 *   cmsId: *, titleId: *, titleName: string, author: string, genre: string,
 *   publisher: string, preStart: Date, preEnd: Date,
 *   logoJudgement: string|undefined, remark: string|null, distributionNgFlag: string
 * }>} Mảng work object, thứ tự giữ nguyên theo cmsRecords đầu vào.
 *   distributionNgFlag LUÔN là chuỗi rỗng — cột này dành cho tính năng
 *   "phát hiện tác phẩm dừng phân phối", NGOÀI PHẠM VI của GAS❶ hiện tại
 *   (nguồn 配信停止タイトル là 1 thư mục Drive, chưa có cấu trúc file cụ thể
 *   để đọc — xem spec §3.4). Cột này được thêm sẵn để nối logic vào sau mà
 *   không phải đổi schema của 顧客作品マスタ.
 */
function buildCustomerWorkRows(cmsRecords, regulationLookup, ngTitleLookup) {
  return cmsRecords.map(function (cms) {
    var titleIdKey = String(cms.titleId);
    return {
      cmsId: cms.cmsId,
      titleId: cms.titleId,
      titleName: cms.titleName,
      author: cms.author,
      genre: cms.genre,
      publisher: cms.publisher,
      preStart: cms.preStart,
      preEnd: cms.preEnd,
      logoJudgement: lookupRegulation(cms, regulationLookup),
      remark: ngTitleLookup.get(titleIdKey) || null,
      distributionNgFlag: '', // ngoài phạm vi GAS❶ (spec §3.4) — luôn để trống
    };
  });
}

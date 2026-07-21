// logic/copyrightHistory.js — dịch chuyển lịch sử CopyRight 過去1-10 (spec §6)
//
// Hàm PURE, được main.js gọi cho TỪNG tác phẩm khi build コピーライトマスタ,
// SAU khi đã có bản quyền mới từ copyrightResolver.resolveCopyright().

/**
 * Quyết định giá trị 正規コピーライト mới và mảng lịch sử CopyRight過去1..N cho
 * 1 tác phẩm, dựa trên giá trị ĐANG LƯU (existingRecord, đọc từ コピーライト
 * マスタ trước khi chạy) và giá trị MỚI vừa tính ra (newValue).
 *
 * QUY TẮC: chỉ dịch chuyển lịch sử khi giá trị THỰC SỰ THAY ĐỔI so với lần
 * trước — nếu newValue giống hệt currentValue, trả về y nguyên, KHÔNG đụng
 * vào mảng lịch sử (dù hàm này được gọi lại ở MỌI lần chạy 9h/18h, kể cả khi
 * không có gì thay đổi). Khi có thay đổi thật, giá trị CŨ được đẩy vào ĐẦU
 * mảng lịch sử (unshift, tức "過去1" luôn là giá trị gần nhất trước đó), các
 * giá trị cũ hơn bị đẩy lùi ra sau; nếu mảng vượt quá maxSlots, giá trị CŨ
 * NHẤT (cuối mảng) bị loại bỏ.
 *
 * Trường hợp tác phẩm CHƯA từng có 正規コピーライト (currentValue null/rỗng —
 * vd tác phẩm mới, hoặc trước đó rơi vào tầng 4/cá biệt): không coi đó là
 * "thay đổi cần lưu lịch sử" — không có gì để đẩy vào 過去1 cả (nếu không có
 * check này, lần đầu tiên có giá trị sẽ tạo ra 1 mục lịch sử rỗng vô nghĩa).
 *
 * So sánh bằng sameValue() (logic/upsert.js), KHÔNG dùng `===` trực tiếp:
 * newValue có thể là `undefined` (resolveCopyright() không thay đổi placeholder
 * cho tier 4), còn currentValue đọc lại từ sheet sau khi đã ghi 1 giá trị
 * rỗng trước đó sẽ là chuỗi `''`, không phải `undefined`/`null` — so sánh
 * `===` trực tiếp sẽ coi đây là "đã đổi" và dịch chuyển lịch sử một cách sai
 * lệch ở MỌI lần chạy cho các tác phẩm cá biệt (đã kiểm chứng bug này qua dữ
 * liệu thật, cùng gốc với bug tương tự ở customerIsEqualFn/copyrightIsEqualFn
 * trong main.js).
 *
 * @param {{copyrightCurrent: string|null, copyrightHistory: Array<string>}} existingRecord
 *   Bản ghi コピーライトマスタ hiện tại của tác phẩm này (đọc từ sheet, hoặc
 *   {copyrightCurrent: null, copyrightHistory: []} nếu tác phẩm chưa từng có dòng)
 * @param {string|null} newValue - Giá trị 正規コピーライト vừa tính ra ở lần chạy này
 *   (kết quả resolveCopyright().value — có thể null nếu tầng 4/cá biệt)
 * @param {number} maxSlots - Số cột lịch sử tối đa được phép giữ (CONFIG.COPYRIGHT_HISTORY_SLOTS = 10)
 * @returns {{copyrightCurrent: string|null, copyrightHistory: Array<string>}}
 *   Giá trị mới để main.js đưa vào record ghi lên コピーライトマスタ
 */
function shiftCopyrightHistory(existingRecord, newValue, maxSlots) {
  var currentValue = existingRecord.copyrightCurrent || null;
  var history = existingRecord.copyrightHistory ? existingRecord.copyrightHistory.slice() : [];

  if (sameValue(newValue, currentValue)) {
    return { copyrightCurrent: currentValue, copyrightHistory: history };
  }

  if (currentValue) {
    history.unshift(currentValue);
    if (history.length > maxSlots) history = history.slice(0, maxSlots);
  }

  return { copyrightCurrent: newValue, copyrightHistory: history };
}

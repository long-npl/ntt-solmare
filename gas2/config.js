// gas2/config.js — spreadsheet ID, tên sheet, hằng số dùng chung cho GAS❷.
//
// Cùng nguyên tắc với src/config.js: file này KHÔNG chứa logic. Đổi 1 spreadsheet
// nguồn/output chỉ phải sửa đúng 1 chỗ.
//
// KHÁC GAS❶ ở một điểm quan trọng: 2 spreadsheet trong SOURCES chính là 2 OUTPUTS của
// GAS❶ (xem src/config.js: CONFIG.OUTPUTS). Đổi ID ở bên kia mà quên đổi ở đây thì
// GAS❷ vẫn chạy trơn tru trên master cũ và không có gì báo — nên khi đổi, sửa cả 2.

var CONFIG = {
  SOURCES: {
    // Nguồn CHÍNH. Đọc không được -> dừng, không ghi gì (xem runGas2 trong main.js).
    CUSTOMER_WORK_MASTER: {
      spreadsheetId: '1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU',
      sheetName: '顧客作品マスタ',
    },
    // Nguồn PHỤ. Đọc không được -> giữ nguyên 3 cột S/T/AA đang có trên タイトルマスタ và
    // vẫn chạy tiếp. Bắt buộc phải vậy: S/T là cột GAS❷ ghi đè hoàn toàn, coi "không đọc
    // được" = "rỗng" sẽ xoá sạch copyright của toàn bộ tác phẩm chỉ vì một lần mất quyền
    // truy cập — mà copyright sai là đúng loại tai nạn dự án này sinh ra để chặn.
    COPYRIGHT_MASTER: {
      spreadsheetId: '1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc',
      sheetName: 'コピーライトマスタ',
    },
  },
  OUTPUTS: {
    TITLE_MASTER: {
      spreadsheetId: '16Fw9KrvKskewy9OAWqPegYXvhOkRPywatd512Ncn4rI',
      sheetName: 'タイトルマスタ',
    },
  },
  // 9:30 và 17:30 — đi sau GAS❶ (9:00/17:00) 30 phút để đọc được master vừa cập nhật.
  //
  // LƯU Ý VỀ ĐỘ CHÍNH XÁC: trigger theo ngày của Apps Script chỉ có nearMinute(), tức
  // Google chạy trong khoảng ±15 phút quanh mốc này. Không có cách đặt đúng phút cho
  // trigger everyDays(). Chấp nhận được vì GAS❷ không có ràng buộc thời gian cứng nào.
  TRIGGER_HOURS: [9, 17],
  TRIGGER_MINUTE: 30,
  TRIGGER_TIMEZONE: 'Asia/Tokyo',
  // Tên 2 Script Property chứa token/channel Slack. KHÔNG hardcode giá trị thật ở đây —
  // điền qua Apps Script editor > Project Settings > Script Properties.
  SLACK_PROPERTY_KEYS: {
    BOT_TOKEN: 'SLACK_BOT_TOKEN',
    CHANNEL_ID: 'SLACK_CHANNEL_ID',
  },
};

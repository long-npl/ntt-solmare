// 0_config.js — mọi spreadsheet ID và hằng số vận hành của GAS❷. Không có logic.
//
// KHÁC GAS❶ ở một điểm: 2 spreadsheet trong SOURCES chính là 2 OUTPUTS của GAS❶.
// Đổi ID ở bên kia mà quên đổi ở đây thì GAS❷ vẫn chạy trơn tru trên master cũ và
// không có gì báo — nên khi đổi, sửa cả 2.

var CONFIG = {
  SOURCES: {
    // Nguồn CHÍNH. Đọc không được -> dừng, không ghi gì.
    CUSTOMER_WORK_MASTER: {
      spreadsheetId: '1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU',
      sheetName: '顧客作品マスタ',
    },
    // Nguồn PHỤ. Đọc không được -> 3 cột lấy từ đây giữ nguyên, vẫn chạy tiếp.
    // Xem docs/decisions.md #sources-02
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
  // 9:30 và 17:30 — đi sau GAS❶ 30 phút. Trigger everyDays() của Apps Script chỉ có
  // nearMinute(), Google chạy trong khoảng ±15 phút quanh mốc này.
  TRIGGER_HOURS: [9, 17],
  TRIGGER_MINUTE: 30,
  TRIGGER_TIMEZONE: 'Asia/Tokyo',
  SLACK_PROPERTY_KEYS: {
    BOT_TOKEN: 'SLACK_BOT_TOKEN',
    CHANNEL_ID: 'SLACK_CHANNEL_ID',
  },
};

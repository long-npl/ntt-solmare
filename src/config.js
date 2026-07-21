// config.js — spreadsheet IDs, sheet names, hằng số dùng chung cho GAS❶
//
// File này KHÔNG chứa logic, chỉ chứa dữ liệu cấu hình. Mọi ID/tên sheet
// trong toàn bộ codebase đều lấy từ đây (không hardcode ID lặp lại ở nơi
// khác) — muốn đổi 1 spreadsheet nguồn/output, chỉ cần sửa đúng 1 chỗ.

/**
 * CONFIG.SOURCES.*  — 3 spreadsheet nguồn GAS❶ đọc trực tiếp (không qua
 *   IMPORTRANGE, xem spec §5). PUBLISHER_RULES.sheets liệt kê TẤT CẢ các
 *   sheet cần đọc trong file "出版社からの追記ルールと外部出稿NGタイトル" —
 *   NG_TITLES/BASIC_NOTATION là 2 sheet chung, còn LINE/SQUARE_ENIX/LIBRE/
 *   OVERLAP/HEROES là 5 sheet quy tắc bản quyền RIÊNG theo từng NXB (tầng ưu
 *   tiên 2 trong copyrightResolver.js — xem PUBLISHER_SHEET_PARSERS ở
 *   sources/copyrightRules.js để biết registry map các sheet này với NXB nào).
 *
 * CONFIG.OUTPUTS.*  — 2 spreadsheet output mà GAS❶ tạo ra: 顧客作品マスタ và
 *   コピーライトマスタ.
 *
 * CONFIG.TRIGGER_HOURS / TRIGGER_TIMEZONE — dùng bởi createGas1Trigger()
 *   trong main.js để cài time-based trigger chạy 9h & 18h giờ Nhật mỗi ngày.
 *
 * CONFIG.SLACK_PROPERTY_KEYS — tên 2 Script Properties chứa token/channel
 *   Slack thật (KHÔNG hardcode giá trị thật ở đây — điền qua Apps Script
 *   editor > Project Settings > Script Properties, xem comment trong
 *   io/slack.js).
 *
 * CONFIG.COPYRIGHT_HISTORY_SLOTS — số cột lịch sử CopyRight過去1..N mà
 *   コピーライトマスタ hỗ trợ (hiện = 10, khớp với 10 cột 過去1-10 thật trên sheet).
 */
var CONFIG = {
  SOURCES: {
    REGULATION: {
      spreadsheetId: '1T8CooSrzcbZi768KXT7zTUlzpgz4dap0zWUJCkE5jZg',
      sheetName: 'シート1',
    },
    CMS: {
      spreadsheetId: '1vU82_heOwwcYlJr9kv9VEqJVKu3kUPz9gh9R5_ycR0k',
      sheetName: '★列追加の場合は増渕まで★',
    },
    PUBLISHER_RULES: {
      spreadsheetId: '1y5l36o6mvQAtfx3xn3YC4EYa5vn5fy7g2KeWvv5faD8',
      sheets: {
        NG_TITLES: '外部出稿用NGタイトル',
        BASIC_NOTATION: '基本のC表記',
        LINE: 'LINEコピーライト一覧',
        SQUARE_ENIX: 'スクエニコピーライト一覧',
        LIBRE: 'リブレコピーライト',
        OVERLAP: 'オーバーラップ_コピーライト一覧',
        HEROES: 'ヒーローズコピーライト一覧',
      },
    },
  },
  OUTPUTS: {
    CUSTOMER_WORK_MASTER: {
      spreadsheetId: '1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU',
      sheetName: '顧客作品マスタ',
    },
    COPYRIGHT_MASTER: {
      spreadsheetId: '1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc',
      sheetName: 'コピーライトマスタ',
    },
  },
  TRIGGER_HOURS: [9, 18],
  TRIGGER_TIMEZONE: 'Asia/Tokyo',
  SLACK_PROPERTY_KEYS: {
    BOT_TOKEN: 'SLACK_BOT_TOKEN',
    CHANNEL_ID: 'SLACK_CHANNEL_ID',
  },
  COPYRIGHT_HISTORY_SLOTS: 10,
};

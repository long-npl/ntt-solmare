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
 *   tiên 2 trong copyright.js — xem PUBLISHER_SHEET_PARSERS ở
 *   copyright.js để biết registry map các sheet này với NXB nào).
 *
 * CONFIG.OUTPUTS.*  — 2 spreadsheet output mà GAS❶ tạo ra: 顧客作品マスタ và
 *   コピーライトマスタ.
 *
 * CONFIG.TRIGGER_HOURS / TRIGGER_TIMEZONE — dùng bởi createGas1Trigger()
 *   trong main.js để cài time-based trigger chạy 9h & 17h giờ Nhật mỗi ngày.
 *
 * CONFIG.SLACK_PROPERTY_KEYS — tên 2 Script Properties chứa token/channel
 *   Slack thật (KHÔNG hardcode giá trị thật ở đây — điền qua Apps Script
 *   editor > Project Settings > Script Properties, xem comment trong
 *   io.js).
 *
 * CONFIG.COPYRIGHT_HISTORY_SLOTS — số cột lịch sử CopyRight過去1..N mà
 *   コピーライトマスタ hỗ trợ (hiện = 10, khớp với 10 cột 過去1-10 thật trên sheet).
 */
var CONFIG = {
  SOURCES: {
    REGULATION: {
      spreadsheetId: "1T8CooSrzcbZi768KXT7zTUlzpgz4dap0zWUJCkE5jZg",
      sheetName: "シート1",
    },
    CMS: {
      // spreadsheetId: '1vU82_heOwwcYlJr9kv9VEqJVKu3kUPz9gh9R5_ycR0k',
      spreadsheetId: "1Kxb4YNV1dUFkoAbUEnMPFXnXg3AZCi7zdos3SFmBTQU", //DEMO
      sheetName: "★列追加の場合は増渕まで★",
    },
    PUBLISHER_RULES: {
      spreadsheetId: "1y5l36o6mvQAtfx3xn3YC4EYa5vn5fy7g2KeWvv5faD8",
      sheets: {
        NG_TITLES: "外部出稿用NGタイトル",
        BASIC_NOTATION: "基本のC表記",
        // LINE: 'LINEコピーライト一覧',
        // SQUARE_ENIX: 'スクエニコピーライト一覧',
        // LIBRE: 'リブレコピーライト',
        // OVERLAP: 'オーバーラップ_コピーライト一覧',
        // HEROES: 'ヒーローズコピーライト一覧',
      },
    },
    // Nguồn cột I 掲載停止日付 của 顧客作品マスタ (user cung cấp 2026-08-03).
    // Folder: https://drive.google.com/drive/folders/1nv1ivJBdMGe7LOdHfAqX30AIZY55ge6a
    // Trong folder có nhiều file theo ngày; GAS lấy file có yyyyMMdd LỚN NHẤT mà
    // không vượt ngày chạy (xem io/io.js: findLatestSuspensionFile).
    SUSPENSION: {
      folderId: "1nv1ivJBdMGe7LOdHfAqX30AIZY55ge6a",
      filePattern: "^multi_title_(\\d{8})\\.tsv$",
      // Vị trí 2 cột trong file TSV, theo CHỮ CÁI CỘT (user xác nhận 2026-08-04).
      // Định vị theo vị trí chứ không theo tên header vì file do hệ thống khác
      // xuất ra, hàng đầu không phải header đáng tin — xem JSDoc của
      // parseSuspensionRows() trong sources.js.
      titleIdColumn: "A",
      suspensionDateColumn: "D",
      // encoding CHƯA được xác nhận bằng mắt trên file thật. Để UTF-8 vì hầu hết
      // file xuất ra hiện dùng nó, và sai encoding KHÔNG làm sai việc so khớp
      // (khoá là số タイトルID, không phải chữ Nhật) — chỉ làm giá trị ngày ghi ra
      // cột I bị mojibake NẾU ngày có kèm chữ Nhật (vd '2025/2/8（土）'). Chạy
      // probe_dumpSuspensionTsv() để so 2 encoding rồi đổi nếu cần.
      encoding: "UTF-8",
    },
  },
  OUTPUTS: {
    CUSTOMER_WORK_MASTER: {
      // spreadsheetId: '1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU',
      spreadsheetId: "1rekXT213A6Cv0kKDZwzRzHerxl710DAqDvABpTPbQyE", //DEMO
      sheetName: "顧客作品マスタ",
    },
    COPYRIGHT_MASTER: {
      // spreadsheetId: '1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc',
      spreadsheetId: "1MSDCBYjQ--1qKju6liPbsufsNz47AhYrOTVwOm31QkI", //DEMO
      sheetName: "コピーライトマスタ",
    },
  },
  // 9時・17時 theo ô B8 của ガワ mới: '①更新タイミング：毎日　9時、17時にGASで更新
  // ＋旧情報アーカイブ' (spec §10c). Phần '旧情報アーカイブ' CHƯA được cài đặt —
  // ngoài phạm vi (spec §2). Sau khi đổi giá trị này PHẢI chạy tay
  // createGas1Trigger() một lần để xoá trigger 18h cũ và cài lại.
  TRIGGER_HOURS: [9, 17],
  TRIGGER_TIMEZONE: "Asia/Tokyo",
  SLACK_PROPERTY_KEYS: {
    BOT_TOKEN: "SLACK_BOT_TOKEN",
    CHANNEL_ID: "SLACK_CHANNEL_ID",
  },
  COPYRIGHT_HISTORY_SLOTS: 10,
};

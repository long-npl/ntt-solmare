// config.js — spreadsheet IDs, sheet names, hằng số dùng chung cho GAS❶
//
// File này KHÔNG chứa logic, chỉ chứa dữ liệu cấu hình. Mọi ID/tên sheet
// trong toàn bộ codebase đều lấy từ đây (không hardcode ID lặp lại ở nơi
// khác) — muốn đổi 1 spreadsheet nguồn/output, chỉ cần sửa đúng 1 chỗ.

/**
 * CONFIG.SOURCES.*  — các nguồn GAS❶ đọc trực tiếp (không qua IMPORTRANGE):
 *   REGULATION (bộ lọc + 3 cột phán định), CMS (danh sách tác phẩm),
 *   PUBLISHER_RULES (chỉ sheet 外部出稿用NGタイトル, dùng làm nguồn cảnh báo),
 *   PUBLISHER_COPYRIGHT (quy tắc sinh 出版社コピーライト), SUSPENSION (file TSV
 *   trên Drive cấp 掲載停止日付).
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
 * CONFIG.COPYRIGHT_HISTORY_SLOTS — số cột lịch sử コピーライト_過去分1..N của
 *   コピーライトマスタ. Giảm 10 -> 5 (2026-08-04) theo ghi chú ô B10 của ガワ mới:
 *   `②旧コピーライトは5つまで保存(6つ以前はマスタから削除)`.
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
    // Chỉ còn dùng 1 sheet của file này: 外部出稿用NGタイトル (nguồn cảnh báo).
    // 基本のC表記 và 5 sheet quy tắc riêng NXB (LINE/スクエニ/リブレ/オーバーラップ/
    // ヒーローズ) ĐÃ BỊ BỎ 2026-08-04 — thay hoàn toàn bằng PUBLISHER_COPYRIGHT
    // bên dưới (user chốt). Xem comment đầu copyright.js.
    PUBLISHER_RULES: {
      spreadsheetId: "1y5l36o6mvQAtfx3xn3YC4EYa5vn5fy7g2KeWvv5faD8",
      sheets: {
        NG_TITLES: "外部出稿用NGタイトル",
      },
    },
    // Nguồn DUY NHẤT của quy tắc sinh 出版社コピーライト (cột K của コピーライトマスタ).
    // Hiện sheet này nằm trong file thiết kế 【ソル】タイトルマスタ　ガワ作成 0803.
    //
    // ⚠️ spreadsheetId CHƯA có — cần ID của spreadsheet thật nơi sheet này sẽ sống.
    // Để trống có chủ đích: readSheetValues() sẽ throw ngay thay vì chạy tiếp và
    // để trống toàn bộ cột K một cách im lặng cho 1.730 tác phẩm.
    PUBLISHER_COPYRIGHT: {
      spreadsheetId: "",
      sheetName: "出版社別コピーライトマスタ",
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
  COPYRIGHT_HISTORY_SLOTS: 5,
};

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
 *   trên Drive cấp 掲載停止日付), COMMIT_MANAGEMENT (cột E タイトル区分 — CHƯA có
 *   spreadsheetId), PRE_END_EXTENSION (cột R+S 先行終了日 延長/最終確定),
 *   MASS_FREE (cột T/U 大量無料開始日・終了日 — CHƯA có spreadsheetId).
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
      spreadsheetId: '1vU82_heOwwcYlJr9kv9VEqJVKu3kUPz9gh9R5_ycR0k',
      // spreadsheetId: "1Kxb4YNV1dUFkoAbUEnMPFXnXg3AZCi7zdos3SFmBTQU", //DEMO
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
    // Nguồn DUY NHẤT của quy tắc sinh 出版社コピーライト (cột K của コピーライトマスタ) —
    // thay hoàn toàn 基本のC表記 + 5 sheet riêng NXB. Xem comment đầu copyright.js.
    //
    // Đây là nguồn PHỤ: không đọc được thì cột K được GIỮ NGUYÊN giá trị đang có và
    // lần chạy vẫn tiếp tục (xem try/catch trong runGas1). Cột K được tính lại mỗi
    // lần chạy, nên thêm/sửa quy tắc trong sheet này là lần chạy sau tự cập nhật.
    PUBLISHER_COPYRIGHT: {
      spreadsheetId: "1FmW8IrpUQKDEdjsWvlLSPDvTKhWwdbEUf_HLWOgHuFM",
      sheetName: "出版社別コピーライトマスタ",
    },
    // Nguồn cột E タイトル区分 của 顧客作品マスタ (user cung cấp quy tắc 2026-08-13).
    //
    // ⚠️ spreadsheetId CHƯA CÓ — mới chỉ có file .xlsx trong example/. Giống MASS_FREE:
    // để trống thì GAS BỎ QUA nguồn này và cột E giữ nguyên giá trị đang có; điền ID
    // vào đây là đủ để kích hoạt, không phải sửa code chỗ nào khác. Trạng thái "chưa
    // cấu hình" được ghi 1 dòng vào tab GAS1警告 mỗi lần chạy.
    //
    // File chỉ có ĐÚNG 1 sheet (広告出稿必須タイトル, 4.217 dòng) nên tên sheet không có
    // rủi ro chọn nhầm như MASS_FREE — nhưng vẫn khai báo ở đây thay vì hardcode.
    //
    // Cột dùng tới: タイトル区分 (cờ) và タイトル名 (khoá join). Tra theo TÊN cột chứ
    // không theo chữ cái C/F trong spec — 安蒜 chèn thêm cột là chuyện đã xảy ra
    // (bản này đã có thêm 出稿開始希望日 ở B so với spec gốc).
    COMMIT_MANAGEMENT: {
      spreadsheetId: "",
      sheetName: "広告出稿必須タイトル",
    },
    // Nguồn cột R 先行終了日（延長）của 顧客作品マスタ (user cung cấp 2026-08-07).
    // Từ cột R suy ra luôn cột S 先行終了日（最終確定）= R nếu R có ngày, ngược lại = Q.
    //
    // Layout sheet Sheet1 có 3 HÀNG HEADER: hàng 1 là header thật (更新日/タイトルID/
    // タイトル/出版社/...), hàng 2 gộp nhóm (F=当初, G=延長), hàng 3 là 1回目〜7回目 nằm
    // dưới nhóm 延長 (cột G→M). Vì vậy sources.js dò RIÊNG 2 hàng header: hàng có
    // タイトルID (lấy khoá join) và hàng có 1回目/2回目 (lấy dải cột gia hạn) — xem
    // parsePreEndExtensionRows(). Không hardcode chữ cái cột G/M ở đây là CÓ Ý:
    // nguồn đã có sẵn 7 cột và 安蒜 sẽ thêm 8回目 khi cần, tra theo tên '<n>回目' thì
    // cột mới tự được nhận, hardcode 'G'..'M' thì lần đó im lặng bỏ mất cột.
    //
    // Đây là nguồn PHỤ: đọc không được thì cột R+S được GIỮ NGUYÊN và lần chạy vẫn
    // tiếp tục (xem try/catch trong runGas1). Bắt buộc phải vậy — R là cột GAS ghi
    // đè hoàn toàn, nên coi "không đọc được" = "rỗng" sẽ XOÁ ngày gia hạn của 532
    // tác phẩm chỉ vì một lần mất quyền truy cập.
    PRE_END_EXTENSION: {
      spreadsheetId: "1OX4LXjKU99QSiy1EpcPf7e8BHWRuv8Bq3Ckbn6seOfY",
      sheetName: "Sheet1",
    },
    // Nguồn cột T 大量無料開始日 / U 大量無料終了日 của 顧客作品マスタ.
    //
    // ⚠️ spreadsheetId CHƯA CÓ (user chưa cấp ID, 2026-08-07). Để trống thì GAS BỎ QUA
    // nguồn này và cột T/U được giữ nguyên giá trị đang có — điền ID vào đây là đủ để
    // kích hoạt, không phải sửa code chỗ nào khác. Trạng thái "chưa cấu hình" cũng
    // được ghi 1 dòng vào tab GAS1警告 mỗi lần chạy để nó không bị quên vĩnh viễn.
    //
    // sheetName: file 大量無料希望作品リスト_CA様 có 8 sheet; sheet ĐÚNG là ★出稿回答シート —
    // xác định bằng chữ cái cột trong spec (H列 キャンペーン開始日 / I列 キャンペーン終了日).
    // 2 sheet khác cũng có cặp cột cùng tên nhưng LỆCH VỊ TRÍ (候補_1 ở I/J, 延長 ở G/H)
    // nên nếu điền sai tên sheet vào đây, dữ liệu vẫn parse ra được mà sai cột — dù
    // vậy vẫn tra theo TÊN cột chứ không theo chữ cái, để bền với việc chèn cột.
    MASS_FREE: {
      spreadsheetId: "",
      sheetName: "★出稿回答シート",
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
      spreadsheetId: '1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU',
      // spreadsheetId: "1rekXT213A6Cv0kKDZwzRzHerxl710DAqDvABpTPbQyE", //DEMO
      sheetName: "顧客作品マスタ",
    },
    COPYRIGHT_MASTER: {
      spreadsheetId: '1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc',
      // spreadsheetId: "1MSDCBYjQ--1qKju6liPbsufsNz47AhYrOTVwOm31QkI", //DEMO
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

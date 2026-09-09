// 0_config.js — mọi spreadsheet ID và hằng số vận hành của GAS❶. Không có logic.
//
// SOURCES: 8 nguồn đọc vào. OUTPUTS: 2 master ghi ra.
// Nguồn nào BẮT BUỘC / nguồn nào PHỤ được khai báo ở 3_sources.js, không phải ở đây —
// file này chỉ trả lời "đọc ở đâu", không trả lời "hỏng thì sao".

var CONFIG = {
  SOURCES: {
    // Cấp 3 cột phán định ①②③. Tra bằng cascade 3 tầng — xem docs/decisions.md #cascade-01
    REGULATION: {
      spreadsheetId: '1T8CooSrzcbZi768KXT7zTUlzpgz4dap0zWUJCkE5jZg',
      sheetName: 'シート1',
    },
    // Nguồn NỀN TẢNG: quyết định tác phẩm nào tồn tại. Cấp 10 cột.
    CMS: {
      spreadsheetId: '1vU82_heOwwcYlJr9kv9VEqJVKu3kUPz9gh9R5_ycR0k',
      sheetName: '★列追加の場合は増渕まで★',
    },
    // Chỉ dùng 1 sheet của file này (nguồn cảnh báo, không cấp cột nào).
    PUBLISHER_RULES: {
      spreadsheetId: '1y5l36o6mvQAtfx3xn3YC4EYa5vn5fy7g2KeWvv5faD8',
      sheets: {
        NG_TITLES: '外部出稿用NGタイトル',
      },
    },
    // Nguồn DUY NHẤT của quy tắc sinh 出版社コピーライト và 出版社事前確認.
    PUBLISHER_COPYRIGHT: {
      spreadsheetId: '1FmW8IrpUQKDEdjsWvlLSPDvTKhWwdbEUf_HLWOgHuFM',
      sheetName: '出版社別コピーライトマスタ',
    },
    // Cấp タイトル区分. Tra theo TÊN vì cột ID của nguồn này gần như trống.
    COMMIT_MANAGEMENT: {
      spreadsheetId: '12DgvzixrfyaUtDlHjXdgsrSfT0oUsZhiqaHeeG5EWvU',
      sheetName: '広告出稿必須タイトル',
    },
    // Cấp 先行終了日（延長）. Sheet có 3 HÀNG HEADER — xem parsePreEndExtension().
    PRE_END_EXTENSION: {
      spreadsheetId: '1OX4LXjKU99QSiy1EpcPf7e8BHWRuv8Bq3Ckbn6seOfY',
      sheetName: 'Sheet1',
    },
    // Cấp 大量無料開始日/終了日. File có 8 sheet, chỉ ★出稿回答シート là đúng.
    MASS_FREE: {
      spreadsheetId: '13IeYif2S2I1Hka504DPEHG5wqPVKRwOyDzoo2aHGgdU',
      sheetName: '★出稿回答シート',
    },
    // Cấp 掲載停止日付. Là file TSV trên Drive, không phải spreadsheet: lấy file có
    // yyyyMMdd lớn nhất mà không vượt ngày chạy. 2 cột định vị theo CHỮ CÁI vì file do
    // hệ thống khác xuất ra, hàng đầu không phải header đáng tin.
    SUSPENSION: {
      folderId: '1nv1ivJBdMGe7LOdHfAqX30AIZY55ge6a',
      filePattern: '^multi_title_(\\d{8})\\.tsv$',
      titleIdColumn: 'A',
      suspensionDateColumn: 'D',
      encoding: 'UTF-8',
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
    // Sheet ④ vốn là nguồn ĐỌC (SOURCES.PUBLISHER_COPYRIGHT, cùng spreadsheetId/sheetName).
    // Khai báo lại ở OUTPUTS vì từ 2026-09-08 GAS còn GHI THÊM dòng rule trống vào đây —
    // "GAS có quyền ghi vào sheet này" phải là một điều khai báo tường minh, không phải một
    // lệnh ghi lén nằm trong nhánh SOURCES. Xem docs/decisions.md #copyright-autoappend-01
    PUBLISHER_COPYRIGHT: {
      spreadsheetId: '1FmW8IrpUQKDEdjsWvlLSPDvTKhWwdbEUf_HLWOgHuFM',
      sheetName: '出版社別コピーライトマスタ',
    },
  },
  // Đổi giá trị này rồi PHẢI chạy tay createGas1Trigger() một lần để cài lại.
  TRIGGER_HOURS: [9, 17],
  TRIGGER_TIMEZONE: 'Asia/Tokyo',
  // Tên 2 Script Property. KHÔNG hardcode giá trị thật ở đây.
  SLACK_PROPERTY_KEYS: {
    BOT_TOKEN: 'SLACK_BOT_TOKEN',
    CHANNEL_ID: 'SLACK_CHANNEL_ID',
  },
  COPYRIGHT_HISTORY_SLOTS: 5,
};

// config.js — spreadsheet IDs, sheet names, hằng số dùng chung cho GAS❶

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

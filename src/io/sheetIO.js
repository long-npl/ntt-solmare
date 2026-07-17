// io/sheetIO.js — đọc/ghi Google Sheets thật qua SpreadsheetApp (chỉ chạy được
// trong Apps Script, không chạy được ở máy local)

function readSheetValues(spreadsheetId, sheetName) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  return sheet.getDataRange().getValues();
}

// 顧客作品マスタ columns (spec §4.1):
// タイトルNo, CMS ID, タイトルID, タイトル名, 作家名, ジャンル, 出版社, 先行開始日, 先行終了日,
// コピーライト, ③シーモアロゴ判定, 備考, 配信NGフラグ
var CUSTOMER_MASTER_COL = {
  TITLE_NO: 0, CMS_ID: 1, TITLE_ID: 2, TITLE_NAME: 3, AUTHOR: 4, GENRE: 5,
  PUBLISHER: 6, PRE_START: 7, PRE_END: 8, COPYRIGHT: 9, LOGO_JUDGEMENT: 10,
  REMARK: 11, DISTRIBUTION_NG_FLAG: 12,
};
var CUSTOMER_MASTER_COL_COUNT = 13;

function readCustomerWorkMaster() {
  var cfg = CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER;
  var rows = readSheetValues(cfg.spreadsheetId, cfg.sheetName);
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[CUSTOMER_MASTER_COL.TITLE_ID]) continue;
    records.push({
      titleNo: row[CUSTOMER_MASTER_COL.TITLE_NO],
      cmsId: row[CUSTOMER_MASTER_COL.CMS_ID],
      titleId: row[CUSTOMER_MASTER_COL.TITLE_ID],
      titleName: row[CUSTOMER_MASTER_COL.TITLE_NAME],
      author: row[CUSTOMER_MASTER_COL.AUTHOR],
      genre: row[CUSTOMER_MASTER_COL.GENRE],
      publisher: row[CUSTOMER_MASTER_COL.PUBLISHER],
      preStart: row[CUSTOMER_MASTER_COL.PRE_START],
      preEnd: row[CUSTOMER_MASTER_COL.PRE_END],
      copyright: row[CUSTOMER_MASTER_COL.COPYRIGHT],
      logoJudgement: row[CUSTOMER_MASTER_COL.LOGO_JUDGEMENT],
      remark: row[CUSTOMER_MASTER_COL.REMARK],
      distributionNgFlag: row[CUSTOMER_MASTER_COL.DISTRIBUTION_NG_FLAG],
    });
  }
  return records;
}

function customerRecordToRow(record) {
  var row = [];
  row[CUSTOMER_MASTER_COL.TITLE_NO] = record.titleNo;
  row[CUSTOMER_MASTER_COL.CMS_ID] = record.cmsId;
  row[CUSTOMER_MASTER_COL.TITLE_ID] = record.titleId;
  row[CUSTOMER_MASTER_COL.TITLE_NAME] = record.titleName;
  row[CUSTOMER_MASTER_COL.AUTHOR] = record.author;
  row[CUSTOMER_MASTER_COL.GENRE] = record.genre;
  row[CUSTOMER_MASTER_COL.PUBLISHER] = record.publisher;
  row[CUSTOMER_MASTER_COL.PRE_START] = record.preStart;
  row[CUSTOMER_MASTER_COL.PRE_END] = record.preEnd;
  row[CUSTOMER_MASTER_COL.COPYRIGHT] = record.copyright || '';
  row[CUSTOMER_MASTER_COL.LOGO_JUDGEMENT] = record.logoJudgement;
  row[CUSTOMER_MASTER_COL.REMARK] = record.remark;
  row[CUSTOMER_MASTER_COL.DISTRIBUTION_NG_FLAG] = record.distributionNgFlag || '';
  return row;
}

// diffResult.toUpdate items cần có .rowOffset (index 0-based trong existingRecords,
// gán ở main.js bằng attachRowOffsets) để biết ghi đè đúng dòng nào trên sheet thật.
function writeCustomerWorkMaster(diffResult) {
  var cfg = CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER;
  var sheet = SpreadsheetApp.openById(cfg.spreadsheetId).getSheetByName(cfg.sheetName);
  var headerRowCount = 1;

  diffResult.toUpdate.forEach(function (item) {
    var sheetRowIndex = headerRowCount + item.rowOffset + 1; // 1-based sheet row
    sheet.getRange(sheetRowIndex, 1, 1, CUSTOMER_MASTER_COL_COUNT).setValues([customerRecordToRow(item.record)]);
  });

  if (diffResult.toAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    var values = diffResult.toAdd.map(customerRecordToRow);
    sheet.getRange(startRow, 1, values.length, CUSTOMER_MASTER_COL_COUNT).setValues(values);
  }
}

// コピーライトマスタ columns (spec §4.2):
// タイトルNo, タイトル名, 著者名, 出版社(雑誌名/レーベル), 正規コピーライト,
// CopyRight(個別ルールの場合), CopyRight自動生成, CopyRight過去1..10
var COPYRIGHT_MASTER_COL = {
  TITLE_NO: 0, TITLE_NAME: 1, AUTHOR: 2, PUBLISHER: 3, CURRENT: 4,
  INDIVIDUAL_RULE: 5, AUTO_GENERATED: 6, HISTORY_START: 7, HISTORY_SLOTS: 10,
};
var COPYRIGHT_MASTER_COL_COUNT = COPYRIGHT_MASTER_COL.HISTORY_START + COPYRIGHT_MASTER_COL.HISTORY_SLOTS;

function readCopyrightMaster() {
  var cfg = CONFIG.OUTPUTS.COPYRIGHT_MASTER;
  var rows = readSheetValues(cfg.spreadsheetId, cfg.sheetName);
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[COPYRIGHT_MASTER_COL.TITLE_NO]) continue;
    var history = [];
    for (var h = 0; h < COPYRIGHT_MASTER_COL.HISTORY_SLOTS; h++) {
      var value = row[COPYRIGHT_MASTER_COL.HISTORY_START + h];
      if (value) history.push(value);
    }
    records.push({
      titleNo: row[COPYRIGHT_MASTER_COL.TITLE_NO],
      titleName: row[COPYRIGHT_MASTER_COL.TITLE_NAME],
      author: row[COPYRIGHT_MASTER_COL.AUTHOR],
      publisher: row[COPYRIGHT_MASTER_COL.PUBLISHER],
      copyrightCurrent: row[COPYRIGHT_MASTER_COL.CURRENT],
      copyrightHistory: history,
    });
  }
  return records;
}

function copyrightRecordToRow(record) {
  var row = [];
  row[COPYRIGHT_MASTER_COL.TITLE_NO] = record.titleNo;
  row[COPYRIGHT_MASTER_COL.TITLE_NAME] = record.titleName;
  row[COPYRIGHT_MASTER_COL.AUTHOR] = record.author;
  row[COPYRIGHT_MASTER_COL.PUBLISHER] = record.publisher;
  row[COPYRIGHT_MASTER_COL.CURRENT] = record.copyrightCurrent || '';
  row[COPYRIGHT_MASTER_COL.INDIVIDUAL_RULE] = record.tier === 2 ? record.copyrightCurrent : '';
  row[COPYRIGHT_MASTER_COL.AUTO_GENERATED] = record.tier === 3 ? record.copyrightCurrent : '';
  for (var h = 0; h < COPYRIGHT_MASTER_COL.HISTORY_SLOTS; h++) {
    row[COPYRIGHT_MASTER_COL.HISTORY_START + h] = record.copyrightHistory[h] || '';
  }
  return row;
}

function writeCopyrightMaster(diffResult) {
  var cfg = CONFIG.OUTPUTS.COPYRIGHT_MASTER;
  var sheet = SpreadsheetApp.openById(cfg.spreadsheetId).getSheetByName(cfg.sheetName);

  diffResult.toUpdate.forEach(function (item) {
    var sheetRowIndex = 1 + item.rowOffset + 1;
    sheet.getRange(sheetRowIndex, 1, 1, COPYRIGHT_MASTER_COL_COUNT).setValues([copyrightRecordToRow(item.record)]);
  });

  if (diffResult.toAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    var values = diffResult.toAdd.map(copyrightRecordToRow);
    sheet.getRange(startRow, 1, values.length, COPYRIGHT_MASTER_COL_COUNT).setValues(values);
  }
}

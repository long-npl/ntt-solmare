// io/sheetIO.js — đọc/ghi Google Sheets thật qua SpreadsheetApp (chỉ chạy được
// trong Apps Script, không chạy được ở máy local). Cột được tra theo TÊN
// header thật của sheet, không hardcode số cột — nếu ai đó chèn/xoá/đổi thứ
// tự cột trên 2 file output, code vẫn đọc/ghi đúng chỗ.

function readSheetValues(spreadsheetId, sheetName) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  return sheet.getDataRange().getValues();
}

// Đọc hàng 1 của sheet làm header, build map tên -> cột, và kiểm tra đủ các
// cột bắt buộc (throw sớm nếu thiếu, thay vì âm thầm ghi sai chỗ).
function resolveMasterHeader(spreadsheetId, sheetName, requiredHeaders) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  var columnCount = Math.max(sheet.getLastColumn(), 1);
  var headerRow = sheet.getRange(1, 1, 1, columnCount).getValues()[0];
  var headerIndex = buildHeaderIndex(headerRow);
  requiredHeaders.forEach(function (name) { col(headerIndex, name); });
  return { sheet: sheet, headerIndex: headerIndex, columnCount: columnCount };
}

// ==================== 顧客作品マスタ (spec §4.1) ====================

var CUSTOMER_REQUIRED_HEADERS = [
  'タイトルNo', 'CMS ID', 'タイトルID', 'タイトル名', '作家名', 'ジャンル',
  '出版社', '先行開始日', '先行終了日', 'コピーライト', '③シーモアロゴ判定', '備考',
];
// 配信NGフラグ: cột mới đề xuất (spec §4.1, §9.2) — có thể CHƯA tồn tại trên
// sheet thật, nên tra bằng tryCol() (không throw) thay vì col().

function readCustomerWorkMaster() {
  var cfg = CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER;
  var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName, CUSTOMER_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colTitleNo = col(idx, 'タイトルNo');
  var colCmsId = col(idx, 'CMS ID');
  var colTitleId = col(idx, 'タイトルID');
  var colTitleName = col(idx, 'タイトル名');
  var colAuthor = col(idx, '作家名');
  var colGenre = col(idx, 'ジャンル');
  var colPublisher = col(idx, '出版社');
  var colPreStart = col(idx, '先行開始日');
  var colPreEnd = col(idx, '先行終了日');
  var colCopyright = col(idx, 'コピーライト');
  var colLogo = col(idx, '③シーモアロゴ判定');
  var colRemark = col(idx, '備考');
  var colDistributionNg = tryCol(idx, '配信NGフラグ');

  var rows = resolved.sheet.getDataRange().getValues();
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[colTitleId]) continue;
    records.push({
      titleNo: row[colTitleNo],
      cmsId: row[colCmsId],
      titleId: row[colTitleId],
      titleName: row[colTitleName],
      author: row[colAuthor],
      genre: row[colGenre],
      publisher: row[colPublisher],
      preStart: row[colPreStart],
      preEnd: row[colPreEnd],
      copyright: row[colCopyright],
      logoJudgement: row[colLogo],
      remark: row[colRemark],
      distributionNgFlag: colDistributionNg !== undefined ? row[colDistributionNg] : '',
    });
  }
  return records;
}

function customerRecordToRow(record, headerIndex, columnCount) {
  var row = new Array(columnCount).fill('');
  row[col(headerIndex, 'タイトルNo')] = record.titleNo;
  row[col(headerIndex, 'CMS ID')] = record.cmsId;
  row[col(headerIndex, 'タイトルID')] = record.titleId;
  row[col(headerIndex, 'タイトル名')] = record.titleName;
  row[col(headerIndex, '作家名')] = record.author;
  row[col(headerIndex, 'ジャンル')] = record.genre;
  row[col(headerIndex, '出版社')] = record.publisher;
  row[col(headerIndex, '先行開始日')] = record.preStart;
  row[col(headerIndex, '先行終了日')] = record.preEnd;
  row[col(headerIndex, 'コピーライト')] = record.copyright || '';
  row[col(headerIndex, '③シーモアロゴ判定')] = record.logoJudgement;
  row[col(headerIndex, '備考')] = record.remark;
  var colDistributionNg = tryCol(headerIndex, '配信NGフラグ');
  if (colDistributionNg !== undefined) row[colDistributionNg] = record.distributionNgFlag || '';
  return row;
}

// diffResult.toUpdate items cần có .rowOffset (index 0-based trong existingRecords,
// gán ở main.js bằng attachRowOffsets) để biết ghi đè đúng dòng nào trên sheet thật.
function writeCustomerWorkMaster(diffResult) {
  var cfg = CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER;
  var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName, CUSTOMER_REQUIRED_HEADERS);
  var sheet = resolved.sheet;
  var headerIndex = resolved.headerIndex;
  var columnCount = resolved.columnCount;

  diffResult.toUpdate.forEach(function (item) {
    var sheetRowIndex = 1 + item.rowOffset + 1; // +1 header, +1 chuyển 0-based -> 1-based
    sheet.getRange(sheetRowIndex, 1, 1, columnCount).setValues([customerRecordToRow(item.record, headerIndex, columnCount)]);
  });

  if (diffResult.toAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    var values = diffResult.toAdd.map(function (record) { return customerRecordToRow(record, headerIndex, columnCount); });
    sheet.getRange(startRow, 1, values.length, columnCount).setValues(values);
  }
}

// ==================== コピーライトマスタ (spec §4.2) ====================

var COPYRIGHT_REQUIRED_HEADERS = [
  'タイトルNo', 'タイトル名', '著者名', '出版社(雑誌名/レーベル)',
  '正規コピーライト', 'CopyRight(個別ルールの場合)', 'CopyRight自動生成',
];

function copyrightHistoryHeaderName(slot) {
  return 'CopyRight過去' + slot;
}

function readCopyrightMaster() {
  var cfg = CONFIG.OUTPUTS.COPYRIGHT_MASTER;
  var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName, COPYRIGHT_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colTitleNo = col(idx, 'タイトルNo');
  var colTitleName = col(idx, 'タイトル名');
  var colAuthor = col(idx, '著者名');
  var colPublisher = col(idx, '出版社(雑誌名/レーベル)');
  var colCurrent = col(idx, '正規コピーライト');
  var historyCols = [];
  for (var h = 1; h <= CONFIG.COPYRIGHT_HISTORY_SLOTS; h++) {
    historyCols.push(col(idx, copyrightHistoryHeaderName(h)));
  }

  var rows = resolved.sheet.getDataRange().getValues();
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[colTitleNo]) continue;
    var history = [];
    historyCols.forEach(function (c) {
      if (row[c]) history.push(row[c]);
    });
    records.push({
      titleNo: row[colTitleNo],
      titleName: row[colTitleName],
      author: row[colAuthor],
      publisher: row[colPublisher],
      copyrightCurrent: row[colCurrent],
      copyrightHistory: history,
    });
  }
  return records;
}

function copyrightRecordToRow(record, headerIndex, columnCount) {
  var row = new Array(columnCount).fill('');
  row[col(headerIndex, 'タイトルNo')] = record.titleNo;
  row[col(headerIndex, 'タイトル名')] = record.titleName;
  row[col(headerIndex, '著者名')] = record.author;
  row[col(headerIndex, '出版社(雑誌名/レーベル)')] = record.publisher;
  row[col(headerIndex, '正規コピーライト')] = record.copyrightCurrent || '';
  row[col(headerIndex, 'CopyRight(個別ルールの場合)')] = record.tier === 2 ? record.copyrightCurrent : '';
  row[col(headerIndex, 'CopyRight自動生成')] = record.tier === 3 ? record.copyrightCurrent : '';
  for (var h = 1; h <= CONFIG.COPYRIGHT_HISTORY_SLOTS; h++) {
    row[col(headerIndex, copyrightHistoryHeaderName(h))] = record.copyrightHistory[h - 1] || '';
  }
  return row;
}

function writeCopyrightMaster(diffResult) {
  var cfg = CONFIG.OUTPUTS.COPYRIGHT_MASTER;
  var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName, COPYRIGHT_REQUIRED_HEADERS);
  var sheet = resolved.sheet;
  var headerIndex = resolved.headerIndex;
  var columnCount = resolved.columnCount;

  diffResult.toUpdate.forEach(function (item) {
    var sheetRowIndex = 1 + item.rowOffset + 1;
    sheet.getRange(sheetRowIndex, 1, 1, columnCount).setValues([copyrightRecordToRow(item.record, headerIndex, columnCount)]);
  });

  if (diffResult.toAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    var values = diffResult.toAdd.map(function (record) { return copyrightRecordToRow(record, headerIndex, columnCount); });
    sheet.getRange(startRow, 1, values.length, columnCount).setValues(values);
  }
}

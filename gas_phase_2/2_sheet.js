// ⚠️  FILE NÀY ĐƯỢC SINH RA TỰ ĐỘNG — MỌI THAY ĐỔI SẼ BỊ GHI ĐÈ.
//
// Nguồn gốc : shared/sheet.js
// Sinh bởi  : node tools/sync-shared.js
//
// Sửa shared/sheet.js rồi chạy lại lệnh trên. Hai harness test đều gọi
// `node tools/sync-shared.js --check` trước khi chạy, nên nếu bạn sửa tay ở đây,
// test sẽ đỏ chứ không âm thầm chấp nhận.

// sheet.js — lớp bọc mỏng quanh API Apps Script. Không chứa nghiệp vụ.
//
// NGUỒN GỐC: shared/sheet.js. Các bản chép do tools/sync-shared.js sinh ra — sửa ở
// đây rồi chạy `node tools/sync-shared.js`.
//
// Ba hàm này từng có 2 bản (GAS❶ và GAS❷) vì cả hai đều phải đọc sheet có header
// không nằm ở hàng 1. Chúng chỉ chạy được trong Apps Script, nhưng nạp được vào
// Node vì mọi lời gọi API đều nằm TRONG thân hàm.

/** Đọc toàn bộ giá trị ô của 1 sheet, kể cả hàng header. */
function readSheetValues(spreadsheetId, sheetName) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  return sheet.getDataRange().getValues();
}

/**
 * Đọc 1 sheet master: tự dò hàng header, build header index, kiểm đủ cột bắt buộc.
 *
 * Tự dò chứ không hardcode số hàng — ガワ đã đổi layout nhiều lần và header hiện ở
 * hàng 15. Xem docs/decisions.md #sheet-01
 *
 * @returns {{sheet, headerIndex: Map<string,number>, headerRowIndex: number,
 *   columnCount: number, values: Array<Array<*>>}} headerRowIndex là 0-based.
 */
function resolveMasterHeader(spreadsheetId, sheetName, requiredHeaders) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName + ' (spreadsheet ' + spreadsheetId + ')');
  var values = sheet.getDataRange().getValues();
  var headerRowIndex = findHeaderRowIndex(values, requiredHeaders);
  var headerRow = values[headerRowIndex];
  var headerIndex = buildHeaderIndex(headerRow);
  requiredHeaders.forEach(function (name) { col(headerIndex, name); });
  return {
    sheet: sheet,
    headerIndex: headerIndex,
    headerRowIndex: headerRowIndex,
    // Không bao giờ ghi hẹp hơn số cột đã biết.
    columnCount: Math.max(sheet.getLastColumn(), headerRow.length, 1),
    values: values,
  };
}

// Nhãn trong khối ghi chú phía trên vùng dữ liệu; ô ngay BÊN PHẢI nhãn nhận giá trị.
var UPDATED_AT_LABEL = '更新日';

/**
 * Đóng dấu thời điểm chạy vào ô 更新日 của một master.
 *
 * Dò theo nhãn chứ không hardcode 'C5', và chỉ quét các hàng TRÊN hàng header —
 * dưới đó là dữ liệu thật, hoàn toàn có thể chứa chữ 更新日 trong một ô ghi chú.
 * So khớp là ĐÚNG BẰNG, không phải chứa. Xem docs/decisions.md #sheet-02
 *
 * @returns {string|null} Ô đã ghi dạng A1, null nếu không tìm thấy nhãn.
 */
function stampUpdatedAt(sheet, values, headerRowIndex, runAt) {
  for (var r = 0; r < headerRowIndex; r++) {
    var row = values[r];
    if (!row) continue;
    // row.length - 1: nhãn ở cột cuối thì không có ô nào bên phải để ghi.
    for (var c = 0; c < row.length - 1; c++) {
      if (normalizeHeaderText(row[c]) !== UPDATED_AT_LABEL) continue;
      sheet.getRange(r + 1, c + 2).setValue(runAt);
      return columnIndexToLetter(c + 1) + (r + 1);
    }
  }
  return null;
}

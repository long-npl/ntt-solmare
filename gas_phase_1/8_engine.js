// ⚠️  FILE NÀY ĐƯỢC SINH RA TỰ ĐỘNG — MỌI THAY ĐỔI SẼ BỊ GHI ĐÈ.
//
// Nguồn gốc : shared/engine.js
// Sinh bởi  : node tools/sync-shared.js
//
// Sửa shared/engine.js rồi chạy lại lệnh trên. Hai harness test đều gọi
// `node tools/sync-shared.js --check` trước khi chạy, nên nếu bạn sửa tay ở đây,
// test sẽ đỏ chứ không âm thầm chấp nhận.

// engine.js — đọc bảng cột rồi lo việc đọc / so / ghi. Không biết cột nào là cột gì.
//
// NGUỒN GỐC: shared/engine.js. Các bản chép do tools/sync-shared.js sinh ra — sửa ở
// đây rồi chạy `node tools/sync-shared.js`.
//
// MỘT CỘT KHAI BÁO NHƯ SAU:
//   {
//     header: '初回配信巻数',   // tên cột THẬT trên sheet — khoá tra duy nhất
//     field:  'firstVolume',   // tên property trên record
//     from:   'cms',           // 'cms' | 'regulation' | 'lookup:<key>' | 'derive' | 'self'
//     rule:   ruleFirstVolume, // chỉ khi from === 'derive'; nhận (record, existing)
//     write:  '上書',
//     type:   'text',          // 'text' | 'date' — chỉ có tác dụng khi write === '上書'
//     keep:   false,           // true = nguồn phụ lỗi thì lấy lại giá trị đang có
//     optional: false,         // true = cột có thể chưa tồn tại trên sheet
//     skipCompare: false,      // true = không tham gia quyết định có ghi hay không
//   }
//
// KHÔNG CÓ CHỮ CÁI CỘT Ở ĐÂY, VÀ KHÔNG ĐƯỢC THÊM VÀO: `header` là thứ code thật sự
// tra, và là thứ duy nhất không đổi khi 池永 chèn cột. Xem docs/decisions.md #engine-03

var WRITE_OVERWRITE = '上書';   // ghi đè vô điều kiện, kể cả ghi rỗng
var WRITE_CONDITIONAL = '条件'; // có giá trị thì đè, rỗng thì giữ nguyên ô
var WRITE_ONCE = '1回';         // ô đã có chữ thì không bao giờ đụng
var WRITE_NEVER = '—';          // GAS không ghi cột này

/**
 * Hàm so sánh của một cột, SUY RA từ chế độ ghi của chính nó.
 *
 * Đây là lý do engine tồn tại. Trước đây chế độ ghi nằm ở io.js còn hàm so sánh nằm
 * ở main.js, và khi hai chỗ chọn khác nhau thì ô đó hoặc churn vĩnh viễn hoặc không
 * bao giờ được ghi. Xem docs/decisions.md #engine-01
 *
 * @returns {function(*, *): boolean|null} null = cột không được so.
 *   Thứ tự tham số LUÔN là (existing, incoming) — cả 3 hàm đều không đối xứng.
 */
function compareFor(column) {
  if (column.write === WRITE_NEVER) return null;
  if (column.write === WRITE_CONDITIONAL) return sameKeepWhenBlankValue;
  if (column.write === WRITE_ONCE) return sameWriteOnceValue;
  return column.type === 'date' ? sameDateValue : sameValue;
}

/** Tên cột bắt buộc phải có trên sheet = mọi header trong bảng, trừ cột tuỳ chọn. */
function requiredHeaders(columns) {
  var names = [];
  columns.forEach(function (column) {
    if (column.optional === true) return;
    names.push(column.header);
  });
  return names;
}

/**
 * Dựng 1 record từ một dòng sheet đã đọc.
 *
 * Giữ `rawRow` và `sheetRow` (số dòng THẬT, 1-based) vì đường ghi cần cả hai: rawRow
 * để bảo toàn cột GAS không sở hữu, sheetRow để ghi đúng dòng.
 */
function readRecord(row, headerIndex, columns, sheetRow) {
  var record = { sheetRow: sheetRow, rawRow: row };
  columns.forEach(function (column) {
    var index = headerIndex.get(normalizeHeaderText(column.header));
    if (index === undefined) return;
    record[column.field] = row[index];
  });
  return record;
}

/** Hai record có được coi là không đổi hay không — theo đúng chế độ ghi của từng cột. */
function recordsEqual(existing, incoming, columns) {
  for (var i = 0; i < columns.length; i++) {
    if (columns[i].skipCompare === true) continue;
    var compare = compareFor(columns[i]);
    if (compare === null) continue;
    if (!compare(existing[columns[i].field], incoming[columns[i].field])) return false;
  }
  return true;
}

/**
 * Dựng mảng giá trị để ghi 1 dòng, TỪ BẢN COPY của dòng cũ.
 *
 * Copy trước rồi mới đè các cột GAS sở hữu, nên mọi cột người gõ tay và mọi cột 池永
 * vừa chèn thêm đều tự được bảo toàn — không cần danh sách "cấm ghi".
 * Xem docs/decisions.md #engine-02
 *
 * @param {Array<*>|undefined} previousRow - rawRow của dòng cũ; undefined khi append
 */
function toSheetRow(record, headerIndex, columnCount, columns, previousRow) {
  var row = [];
  for (var c = 0; c < columnCount; c++) {
    var carried = previousRow ? previousRow[c] : '';
    row.push(carried === null || carried === undefined ? '' : carried);
  }

  columns.forEach(function (column) {
    if (column.write === WRITE_NEVER) return;
    var index = headerIndex.get(normalizeHeaderText(column.header));
    // Cột chưa tồn tại trên sheet: bỏ qua thay vì throw — đó là cách cột tuỳ chọn
    // sống được trên một ガワ chưa kịp thêm nó.
    if (index === undefined) return;

    var value = record[column.field];
    var safe = value === null || value === undefined ? '' : value;

    if (column.write === WRITE_CONDITIONAL) {
      if (normalizeJapaneseText(safe) !== '') row[index] = safe;
      return;
    }
    if (column.write === WRITE_ONCE) {
      if (normalizeJapaneseText(row[index]) === '' && normalizeJapaneseText(safe) !== '') {
        row[index] = safe;
      }
      return;
    }
    row[index] = safe;
  });

  return row;
}

/**
 * Số hàng THẬT của các hàng TRỐNG trong vùng dữ liệu (không có タイトル名).
 *
 * readMaster() bỏ qua chúng, còn đường ghi vốn luôn append tại getLastRow()+1 — nên
 * một khi có hàng trống, chúng ở đó vĩnh viễn và sheet trông như chưa được ghi dù dữ
 * liệu nằm ngay phía dưới. Xem docs/decisions.md #write-01
 */
function blankDataRows(resolved) {
  var nameIndex = resolved.headerIndex.get(normalizeHeaderText('タイトル名'));
  var rows = [];
  for (var i = resolved.headerRowIndex + 1; i < resolved.values.length; i++) {
    var row = resolved.values[i];
    if (row && normalizeJapaneseText(row[nameIndex]) !== '') continue;
    rows.push(i + 1);
  }
  return rows;
}

/**
 * Cắt danh sách số hàng thành các DẢI LIÊN TIẾP, để ghi mỗi dải bằng 1 lệnh setValues()
 * thay vì 1 lệnh mỗi hàng — mỗi lời gọi API là một round-trip.
 */
function contiguousRuns(rows) {
  var runs = [];
  rows.forEach(function (row) {
    var last = runs[runs.length - 1];
    if (last && row === last[last.length - 1] + 1) { last.push(row); return; }
    runs.push([row]);
  });
  return runs;
}

/**
 * Đặt các record MỚI vào sheet: LẤP hàng trống trước, phần còn lại mới append.
 *
 * Hàng trống được coi là hàng MỚI (previousRow = undefined) chứ không phải hàng cần
 * bảo toàn: hàng không có タイトル名 thì không ai đang giữ dữ liệu gì ở đó, và với
 * GAS❷ thì đó cũng là điều kiện để cột đóng dấu 素材共有日 được ghi.
 *
 * @param {function(object): Array<*>} buildRow - Dựng mảng giá trị cho 1 record
 */
function placeNewRows(sheet, resolved, records, buildRow) {
  var width = resolved.columnCount;
  var pending = records.slice();

  contiguousRuns(blankDataRows(resolved)).forEach(function (run) {
    if (pending.length === 0) return;
    var take = pending.splice(0, run.length);
    sheet.getRange(run[0], 1, take.length, width).setValues(take.map(buildRow));
  });

  if (pending.length === 0) return;
  // getLastRow() chứ không phải số dòng đã parse: dưới vùng dữ liệu có thể còn ô ghi
  // chú của 池永, ghi đè lên chúng là mất chú thích.
  var startRow = Math.max(sheet.getLastRow(), resolved.headerRowIndex + 1) + 1;
  sheet.getRange(startRow, 1, pending.length, width).setValues(pending.map(buildRow));
}

/**
 * Đọc mọi dòng dữ liệu của một master. Bỏ dòng không có タイトル名 — đó là trường duy
 * nhất chắc chắn có giá trị ở mọi dòng do GAS ghi.
 */
function readMaster(outputConfig, columns) {
  var resolved = resolveMasterHeader(outputConfig.spreadsheetId, outputConfig.sheetName,
    requiredHeaders(columns));
  var nameIndex = resolved.headerIndex.get(normalizeHeaderText('タイトル名'));
  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < resolved.values.length; i++) {
    var row = resolved.values[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[nameIndex]) === '') continue;
    records.push(readRecord(row, resolved.headerIndex, columns, i + 1));
  }
  resolved.records = records;
  return resolved;
}

/**
 * Ghi kết quả diff vào master. KHÔNG BAO GIỜ xoá dòng.
 *
 * Đóng dấu 更新日 ở CUỐI, tức chỉ khi mọi dòng đã ghi xong — ô đó nói "dữ liệu bên
 * dưới cập nhật tới lúc này", nên đóng dấu trước khi ghi là nói dối nếu bước ghi
 * throw giữa chừng. Đóng dấu KỂ CẢ khi diff rỗng: "chạy mà không có gì đổi" khác hẳn
 * "GAS chết từ hôm kia".
 *
 * @returns {string|null} Ô 更新日 đã đóng dấu, dạng A1.
 */
function writeMaster(outputConfig, columns, diffResult, runAt) {
  var resolved = resolveMasterHeader(outputConfig.spreadsheetId, outputConfig.sheetName,
    requiredHeaders(columns));
  var sheet = resolved.sheet;
  var width = resolved.columnCount;

  diffResult.toUpdate.forEach(function (item) {
    var values = toSheetRow(item.record, resolved.headerIndex, width, columns, item.previous.rawRow);
    sheet.getRange(item.sheetRow, 1, 1, width).setValues([values]);
  });

  if (diffResult.toAdd.length > 0) {
    placeNewRows(sheet, resolved, diffResult.toAdd, function (record) {
      return toSheetRow(record, resolved.headerIndex, width, columns, undefined);
    });
  }

  return stampUpdatedAt(sheet, resolved.values, resolved.headerRowIndex, runAt);
}

/**
 * Điền các cột KHÔNG lấy thẳng từ nguồn: cột `derive` (chạy rule) và cột `keep` mà
 * nguồn của nó đọc lỗi (lấy lại giá trị đang có trên sheet).
 *
 * Phải chạy SAU bước khớp dòng, vì cả hai việc đều cần biết `match.existing`.
 * Xem docs/decisions.md #sources-02
 */
function applyRules(matches, columns, loaded) {
  matches.forEach(function (match) {
    columns.forEach(function (column) {
      var sourceKey = column.from.indexOf('lookup:') === 0 ? column.from.slice(7) : null;
      if (column.keep === true && sourceKey !== null && loaded.errors[sourceKey] !== null
        && loaded.errors[sourceKey] !== undefined) {
        match.record[column.field] = match.existing ? match.existing[column.field] : '';
        return;
      }
      if (column.from === 'derive') {
        match.record[column.field] = column.rule(match.record, match.existing);
      }
    });
  });
}

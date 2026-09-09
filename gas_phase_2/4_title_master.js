// 4_title_master.js — dinh nghia TRON VEN cua タイトルマスタ.
//
// Cung khuon voi gas_phase_1/4_customer_master.js: bang cot o dau, quy tac o duoi.
// GAS❷ khong tinh gi tu nguon ngoai — no chep tu 2 master cua GAS❶. 素材共有日 cung
// la ban COPY tu 顧客作品マスタ (nguồn duy nhất) — GAS❷ chỉ tự đóng dấu ngày chạy khi
// dòng THẬT SỰ MỚI mà nguồn cũng trống (xem docs/decisions.md #material-shared-02).
//
// Ngoai 25 cot duoi day, sheet con co タイトルキー va AB〜AK 掲出可能媒体 la cot NGUOI
// nhap tay — engine khong dung toi vi chung khong co trong bang.

var TITLE_COLUMNS = [
  // rowKey: parseTitleMasterRows() cũng lọc dòng theo chính cột này.
  { header: 'タイトルNo', field: 'titleNo', from: 'customer', write: '上書', rowKey: true },
  { header: 'CMS ID', field: 'cmsId', from: 'customer', write: '上書' },
  { header: 'タイトルID', field: 'titleId', from: 'customer', write: '上書' },
  // Cột này tên trên sheet là 素材共有日 (đổi 2026-08-31, trước đó là マスタ追加日).
  // 顧客作品マスタ là nguồn duy nhất (GAS❶ đóng dấu ở đó) — GAS❷ COPY lại giá trị này,
  // và chỉ tự đóng dấu ngày chạy làm fallback khi dòng THẬT SỰ MỚI mà nguồn cũng
  // trống. GHI MỘT LẦN — dòng đã có ngày thì không bao giờ đụng tới, dù nguồn nói gì.
  // Xem docs/decisions.md #master-added-01 #material-shared-02
  { header: '素材共有日', field: 'materialSharedAt', from: 'stamp', write: '1回' },
  { header: 'タイトル区分', field: 'titleCategory', from: 'customer', write: '上書' },
  { header: '①広告出稿ポリシー', field: 'policy', from: 'customer', write: '上書' },
  { header: '②一般面出稿NG', field: 'general', from: 'customer', write: '上書' },
  { header: '③シーモアロゴ判定', field: 'logoJudgement', from: 'customer', write: '上書' },
  { header: '掲載停止日付', field: 'suspensionDate', from: 'customer', write: '上書', type: 'date' },
  { header: 'LP制作', field: 'lpProduction', from: 'customer', write: '上書' },
  { header: 'タイトル名', field: 'titleName', from: 'customer', write: '上書' },
  // GAS❷ KHONG doc CMS: cot nay copy nguyen van tu 顧客作品マスタ, noi GAS❶ da tinh
  // 'お尻の巻数' mot lan. Xem ruleFirstVolume trong gas_phase_1/4_customer_master.js.
  { header: '初回配信巻数', field: 'firstVolume', from: 'customer', write: '上書' },
  { header: '作家名', field: 'author', from: 'customer', write: '上書' },
  { header: 'ジャンル', field: 'genre', from: 'customer', write: '上書' },
  { header: '出版社', field: 'publisher', from: 'customer', write: '上書' },
  { header: 'レーベル名', field: 'label', from: 'customer', write: '上書' },
  { header: '出版社コピーライト', field: 'publisherCopyright', from: 'copyright', write: '上書' },
  { header: 'タイトル個別コピーライト(あれば優先使用)', field: 'individualCopyright', from: 'copyright', write: '上書' },
  { header: '先行開始日', field: 'preStart', from: 'customer', write: '上書', type: 'date' },
  { header: '先行終了日', field: 'preEnd', from: 'customer', write: '上書', type: 'date' },
  { header: '先行終了日（延長）', field: 'preEndExtended', from: 'customer', write: '上書', type: 'date' },
  { header: '先行終了日（最終確定）', field: 'preEndFinal', from: 'customer', write: '上書', type: 'date' },
  { header: '大量無料開始日', field: 'massFreeStart', from: 'customer', write: '上書', type: 'date' },
  { header: '大量無料終了日', field: 'massFreeEnd', from: 'customer', write: '上書', type: 'date' },
  { header: '出版社事前確認', field: 'preConfirmation', from: 'copyright', write: '上書', optional: true },
];

// Cột 出版社事前確認 tách riêng khỏi 2 cột copyright còn lại vì nó có thể CHƯA TỒN TẠI
// bên nguồn (xem COPYRIGHT_PRE_CONFIRMATION_HEADER trong gas2/sources.js) trong khi 2 cột
// kia luôn có. Hai tình huống, hai cờ.
var TITLE_PRE_CONFIRMATION_HEADER = '出版社事前確認';

// Thiếu 1 trong 24 cột này trên タイトルマスタ -> throw ngay ở findHeaderRowIndex().
// Cột BẮT BUỘC = mọi cột trong bảng TRỪ cột optional. Dùng requiredHeaders() của
// engine chứ không map thẳng: map thẳng làm cờ `optional` bị bỏ qua hoàn toàn, và một
// cột đánh dấu tuỳ chọn vẫn khiến cả lần chạy throw.
var TITLE_REQUIRED_HEADERS = requiredHeaders(TITLE_COLUMNS);

/**
 * Dựng 1 dòng giá trị sẵn sàng cho Range.setValues(), theo ĐÚNG vị trí cột thật.
 * @param {{
 * @returns {Array<*>} Mảng độ dài columnCount
 */
function titleRecordToRow(options) {
  var previousRow = options.previousRow;
  var row = [];
  for (var c = 0; c < options.columnCount; c++) {
    var previousValue = previousRow ? previousRow[c] : '';
    row.push(previousValue === null || previousValue === undefined ? '' : previousValue);
  }

  TITLE_COLUMNS.forEach(function (column) {
    if (column.from === 'stamp') {
      // 顧客作品マスタ là nguồn duy nhất. 3 điều kiện PHẢI cùng đúng, không cái nào
      // được nới:
      //   1. Ô đích ĐÃ có ngày -> không bao giờ đụng (write-once), dù nguồn nói gì.
      //   2. Nguồn có ngày -> copy, kể cả vào một dòng ĐÃ CÓ TỪ TRƯỚC mà ô đang trống.
      //   3. Nguồn cũng trống -> CHỈ đóng dấu runAt khi đây là dòng THẬT SỰ MỚI
      //      (previousRow === undefined). Dòng cũ + nguồn trống nghĩa là "chưa biết
      //      ngày chia sẻ" — để trống, không bịa ra ngày hôm nay trông như thật.
      // Xem docs/decisions.md #material-shared-02
      var stampIndex = col(options.headerIndex, column.header);
      if (normalizeJapaneseText(row[stampIndex]) !== '') return;
      var fromCustomer = blankIfEmpty(options.record[column.field]);
      if (normalizeJapaneseText(fromCustomer) !== '') {
        row[stampIndex] = fromCustomer;
        return;
      }
      if (options.previousRow === undefined) row[stampIndex] = options.runAt;
      return;
    }
    if (column.from === 'copyright') {
      if (!options.copyrightAvailable) return;
      if (column.header === TITLE_PRE_CONFIRMATION_HEADER && !options.preConfirmationAvailable) return;
      var value = options.copyright ? options.copyright[column.field] : '';
      row[col(options.headerIndex, column.header)] = blankIfEmpty(value);
      return;
    }
    row[col(options.headerIndex, column.header)] = blankIfEmpty(options.record[column.field]);
  });

  return row;
}

/**
 * null/undefined -> '' trước khi ghi vào sheet.
 * @param {*} value
 * @returns {*}
 */
function blankIfEmpty(value) {
  return value === null || value === undefined ? '' : value;
}

// Nhãn ô 更新日 trong khối ghi chú phía trên vùng dữ liệu, dùng chung cho cả 2 chiều:
// GAS❷ GHI vào ô này trên タイトルマスタ (stampUpdatedAt) và ĐỌC ô cùng tên trên
// 顧客作品マスタ để biết GAS❶ đã chạy xong hôm nay chưa (xem runGas2).
var UPDATED_AT_LABEL = '更新日';

/**
 * Dò ô 更新日 trong khối ghi chú phía TRÊN hàng header, trả về vị trí ô GIÁ TRỊ
 * (ô ngay bên phải nhãn).
 * @param {Array<Array<*>>} values - Toàn bộ giá trị ô của sheet
 * @param {number} headerRowIndex - Chỉ số 0-based của hàng header
 * @returns {{rowIndex: number, colIndex: number}|null} Vị trí 0-based của ô GIÁ TRỊ,
 */
function locateUpdatedAtCell(values, headerRowIndex) {
  for (var r = 0; r < headerRowIndex; r++) {
    var row = values[r];
    if (!row) continue;
    // row.length - 1: nhãn nằm ở cột cuối cùng thì không có ô nào bên phải để ghi.
    for (var c = 0; c < row.length - 1; c++) {
      if (normalizeHeaderText(row[c]) !== UPDATED_AT_LABEL) continue;
      return { rowIndex: r, colIndex: c + 1 };
    }
  }
  return null;
}

// 5 loại cảnh báo ghi vào tab GAS2警告. Đặt tên hằng thay vì rải chuỗi khắp nơi để
// tab log và test không thể lệch nhau vì một lỗi gõ.
//
var WARNING_KIND_MISSING_NO = 'タイトルNo欠落';
var WARNING_KIND_DUPLICATE_NO = 'タイトルNo重複';
var WARNING_KIND_NO_COPYRIGHT = 'コピーライト未登録';
var WARNING_KIND_ORPHAN = '孤立行';
var WARNING_KIND_CONFIG = '設定注意';

/**
 * Khoá join của toàn bộ GAS❷: chuỗi đã chuẩn hoá của タイトルNo.
 * @param {*} value
 * @returns {string}
 */
function titleNoKey(value) {
  return normalizeJapaneseText(value);
}

/**
 * Map khoá タイトルNo -> record của コピーライトマスタ.
 * @param {Array<object>} records - Kết quả parseCopyrightMasterRows().records
 * @returns {Map<string, object>}
 */
function buildCopyrightLookup(records) {
  var map = new Map();
  records.forEach(function (record) {
    var key = titleNoKey(record.titleNo);
    if (key === '' || map.has(key)) return;
    map.set(key, record);
  });
  return map;
}

/**
 * Lọc danh sách record của 顧客作品マスタ xuống còn những dòng có khoá dùng được, kèm
 * cảnh báo cho mỗi dòng bị loại.
 * @param {Array<object>} records - Kết quả parseCustomerMasterRows()
 * @param {Date} runAt
 * @returns {{records: Array<object>, warnings: Array<object>}}
 */
function indexCustomerRecords(records, runAt) {
  var kept = [];
  var warnings = [];
  var seen = new Map();
  records.forEach(function (record) {
    var key = titleNoKey(record.titleNo);
    if (key === '') {
      warnings.push(buildWarning(runAt, WARNING_KIND_MISSING_NO, record,
        'Dòng không có タイトルNo nên không lên được タイトルマスタ.'));
      return;
    }
    if (seen.has(key)) {
      warnings.push(buildWarning(runAt, WARNING_KIND_DUPLICATE_NO, record,
        'タイトルNo đã được dùng bởi「' + seen.get(key).titleName + '」— dòng này bị bỏ qua.'));
      return;
    }
    seen.set(key, record);
    kept.push(record);
  });
  return { records: kept, warnings: warnings };
}

/**
 * Dựng 1 dòng cảnh báo cho tab GAS2警告.
 * @param {Date} runAt
 * @param {string} kind - Một trong 4 hằng WARNING_KIND_*
 * @param {{titleNo: *, titleId: *, titleName: *}} record
 * @param {string} detail
 * @returns {{runAt: Date, kind: string, titleNo: *, titleId: *, titleName: *, detail: string}}
 */
function buildWarning(runAt, kind, record, detail) {
  return {
    runAt: runAt,
    kind: kind,
    titleNo: blankIfEmpty(record.titleNo),
    titleId: blankIfEmpty(record.titleId),
    titleName: blankIfEmpty(record.titleName),
    detail: detail,
  };
}

/**
 * Đọc vùng dữ liệu hiện có của タイトルマスタ: dò hàng header, trả về từng dòng kèm số
 * dòng THẬT và bản gốc của dòng.
 * @param {Array<Array<*>>} rawRows
 * @returns {{headerRowIndex: number, headerIndex: Map<string,number>, rows: Array<object>}}
 */
function parseTitleMasterRows(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, TITLE_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var rows = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (titleNoKey(row[col(idx, 'タイトルNo')]) === '') continue;
    rows.push({
      titleNo: row[col(idx, 'タイトルNo')],
      titleId: row[col(idx, 'タイトルID')],
      titleName: row[col(idx, 'タイトル名')],
      sheetRow: i + 1,
      rawRow: row,
    });
  }
  return {
    headerRowIndex: resolved.headerRowIndex,
    headerIndex: idx,
    rows: rows,
  };
}

/**
 * So toàn bộ 顧客作品マスタ với vùng dữ liệu hiện có của タイトルマスタ, ra danh sách dòng
 * cần update / cần append, cùng cảnh báo và log chi tiết.
 * @param {{
 * @returns {{toUpdate: Array<object>, toAdd: Array<object>,
 */
function diffTitleMaster(options) {
  var runAt = options.runAt;
  var indexed = indexCustomerRecords(options.customerRecords, runAt);
  var warnings = indexed.warnings.slice();
  var changeDetails = [];
  var toUpdate = [];
  var toAdd = [];

  var existingByKey = new Map();
  options.existing.forEach(function (row) {
    var key = titleNoKey(row.titleNo);
    if (key !== '' && !existingByKey.has(key)) existingByKey.set(key, row);
  });

  var claimed = new Map();

  indexed.records.forEach(function (record) {
    var key = titleNoKey(record.titleNo);
    var copyright = options.copyrightLookup.get(key) || null;

    // Chỉ cảnh báo khi ĐỌC ĐƯỢC nguồn mà vẫn không thấy khoá. Nguồn đọc không được là
    // sự cố của cả lần chạy, đã có 1 dòng log riêng — nhân nó lên 8.000 dòng cảnh báo
    // sẽ chôn vùi những cảnh báo thật.
    if (options.copyrightAvailable && !copyright) {
      warnings.push(buildWarning(runAt, WARNING_KIND_NO_COPYRIGHT, record,
        'Không tìm thấy タイトルNo này trên コピーライトマスタ — 3 cột lấy từ コピーライトマスタ để rỗng.'));
    }

    var previous = existingByKey.get(key);
    var values = titleRecordToRow({
      record: record,
      copyright: copyright,
      copyrightAvailable: options.copyrightAvailable,
      preConfirmationAvailable: options.preConfirmationAvailable,
      headerIndex: options.headerIndex,
      columnCount: options.columnCount,
      previousRow: previous ? previous.rawRow : undefined,
      runAt: runAt,
    });

    if (!previous) {
      toAdd.push({ values: values, record: record });
      return;
    }

    claimed.set(key, true);
    var changed = collectChangedColumns(previous.rawRow, values, options.headerIndex, runAt, record);
    if (changed.length === 0) return;
    changeDetails = changeDetails.concat(changed);
    toUpdate.push({ sheetRow: previous.sheetRow, values: values, record: record });
  });

  // 孤立行 — KHÔNG xoá. GAS❷ không phân biệt được "tác phẩm đã bị gỡ khỏi master" với
  // "một lần đọc nguồn ra thiếu dòng"; xoá là thao tác không hoàn tác được trên dữ liệu
  // 営業 đang dùng để chọn tác phẩm, còn cảnh báo thì người ta xoá tay được.
  options.existing.forEach(function (row) {
    var key = titleNoKey(row.titleNo);
    if (key === '' || claimed.has(key)) return;
    warnings.push(buildWarning(runAt, WARNING_KIND_ORPHAN, row,
      'Dòng này không còn タイトルNo tương ứng trên 顧客作品マスタ — GAS❷ để nguyên, cần người kiểm.'));
  });

  return {
    toUpdate: toUpdate,
    toAdd: toAdd,
    warnings: warnings,
    changeDetails: changeDetails,
  };
}

/**
 * Liệt kê những cột GAS❷ sở hữu đã thật sự đổi giá trị giữa dòng cũ và dòng vừa dựng.
 * @param {Array<*>} previousRow
 * @param {Array<*>} values
 * @param {Map<string,number>} headerIndex
 * @param {Date} runAt
 * @param {object} record
 * @returns {Array<{runAt: Date, titleNo: *, titleName: *, field: string, oldValue: *, newValue: *}>}
 */
function collectChangedColumns(previousRow, values, headerIndex, runAt, record) {
  var changes = [];
  TITLE_COLUMNS.forEach(function (column) {
    var index = col(headerIndex, column.header);
    var oldValue = previousRow[index];
    var newValue = values[index];
    // Hàm so sánh suy từ chế độ ghi của chính cột (compareFor trong engine), không
    // phải một trường `compare` khai báo riêng — hai thứ đó từng lệch nhau.
    var compare = compareFor(column);
    if (compare === null || compare(oldValue, newValue)) return;
    changes.push({
      runAt: runAt,
      titleNo: blankIfEmpty(record.titleNo),
      titleName: blankIfEmpty(record.titleName),
      field: column.header,
      oldValue: blankIfEmpty(oldValue),
      newValue: blankIfEmpty(newValue),
    });
  });
  return changes;
}

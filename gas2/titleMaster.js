// gas2/titleMaster.js — TẦNG THUẦN của GAS❷: bảng cột, dựng dòng, diff.
//
// Không có lời gọi Google API nào ở đây. Mọi quyết định "ghi gì vào ô nào, dòng nào
// đã đổi" nằm trong file này để test được bằng Node — gas2/io.js chỉ còn việc mang
// mảng đi đặt vào sheet.

/**
 * 24 cột GAS❷ sở hữu trên タイトルマスタ, theo đúng thứ tự trái→phải của ガワ.
 *
 * `header` — tên cột trên sheet, phải copy BYTE-CHÍNH-XÁC. normalizeHeaderText() chỉ bỏ
 *   khoảng trắng/xuống dòng, KHÔNG làm NFKC: '（延長）' (full-width) và '(あれば優先使用)'
 *   (half-width) khác nhau thật, cả 2 đều đã kiểm trên file thật.
 * `source` — 'customer' lấy từ 顧客作品マスタ, 'copyright' từ コピーライトマスタ,
 *   'stamp' là cột GAS❷ tự sinh (chỉ có マスタ追加日).
 * `field` — tên field trên record do gas2/sources.js trả về.
 * `compare` — 'date' thì so bằng sameDateValue() (so theo năm-tháng-ngày), 'text' thì
 *   sameValue(). KHÔNG dùng sameDateValue() cho mọi cột: nó nhận cả CHUỖI dạng ngày, nên
 *   một タイトル名 bắt đầu bằng '2025-11-30' sẽ bị đem đi so như ngày. Đánh dấu tường minh
 *   thì không có cột nào bị so nhầm kiểu.
 *
 * 12 cột CỐ TÌNH VẮNG MẶT (M タイトルキー, N 初回配信巻数, AB~AK 掲出可能媒体): chưa có
 * nguồn, xem §1 của spec. Vắng khỏi bảng này nghĩa là không bao giờ bị ghi — đó chính là
 * cơ chế bảo vệ chúng, không cần thêm danh sách "cấm ghi" nào khác.
 */
var TITLE_COLUMNS = [
  { header: 'タイトルNo', source: 'customer', field: 'titleNo', compare: 'text' },
  { header: 'CMS ID', source: 'customer', field: 'cmsId', compare: 'text' },
  { header: 'タイトルID', source: 'customer', field: 'titleId', compare: 'text' },
  { header: 'マスタ追加日', source: 'stamp', field: 'masterAddedAt', compare: 'date' },
  { header: 'タイトル区分', source: 'customer', field: 'titleCategory', compare: 'text' },
  { header: '①広告出稿ポリシー', source: 'customer', field: 'policy', compare: 'text' },
  { header: '②一般面出稿NG', source: 'customer', field: 'general', compare: 'text' },
  { header: '③シーモアロゴ判定', source: 'customer', field: 'logoJudgement', compare: 'text' },
  { header: '掲載停止日付', source: 'customer', field: 'suspensionDate', compare: 'date' },
  { header: 'LP制作', source: 'customer', field: 'lpProduction', compare: 'text' },
  { header: 'タイトル名', source: 'customer', field: 'titleName', compare: 'text' },
  { header: '作家名', source: 'customer', field: 'author', compare: 'text' },
  { header: 'ジャンル', source: 'customer', field: 'genre', compare: 'text' },
  { header: '出版社', source: 'customer', field: 'publisher', compare: 'text' },
  { header: 'レーベル名', source: 'customer', field: 'label', compare: 'text' },
  { header: '出版社コピーライト', source: 'copyright', field: 'publisherCopyright', compare: 'text' },
  { header: 'タイトル個別コピーライト(あれば優先使用)', source: 'copyright', field: 'individualCopyright', compare: 'text' },
  { header: '先行開始日', source: 'customer', field: 'preStart', compare: 'date' },
  { header: '先行終了日', source: 'customer', field: 'preEnd', compare: 'date' },
  { header: '先行終了日（延長）', source: 'customer', field: 'preEndExtended', compare: 'date' },
  { header: '先行終了日（最終確定）', source: 'customer', field: 'preEndFinal', compare: 'date' },
  { header: '大量無料開始日', source: 'customer', field: 'massFreeStart', compare: 'date' },
  { header: '大量無料終了日', source: 'customer', field: 'massFreeEnd', compare: 'date' },
  { header: '出版社事前確認', source: 'copyright', field: 'preConfirmation', compare: 'text' },
];

// Cột 出版社事前確認 tách riêng khỏi 2 cột copyright còn lại vì nó có thể CHƯA TỒN TẠI
// bên nguồn (xem COPYRIGHT_PRE_CONFIRMATION_HEADER trong gas2/sources.js) trong khi 2 cột
// kia luôn có. Hai tình huống, hai cờ.
var TITLE_PRE_CONFIRMATION_HEADER = '出版社事前確認';

// Thiếu 1 trong 24 cột này trên タイトルマスタ -> throw ngay ở findHeaderRowIndex().
var TITLE_REQUIRED_HEADERS = TITLE_COLUMNS.map(function (c) { return c.header; });

/**
 * Dựng 1 dòng giá trị sẵn sàng cho Range.setValues(), theo ĐÚNG vị trí cột thật.
 *
 * ĐIỂM QUAN TRỌNG NHẤT — dòng ghi được dựng TỪ BẢN COPY CỦA DÒNG CŨ rồi mới ghi đè các
 * cột GAS❷ sở hữu. Cách khác (`new Array(n)` rồi fill) sẽ XOÁ TRẮNG 12 cột chưa có nguồn
 * và mọi cột 池永 thêm về sau, mỗi lần dòng bị update, không có lỗi nào để nhận ra — chỉ
 * là dữ liệu người ta nhập tự nhiên biến mất sau 9h30 sáng. Đây là bài học đã trả giá
 * bên GAS❶; xem JSDoc của customerRecordToRow() trong src/io.js.
 *
 * BA CỜ, BA HÀNH VI KHÁC NHAU:
 *   previousRow === undefined  -> dòng MỚI: cột không sở hữu ra rỗng, マスタ追加日 = runAt
 *   copyrightAvailable === false -> nguồn phụ đọc không được: BỎ QUA cả 3 cột copyright,
 *                                 giữ nguyên giá trị đang có trên sheet (spec §7)
 *   preConfirmationAvailable === false -> nguồn có nhưng THIẾU cột 出版社事前確認:
 *                                 bỏ qua riêng cột AA, 2 cột copyright kia vẫn ghi
 *
 * copyright === null trong khi copyrightAvailable === true nghĩa là "đọc được nguồn nhưng
 * タイトルNo này không có bên đó" — khác hẳn: 3 cột ra RỖNG (kèm 1 cảnh báo do
 * diffTitleMaster ghi). Đó là thay đổi thật cần được phản ánh.
 *
 * マスタ追加日 là cột WRITE-ONCE: chỉ đóng dấu lúc append. Dòng đã tồn tại thì không đụng
 * tới, kể cả khi ô đang trống — nó là dữ liệu lịch sử, không phải trạng thái; ghi đè theo
 * ngày chạy sẽ biến cả cột thành "hôm nay" ngay lần chạy đầu và xoá mất thứ duy nhất cột
 * này dùng để trả lời (spec §3.1).
 *
 * @param {{
 *   record: object, copyright: object|null, copyrightAvailable: boolean,
 *   preConfirmationAvailable: boolean, headerIndex: Map<string,number>,
 *   columnCount: number, previousRow: Array<*>|undefined, runAt: Date
 * }} options
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
    if (column.source === 'stamp') {
      // Write-once: chỉ đóng dấu khi dòng được thêm mới.
      if (previousRow === undefined) row[col(options.headerIndex, column.header)] = options.runAt;
      return;
    }
    if (column.source === 'copyright') {
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
 *
 * Không phải chuyện thẩm mỹ: ghi undefined vào 1 ô rồi ĐỌC LẠI ở lần chạy sau, Sheets trả
 * về ''. So sánh 2 giá trị đó bằng === sẽ thấy khác nhau và đánh dấu dòng "đã đổi" mãi
 * mãi. normalizeForCompare() đã xử lý phía so sánh, nhưng chuẩn hoá luôn ở phía ghi thì
 * dữ liệu trên sheet cũng sạch.
 *
 * @param {*} value
 * @returns {*}
 */
function blankIfEmpty(value) {
  return value === null || value === undefined ? '' : value;
}

// 4 loại cảnh báo ghi vào tab GAS2警告. Đặt tên hằng thay vì rải chuỗi khắp nơi để
// tab log và test không thể lệch nhau vì một lỗi gõ.
var WARNING_KIND_MISSING_NO = 'タイトルNo欠落';
var WARNING_KIND_DUPLICATE_NO = 'タイトルNo重複';
var WARNING_KIND_NO_COPYRIGHT = 'コピーライト未登録';
var WARNING_KIND_ORPHAN = '孤立行';

/**
 * Khoá join của toàn bộ GAS❷: chuỗi đã chuẩn hoá của タイトルNo.
 *
 * Phải chuẩn hoá chứ không dùng thẳng giá trị ô: SpreadsheetApp trả number cho ô số còn
 * fixture JSON trả string, nên `2 === '2'` là false và mọi dòng sẽ bị coi là dòng mới.
 * normalizeJapaneseText() còn gộp luôn chữ số full-width (ô '２' do lỗi IME).
 *
 * Trả '' cho ô trống — bên gọi dùng chính điều kiện này để loại dòng thiếu khoá, thay vì
 * để khoá rỗng khớp với khoá rỗng và 2 tác phẩm khác nhau ghi đè lên cùng 1 dòng.
 *
 * @param {*} value
 * @returns {string}
 */
function titleNoKey(value) {
  return normalizeJapaneseText(value);
}

/**
 * Map khoá タイトルNo -> record của コピーライトマスタ.
 *
 * Trùng khoá thì bản ĐẦU TIÊN thắng — コピーライトマスタ do GAS❶ sinh ra với khoá là chính
 * タイトルNo nên trùng là bất thường bên đó, không phải việc GAS❷ đi sửa.
 *
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
 *
 * Hai ca, cùng một hậu quả (dòng không lên được タイトルマスタ) nhưng khác nguyên nhân nên
 * tách 2 loại cảnh báo: 欠落 là dữ liệu thiếu ở nguồn, 重複 là 2 dòng tranh nhau 1 khoá.
 * Gộp làm một thì người đọc log không biết phải đi sửa cái gì.
 *
 * KHÔNG throw ở cả 2 ca: một dòng hỏng không được phép chặn 8.000 dòng còn lại.
 *
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
 *
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
 *
 * sheetRow là số dòng 1-based dùng thẳng cho getRange() — KHÔNG tính bằng
 * headerRow + thứ tự, vì công thức đó ngầm giả định không có dòng trống xen giữa
 * (ガワ thật có), và một lần lệch nghĩa là ghi tác phẩm này đè lên dòng tác phẩm khác.
 *
 * rawRow được giữ lại để titleRecordToRow() bảo toàn 12 cột chưa có nguồn.
 *
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

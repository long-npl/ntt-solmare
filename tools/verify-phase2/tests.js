// tools/verify-phase2/tests.js — test cho gas_phase_2/.
//
// GAS❷ không tính gì từ nguồn ngoài: nó chép từ 2 master của GAS❶ và đóng dấu
// 素材共有日 cho dòng mới. Nên test ở đây tập trung vào BẢNG CỘT và đường ghi.

function test_titleColumns(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  check('25 cot (24 cu + 初回配信巻数)', src.TITLE_COLUMNS.length, 25);
  check('moi cot co du header + field + from + write',
    src.TITLE_COLUMNS.filter(function (c) {
      return !c.header || !c.field || !c.from || !c.write; }).length, 0);
  // Bỏ được trường compare là toàn bộ điểm của engine — đừng để nó bò trở lại.
  check('khong cot nao con khai bao compare',
    src.TITLE_COLUMNS.filter(function (c) { return c.compare !== undefined; }).length, 0);

  var byField = {};
  src.TITLE_COLUMNS.forEach(function (c) { byField[c.field] = c; });

  check('初回配信巻数 chep tu 顧客作品マスタ, khong tu CMS',
    [byField.firstVolume.from, byField.firstVolume.write], ['customer', '上書']);
  check('初回配信巻数 dung ngay sau タイトル名',
    src.TITLE_COLUMNS.map(function (c) { return c.field; })
      .slice(src.TITLE_COLUMNS.map(function (c) { return c.field; }).indexOf('titleName'), 12 + 1)
      .slice(0, 2), ['titleName', 'firstVolume']);

  // 素材共有日 là cột ghi MỘT LẦN: chỉ đóng dấu lúc append, dòng đã có không đụng.
  check('素材共有日 la cot 1回', byField.materialSharedAt.write, '1回');
  check('素材共有日 do GAS❷ tu sinh', byField.materialSharedAt.from, 'stamp');

  // Cột này có thể chưa tồn tại bên nguồn -> phải là optional, nếu không sheet thiếu
  // nó sẽ làm cả lần chạy throw.
  check('出版社事前確認 la cot tuy chon', byField.preConfirmation.optional, true);
  // Chi con 1 cot tuy chon: 出版社事前確認 (co the chua ton tai ben nguon).
  check('requiredHeaders bo cot tuy chon', src.requiredHeaders(src.TITLE_COLUMNS).length, 24);
  check('TITLE_REQUIRED_HEADERS ton trong optional (khong map thang)',
    src.TITLE_REQUIRED_HEADERS.length, 24);
  check('khong cot optional nao lot vao TITLE_REQUIRED_HEADERS',
    src.TITLE_COLUMNS.filter(function (c) {
      return c.optional && src.TITLE_REQUIRED_HEADERS.indexOf(c.header) >= 0; }).length, 0);

  check('dung 1 cot rowKey', src.TITLE_COLUMNS.filter(function (c) { return c.rowKey; }).length, 1);
  check('cot rowKey la タイトルNo', src.rowKeyColumn(src.TITLE_COLUMNS).header, 'タイトルNo');
  check('khong header nao trung nhau',
    new Set(src.TITLE_COLUMNS.map(function (c) { return c.header; })).size, 25);
  check('khong field nao trung nhau',
    new Set(src.TITLE_COLUMNS.map(function (c) { return c.field; })).size, 25);

  // 3 cột lấy từ コピーライトマスタ — nguồn PHỤ, đọc lỗi thì giữ nguyên.
  check('dung 3 cot tu コピーライトマスタ',
    src.TITLE_COLUMNS.filter(function (c) { return c.from === 'copyright'; })
      .map(function (c) { return c.field; }),
    ['publisherCopyright', 'individualCopyright', 'preConfirmation']);
}

function test_titleWriteModes(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var byField = {};
  src.TITLE_COLUMNS.forEach(function (c) { byField[c.field] = c; });

  // 7 cột ngày phải dùng type date, nếu không String(Date) mang cả giờ + timezone
  // và 2 spreadsheet khác timezone sẽ churn vĩnh viễn.
  check('7 cot ngay dung type date',
    src.TITLE_COLUMNS.filter(function (c) { return c.type === 'date'; })
      .map(function (c) { return c.field; }),
    ['suspensionDate', 'preStart', 'preEnd', 'preEndExtended', 'preEndFinal',
      'massFreeStart', 'massFreeEnd']);

  check('cot ngay -> compareFor tra sameDateValue (bo qua gio)',
    src.compareFor(byField.preStart)(
      new Date('2026-03-27T00:00:00+09:00'), new Date('2026-03-27T15:00:00+09:00')), true);
  check('素材共有日 -> o da co ngay thi khong bao gio doi',
    src.compareFor(byField.materialSharedAt)('2026-08-19', '2026-09-02'), true);
  check('素材共有日 -> o trong thi duoc dong dau',
    src.compareFor(byField.materialSharedAt)('', '2026-09-02'), false);
}

function test_customerSourceHeaders(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  // Danh sách này là HÌNH DẠNG của 顧客作品マスタ bên GAS❶ — thiếu một tên là GAS❷
  // đọc không ra cột đó.
  check('21 cot bat buoc tren 顧客作品マスタ', src.CUSTOMER_SOURCE_HEADERS.length, 21);
  check('co 初回配信巻数', src.CUSTOMER_SOURCE_HEADERS.indexOf('初回配信巻数') >= 0, true);
  check('khong ten nao trung', new Set(src.CUSTOMER_SOURCE_HEADERS).size, 21);
}

function test_readsFirstVolume(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var HEADER = ['', 'タイトルNo', 'CMS ID', 'タイトルID', 'タイトル区分',
    '①広告出稿ポリシー', '②一般面出稿NG', '③シーモアロゴ判定', '掲載停止日付', 'LP制作',
    'タイトル名', '初回配信巻数', '作家名', 'ジャンル', '出版社', 'レーベル名',
    '先行開始日', '先行終了日', '先行終了日（延長）', '先行終了日（最終確定）',
    '大量無料開始日', '大量無料終了日'];
  var row = ['', 1, '6761', '354296', '独占', '問題なし', '一般面OK', 'ロゴあり', '', '不要',
    'A', '4', 'tac gia', '女性', 'nxb', 'label', '', '', '', '', '', ''];
  var records = src.parseCustomerMasterRows([['ghi chu'], HEADER, row]);
  check('doc duoc 初回配信巻数 tu 顧客作品マスタ', records[0].firstVolume, '4');
  check('van doc dung cac cot cu',
    [records[0].titleNo, records[0].titleName, records[0].lpProduction], [1, 'A', '不要']);
}


// Test CHAY THAT duong ghi. Suite cu chi kiem bang cot nen khong thay titleRecordToRow
// van doc column.source sau khi truong do doi ten thanh from — bug chi lo ra luc chay
// that, ma "chay that" o day nghia la da ghi len sheet.
function test_titleRecordToRow(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var headerIndex = new Map();
  src.TITLE_COLUMNS.forEach(function (c, i) {
    headerIndex.set(src.normalizeHeaderText(c.header), i + 1);
  });
  var width = src.TITLE_COLUMNS.length + 2;
  function at(row, header) { return row[headerIndex.get(src.normalizeHeaderText(header))]; }

  var record = { titleNo: 7, titleName: 'A', firstVolume: '4', lpProduction: '必要',
    titleCategory: '独占' };
  var copyright = { publisherCopyright: '©NXB', individualCopyright: '©tac gia',
    preConfirmation: '必要' };
  var runAt = new Date(2026, 8, 2);

  // ---- dòng MỚI: 素材共有日 được đóng dấu ----
  var added = src.titleRecordToRow({
    record: record, copyright: copyright, copyrightAvailable: true,
    preConfirmationAvailable: true, headerIndex: headerIndex, columnCount: width,
    runAt: runAt, previousRow: undefined,
  });
  check('dong moi: chep duoc cot tu 顧客作品マスタ',
    [at(added, 'タイトルNo'), at(added, 'タイトル名'), at(added, 'LP制作')], [7, 'A', '必要']);
  check('dong moi: 初回配信巻数 duoc chep sang', at(added, '初回配信巻数'), '4');
  check('dong moi: 3 cot tu コピーライトマスタ',
    [at(added, '出版社コピーライト'), at(added, '出版社事前確認')], ['©NXB', '必要']);
  check('dong moi: 素材共有日 duoc dong dau', at(added, '素材共有日'), runAt);

  // ---- dòng CŨ: 素材共有日 KHÔNG bị đụng ----
  var prev = new Array(width).fill('');
  prev[headerIndex.get(src.normalizeHeaderText('素材共有日'))] = new Date(2026, 7, 19);
  prev[width - 1] = 'nguoi go tay';
  var updated = src.titleRecordToRow({
    record: record, copyright: copyright, copyrightAvailable: true,
    preConfirmationAvailable: true, headerIndex: headerIndex, columnCount: width,
    runAt: runAt, previousRow: prev,
  });
  check('dong cu: 素材共有日 giu nguyen ngay cu',
    at(updated, '素材共有日'), new Date(2026, 7, 19));
  check('dong cu: cot GAS khong so huu duoc bao toan', updated[width - 1], 'nguoi go tay');

  // ---- nguồn コピーライトマスタ lỗi: 3 cột đó phải GIỮ NGUYÊN, không bị xoá ----
  prev[headerIndex.get(src.normalizeHeaderText('出版社コピーライト'))] = '©CU';
  var kept = src.titleRecordToRow({
    record: record, copyright: null, copyrightAvailable: false,
    preConfirmationAvailable: false, headerIndex: headerIndex, columnCount: width,
    runAt: runAt, previousRow: prev,
  });
  check('nguon copyright loi: giu nguyen gia tri dang co, KHONG xoa',
    at(kept, '出版社コピーライト'), '©CU');

  // ---- cột 出版社事前確認 chưa có bên nguồn: không ghi đè ----
  var noPre = src.titleRecordToRow({
    record: record, copyright: copyright, copyrightAvailable: true,
    preConfirmationAvailable: false, headerIndex: headerIndex, columnCount: width,
    runAt: runAt, previousRow: prev,
  });
  check('出版社事前確認 chua co ben nguon -> khong ghi', at(noPre, '出版社事前確認'), '');
}

function test_materialSharedAtCopy(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var headerRow = [''].concat(src.requiredHeaders(src.TITLE_COLUMNS));
  var headerIndex = src.buildHeaderIndex(headerRow);
  var width = headerRow.length;
  function at(row, header) { return row[src.col(headerIndex, header)]; }
  function blankRow() { return new Array(width).fill(''); }

  var runAt = new Date(2026, 8, 8);
  var fromCustomer = new Date(2026, 5, 1);
  var already = new Date(2026, 0, 5);

  function build(record, previousRow) {
    return src.titleRecordToRow({
      record: record, copyright: null, copyrightAvailable: false,
      preConfirmationAvailable: false, headerIndex: headerIndex,
      columnCount: width, runAt: runAt, previousRow: previousRow,
    });
  }

  var added = build({ titleNo: 1, materialSharedAt: fromCustomer }, undefined);
  check('dong moi + nguon co ngay -> copy ngay cua 顧客作品マスタ',
    at(added, '素材共有日'), fromCustomer);

  var addedNoSource = build({ titleNo: 1, materialSharedAt: '' }, undefined);
  check('dong moi + nguon trong -> fallback dong dau ngay chay',
    at(addedNoSource, '素材共有日'), runAt);

  var prev = blankRow();
  prev[src.col(headerIndex, '素材共有日')] = already;
  var kept = build({ titleNo: 1, materialSharedAt: fromCustomer }, prev);
  check('o dich DA co ngay -> khong dung tay vao, ke ca khi nguon khac',
    at(kept, '素材共有日'), already);

  var blankTarget = build({ titleNo: 1, materialSharedAt: fromCustomer }, blankRow());
  check('o dich trong + nguon co ngay -> copy', at(blankTarget, '素材共有日'), fromCustomer);

  // Dòng ĐÃ TỒN TẠI từ trước (previousRow != undefined) + nguồn cũng trống -> KHÔNG
  // được bịa ngày hôm nay. Ô này chỉ trống vì chưa ai biết ngày chia sẻ, không phải
  // "chưa từng được đóng dấu" — bịa ra là tạo dữ liệu sai trông như thật.
  // Xem docs/decisions.md #material-shared-02
  var blankBothExisting = build({ titleNo: 1, materialSharedAt: '' }, blankRow());
  check('dong CU (da co truoc) + nguon trong -> VAN de trong, khong bia ngay',
    at(blankBothExisting, '素材共有日'), '');
  // Đối chiếu với addedNoSource ở trên (previousRow === undefined, cũng nguồn trống):
  // đó là CA DUY NHẤT còn được fallback đóng dấu runAt — hai case này phải cho ra
  // 2 kết quả KHÁC nhau, không phải trùng ngẫu nhiên.
  check('doi lap voi dong THAT SU MOI (addedNoSource) o tren',
    [at(addedNoSource, '素材共有日'), at(blankBothExisting, '素材共有日')], [runAt, '']);
}

function test_customerSourceOptionalMaterialShared(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  check('素材共有日 KHONG nam trong danh sach cot bat buoc',
    src.CUSTOMER_SOURCE_HEADERS.indexOf('素材共有日'), -1);

  var headerRow = [''].concat(src.CUSTOMER_SOURCE_HEADERS);
  var withColumn = [headerRow.concat(['素材共有日']), null];
  var shared = new Date(2026, 5, 1);
  var row = new Array(headerRow.length).fill('');
  row[headerRow.indexOf('タイトル名')] = 'A';
  row[headerRow.indexOf('タイトルNo')] = 7;
  withColumn[1] = row.concat([shared]);
  check('co cot -> doc duoc ngay',
    src.parseCustomerMasterRows(withColumn)[0].materialSharedAt, shared);

  var withoutColumn = [headerRow, row];
  check('THIEU cot -> khong throw, tra ve rong',
    src.parseCustomerMasterRows(withoutColumn)[0].materialSharedAt, '');
}

function test_identityRefreshTitleMaster(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  ['タイトルID', 'タイトル名'].forEach(function (header) {
    var column = src.TITLE_COLUMNS.filter(function (c) { return c.header === header; })[0];
    check('タイトルマスタ.' + header + ' phai la 上書', column.write, '上書');
  });

  var headerIndex = new Map();
  src.TITLE_COLUMNS.forEach(function (c, i) {
    headerIndex.set(src.normalizeHeaderText(c.header), i + 1);
  });
  var width = src.TITLE_COLUMNS.length + 2;
  function at(row, header) { return row[headerIndex.get(src.normalizeHeaderText(header))]; }

  var prev = new Array(width).fill('');
  prev[headerIndex.get(src.normalizeHeaderText('タイトルNo'))] = 7;
  prev[headerIndex.get(src.normalizeHeaderText('タイトル名'))] = 'Ten cu';
  prev[headerIndex.get(src.normalizeHeaderText('タイトルID'))] = '111';

  var row = src.titleRecordToRow({
    record: { titleNo: 7, titleName: 'Ten moi', titleId: '222' },
    copyright: null, copyrightAvailable: false, preConfirmationAvailable: false,
    headerIndex: headerIndex, columnCount: width, runAt: new Date(2026, 8, 8), previousRow: prev,
  });
  check('ten/ID doi ben 顧客作品マスタ -> タイトルマスタ ghi gia tri moi',
    [at(row, 'タイトル名'), at(row, 'タイトルID')], ['Ten moi', '222']);

  var changed = src.collectChangedColumns(prev, row, headerIndex, new Date(2026, 8, 8),
    { titleNo: 7, titleName: 'Ten moi' });
  check('2 cot dinh danh duoc ghi vao GAS2変更詳細',
    changed.filter(function (c) {
      return c.field === 'タイトル名' || c.field === 'タイトルID'; }).length, 2);
}

module.exports = {
  unit: [test_titleColumns, test_titleWriteModes, test_customerSourceHeaders,
    test_readsFirstVolume, test_titleRecordToRow,
    test_materialSharedAtCopy, test_customerSourceOptionalMaterialShared, test_identityRefreshTitleMaster],
  data: [],
};

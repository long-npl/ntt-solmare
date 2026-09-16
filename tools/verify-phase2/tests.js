// tools/verify-phase2/tests.js — test cho gas_phase_2/.
//
// GAS❷ không tính gì từ nguồn ngoài: nó chép từ 2 master của GAS❶ và đóng dấu
// 素材共有日 cho dòng mới. Nên test ở đây tập trung vào BẢNG CỘT và đường ghi.

function test_titleColumns(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  check('31 cot (25 cu + 6 cot 掲出可能媒体)', src.TITLE_COLUMNS.length, 31);
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
  check('requiredHeaders bo cot tuy chon', src.requiredHeaders(src.TITLE_COLUMNS).length, 30);
  check('TITLE_REQUIRED_HEADERS ton trong optional (khong map thang)',
    src.TITLE_REQUIRED_HEADERS.length, 30);
  check('khong cot optional nao lot vao TITLE_REQUIRED_HEADERS',
    src.TITLE_COLUMNS.filter(function (c) {
      return c.optional && src.TITLE_REQUIRED_HEADERS.indexOf(c.header) >= 0; }).length, 0);

  check('dung 1 cot rowKey', src.TITLE_COLUMNS.filter(function (c) { return c.rowKey; }).length, 1);
  check('cot rowKey la タイトルNo', src.rowKeyColumn(src.TITLE_COLUMNS).header, 'タイトルNo');
  check('khong header nao trung nhau',
    new Set(src.TITLE_COLUMNS.map(function (c) { return c.header; })).size, 31);
  check('khong field nao trung nhau',
    new Set(src.TITLE_COLUMNS.map(function (c) { return c.field; })).size, 31);

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

// ==============================================================================
// 6 cột 掲出可能媒体 — rule ガワ 2026-09-16, xem docs/3-master-cot-nguon-va-logic.md §4.13
// ==============================================================================

// Layout thật của 媒体×ADFMTマスタ: khối ghi chú ở trên, header hàng 14, dữ liệu từ 15.
var ADFMT_SHEET = [
  ['', '▮媒体×ADFMTマスタ'],
  ['', '[2]マスタエリア'],
  ['', '手動入力', '手動入力', '手動入力', '手動入力', '手動入力/選択'],
  ['', '媒体名', 'ADFMT', 'CR名記載キー', 'プレイスメント制限', '横断配信ステータス'],
  ['', 'GDN（CM）', 'GIF_672×560', 'GIF672×560', '', '⚪︎'],
  ['', 'デマジェン', '静止画_600×600', '600×600', '', '⚪︎'],
  ['', 'YDA（Y面）', '静止画_600×600', '600×600', '', '⚪︎'],
  ['', 'YDA（LINE面）', 'ここ営業が確認', 'ここ営業が確認', '', '⚪︎'],
  ['', 'Meta', '動画_1080×1920', 'M1080×1920', '', '⚪︎'],
  ['', 'Tiktok', '動画_1080×1920', 'M1080×1920', '', '⚪︎'],
  ['', 'X', '静止画_カルーセル_1080×1080', 'C1080×1080', '', '×'],
  ['', 'X', '動画_1080×1920', 'M1080×1920', '', '×'],
];

// Layout thật của 媒体除外マスタ: header hàng 14, và đúng 2 dòng dữ liệu.
var EXCLUSION_SHEET = [
  ['', '▮媒体除外マスタ'],
  ['', '[2]マスタエリア'],
  ['', '手動入力', '手動入力', '手動入力/選択'],
  ['', 'ロゴ有無', 'ジャンル', '除外媒体'],
  ['', '-', 'TL', 'YDA（LINE面）'],
  ['', 'ロゴ無し', '-', 'GDN（CM）'],
];

function test_mediaColumnTable(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  check('31 cot (25 cu + 6 cot 掲出可能媒体)', src.TITLE_COLUMNS.length, 31);

  var media = src.TITLE_COLUMNS.filter(function (c) { return c.from === 'media'; });
  check('6 cot lay tu 2 master 媒体',
    media.map(function (c) { return c.header; }),
    ['GDN(CM)', 'デマジェン', 'YDA', 'Meta', 'TikTok', 'X']);
  // 条件 chứ KHÔNG phải 上書: tính ra rỗng (chưa cấu hình / đọc lỗi / chưa phán định
  // được) phải GIỮ NGUYÊN ô người gõ, không xoá trắng 6 cột trên 8.000 dòng.
  check('6 cot deu la 条件',
    media.filter(function (c) { return c.write === '条件'; }).length, 6);
  check('条件 -> compareFor giu nguyen o khi gia tri moi rong',
    src.compareFor(media[0])('〇', ''), true);
  check('条件 -> gia tri moi khac thi ghi de',
    src.compareFor(media[0])('〇', '×'), false);

  // 4 cột 新規媒体 TRÙNG TÊN nhau -> buildHeaderIndex() chỉ thấy cột trái nhất.
  // Đưa vào bảng là ghi 4 cột vào cùng 1 ô. Xem §4.13.
  check('KHONG dua 新規媒体 vao bang cot',
    src.TITLE_COLUMNS.filter(function (c) { return c.header === '新規媒体'; }).length, 0);
  check('6 cot 媒体 khong phai optional',
    src.TITLE_REQUIRED_HEADERS.length, 30);
}

function test_mediaSourceConfig(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var adfmt = src.CONFIG.SOURCES.MEDIA_ADFMT_MASTER;
  var exclusion = src.CONFIG.SOURCES.MEDIA_EXCLUSION_MASTER;

  // ID của file ガワ — CÙNG file mà GAS❶ đọc tab 出版社別コピーライトマスタ
  // (gas_phase_1/0_config.js SOURCES.PUBLISHER_COPYRIGHT). 2 master của §4.13 là 2 TAB
  // trong đó, nên 2 entry này phải dùng ĐÚNG MỘT spreadsheetId: điền lệch nhau nghĩa là
  // tầng ① và tầng ② đang đọc 2 file khác nhau mà không có gì báo.
  check('2 master 媒体 dung cung 1 spreadsheetId (2 tab cua ガワ)',
    adfmt.spreadsheetId, exclusion.spreadsheetId);
  check('spreadsheetId cua ガワ da duoc dien',
    adfmt.spreadsheetId, '1FmW8IrpUQKDEdjsWvlLSPDvTKhWwdbEUf_HLWOgHuFM');
  check('2 ten sheet dung nhu tren ガワ',
    [adfmt.sheetName, exclusion.sheetName], ['媒体×ADFMTマスタ', '媒体除外マスタ']);
}

function test_mediaNameKey(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  // NFKC gộp được ngoặc full-width, nhưng KHÔNG gộp hoa/thường.
  check('ngoac full-width == half-width',
    src.mediaNameKey('GDN（CM）'), src.mediaNameKey('GDN(CM)'));
  check('Tiktok == TikTok', src.mediaNameKey('Tiktok'), src.mediaNameKey('TikTok'));
  check('YDA（Y面） KHAC YDA',
    src.mediaNameKey('YDA（Y面）') === src.mediaNameKey('YDA'), false);
  check('khoang trang 2 dau bi bo', src.mediaNameKey(' Meta '), src.mediaNameKey('Meta'));
}

function test_distributingMark(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  // Nguồn ghi ⚪︎ = U+26AA + U+FE0E; đích ghi 〇 = U+3007. NFKC không gộp họ ký tự này.
  check('⚪︎ (U+26AA + variation selector) la dang chay',
    src.isDistributingMark('⚪︎'), true);
  check('cac mat chu vong tron khac cung tinh',
    ['⚪', '◯', '○', '〇', '◎'].map(src.isDistributingMark),
    [true, true, true, true, true]);
  check('× khong phai dang chay', src.isDistributingMark('×'), false);
  check('o trong / gach ngang khong phai dang chay',
    [src.isDistributingMark(''), src.isDistributingMark('-')], [false, false]);
}

function test_parseMediaMasters(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var adfmt = src.parseMediaAdfmtRows(ADFMT_SHEET);
  check('doc du 8 dong media×ADFMT', adfmt.length, 8);
  check('dong dau: ten media + trang thai',
    [adfmt[0].mediaName, adfmt[0].crossStatus], ['GDN（CM）', '⚪︎']);

  var exclusion = src.parseMediaExclusionRows(EXCLUSION_SHEET);
  check('doc du 2 dong 媒体除外', exclusion.length, 2);
  check('dong TL -> loai YDA（LINE面）',
    [exclusion[0].logo, exclusion[0].genre, exclusion[0].excludedMedia],
    ['-', 'TL', 'YDA（LINE面）']);
}

function test_mediaAvailability(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var availability = src.buildMediaAvailability({
    adfmtRecords: src.parseMediaAdfmtRows(ADFMT_SHEET),
    exclusionRecords: src.parseMediaExclusionRows(EXCLUSION_SHEET),
  });

  check('X tat ca dong deu × -> khong 配信中',
    availability.active[src.mediaNameKey('X')], false);
  check('5 media con lai deu 配信中',
    ['GDN（CM）', 'デマジェン', 'YDA（Y面）', 'YDA（LINE面）', 'Meta', 'Tiktok']
      .map(function (name) { return availability.active[src.mediaNameKey(name)]; }),
    [true, true, true, true, true, true]);
  check('khong media nao lan lon trang thai', availability.mixedMedia, []);
  check('moi ten media o nguon deu khop 1 cot', availability.unknownMedia, []);
  check('2 luat loai duoc doc', availability.rules.length, 2);

  // Media có dòng lẫn lộn ⚪︎/× vẫn tính 配信中 (ít nhất 1 dòng chạy) NHƯNG phải nêu tên
  // ra: đó đúng là ca mà "ít nhất 1" và "tất cả" cho kết quả khác nhau.
  var mixedSheet = ADFMT_SHEET.concat([['', 'X', '動画_1080×1350', 'M1080×1350', '', '⚪︎']]);
  var mixed = src.buildMediaAvailability({
    adfmtRecords: src.parseMediaAdfmtRows(mixedSheet),
    exclusionRecords: [],
  });
  check('media lan lon -> van 配信中', mixed.active[src.mediaNameKey('X')], true);
  check('media lan lon -> bao ten ra', mixed.mixedMedia, ['X']);

  // Tên media không khớp cột nào (gõ sai / media mới) phải nói ra, không im lặng.
  var unknown = src.buildMediaAvailability({
    adfmtRecords: [{ mediaName: 'LINE広告', crossStatus: '⚪︎' }],
    exclusionRecords: [{ logo: '-', genre: '-', excludedMedia: 'Pinterest' }],
  });
  check('ten media la o ① -> bao ra', unknown.unknownMedia, ['LINE広告']);
  check('ten media la o ② -> bao ra', unknown.unknownExcluded, ['Pinterest']);
}

function test_mediaValuesForRecord(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var availability = src.buildMediaAvailability({
    adfmtRecords: src.parseMediaAdfmtRows(ADFMT_SHEET),
    exclusionRecords: src.parseMediaExclusionRows(EXCLUSION_SHEET),
  });
  function values(logoJudgement, genre) {
    return src.mediaValuesFor({ logoJudgement: logoJudgement, genre: genre }, availability);
  }
  var ORDER = ['mediaGdnCm', 'mediaDemagen', 'mediaYda', 'mediaMeta', 'mediaTiktok', 'mediaX'];
  function row(result) {
    return ORDER.map(function (field) { return result.values[field]; });
  }

  // ロゴあり + 少女: không luật nào khớp -> chỉ tầng ① quyết định. X là × vì ① nói ×.
  check('ロゴあり + 少女 -> 〇 het, tru X',
    row(values('ロゴあり', '少女')), ['〇', '〇', '〇', '〇', '〇', '×']);

  // ロゴなし khớp luật 2 (ロゴ無し kanji bên master) -> GDN(CM) bị loại.
  check('ロゴなし -> GDN(CM) thanh ×',
    row(values('ロゴなし', '女性')), ['×', '〇', '〇', '〇', '〇', '×']);

  // ジャンル TL khớp luật 1 -> loại YDA（LINE面）; cột YDA gộp 2 mặt theo hướng BẢO THỦ.
  check('ジャンル TL -> YDA thanh × (gop bao thu)',
    row(values('ロゴあり', 'TL')), ['〇', '〇', '×', '〇', '〇', '×']);
  check('khop TIEN TO nhu §4.5: TLコミック cung bi loai',
    row(values('ロゴあり', 'TLコミック')), ['〇', '〇', '×', '〇', '〇', '×']);
  check('ghi ra so tac pham bi × chi vi 1 mat cua YDA',
    values('ロゴあり', 'TL').ydaSingleFaceExcluded, true);
  check('女性 khong khop tien to TL', values('ロゴあり', '女性').ydaSingleFaceExcluded, false);

  // Chưa phán định ロゴ: cột do luật ロゴ chi phối phải ĐỂ TRỐNG (条件 giữ nguyên ô),
  // các cột khác vẫn phán định bình thường. Đúng nhánh 4 của LP制作 §4.5.
  var undecided = values('', '女性');
  check('ロゴ chua phan dinh -> GDN(CM) de trong, cot khac van tinh',
    row(undecided), ['', '〇', '〇', '〇', '〇', '×']);
  check('neu ten cot khong phan dinh duoc de canh bao',
    undecided.undecided, ['GDN(CM)']);
  check('未判定 cung tinh la chua phan dinh',
    row(values('未判定', '女性'))[0], '');

  // Chưa cấu hình / đọc nguồn lỗi -> availability null -> 6 cột đều rỗng.
  check('khong co availability -> 6 cot deu rong',
    row(src.mediaValuesFor({ logoJudgement: 'ロゴあり', genre: '少女' }, null)),
    ['', '', '', '', '', '']);
}

function test_titleRecordToRowMedia(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var headerRow = [''].concat(src.requiredHeaders(src.TITLE_COLUMNS)).concat(['新規媒体']);
  var headerIndex = src.buildHeaderIndex(headerRow);
  var width = headerRow.length;
  function at(row, header) { return row[src.col(headerIndex, header)]; }

  var record = { titleNo: 7, titleName: 'A', logoJudgement: 'ロゴなし', genre: 'TL' };
  var availability = src.buildMediaAvailability({
    adfmtRecords: src.parseMediaAdfmtRows(ADFMT_SHEET),
    exclusionRecords: src.parseMediaExclusionRows(EXCLUSION_SHEET),
  });

  var prev = new Array(width).fill('');
  prev[src.col(headerIndex, 'GDN(CM)')] = '〇';
  prev[src.col(headerIndex, 'X')] = '〇';
  prev[src.col(headerIndex, '新規媒体')] = '-';

  var row = src.titleRecordToRow({
    record: record, copyright: null, copyrightAvailable: false,
    preConfirmationAvailable: false, headerIndex: headerIndex, columnCount: width,
    runAt: new Date(2026, 8, 16), previousRow: prev,
    mediaValues: src.mediaValuesFor(record, availability).values,
  });
  check('ロゴなし -> GDN(CM) bi ghi de thanh ×', at(row, 'GDN(CM)'), '×');
  check('① noi × -> cot X thanh ×', at(row, 'X'), '×');
  check('TL -> YDA thanh ×', at(row, 'YDA'), '×');
  check('cot 新規媒体 nguoi go tay van con', at(row, '新規媒体'), '-');

  // Không có mediaValues (chưa cấu hình / nguồn lỗi): 6 cột giữ nguyên, KHÔNG xoá.
  var kept = src.titleRecordToRow({
    record: record, copyright: null, copyrightAvailable: false,
    preConfirmationAvailable: false, headerIndex: headerIndex, columnCount: width,
    runAt: new Date(2026, 8, 16), previousRow: prev,
  });
  check('chua cau hinh -> giu nguyen gia tri dang co',
    [at(kept, 'GDN(CM)'), at(kept, 'X')], ['〇', '〇']);

  // Dòng MỚI mà chưa cấu hình: ô trống, không bịa 〇.
  var added = src.titleRecordToRow({
    record: record, copyright: null, copyrightAvailable: false,
    preConfirmationAvailable: false, headerIndex: headerIndex, columnCount: width,
    runAt: new Date(2026, 8, 16), previousRow: undefined,
  });
  check('dong moi + chua cau hinh -> de trong, khong bia 〇', at(added, 'GDN(CM)'), '');
}

module.exports = {
  unit: [test_titleColumns, test_titleWriteModes, test_customerSourceHeaders,
    test_readsFirstVolume, test_titleRecordToRow,
    test_materialSharedAtCopy, test_customerSourceOptionalMaterialShared, test_identityRefreshTitleMaster,
    test_mediaColumnTable, test_mediaSourceConfig, test_mediaNameKey, test_distributingMark, test_parseMediaMasters,
    test_mediaAvailability, test_mediaValuesForRecord, test_titleRecordToRowMedia],
  data: [],
};

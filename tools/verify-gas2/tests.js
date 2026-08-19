// tools/verify-gas2/tests.js — toàn bộ test của tầng pure GAS❷, gom theo VẤN ĐỀ.
//
// Mỗi hàm test_* là 1 vấn đề độc lập, nhận ctx = {src, check, fixtures}:
//   src      — global object của vm context đã nạp gas2/*.js (xem run.js)
//   check    — check(label, actual, expected)
//   fixtures — fixtures.load('titleMasterGawa') đọc tools/verify-gas2/fixtures/*.json
//
// Chạy: node tools/verify-gas2/run.js [--data]

// ==============================================================================
// HARNESS — chứng minh nạp được gas2/common.js + gas2/config.js
// ==============================================================================

function test_harness(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  // Chứng minh nạp được gas2/common.js: dùng đúng 3 hàm mà cả plan này dựa vào.
  check('normalizeHeaderText bo xuong dong trong header ガワ',
    src.normalizeHeaderText('先行終了日\n（延長）'), '先行終了日（延長）');
  check('sameDateValue coi Date va chuoi cung ngay la bang nhau',
    src.sameDateValue(new Date(2025, 10, 30), '2025/11/30'), true);
  // Thứ tự tham số của sameWriteOnceValue KHÔNG đối xứng: (existing, incoming).
  check('sameWriteOnceValue: o dang co gia tri -> khong bao gio ghi de',
    src.sameWriteOnceValue(new Date(2020, 7, 19), new Date(2026, 7, 19)), true);
  check('sameWriteOnceValue: o dang trong -> co ghi',
    src.sameWriteOnceValue('', new Date(2026, 7, 19)), false);

  // Chứng minh nạp được gas2/config.js.
  check('CONFIG tro dung 3 spreadsheet',
    [configId(src, 'SOURCES', 'CUSTOMER_WORK_MASTER'),
      configId(src, 'SOURCES', 'COPYRIGHT_MASTER'),
      configId(src, 'OUTPUTS', 'TITLE_MASTER')],
    ['1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU',
      '1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc',
      '16Fw9KrvKskewy9OAWqPegYXvhOkRPywatd512Ncn4rI']);
}

function configId(src, group, name) {
  return src.CONFIG[group][name].spreadsheetId;
}

// ==============================================================================
// ĐỌC 2 MASTER NGUỒN — gas2/sources.js
// ==============================================================================

function test_sources(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  // Layout ガワ thu nhỏ: 2 hàng ghi chú, hàng header, rồi dữ liệu. Cột A là cột đệm
  // trống — đúng như sheet thật, để chứng minh không có chỗ nào giả định cột A là dữ liệu.
  var customerRows = [
    ['', '更新日', new Date(2026, 7, 19)],
    ['', '自動入力/GAS'],
    ['', 'タイトルNo', 'CMS ID', 'タイトルID', 'タイトル区分', '①広告出稿ポリシー',
      '②一般面出稿NG', '③シーモアロゴ判定', '掲載停止日付', 'LP制作', 'タイトル名',
      '作家名', 'ジャンル', '出版社', 'レーベル名', '先行開始日', '先行終了日',
      '先行終了日\n（延長）', '先行終了日\n（最終確定）', '大量無料開始日', '大量無料終了日'],
    ['', 2, 6761, 36818, 'コミット', '問題なし', '一般面OK', 'ロゴあり', '', '必要',
      '社会人のカレ。', '箕野希望', '少女', '小学館', '', new Date(2026, 2, 27),
      new Date(2026, 5, 25), '', new Date(2026, 5, 25), '', ''],
    // Dòng không có タイトル名 -> bị bỏ qua (cùng quy ước với GAS❶).
    ['', 9999, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ];

  var customers = src.parseCustomerMasterRows(customerRows);
  check('parseCustomerMasterRows bo dong khong co タイトル名', customers.length, 1);
  check('parseCustomerMasterRows doc dung 6 field dai dien',
    [customers[0].titleNo, customers[0].titleId, customers[0].titleName,
      customers[0].titleCategory, customers[0].lpProduction, customers[0].publisher],
    [2, 36818, '社会人のカレ。', 'コミット', '必要', '小学館']);
  check('parseCustomerMasterRows doc dung cot 先行終了日（最終確定）',
    src.toDateKey(customers[0].preEndFinal), '2026-6-25');

  // コピーライトマスタ CÓ cột 出版社事前確認.
  var copyrightRows = [
    ['', '更新日', new Date(2026, 7, 19)],
    ['', 'タイトルNo', 'タイトル名', 'タイトル個別コピーライト(あれば優先使用)',
      '出版社コピーライト', '出版社事前確認'],
    ['', 2, '社会人のカレ。', '', '『社会人のカレ。』©箕野希望 / 小学館', '必要'],
  ];
  var copyright = src.parseCopyrightMasterRows(copyrightRows);
  check('parseCopyrightMasterRows doc du 3 gia tri + co cot 事前確認',
    [copyright.records.length, copyright.records[0].publisherCopyright,
      copyright.records[0].preConfirmation, copyright.hasPreConfirmation],
    [1, '『社会人のカレ。』©箕野希望 / 小学館', '必要', true]);

  // コピーライトマスタ CHƯA có cột 出版社事前確認 (池永 phải thêm tay — xem
  // COPYRIGHT_PRE_CONFIRMATION_HEADER trong src/io.js của GAS❶). Không được throw.
  var noPreConfirm = [
    ['', 'タイトルNo', 'タイトル名', 'タイトル個別コピーライト(あれば優先使用)', '出版社コピーライト'],
    ['', 2, '社会人のカレ。', '', '『社会人のカレ。』©箕野希望 / 小学館'],
  ];
  var parsed = src.parseCopyrightMasterRows(noPreConfirm);
  check('thieu cot 出版社事前確認 -> khong throw, co hasPreConfirmation=false',
    [parsed.records.length, parsed.records[0].preConfirmation, parsed.hasPreConfirmation],
    [1, '', false]);
}

// ==============================================================================
// DỰNG DÒNG GHI — gas2/titleMaster.js: TITLE_COLUMNS + titleRecordToRow
// ==============================================================================

// Hàng header của タイトルマスタ đúng như file thật (【DX見本】タイトルマスタ.xlsx hàng 15):
// cột A trống, B~AK, 3 cột có '\n', 4 cột cuối trùng tên 新規媒体.
function titleHeaderRow() {
  return ['', 'タイトルNo', 'CMS ID', 'タイトルID', 'マスタ追加日', 'タイトル区分',
    '①広告出稿ポリシー', '②一般面出稿NG', '③シーモアロゴ判定', '掲載停止日付', 'LP制作',
    'タイトル名', 'タイトルキー', '初回配信\n巻数', '作家名', 'ジャンル', '出版社',
    'レーベル名', '出版社コピーライト', 'タイトル個別コピーライト(あれば優先使用)',
    '先行開始日', '先行終了日', '先行終了日\n（延長）', '先行終了日\n（最終確定）',
    '大量無料開始日', '大量無料終了日', '出版社事前確認', 'GDN(CM)', 'デマジェン', 'YDA',
    'Meta', 'TikTok', 'X', '新規媒体', '新規媒体', '新規媒体', '新規媒体'];
}

function sampleCustomer() {
  return {
    titleNo: 2, cmsId: 6761, titleId: 36818, titleCategory: 'コミット',
    policy: '問題なし', general: '一般面OK', logoJudgement: 'ロゴあり',
    suspensionDate: '', lpProduction: '必要', titleName: '社会人のカレ。',
    author: '箕野希望', genre: '少女', publisher: '小学館', label: '',
    preStart: new Date(2026, 2, 27), preEnd: new Date(2026, 5, 25),
    preEndExtended: '', preEndFinal: new Date(2026, 5, 25),
    massFreeStart: '', massFreeEnd: '',
  };
}

function sampleCopyright() {
  return {
    titleNo: 2, titleName: '社会人のカレ。', individualCopyright: '',
    publisherCopyright: '『社会人のカレ。』©箕野希望 / 小学館', preConfirmation: '必要',
  };
}

// Mảng độ dài n, mọi phần tử là chuỗi rỗng — mô phỏng một dòng trắng trên sheet.
function blankRowOfLength(n) {
  var row = [];
  for (var i = 0; i < n; i++) row.push('');
  return row;
}

function test_titleRow(ctx) {
  var src = ctx.src;
  var check = ctx.check;
  var header = titleHeaderRow();
  var headerIndex = src.buildHeaderIndex(header);
  var runAt = new Date(2026, 7, 19, 9, 30);

  function at(row, name) { return row[src.col(headerIndex, name)]; }

  // --- Dòng MỚI: 23 cột copy + E = ngày chạy, 12 cột kia rỗng.
  var added = src.titleRecordToRow({
    record: sampleCustomer(), copyright: sampleCopyright(),
    copyrightAvailable: true, preConfirmationAvailable: true,
    headerIndex: headerIndex, columnCount: header.length,
    previousRow: undefined, runAt: runAt,
  });
  check('dong moi: rong dung bang be rong sheet', added.length, header.length);
  check('dong moi: 5 cot dai dien tu 顧客作品マスタ',
    [at(added, 'タイトルNo'), at(added, 'タイトルID'), at(added, 'タイトル名'),
      at(added, 'LP制作'), at(added, 'レーベル名')],
    [2, 36818, '社会人のカレ。', '必要', '']);
  check('dong moi: 3 cot tu コピーライトマスタ',
    [at(added, '出版社コピーライト'), at(added, 'タイトル個別コピーライト(あれば優先使用)'),
      at(added, '出版社事前確認')],
    ['『社会人のカレ。』©箕野希望 / 小学館', '', '必要']);
  check('dong moi: マスタ追加日 = ngay chay',
    src.toDateKey(at(added, 'マスタ追加日')), '2026-8-19');
  check('dong moi: 12 cot khong co nguon deu rong',
    [at(added, 'タイトルキー'), at(added, '初回配信巻数'), at(added, 'GDN(CM)'),
      at(added, 'デマジェン'), at(added, 'YDA'), at(added, 'Meta'),
      at(added, 'TikTok'), at(added, 'X'), at(added, '新規媒体')],
    ['', '', '', '', '', '', '', '', '']);
  check('dong moi: cot A (dem) van rong', added[0], '');

  // --- Dòng CŨ: giữ nguyên mọi cột GAS❷ không sở hữu, kể cả cột lạ ngoài AK.
  var previous = blankRowOfLength(header.length + 1);
  previous[src.col(headerIndex, 'マスタ追加日')] = new Date(2020, 7, 19);
  previous[src.col(headerIndex, 'タイトルキー')] = 'syakare';
  previous[src.col(headerIndex, '初回配信巻数')] = 5;
  previous[src.col(headerIndex, 'GDN(CM)')] = '〇';
  previous[src.col(headerIndex, 'タイトル名')] = 'tên cũ sẽ bị ghi đè';
  previous[header.length] = 'cột 池永 thêm sau này';

  var updated = src.titleRecordToRow({
    record: sampleCustomer(), copyright: sampleCopyright(),
    copyrightAvailable: true, preConfirmationAvailable: true,
    headerIndex: headerIndex, columnCount: header.length + 1,
    previousRow: previous, runAt: runAt,
  });
  check('dong cu: マスタ追加日 GIU NGUYEN, khong bi dong dau lai',
    src.toDateKey(at(updated, 'マスタ追加日')), '2020-8-19');
  check('dong cu: 4 cot khong so huu giu nguyen',
    [at(updated, 'タイトルキー'), at(updated, '初回配信巻数'), at(updated, 'GDN(CM)'),
      updated[header.length]],
    ['syakare', 5, '〇', 'cột 池永 thêm sau này']);
  check('dong cu: cot co nguon van bi ghi de',
    at(updated, 'タイトル名'), '社会人のカレ。');

  // --- Nguồn phụ đọc không được: 3 cột copyright phải GIỮ NGUYÊN, không ghi rỗng.
  var previousWithCopyright = blankRowOfLength(header.length);
  previousWithCopyright[src.col(headerIndex, '出版社コピーライト')] = '© cũ trên sheet';
  previousWithCopyright[src.col(headerIndex, '出版社事前確認')] = '必要';
  var kept = src.titleRecordToRow({
    record: sampleCustomer(), copyright: null,
    copyrightAvailable: false, preConfirmationAvailable: false,
    headerIndex: headerIndex, columnCount: header.length,
    previousRow: previousWithCopyright, runAt: runAt,
  });
  check('copyright doc khong duoc: giu nguyen 2 cot dang co',
    [at(kept, '出版社コピーライト'), at(kept, '出版社事前確認')],
    ['© cũ trên sheet', '必要']);

  // --- Nguồn phụ đọc được nhưng タイトルNo không có bên đó: 3 cột ra RỖNG.
  var missing = src.titleRecordToRow({
    record: sampleCustomer(), copyright: null,
    copyrightAvailable: true, preConfirmationAvailable: true,
    headerIndex: headerIndex, columnCount: header.length,
    previousRow: previousWithCopyright, runAt: runAt,
  });
  check('タイトルNo khong co ben ©: 3 cot ra rong',
    [at(missing, '出版社コピーライト'), at(missing, 'タイトル個別コピーライト(あれば優先使用)'),
      at(missing, '出版社事前確認')],
    ['', '', '']);

  // --- Cột 出版社事前確認 chưa tồn tại bên nguồn: giữ nguyên AA, nhưng S/T vẫn ghi.
  var partial = src.titleRecordToRow({
    record: sampleCustomer(), copyright: sampleCopyright(),
    copyrightAvailable: true, preConfirmationAvailable: false,
    headerIndex: headerIndex, columnCount: header.length,
    previousRow: previousWithCopyright, runAt: runAt,
  });
  check('nguon chua co cot 事前確認: AA giu nguyen, S van ghi',
    [at(partial, '出版社事前確認'), at(partial, '出版社コピーライト')],
    ['必要', '『社会人のカレ。』©箕野希望 / 小学館']);

  // --- TITLE_COLUMNS phải đúng 24 và không trùng tên.
  var names = src.TITLE_COLUMNS.map(function (c) { return c.header; });
  var unique = {};
  names.forEach(function (n) { unique[n] = true; });
  check('TITLE_COLUMNS co dung 24 cot, khong trung ten',
    [names.length, Object.keys(unique).length], [24, 24]);
}

module.exports = {
  unit: [test_harness, test_sources, test_titleRow],
  data: [],
};

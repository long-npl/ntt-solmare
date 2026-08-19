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

// ==============================================================================
// KHOÁ タイトルNo — gas2/titleMaster.js: titleNoKey / indexCustomerRecords /
// buildCopyrightLookup / parseTitleMasterRows
// ==============================================================================

function test_titleKeys(ctx) {
  var src = ctx.src;
  var check = ctx.check;
  var runAt = new Date(2026, 7, 19, 9, 30);

  // Sheets trả về number cho ô số, fixture/export có thể trả string — cùng 1 khoá.
  check('titleNoKey: number va string cho ra cung khoa',
    src.titleNoKey(2) === src.titleNoKey('2'), true);
  check('titleNoKey: rong/null/khoang trang deu ra chuoi rong',
    [src.titleNoKey(''), src.titleNoKey(null), src.titleNoKey('  ')], ['', '', '']);
  check('titleNoKey: so full-width khop so half-width',
    src.titleNoKey('２') === src.titleNoKey('2'), true);

  // --- indexCustomerRecords: bỏ dòng thiếu khoá, dòng đầu thắng khi trùng.
  var records = [
    { titleNo: 2, titleId: 36818, titleName: 'A' },
    { titleNo: '', titleId: 111, titleName: 'B thiếu khoá' },
    { titleNo: 2, titleId: 222, titleName: 'C trùng khoá với A' },
    { titleNo: 8830, titleId: 332945, titleName: 'D' },
  ];
  var indexed = src.indexCustomerRecords(records, runAt);
  check('indexCustomerRecords giu 2 dong hop le, dung thu tu',
    indexed.records.map(function (r) { return r.titleName; }), ['A', 'D']);
  check('indexCustomerRecords sinh dung 2 canh bao',
    indexed.warnings.map(function (w) { return w.kind; }),
    ['タイトルNo欠落', 'タイトルNo重複']);
  check('canh bao 重複 chi ro dong nao bi bo',
    [indexed.warnings[1].titleNo, indexed.warnings[1].titleName],
    [2, 'C trùng khoá với A']);

  // --- buildCopyrightLookup
  var lookup = src.buildCopyrightLookup([
    { titleNo: 2, publisherCopyright: '©A' },
    { titleNo: '8830', publisherCopyright: '©D' },
  ]);
  check('buildCopyrightLookup tra duoc bang khoa da chuan hoa',
    [lookup.get(src.titleNoKey('2')).publisherCopyright,
      lookup.get(src.titleNoKey(8830)).publisherCopyright],
    ['©A', '©D']);

  // --- parseTitleMasterRows: dò hàng header, trả sheetRow THẬT (1-based).
  var rows = [
    ['', '▮タイトルマスタ'],
    ['', '更新日', new Date(2026, 6, 21)],
    titleHeaderRow(),
    ['', 2, 6761, 36818, new Date(2020, 7, 19), 'コミット'],
    ['', '', '', '', '', ''],
    ['', 8830, '', 332945, new Date(2025, 7, 27), '独占'],
  ];
  var parsed = src.parseTitleMasterRows(rows);
  check('parseTitleMasterRows do dung hang header (0-based)', parsed.headerRowIndex, 2);
  check('parseTitleMasterRows bo dong khong co タイトルNo, giu sheetRow that',
    parsed.rows.map(function (r) { return [r.titleNo, r.sheetRow]; }),
    [[2, 4], [8830, 6]]);
  check('parseTitleMasterRows giu rawRow de bao toan cot',
    parsed.rows[0].rawRow[src.col(parsed.headerIndex, 'タイトル区分')], 'コミット');
}

// ==============================================================================
// DIFF — gas2/titleMaster.js: diffTitleMaster
// ==============================================================================

function test_diff(ctx) {
  var src = ctx.src;
  var check = ctx.check;
  var header = titleHeaderRow();
  var headerIndex = src.buildHeaderIndex(header);
  var runAt = new Date(2026, 7, 19, 9, 30);

  function put(row, name, value) { row[src.col(headerIndex, name)] = value; return row; }

  function existingRow(rawRow) {
    return { titleNo: 2, titleName: '社会人のカレ。', titleId: 36818, sheetRow: 16, rawRow: rawRow };
  }

  function runDiff(overrides) {
    var options = {
      customerRecords: [sampleCustomer()],
      copyrightLookup: src.buildCopyrightLookup([sampleCopyright()]),
      copyrightAvailable: true,
      preConfirmationAvailable: true,
      existing: [],
      headerIndex: headerIndex,
      columnCount: header.length,
      runAt: runAt,
    };
    Object.keys(overrides || {}).forEach(function (k) { options[k] = overrides[k]; });
    return src.diffTitleMaster(options);
  }

  // --- Dòng chưa có -> toAdd.
  var added = runDiff({});
  check('dong chua co -> 1 toAdd, 0 toUpdate',
    [added.toAdd.length, added.toUpdate.length], [1, 0]);

  // --- Dòng đã có, GIỐNG HỆT -> không ghi gì. Dựng existing từ chính kết quả append,
  // rồi thay マスタ追加日 bằng ngày cũ (dòng cũ không bị đóng dấu lại).
  var sameRow = added.toAdd[0].values.slice();
  put(sameRow, 'マスタ追加日', new Date(2020, 7, 19));
  var unchanged = runDiff({ existing: [existingRow(sameRow)] });
  check('dong khong doi -> khong ghi gi, khong co changeDetail',
    [unchanged.toAdd.length, unchanged.toUpdate.length, unchanged.changeDetails.length],
    [0, 0, 0]);

  // --- Ngày cùng giá trị nhưng khác KIỂU (chuỗi vs Date) -> vẫn coi là không đổi.
  var stringDateRow = sameRow.slice();
  put(stringDateRow, '先行開始日', '2026/3/27');
  put(stringDateRow, '先行終了日', '2026/6/25');
  var dateNoise = runDiff({ existing: [existingRow(stringDateRow)] });
  check('chuoi 2026/3/27 vs Date cung ngay -> khong tinh la doi',
    dateNoise.toUpdate.length, 0);

  // --- Một cột đổi thật -> 1 toUpdate + 1 changeDetail đúng tên cột.
  var changedRow = sameRow.slice();
  put(changedRow, 'LP制作', '不要');
  var changed = runDiff({ existing: [existingRow(changedRow)] });
  check('doi 1 cot -> 1 toUpdate dung sheetRow',
    [changed.toUpdate.length, changed.toUpdate[0].sheetRow], [1, 16]);
  check('changeDetail ghi dung ten cot va 2 gia tri',
    [changed.changeDetails.length, changed.changeDetails[0].field,
      changed.changeDetails[0].oldValue, changed.changeDetails[0].newValue],
    [1, 'LP制作', '不要', '必要']);

  // --- マスタ追加日 write-once: dòng cũ có ngày khác runAt -> KHÔNG tính là đổi.
  var oldStampRow = sameRow.slice();
  put(oldStampRow, 'マスタ追加日', new Date(2019, 0, 1));
  var stamp = runDiff({ existing: [existingRow(oldStampRow)] });
  check('マスタ追加日 cu khac ngay chay -> khong bi ghi de',
    [stamp.toUpdate.length, stamp.changeDetails.length], [0, 0]);

  // --- Dòng cũ có マスタ追加日 TRỐNG -> vẫn để trống (chỉ đóng dấu lúc append).
  var emptyStampRow = sameRow.slice();
  put(emptyStampRow, 'マスタ追加日', '');
  var emptyStamp = runDiff({ existing: [existingRow(emptyStampRow)] });
  check('マスタ追加日 dang trong tren dong cu -> van de trong',
    [emptyStamp.toUpdate.length, emptyStamp.changeDetails.length], [0, 0]);

  // --- 孤立行: dòng trên タイトルマスタ không còn bên 顧客作品マスタ -> cảnh báo, KHÔNG xoá.
  var orphan = runDiff({
    existing: [
      existingRow(sameRow),
      { titleNo: 777, titleName: 'tác phẩm đã biến mất', titleId: 999, sheetRow: 17,
        rawRow: blankRowOfLength(header.length) },
    ],
  });
  check('孤立行 -> 1 canh bao, khong sinh toUpdate/toAdd nao cho no',
    [orphan.warnings.length, orphan.warnings[0].kind, orphan.warnings[0].titleNo,
      orphan.toUpdate.length, orphan.toAdd.length],
    [1, '孤立行', 777, 0, 0]);

  // --- コピーライト未登録: có bên 顧客 nhưng không có bên ©.
  var noCopyright = runDiff({ copyrightLookup: new Map() });
  check('タイトルNo khong co ben © -> canh bao コピーライト未登録',
    [noCopyright.warnings.length, noCopyright.warnings[0].kind], [1, 'コピーライト未登録']);
  check('van tao dong, chi 3 cot copyright ra rong',
    noCopyright.toAdd[0].values[src.col(headerIndex, '出版社コピーライト')], '');

  // --- Nguồn phụ đọc không được -> KHÔNG cảnh báo 未登録 cho từng dòng (nếu không thì
  // một lần mất quyền truy cập sinh ra 8.000 dòng cảnh báo vô nghĩa), và giữ nguyên cột.
  var keptRow = sameRow.slice();
  put(keptRow, '出版社コピーライト', '© cũ trên sheet');
  var unavailable = runDiff({
    copyrightAvailable: false, preConfirmationAvailable: false, copyrightLookup: new Map(),
    existing: [existingRow(keptRow)],
  });
  check('nguon © doc khong duoc -> khong canh bao tung dong, khong ghi de cot',
    [unavailable.warnings.length, unavailable.toUpdate.length], [0, 0]);
}

// ==============================================================================
// ĐỐI CHIẾU VỚI ガワ THẬT — nhóm `data`
// ==============================================================================
//
// Chạy trên fixture export từ example/*.xlsx: cần `python tools/verify/exportFixtures.py`
// trước, rồi `node tools/verify-gas2/run.js --data`.
//
// GIỚI HẠN ĐÃ BIẾT CỦA BỘ FIXTURE NÀY (kiểm 2026-08-19): cả 3 file trong example/ đều là
// ガワ (bản thiết kế) chứ không phải bản có dữ liệu thật —
//   顧客作品マスタ0803.xlsx      -> 0 record (không dòng nào có タイトル名)
//   コピーライトマスタ0804.xlsx  -> 3 record, trong đó 2 là dòng chú thích nằm dưới vùng
//                                  dữ liệu ('顧客作品マスタ', 'から引用')
//   【DX見本】タイトルマスタ.xlsx -> 2 dòng có タイトルNo
// Vì vậy nhóm này KHÔNG kiểm được số lượng. Thứ nó kiểm — và là thứ duy nhất không test
// đơn vị nào kiểm được — là 3 danh sách tên cột bắt buộc có khớp BYTE-CHÍNH-XÁC với 3
// sheet thật hay không (sai 1 ngoặc full/half-width là findHeaderRowIndex() throw ngay
// tại đây). Phép kiểm số lượng thật sự nằm ở probe_dryRunDiff() chạy trên spreadsheet thật.

function test_gawaDataset(ctx) {
  var src = ctx.src;
  var check = ctx.check;
  var runAt = new Date(2026, 7, 19, 9, 30);

  var titleRows = ctx.fixtures.load('titleMasterGawa');
  var parsed = src.parseTitleMasterRows(titleRows);
  var columnCount = titleRows[parsed.headerRowIndex].length;

  // Header ở hàng 15 của sheet = index 14. Đây là phép kiểm quan trọng nhất của nhóm này:
  // nó chứng minh 24 tên cột trong TITLE_COLUMNS khớp BYTE-CHÍNH-XÁC với sheet thật.
  check('parseTitleMasterRows do ra hang header 15 cua ガワ that',
    parsed.headerRowIndex, 14);

  // Cột A là cột đệm: タイトルNo phải nằm ở index 1, không phải 0.
  check('cot A la cot dem, タイトルNo o index 1',
    src.col(parsed.headerIndex, 'タイトルNo'), 1);
  check('12 cot khong co nguon van co mat tren sheet',
    [src.col(parsed.headerIndex, 'タイトルキー') > 0,
      src.col(parsed.headerIndex, '初回配信巻数') > 0,
      src.col(parsed.headerIndex, 'GDN(CM)') > 0],
    [true, true, true]);

  // 2 master nguồn: parse KHÔNG THROW nghĩa là CUSTOMER_REQUIRED_HEADERS và
  // COPYRIGHT_REQUIRED_HEADERS khớp với ガワ thật. Số record là 0/3 vì lý do ghi ở đầu
  // khối này — chốt cứng đúng con số đó để bộ fixture có ngày được thay bằng bản có dữ
  // liệu thì test này đỏ và người sửa biết phải xem lại giới hạn đã ghi ở trên.
  var customers = src.parseCustomerMasterRows(ctx.fixtures.load('customerMasterGawa'));
  var copyright = src.parseCopyrightMasterRows(ctx.fixtures.load('copyrightMasterGawa'));
  check('parse duoc ca 2 master nguon tu ガワ that (0 va 3 record)',
    [customers.length, copyright.records.length], [0, 3]);
  check('ガワ コピーライトマスタ chua co cot 出版社事前確認',
    copyright.hasPreConfirmation, false);

  // Diff trên LAYOUT THẬT với record tổng hợp: ガワ không có dữ liệu nên không mượn được
  // record thật, nhưng layout mới là thứ dễ sai và nó là thật ở đây.
  function diffAgainst(existing, at) {
    return src.diffTitleMaster({
      customerRecords: [sampleCustomer()],
      copyrightLookup: src.buildCopyrightLookup([sampleCopyright()]),
      copyrightAvailable: true,
      preConfirmationAvailable: true,
      existing: existing,
      headerIndex: parsed.headerIndex,
      columnCount: columnCount,
      runAt: at,
    });
  }

  // sampleCustomer() có タイトルNo = 2, TRÙNG với dòng 16 có thật trên ガワ — nên lần chạy
  // đầu ra 1 UPDATE (không phải add). Đúng thứ cần kiểm: dòng thật của 池永 có sẵn giá trị
  // ở 4 cột GAS❷ không sở hữu (マスタ追加日 2020-08-19, タイトルキー 'syakare', và cả dải
  // AB~AK đánh 〇/-), nên nó chứng minh cơ chế dựng-từ-rawRow hoạt động trên layout thật
  // chứ không chỉ trên hàng header tự dựng trong test đơn vị.
  var first = diffAgainst(parsed.rows, runAt);
  check('lan chay dau tren layout that: 1 dong duoc cap nhat, 1 dong 孤立',
    [first.toUpdate.length, first.toAdd.length], [1, 0]);
  var updatedRow = first.toUpdate[0].values;
  check('dong cap nhat co be rong dung bang hang header cua sheet that',
    updatedRow.length, columnCount);
  check('マスタ追加日 cua dong co san GIU NGUYEN 2020-08-19, khong bi dong dau lai',
    src.toDateKey(updatedRow[src.col(parsed.headerIndex, 'マスタ追加日')]), '2020-8-19');
  check('4 cot khong so huu tren dong that deu giu nguyen',
    [updatedRow[src.col(parsed.headerIndex, 'タイトルキー')],
      updatedRow[src.col(parsed.headerIndex, 'GDN(CM)')],
      updatedRow[src.col(parsed.headerIndex, 'Meta')],
      updatedRow[src.col(parsed.headerIndex, '新規媒体')]],
    ['syakare', '〇', '〇', '-']);
  check('cot co nguon van duoc ghi (CMS ID tu rong -> 6761)',
    updatedRow[src.col(parsed.headerIndex, 'CMS ID')], 6761);

  // Chạy diff LẦN THỨ HAI trên chính kết quả lần đầu, với NGÀY CHẠY KHÁC -> không được
  // sinh thay đổi nào. Đây là phép kiểm churn: nó bắt đúng class lỗi "mỗi lần chạy đều
  // thấy đã đổi", và đồng thời chứng minh マスタ追加日 không bị đóng dấu lại.
  var settled = parsed.rows.map(function (row) {
    if (src.titleNoKey(row.titleNo) !== src.titleNoKey(2)) return row;
    return {
      titleNo: row.titleNo, titleId: row.titleId, titleName: row.titleName,
      sheetRow: row.sheetRow, rawRow: updatedRow,
    };
  });
  var second = diffAgainst(settled, new Date(2026, 7, 20, 9, 30));
  check('chay lan 2 (ngay khac) -> khong dong nao doi, khong churn',
    [second.toUpdate.length, second.toAdd.length, second.changeDetails.length],
    [0, 0, 0]);
}

module.exports = {
  unit: [test_harness, test_sources, test_titleRow, test_titleKeys, test_diff],
  data: [test_gawaDataset],
};

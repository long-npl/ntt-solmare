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

module.exports = {
  unit: [test_harness, test_sources],
  data: [],
};

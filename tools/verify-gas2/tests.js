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

module.exports = {
  unit: [test_harness],
  data: [],
};

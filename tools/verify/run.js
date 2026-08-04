// tools/verify/run.js — chạy toàn bộ test của tầng pure trong src/.
//
//   node tools/verify/run.js           chỉ test đơn vị (nhanh, không cần dữ liệu thật)
//   node tools/verify/run.js --data    chạy thêm test đối chiếu số liệu spec §12
//                                      (cần chạy python tools/verify/exportFixtures.py trước)
//
// File này gộp cả 3 việc — nạp src/, so sánh giá trị, chạy test — vì cả 3 chỉ
// phục vụ đúng một câu hỏi: "logic nghiệp vụ có còn đúng không". Test thật nằm ở
// tools/verify/tests.js.
//
// VÌ SAO NẠP src/ QUA vm CHỨ KHÔNG require: các file trong src/ không có
// module.exports (Apps Script share 1 global scope cho mọi file). Chạy chúng
// trong 1 vm context rồi đọc property của global object là cách nạp nguyên vẹn,
// không phải sửa src/ chỉ để test được.
//
// CHỈ nạp các file PURE. src/io.js và src/main.js dùng SpreadsheetApp/DriveApp
// nên cố tình không nạp — 2 file đó kiểm chứng bằng hàm probe_* chạy tay trong
// Apps Script editor.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PURE_FILES = ['src/common.js', 'src/sources.js', 'src/master.js', 'src/copyright.js'];

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// ---------------------------------------------------------------- nạp src/
const sandbox = { console: console };
vm.createContext(sandbox);
PURE_FILES.forEach(function (rel) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
});

// ---------------------------------------------------------------- so sánh
let passes = 0;
const failures = [];

/**
 * So sánh actual với expected bằng JSON.stringify.
 *
 * Đủ cho mảng/object phẳng mà harness này dùng, nhưng KHÔNG so được Map/Set —
 * chuyển sang Array trước khi truyền vào (vd Array.from(map.keys())).
 */
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passes += 1;
    return;
  }
  failures.push(label + '\n    expected: ' + e + '\n    actual  : ' + a);
}

// ---------------------------------------------------------------- chạy
const fixtures = {
  dir: FIXTURES_DIR,
  /** Đọc 1 fixture đã export (mảng 2 chiều, ô trống = '', ngày = ISO string). */
  load: function (name) {
    return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name + '.json'), 'utf8'));
  },
};

const suites = require('./tests');
const withData = process.argv.indexOf('--data') !== -1;
const ctx = { src: sandbox, check: check, fixtures: fixtures };

suites.unit.forEach(function (testFn) {
  console.log('RUN   ' + testFn.name);
  testFn(ctx);
});

suites.data.forEach(function (testFn) {
  if (!withData) {
    console.log('SKIP  ' + testFn.name + ' (chạy lại với --data để đối chiếu số liệu spec §12)');
    return;
  }
  if (!fs.existsSync(FIXTURES_DIR)) {
    console.log('SKIP  ' + testFn.name + ' (chưa có fixtures — chạy: python tools/verify/exportFixtures.py)');
    return;
  }
  console.log('RUN   ' + testFn.name);
  testFn(ctx);
});

failures.forEach(function (f) { console.log('FAIL  ' + f); });
console.log('');
console.log(passes + ' passed, ' + failures.length + ' failed');
process.exit(failures.length === 0 ? 0 : 1);

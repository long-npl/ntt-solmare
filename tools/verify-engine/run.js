// tools/verify-engine/run.js — chạy test cho shared/engine.js.
//
// Bản rút gọn của tools/verify/run.js: engine là tầng thuần và không đọc fixtures
// nào, nên bỏ phần revive ô ngày và phần nhóm test `data`.
//
// KHÔNG nạp bản chép trong gas_phase_*/: nạp thẳng shared/ để một lần quên chạy
// sync-shared không làm test đo nhầm file. Việc bản chép có khớp hay không là việc
// của tools/verify-layout/run.js.
//
// Chạy: node tools/verify-engine/run.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PURE_FILES = ['shared/common.js', 'shared/engine.js'];

const ROOT = path.resolve(__dirname, '..', '..');

const sandbox = { console: console, Logger: { log: function () {} } };
vm.createContext(sandbox);
PURE_FILES.forEach(function (rel) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
});

let passes = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passes += 1;
    return;
  }
  failures.push(label + '\n    expected: ' + e + '\n    actual  : ' + a);
}

const suites = require('./tests');
const ctx = { src: sandbox, check: check };

suites.unit.forEach(function (testFn) {
  console.log('RUN   ' + testFn.name);
  testFn(ctx);
});

failures.forEach(function (f) { console.log('FAIL  ' + f); });
console.log('');
console.log(passes + ' passed, ' + failures.length + ' failed');
process.exit(failures.length === 0 ? 0 : 1);

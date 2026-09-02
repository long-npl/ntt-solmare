// tools/verify-phase2/run.js — chạy test cho tầng nghiệp vụ của gas_phase_2/.
//
// Bản chép của tools/verify/run.js với PURE_FILES và TESTS_FILE khác. Dùng chung
// fixtures với suite cũ (tools/verify/fixtures) — cùng dữ liệu thật, để 2 bản so
// được với nhau ở tools/parity.
//
// 1_common.js / 2_sheet.js / 8_engine.js nạp thẳng từ shared/ chứ không từ bản chép:
// một lần quên chạy sync-shared không được làm suite này đo nhầm file. Việc bản chép
// có khớp hay không là việc của tools/verify-layout/run.js.
//
// Chạy: node tools/verify-phase2/run.js [--data]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PURE_FILES = [
  'shared/common.js',
  'shared/engine.js',
  'shared/sheet.js',
  'gas_phase_2/0_config.js',
  'gas_phase_2/3_sources.js',
  'gas_phase_2/4_title_master.js',




];

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_DIR = path.join(ROOT, 'tools', 'verify', 'fixtures');

// shared/ đã được chép sang 2 project mới chưa? Test xanh trên một cây nguồn đã lệch
// còn tệ hơn không có test.
const syncCheck = require('child_process').spawnSync(
  process.execPath, [path.join(ROOT, 'tools', 'sync-shared.js'), '--check'],
  { encoding: 'utf8' });
if (syncCheck.status !== 0) {
  process.stdout.write(syncCheck.stdout || '');
  process.stderr.write(syncCheck.stderr || '');
  process.exit(1);
}

// Logger là API Apps Script; stub để tầng nghiệp vụ gọi được trong Node.
const sandbox = { console: console, Logger: { log: function () {} } };
vm.createContext(sandbox);
PURE_FILES.forEach(function (rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return; // file chưa được viết ở task này
  vm.runInContext(fs.readFileSync(abs, 'utf8'), sandbox, { filename: rel });
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

// Ô ngày trong fixtures là chuỗi ISO có phần giờ; phải dựng lại thành Date thật vì
// SpreadsheetApp.getValues() trả Date, và toDateOrNull() chỉ nhận Date hoặc chuỗi
// TOÀN BỘ là ngày. Để nguyên chuỗi thì mọi cột ngày im lặng thành rỗng.
const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;

function reviveCell(value) {
  if (typeof value !== 'string') return value;
  const m = ISO_DATETIME.exec(value);
  if (!m) return value;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6]));
}

const fixtures = {
  dir: FIXTURES_DIR,
  load: function (name) {
    const rows = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name + '.json'), 'utf8'));
    return rows.map(function (row) { return row.map(reviveCell); });
  },
};

const suites = require('./tests');
const withData = process.argv.indexOf('--data') !== -1;
const ctx = { src: sandbox, check: check, fixtures: fixtures };

suites.unit.forEach(function (testFn) {
  console.log('RUN   ' + testFn.name);
  testFn(ctx);
});

(suites.data || []).forEach(function (testFn) {
  if (!withData) {
    console.log('SKIP  ' + testFn.name + ' (chạy lại với --data để đối chiếu dữ liệu thật)');
    return;
  }
  if (!fs.existsSync(FIXTURES_DIR)) {
    console.log('SKIP  ' + testFn.name + ' (chưa có fixtures)');
    return;
  }
  console.log('RUN   ' + testFn.name);
  testFn(ctx);
});

failures.forEach(function (f) { console.log('FAIL  ' + f); });
console.log('');
console.log(passes + ' passed, ' + failures.length + ' failed');
process.exit(failures.length === 0 ? 0 : 1);

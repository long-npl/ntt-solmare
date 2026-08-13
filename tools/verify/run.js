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
// src/io.js CÓ trong danh sách dù nó dùng SpreadsheetApp/DriveApp: mọi lời gọi API đó
// nằm TRONG thân hàm, còn tầng ngoài chỉ có khai báo — nạp file không chạm tới API nào.
// Nhờ vậy test được các hàm THUẦN VỊ TRÍ của nó (stampUpdatedAt dò ô 更新日) trên đúng
// layout ガワ thật, bằng một sheet giả chỉ cần có getRange().setValue().
//
// RANH GIỚI VẪN GIỮ: KHÔNG test nào được gọi hàm thật sự đọc/ghi sheet
// (readCustomerWorkMaster, writeCopyrightMaster, findLatestSuspensionFile...) — chúng
// ném ReferenceError vì SpreadsheetApp không tồn tại ở đây, và đó là hành vi đúng.
// src/main.js vẫn KHÔNG nạp: nó là tầng dàn dựng, kiểm bằng hàm probe_* chạy tay
// trong Apps Script editor.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PURE_FILES = ['src/common.js', 'src/config.js', 'src/sources.js', 'src/master.js',
  'src/copyright.js', 'src/io.js'];

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

// Ô ngày do exportFixtures.py ghi ra dưới dạng ISO CÓ PHẦN GIỜ ('2022-04-10T00:00:00')
// — JSON không có kiểu Date nên buộc phải vậy.
//
// PHẢI DỰNG LẠI THÀNH Date TRƯỚC KHI ĐƯA VÀO src/: SpreadsheetApp.getValues() trả về
// Date object cho ô định dạng ngày, còn toDateOrNull() (common.js) chỉ nhận Date thật
// hoặc chuỗi mà TOÀN BỘ là ngày — chuỗi có 'T00:00:00' trượt regex và bị coi là "không
// phải 期日". Để nguyên chuỗi thì harness không mô phỏng GAS mà mô phỏng một thế giới
// nơi mọi cột ngày đều rỗng: nguồn 独占期間の延長 ra 1/532 dòng có ngày thay vì 531, và
// nguồn 大量無料 ra 0/372 — cả hai đều KHÔNG có test nào đỏ, chỉ là những con số 0 im
// lặng. Đó chính là cách lỗi này sống sót từ 2026-08-07 tới 2026-08-13.
//
// Chỉ dựng lại dạng CÓ 'T': đó là dạng duy nhất openpyxl sinh ra cho ô ngày thật. Chuỗi
// 'YYYY-MM-DD' trần được để nguyên vì nó là ô CHỮ trên sheet, và toDateOrNull() vốn
// nhận dạng đó rồi nên kết quả không đổi.
//
// Date được tạo ở realm của run.js chứ không phải trong vm context — đó chính là lý do
// toDateOrNull()/toDateKey() kiểm bằng Object.prototype.toString thay vì instanceof.
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
  /**
   * Đọc 1 fixture đã export: mảng 2 chiều, ô trống = '', ô ngày = Date object
   * (đúng như SpreadsheetApp.getValues() trả về).
   */
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

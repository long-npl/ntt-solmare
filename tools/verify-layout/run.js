// tools/verify-layout/run.js — kiểm các bất biến về BỐ CỤC, không kiểm logic.
//
// Bất biến quan trọng nhất: .clasp.json ở gốc có rootDir "" và skipSubdirectories
// false, nên nó đẩy MỌI thư mục con không bị ignore lên project GAS❶ đang chạy
// production. Hai thư mục mới phải bị chặn, nếu không lần push kế tiếp sẽ trùng
// ~29 tên hàm và trùng cả `var CONFIG`.
//
// Chạy: node tools/verify-layout/run.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let failed = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failed += 1;
    console.log('FAIL  ' + label);
    console.log('    expected: ' + JSON.stringify(expected));
    console.log('    actual  : ' + JSON.stringify(actual));
  }
}

const rootIgnore = fs.readFileSync(path.join(ROOT, '.claspignore'), 'utf8');
check('.claspignore goc chan gas_phase_1', rootIgnore.indexOf('gas_phase_1/**') >= 0, true);
check('.claspignore goc chan gas_phase_2', rootIgnore.indexOf('gas_phase_2/**') >= 0, true);

['gas_phase_1', 'gas_phase_2'].forEach(function (dir) {
  ['.clasp.json', '.claspignore', 'appsscript.json', '0_config.js'].forEach(function (f) {
    check(dir + '/' + f + ' ton tai', fs.existsSync(path.join(ROOT, dir, f)), true);
  });
});

// read() thay cho readFileSync trực tiếp: file thiếu phải thành 1 dòng FAIL đọc được,
// không phải một stack trace nuốt mất mọi check còn lại.
function read(rel) {
  const full = path.join(ROOT, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}
function scriptIdOf(rel) {
  const raw = read(rel);
  if (raw === null) return '(thieu file ' + rel + ')';
  try { return JSON.parse(raw).scriptId; } catch (e) { return '(JSON hong: ' + rel + ')'; }
}

const id1 = scriptIdOf('gas_phase_1/.clasp.json');
const id2 = scriptIdOf('gas_phase_2/.clasp.json');
check('gas_phase_1 scriptId', id1, '1_A7ZqJ8wrois90nP0ujfhdEJnmaV4qwLJUbHJdOo5lwugBYNlHzkBmNE');
check('gas_phase_2 scriptId', id2, '1b_WPDe0I8o4ojmKT94YxfLmPhyYJYBo-gcfr2MkudDN_oMashbNGBHyY');
check('2 scriptId khac nhau', id1 !== id2, true);

// 2 project mới cũng không được đẩy lên nhau.
check('gas_phase_1/.claspignore chan gas_phase_2',
  (read('gas_phase_1/.claspignore') || '').indexOf('gas_phase_2/**') >= 0, true);
check('gas_phase_2/.claspignore chan gas_phase_1',
  (read('gas_phase_2/.claspignore') || '').indexOf('gas_phase_1/**') >= 0, true);

// shared/ phải được chép sang cả 2 project mới, và bản chép phải khớp bản gốc.
// Bản chép trôi khỏi bản gốc là loại lệch không ai nhìn thấy — xem tools/sync-shared.js.
['common.js', 'masterHeaders.js', 'sheet.js', 'engine.js'].forEach(function (f) {
  check('shared/' + f + ' ton tai', fs.existsSync(path.join(ROOT, 'shared', f)), true);
});

const COPIES = [
  ['shared/common.js', 'gas_phase_1/1_common.js'],
  ['shared/common.js', 'gas_phase_2/1_common.js'],
  ['shared/sheet.js', 'gas_phase_1/2_sheet.js'],
  ['shared/sheet.js', 'gas_phase_2/2_sheet.js'],
  ['shared/engine.js', 'gas_phase_1/8_engine.js'],
  ['shared/engine.js', 'gas_phase_2/8_engine.js'],
];
// Bản chép = banner + nội dung gốc, nên so bằng "kết thúc bằng", không phải "bằng".
// Bỏ \r vì repo checkout trên Windows với core.autocrlf — giống cách sync-shared so.
COPIES.forEach(function (pair) {
  const a = read(pair[0]);
  const b = read(pair[1]);
  if (a === null || b === null) {
    check(pair[1] + ' la ban chep cua ' + pair[0], 'thieu file', 'khop');
    return;
  }
  const strip = function (s) { return s.replace(/\r/g, ''); };
  check(pair[1] + ' la ban chep cua ' + pair[0],
    strip(b).endsWith(strip(a)), true);
});

console.log(failed === 0 ? 'layout OK' : failed + ' failed');
process.exit(failed === 0 ? 0 : 1);

// tools/verify-merged/run.js — nạp mỗi project GAS đúng kiểu Apps Script: NỐI hết file
// thành MỘT script rồi chạy một lần.
//
// VÌ SAO CẦN RIÊNG SUITE NÀY: 2 harness kia nạp từng file bằng vm.runInContext() theo thứ
// tự chúng tự chọn, nên chúng KHÔNG mô phỏng được 2 điều của Apps Script:
//   1. Mọi file dùng CHUNG một global scope -> 2 file khai báo cùng một tên thì file nạp
//      sau đè file trước, im lặng. (Đang có thật: UPDATED_AT_LABEL ở 2_sheet.js và
//      4_title_master.js — cùng giá trị '更新日' nên vô hại HÔM NAY.)
//   2. Function được hoisted toàn cục, nhưng `var` top-level khởi tạo THEO THỨ TỰ FILE.
//      Nhờ (1) mà `var TITLE_REQUIRED_HEADERS = requiredHeaders(TITLE_COLUMNS)` ở
//      4_title_master.js gọi được hàm của 8_engine.js (nạp sau) — còn đọc một `var` của
//      file nạp sau thì ra undefined. Harness kia nạp shared/engine.js TRƯỚC nên không
//      bao giờ phát hiện được nếu quan hệ đó bị phá.
//
// Chạy: node tools/verify-merged/run.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const PROJECTS = ['gas_phase_1', 'gas_phase_2'];

// Chỉ khai báo, không có lời gọi API nào ở tầng ngoài — nạp file không được chạm tới
// Google API. Stub nào bị gọi lúc nạp là một lỗi thật, nên chúng throw.
function makeSandbox() {
  function forbidden(name) {
    return function () { throw new Error(name + ' bị gọi lúc NẠP file — tầng ngoài phải không có lời gọi API'); };
  }
  return {
    console: console,
    Logger: { log: function () {} },
    SpreadsheetApp: { openById: forbidden('SpreadsheetApp.openById'), getActiveSpreadsheet: forbidden('SpreadsheetApp.getActiveSpreadsheet') },
    DriveApp: { getFolderById: forbidden('DriveApp.getFolderById') },
    UrlFetchApp: { fetch: forbidden('UrlFetchApp.fetch') },
    ScriptApp: { getProjectTriggers: forbidden('ScriptApp.getProjectTriggers') },
    PropertiesService: { getScriptProperties: forbidden('PropertiesService.getScriptProperties') },
    Utilities: {},
  };
}

let failures = [];

PROJECTS.forEach(function (project) {
  const dir = path.join(ROOT, project);
  if (!fs.existsSync(dir)) return;
  // Apps Script nạp theo thứ tự file trong project; tiền tố số của repo này tồn tại
  // chính để thứ tự đó là thứ tự sắp xếp tên.
  const files = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.js'); }).sort();
  const merged = files.map(function (f) {
    return '\n//#### ' + f + '\n' + fs.readFileSync(path.join(dir, f), 'utf8');
  }).join('\n');

  const sandbox = makeSandbox();
  vm.createContext(sandbox);
  try {
    vm.runInContext(merged, sandbox, { filename: project + ' (merged)' });
    console.log('OK    ' + project + ' — nạp gộp ' + files.length + ' file: ' + files.join(' '));
  } catch (error) {
    failures.push(project + ' nạp gộp THẤT BẠI: ' + String(error));
    return;
  }

  // Tên trùng giữa các file: chỉ báo, không làm đỏ — đang có 1 ca vô hại từ trước
  // (UPDATED_AT_LABEL). Đỏ cả suite vì nó sẽ khiến người ta tắt suite này đi.
  const owners = new Map();
  files.forEach(function (f) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const names = [];
    (src.match(/^var\s+[A-Za-z_$][\w$]*/gm) || []).forEach(function (m) { names.push(m.replace(/^var\s+/, '')); });
    (src.match(/^function\s+[A-Za-z_$][\w$]*/gm) || []).forEach(function (m) { names.push(m.replace(/^function\s+/, '')); });
    names.forEach(function (name) {
      if (!owners.has(name)) owners.set(name, []);
      owners.get(name).push(f);
    });
  });
  owners.forEach(function (where, name) {
    if (where.length < 2) return;
    console.log('  CẢNH BÁO tên khai báo ở ' + where.length + ' file: ' + name
      + ' (' + where.join(', ') + ') — file nạp sau thắng');
  });
});

failures.forEach(function (f) { console.log('FAIL  ' + f); });
console.log('');
console.log(failures.length === 0 ? 'merged OK' : failures.length + ' project nạp gộp thất bại');
process.exit(failures.length === 0 ? 0 : 1);

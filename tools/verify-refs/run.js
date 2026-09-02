// tools/verify-refs/run.js — bắt hàm ĐƯỢC GỌI nhưng KHÔNG TỒN TẠI trong một project.
//
// VÌ SAO CẦN: Apps Script chia chung một global scope và không có bước biên dịch nào
// kiểm tra tên. Một hàm bị bỏ quên khi tách file chỉ lộ ra lúc CHẠY THẬT, và với GAS❶
// thì "chạy thật" nghĩa là đã ghi lên sheet production. Đúng chuyện vừa xảy ra:
// gas_phase_2/9_main.js còn gọi readCustomerMaster() sau khi engine thay thế nó, và
// suite test không thấy vì nó chỉ kiểm bảng cột.
//
// CÁCH LÀM: bỏ comment + chuỗi, tìm mọi `tên(` không đứng sau dấu chấm, rồi trừ đi
// những tên ĐÃ ĐỊNH NGHĨA (hàm, biến, tham số, biến bắt lỗi) và danh sách API có sẵn.
// Là heuristic, không phải parser — nhưng nó bắt đúng loại lỗi mà không bước nào khác
// trong repo này bắt được.
//
// Chạy: node tools/verify-refs/run.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const PROJECTS = [
  { name: 'gas_phase_1', dir: 'gas_phase_1' },
  { name: 'gas_phase_2', dir: 'gas_phase_2' },
];

// API của môi trường Apps Script + JS. Không phải hàm của repo nên không cần định nghĩa.
const AMBIENT = new Set([
  'SpreadsheetApp', 'DriveApp', 'UrlFetchApp', 'PropertiesService', 'ScriptApp',
  'Logger', 'Utilities', 'Session', 'MailApp', 'HtmlService', 'CacheService',
  'LockService', 'console',
  'String', 'Number', 'Boolean', 'Date', 'Array', 'Object', 'Map', 'Set', 'RegExp',
  'JSON', 'Math', 'Error', 'TypeError', 'Promise', 'Symbol',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI',
]);

// Từ khoá đứng trước `(` nhưng không phải lời gọi hàm.
const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new',
  'delete', 'void', 'in', 'of', 'do', 'else', 'throw', 'case', 'with', 'instanceof',
]);

/** Bỏ mọi comment và nội dung chuỗi, giữ nguyên độ dài cấu trúc còn lại. */
function stripCommentsAndStrings(src) {
  let out = '';
  let i = 0;
  let inBlock = false;
  let inLine = false;
  let inStr = null;
  const BACKSLASH = String.fromCharCode(92);
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (inBlock) {
      if (c === '*' && n === '/') { inBlock = false; i += 2; continue; }
      i += 1; continue;
    }
    if (inLine) {
      if (c === '\n') { inLine = false; out += c; }
      i += 1; continue;
    }
    if (inStr) {
      if (c === BACKSLASH) { i += 2; continue; }
      if (c === inStr) { inStr = null; out += '""'; }
      i += 1; continue;
    }
    if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && n === '/') { inLine = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; i += 1; continue; }
    out += c; i += 1;
  }
  return out;
}

const DEF_FUNCTION = /function\s+([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g;
const DEF_VAR = /\bvar\s+([A-Za-z_$][\w$]*)/g;
const DEF_CATCH = /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g;
const CALL = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;

function analyse(project) {
  const dir = path.join(ROOT, project.dir);
  const files = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.js'); }).sort();

  const defined = new Set();
  const sources = {};

  files.forEach(function (f) {
    const clean = stripCommentsAndStrings(fs.readFileSync(path.join(dir, f), 'utf8'));
    sources[f] = clean;
    let m;
    DEF_FUNCTION.lastIndex = 0;
    while ((m = DEF_FUNCTION.exec(clean)) !== null) {
      if (m[1]) defined.add(m[1]);
      m[2].split(',').forEach(function (p) {
        const name = p.trim();
        if (name) defined.add(name);
      });
    }
    DEF_VAR.lastIndex = 0;
    while ((m = DEF_VAR.exec(clean)) !== null) defined.add(m[1]);
    DEF_CATCH.lastIndex = 0;
    while ((m = DEF_CATCH.exec(clean)) !== null) defined.add(m[1]);
  });

  const missing = [];
  files.forEach(function (f) {
    const lines = sources[f].split('\n');
    lines.forEach(function (line, idx) {
      let m;
      CALL.lastIndex = 0;
      while ((m = CALL.exec(line)) !== null) {
        const name = m[2];
        if (KEYWORDS.has(name) || AMBIENT.has(name) || defined.has(name)) continue;
        missing.push({ file: f, line: idx + 1, name: name, text: line.trim().slice(0, 80) });
      }
    });
  });
  return missing;
}

// Thuộc tính của bảng cột ĐÃ BỊ BỎ khi chuyển sang engine. Đọc chúng không throw —
// chỉ ra `undefined` và im lặng làm sai, đúng kiểu lỗi vừa xảy ra ở titleRecordToRow
// (column.source sau khi trường đó đổi tên thành from).
const REMOVED_PROPS = [
  { prop: 'source', instead: 'from' },
  { prop: 'compare', instead: 'compareFor(column) — write đã quyết định' },
];

function analyseProps(project) {
  const dir = path.join(ROOT, project.dir);
  const found = [];
  fs.readdirSync(dir).filter(function (f) { return f.endsWith('.js'); }).sort()
    .forEach(function (f) {
      const clean = stripCommentsAndStrings(fs.readFileSync(path.join(dir, f), 'utf8'));
      clean.split('\n').forEach(function (line, idx) {
        REMOVED_PROPS.forEach(function (r) {
          // Chỉ bắt khi truy cập trên biến tên `column`/`c`/`col` — tránh báo nhầm
          // những `.source` của object khác.
          const re = new RegExp('\\b(column|c|col)\\.' + r.prop + '\\b');
          if (re.test(line)) {
            found.push({ file: f, line: idx + 1, prop: r.prop, instead: r.instead,
              text: line.trim().slice(0, 80) });
          }
        });
      });
    });
  return found;
}

let failed = 0;
PROJECTS.forEach(function (project) {
  const staleProps = analyseProps(project);
  if (staleProps.length > 0) {
    failed += staleProps.length;
    console.log('FAIL  ' + project.name + ' — ' + staleProps.length
      + ' cho doc thuoc tinh bang cot DA BI BO:');
    staleProps.forEach(function (x) {
      console.log('        ' + x.file + ':' + x.line + '  .' + x.prop + ' -> dung ' + x.instead);
      console.log('            ' + x.text);
    });
  }
  const missing = analyse(project);
  if (missing.length === 0) {
    if (staleProps.length === 0) {
      console.log('OK    ' + project.name + ' — moi ham duoc goi deu ton tai, khong doc thuoc tinh cu');
    }
    return;
  }
  failed += missing.length;
  console.log('FAIL  ' + project.name + ' — ' + missing.length + ' loi goi khong co dinh nghia:');
  missing.forEach(function (x) {
    console.log('        ' + x.file + ':' + x.line + '  ' + x.name + '()');
    console.log('            ' + x.text);
  });
});

console.log('');
console.log(failed === 0 ? 'refs OK' : failed + ' loi goi hong');
process.exit(failed === 0 ? 0 : 1);

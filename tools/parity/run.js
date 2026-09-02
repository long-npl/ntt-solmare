// tools/parity/run.js — chạy bản CŨ và bản MỚI trên CÙNG fixtures rồi diff từng field.
//
// Không có nó thì "bản mới đã đúng chưa" chỉ là niềm tin. Có nó thì mỗi khác biệt
// phải được giải thích, và nó là thứ cho phép tắt project cũ.
//
// Cả hai tầng logic đều thuần (không đụng SpreadsheetApp) nên nạp được vào 2 vm
// context riêng trong cùng một tiến trình.
//
// Chạy: node tools/parity/run.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

const OLD_FILES = ['src/common.js', 'src/masterHeaders.js', 'src/config.js',
  'src/sources.js', 'src/master.js', 'src/copyright.js'];

const NEW_FILES = ['shared/common.js', 'shared/engine.js', 'gas_phase_1/0_config.js',
  'gas_phase_1/3_sources.js', 'gas_phase_1/4_customer_master.js',
  'gas_phase_1/5_copyright_master.js', 'gas_phase_1/6_matching.js'];

// Khác biệt CÓ CHỦ ĐÍCH. Mọi field ngoài danh sách này là lỗi port.
//
// LƯU Ý VỀ Ý NGHĨA CỦA PHÉP SO NÀY: bản CŨ ở đây là src/ TẠI HEAD, và HEAD đã mang
// sẵn cascade ① lẫn fix LP制作 (commit trước khi rebuild bắt đầu). Nên 2 khoản đó
// hiện ra 0 khác biệt, và đó là kết quả ĐÚNG — harness này chứng minh BẢN PORT
// TRUNG THÀNH, không chứng minh 2 fix kia hoạt động. Việc đó do test đơn vị lo.
//
// Nếu ai đó chạy lại harness trên một base CHƯA có 2 fix, 2 dòng đầu sẽ khác 0 —
// giữ chúng ở đây để lúc đó vẫn đọc được ngay là "có chủ đích".
const EXPECTED = [
  { why: 'cascade ①, HEAD da co san -> ky vong 0', fields: ['policy', 'general', 'logoJudgement'], max: 400 },
  { why: 'fix LP制作, HEAD da co san -> ky vong 0', fields: ['lpProduction'], max: 50 },
  { why: 'cot MOI 初回配信巻数', fields: ['firstVolume'], max: Infinity },
  // Bản cũ không hề đọc cột 巻数, nên field này chỉ tồn tại ở bản mới. Nó là ĐẦU VÀO
  // thô của firstVolume, không phải một cột nào trên sheet.
  { why: 'dau vao tho cua 初回配信巻数, ban cu khong doc', fields: ['volumes'], max: Infinity },
  { why: 'field chan doan, khong ghi ra cot nao', fields: ['regulationTier'], max: Infinity },
];

function load(files) {
  const ctx = { console: console, Logger: { log: function () {} } };
  vm.createContext(ctx);
  files.forEach(function (rel) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  });
  return ctx;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;
function reviveCell(v) {
  if (typeof v !== 'string') return v;
  const m = ISO.exec(v);
  if (!m) return v;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}
function fixture(name) {
  const p = path.join(ROOT, 'tools', 'verify', 'fixtures', name + '.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).map(function (r) { return r.map(reviveCell); });
}

const oldCtx = load(OLD_FILES);
const newCtx = load(NEW_FILES);

const cmsRaw = fixture('cms');
const regRaw = fixture('regulation');

// ---- bản CŨ ----
const oldWorks = oldCtx.buildCustomerWorkRows(
  oldCtx.parseCmsRows(cmsRaw),
  oldCtx.buildRegulationIndex(oldCtx.parseRegulationRows(regRaw))
).filter(function (w) { return oldCtx.isWorkEligible(w); });

// ---- bản MỚI ----
const newLoaded = {
  values: { regulation: newCtx.buildRegulationIndex(newCtx.parseRegulation(regRaw)) },
  errors: { regulation: null },
};
const newWorks = newCtx.parseCms(cmsRaw)
  .map(function (cms) { return newCtx.buildCustomerRecord(cms, newLoaded); })
  .filter(function (w) { return newCtx.isWorkEligible(w); });

console.log('cu: ' + oldWorks.length + ' record  |  moi: ' + newWorks.length + ' record');
if (oldWorks.length !== newWorks.length) {
  console.log('FAIL: so record khac nhau — port sai o buoc loc');
  process.exit(1);
}

// Cột derive chỉ được tính ở applyRules(), sau bước khớp dòng — mô phỏng ở đây với
// existing = null (như dòng mới) để so được với bản cũ.
newWorks.forEach(function (w) {
  w.lpProduction = newCtx.ruleLpProduction(w, null);
  w.firstVolume = newCtx.ruleFirstVolume(w);
});
oldWorks.forEach(function (w) {
  w.lpProduction = oldCtx.resolveLpProduction(w);
});

const IGNORE = ['rawRow', 'sheetRow'];
const diffs = {};
const samples = {};

for (let i = 0; i < oldWorks.length; i++) {
  const fields = new Set(Object.keys(oldWorks[i]).concat(Object.keys(newWorks[i])));
  fields.forEach(function (f) {
    if (IGNORE.indexOf(f) >= 0) return;
    const a = oldWorks[i][f];
    const b = newWorks[i][f];
    const sa = String(a === undefined || a === null ? '' : a);
    const sb = String(b === undefined || b === null ? '' : b);
    if (sa === sb) return;
    diffs[f] = (diffs[f] || 0) + 1;
    if (!samples[f]) samples[f] = oldWorks[i].titleName + ': ' + JSON.stringify(sa) + ' -> ' + JSON.stringify(sb);
  });
}

console.log('');
let unexpected = 0;
Object.keys(diffs).sort().forEach(function (field) {
  const rule = EXPECTED.filter(function (e) { return e.fields.indexOf(field) >= 0; })[0];
  const ok = rule && diffs[field] <= rule.max;
  console.log((ok ? 'OK   ' : 'FAIL ') + field.padEnd(16) + String(diffs[field]).padStart(5)
    + ' record khac' + (rule ? '   (' + rule.why + ')' : ''));
  if (!ok) {
    console.log('       vd: ' + samples[field]);
    unexpected += 1;
  }
});
if (Object.keys(diffs).length === 0) console.log('(khong field nao khac)');

console.log('');
console.log(unexpected === 0
  ? 'parity OK — moi khac biet deu co chu dich'
  : unexpected + ' field khac biet NGOAI du kien');
process.exit(unexpected === 0 ? 0 : 1);

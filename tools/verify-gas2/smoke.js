// tools/verify-gas2/smoke.js — chạy TRỌN VẸN runGas2() ngoài Apps Script, trên
// SpreadsheetApp giả, rồi in ra mọi lệnh ghi mà nó định thực hiện.
//
//   node tools/verify-gas2/smoke.js
//   (cần chạy python tools/verify/exportFixtures.py trước)
//
// VÌ SAO CÓ FILE NÀY, dù gas2/main.js cố tình không nằm trong harness chính:
// main.js là tầng dàn dựng, lỗi của nó là lỗi NỐI DÂY — gọi sai tên hàm, truyền thiếu
// một key của options, quên một cờ. Không test đơn vị nào bắt được loại đó vì mỗi mảnh
// riêng lẻ đều đúng. Cách duy nhất khác để phát hiện là push lên Apps Script rồi bấm
// chạy, tức mỗi lần sai mất một vòng đi-về qua trình duyệt — và lần chạy đó ghi thẳng
// lên master thật.
//
// KHÔNG PHẢI test tự động: nó không assert gì cả, chỉ in ra để người đọc nhìn. Test có
// assert nằm ở tools/verify-gas2/tests.js. Đọc output và hỏi 4 câu:
//   1. Ô 更新日 có được ghi đúng C5 không?
//   2. Số dòng setValues lên vùng dữ liệu có hợp lý không?
//   3. Dòng GAS2ログ có đúng số đếm không?
//   4. Có lệnh ghi nào lên sheet mà GAS❷ không được phép đụng không?
//
// LƯU Ý VỀ FIXTURE: 顧客作品マスタ trong example/ là ガワ rỗng (0 record), nên lần chạy mẫu
// này ra 0 thêm / 0 sửa và 2 dòng 孤立行. Đó KHÔNG phải lỗi — nó chính là bằng chứng cho
// một tính chất quan trọng: nguồn chính rỗng thì GAS❷ không xoá gì cả, chỉ cảnh báo.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Ô ngày trong fixture là chuỗi ISO có phần giờ — phải dựng lại thành Date đúng như
// SpreadsheetApp trả về. Xem lời giải thích dài trong tools/verify/run.js.
const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;

function reviveCell(value) {
  if (typeof value !== 'string') return value;
  const m = ISO_DATETIME.exec(value);
  if (!m) return value;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6]));
}

function loadFixture(name) {
  const rows = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name + '.json'), 'utf8'));
  return rows.map(function (row) { return row.map(reviveCell); });
}

// ---------------------------------------------------------------- sheet giả
const writes = [];

/**
 * Sheet giả cài đủ những API mà gas2/io.js dùng, không hơn. Mọi lệnh ghi được ghi lại
 * vào `writes` thay vì thực thi — không có gì chạm tới Google.
 */
function makeSheet(name, values) {
  const rows = values.map(function (r) { return r.slice(); });
  return {
    getDataRange: function () {
      return { getValues: function () { return rows.map(function (r) { return r.slice(); }); } };
    },
    getLastRow: function () { return rows.length; },
    getLastColumn: function () {
      return rows.reduce(function (max, r) { return Math.max(max, r.length); }, 0);
    },
    getRange: function (row, col, numRows, numCols) {
      return {
        setValues: function (v) { writes.push({ sheet: name, kind: 'setValues', row: row, col: col, v: v }); },
        setValue: function (v) { writes.push({ sheet: name, kind: 'setValue', row: row, col: col, v: v }); },
        getValues: function () {
          const out = [];
          for (let r = 0; r < (numRows || 1); r++) {
            const source = rows[row - 1 + r] || [];
            out.push(source.slice(col - 1, col - 1 + (numCols || 1)));
          }
          return out;
        },
      };
    },
    appendRow: function (v) { rows.push(v); writes.push({ sheet: name, kind: 'appendRow', v: v }); },
  };
}

const titleSheet = makeSheet('タイトルマスタ', loadFixture('titleMasterGawa'));
const customerSheet = makeSheet('顧客作品マスタ', loadFixture('customerMasterGawa'));
const copyrightSheet = makeSheet('コピーライトマスタ', loadFixture('copyrightMasterGawa'));
const logTabs = {};

// ID lấy từ chính gas2/config.js — cố tình KHÔNG import, để nếu ai đó đổi ID bên đó mà
// quên đổi ở đây thì smoke ném lỗi 'unknown spreadsheet' rõ ràng, thay vì âm thầm đọc
// nhầm sheet giả.
const SPREADSHEETS = {
  '16Fw9KrvKskewy9OAWqPegYXvhOkRPywatd512Ncn4rI': {
    getSheetByName: function (n) { return n === 'タイトルマスタ' ? titleSheet : (logTabs[n] || null); },
    insertSheet: function (n) { logTabs[n] = makeSheet(n, []); return logTabs[n]; },
  },
  '1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU': {
    getSheetByName: function (n) { return n === '顧客作品マスタ' ? customerSheet : null; },
  },
  '1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc': {
    getSheetByName: function (n) { return n === 'コピーライトマスタ' ? copyrightSheet : null; },
  },
};

const sandbox = {
  console: console,
  Map: Map, Date: Date, JSON: JSON, Math: Math, String: String, Number: Number,
  Array: Array, Object: Object, isNaN: isNaN, isFinite: isFinite,
  SpreadsheetApp: {
    openById: function (id) {
      if (!SPREADSHEETS[id]) throw new Error('smoke: spreadsheet la: ' + id);
      return SPREADSHEETS[id];
    },
  },
  // Không cấu hình Slack -> notifySlack() phải thoát sớm. UrlFetchApp throw để chứng minh
  // nó KHÔNG bao giờ được gọi tới trong lần chạy sạch.
  PropertiesService: { getScriptProperties: function () { return { getProperty: function () { return null; } }; } },
  UrlFetchApp: { fetch: function () { throw new Error('smoke: khong duoc goi Slack o lan chay sach'); } },
  Logger: { log: function (m) { console.log('  LOG ' + m); } },
};
vm.createContext(sandbox);

['gas2/common.js', 'gas2/config.js', 'gas2/sources.js', 'gas2/titleMaster.js',
  'gas2/io.js', 'gas2/main.js'].forEach(function (rel) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
});

console.log('--- chay runGas2() tren SpreadsheetApp gia ---');
sandbox.runGas2();

console.log('');
console.log('--- cac lenh ghi ma no dinh thuc hien ---');
writes.forEach(function (w) {
  const preview = w.kind === 'setValues'
    ? w.v.length + ' dong x ' + (w.v[0] ? w.v[0].length : 0) + ' cot'
    : JSON.stringify(w.v).slice(0, 200);
  console.log('  [' + w.sheet + '] ' + w.kind
    + ' r' + (w.row || '-') + 'c' + (w.col || '-') + ' : ' + preview);
});
console.log('');
console.log('--- tab log da tao: ' + (Object.keys(logTabs).join(', ') || '(khong co)'));

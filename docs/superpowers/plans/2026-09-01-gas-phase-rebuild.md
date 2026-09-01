# GAS Phase Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển GAS❶/GAS❷ sang `gas_phase_1`/`gas_phase_2`, nơi mỗi cột master là **một dòng khai báo** và một engine dùng chung lo việc đọc–diff–ghi.

**Architecture:** Bảng cột khai báo + engine nhỏ dùng chung. Mỗi cột khai báo `header` / `field` / `from` / `write`, và `write` **suy ra** hàm so sánh — hai thứ phải khớp nhau giờ là một thứ, nên không thể lệch. Nguồn phụ hỏng thì cờ `keep:true` cho engine lấy lại giá trị đang có trên sheet.

**Tech Stack:** Google Apps Script (ES5, global scope, không module). Test chạy bằng Node qua `vm` context. `clasp` để push. Không có package.json, không có dependency ngoài.

**Spec:** `docs/superpowers/specs/2026-09-01-gas-phase-rebuild-design.md`

## Global Constraints

- **ES5 only.** Apps Script V8 hỗ trợ ES6 nhưng toàn bộ code hiện tại dùng `var` + `function`. Giữ nguyên phong cách: `var`, `function`, không arrow, không `let/const`, không template literal, không destructuring.
- **Không `module.exports`.** Mọi file chia chung một global scope. Test nạp file qua `vm.runInContext` rồi đọc property của global object.
- **Tên file và tên hàm/biến: tiếng Anh.** Comment: tiếng Việt.
- **Comment tối đa 1–3 dòng mỗi hàm**, nói *hàm làm gì*. Mọi lập luận "vì sao không làm cách khác" đi vào `docs/decisions.md`, trong code chỉ để lại `// xem docs/decisions.md #<anchor>`.
- **Không có chữ cái cột (`R列`, `S列`, `cột T`) ở bất kỳ đâu** — trong code lẫn comment. Chỉ dùng tên header.
- **`src/` và `gas2/` không được sửa, không được xoá** trong toàn bộ plan này.
- Script ID: `gas_phase_1` = `1_A7ZqJ8wrois90nP0ujfhdEJnmaV4qwLJUbHJdOo5lwugBYNlHzkBmNE`, `gas_phase_2` = `1b_WPDe0I8o4ojmKT94YxfLmPhyYJYBo-gcfr2MkudDN_oMashbNGBHyY`
- Hàm chuẩn hoá đã có sẵn trong `shared/common.js`, **không viết lại**: `normalizeJapaneseText`, `normalizeHeaderText`, `normalizeForCompare`, `sameValue`, `sameDateValue`, `sameWriteOnceValue`, `sameKeepWhenBlankValue`, `toDateKey`, `isDigits`, `col`, `tryCol`, `resolveHeaderIndex`, `findHeaderRowIndex`, `buildHeaderIndex`.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `.claspignore` (gốc, **sửa**) | Chặn 2 thư mục mới khỏi project GAS❶ cũ |
| `shared/sheet.js` (mới) | Bọc API Apps Script: `readSheetValues`, `resolveMasterHeader`, `stampUpdatedAt` |
| `shared/engine.js` (mới) | `compareFor` · `readRecord` · `recordsEqual` · `toSheetRow` |
| `tools/sync-shared.js` (**sửa**) | Thêm 2 file shared mới + 2 đích mới |
| `gas_phase_1/0_config.js` | ID sheet, giờ trigger, Slack keys |
| `gas_phase_1/3_sources.js` | 8 parser + bảng `SOURCES` khai báo bắt buộc/phụ |
| `gas_phase_1/4_customer_master.js` | `CUSTOMER_COLUMNS` (21 dòng) + 7 hàm `rule*` |
| `gas_phase_1/5_copyright_master.js` | `COPYRIGHT_COLUMNS` (16 dòng) + `shiftCopyrightHistory` |
| `gas_phase_1/6_matching.js` | cascade 3 tầng · rule 1/2 · cấp `タイトルNo` · diff |
| `gas_phase_1/7_warnings.js` | 13 loại cảnh báo |
| `gas_phase_1/9_main.js` | `runGas1()` + trigger + `probe_*` |
| `gas_phase_2/*` | Cùng khuôn, `4_title_master.js` thay cho 2 file master |
| `tools/parity/run.js` (mới) | Diff record cũ ↔ mới trên cùng fixtures |
| `docs/decisions.md` (mới) | Nơi dồn toàn bộ "vì sao" |

`1_common.js`, `2_sheet.js`, `8_engine.js` trong mỗi thư mục là **bản chép** do `tools/sync-shared.js` sinh ra — không sửa tay.

---

## Task 1: Chặn clasp gốc và scaffold hai thư mục

Việc này phải xong trước mọi việc khác. `.clasp.json` ở gốc có `rootDir:""` và `skipSubdirectories:false`, nghĩa là nó đẩy **mọi thư mục con** không bị ignore lên project GAS❶ đang chạy production. Tạo file mới trước khi chặn = lần `clasp push` kế tiếp nạp code mới đè vào project cũ, trùng ~29 tên hàm và trùng `var CONFIG`.

**Files:**
- Modify: `.claspignore`
- Create: `gas_phase_1/.clasp.json`, `gas_phase_1/.claspignore`, `gas_phase_1/appsscript.json`, `gas_phase_1/0_config.js`
- Create: `gas_phase_2/.clasp.json`, `gas_phase_2/.claspignore`, `gas_phase_2/appsscript.json`, `gas_phase_2/0_config.js`
- Test: `tools/verify-layout/run.js`

**Interfaces:**
- Consumes: (nothing)
- Produces: `CONFIG` global trong mỗi project — cùng hình dạng với `src/config.js` hiện tại (`CONFIG.SOURCES.*`, `CONFIG.OUTPUTS.*`, `CONFIG.TRIGGER_HOURS`, `CONFIG.TRIGGER_TIMEZONE`, `CONFIG.SLACK_PROPERTY_KEYS`, `CONFIG.COPYRIGHT_HISTORY_SLOTS`)

- [ ] **Step 1: Viết test kiểm tra layout**

Create `tools/verify-layout/run.js`:

```javascript
// tools/verify-layout/run.js — kiểm các bất biến về BỐ CỤC, không kiểm logic.
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

const id1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'gas_phase_1/.clasp.json'), 'utf8')).scriptId;
const id2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'gas_phase_2/.clasp.json'), 'utf8')).scriptId;
check('gas_phase_1 scriptId', id1, '1_A7ZqJ8wrois90nP0ujfhdEJnmaV4qwLJUbHJdOo5lwugBYNlHzkBmNE');
check('gas_phase_2 scriptId', id2, '1b_WPDe0I8o4ojmKT94YxfLmPhyYJYBo-gcfr2MkudDN_oMashbNGBHyY');
check('2 scriptId khac nhau', id1 !== id2, true);

// Bất biến quan trọng nhất: 2 project mới không được đẩy lên project cũ, và
// gas_phase_2 không được đẩy lên gas_phase_1.
const ignore1 = fs.readFileSync(path.join(ROOT, 'gas_phase_1/.claspignore'), 'utf8');
check('gas_phase_1/.claspignore chan gas_phase_2', ignore1.indexOf('gas_phase_2/**') >= 0, true);

console.log(failed === 0 ? 'layout OK' : failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Chạy test để chắc nó đỏ**

Run: `node tools/verify-layout/run.js`
Expected: FAIL — `.claspignore goc chan gas_phase_1`, và các check `ton tai` đều fail.

- [ ] **Step 3: Sửa `.claspignore` gốc**

Thêm 2 dòng vào `.claspignore` ở gốc, ngay dưới dòng `gas2/**`:

```
gas2/**
gas_phase_1/**
gas_phase_2/**
shared/**
```

- [ ] **Step 4: Tạo scaffold cho `gas_phase_1`**

`gas_phase_1/.clasp.json` — chép y `gas2/.clasp.json`, đổi `scriptId`:

```json
{
  "scriptId": "1_A7ZqJ8wrois90nP0ujfhdEJnmaV4qwLJUbHJdOo5lwugBYNlHzkBmNE",
  "rootDir": "",
  "scriptExtensions": [".js", ".gs"],
  "htmlExtensions": [".html"],
  "jsonExtensions": [".json"],
  "filePushOrder": [],
  "skipSubdirectories": false
}
```

`gas_phase_1/.claspignore`:

```
# Push từ TRONG thư mục này. rootDir "" + skipSubdirectories false nghĩa là clasp
# đi vào mọi thư mục con, nên phải chặn mọi thứ không thuộc GAS❶ mới.
gas_phase_2/**
**/node_modules/**
*.md
```

`gas_phase_1/appsscript.json` — chép y `appsscript.json` ở gốc.

`gas_phase_1/0_config.js` — chép nội dung `CONFIG` từ `src/config.js` (object bắt đầu dòng 31), giữ nguyên mọi ID, **cắt comment xuống còn 1 dòng mỗi khối**. Thêm ở đầu file:

```javascript
// 0_config.js — mọi ID sheet và hằng số vận hành của GAS❶. Không có logic.
//
// SOURCES: 8 nguồn đọc vào. OUTPUTS: 2 master ghi ra.
// Nguồn nào bắt buộc / nguồn nào phụ được khai báo ở 3_sources.js, không phải ở đây.
```

- [ ] **Step 5: Tạo scaffold cho `gas_phase_2`**

Y hệt Step 4 nhưng: `scriptId` của `gas_phase_2`, `.claspignore` chặn `gas_phase_1/**`, và `0_config.js` chép từ `gas2/config.js`.

- [ ] **Step 6: Chạy lại test**

Run: `node tools/verify-layout/run.js`
Expected: `layout OK`, exit 0.

- [ ] **Step 7: Xác nhận clasp gốc không thấy file mới**

Run: `npx @google/clasp status 2>/dev/null | grep -c gas_phase || echo 0`
Expected: `0`. Nếu `clasp` chưa cài hoặc chưa đăng nhập, lệnh trả rỗng — khi đó Step 6 là bằng chứng thay thế.

- [ ] **Step 8: Commit**

```bash
git add .claspignore gas_phase_1 gas_phase_2 tools/verify-layout
git commit -m "Fence off the new projects before writing a line of them"
```

---

## Task 2: `shared/sheet.js` — gom lớp bọc Apps Script

`readSheetValues`, `resolveMasterHeader`, `stampUpdatedAt` hiện có **hai bản** (`src/io.js` và `gas2/io.js`). Chúng là lớp bọc thuần quanh API Apps Script, không mang nghiệp vụ, nên thuộc về `shared/`.

**Files:**
- Create: `shared/sheet.js`
- Modify: `tools/sync-shared.js:30-33` (mảng `TARGETS`)
- Test: `tools/verify-layout/run.js` (thêm check)

**Interfaces:**
- Consumes: `col`, `resolveHeaderIndex`, `normalizeHeaderText` từ `shared/common.js`
- Produces:
  - `readSheetValues(spreadsheetId, sheetName) -> Array<Array<*>>`
  - `resolveMasterHeader(spreadsheetId, sheetName, requiredHeaders) -> {sheet, values, headerRowIndex, headerIndex, columnCount}`
  - `stampUpdatedAt(sheet, values, headerRowIndex, runAt) -> string|null` (ô dạng A1, `null` nếu không thấy nhãn `更新日`)

- [ ] **Step 1: Thêm check vào test layout**

Thêm vào cuối `tools/verify-layout/run.js`, trước dòng `console.log(failed === 0 ...)`:

```javascript
// shared/ phải được chép sang CẢ 2 project mới, và bản chép phải khớp bản gốc.
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
COPIES.forEach(function (pair) {
  const src = path.join(ROOT, pair[0]);
  const dst = path.join(ROOT, pair[1]);
  if (!fs.existsSync(src) || !fs.existsSync(dst)) {
    check(pair[1] + ' la ban chep cua ' + pair[0], 'thieu file', 'khop');
    return;
  }
  check(pair[1] + ' la ban chep cua ' + pair[0],
    fs.readFileSync(src, 'utf8') === fs.readFileSync(dst, 'utf8'), true);
});
```

- [ ] **Step 2: Chạy để chắc nó đỏ**

Run: `node tools/verify-layout/run.js`
Expected: FAIL ở `shared/sheet.js ton tai` và các check bản chép.

- [ ] **Step 3: Tạo `shared/sheet.js`**

Chép nguyên văn thân 3 hàm từ `src/io.js` (`readSheetValues` dòng 28, `resolveMasterHeader` dòng 60, `stampUpdatedAt` dòng 106), **không đổi một dòng logic nào**, chỉ cắt comment xuống 1–3 dòng mỗi hàm. Header file:

```javascript
// sheet.js — lớp bọc mỏng quanh API Apps Script. Không chứa nghiệp vụ.
//
// NGUỒN GỐC: shared/sheet.js. Các bản chép do tools/sync-shared.js sinh ra —
// sửa ở đây rồi chạy `node tools/sync-shared.js`.
//
// Ba hàm này từng có 2 bản (GAS❶ và GAS❷) vì cả hai đều phải đọc sheet có
// header không nằm ở hàng 1.
```

- [ ] **Step 4: Thêm 2 đích vào `tools/sync-shared.js`**

Sửa mảng `TARGETS` (dòng ~30) thành:

```javascript
const TARGETS = [
  { source: 'shared/common.js', copies: ['src/common.js', 'gas2/common.js',
      'gas_phase_1/1_common.js', 'gas_phase_2/1_common.js'] },
  { source: 'shared/masterHeaders.js', copies: ['src/masterHeaders.js', 'gas2/masterHeaders.js'] },
  { source: 'shared/sheet.js', copies: ['gas_phase_1/2_sheet.js', 'gas_phase_2/2_sheet.js'] },
  { source: 'shared/engine.js', copies: ['gas_phase_1/8_engine.js', 'gas_phase_2/8_engine.js'] },
];
```

`masterHeaders.js` **không** thêm đích mới: ở bản mới, danh sách cột bắt buộc được suy ra từ chính bảng cột (Task 5), không còn là một danh sách rời.

- [ ] **Step 5: Tạo `shared/engine.js` rỗng tạm thời**

Để `sync-shared.js` chạy được ở bước sau. Nội dung tạm: `// engine.js — sẽ viết ở Task 3.`

- [ ] **Step 6: Chạy sync rồi chạy test**

Run: `node tools/sync-shared.js && node tools/verify-layout/run.js`
Expected: `layout OK`, exit 0.

- [ ] **Step 7: Commit**

```bash
git add shared/sheet.js shared/engine.js tools/sync-shared.js tools/verify-layout gas_phase_1 gas_phase_2
git commit -m "Give both projects one copy of the sheet wrappers"
```

---

## Task 3: `shared/engine.js` — bốn hàm, và cái bẫy bị đóng lại

Đây là task quan trọng nhất. `compareFor()` là chỗ bug `LP制作` bị đóng vĩnh viễn: hàm so sánh **suy ra** từ `write`, nên không còn hai chỗ để lệch nhau.

**Files:**
- Create: `shared/engine.js`
- Test: `tools/verify-engine/run.js`, `tools/verify-engine/tests.js`

**Interfaces:**
- Consumes: `sameValue`, `sameDateValue`, `sameWriteOnceValue`, `sameKeepWhenBlankValue`, `normalizeJapaneseText`, `col` từ `shared/common.js`
- Produces:
  - `compareFor(column) -> function(existing, incoming) -> boolean` hoặc `null`
  - `requiredHeaders(columns) -> Array<string>`
  - `readRecord(row, headerIndex, columns, sheetRow) -> object`
  - `recordsEqual(existing, incoming, columns) -> boolean`
  - `toSheetRow(record, headerIndex, columnCount, columns, previousRow) -> Array<*>`
  - `readMaster(outputConfig, columns) -> {sheet, headerIndex, columnCount, headerRowIndex, values, records: Array<object>}` (Task 9 Step 2)
  - `writeMaster(outputConfig, columns, diffResult, runAt) -> string|null` (ô 更新日 dạng A1) (Task 9 Step 2)
  - `applyRules(matches, columns, loaded) -> void` (Task 9 Step 3)

Hình dạng một cột (đầy đủ ở spec §4.2):
```javascript
{ header:'LP制作', field:'lpProduction', from:'derive', rule:fn, write:'条件', type:'text', keep:false }
```

- [ ] **Step 1: Viết test cho `compareFor`**

Create `tools/verify-engine/tests.js`:

```javascript
// tools/verify-engine/tests.js — test cho shared/engine.js.
function test_compareFor(ctx) {
  var src = ctx.src, check = ctx.check;

  check('上書 + text -> sameValue',
    src.compareFor({ write: '上書', type: 'text' })('a', 'a'), true);
  check('上書 + text: undefined vs rong la nhu nhau',
    src.compareFor({ write: '上書', type: 'text' })(undefined, ''), true);
  check('上書 + date -> sameDateValue (bo qua gio/timezone)',
    src.compareFor({ write: '上書', type: 'date' })(
      new Date('2026-03-27T00:00:00+09:00'), new Date('2026-03-27T15:00:00+09:00')), true);
  check('上書 khong khai bao type -> mac dinh text',
    src.compareFor({ write: '上書' })('1', 1), true);

  // Ba dòng dưới đây là toàn bộ lý do engine tồn tại: write quyết định luôn compare.
  check('条件 -> incoming rong = khong doi (giu o)',
    src.compareFor({ write: '条件' })('必要', ''), true);
  check('条件 -> incoming co gia tri = ghi de duoc',
    src.compareFor({ write: '条件' })('必要', '不要'), false);
  check('1回 -> o da co chu = khong bao gio doi',
    src.compareFor({ write: '1回' })('2026-01-05', '2026-02-09'), true);
  check('1回 -> o trong + incoming co gia tri = doi',
    src.compareFor({ write: '1回' })('', '2026-02-09'), false);
  check('— -> khong so sanh',
    src.compareFor({ write: '—' }), null);
}
```

- [ ] **Step 2: Viết runner**

Create `tools/verify-engine/run.js` — chép `tools/verify/run.js` và đổi đúng 2 hằng số:

```javascript
const PURE_FILES = ['shared/common.js', 'shared/engine.js'];
const TESTS_FILE = 'tools/verify-engine/tests.js';
```

Giữ nguyên phần còn lại (nạp qua `vm`, hàm `check`, đếm pass/fail, `process.exit`). Bỏ phần kiểm `sync-shared --check` và phần fixtures — engine test không cần dữ liệu thật.

- [ ] **Step 3: Chạy để chắc nó đỏ**

Run: `node tools/verify-engine/run.js`
Expected: FAIL — `compareFor is not a function`.

- [ ] **Step 4: Viết `compareFor` + `requiredHeaders`**

```javascript
// engine.js — đọc bảng cột rồi lo việc đọc / so / ghi. Không biết cột nào là cột gì.
//
// NGUỒN GỐC: shared/engine.js. Bản chép do tools/sync-shared.js sinh ra.

var WRITE_OVERWRITE = '上書';   // ghi đè vô điều kiện, kể cả ghi rỗng
var WRITE_CONDITIONAL = '条件'; // có giá trị thì đè, rỗng thì giữ nguyên ô
var WRITE_ONCE = '1回';         // ô đã có chữ thì không bao giờ đụng
var WRITE_NEVER = '—';          // GAS không ghi cột này

/**
 * Hàm so sánh của một cột, SUY RA từ chế độ ghi của chính nó.
 *
 * Đây là lý do engine tồn tại. Trước đây chế độ ghi nằm ở io.js còn hàm so sánh
 * nằm ở main.js, và khi hai chỗ chọn khác nhau thì ô đó hoặc churn vĩnh viễn hoặc
 * không bao giờ được ghi. Xem docs/decisions.md #engine-01
 *
 * @returns {function(*, *): boolean|null} null = cột không được so (GAS không ghi).
 *   Thứ tự tham số LUÔN là (existing, incoming) — cả 3 hàm dưới đều không đối xứng.
 */
function compareFor(column) {
  if (column.write === WRITE_NEVER) return null;
  if (column.write === WRITE_CONDITIONAL) return sameKeepWhenBlankValue;
  if (column.write === WRITE_ONCE) return sameWriteOnceValue;
  return column.type === 'date' ? sameDateValue : sameValue;
}

/** Tên cột bắt buộc phải có trên sheet = mọi header trong bảng, trừ cột tuỳ chọn. */
function requiredHeaders(columns) {
  var names = [];
  columns.forEach(function (column) {
    if (column.optional === true) return;
    names.push(column.header);
  });
  return names;
}
```

- [ ] **Step 5: Chạy test**

Run: `node tools/verify-engine/run.js`
Expected: PASS 9/9.

- [ ] **Step 6: Viết test cho `readRecord` + `recordsEqual`**

Thêm vào `tools/verify-engine/tests.js`:

```javascript
function test_readAndCompare(ctx) {
  var src = ctx.src, check = ctx.check;

  var COLUMNS = [
    { header: 'タイトルNo', field: 'titleNo', from: 'self', write: '上書' },
    { header: 'LP制作', field: 'lpProduction', from: 'derive', write: '条件' },
    { header: '先行開始日', field: 'preStart', from: 'cms', write: '上書', type: 'date' },
    { header: 'メモ', field: 'memo', from: 'self', write: '—' },
  ];
  var headerIndex = new Map([['タイトルNo', 1], ['LP制作', 2], ['先行開始日', 3], ['メモ', 4]]);

  var record = src.readRecord(['', 7, '必要', new Date('2026-03-27T00:00:00+09:00'), 'ghi chu'],
    headerIndex, COLUMNS, 16);
  check('readRecord lay dung field theo header',
    [record.titleNo, record.lpProduction, record.memo], [7, '必要', 'ghi chu']);
  check('readRecord gan sheetRow that (khong tinh tu offset)', record.sheetRow, 16);
  check('readRecord giu rawRow de bao toan cot GAS khong so huu',
    record.rawRow.length, 5);

  check('recordsEqual: giong het -> true',
    src.recordsEqual(record, record, COLUMNS), true);
  check('recordsEqual: cot — khong tham gia so sanh',
    src.recordsEqual(record, { titleNo: 7, lpProduction: '必要',
      preStart: record.preStart, memo: 'KHAC HAN' }, COLUMNS), true);
  check('recordsEqual: 条件 + incoming rong -> van coi la khong doi',
    src.recordsEqual(record, { titleNo: 7, lpProduction: '',
      preStart: record.preStart, memo: '' }, COLUMNS), true);
  check('recordsEqual: 条件 + incoming khac -> doi',
    src.recordsEqual(record, { titleNo: 7, lpProduction: '不要',
      preStart: record.preStart, memo: '' }, COLUMNS), false);
}
```

- [ ] **Step 7: Chạy để chắc nó đỏ**

Run: `node tools/verify-engine/run.js`
Expected: FAIL — `readRecord is not a function`.

- [ ] **Step 8: Viết `readRecord` + `recordsEqual`**

```javascript
/**
 * Dựng 1 record từ một dòng sheet đã đọc.
 *
 * Giữ `rawRow` và `sheetRow` (số dòng THẬT, 1-based) vì đường ghi cần cả hai:
 * rawRow để bảo toàn cột GAS không sở hữu, sheetRow để ghi đúng dòng.
 */
function readRecord(row, headerIndex, columns, sheetRow) {
  var record = { sheetRow: sheetRow, rawRow: row };
  columns.forEach(function (column) {
    var index = headerIndex.get(normalizeHeaderText(column.header));
    if (index === undefined) return;
    record[column.field] = row[index];
  });
  return record;
}

/** Hai record có được coi là không đổi hay không — theo đúng chế độ ghi của từng cột. */
function recordsEqual(existing, incoming, columns) {
  for (var i = 0; i < columns.length; i++) {
    var compare = compareFor(columns[i]);
    if (compare === null) continue;
    if (!compare(existing[columns[i].field], incoming[columns[i].field])) return false;
  }
  return true;
}
```

- [ ] **Step 9: Chạy test**

Run: `node tools/verify-engine/run.js`
Expected: PASS 16/16.

- [ ] **Step 10: Viết test cho `toSheetRow`**

Thêm vào `tools/verify-engine/tests.js`:

```javascript
function test_toSheetRow(ctx) {
  var src = ctx.src, check = ctx.check;

  var COLUMNS = [
    { header: 'タイトル区分', field: 'titleCategory', from: 'lookup:commit', write: '上書' },
    { header: 'LP制作', field: 'lpProduction', from: 'derive', write: '条件' },
    { header: '掲載停止日付', field: 'suspensionDate', from: 'lookup:susp', write: '1回' },
    { header: '手入力メモ', field: 'memo', from: 'self', write: '—' },
  ];
  var headerIndex = new Map([['タイトル区分', 1], ['LP制作', 2], ['掲載停止日付', 3], ['手入力メモ', 4]]);
  var previous = ['', '独占', '営業', '2026-01-05', 'người gõ tay'];

  var row = src.toSheetRow(
    { titleCategory: 'コミット', lpProduction: '', suspensionDate: '2026-09-01', memo: '' },
    headerIndex, 5, COLUMNS, previous);

  check('上書: ghi de vo dieu kien', row[1], 'コミット');
  check('条件: incoming rong -> GIU o cu, khong xoa chu nguoi go tay', row[2], '営業');
  check('1回: o da co chu -> khong dung toi', row[3], '2026-01-05');
  check('—: cot GAS khong so huu duoc bao toan', row[4], 'người gõ tay');

  var rowFilled = src.toSheetRow(
    { titleCategory: 'コミット', lpProduction: '必要', suspensionDate: '2026-09-01', memo: '' },
    headerIndex, 5, COLUMNS, ['', '独占', '', '', 'người gõ tay']);
  check('条件: incoming co gia tri -> ghi de', rowFilled[2], '必要');
  check('1回: o dang trong -> duoc dien', rowFilled[3], '2026-09-01');

  var rowNew = src.toSheetRow(
    { titleCategory: 'コミット', lpProduction: '', suspensionDate: '', memo: '' },
    headerIndex, 5, COLUMNS, undefined);
  check('dong MOI: cot khong so huu ra rong, khong ra "undefined"', rowNew[4], '');
  check('dong MOI: 上書 van ghi', rowNew[0], '');

  // 上書 phải ghi được cả giá trị rỗng — tác phẩm bị rút khỏi nguồn thì ô PHẢI được xoá.
  var rowCleared = src.toSheetRow(
    { titleCategory: '', lpProduction: '', suspensionDate: '', memo: '' },
    headerIndex, 5, COLUMNS, previous);
  check('上書: ghi rong DE XOA duoc', rowCleared[1], '');
}
```

- [ ] **Step 11: Chạy để chắc nó đỏ**

Run: `node tools/verify-engine/run.js`
Expected: FAIL — `toSheetRow is not a function`.

- [ ] **Step 12: Viết `toSheetRow`**

```javascript
/**
 * Dựng mảng giá trị để ghi 1 dòng, TỪ BẢN COPY của dòng cũ.
 *
 * Copy trước rồi mới đè các cột GAS sở hữu, nên mọi cột người gõ tay và mọi cột
 * 池永 vừa chèn thêm đều tự được bảo toàn — không cần danh sách "cấm ghi".
 * Xem docs/decisions.md #engine-02
 *
 * @param {Array<*>|undefined} previousRow - rawRow của dòng cũ; undefined khi append
 */
function toSheetRow(record, headerIndex, columnCount, columns, previousRow) {
  var row = [];
  for (var c = 0; c < columnCount; c++) {
    var carried = previousRow ? previousRow[c] : '';
    row.push(carried === null || carried === undefined ? '' : carried);
  }

  columns.forEach(function (column) {
    if (column.write === WRITE_NEVER) return;
    var index = headerIndex.get(normalizeHeaderText(column.header));
    if (index === undefined) return;

    var value = record[column.field];
    var safe = value === null || value === undefined ? '' : value;

    if (column.write === WRITE_CONDITIONAL) {
      if (normalizeJapaneseText(safe) !== '') row[index] = safe;
      return;
    }
    if (column.write === WRITE_ONCE) {
      if (normalizeJapaneseText(row[index]) === '' && normalizeJapaneseText(safe) !== '') {
        row[index] = safe;
      }
      return;
    }
    row[index] = safe;
  });

  return row;
}
```

- [ ] **Step 13: Chạy test**

Run: `node tools/verify-engine/run.js`
Expected: PASS 25/25.

- [ ] **Step 14: Sync và commit**

```bash
node tools/sync-shared.js && node tools/verify-engine/run.js && node tools/verify-layout/run.js
git add shared/engine.js tools/verify-engine gas_phase_1/8_engine.js gas_phase_2/8_engine.js
git commit -m "Make the write mode decide the compare, so the two cannot disagree"
```

---

## Task 4: `gas_phase_1/3_sources.js` — 8 parser và một bảng thay cho 5 khối try/catch

**Files:**
- Create: `gas_phase_1/3_sources.js`
- Test: `tools/verify-phase1/run.js`, `tools/verify-phase1/tests.js`

**Interfaces:**
- Consumes: `readSheetValues` (`shared/sheet.js`), `resolveHeaderIndex`/`col`/`tryCol`/`normalizeJapaneseText`/`isDigits` (`shared/common.js`), `CONFIG` (`0_config.js`)
- Produces:
  - `SOURCES` — mảng `{key, config, sheetName, parse, required}`
  - `parseRegulation(rawRows) -> Array<object>` · `buildRegulationIndex(records) -> {byBoth, byName, byId}` · `lookupRegulation(work, index) -> object|null`
  - `parseCms(rawRows) -> Array<object>` (mỗi record có thêm `volumes` = cột `巻数`)
  - `parseCommit` · `buildCommitFlagLookup` · `lookupTitleCategory`
  - `parsePreEndExtension` · `buildPreEndExtensionLookup` · `lookupPreEndExtension`
  - `parseMassFree` · `buildMassFreeLookup` · `lookupMassFreePeriod`
  - `parseSuspension` · `buildSuspensionLookup` · `lookupSuspensionDate`
  - `parseNgTitles` · `buildNgTitleLookup`
  - `parsePublisherCopyrightRules` · `buildPublisherCopyrightLookup` · `resolvePublisherCopyright` · `resolvePublisherPreConfirmation`
  - `loadSources(startedAt) -> {values: {<key>: <lookup>}, errors: {<key>: string|null}}`

- [ ] **Step 1: Viết test cho `loadSources`**

Create `tools/verify-phase1/tests.js`:

```javascript
// tools/verify-phase1/tests.js — test cho gas_phase_1/.
function test_loadSources(ctx) {
  var src = ctx.src, check = ctx.check;

  // Nguồn PHỤ hỏng: nuốt lỗi, ghi lại nguyên nhân, lần chạy tiếp tục.
  var loaded = src.loadSourcesFrom([
    { key: 'ok', required: false, read: function () { return 'DATA'; } },
    { key: 'broken', required: false, read: function () { throw new Error('mat quyen'); } },
  ]);
  check('nguon phu chay duoc -> co gia tri', loaded.values.ok, 'DATA');
  check('nguon phu hong -> value la null, KHONG phai rong', loaded.values.broken, null);
  check('nguon phu hong -> ghi lai nguyen nhan', loaded.errors.broken.indexOf('mat quyen') >= 0, true);
  check('nguon phu chay duoc -> khong co loi', loaded.errors.ok, null);

  // Nguồn BẮT BUỘC hỏng: lỗi phải lan ra ngoài và làm cả lần chạy thất bại.
  var threw = false;
  try {
    src.loadSourcesFrom([
      { key: 'cms', required: true, read: function () { throw new Error('sheet bi xoa'); } },
    ]);
  } catch (e) { threw = true; }
  check('nguon BAT BUOC hong -> throw ra ngoai', threw, true);
}
```

- [ ] **Step 2: Viết runner**

Create `tools/verify-phase1/run.js` — chép `tools/verify/run.js`, đổi 3 hằng số:

```javascript
const PURE_FILES = ['gas_phase_1/1_common.js', 'gas_phase_1/0_config.js',
  'gas_phase_1/8_engine.js', 'gas_phase_1/3_sources.js', 'gas_phase_1/4_customer_master.js',
  'gas_phase_1/5_copyright_master.js', 'gas_phase_1/6_matching.js', 'gas_phase_1/7_warnings.js'];
const TESTS_FILE = 'tools/verify-phase1/tests.js';
const FIXTURES_DIR = path.join(ROOT, 'tools/verify/fixtures');
```

Giữ nguyên phần kiểm `sync-shared --check` ở đầu. `2_sheet.js` **không** nạp (nó gọi `SpreadsheetApp` ở tầng ngoài? không — chỉ trong thân hàm, nên nạp được; nhưng phase 1 chưa cần).

- [ ] **Step 3: Chạy để chắc nó đỏ**

Run: `node tools/verify-phase1/run.js`
Expected: FAIL — không nạp được `gas_phase_1/3_sources.js`.

- [ ] **Step 4: Port 8 parser**

Chép nguyên văn từ `src/sources.js`, **không đổi một dòng logic nào**, chỉ:
- cắt comment xuống 1–3 dòng mỗi hàm, chuyển lập luận dài sang `docs/decisions.md`
- đổi tên: `parseRegulationRows` → `parseRegulation`, `parseCmsRows` → `parseCms`, `parseCommitManagementRows` → `parseCommit`, `parsePreEndExtensionRows` → `parsePreEndExtension`, `parseMassFreeRows` → `parseMassFree`, `parseSuspensionRows` → `parseSuspension` (bỏ hậu tố `Rows` cho đều)
- **thêm `巻数` vào `CMS_REQUIRED_HEADERS`** và thêm `volumes: row[col(idx, '巻数')]` vào record của `parseCms`

Cascade レギュレーション 3 tầng (`buildRegulationIndex`, `lookupRegulation`, `regulationKeyBoth/Name/Id`) chép từ **working tree hiện tại** của `src/sources.js` — đó là bản đã có cascade, chưa commit.

- [ ] **Step 5: Viết `loadSources` + `loadSourcesFrom`**

```javascript
/**
 * 8 nguồn của GAS❶. `required:false` = nguồn PHỤ: đọc không được thì cột tương ứng
 * giữ nguyên giá trị đang có và lần chạy vẫn tiếp tục.
 * Xem docs/decisions.md #sources-01
 */
var SOURCES = [
  { key: 'regulation', required: true, read: function () {
      return buildRegulationIndex(parseRegulation(
        readSheetValues(CONFIG.SOURCES.REGULATION.spreadsheetId, CONFIG.SOURCES.REGULATION.sheetName))); } },
  { key: 'cms', required: true, read: function () {
      return parseCms(readSheetValues(CONFIG.SOURCES.CMS.spreadsheetId, CONFIG.SOURCES.CMS.sheetName)); } },
  { key: 'ngTitle', required: false, read: function () {
      return buildNgTitleLookup(parseNgTitles(readSheetValues(
        CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.NG_TITLES))); } },
  { key: 'publisherCopyright', required: false, read: function () {
      return buildPublisherCopyrightLookup(parsePublisherCopyrightRules(readSheetValues(
        CONFIG.SOURCES.PUBLISHER_COPYRIGHT.spreadsheetId, CONFIG.SOURCES.PUBLISHER_COPYRIGHT.sheetName))); } },
  { key: 'commit', required: false, read: function () {
      return buildCommitFlagLookup(parseCommit(readSheetValues(
        CONFIG.SOURCES.COMMIT_MANAGEMENT.spreadsheetId, CONFIG.SOURCES.COMMIT_MANAGEMENT.sheetName))); } },
  { key: 'preEnd', required: false, read: function () {
      return buildPreEndExtensionLookup(parsePreEndExtension(readSheetValues(
        CONFIG.SOURCES.PRE_END_EXTENSION.spreadsheetId, CONFIG.SOURCES.PRE_END_EXTENSION.sheetName))); } },
  { key: 'massFree', required: false, read: function () {
      return buildMassFreeLookup(parseMassFree(readSheetValues(
        CONFIG.SOURCES.MASS_FREE.spreadsheetId, CONFIG.SOURCES.MASS_FREE.sheetName))); } },
  { key: 'suspension', required: false, read: function (startedAt) {
      var found = findLatestSuspensionFile(CONFIG.SOURCES.SUSPENSION, startedAt);
      if (found === null) return null;
      return buildSuspensionLookup(parseSuspension(
        readTsvRows(found.file, CONFIG.SOURCES.SUSPENSION.encoding),
        CONFIG.SOURCES.SUSPENSION.titleIdColumn, CONFIG.SOURCES.SUSPENSION.suspensionDateColumn)); } },
];

/** Đọc một danh sách nguồn bất kỳ. Tách khỏi loadSources() để test được không cần sheet. */
function loadSourcesFrom(sources, startedAt) {
  var values = {};
  var errors = {};
  sources.forEach(function (source) {
    errors[source.key] = null;
    if (source.required) {
      values[source.key] = source.read(startedAt);
      return;
    }
    try {
      values[source.key] = source.read(startedAt);
    } catch (failure) {
      values[source.key] = null;
      errors[source.key] = String(failure);
      Logger.log('Nguồn ' + source.key + ': đọc lỗi -> cột liên quan giữ nguyên. ' + String(failure));
    }
  });
  return { values: values, errors: errors };
}

/** Đọc cả 8 nguồn của GAS❶. */
function loadSources(startedAt) {
  return loadSourcesFrom(SOURCES, startedAt);
}
```

Test không có `Logger` — thêm vào `run.js` một stub trong sandbox: `Logger: { log: function () {} }`.

- [ ] **Step 6: Chạy test**

Run: `node tools/verify-phase1/run.js`
Expected: PASS 5/5.

- [ ] **Step 7: Commit**

```bash
git add gas_phase_1/3_sources.js tools/verify-phase1
git commit -m "Turn five hand-copied try/catch blocks into one table"
```

---

## Task 5: `gas_phase_1/4_customer_master.js` — bảng 21 cột và 7 quy tắc

**Files:**
- Create: `gas_phase_1/4_customer_master.js`
- Test: `tools/verify-phase1/tests.js` (thêm hàm test)

**Interfaces:**
- Consumes: `compareFor`/`requiredHeaders` (engine), `lookupTitleCategory`/`lookupPreEndExtension`/`lookupMassFreePeriod`/`lookupSuspensionDate`/`lookupRegulation` (`3_sources.js`), `normalizeJapaneseText`/`isDigits` (common)
- Produces:
  - `CUSTOMER_COLUMNS` — mảng 21 cột
  - `ruleLpProduction(record, existing) -> string`
  - `ruleFirstVolume(record) -> string`
  - `rulePreEndFinal(record) -> *`
  - `buildCustomerRecord(cms, ctx) -> object`

- [ ] **Step 1: Viết test cho `ruleFirstVolume`**

Thêm vào `tools/verify-phase1/tests.js`:

```javascript
function test_firstVolume(ctx) {
  var src = ctx.src, check = ctx.check;
  function lp(v) { return src.ruleFirstVolume({ volumes: v }); }

  check('1 -> 1', lp('1'), '1');
  check('khoang 1~4 -> 4', lp('1~4'), '4');
  check('khoang 2 chu so 10~12 -> 12', lp('10~12'), '12');
  // normalizeJapaneseText gộp cả 3 biến thể dấu ngăn + số full-width về 1 dạng.
  check('3 bien the dau ngan + so full-width deu ra XX',
    [lp('1~5'), lp('1～5'), lp('1〜5'), lp('１～５')], ['5', '5', '5', '5']);

  check('so khac 1 -> 顧客確認', [lp('2'), lp('3'), lp('44563')], ['顧客確認', '顧客確認', '顧客確認']);
  check('co duoi -> 顧客確認 (dung mat chu rule)',
    [lp('1~5(全話一挙配信)'), lp('1~3巻'), lp('1(初回配信話数確認中)'), lp('12話目')],
    ['顧客確認', '顧客確認', '顧客確認', '顧客確認']);
  check('o trong -> 顧客確認', [lp(''), lp(null), lp(undefined)], ['顧客確認', '顧客確認', '顧客確認']);
  // 5 ô đã bị Sheets nuốt thành ngày (người gõ 1-5, 1-12) — dữ liệu gốc mất.
  check('o bi Sheets nuot thanh ngay -> 顧客確認',
    lp(new Date('2026-01-05T00:00:00+09:00')), '顧客確認');
}
```

- [ ] **Step 2: Viết test cho `ruleLpProduction` (kể cả ca bug)**

Thêm tiếp:

```javascript
function test_lpProduction(ctx) {
  var src = ctx.src, check = ctx.check;
  function lp(genre, logo, existingLogo) {
    return src.ruleLpProduction({ genre: genre, logoJudgement: logo },
      existingLogo === undefined ? null : { logoJudgement: existingLogo });
  }

  check('ジャンル xet TRUOC ロゴ判定', lp('TL', 'ロゴあり'), '必要');
  check('tien to bat duoc bien the that',
    [lp('TLコミック', 'ロゴあり'), lp('BLコミック', 'ロゴあり'), lp('TL（R18）', 'ロゴあり')],
    ['必要', '必要', '必要']);
  check('ＴＬ full-width + tl thuong', [lp('ＴＬ', 'ロゴあり'), lp('tl', 'ロゴあり')], ['必要', '必要']);
  check('con lai moi xet ロゴ判定', [lp('女性', 'ロゴなし'), lp('女性', 'ロゴあり')], ['必要', '不要']);
  check('chua phan dinh -> rong, KHONG phai 不要', lp('女性', ''), '');

  // BUG 2026-09-01: ô ③ trên master được GIỮ khi 未判定, nhưng quy tắc lại đọc ③ của
  // riêng lần chạy này (rỗng) -> 13 dòng hien ③=ロゴあり ma cot J trong VINH VIEN.
  check('BUG: 未判定 hom nay nhung master dang giu ③=ロゴあり -> 不要',
    lp('女性', '', 'ロゴあり'), '不要');
  check('BUG: master dang giu ③=ロゴなし -> 必要', lp('女性', '', 'ロゴなし'), '必要');
  check('phan dinh MOI thang gia tri cu tren sheet', lp('女性', 'ロゴあり', 'ロゴなし'), '不要');
  check('dong MOI (existing null) van ra rong khi 未判定', lp('女性', '', undefined), '');
  check('ca 2 phia deu khong co ③ -> rong', lp('女性', '', ''), '');
  check('ジャンル TL van thang, khong dung toi ③ nao', lp('TL', '', 'ロゴあり'), '必要');
}
```

- [ ] **Step 3: Chạy để chắc nó đỏ**

Run: `node tools/verify-phase1/run.js`
Expected: FAIL — `ruleFirstVolume is not a function`.

- [ ] **Step 4: Viết 3 hàm quy tắc**

```javascript
var LP_REQUIRED = '必要';
var LP_NOT_REQUIRED = '不要';
var LP_GENRE_PREFIXES = ['TL', 'BL'];
var LOGO_NONE = 'ロゴなし';
var LOGO_PRESENT = 'ロゴあり';

/**
 * LP制作 — xét ジャンル TRƯỚC, ロゴ判定 chỉ xét cho phần còn lại. Thứ tự là một phần
 * của quy tắc. Trả '' = chưa phán định được, engine sẽ giữ nguyên ô.
 *
 * Đọc ③ CÓ HIỆU LỰC: phán định mới nếu có, không thì giá trị đang có trên sheet —
 * vì ô ③ được GIỮ khi 未判定. Xem docs/decisions.md #lp-01
 */
function ruleLpProduction(record, existing) {
  var genre = normalizeJapaneseText(record.genre).toUpperCase();
  for (var i = 0; i < LP_GENRE_PREFIXES.length; i++) {
    if (genre.indexOf(LP_GENRE_PREFIXES[i]) === 0) return LP_REQUIRED;
  }
  var logo = normalizeJapaneseText(record.logoJudgement) !== ''
    ? record.logoJudgement
    : (existing ? existing.logoJudgement : '');
  var normalized = normalizeJapaneseText(logo);
  if (normalized === LOGO_NONE) return LP_REQUIRED;
  if (normalized === LOGO_PRESENT) return LP_NOT_REQUIRED;
  return '';
}

var FIRST_VOLUME_CONFIRM = '顧客確認';
// Chỉ cần ~ ASCII: normalizeJapaneseText đã gộp ~ / ～ / 〜 và số full-width về dạng này.
var FIRST_VOLUME_RANGE = /^(\d+)~(\d+)$/;

/** 初回配信巻数 — 1 giữ nguyên, 〇〇~XX lấy XX, mọi thứ khác là 顧客確認. */
function ruleFirstVolume(record) {
  var value = normalizeJapaneseText(record.volumes);
  if (value === '1') return '1';
  var range = FIRST_VOLUME_RANGE.exec(value);
  if (range !== null) return range[2];
  return FIRST_VOLUME_CONFIRM;
}

/** 先行終了日（最終確定）— ngày gia hạn nếu có, ngược lại ngày kết thúc gốc. */
function rulePreEndFinal(record) {
  if (normalizeJapaneseText(record.preEndExtended) !== '') return record.preEndExtended;
  if (normalizeJapaneseText(record.preEnd) !== '') return record.preEnd;
  return '';
}
```

Đây là `resolvePreEndFinal` ở `src/sources.js:765` đổi tên và đổi chữ ký từ
`(preEnd, preEndExtended)` sang `(record)` cho khớp khuôn `rule(record, existing)` — logic
giữ nguyên từng dòng.

Thêm test cho nó:

```javascript
function test_preEndFinal(ctx) {
  var src = ctx.src, check = ctx.check;
  var d1 = new Date('2026-06-25T00:00:00+09:00');
  var d2 = new Date('2026-09-30T00:00:00+09:00');
  check('co gia han -> lay gia han', src.rulePreEndFinal({ preEnd: d1, preEndExtended: d2 }), d2);
  check('khong gia han -> lay ngay goc', src.rulePreEndFinal({ preEnd: d1, preEndExtended: '' }), d1);
  check('khong co gi -> rong', src.rulePreEndFinal({ preEnd: '', preEndExtended: '' }), '');
}
```

- [ ] **Step 5: Chạy test**

Run: `node tools/verify-phase1/run.js`
Expected: PASS 22/22.

- [ ] **Step 6: Viết bảng 21 cột**

```javascript
/**
 * 顧客作品マスタ — layout ガワ 0826, header hàng 15, 21 cột.
 *
 * Mỗi cột một dòng. `write` quyết định LUÔN hàm so sánh (xem compareFor trong
 * engine), nên không có cách nào để hai thứ đó lệch nhau.
 * `keep:true` = nguồn phụ đọc lỗi thì lấy lại giá trị đang có trên sheet.
 */
var CUSTOMER_COLUMNS = [
  { header: 'タイトルNo',             field: 'titleNo',        from: 'self',              write: '上書' },
  { header: 'CMS ID',                field: 'cmsId',          from: 'cms',               write: '上書' },
  { header: 'タイトルID',             field: 'titleId',        from: 'cms',               write: '上書' },
  { header: 'タイトル区分',            field: 'titleCategory',  from: 'lookup:commit',     write: '上書', keep: true },
  { header: '①広告出稿ポリシー',       field: 'policy',         from: 'regulation',        write: '条件' },
  { header: '②一般面出稿NG',          field: 'general',        from: 'regulation',        write: '条件' },
  { header: '③シーモアロゴ判定',       field: 'logoJudgement',  from: 'regulation',        write: '条件' },
  { header: '掲載停止日付',            field: 'suspensionDate', from: 'lookup:suspension', write: '1回' },
  { header: 'LP制作',                 field: 'lpProduction',   from: 'derive', rule: ruleLpProduction, write: '条件' },
  { header: 'タイトル名',              field: 'titleName',      from: 'cms',               write: '上書' },
  { header: '初回配信巻数',            field: 'firstVolume',    from: 'derive', rule: ruleFirstVolume,  write: '上書' },
  { header: '作家名',                 field: 'author',         from: 'cms',               write: '上書' },
  { header: 'ジャンル',                field: 'genre',          from: 'cms',               write: '上書' },
  { header: '出版社',                 field: 'publisher',      from: 'cms',               write: '上書' },
  { header: 'レーベル名',              field: 'label',          from: 'cms',               write: '上書' },
  { header: '先行開始日',              field: 'preStart',       from: 'cms',               write: '上書', type: 'date' },
  { header: '先行終了日',              field: 'preEnd',         from: 'cms',               write: '上書', type: 'date' },
  { header: '先行終了日（延長）',       field: 'preEndExtended', from: 'lookup:preEnd',     write: '上書', type: 'date', keep: true },
  { header: '先行終了日（最終確定）',    field: 'preEndFinal',    from: 'derive', rule: rulePreEndFinal,  write: '上書', type: 'date' },
  { header: '大量無料開始日',          field: 'massFreeStart',  from: 'lookup:massFree',   write: '上書', type: 'date', keep: true },
  { header: '大量無料終了日',          field: 'massFreeEnd',    from: 'lookup:massFree',   write: '上書', type: 'date', keep: true },
];
```

Ngoặc trong `先行終了日（延長）` là ngoặc **full-width** đúng như trên sheet — `normalizeHeaderText()` chỉ bỏ khoảng trắng/xuống dòng, KHÔNG làm NFKC, nên viết nhầm sang ngoặc half-width là throw.

- [ ] **Step 7: Viết test cho bảng cột và `buildCustomerRecord`**

```javascript
function test_customerColumns(ctx) {
  var src = ctx.src, check = ctx.check;

  check('dung 21 cot', src.CUSTOMER_COLUMNS.length, 21);
  check('moi cot co du header + field + from + write',
    src.CUSTOMER_COLUMNS.filter(function (c) {
      return !c.header || !c.field || !c.from || !c.write; }).length, 0);
  check('khong cot nao khai bao compare (write da quyet dinh)',
    src.CUSTOMER_COLUMNS.filter(function (c) { return c.compare !== undefined; }).length, 0);
  check('cot derive nao cung co rule',
    src.CUSTOMER_COLUMNS.filter(function (c) {
      return c.from === 'derive' && typeof c.rule !== 'function'; }).length, 0);
  check('6 cot ngay dung type date',
    src.CUSTOMER_COLUMNS.filter(function (c) { return c.type === 'date'; })
      .map(function (c) { return c.field; }),
    ['preStart', 'preEnd', 'preEndExtended', 'preEndFinal', 'massFreeStart', 'massFreeEnd']);
  check('requiredHeaders sinh dung 21 ten', src.requiredHeaders(src.CUSTOMER_COLUMNS).length, 21);
}
```

- [ ] **Step 8: Viết `buildCustomerRecord`**

Hàm này thay cho `buildCustomerWorkRows()` cũ. Nó chỉ lo phần `from:'cms'` và
`from:'regulation'`; cột `derive` và `lookup:` do `applyRules()` (Task 9) tính sau, khi
đã biết dòng master tương ứng.

```javascript
/**
 * Dựng 1 record từ 1 dòng CMS + phán định レギュレーション.
 *
 * CHỈ điền cột 'cms' và 'regulation'. Cột 'derive' và 'lookup:' cần biết dòng master
 * tương ứng nên phải đợi tới applyRules(), sau bước khớp dòng.
 *
 * judged/isNg quyết định số phận tác phẩm (xem filterAndMatchWorks). 3 cột phán định
 * để '' khi 未判定 — engine hiểu '' là "giữ nguyên ô" nhờ write:'条件'.
 */
function buildCustomerRecord(cms, loaded) {
  var regulation = lookupRegulation(cms, loaded.values.regulation);
  var judged = regulation !== null;
  return {
    cmsId: cms.cmsId,
    titleId: cms.titleId,
    titleName: cms.titleName,
    volumes: cms.volumes,
    author: cms.author,
    genre: cms.genre,
    publisher: cms.publisher,
    label: cms.label,
    preStart: cms.preStart,
    preEnd: cms.preEnd,
    copyrightU: cms.copyrightU,
    policy: judged ? regulation.policy : '',
    general: judged ? regulation.general : '',
    logoJudgement: judged ? regulation.logoJudgement : '',
    judged: judged,
    isNg: judged ? regulation.isNg : false,
    regulationTier: judged ? regulation.tier : null,
  };
}
```

`volumes` là trường mới so với bản cũ — nó là đầu vào của `ruleFirstVolume`.

- [ ] **Step 9: Viết test cho `buildCustomerRecord`**

```javascript
function test_buildCustomerRecord(ctx) {
  var src = ctx.src, check = ctx.check;
  var index = src.buildRegulationIndex([
    { titleName: 'A', titleId: '100', policy: '問題なし', general: '一般面OK', logoJudgement: 'ロゴあり' },
    { titleName: 'B', titleId: '200', policy: '問題あり', general: '', logoJudgement: 'ロゴなし' },
  ]);
  var loaded = { values: { regulation: index }, errors: { regulation: null } };

  var ok = src.buildCustomerRecord({ titleName: 'A', titleId: '100', volumes: '1~4' }, loaded);
  check('tra ra -> judged true + 3 cot phan dinh nguyen van',
    [ok.judged, ok.isNg, ok.policy, ok.logoJudgement], [true, false, '問題なし', 'ロゴあり']);
  check('volumes duoc chuyen qua cho ruleFirstVolume', ok.volumes, '1~4');

  var ng = src.buildCustomerRecord({ titleName: 'B', titleId: '200', volumes: '1' }, loaded);
  check('①=問題あり -> isNg', ng.isNg, true);

  var unjudged = src.buildCustomerRecord({ titleName: 'Z', titleId: '999', volumes: '' }, loaded);
  check('未判定 -> judged false, 3 cot de RONG (khong phai undefined)',
    [unjudged.judged, unjudged.policy, unjudged.general, unjudged.logoJudgement],
    [false, '', '', '']);
}
```

- [ ] **Step 10: Chạy test**

Run: `node tools/verify-phase1/run.js`
Expected: PASS 35/35.

- [ ] **Step 11: Commit**

```bash
git add gas_phase_1/4_customer_master.js tools/verify-phase1/tests.js
git commit -m "One row per column, and the LP rule can finally see the sheet"
```

---

## Task 6: `gas_phase_1/5_copyright_master.js`

**Files:**
- Create: `gas_phase_1/5_copyright_master.js`
- Test: `tools/verify-phase1/tests.js`

**Interfaces:**
- Consumes: `resolvePublisherCopyright`, `resolvePublisherPreConfirmation` (`3_sources.js`), `CONFIG.COPYRIGHT_HISTORY_SLOTS`
- Produces:
  - `COPYRIGHT_COLUMNS` — mảng 16 cột
  - `effectiveCopyright(record) -> string` (port từ `src/copyright.js:390`) — J nếu có, không thì K
  - `shiftCopyrightHistory(prior, priorEffective, nextEffective, slots) -> {copyrightHistory: Array}` (port từ `src/copyright.js:418`)
  - `copyrightHistoryHeaderName(slot) -> string` (port từ `src/io.js:452`) — trả `'コピーライト_過去分<slot>'`
  - `buildCopyrightRecord(work, prior) -> object` — 8 cột định danh lấy từ `work`, 2 cột bản quyền + 5 slot lịch sử tính tại đây

- [ ] **Step 1: Viết test bảng cột**

```javascript
function test_copyrightColumns(ctx) {
  var src = ctx.src, check = ctx.check;
  check('16 cot (11 + 5 slot lich su)', src.COPYRIGHT_COLUMNS.length, 16);
  check('5 slot lich su dung ten コピーライト_過去分1..5',
    src.COPYRIGHT_COLUMNS.filter(function (c) { return c.field.indexOf('history') === 0; })
      .map(function (c) { return c.header; }),
    ['コピーライト_過去分1', 'コピーライト_過去分2', 'コピーライト_過去分3',
      'コピーライト_過去分4', 'コピーライト_過去分5']);
  // Cột này chưa chắc có trên ガワ -> optional, không vào requiredHeaders.
  check('出版社事前確認 la cot tuy chon',
    src.COPYRIGHT_COLUMNS.filter(function (c) { return c.field === 'preConfirmation'; })[0].optional, true);
  check('requiredHeaders bo cot tuy chon', src.requiredHeaders(src.COPYRIGHT_COLUMNS).length, 15);
}
```

- [ ] **Step 2: Chạy để chắc nó đỏ**

Run: `node tools/verify-phase1/run.js`
Expected: FAIL — `COPYRIGHT_COLUMNS is not defined`.

- [ ] **Step 3: Viết bảng cột và port `shiftCopyrightHistory`**

Bảng 16 cột: 8 cột định danh (`titleNo`, `cmsId`, `titleId`, `titleName`, `author`, `genre`, `publisher`, `label`) đều `from:'customer'` / `write:'上書'`; `individualCopyright` và `publisherCopyright` `from:'derive'` / `write:'上書'`; `preConfirmation` thêm `optional:true`; 5 slot `history1..history5` `from:'derive'` / `write:'上書'`.

`shiftCopyrightHistory` chép nguyên văn từ `src/copyright.js`, không đổi logic.

**Không** đưa 5 slot lịch sử vào phép so diff: chúng là hệ quả của việc bản quyền đổi, không phải nguyên nhân — so chúng sẽ tạo vòng "đổi lịch sử → ghi → đọc lại → thấy đổi". Cài bằng `write:'上書'` nhưng thêm `skipCompare:true`, và sửa `recordsEqual` trong engine bỏ qua cột có cờ đó.

> ⚠️ `skipCompare` là trường thứ hai ngoài `write` — đúng loại thứ tôi vừa bỏ đi ở Task 3. Nhưng nó khác về chất: `skipCompare` nói *cột này không tham gia quyết định có ghi hay không*, chứ không nói *ghi kiểu gì*. Vẫn phải thêm test khẳng định không cột nào của `CUSTOMER_COLUMNS` dùng nó.

- [ ] **Step 4: Thêm `skipCompare` vào engine**

Sửa `recordsEqual` trong `shared/engine.js`:

```javascript
function recordsEqual(existing, incoming, columns) {
  for (var i = 0; i < columns.length; i++) {
    if (columns[i].skipCompare === true) continue;
    var compare = compareFor(columns[i]);
    if (compare === null) continue;
    if (!compare(existing[columns[i].field], incoming[columns[i].field])) return false;
  }
  return true;
}
```

Thêm test vào `tools/verify-engine/tests.js`:

```javascript
check('skipCompare: cot khong tham gia quyet dinh co ghi hay khong',
  src.recordsEqual({ a: 1, h: 'cu' }, { a: 1, h: 'moi' },
    [{ header: 'A', field: 'a', write: '上書' },
     { header: 'H', field: 'h', write: '上書', skipCompare: true }]), true);
```

- [ ] **Step 5: Chạy cả 2 suite**

Run: `node tools/sync-shared.js && node tools/verify-engine/run.js && node tools/verify-phase1/run.js`
Expected: cả hai PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/engine.js gas_phase_1/5_copyright_master.js gas_phase_1/8_engine.js gas_phase_2/8_engine.js tools/verify-engine tools/verify-phase1
git commit -m "Keep copyright history out of the decision to write it"
```

---

## Task 7: `gas_phase_1/6_matching.js`

Port nguyên trạng, không đổi logic. Đây là phần đã được mô phỏng 4 lần chạy liên tiếp trên dữ liệu thật và ra kết quả ổn định — **không đụng vào**.

**Files:**
- Create: `gas_phase_1/6_matching.js`
- Test: `tools/verify-phase1/tests.js`

**Interfaces:**
- Produces: `isWorkEligible(work)` · `filterAndMatchWorks(works, existingRecords) -> {matches, orphanOffsets, excludedNg, excludedUnjudged}` · `matchExistingRow` · `claimMatch` · `buildMasterMatchIndex` · `collectOrphanOffsets` · `resolveNumbersFromMatches(matches, existingRecords, numberField)` · `diffUpsertFromMatches(matches, isEqualFn) -> {toAdd, toUpdate, unchangedKeys}` · `diffUpsert(existing, incoming, keyFn, isEqualFn)`

- [ ] **Step 1: Chép test cascade sẵn có**

Chép nguyên văn `test_cascade` và `test_filter` từ `tools/verify/tests.js` sang `tools/verify-phase1/tests.js`. Chúng đã phủ đủ 3 tầng + chiếm-một-lần + 孤立行.

- [ ] **Step 2: Chạy để chắc nó đỏ**

Run: `node tools/verify-phase1/run.js`
Expected: FAIL — `filterAndMatchWorks is not a function`.

- [ ] **Step 3: Port**

Chép từ `src/master.js` phần 2 và phần 3 (dòng ~152 đến ~640 của bản working tree), chỉ cắt comment. Đổi `diffUpsertFromMatches` để nhận `columns` thay vì `isEqualFn`:

```javascript
/** Phân loại thêm mới / cần update / không đổi, dùng bảng cột thay cho isEqualFn. */
function diffUpsertFromMatches(matches, columns) {
  var toAdd = [];
  var toUpdate = [];
  var unchangedKeys = [];
  matches.forEach(function (match) {
    if (match.existing === null) { toAdd.push(match.record); return; }
    if (recordsEqual(match.existing, match.record, columns)) {
      unchangedKeys.push(match.record.titleNo);
      return;
    }
    toUpdate.push({ record: match.record, previous: match.existing, sheetRow: match.existing.sheetRow });
  });
  return { toAdd: toAdd, toUpdate: toUpdate, unchangedKeys: unchangedKeys };
}
```

- [ ] **Step 4: Chạy test**

Run: `node tools/verify-phase1/run.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gas_phase_1/6_matching.js tools/verify-phase1/tests.js
git commit -m "Port the matching cascade unchanged, minus the essays"
```

---

## Task 8: `gas_phase_1/7_warnings.js`

**Files:**
- Create: `gas_phase_1/7_warnings.js`
- Test: `tools/verify-phase1/tests.js`

**Interfaces:**
- Produces: 13 hàm `build*WarningRows(...)` + `warningRow(runAt, kind, titleNo, titleId, titleName, detail)` + 13 hằng `WARNING_KIND_*` + `buildAllWarnings(ctx) -> Array<object>`

- [ ] **Step 1: Chép test cảnh báo sẵn có**

Chép `test_warnings` từ `tools/verify/tests.js`. Sửa lời gọi `buildLpProductionWarningRows` sang chữ ký nhận `matches` (đã đổi trong working tree).

- [ ] **Step 2: Chạy để chắc nó đỏ**

Run: `node tools/verify-phase1/run.js`
Expected: FAIL.

- [ ] **Step 3: Port 13 hàm + gom vào `buildAllWarnings`**

Chép từ `src/master.js` phần 4. Thêm hàm gom để `9_main.js` chỉ gọi một dòng:

```javascript
/** Gom cả 13 loại thành 1 mảng, để main chỉ gọi một dòng và ghi một lần. */
function buildAllWarnings(ctx) {
  return buildMatchWarningRows(ctx.matches, ctx.runAt)
    .concat(buildOrphanWarningRows(ctx.existingCustomerRows, ctx.orphanOffsets, ctx.runAt))
    .concat(buildNgTitleWarningRows(ctx.records, ctx.ngTitleLookup, ctx.runAt))
    .concat(buildSuspensionWarningRows(ctx.records, ctx.suspensionLookup, ctx.suspensionFileName, ctx.runAt, ctx.errors.suspension))
    .concat(buildCopyrightWarningRows(ctx.copyrightWarnings, ctx.runAt, ctx.errors.publisherCopyright))
    .concat(buildPreEndExtensionWarningRows(ctx.records, ctx.preEndLookup, ctx.runAt, ctx.errors.preEnd))
    .concat(buildMassFreeWarningRows(ctx.records, ctx.massFreeLookup, ctx.runAt, ctx.errors.massFree))
    .concat(buildTitleCategoryWarningRows(ctx.records, ctx.commitLookup, ctx.runAt, ctx.errors.commit))
    .concat(buildLpProductionWarningRows(ctx.matches, ctx.runAt))
    .concat(buildRegulationLostWarningRows(ctx.matches, ctx.runAt))
    .concat(buildPreConfirmationWarningRows(ctx.hasPreConfirmationColumn, ctx.publisherCopyrightRules || [], ctx.runAt))
    .concat(buildUpdatedAtWarningRows(ctx.stamps, ctx.runAt));
}
```

- [ ] **Step 4: Chạy test**

Run: `node tools/verify-phase1/run.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gas_phase_1/7_warnings.js tools/verify-phase1/tests.js
git commit -m "Gather the thirteen warnings behind one call"
```

---

## Task 9: `gas_phase_1/9_main.js` — nhạc trưởng ~60 dòng

**Files:**
- Create: `gas_phase_1/9_main.js`
- Test: (không có test đơn vị — `main.js` gọi API Apps Script; kiểm bằng `probe_*` chạy tay và bằng parity ở Task 11)

**Interfaces:**
- Consumes: mọi thứ ở Task 4–8, `readSheetValues`/`resolveMasterHeader`/`stampUpdatedAt` (`2_sheet.js`)
- Produces: `runGas1()` · `createGas1Trigger()` · `probe_dryRunFilter()` · `probe_readCustomerMasterHeader()` · `probe_readCopyrightMasterHeader()`

- [ ] **Step 1: Viết `runGas1()`**

12 bước theo đúng thứ tự spec §2 và §8 của tài liệu tham chiếu. Ba ràng buộc thứ tự **không được đảo**: đọc master trước khi lọc; cấp `タイトルNo` sau khi lọc và trước khi build コピーライトマスタ.

```javascript
/**
 * GAS❶ — đọc nguồn, lọc theo レギュレーション, ghi 2 master, log + cảnh báo.
 *
 * THỨ TỰ 3 BƯỚC KHÔNG ĐƯỢC ĐẢO (xem docs/decisions.md #order-01):
 *   đọc master  ->  lọc  ->  cấp タイトルNo  ->  build コピーライトマスタ
 */
function runGas1() {
  var startedAt = new Date();
  var errors = [];
  Logger.log('GAS❶ 開始: ' + startedAt.toISOString());

  try {
    var loaded = loadSources(startedAt);
    var existingCustomer = readMaster(CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER, CUSTOMER_COLUMNS);
    var works = loaded.values.cms.map(function (cms) {
      return buildCustomerRecord(cms, loaded);
    });

    var filtered = filterAndMatchWorks(works, existingCustomer.records);
    applyRules(filtered.matches, CUSTOMER_COLUMNS, loaded);
    var matches = resolveNumbersFromMatches(filtered.matches, existingCustomer.records, 'titleNo');
    var customerDiff = diffUpsertFromMatches(matches, CUSTOMER_COLUMNS);

    var existingCopyright = readMaster(CONFIG.OUTPUTS.COPYRIGHT_MASTER, COPYRIGHT_COLUMNS);
    var copyrightDiff = buildCopyrightDiff(matches, existingCopyright);

    var runAt = new Date();
    var customerStamp = writeMaster(CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER, CUSTOMER_COLUMNS, customerDiff, runAt);
    var copyrightStamp = writeMaster(CONFIG.OUTPUTS.COPYRIGHT_MASTER, COPYRIGHT_COLUMNS, copyrightDiff, runAt);

    appendChangeDetailRows(buildChangeDetailRows('顧客作品マスタ', customerDiff.toUpdate, CUSTOMER_COLUMNS, runAt)
      .concat(buildChangeDetailRows('コピーライトマスタ', copyrightDiff.toUpdate, COPYRIGHT_COLUMNS, runAt)));
    appendWarningRows(buildAllWarnings({
      matches: matches, existingCustomerRows: existingCustomer.records,
      orphanOffsets: filtered.orphanOffsets, records: matches.map(recordOf),
      errors: loaded.errors, runAt: runAt,
      stamps: [{ label: '顧客作品マスタ', cell: customerStamp }, { label: 'コピーライトマスタ', cell: copyrightStamp }],
    }));

    notifyIrregular(matches);
    appendLogEntry(buildLogEntry(startedAt, filtered, customerDiff, errors));
    Logger.log('GAS❶ 完了');
  } catch (error) {
    Logger.log('GAS❶ エラーで中断: ' + String(error));
    errors.push(String(error));
    notifySlack('GAS❶ 実行エラー: ' + String(error));
    appendLogEntry(buildLogEntry(startedAt, null, null, errors));
    throw error;
  }
}
```

`runGas1()` gọi 8 hàm chưa tồn tại. Step 2–4 viết chúng.

- [ ] **Step 2: Viết `readMaster` + `writeMaster` vào `shared/engine.js`**

Hai hàm này thay cho 4 hàm hiện tại (`readCustomerWorkMaster`, `writeCustomerWorkMaster`,
`readCopyrightMaster`, `writeCopyrightMaster` ở `src/io.js`) — chúng khác nhau chỉ ở
danh sách cột, mà giờ danh sách cột là tham số.

```javascript
/** Đọc mọi dòng dữ liệu của một master. Bỏ dòng không có タイトル名. */
function readMaster(outputConfig, columns) {
  var resolved = resolveMasterHeader(outputConfig.spreadsheetId, outputConfig.sheetName,
    requiredHeaders(columns));
  var nameIndex = resolved.headerIndex.get(normalizeHeaderText('タイトル名'));
  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < resolved.values.length; i++) {
    var row = resolved.values[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[nameIndex]) === '') continue;
    records.push(readRecord(row, resolved.headerIndex, columns, i + 1));
  }
  resolved.records = records;
  return resolved;
}

/** Ghi kết quả diff vào master. KHÔNG BAO GIỜ xoá dòng. Trả ô 更新日 đã đóng dấu. */
function writeMaster(outputConfig, columns, diffResult, runAt) {
  var resolved = resolveMasterHeader(outputConfig.spreadsheetId, outputConfig.sheetName,
    requiredHeaders(columns));
  var sheet = resolved.sheet;
  var width = resolved.columnCount;

  diffResult.toUpdate.forEach(function (item) {
    var values = toSheetRow(item.record, resolved.headerIndex, width, columns, item.previous.rawRow);
    sheet.getRange(item.sheetRow, 1, 1, width).setValues([values]);
  });

  if (diffResult.toAdd.length > 0) {
    var startRow = Math.max(sheet.getLastRow(), resolved.headerRowIndex + 1) + 1;
    var rows = diffResult.toAdd.map(function (record) {
      return toSheetRow(record, resolved.headerIndex, width, columns, undefined);
    });
    sheet.getRange(startRow, 1, rows.length, width).setValues(rows);
  }

  return stampUpdatedAt(sheet, resolved.values, resolved.headerRowIndex, runAt);
}
```

Đóng dấu `更新日` ở CUỐI, tức chỉ khi mọi dòng đã ghi xong — ô đó nói "dữ liệu bên dưới
cập nhật tới lúc này", nên đóng dấu trước khi ghi là nói dối nếu bước ghi throw giữa
chừng. Đóng dấu KỂ CẢ khi diff rỗng: "chạy mà không có gì đổi" khác hẳn "GAS chết từ
hôm kia".

- [ ] **Step 3: Viết `applyRules` vào engine + test**

```javascript
/** Chạy rule của mọi cột derive, và áp cờ keep cho cột có nguồn lỗi. */
function applyRules(matches, columns, loaded) {
  matches.forEach(function (match) {
    columns.forEach(function (column) {
      var sourceKey = column.from.indexOf('lookup:') === 0 ? column.from.slice(7) : null;
      if (column.keep === true && sourceKey !== null && loaded.errors[sourceKey] !== null) {
        match.record[column.field] = match.existing ? match.existing[column.field] : '';
        return;
      }
      if (column.from === 'derive') {
        match.record[column.field] = column.rule(match.record, match.existing);
      }
    });
  });
}
```

Test: cột `keep:true` + nguồn lỗi → lấy `existing`; dòng mới → `''`; cột `derive` luôn được tính lại kể cả khi nguồn khác lỗi.

- [ ] **Step 4: Viết 4 hàm phụ trợ còn lại trong `9_main.js`**

```javascript
/** Rút record ra khỏi match — dùng cho các hàm cảnh báo nhận mảng record. */
function recordOf(match) { return match.record; }

/**
 * Build コピーライトマスタ từ chính danh sách đã lọc, khoá là タイトルNo.
 * Master này không có cột nào dùng làm khoá được (2 tác phẩm có thể chung タイトルID)
 * nên nó dùng chung số với 顧客作品マスタ. Xem docs/decisions.md #order-01
 */
function buildCopyrightDiff(matches, existingCopyright) {
  var priorByNo = new Map();
  existingCopyright.records.forEach(function (r) { priorByNo.set(String(r.titleNo), r); });

  var incoming = matches.map(function (match) {
    var prior = priorByNo.get(String(match.record.titleNo)) || null;
    return buildCopyrightRecord(match.record, prior);
  });

  return diffUpsert(existingCopyright.records, incoming,
    function (r) { return String(r.titleNo); },
    function (a, b) { return recordsEqual(a, b, COPYRIGHT_COLUMNS); });
}

/** Báo Slack các tác phẩm không có bản quyền nào dùng được (cả 2 cột đều rỗng). */
function notifyIrregular(matches) {
  var irregular = [];
  matches.forEach(function (match) {
    if (normalizeJapaneseText(effectiveCopyright(match.record)) !== '') return;
    irregular.push(match.record.titleId + ' ' + match.record.titleName);
  });
  if (irregular.length === 0) return;
  Logger.log('個別対応（コピーライト無し）: ' + irregular.length + ' 件');
  notifySlack('GAS❶: ' + irregular.length
    + '件のタイトルが個別対応(コピーライト特定不可)になりました:\n' + irregular.join('\n'));
}

/** Dòng log tổng hợp cho tab GAS1ログ. `filtered`/`diff` là null khi lần chạy lỗi. */
function buildLogEntry(startedAt, filtered, diff, errors) {
  return {
    startedAt: startedAt,
    finishedAt: new Date(),
    addedCount: diff ? diff.toAdd.length : 0,
    updatedCount: diff ? diff.toUpdate.length : 0,
    excludedNgCount: filtered ? filtered.excludedNg.length : 0,
    excludedUnjudgedCount: filtered ? filtered.excludedUnjudged.length : 0,
    errors: errors,
  };
}
```

`effectiveCopyright` port từ `src/copyright.js:390`; `diffUpsert` từ Task 7;
`buildCopyrightRecord` từ Task 6; `appendLogEntry` / `appendChangeDetailRows` /
`appendWarningRows` / `notifySlack` port nguyên văn từ `src/io.js` vào `9_main.js`.

- [ ] **Step 5: Đổi `buildChangeDetailRows` sang nhận bảng cột**

Hiện nó nhận `fieldDefs` là mảng `{key, label, compare}` riêng — một danh sách thứ ba
phải giữ khớp tay với bảng cột. Bảng cột đã có đủ cả ba thứ, nên nhận thẳng nó:

```javascript
/** Log từng field THỰC SỰ đổi vào tab GAS1変更詳細. 1 field đổi = 1 dòng. */
function buildChangeDetailRows(masterLabel, toUpdateItems, columns, runAt) {
  var rows = [];
  toUpdateItems.forEach(function (item) {
    columns.forEach(function (column) {
      if (column.skipCompare === true) return;
      var compare = compareFor(column);
      if (compare === null) return;
      var oldValue = item.previous[column.field];
      var newValue = item.record[column.field];
      if (compare(oldValue, newValue)) return;
      rows.push({
        runAt: runAt, master: masterLabel,
        titleNo: item.record.titleNo, titleName: item.record.titleName,
        field: column.header, oldValue: oldValue, newValue: newValue,
      });
    });
  });
  return rows;
}
```

Đây là chỗ thứ ba mà `write` giờ quyết định thay: trước đây `fieldDefs` khai báo
`compare` riêng, và khi nó lệch với `customerIsEqualFn` thì log ghi
`'必要 -> (trống)'` cho những ô thật ra không hề bị đổi.

- [ ] **Step 6: Chạy toàn bộ suite**

Run: `node tools/verify-engine/run.js && node tools/verify-phase1/run.js && node tools/verify-layout/run.js`
Expected: tất cả PASS.

- [ ] **Step 7: Commit**

```bash
git add gas_phase_1/9_main.js shared/engine.js gas_phase_1/8_engine.js gas_phase_2/8_engine.js tools/verify-engine/tests.js
git commit -m "Reduce the conductor to the twelve steps it conducts"
```

---

## Task 10: Parity harness — bằng chứng bản mới đúng

**Files:**
- Create: `tools/parity/run.js`

**Interfaces:**
- Consumes: `src/*.js` (bản cũ) và `gas_phase_1/*.js` (bản mới), cả hai nạp vào 2 `vm` context riêng; fixtures ở `tools/verify/fixtures/`
- Produces: exit 0 nếu mọi khác biệt đều nằm trong danh sách kỳ vọng

- [ ] **Step 1: Viết harness**

```javascript
// tools/parity/run.js — chạy bản CŨ và bản MỚI trên cùng fixtures rồi diff từng field.
//
// Không có nó thì "bản mới đã đúng chưa" chỉ là niềm tin. Có nó thì mỗi khác biệt
// phải được giải thích. Chạy: node tools/parity/run.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const OLD = ['src/common.js', 'src/masterHeaders.js', 'src/config.js', 'src/sources.js',
  'src/master.js', 'src/copyright.js'];
const NEW = ['gas_phase_1/1_common.js', 'gas_phase_1/0_config.js', 'gas_phase_1/8_engine.js',
  'gas_phase_1/3_sources.js', 'gas_phase_1/4_customer_master.js',
  'gas_phase_1/5_copyright_master.js', 'gas_phase_1/6_matching.js'];

// 3 khác biệt CÓ CHỦ ĐÍCH. Mọi khác biệt ngoài danh sách này là lỗi port.
const EXPECTED = {
  regulationCascade: { fields: ['policy', 'general', 'logoJudgement'], max: 313 },
  lpProductionFix:   { fields: ['lpProduction'], max: 13 },
  firstVolumeNew:    { fields: ['firstVolume'], max: Infinity },
};

function load(files) {
  const ctx = { Logger: { log: function () {} }, Map: Map, Date: Date, JSON: JSON, Math: Math };
  vm.createContext(ctx);
  files.forEach(function (rel) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  });
  return ctx;
}

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/verify/fixtures', name + '.json'), 'utf8'));
}

const oldCtx = load(OLD);
const newCtx = load(NEW);

const cmsRaw = fixture('cms');
const regRaw = fixture('regulation');

const oldWorks = oldCtx.buildCustomerWorkRows(oldCtx.parseCmsRows(cmsRaw),
  oldCtx.buildRegulationIndex(oldCtx.parseRegulationRows(regRaw)))
  .filter(function (w) { return oldCtx.isWorkEligible(w); });

const newLoaded = { values: { regulation: newCtx.buildRegulationIndex(newCtx.parseRegulation(regRaw)) },
  errors: { regulation: null } };
const newWorks = newCtx.parseCms(cmsRaw)
  .map(function (cms) { return newCtx.buildCustomerRecord(cms, newLoaded); })
  .filter(function (w) { return newCtx.isWorkEligible(w); });

console.log('cu: ' + oldWorks.length + ' record | moi: ' + newWorks.length + ' record');
if (oldWorks.length !== newWorks.length) {
  console.log('FAIL: so record khac nhau — port sai o buoc loc');
  process.exit(1);
}

const diffs = {};
let unexpected = 0;
for (let i = 0; i < oldWorks.length; i++) {
  Object.keys(newWorks[i]).forEach(function (field) {
    if (field === 'rawRow' || field === 'sheetRow' || field === 'regulationTier') return;
    const a = oldWorks[i][field];
    const b = newWorks[i][field];
    if (String(a === undefined ? '' : a) === String(b === undefined ? '' : b)) return;
    diffs[field] = (diffs[field] || 0) + 1;
  });
}

Object.keys(diffs).forEach(function (field) {
  const allowed = Object.keys(EXPECTED).some(function (k) {
    return EXPECTED[k].fields.indexOf(field) >= 0 && diffs[field] <= EXPECTED[k].max;
  });
  console.log((allowed ? 'OK   ' : 'FAIL ') + field + ': ' + diffs[field] + ' record khac');
  if (!allowed) unexpected += 1;
});

console.log(unexpected === 0 ? 'parity OK — moi khac biet deu co chu dich' : unexpected + ' field khac biet ngoai du kien');
process.exit(unexpected === 0 ? 0 : 1);
```

- [ ] **Step 2: Chạy**

Run: `node tools/parity/run.js`
Expected: `parity OK`. Nếu có field lạ, **dừng lại và tìm nguyên nhân** — đừng thêm nó vào `EXPECTED` cho hết đỏ.

- [ ] **Step 3: Commit**

```bash
git add tools/parity
git commit -m "Prove the new pipeline differs only where we meant it to"
```

---

## Task 11: `gas_phase_2`

**Files:**
- Create: `gas_phase_2/3_sources.js`, `gas_phase_2/4_title_master.js`, `gas_phase_2/9_main.js`
- Test: `tools/verify-phase2/run.js`, `tools/verify-phase2/tests.js`

**Interfaces:**
- Produces: `TITLE_MASTER_COLUMNS` (25 cột — 24 cũ + `初回配信巻数`), `runGas2()`, `createGas2Trigger()`

- [ ] **Step 1: Chép test GAS❷ sẵn có**

Chép `tools/verify-gas2/tests.js` sang `tools/verify-phase2/tests.js`, đổi lời gọi sang bảng cột mới.

- [ ] **Step 2: Chạy để chắc nó đỏ**

Run: `node tools/verify-phase2/run.js`
Expected: FAIL.

- [ ] **Step 3: Port bảng cột**

Chép 24 dòng `TITLE_MASTER_COLUMNS` từ `gas2/titleMaster.js:26-49`, đổi khoá `source`→`from` và `compare`→bỏ (suy từ `write`). Thêm một dòng ngay sau `タイトル名`:

```javascript
{ header: '初回配信巻数', field: 'firstVolume', from: 'customer', write: '上書' },
```

`マスタ追加日` giữ nguyên tên cũ — bug đổi tên cột nằm ngoài phạm vi (spec §9.1), port nguyên trạng.

- [ ] **Step 4: Port `3_sources.js` và `9_main.js`**

Đọc 2 master của GAS❶ qua `readMaster()` của engine. Guard chống chạy sớm (so `更新日` với hôm nay) giữ nguyên. Thêm `firstVolume` vào record đọc từ 顧客作品マスタ.

- [ ] **Step 5: Chạy test**

Run: `node tools/verify-phase2/run.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add gas_phase_2 tools/verify-phase2
git commit -m "Give GAS2 the same column table and the shared engine"
```

---

## Task 12: `docs/decisions.md`

**Files:**
- Create: `docs/decisions.md`
- Modify: `docs/3-master-cot-nguon-va-logic.md` (thêm dòng trỏ sang bản mới)

- [ ] **Step 1: Viết `docs/decisions.md`**

Mỗi quyết định một mục có anchor, để comment trong code trỏ tới được. Tối thiểu 12 mục, gom từ comment dài đã cắt:

`#engine-01` write quyết định compare · `#engine-02` dựng dòng từ bản copy · `#order-01` ba ràng buộc thứ tự · `#cascade-01` vì sao 2 cascade khác thứ tự tầng · `#cascade-02` vì sao dùng NUL làm dấu ngăn · `#cascade-03` vì sao không cắt hậu tố / không fuzzy · `#lp-01` ③ có hiệu lực · `#volume-01` vì sao regex chỉ cần `~` · `#volume-02` 5 ô bị Sheets nuốt thành ngày · `#sources-01` bắt buộc vs phụ · `#sources-02` vì sao "giữ nguyên" chứ không "coi như rỗng" · `#compare-01` vì sao 4 hàm so sánh không đối xứng · `#warn-01` vì sao cố tình không báo "không tìm thấy trên nguồn"

- [ ] **Step 2: Kiểm mọi anchor được trỏ tới đều tồn tại**

```bash
grep -rho "docs/decisions.md #[a-z0-9-]*" gas_phase_1 gas_phase_2 shared \
  | sed 's/.*#//' | sort -u \
  | while read a; do grep -q "^#### $a\|{#$a}\|<a id=\"$a\">" docs/decisions.md \
      || echo "THIEU anchor: $a"; done
```

Expected: không in ra gì.

- [ ] **Step 3: Kiểm không còn chữ cái cột trong code**

```bash
grep -rnE "(列[A-V]|[A-V]列|cột [A-V]\b)" gas_phase_1 gas_phase_2 shared --include=*.js
```

Expected: không có kết quả. (Trừ `列` trong tên header thật như `①広告出稿ポリシー` — nếu có hit, kiểm bằng mắt.)

- [ ] **Step 4: Commit**

```bash
git add docs/decisions.md docs/3-master-cot-nguon-va-logic.md
git commit -m "Move the reasoning out of the code and give it addresses"
```

---

## Task 13: Nghiệm thu

- [ ] **Step 1: Chạy toàn bộ**

```bash
node tools/sync-shared.js --check \
  && node tools/verify-layout/run.js \
  && node tools/verify-engine/run.js \
  && node tools/verify-phase1/run.js \
  && node tools/verify-phase2/run.js \
  && node tools/parity/run.js \
  && node tools/verify/run.js --data \
  && node tools/verify-gas2/run.js
```

Expected: tất cả exit 0. Hai lệnh cuối là suite CŨ — chúng phải vẫn xanh, vì `src/` và `gas2/` không bị đụng.

- [ ] **Step 2: Kiểm tiêu chí "thêm cột chỉ sửa 1 dòng"**

Thêm thử một cột giả `{ header:'テスト列', field:'testCol', from:'cms', write:'上書' }` vào `CUSTOMER_COLUMNS`, chạy `node tools/verify-phase1/run.js`, xác nhận **không phải sửa file nào khác** ngoài dòng vừa thêm và con số `21` trong test. Rồi xoá dòng đó đi.

- [ ] **Step 3: Đếm dòng**

```bash
wc -l gas_phase_1/*.js gas_phase_2/*.js | tail -1
```

Expected: tổng < 4.000 (bản cũ `src/` + `gas2/` là 7.231).

- [ ] **Step 4: Push thử lên script ID mới**

```bash
cd gas_phase_1 && npx @google/clasp push --force && cd ..
```

Rồi mở Apps Script editor của project mới, chạy tay `probe_readCustomerMasterHeader()` — kỳ vọng in ra `ヘッダー行: 15 行目`.

⚠️ **Chưa cài trigger.** Chỉ chạy tay `runGas1()` một lần trên project mới và đối chiếu output với sheet do bản cũ ghi, trước khi user tự quyết định chuyển hẳn.

- [ ] **Step 5: Commit cuối**

```bash
git add -A
git commit -m "Finish the move; the old projects are still standing"
```

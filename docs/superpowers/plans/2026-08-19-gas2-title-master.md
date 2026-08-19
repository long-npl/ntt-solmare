# GAS❷ タイトルマスタ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng GAS❷ — một Apps Script project riêng đọc `顧客作品マスタ` + `コピーライトマスタ` (2 output của GAS❶) và ghi 24 trong 36 cột của `タイトルマスタ` bằng cơ chế diff theo khoá `タイトルNo`.

**Architecture:** Thư mục `gas2/` trong repo này, `.clasp.json` riêng → project Apps Script độc lập với GAS❶. Chia 3 tầng như GAS❶ đã chia: `sources.js` + `titleMaster.js` là **hàm thuần** (nhận mảng 2 chiều, trả mảng — test được bằng Node), `io.js` là **chỗ duy nhất gọi Google API**, `main.js` là tầng dàn dựng. `common.js` là bản copy của `src/common.js` (Apps Script không import chéo project).

**Tech Stack:** Google Apps Script (V8, `var` + ES5 function, KHÔNG dùng `let/const/arrow` — xem Global Constraints), clasp, harness test Node thuần (`vm` + `require`, không framework), openpyxl để export fixture.

**Spec:** [docs/superpowers/specs/2026-08-19-gas2-title-master-design.md](../specs/2026-08-19-gas2-title-master-design.md)

## Global Constraints

- **Cú pháp:** ES5 style như toàn bộ `src/` — `var`, `function`, không arrow function, không `let/const`, không template literal. Apps Script V8 hỗ trợ ES6 nhưng codebase hiện tại nhất quán ES5; đừng làm lệch.
- **Không `module.exports` trong `gas2/*.js`:** Apps Script share 1 global scope. Harness nạp file qua `vm.runInContext` rồi đọc property của global object.
- **Tên header phải copy BYTE-CHÍNH-XÁC** từ sheet thật. `normalizeHeaderText()` **chỉ bỏ khoảng trắng và xuống dòng**, KHÔNG làm NFKC — nên ngoặc full-width `（）` và half-width `()` là **hai thứ khác nhau**. Giá trị đúng đã kiểm trên file thật:
  - `'タイトル個別コピーライト(あれば優先使用)'` → ngoặc **half-width**
  - `'先行終了日（延長）'`, `'先行終了日（最終確定）'` → ngoặc **full-width**
  - `'CMS ID'` → có 1 space thường (normalize bỏ đi, viết sao cũng khớp)
- **3 header có `\n`** trên sheet (`初回配信\n巻数`, `先行終了日\n（延長）`, `先行終了日\n（最終確定）`) — viết liền không xuống dòng trong code, `normalizeHeaderText()` lo phần còn lại.
- **KHÔNG BAO GIỜ hardcode chữ cái cột hay số hàng.** Mọi truy cập cột qua `col(headerIndex, 'tên')`; hàng header dò bằng `findHeaderRowIndex()`.
- **Không ghi gì lên Google Sheets khi chạy test.** Toàn bộ test là Node thuần trên fixture JSON export từ `example/*.xlsx`.
- **Spreadsheet ID:**
  - Nguồn chính: `1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU` / sheet `顧客作品マスタ`
  - Nguồn phụ: `1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc` / sheet `コピーライトマスタ`
  - Output: `16Fw9KrvKskewy9OAWqPegYXvhOkRPywatd512Ncn4rI` / sheet `タイトルマスタ`
  - scriptId GAS❷: `1hI2TqTyvB-D7KEoDSXcWtUx4mCG0HfiG-c5x551ovrGApqWzlEdAJZlU`
- **24 cột GAS❷ ghi** — 23 copy nguyên văn + `E マスタ追加日` write-once. **12 cột KHÔNG đụng:** `M タイトルキー`, `N 初回配信巻数`, `AB~AK 掲出可能媒体` (10 cột).
- **Chạy test:** `node tools/verify-gas2/run.js` (thêm `--data` để chạy nhóm đối chiếu fixture thật).

---

### Task 1: Bộ khung `gas2/` + harness test

**Files:**
- Create: `gas2/.clasp.json`
- Create: `gas2/appsscript.json`
- Create: `gas2/.claspignore`
- Create: `gas2/config.js`
- Create: `gas2/common.js` (copy của `src/common.js`)
- Create: `tools/verify-gas2/run.js`
- Create: `tools/verify-gas2/tests.js`

**Interfaces:**
- Consumes: không có (task đầu tiên)
- Produces: global `CONFIG` (object, xem code bên dưới); toàn bộ hàm thuần của `src/common.js` với ĐÚNG tên cũ — `normalizeHeaderText(value)`, `findHeaderRowIndex(rawRows, names)`, `buildHeaderIndex(headerRow)`, `resolveHeaderIndex(rawRows, names)`, `col(headerIndex, name)`, `tryCol(headerIndex, name)`, `columnIndexToLetter(index)`, `normalizeJapaneseText(value)`, `normalizeForCompare(value)`, `sameValue(a, b)`, `sameDateValue(a, b)`, `sameWriteOnceValue(existing, incoming)`, `toDateOrNull(value)`, `toDateKey(value)`, `isDigits(value)`; lệnh chạy test `node tools/verify-gas2/run.js`

- [ ] **Step 1: Copy `common.js` và dán ghi chú nguồn gốc lên đầu**

```bash
cp src/common.js gas2/common.js
```

Chèn khối này vào NGAY DÒNG ĐẦU của `gas2/common.js`, phía trên mọi comment sẵn có:

```js
// ⚠️ FILE NÀY LÀ BẢN COPY CỦA src/common.js (GAS❶) — đồng bộ ngày 2026-08-19.
//
// KHÔNG sửa trực tiếp ở đây. Sửa src/common.js trước, rồi copy lại nguyên file và
// cập nhật ngày ở dòng trên.
//
// Vì sao copy chứ không dùng chung: Apps Script không cho project này import project
// kia. Tách thành Apps Script Library thì mỗi lần sửa 1 hàm thuần phải deploy version
// mới của library rồi nâng version ở cả 2 project — quá nhiều nghi thức cho vài hàm
// chuẩn hoá chuỗi. Cái giá của bản copy là phải nhớ đồng bộ tay; dòng ngày ở trên là
// thứ duy nhất cho biết nó đã trôi khỏi bản gốc bao lâu.
```

- [ ] **Step 2: Viết `gas2/config.js`**

```js
// gas2/config.js — spreadsheet ID, tên sheet, hằng số dùng chung cho GAS❷.
//
// Cùng nguyên tắc với src/config.js: file này KHÔNG chứa logic. Đổi 1 spreadsheet
// nguồn/output chỉ phải sửa đúng 1 chỗ.
//
// KHÁC GAS❶ ở một điểm quan trọng: 2 spreadsheet trong SOURCES chính là 2 OUTPUTS của
// GAS❶ (xem src/config.js: CONFIG.OUTPUTS). Đổi ID ở bên kia mà quên đổi ở đây thì
// GAS❷ vẫn chạy trơn tru trên master cũ và không có gì báo — nên khi đổi, sửa cả 2.

var CONFIG = {
  SOURCES: {
    // Nguồn CHÍNH. Đọc không được -> dừng, không ghi gì (xem runGas2 trong main.js).
    CUSTOMER_WORK_MASTER: {
      spreadsheetId: '1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU',
      sheetName: '顧客作品マスタ',
    },
    // Nguồn PHỤ. Đọc không được -> giữ nguyên 3 cột S/T/AA đang có trên タイトルマスタ và
    // vẫn chạy tiếp. Bắt buộc phải vậy: S/T là cột GAS❷ ghi đè hoàn toàn, coi "không đọc
    // được" = "rỗng" sẽ xoá sạch copyright của toàn bộ tác phẩm chỉ vì một lần mất quyền
    // truy cập — mà copyright sai là đúng loại tai nạn dự án này sinh ra để chặn.
    COPYRIGHT_MASTER: {
      spreadsheetId: '1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc',
      sheetName: 'コピーライトマスタ',
    },
  },
  OUTPUTS: {
    TITLE_MASTER: {
      spreadsheetId: '16Fw9KrvKskewy9OAWqPegYXvhOkRPywatd512Ncn4rI',
      sheetName: 'タイトルマスタ',
    },
  },
  // 9:30 và 17:30 — đi sau GAS❶ (9:00/17:00) 30 phút để đọc được master vừa cập nhật.
  //
  // LƯU Ý VỀ ĐỘ CHÍNH XÁC: trigger theo ngày của Apps Script chỉ có nearMinute(), tức
  // Google chạy trong khoảng ±15 phút quanh mốc này. Không có cách đặt đúng phút cho
  // trigger everyDays(). Chấp nhận được vì GAS❷ không có ràng buộc thời gian cứng nào.
  TRIGGER_HOURS: [9, 17],
  TRIGGER_MINUTE: 30,
  TRIGGER_TIMEZONE: 'Asia/Tokyo',
  // Tên 2 Script Property chứa token/channel Slack. KHÔNG hardcode giá trị thật ở đây —
  // điền qua Apps Script editor > Project Settings > Script Properties.
  SLACK_PROPERTY_KEYS: {
    BOT_TOKEN: 'SLACK_BOT_TOKEN',
    CHANNEL_ID: 'SLACK_CHANNEL_ID',
  },
};
```

- [ ] **Step 3: Viết `gas2/.clasp.json`, `gas2/appsscript.json`, `gas2/.claspignore`**

`gas2/.clasp.json`:

```json
{
  "scriptId": "1hI2TqTyvB-D7KEoDSXcWtUx4mCG0HfiG-c5x551ovrGApqWzlEdAJZlU",
  "rootDir": "",
  "scriptExtensions": [".js", ".gs"],
  "htmlExtensions": [".html"],
  "jsonExtensions": [".json"],
  "filePushOrder": [],
  "skipSubdirectories": false
}
```

`gas2/appsscript.json`:

```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}
```

`gas2/.claspignore`:

```
**/node_modules/**
*.md
```

- [ ] **Step 4: Viết `tools/verify-gas2/run.js`**

Đây là bản sao của `tools/verify/run.js` với đúng 2 hằng số đổi (`PURE_FILES`, `FIXTURES_DIR` trỏ sang `tools/verify-gas2`). Copy rồi sửa:

```bash
cp tools/verify/run.js tools/verify-gas2/run.js
```

Sửa khối hằng số đầu file thành:

```js
const PURE_FILES = ['gas2/common.js', 'gas2/config.js', 'gas2/sources.js',
  'gas2/titleMaster.js', 'gas2/io.js'];

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
```

Và sửa dòng comment đầu file thành `// tools/verify-gas2/run.js — chạy toàn bộ test của tầng pure trong gas2/.`

**Ở task này `gas2/sources.js`, `gas2/titleMaster.js`, `gas2/io.js` chưa tồn tại** — tạm bỏ 3 tên đó khỏi `PURE_FILES`, chỉ để `['gas2/common.js', 'gas2/config.js']`. Task 2/3/7 sẽ thêm lại từng file khi tạo ra nó.

- [ ] **Step 5: Viết test đầu tiên vào `tools/verify-gas2/tests.js`**

```js
// tools/verify-gas2/tests.js — toàn bộ test của tầng pure GAS❷, gom theo VẤN ĐỀ.
//
// Mỗi hàm test_* là 1 vấn đề độc lập, nhận ctx = {src, check, fixtures}:
//   src      — global object của vm context đã nạp gas2/*.js (xem run.js)
//   check    — check(label, actual, expected)
//   fixtures — fixtures.load('titleMasterGawa') đọc tools/verify-gas2/fixtures/*.json
//
// Chạy: node tools/verify-gas2/run.js [--data]

function test_harness(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  // Chứng minh nạp được gas2/common.js: dùng đúng 3 hàm mà cả plan này dựa vào.
  check('normalizeHeaderText bo xuong dong trong header ガワ',
    src.normalizeHeaderText('先行終了日\n（延長）'), '先行終了日（延長）');
  check('sameDateValue coi Date va chuoi cung ngay la bang nhau',
    src.sameDateValue(new Date(2025, 10, 30), '2025/11/30'), true);
  // Thứ tự tham số của sameWriteOnceValue KHÔNG đối xứng: (existing, incoming).
  check('sameWriteOnceValue: o dang co gia tri -> khong bao gio ghi de',
    src.sameWriteOnceValue(new Date(2020, 7, 19), new Date(2026, 7, 19)), true);
  check('sameWriteOnceValue: o dang trong -> co ghi',
    src.sameWriteOnceValue('', new Date(2026, 7, 19)), false);

  // Chứng minh nạp được gas2/config.js.
  check('CONFIG tro dung 3 spreadsheet',
    [CONFIG_ID(src, 'SOURCES', 'CUSTOMER_WORK_MASTER'),
      CONFIG_ID(src, 'SOURCES', 'COPYRIGHT_MASTER'),
      CONFIG_ID(src, 'OUTPUTS', 'TITLE_MASTER')],
    ['1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU',
      '1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc',
      '16Fw9KrvKskewy9OAWqPegYXvhOkRPywatd512Ncn4rI']);
}

function CONFIG_ID(src, group, name) {
  return src.CONFIG[group][name].spreadsheetId;
}

module.exports = {
  unit: [test_harness],
  data: [],
};
```

- [ ] **Step 6: Chạy test — phải PASS**

Run: `node tools/verify-gas2/run.js`
Expected: `RUN   test_harness` rồi `5 passed, 0 failed`

- [ ] **Step 7: Commit**

```bash
git add gas2/ tools/verify-gas2/
git commit -m "Give GAS2 a project of its own and a way to test it"
```

---

### Task 2: `gas2/sources.js` — đọc 2 master nguồn (tầng thuần)

**Files:**
- Create: `gas2/sources.js`
- Modify: `tools/verify-gas2/run.js` (thêm `'gas2/sources.js'` vào `PURE_FILES`)
- Test: `tools/verify-gas2/tests.js`

**Interfaces:**
- Consumes: `resolveHeaderIndex()`, `col()`, `tryCol()`, `normalizeJapaneseText()` từ `gas2/common.js`
- Produces:
  - `CUSTOMER_REQUIRED_HEADERS` (Array<string>, 20 tên)
  - `COPYRIGHT_REQUIRED_HEADERS` (Array<string>, 4 tên)
  - `COPYRIGHT_PRE_CONFIRMATION_HEADER` (string `'出版社事前確認'`)
  - `parseCustomerMasterRows(rawRows)` → `Array<{titleNo, cmsId, titleId, titleName, author, genre, publisher, label, preStart, preEnd, policy, general, logoJudgement, suspensionDate, preEndExtended, preEndFinal, massFreeStart, massFreeEnd, titleCategory, lpProduction}>`
  - `parseCopyrightMasterRows(rawRows)` → `{records: Array<{titleNo, titleName, publisherCopyright, individualCopyright, preConfirmation}>, hasPreConfirmation: boolean}`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `tools/verify-gas2/tests.js` (và thêm `test_sources` vào mảng `unit` cuối file):

```js
function test_sources(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  // Layout ガワ thu nhỏ: 2 hàng ghi chú, hàng header, rồi dữ liệu. Cột A là cột đệm
  // trống — đúng như sheet thật, để chứng minh không có chỗ nào giả định cột A là dữ liệu.
  var customerRows = [
    ['', '更新日', new Date(2026, 7, 19)],
    ['', '自動入力/GAS'],
    ['', 'タイトルNo', 'CMS ID', 'タイトルID', 'タイトル区分', '①広告出稿ポリシー',
      '②一般面出稿NG', '③シーモアロゴ判定', '掲載停止日付', 'LP制作', 'タイトル名',
      '作家名', 'ジャンル', '出版社', 'レーベル名', '先行開始日', '先行終了日',
      '先行終了日\n（延長）', '先行終了日\n（最終確定）', '大量無料開始日', '大量無料終了日'],
    ['', 2, 6761, 36818, 'コミット', '問題なし', '一般面OK', 'ロゴあり', '', '必要',
      '社会人のカレ。', '箕野希望', '少女', '小学館', '', new Date(2026, 2, 27),
      new Date(2026, 5, 25), '', new Date(2026, 5, 25), '', ''],
    // Dòng không có タイトル名 -> bị bỏ qua (cùng quy ước với GAS❶).
    ['', 9999, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ];

  var customers = src.parseCustomerMasterRows(customerRows);
  check('parseCustomerMasterRows bo dong khong co タイトル名', customers.length, 1);
  check('parseCustomerMasterRows doc dung 6 field dai dien',
    [customers[0].titleNo, customers[0].titleId, customers[0].titleName,
      customers[0].titleCategory, customers[0].lpProduction, customers[0].publisher],
    [2, 36818, '社会人のカレ。', 'コミット', '必要', '小学館']);
  check('parseCustomerMasterRows doc dung cot 先行終了日（最終確定）',
    src.toDateKey(customers[0].preEndFinal), '2026-6-25');

  // コピーライトマスタ CÓ cột 出版社事前確認.
  var copyrightRows = [
    ['', '更新日', new Date(2026, 7, 19)],
    ['', 'タイトルNo', 'タイトル名', 'タイトル個別コピーライト(あれば優先使用)',
      '出版社コピーライト', '出版社事前確認'],
    ['', 2, '社会人のカレ。', '', '『社会人のカレ。』©箕野希望 / 小学館', '必要'],
  ];
  var copyright = src.parseCopyrightMasterRows(copyrightRows);
  check('parseCopyrightMasterRows doc du 3 gia tri + co cot 事前確認',
    [copyright.records.length, copyright.records[0].publisherCopyright,
      copyright.records[0].preConfirmation, copyright.hasPreConfirmation],
    [1, '『社会人のカレ。』©箕野希望 / 小学館', '必要', true]);

  // コピーライトマスタ CHƯA có cột 出版社事前確認 (池永 phải thêm tay — xem
  // COPYRIGHT_PRE_CONFIRMATION_HEADER trong src/io.js của GAS❶). Không được throw.
  var noPreConfirm = [
    ['', 'タイトルNo', 'タイトル名', 'タイトル個別コピーライト(あれば優先使用)', '出版社コピーライト'],
    ['', 2, '社会人のカレ。', '', '『社会人のカレ。』©箕野希望 / 小学館'],
  ];
  var parsed = src.parseCopyrightMasterRows(noPreConfirm);
  check('thieu cot 出版社事前確認 -> khong throw, co hasPreConfirmation=false',
    [parsed.records.length, parsed.records[0].preConfirmation, parsed.hasPreConfirmation],
    [1, '', false]);
}
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `node tools/verify-gas2/run.js`
Expected: crash `TypeError: src.parseCustomerMasterRows is not a function`

- [ ] **Step 3: Viết `gas2/sources.js`**

```js
// gas2/sources.js — TẦNG THUẦN: biến mảng 2 chiều thô của 2 master nguồn thành record.
//
// Không có lời gọi Google API nào ở đây (đó là việc của gas2/io.js), nên toàn bộ file
// này test được bằng Node — xem tools/verify-gas2/tests.js: test_sources.
//
// Cả 2 hàm đều TỰ DÒ hàng header thay vì giả định hàng 15: ガワ của 2 master này đã đổi
// nhiều lần và 池永 vẫn còn chèn hàng ghi chú phía trên. Xem findHeaderRowIndex().

// Tên cột BẮT BUỘC phải có trên 顧客作品マスタ. Thiếu 1 cột -> throw ngay ở
// resolveHeaderIndex(): ghi thiếu cột nghĩa là タイトルマスタ sai một cách âm thầm, mà
// đây lại là master 営業 dùng để chọn tác phẩm.
//
// Ngoặc trong '先行終了日（延長）' là ngoặc FULL-WIDTH đúng như trên sheet;
// normalizeHeaderText() CHỈ bỏ khoảng trắng/xuống dòng, KHÔNG làm NFKC — nên viết
// nhầm sang ngoặc half-width là throw.
var CUSTOMER_REQUIRED_HEADERS = [
  'タイトルNo', 'CMS ID', 'タイトルID', 'タイトル区分',
  '①広告出稿ポリシー', '②一般面出稿NG', '③シーモアロゴ判定',
  '掲載停止日付', 'LP制作', 'タイトル名', '作家名', 'ジャンル', '出版社', 'レーベル名',
  '先行開始日', '先行終了日', '先行終了日（延長）', '先行終了日（最終確定）',
  '大量無料開始日', '大量無料終了日',
];

// Tên cột BẮT BUỘC trên コピーライトマスタ. Chỉ 4 cột: GAS❷ chỉ lấy 3 giá trị từ master
// này (+ khoá join), mọi cột định danh khác đã có sẵn bên 顧客作品マスタ.
//
// Ngoặc trong 'タイトル個別コピーライト(あれば優先使用)' là ngoặc HALF-WIDTH — khác
// '先行終了日（延長）' ở trên. Đã kiểm trên file thật, đừng "sửa cho nhất quán".
var COPYRIGHT_REQUIRED_HEADERS = [
  'タイトルNo', 'タイトル名', 'タイトル個別コピーライト(あれば優先使用)', '出版社コピーライト',
];

// CỐ TÌNH KHÔNG nằm trong COPYRIGHT_REQUIRED_HEADERS: cột này có thể CHƯA TỒN TẠI trên
// コピーライトマスタ thật (GAS❶ ghi nó bằng tryCol vì 池永 phải thêm tay — xem
// COPYRIGHT_PRE_CONFIRMATION_HEADER trong src/io.js). Đưa vào danh sách bắt buộc thì mọi
// lần chạy GAS❷ throw ngay chỉ vì một cột thông tin phụ chưa được thêm.
var COPYRIGHT_PRE_CONFIRMATION_HEADER = '出版社事前確認';

/**
 * Đọc toàn bộ dòng dữ liệu của 顧客作品マスタ thành record.
 *
 * Bỏ qua dòng không có タイトル名 — cùng quy ước với readCustomerWorkMaster() của GAS❶:
 * タイトル名 là trường duy nhất chắc chắn có giá trị ở mọi dòng do GAS❶ ghi.
 *
 * KHÔNG trả về sheetRow/rawRow như GAS❶: master này chỉ được ĐỌC, GAS❷ không bao giờ
 * ghi ngược lên nó, nên không cần biết dòng nằm ở đâu.
 *
 * @param {Array<Array<*>>} rawRows - Toàn bộ giá trị ô (kết quả getDataRange().getValues())
 * @returns {Array<object>} Mỗi phần tử là 1 tác phẩm, 20 field theo bảng map của spec §3
 */
function parseCustomerMasterRows(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, CUSTOMER_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[col(idx, 'タイトル名')]) === '') continue;
    records.push({
      titleNo: row[col(idx, 'タイトルNo')],
      cmsId: row[col(idx, 'CMS ID')],
      titleId: row[col(idx, 'タイトルID')],
      titleCategory: row[col(idx, 'タイトル区分')],
      policy: row[col(idx, '①広告出稿ポリシー')],
      general: row[col(idx, '②一般面出稿NG')],
      logoJudgement: row[col(idx, '③シーモアロゴ判定')],
      suspensionDate: row[col(idx, '掲載停止日付')],
      lpProduction: row[col(idx, 'LP制作')],
      titleName: row[col(idx, 'タイトル名')],
      author: row[col(idx, '作家名')],
      genre: row[col(idx, 'ジャンル')],
      publisher: row[col(idx, '出版社')],
      label: row[col(idx, 'レーベル名')],
      preStart: row[col(idx, '先行開始日')],
      preEnd: row[col(idx, '先行終了日')],
      preEndExtended: row[col(idx, '先行終了日（延長）')],
      preEndFinal: row[col(idx, '先行終了日（最終確定）')],
      massFreeStart: row[col(idx, '大量無料開始日')],
      massFreeEnd: row[col(idx, '大量無料終了日')],
    });
  }
  return records;
}

/**
 * Đọc コピーライトマスタ thành record + cho biết cột 出版社事前確認 có tồn tại hay không.
 *
 * hasPreConfirmation là thứ QUAN TRỌNG phải trả về, không phải chi tiết phụ: nếu cột
 * chưa được thêm bên nguồn mà GAS❷ vẫn ghi '' vào cột AA của タイトルマスタ, nó sẽ XOÁ
 * giá trị 必要/不要 mà 営業 đang có. Bên gọi dùng cờ này để bỏ hẳn cột AA ra khỏi lượt ghi.
 *
 * Bỏ qua dòng không có タイトルNo: khoá rỗng không tra được, và コピーライトマスタ do GAS❶
 * sinh ra nên dòng thiếu khoá là dòng rác/dòng mẫu.
 *
 * @param {Array<Array<*>>} rawRows
 * @returns {{records: Array<object>, hasPreConfirmation: boolean}}
 */
function parseCopyrightMasterRows(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, COPYRIGHT_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  // tryCol() trả về `undefined` (KHÔNG phải null) khi cột không tồn tại — nó chỉ là
  // `headerIndex.get(...)` trần. Đã kiểm trong src/common.js; so bằng `=== undefined`.
  var colPreConfirm = tryCol(idx, COPYRIGHT_PRE_CONFIRMATION_HEADER);
  var hasPreConfirmation = colPreConfirm !== undefined;
  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[col(idx, 'タイトルNo')]) === '') continue;
    records.push({
      titleNo: row[col(idx, 'タイトルNo')],
      titleName: row[col(idx, 'タイトル名')],
      individualCopyright: row[col(idx, 'タイトル個別コピーライト(あれば優先使用)')],
      publisherCopyright: row[col(idx, '出版社コピーライト')],
      preConfirmation: hasPreConfirmation ? row[colPreConfirm] : '',
    });
  }
  return { records: records, hasPreConfirmation: hasPreConfirmation };
}
```

- [ ] **Step 4: Thêm `gas2/sources.js` vào `PURE_FILES` của `tools/verify-gas2/run.js`**

```js
const PURE_FILES = ['gas2/common.js', 'gas2/config.js', 'gas2/sources.js'];
```

- [ ] **Step 5: Chạy test — phải XANH**

Run: `node tools/verify-gas2/run.js`
Expected: `9 passed, 0 failed`

- [ ] **Step 6: Commit**

```bash
git add gas2/sources.js tools/verify-gas2/
git commit -m "Read the two masters GAS1 leaves behind"
```

---

### Task 3: Bảng cột + `titleRecordToRow()`

**Files:**
- Create: `gas2/titleMaster.js`
- Modify: `tools/verify-gas2/run.js` (thêm `'gas2/titleMaster.js'` vào `PURE_FILES`)
- Test: `tools/verify-gas2/tests.js`

**Interfaces:**
- Consumes: `col()`, `buildHeaderIndex()` từ `gas2/common.js`
- Produces:
  - `TITLE_COLUMNS` — `Array<{header: string, source: 'customer'|'copyright'|'stamp', field: string, compare: 'text'|'date'}>`, 24 phần tử
  - `TITLE_REQUIRED_HEADERS` — `Array<string>` (24 tên, dẫn xuất từ `TITLE_COLUMNS`)
  - `titleRecordToRow(options)` → `Array<*>` với `options = {record, copyright, copyrightAvailable, preConfirmationAvailable, headerIndex, columnCount, previousRow, runAt}`

- [ ] **Step 1: Viết test thất bại**

Thêm `test_titleRow` vào `tools/verify-gas2/tests.js` (và vào mảng `unit`):

```js
// Hàng header của タイトルマスタ đúng như file thật (【DX見本】タイトルマスタ.xlsx hàng 15):
// cột A trống, B~AK, 3 cột có '\n', 4 cột cuối trùng tên 新規媒体.
function titleHeaderRow() {
  return ['', 'タイトルNo', 'CMS ID', 'タイトルID', 'マスタ追加日', 'タイトル区分',
    '①広告出稿ポリシー', '②一般面出稿NG', '③シーモアロゴ判定', '掲載停止日付', 'LP制作',
    'タイトル名', 'タイトルキー', '初回配信\n巻数', '作家名', 'ジャンル', '出版社',
    'レーベル名', '出版社コピーライト', 'タイトル個別コピーライト(あれば優先使用)',
    '先行開始日', '先行終了日', '先行終了日\n（延長）', '先行終了日\n（最終確定）',
    '大量無料開始日', '大量無料終了日', '出版社事前確認', 'GDN(CM)', 'デマジェン', 'YDA',
    'Meta', 'TikTok', 'X', '新規媒体', '新規媒体', '新規媒体', '新規媒体'];
}

function sampleCustomer() {
  return {
    titleNo: 2, cmsId: 6761, titleId: 36818, titleCategory: 'コミット',
    policy: '問題なし', general: '一般面OK', logoJudgement: 'ロゴあり',
    suspensionDate: '', lpProduction: '必要', titleName: '社会人のカレ。',
    author: '箕野希望', genre: '少女', publisher: '小学館', label: '',
    preStart: new Date(2026, 2, 27), preEnd: new Date(2026, 5, 25),
    preEndExtended: '', preEndFinal: new Date(2026, 5, 25),
    massFreeStart: '', massFreeEnd: '',
  };
}

function sampleCopyright() {
  return {
    titleNo: 2, titleName: '社会人のカレ。', individualCopyright: '',
    publisherCopyright: '『社会人のカレ。』©箕野希望 / 小学館', preConfirmation: '必要',
  };
}

function test_titleRow(ctx) {
  var src = ctx.src;
  var check = ctx.check;
  var header = titleHeaderRow();
  var headerIndex = src.buildHeaderIndex(header);
  var runAt = new Date(2026, 7, 19, 9, 30);

  function at(row, name) { return row[src.col(headerIndex, name)]; }

  // --- Dòng MỚI: 23 cột copy + E = ngày chạy, 12 cột kia rỗng.
  var added = src.titleRecordToRow({
    record: sampleCustomer(), copyright: sampleCopyright(),
    copyrightAvailable: true, preConfirmationAvailable: true,
    headerIndex: headerIndex, columnCount: header.length,
    previousRow: undefined, runAt: runAt,
  });
  check('dong moi: rong dung bang be rong sheet', added.length, header.length);
  check('dong moi: 5 cot dai dien tu 顧客作品マスタ',
    [at(added, 'タイトルNo'), at(added, 'タイトルID'), at(added, 'タイトル名'),
      at(added, 'LP制作'), at(added, 'レーベル名')],
    [2, 36818, '社会人のカレ。', '必要', '']);
  check('dong moi: 3 cot tu コピーライトマスタ',
    [at(added, '出版社コピーライト'), at(added, 'タイトル個別コピーライト(あれば優先使用)'),
      at(added, '出版社事前確認')],
    ['『社会人のカレ。』©箕野希望 / 小学館', '', '必要']);
  check('dong moi: マスタ追加日 = ngay chay',
    src.toDateKey(at(added, 'マスタ追加日')), '2026-8-19');
  check('dong moi: 12 cot khong co nguon deu rong',
    [at(added, 'タイトルキー'), at(added, '初回配信巻数'), at(added, 'GDN(CM)'),
      at(added, 'デマジェン'), at(added, 'YDA'), at(added, 'Meta'),
      at(added, 'TikTok'), at(added, 'X'), at(added, '新規媒体')],
    ['', '', '', '', '', '', '', '', '']);
  check('dong moi: cot A (dem) van rong', added[0], '');

  // --- Dòng CŨ: giữ nguyên mọi cột GAS❷ không sở hữu, kể cả cột lạ ngoài AK.
  var previous = new Array(header.length + 1).join(',').split(',');
  previous[src.col(headerIndex, 'マスタ追加日')] = new Date(2020, 7, 19);
  previous[src.col(headerIndex, 'タイトルキー')] = 'syakare';
  previous[src.col(headerIndex, '初回配信巻数')] = 5;
  previous[src.col(headerIndex, 'GDN(CM)')] = '〇';
  previous[src.col(headerIndex, 'タイトル名')] = 'tên cũ sẽ bị ghi đè';
  previous[header.length] = 'cột 池永 thêm sau này';

  var updated = src.titleRecordToRow({
    record: sampleCustomer(), copyright: sampleCopyright(),
    copyrightAvailable: true, preConfirmationAvailable: true,
    headerIndex: headerIndex, columnCount: header.length + 1,
    previousRow: previous, runAt: runAt,
  });
  check('dong cu: マスタ追加日 GIU NGUYEN, khong bi dong dau lai',
    src.toDateKey(at(updated, 'マスタ追加日')), '2020-8-19');
  check('dong cu: 4 cot khong so huu giu nguyen',
    [at(updated, 'タイトルキー'), at(updated, '初回配信巻数'), at(updated, 'GDN(CM)'),
      updated[header.length]],
    ['syakare', 5, '〇', 'cột 池永 thêm sau này']);
  check('dong cu: cot co nguon van bi ghi de',
    at(updated, 'タイトル名'), '社会人のカレ。');

  // --- Nguồn phụ đọc không được: 3 cột copyright phải GIỮ NGUYÊN, không ghi rỗng.
  var previousWithCopyright = new Array(header.length + 1).join(',').split(',');
  previousWithCopyright[src.col(headerIndex, '出版社コピーライト')] = '© cũ trên sheet';
  previousWithCopyright[src.col(headerIndex, '出版社事前確認')] = '必要';
  var kept = src.titleRecordToRow({
    record: sampleCustomer(), copyright: null,
    copyrightAvailable: false, preConfirmationAvailable: false,
    headerIndex: headerIndex, columnCount: header.length,
    previousRow: previousWithCopyright, runAt: runAt,
  });
  check('copyright doc khong duoc: giu nguyen 2 cot dang co',
    [at(kept, '出版社コピーライト'), at(kept, '出版社事前確認')],
    ['© cũ trên sheet', '必要']);

  // --- Nguồn phụ đọc được nhưng タイトルNo không có bên đó: 3 cột ra RỖNG.
  var missing = src.titleRecordToRow({
    record: sampleCustomer(), copyright: null,
    copyrightAvailable: true, preConfirmationAvailable: true,
    headerIndex: headerIndex, columnCount: header.length,
    previousRow: previousWithCopyright, runAt: runAt,
  });
  check('タイトルNo khong co ben ©: 3 cot ra rong',
    [at(missing, '出版社コピーライト'), at(missing, 'タイトル個別コピーライト(あれば優先使用)'),
      at(missing, '出版社事前確認')],
    ['', '', '']);

  // --- Cột 出版社事前確認 chưa tồn tại bên nguồn: giữ nguyên AA, nhưng S/T vẫn ghi.
  var partial = src.titleRecordToRow({
    record: sampleCustomer(), copyright: sampleCopyright(),
    copyrightAvailable: true, preConfirmationAvailable: false,
    headerIndex: headerIndex, columnCount: header.length,
    previousRow: previousWithCopyright, runAt: runAt,
  });
  check('nguon chua co cot 事前確認: AA giu nguyen, S van ghi',
    [at(partial, '出版社事前確認'), at(partial, '出版社コピーライト')],
    ['必要', '『社会人のカレ。』©箕野希望 / 小学館']);

  // --- TITLE_COLUMNS phải đúng 24 và không trùng tên.
  var names = src.TITLE_COLUMNS.map(function (c) { return c.header; });
  var unique = {};
  names.forEach(function (n) { unique[n] = true; });
  check('TITLE_COLUMNS co dung 24 cot, khong trung ten',
    [names.length, Object.keys(unique).length], [24, 24]);
}
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `node tools/verify-gas2/run.js`
Expected: crash `TypeError: src.titleRecordToRow is not a function`

- [ ] **Step 3: Viết `gas2/titleMaster.js` (phần 1)**

```js
// gas2/titleMaster.js — TẦNG THUẦN của GAS❷: bảng cột, dựng dòng, diff.
//
// Không có lời gọi Google API nào ở đây. Mọi quyết định "ghi gì vào ô nào, dòng nào
// đã đổi" nằm trong file này để test được bằng Node — gas2/io.js chỉ còn việc mang
// mảng đi đặt vào sheet.

/**
 * 24 cột GAS❷ sở hữu trên タイトルマスタ, theo đúng thứ tự trái→phải của ガワ.
 *
 * `header` — tên cột trên sheet, phải copy BYTE-CHÍNH-XÁC. normalizeHeaderText() chỉ bỏ
 *   khoảng trắng/xuống dòng, KHÔNG làm NFKC: '（延長）' (full-width) và '(あれば優先使用)'
 *   (half-width) khác nhau thật, cả 2 đều đã kiểm trên file thật.
 * `source` — 'customer' lấy từ 顧客作品マスタ, 'copyright' từ コピーライトマスタ,
 *   'stamp' là cột GAS❷ tự sinh (chỉ có マスタ追加日).
 * `field` — tên field trên record do gas2/sources.js trả về.
 * `compare` — 'date' thì so bằng sameDateValue() (so theo năm-tháng-ngày), 'text' thì
 *   sameValue(). KHÔNG dùng sameDateValue() cho mọi cột: nó nhận cả CHUỖI dạng ngày, nên
 *   một タイトル名 bắt đầu bằng '2025-11-30' sẽ bị đem đi so như ngày. Đánh dấu tường minh
 *   thì không có cột nào bị so nhầm kiểu.
 *
 * 12 cột CỐ TÌNH VẮNG MẶT (M タイトルキー, N 初回配信巻数, AB~AK 掲出可能媒体): chưa có
 * nguồn, xem §1 của spec. Vắng khỏi bảng này nghĩa là không bao giờ bị ghi — đó chính là
 * cơ chế bảo vệ chúng, không cần thêm danh sách "cấm ghi" nào khác.
 */
var TITLE_COLUMNS = [
  { header: 'タイトルNo', source: 'customer', field: 'titleNo', compare: 'text' },
  { header: 'CMS ID', source: 'customer', field: 'cmsId', compare: 'text' },
  { header: 'タイトルID', source: 'customer', field: 'titleId', compare: 'text' },
  { header: 'マスタ追加日', source: 'stamp', field: 'masterAddedAt', compare: 'date' },
  { header: 'タイトル区分', source: 'customer', field: 'titleCategory', compare: 'text' },
  { header: '①広告出稿ポリシー', source: 'customer', field: 'policy', compare: 'text' },
  { header: '②一般面出稿NG', source: 'customer', field: 'general', compare: 'text' },
  { header: '③シーモアロゴ判定', source: 'customer', field: 'logoJudgement', compare: 'text' },
  { header: '掲載停止日付', source: 'customer', field: 'suspensionDate', compare: 'date' },
  { header: 'LP制作', source: 'customer', field: 'lpProduction', compare: 'text' },
  { header: 'タイトル名', source: 'customer', field: 'titleName', compare: 'text' },
  { header: '作家名', source: 'customer', field: 'author', compare: 'text' },
  { header: 'ジャンル', source: 'customer', field: 'genre', compare: 'text' },
  { header: '出版社', source: 'customer', field: 'publisher', compare: 'text' },
  { header: 'レーベル名', source: 'customer', field: 'label', compare: 'text' },
  { header: '出版社コピーライト', source: 'copyright', field: 'publisherCopyright', compare: 'text' },
  { header: 'タイトル個別コピーライト(あれば優先使用)', source: 'copyright', field: 'individualCopyright', compare: 'text' },
  { header: '先行開始日', source: 'customer', field: 'preStart', compare: 'date' },
  { header: '先行終了日', source: 'customer', field: 'preEnd', compare: 'date' },
  { header: '先行終了日（延長）', source: 'customer', field: 'preEndExtended', compare: 'date' },
  { header: '先行終了日（最終確定）', source: 'customer', field: 'preEndFinal', compare: 'date' },
  { header: '大量無料開始日', source: 'customer', field: 'massFreeStart', compare: 'date' },
  { header: '大量無料終了日', source: 'customer', field: 'massFreeEnd', compare: 'date' },
  { header: '出版社事前確認', source: 'copyright', field: 'preConfirmation', compare: 'text' },
];

// Cột 出版社事前確認 tách riêng khỏi 2 cột copyright còn lại vì nó có thể CHƯA TỒN TẠI
// bên nguồn (xem COPYRIGHT_PRE_CONFIRMATION_HEADER trong gas2/sources.js) trong khi 2 cột
// kia luôn có. Hai tình huống, hai cờ.
var TITLE_PRE_CONFIRMATION_HEADER = '出版社事前確認';

// Thiếu 1 trong 24 cột này trên タイトルマスタ -> throw ngay ở findHeaderRowIndex().
var TITLE_REQUIRED_HEADERS = TITLE_COLUMNS.map(function (c) { return c.header; });

/**
 * Dựng 1 dòng giá trị sẵn sàng cho Range.setValues(), theo ĐÚNG vị trí cột thật.
 *
 * ĐIỂM QUAN TRỌNG NHẤT — dòng ghi được dựng TỪ BẢN COPY CỦA DÒNG CŨ rồi mới ghi đè các
 * cột GAS❷ sở hữu. Cách khác (`new Array(n)` rồi fill) sẽ XOÁ TRẮNG 12 cột chưa có nguồn
 * và mọi cột 池永 thêm về sau, mỗi lần dòng bị update, không có lỗi nào để nhận ra — chỉ
 * là dữ liệu người ta nhập tự nhiên biến mất sau 9h30 sáng. Đây là bài học đã trả giá
 * bên GAS❶; xem JSDoc của customerRecordToRow() trong src/io.js.
 *
 * BA CỜ, BA HÀNH VI KHÁC NHAU:
 *   previousRow === undefined  -> dòng MỚI: cột không sở hữu ra rỗng, マスタ追加日 = runAt
 *   copyrightAvailable === false -> nguồn phụ đọc không được: BỎ QUA cả 3 cột copyright,
 *                                 giữ nguyên giá trị đang có trên sheet (spec §7)
 *   preConfirmationAvailable === false -> nguồn có nhưng THIẾU cột 出版社事前確認:
 *                                 bỏ qua riêng cột AA, 2 cột copyright kia vẫn ghi
 *
 * copyright === null trong khi copyrightAvailable === true nghĩa là "đọc được nguồn nhưng
 * タイトルNo này không có bên đó" — khác hẳn: 3 cột ra RỖNG (kèm 1 cảnh báo do
 * diffTitleMaster ghi). Đó là thay đổi thật cần được phản ánh.
 *
 * マスタ追加日 là cột WRITE-ONCE: chỉ đóng dấu lúc append. Dòng đã tồn tại thì không đụng
 * tới, kể cả khi ô đang trống — nó là dữ liệu lịch sử, không phải trạng thái; ghi đè theo
 * ngày chạy sẽ biến cả cột thành "hôm nay" ngay lần chạy đầu và xoá mất thứ duy nhất cột
 * này dùng để trả lời (spec §3.1).
 *
 * @param {{
 *   record: object, copyright: object|null, copyrightAvailable: boolean,
 *   preConfirmationAvailable: boolean, headerIndex: Map<string,number>,
 *   columnCount: number, previousRow: Array<*>|undefined, runAt: Date
 * }} options
 * @returns {Array<*>} Mảng độ dài columnCount
 */
function titleRecordToRow(options) {
  var previousRow = options.previousRow;
  var row = [];
  for (var c = 0; c < options.columnCount; c++) {
    var previousValue = previousRow ? previousRow[c] : '';
    row.push(previousValue === null || previousValue === undefined ? '' : previousValue);
  }

  TITLE_COLUMNS.forEach(function (column) {
    if (column.source === 'stamp') {
      // Write-once: chỉ đóng dấu khi dòng được thêm mới.
      if (previousRow === undefined) row[col(options.headerIndex, column.header)] = options.runAt;
      return;
    }
    if (column.source === 'copyright') {
      if (!options.copyrightAvailable) return;
      if (column.header === TITLE_PRE_CONFIRMATION_HEADER && !options.preConfirmationAvailable) return;
      var value = options.copyright ? options.copyright[column.field] : '';
      row[col(options.headerIndex, column.header)] = blankIfEmpty(value);
      return;
    }
    row[col(options.headerIndex, column.header)] = blankIfEmpty(options.record[column.field]);
  });

  return row;
}

/**
 * null/undefined -> '' trước khi ghi vào sheet.
 *
 * Không phải chuyện thẩm mỹ: ghi undefined vào 1 ô rồi ĐỌC LẠI ở lần chạy sau, Sheets trả
 * về ''. So sánh 2 giá trị đó bằng === sẽ thấy khác nhau và đánh dấu dòng "đã đổi" mãi
 * mãi. normalizeForCompare() đã xử lý phía so sánh, nhưng chuẩn hoá luôn ở phía ghi thì
 * dữ liệu trên sheet cũng sạch.
 *
 * @param {*} value
 * @returns {*}
 */
function blankIfEmpty(value) {
  return value === null || value === undefined ? '' : value;
}
```

- [ ] **Step 4: Thêm `gas2/titleMaster.js` vào `PURE_FILES`**

```js
const PURE_FILES = ['gas2/common.js', 'gas2/config.js', 'gas2/sources.js',
  'gas2/titleMaster.js'];
```

- [ ] **Step 5: Chạy test — phải XANH**

Run: `node tools/verify-gas2/run.js`
Expected: `19 passed, 0 failed`

- [ ] **Step 6: Commit**

```bash
git add gas2/titleMaster.js tools/verify-gas2/ tools/verify-gas2/run.js
git commit -m "Lay out which 24 columns GAS2 owns, and guard the other twelve"
```

---

### Task 4: Khoá `タイトルNo` + tra cứu + 2 cảnh báo về khoá

**Files:**
- Modify: `gas2/titleMaster.js` (thêm vào cuối)
- Test: `tools/verify-gas2/tests.js`

**Interfaces:**
- Consumes: `normalizeJapaneseText()` từ `gas2/common.js`
- Produces:
  - `titleNoKey(value)` → `string` (`''` nếu không có khoá)
  - `buildCopyrightLookup(records)` → `Map<string, object>`
  - `indexCustomerRecords(records, runAt)` → `{records: Array<object>, warnings: Array<{runAt, kind, titleNo, titleId, titleName, detail}>}`
  - `parseTitleMasterRows(rawRows)` → `{headerRowIndex: number, headerIndex: Map<string,number>, rows: Array<{titleNo, titleName, titleId, sheetRow, rawRow}>}`
  - Hằng số loại cảnh báo: `WARNING_KIND_MISSING_NO = 'タイトルNo欠落'`, `WARNING_KIND_DUPLICATE_NO = 'タイトルNo重複'`, `WARNING_KIND_NO_COPYRIGHT = 'コピーライト未登録'`, `WARNING_KIND_ORPHAN = '孤立行'`

- [ ] **Step 1: Viết test thất bại**

Thêm `test_titleKeys` vào `tools/verify-gas2/tests.js` (và vào mảng `unit`):

```js
function test_titleKeys(ctx) {
  var src = ctx.src;
  var check = ctx.check;
  var runAt = new Date(2026, 7, 19, 9, 30);

  // Sheets trả về number cho ô số, fixture/export có thể trả string — cùng 1 khoá.
  check('titleNoKey: number va string cho ra cung khoa',
    src.titleNoKey(2) === src.titleNoKey('2'), true);
  check('titleNoKey: rong/null/khoang trang deu ra chuoi rong',
    [src.titleNoKey(''), src.titleNoKey(null), src.titleNoKey('  ')], ['', '', '']);
  check('titleNoKey: so full-width khop so half-width',
    src.titleNoKey('２') === src.titleNoKey('2'), true);

  // --- indexCustomerRecords: bỏ dòng thiếu khoá, dòng đầu thắng khi trùng.
  var records = [
    { titleNo: 2, titleId: 36818, titleName: 'A' },
    { titleNo: '', titleId: 111, titleName: 'B thiếu khoá' },
    { titleNo: 2, titleId: 222, titleName: 'C trùng khoá với A' },
    { titleNo: 8830, titleId: 332945, titleName: 'D' },
  ];
  var indexed = src.indexCustomerRecords(records, runAt);
  check('indexCustomerRecords giu 2 dong hop le, dung thu tu',
    indexed.records.map(function (r) { return r.titleName; }), ['A', 'D']);
  check('indexCustomerRecords sinh dung 2 canh bao',
    indexed.warnings.map(function (w) { return w.kind; }),
    ['タイトルNo欠落', 'タイトルNo重複']);
  check('canh bao 重複 chi ro dong nao bi bo',
    [indexed.warnings[1].titleNo, indexed.warnings[1].titleName],
    [2, 'C trùng khoá với A']);

  // --- buildCopyrightLookup
  var lookup = src.buildCopyrightLookup([
    { titleNo: 2, publisherCopyright: '©A' },
    { titleNo: '8830', publisherCopyright: '©D' },
  ]);
  check('buildCopyrightLookup tra duoc bang khoa da chuan hoa',
    [lookup.get(src.titleNoKey('2')).publisherCopyright,
      lookup.get(src.titleNoKey(8830)).publisherCopyright],
    ['©A', '©D']);

  // --- parseTitleMasterRows: dò hàng header, trả sheetRow THẬT (1-based).
  var rows = [
    ['', '▮タイトルマスタ'],
    ['', '更新日', new Date(2026, 6, 21)],
    titleHeaderRow(),
    ['', 2, 6761, 36818, new Date(2020, 7, 19), 'コミット'],
    ['', '', '', '', '', ''],
    ['', 8830, '', 332945, new Date(2025, 7, 27), '独占'],
  ];
  var parsed = src.parseTitleMasterRows(rows);
  check('parseTitleMasterRows do dung hang header (0-based)', parsed.headerRowIndex, 2);
  check('parseTitleMasterRows bo dong khong co タイトルNo, giu sheetRow that',
    parsed.rows.map(function (r) { return [r.titleNo, r.sheetRow]; }),
    [[2, 4], [8830, 6]]);
  check('parseTitleMasterRows giu rawRow de bao toan cot',
    parsed.rows[0].rawRow[src.col(parsed.headerIndex, 'タイトル区分')], 'コミット');
}
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `node tools/verify-gas2/run.js`
Expected: crash `TypeError: src.titleNoKey is not a function`

- [ ] **Step 3: Viết code vào cuối `gas2/titleMaster.js`**

```js
// 4 loại cảnh báo ghi vào tab GAS2警告. Đặt tên hằng thay vì rải chuỗi khắp nơi để
// tab log và test không thể lệch nhau vì một lỗi gõ.
var WARNING_KIND_MISSING_NO = 'タイトルNo欠落';
var WARNING_KIND_DUPLICATE_NO = 'タイトルNo重複';
var WARNING_KIND_NO_COPYRIGHT = 'コピーライト未登録';
var WARNING_KIND_ORPHAN = '孤立行';

/**
 * Khoá join của toàn bộ GAS❷: chuỗi đã chuẩn hoá của タイトルNo.
 *
 * Phải chuẩn hoá chứ không dùng thẳng giá trị ô: SpreadsheetApp trả number cho ô số còn
 * fixture JSON trả string, nên `2 === '2'` là false và mọi dòng sẽ bị coi là dòng mới.
 * normalizeJapaneseText() còn gộp luôn chữ số full-width (ô '２' do lỗi IME).
 *
 * Trả '' cho ô trống — bên gọi dùng chính điều kiện này để loại dòng thiếu khoá, thay vì
 * để khoá rỗng khớp với khoá rỗng và 2 tác phẩm khác nhau ghi đè lên cùng 1 dòng.
 *
 * @param {*} value
 * @returns {string}
 */
function titleNoKey(value) {
  return normalizeJapaneseText(value);
}

/**
 * Map khoá タイトルNo -> record của コピーライトマスタ.
 *
 * Trùng khoá thì bản ĐẦU TIÊN thắng — コピーライトマスタ do GAS❶ sinh ra với khoá là chính
 * タイトルNo nên trùng là bất thường bên đó, không phải việc GAS❷ đi sửa.
 *
 * @param {Array<object>} records - Kết quả parseCopyrightMasterRows().records
 * @returns {Map<string, object>}
 */
function buildCopyrightLookup(records) {
  var map = new Map();
  records.forEach(function (record) {
    var key = titleNoKey(record.titleNo);
    if (key === '' || map.has(key)) return;
    map.set(key, record);
  });
  return map;
}

/**
 * Lọc danh sách record của 顧客作品マスタ xuống còn những dòng có khoá dùng được, kèm
 * cảnh báo cho mỗi dòng bị loại.
 *
 * Hai ca, cùng một hậu quả (dòng không lên được タイトルマスタ) nhưng khác nguyên nhân nên
 * tách 2 loại cảnh báo: 欠落 là dữ liệu thiếu ở nguồn, 重複 là 2 dòng tranh nhau 1 khoá.
 * Gộp làm một thì người đọc log không biết phải đi sửa cái gì.
 *
 * KHÔNG throw ở cả 2 ca: một dòng hỏng không được phép chặn 8.000 dòng còn lại.
 *
 * @param {Array<object>} records - Kết quả parseCustomerMasterRows()
 * @param {Date} runAt
 * @returns {{records: Array<object>, warnings: Array<object>}}
 */
function indexCustomerRecords(records, runAt) {
  var kept = [];
  var warnings = [];
  var seen = new Map();
  records.forEach(function (record) {
    var key = titleNoKey(record.titleNo);
    if (key === '') {
      warnings.push(buildWarning(runAt, WARNING_KIND_MISSING_NO, record,
        'Dòng không có タイトルNo nên không lên được タイトルマスタ.'));
      return;
    }
    if (seen.has(key)) {
      warnings.push(buildWarning(runAt, WARNING_KIND_DUPLICATE_NO, record,
        'タイトルNo đã được dùng bởi「' + seen.get(key).titleName + '」— dòng này bị bỏ qua.'));
      return;
    }
    seen.set(key, record);
    kept.push(record);
  });
  return { records: kept, warnings: warnings };
}

/**
 * Dựng 1 dòng cảnh báo cho tab GAS2警告.
 *
 * @param {Date} runAt
 * @param {string} kind - Một trong 4 hằng WARNING_KIND_*
 * @param {{titleNo: *, titleId: *, titleName: *}} record
 * @param {string} detail
 * @returns {{runAt: Date, kind: string, titleNo: *, titleId: *, titleName: *, detail: string}}
 */
function buildWarning(runAt, kind, record, detail) {
  return {
    runAt: runAt,
    kind: kind,
    titleNo: blankIfEmpty(record.titleNo),
    titleId: blankIfEmpty(record.titleId),
    titleName: blankIfEmpty(record.titleName),
    detail: detail,
  };
}

/**
 * Đọc vùng dữ liệu hiện có của タイトルマスタ: dò hàng header, trả về từng dòng kèm số
 * dòng THẬT và bản gốc của dòng.
 *
 * sheetRow là số dòng 1-based dùng thẳng cho getRange() — KHÔNG tính bằng
 * headerRow + thứ tự, vì công thức đó ngầm giả định không có dòng trống xen giữa
 * (ガワ thật có), và một lần lệch nghĩa là ghi tác phẩm này đè lên dòng tác phẩm khác.
 *
 * rawRow được giữ lại để titleRecordToRow() bảo toàn 12 cột chưa có nguồn.
 *
 * @param {Array<Array<*>>} rawRows
 * @returns {{headerRowIndex: number, headerIndex: Map<string,number>, rows: Array<object>}}
 */
function parseTitleMasterRows(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, TITLE_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var rows = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (titleNoKey(row[col(idx, 'タイトルNo')]) === '') continue;
    rows.push({
      titleNo: row[col(idx, 'タイトルNo')],
      titleId: row[col(idx, 'タイトルID')],
      titleName: row[col(idx, 'タイトル名')],
      sheetRow: i + 1,
      rawRow: row,
    });
  }
  return {
    headerRowIndex: resolved.headerRowIndex,
    headerIndex: idx,
    rows: rows,
  };
}
```

- [ ] **Step 4: Chạy test — phải XANH**

Run: `node tools/verify-gas2/run.js`
Expected: `28 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add gas2/titleMaster.js tools/verify-gas2/tests.js
git commit -m "Key every row on タイトルNo and say so when one cannot be"
```

---

### Task 5: `diffTitleMaster()` — chỉ ghi dòng thật sự khác

**Files:**
- Modify: `gas2/titleMaster.js` (thêm vào cuối)
- Test: `tools/verify-gas2/tests.js`

**Interfaces:**
- Consumes: `titleRecordToRow()`, `indexCustomerRecords()`, `buildCopyrightLookup()`, `titleNoKey()`, `buildWarning()` (Task 3+4); `sameValue()`, `sameDateValue()`, `col()` (common)
- Produces: `diffTitleMaster(options)` với
  `options = {customerRecords, copyrightLookup, copyrightAvailable, preConfirmationAvailable, existing, headerIndex, columnCount, runAt}`
  (`existing` = kết quả `parseTitleMasterRows(...).rows`)
  → `{toUpdate: Array<{sheetRow: number, values: Array<*>, record: object}>, toAdd: Array<{values: Array<*>, record: object}>, warnings: Array<object>, changeDetails: Array<{runAt, titleNo, titleName, field, oldValue, newValue}>}`

- [ ] **Step 1: Viết test thất bại**

Thêm `test_diff` vào `tools/verify-gas2/tests.js` (và vào mảng `unit`):

```js
function test_diff(ctx) {
  var src = ctx.src;
  var check = ctx.check;
  var header = titleHeaderRow();
  var headerIndex = src.buildHeaderIndex(header);
  var runAt = new Date(2026, 7, 19, 9, 30);

  function blankRow() { return new Array(header.length + 1).join(',').split(','); }
  function put(row, name, value) { row[src.col(headerIndex, name)] = value; return row; }

  function runDiff(overrides) {
    var options = {
      customerRecords: [sampleCustomer()],
      copyrightLookup: src.buildCopyrightLookup([sampleCopyright()]),
      copyrightAvailable: true,
      preConfirmationAvailable: true,
      existing: [],
      headerIndex: headerIndex,
      columnCount: header.length,
      runAt: runAt,
    };
    Object.keys(overrides || {}).forEach(function (k) { options[k] = overrides[k]; });
    return src.diffTitleMaster(options);
  }

  // --- Dòng chưa có -> toAdd.
  var added = runDiff({});
  check('dong chua co -> 1 toAdd, 0 toUpdate',
    [added.toAdd.length, added.toUpdate.length], [1, 0]);

  // --- Dòng đã có, GIỐNG HỆT -> không ghi gì. Dựng existing từ chính kết quả append,
  // rồi thay マスタ追加日 bằng ngày cũ (dòng cũ không bị đóng dấu lại).
  var sameRow = added.toAdd[0].values.slice();
  put(sameRow, 'マスタ追加日', new Date(2020, 7, 19));
  var unchanged = runDiff({ existing: [{ titleNo: 2, titleName: '社会人のカレ。', titleId: 36818, sheetRow: 16, rawRow: sameRow }] });
  check('dong khong doi -> khong ghi gi, khong co changeDetail',
    [unchanged.toAdd.length, unchanged.toUpdate.length, unchanged.changeDetails.length],
    [0, 0, 0]);

  // --- Ngày cùng giá trị nhưng khác KIỂU (chuỗi vs Date) -> vẫn coi là không đổi.
  var stringDateRow = sameRow.slice();
  put(stringDateRow, '先行開始日', '2026/3/27');
  put(stringDateRow, '先行終了日', '2026/6/25');
  var dateNoise = runDiff({ existing: [{ titleNo: 2, titleName: '社会人のカレ。', titleId: 36818, sheetRow: 16, rawRow: stringDateRow }] });
  check('chuoi 2026/3/27 vs Date cung ngay -> khong tinh la doi',
    dateNoise.toUpdate.length, 0);

  // --- Một cột đổi thật -> 1 toUpdate + 1 changeDetail đúng tên cột.
  var changedRow = sameRow.slice();
  put(changedRow, 'LP制作', '不要');
  var changed = runDiff({ existing: [{ titleNo: 2, titleName: '社会人のカレ。', titleId: 36818, sheetRow: 16, rawRow: changedRow }] });
  check('doi 1 cot -> 1 toUpdate dung sheetRow',
    [changed.toUpdate.length, changed.toUpdate[0].sheetRow], [1, 16]);
  check('changeDetail ghi dung ten cot va 2 gia tri',
    [changed.changeDetails.length, changed.changeDetails[0].field,
      changed.changeDetails[0].oldValue, changed.changeDetails[0].newValue],
    [1, 'LP制作', '不要', '必要']);

  // --- マスタ追加日 write-once: dòng cũ có ngày khác runAt -> KHÔNG tính là đổi.
  var oldStampRow = sameRow.slice();
  put(oldStampRow, 'マスタ追加日', new Date(2019, 0, 1));
  var stamp = runDiff({ existing: [{ titleNo: 2, titleName: '社会人のカレ。', titleId: 36818, sheetRow: 16, rawRow: oldStampRow }] });
  check('マスタ追加日 cu khac ngay chay -> khong bi ghi de',
    [stamp.toUpdate.length, stamp.changeDetails.length], [0, 0]);

  // --- Dòng cũ có マスタ追加日 TRỐNG -> vẫn để trống (chỉ đóng dấu lúc append).
  var emptyStampRow = sameRow.slice();
  put(emptyStampRow, 'マスタ追加日', '');
  var emptyStamp = runDiff({ existing: [{ titleNo: 2, titleName: '社会人のカレ。', titleId: 36818, sheetRow: 16, rawRow: emptyStampRow }] });
  check('マスタ追加日 dang trong tren dong cu -> van de trong',
    [emptyStamp.toUpdate.length, emptyStamp.changeDetails.length], [0, 0]);

  // --- 孤立行: dòng trên タイトルマスタ không còn bên 顧客作品マスタ -> cảnh báo, KHÔNG xoá.
  var orphan = runDiff({
    existing: [
      { titleNo: 2, titleName: '社会人のカレ。', titleId: 36818, sheetRow: 16, rawRow: sameRow },
      { titleNo: 777, titleName: 'tác phẩm đã biến mất', titleId: 999, sheetRow: 17, rawRow: blankRow() },
    ],
  });
  check('孤立行 -> 1 canh bao, khong sinh toUpdate/toAdd nao cho no',
    [orphan.warnings.length, orphan.warnings[0].kind, orphan.warnings[0].titleNo,
      orphan.toUpdate.length, orphan.toAdd.length],
    [1, '孤立行', 777, 0, 0]);

  // --- コピーライト未登録: có bên 顧客 nhưng không có bên ©.
  var noCopyright = runDiff({ copyrightLookup: new Map() });
  check('タイトルNo khong co ben © -> canh bao コピーライト未登録',
    [noCopyright.warnings.length, noCopyright.warnings[0].kind], [1, 'コピーライト未登録']);
  check('van tao dong, chi 3 cot copyright ra rong',
    noCopyright.toAdd[0].values[src.col(headerIndex, '出版社コピーライト')], '');

  // --- Nguồn phụ đọc không được -> KHÔNG cảnh báo 未登録 cho từng dòng (nếu không thì
  // một lần mất quyền truy cập sinh ra 8.000 dòng cảnh báo vô nghĩa), và giữ nguyên cột.
  var keptRow = sameRow.slice();
  put(keptRow, '出版社コピーライト', '© cũ trên sheet');
  var unavailable = runDiff({
    copyrightAvailable: false, preConfirmationAvailable: false, copyrightLookup: new Map(),
    existing: [{ titleNo: 2, titleName: '社会人のカレ。', titleId: 36818, sheetRow: 16, rawRow: keptRow }],
  });
  check('nguon © doc khong duoc -> khong canh bao tung dong, khong ghi de cot',
    [unavailable.warnings.length, unavailable.toUpdate.length], [0, 0]);
}
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `node tools/verify-gas2/run.js`
Expected: crash `TypeError: src.diffTitleMaster is not a function`

- [ ] **Step 3: Viết code vào cuối `gas2/titleMaster.js`**

```js
/**
 * So toàn bộ 顧客作品マスタ với vùng dữ liệu hiện có của タイトルマスタ, ra danh sách dòng
 * cần update / cần append, cùng cảnh báo và log chi tiết.
 *
 * KHÔNG ghi gì cả — chỉ tính. Việc đặt mảng vào sheet là của writeTitleMaster() (io.js).
 *
 * VÌ SAO PHẢI DIFF chứ không ghi lại hết: ghi lại toàn bộ ~8.000 dòng mỗi lần chạy tốn
 * quota, và quan trọng hơn là làm tab GAS2変更詳細 vô dụng — nó chỉ có giá trị khi mỗi dòng
 * trong đó là một thay đổi thật.
 *
 * SO SÁNH THEO CỘT, KHÔNG THEO CẢ DÒNG: dòng dựng ra vốn đã bằng dòng cũ ở mọi cột GAS❷
 * không sở hữu (xem titleRecordToRow), nên so cả dòng cũng ra cùng kết quả — nhưng so theo
 * cột cho ra luôn TÊN CỘT đã đổi để ghi vào GAS2変更詳細.
 *
 * @param {{
 *   customerRecords: Array<object>, copyrightLookup: Map<string,object>,
 *   copyrightAvailable: boolean, preConfirmationAvailable: boolean,
 *   existing: Array<object>, headerIndex: Map<string,number>,
 *   columnCount: number, runAt: Date
 * }} options
 * @returns {{toUpdate: Array<object>, toAdd: Array<object>,
 *   warnings: Array<object>, changeDetails: Array<object>}}
 */
function diffTitleMaster(options) {
  var runAt = options.runAt;
  var indexed = indexCustomerRecords(options.customerRecords, runAt);
  var warnings = indexed.warnings.slice();
  var changeDetails = [];
  var toUpdate = [];
  var toAdd = [];

  var existingByKey = new Map();
  options.existing.forEach(function (row) {
    var key = titleNoKey(row.titleNo);
    if (key !== '' && !existingByKey.has(key)) existingByKey.set(key, row);
  });

  var claimed = new Map();

  indexed.records.forEach(function (record) {
    var key = titleNoKey(record.titleNo);
    var copyright = options.copyrightLookup.get(key) || null;

    // Chỉ cảnh báo khi ĐỌC ĐƯỢC nguồn mà vẫn không thấy khoá. Nguồn đọc không được là
    // sự cố của cả lần chạy, đã có 1 dòng log riêng — nhân nó lên 8.000 dòng cảnh báo
    // sẽ chôn vùi những cảnh báo thật.
    if (options.copyrightAvailable && !copyright) {
      warnings.push(buildWarning(runAt, WARNING_KIND_NO_COPYRIGHT, record,
        'Không tìm thấy タイトルNo này trên コピーライトマスタ — 3 cột S/T/AA để rỗng.'));
    }

    var previous = existingByKey.get(key);
    var values = titleRecordToRow({
      record: record,
      copyright: copyright,
      copyrightAvailable: options.copyrightAvailable,
      preConfirmationAvailable: options.preConfirmationAvailable,
      headerIndex: options.headerIndex,
      columnCount: options.columnCount,
      previousRow: previous ? previous.rawRow : undefined,
      runAt: runAt,
    });

    if (!previous) {
      toAdd.push({ values: values, record: record });
      return;
    }

    claimed.set(key, true);
    var changed = collectChangedColumns(previous.rawRow, values, options.headerIndex, runAt, record);
    if (changed.length === 0) return;
    changeDetails = changeDetails.concat(changed);
    toUpdate.push({ sheetRow: previous.sheetRow, values: values, record: record });
  });

  // 孤立行 — KHÔNG xoá. GAS❷ không phân biệt được "tác phẩm đã bị gỡ khỏi master" với
  // "một lần đọc nguồn ra thiếu dòng"; xoá là thao tác không hoàn tác được trên dữ liệu
  // 営業 đang dùng để chọn tác phẩm, còn cảnh báo thì người ta xoá tay được.
  options.existing.forEach(function (row) {
    var key = titleNoKey(row.titleNo);
    if (key === '' || claimed.has(key)) return;
    warnings.push(buildWarning(runAt, WARNING_KIND_ORPHAN, row,
      'Dòng này không còn タイトルNo tương ứng trên 顧客作品マスタ — GAS❷ để nguyên, cần người kiểm.'));
  });

  return {
    toUpdate: toUpdate,
    toAdd: toAdd,
    warnings: warnings,
    changeDetails: changeDetails,
  };
}

/**
 * Liệt kê những cột GAS❷ sở hữu đã thật sự đổi giá trị giữa dòng cũ và dòng vừa dựng.
 *
 * Cột `compare: 'date'` so bằng sameDateValue() (chỉ so năm-tháng-ngày) — bắt buộc, vì
 * Sheets trả Date còn nguồn có thể trả chuỗi, và 2 spreadsheet lệch múi giờ sẽ cho 2
 * instant khác nhau cho CÙNG một ngày lịch. So thẳng sẽ thành churn vĩnh viễn: mỗi lần
 * chạy đều thấy "đã đổi" và ghi lại toàn bộ sheet.
 *
 * @param {Array<*>} previousRow
 * @param {Array<*>} values
 * @param {Map<string,number>} headerIndex
 * @param {Date} runAt
 * @param {object} record
 * @returns {Array<{runAt: Date, titleNo: *, titleName: *, field: string, oldValue: *, newValue: *}>}
 */
function collectChangedColumns(previousRow, values, headerIndex, runAt, record) {
  var changes = [];
  TITLE_COLUMNS.forEach(function (column) {
    var index = col(headerIndex, column.header);
    var oldValue = previousRow[index];
    var newValue = values[index];
    var same = column.compare === 'date'
      ? sameDateValue(oldValue, newValue)
      : sameValue(oldValue, newValue);
    if (same) return;
    changes.push({
      runAt: runAt,
      titleNo: blankIfEmpty(record.titleNo),
      titleName: blankIfEmpty(record.titleName),
      field: column.header,
      oldValue: blankIfEmpty(oldValue),
      newValue: blankIfEmpty(newValue),
    });
  });
  return changes;
}
```

- [ ] **Step 4: Chạy test — phải XANH**

Run: `node tools/verify-gas2/run.js`
Expected: `40 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add gas2/titleMaster.js tools/verify-gas2/tests.js
git commit -m "Write only the rows that actually changed"
```

---

### Task 6: Fixture từ ガワ thật + test đối chiếu số liệu

**Files:**
- Modify: `tools/verify/exportFixtures.py` (thêm bộ target thứ 2, ghi ra `tools/verify-gas2/fixtures/`)
- Test: `tools/verify-gas2/tests.js` (nhóm `data`)

**Interfaces:**
- Consumes: `parseCustomerMasterRows()`, `parseCopyrightMasterRows()`, `parseTitleMasterRows()`, `diffTitleMaster()`, `buildCopyrightLookup()`
- Produces: `tools/verify-gas2/fixtures/titleMasterGawa.json`, `customerMasterGawa.json`, `copyrightMasterGawa.json`; nhóm test `data` chạy bằng `node tools/verify-gas2/run.js --data`

- [ ] **Step 1: Thêm bộ target GAS❷ vào `tools/verify/exportFixtures.py`**

Ngay dưới list `TARGETS` hiện có, thêm:

```python
# Bộ fixture của GAS❷ — ghi ra thư mục KHÁC (tools/verify-gas2/fixtures) để harness của
# 2 GAS không dùng chung dữ liệu và vô tình phụ thuộc nhau. Cùng dùng chung script này
# vì việc y hệt: đọc example/*.xlsx ra JSON mảng 2 chiều, ô trống = ''.
OUT_DIR_GAS2 = os.path.join(ROOT, 'tools', 'verify-gas2', 'fixtures')

TARGETS_GAS2 = [
    # Layout ガワ của タイトルマスタ: cột A đệm, header hàng 15, dữ liệu từ hàng 16.
    # Đây là file mẫu 池永 gửi, chỉ có ~14 dòng dữ liệu — đủ để kiểm layout, không đủ
    # để kiểm số lượng.
    ('titleMasterGawa', 'example/【DX見本】タイトルマスタ.xlsx', 'タイトルマスタ'),
    # 2 master nguồn, bản thật gần nhất trong example/.
    ('customerMasterGawa', 'example/【池永社内】顧客作品マスタ0803.xlsx', '顧客作品マスタ'),
    ('copyrightMasterGawa', 'example/【池永社内】コピーライトマスタ0804.xlsx', 'コピーライトマスタ'),
]
```

Hàm `main()` hiện tại có dạng `os.makedirs(OUT_DIR, ...)` rồi một vòng `for name, rel_path, sheet_name in TARGETS:` với toàn bộ phần thân (load workbook → `iter_rows` → bỏ dòng trống cuối → `json.dumps` → ghi file → `print` → `wb.close()`) nằm ngay trong đó. Rút nguyên phần thân ấy ra thành hàm rồi gọi 2 lần — **không đổi một dòng nào trong phần thân**, để bộ fixture của GAS❶ ra kết quả y hệt:

```python
def export(out_dir, name, rel_path, sheet_name):
    # ... nguyên văn phần thân vòng lặp cũ, chỉ đổi OUT_DIR -> out_dir ...


def main():
    for out_dir, targets in ((OUT_DIR, TARGETS), (OUT_DIR_GAS2, TARGETS_GAS2)):
        os.makedirs(out_dir, exist_ok=True)
        for name, rel_path, sheet_name in targets:
            export(out_dir, name, rel_path, sheet_name)
```

Chỗ duy nhất được sửa trong phần thân là `out = os.path.join(OUT_DIR, name + '.json')` → `os.path.join(out_dir, ...)`.

- [ ] **Step 2: Chạy exporter và xác nhận 3 file mới**

Run: `python tools/verify/exportFixtures.py`
Expected: `tools/verify-gas2/fixtures/` có `titleMasterGawa.json`, `customerMasterGawa.json`, `copyrightMasterGawa.json`; các fixture cũ trong `tools/verify/fixtures/` KHÔNG đổi (`git status` không thấy chúng thay đổi).

- [ ] **Step 3: Viết test data**

Thêm `test_gawaDataset` vào `tools/verify-gas2/tests.js` và vào mảng **`data`** (không phải `unit`):

```js
// Nhóm `data` chạy trên fixture export từ example/*.xlsx — cần chạy
// `python tools/verify/exportFixtures.py` trước, và `node tools/verify-gas2/run.js --data`.
//
// Giá trị mong đợi bên dưới lấy từ chính file mẫu. Nếu 池永 gửi file mới và số đổi, ĐỌC
// LẠI file rồi sửa số ở đây — đừng nới lỏng phép so thành 'lớn hơn 0', vì con số cụ thể
// chính là thứ bắt được lỗi "mọi cột ngày lặng lẽ ra rỗng" đã từng sống 6 ngày bên GAS❶.
function test_gawaDataset(ctx) {
  var src = ctx.src;
  var check = ctx.check;
  var runAt = new Date(2026, 7, 19, 9, 30);

  var titleRows = ctx.fixtures.load('titleMasterGawa');
  var parsed = src.parseTitleMasterRows(titleRows);

  // Header ở hàng 15 của sheet = index 14. Đây là phép kiểm quan trọng nhất của nhóm này:
  // nó chứng minh 24 tên cột trong TITLE_COLUMNS khớp BYTE-CHÍNH-XÁC với sheet thật —
  // sai 1 ngoặc full/half-width là findHeaderRowIndex() throw ngay tại đây.
  check('parseTitleMasterRows do ra hang header 15 cua ガワ that',
    parsed.headerRowIndex, 14);

  // Cột A là cột đệm: タイトルNo phải nằm ở index 1, không phải 0.
  check('cot A la cot dem, タイトルNo o index 1',
    src.col(parsed.headerIndex, 'タイトルNo'), 1);
  check('12 cot khong co nguon van co mat tren sheet',
    [src.col(parsed.headerIndex, 'タイトルキー') > 0,
      src.col(parsed.headerIndex, '初回配信巻数') > 0,
      src.col(parsed.headerIndex, 'GDN(CM)') > 0],
    [true, true, true]);

  var customers = src.parseCustomerMasterRows(ctx.fixtures.load('customerMasterGawa'));
  var copyright = src.parseCopyrightMasterRows(ctx.fixtures.load('copyrightMasterGawa'));
  check('doc duoc ca 2 master nguon tu ガワ that',
    [customers.length > 0, copyright.records.length > 0], [true, true]);

  // Chạy diff thật trên layout thật: lần chạy đầu tiên phải ra toàn dòng append (vì
  // タイトルマスタ mẫu gần như trống), và mọi dòng append phải có マスタ追加日 = ngày chạy.
  var result = src.diffTitleMaster({
    customerRecords: customers,
    copyrightLookup: src.buildCopyrightLookup(copyright.records),
    copyrightAvailable: true,
    preConfirmationAvailable: copyright.hasPreConfirmation,
    existing: parsed.rows,
    headerIndex: parsed.headerIndex,
    columnCount: titleRows[parsed.headerRowIndex].length,
    runAt: runAt,
  });
  var stampCol = src.col(parsed.headerIndex, 'マスタ追加日');
  var allStamped = result.toAdd.every(function (item) {
    return src.toDateKey(item.values[stampCol]) === '2026-8-19';
  });
  check('moi dong append deu co マスタ追加日 = ngay chay', allStamped, true);

  // Chạy diff LẦN THỨ HAI trên chính kết quả lần đầu -> không được sinh thay đổi nào.
  // Đây là phép kiểm churn: nó bắt đúng class lỗi "mỗi lần chạy đều thấy đã đổi".
  var simulated = result.toAdd.map(function (item, i) {
    return {
      titleNo: item.record.titleNo,
      titleId: item.record.titleId,
      titleName: item.record.titleName,
      sheetRow: 1000 + i,
      rawRow: item.values,
    };
  });
  var second = src.diffTitleMaster({
    customerRecords: customers,
    copyrightLookup: src.buildCopyrightLookup(copyright.records),
    copyrightAvailable: true,
    preConfirmationAvailable: copyright.hasPreConfirmation,
    existing: simulated.concat(parsed.rows),
    headerIndex: parsed.headerIndex,
    columnCount: titleRows[parsed.headerRowIndex].length,
    runAt: new Date(2026, 7, 20, 9, 30),
    });
  check('chay lan 2 (ngay khac) -> khong dong nao doi, khong churn',
    [second.toUpdate.length, second.toAdd.length, second.changeDetails.length],
    [0, 0, 0]);
}
```

- [ ] **Step 4: Chạy test data**

Run: `node tools/verify-gas2/run.js --data`
Expected: tất cả pass. **Nếu `parseTitleMasterRows` throw `Không tìm thấy cột header`** — nghĩa là một tên trong `TITLE_COLUMNS` lệch so với sheet thật. Sửa `TITLE_COLUMNS` cho khớp file, đừng nới lỏng `TITLE_REQUIRED_HEADERS`.

- [ ] **Step 5: Chạy lại nhóm unit để chắc không hỏng gì**

Run: `node tools/verify-gas2/run.js`
Expected: `40 passed, 0 failed`, các test `data` hiện `SKIP`.

- [ ] **Step 6: Commit**

```bash
git add tools/verify/exportFixtures.py tools/verify-gas2/
git commit -m "Check the column names against the real ガワ, not a hand-typed copy"
```

---

### Task 7: `gas2/io.js` — tầng nói chuyện với Google

**Files:**
- Create: `gas2/io.js`
- Modify: `tools/verify-gas2/run.js` (thêm `'gas2/io.js'` vào `PURE_FILES`)
- Test: `tools/verify-gas2/tests.js`

**Interfaces:**
- Consumes: `CONFIG`, `parseCustomerMasterRows()`, `parseCopyrightMasterRows()`, `parseTitleMasterRows()`, `columnIndexToLetter()`, `normalizeHeaderText()`
- Produces:
  - `readSheetValues(spreadsheetId, sheetName)` → `Array<Array<*>>`
  - `readCustomerMaster()` → kết quả `parseCustomerMasterRows()`
  - `readCopyrightMaster()` → kết quả `parseCopyrightMasterRows()`
  - `readTitleMaster()` → `{sheet, values, headerRowIndex, headerIndex, columnCount, rows}`
  - `writeTitleMaster(sheetContext, diffResult, runAt)` → `{updatedAtCell: string|null}`
  - `stampUpdatedAt(sheet, values, headerRowIndex, runAt)` → `string|null`
  - `appendLogEntry(entry)`, `appendWarningRows(rows)`, `appendChangeDetailRows(rows)`, `notifySlack(message)`
  - Hằng tên tab: `LOG_SHEET_NAME = 'GAS2ログ'`, `WARNING_SHEET_NAME = 'GAS2警告'`, `CHANGE_DETAIL_SHEET_NAME = 'GAS2変更詳細'`

- [ ] **Step 1: Viết test cho phần THUẦN VỊ TRÍ của io.js**

`stampUpdatedAt` không gọi `SpreadsheetApp` ở tầng ngoài — nó chỉ quét mảng `values` rồi gọi `sheet.getRange().setValue()`. Test được bằng một sheet giả. Thêm `test_updatedAt` vào `tools/verify-gas2/tests.js` (mảng `unit`):

```js
function test_updatedAt(ctx) {
  var src = ctx.src;
  var check = ctx.check;
  var written = [];
  var fakeSheet = {
    getRange: function (row, column) {
      return { setValue: function (value) { written.push([row, column, value]); } };
    },
  };

  // Layout ガワ thật: nhãn 更新日 ở B5, giá trị vào C5. headerRowIndex = 14 (hàng 15).
  var values = [];
  for (var i = 0; i < 15; i++) values.push(['', '', '']);
  values[3] = ['', '更新チーム', '営業'];
  values[4] = ['', '更新日', new Date(2026, 6, 21)];
  values[7] = ['', '①更新タイミング：毎週XX曜日', ''];

  var runAt = new Date(2026, 7, 19, 9, 30);
  var cell = src.stampUpdatedAt(fakeSheet, values, 14, runAt);
  check('stampUpdatedAt ghi vao dung o C5', cell, 'C5');
  check('stampUpdatedAt ghi Date chu khong phai chuoi',
    [written.length, written[0][0], written[0][1], src.toDateKey(written[0][2])],
    [1, 5, 3, '2026-8-19']);

  // Nhãn giả trong vùng DỮ LIỆU (dưới hàng header) không được ghi nhầm vào.
  var withNoise = values.slice();
  withNoise.push(['', '更新日', 'ô 備考 của một tác phẩm']);
  written.length = 0;
  var again = src.stampUpdatedAt(fakeSheet, withNoise, 14, runAt);
  check('chi quet cac hang TREN hang header', [again, written.length], ['C5', 1]);
}
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `node tools/verify-gas2/run.js`
Expected: crash `TypeError: src.stampUpdatedAt is not a function`

- [ ] **Step 3: Viết `gas2/io.js`**

```js
// gas2/io.js — CHỖ DUY NHẤT NÓI CHUYỆN VỚI GOOGLE.
//
// Mọi hàm ở đây CHỈ chạy được trong Apps Script (SpreadsheetApp / UrlFetchApp /
// PropertiesService), nên KHÔNG test được bằng Node — đó chính là lý do file này cố tình
// chỉ chứa đọc/ghi, không chứa quyết định nghiệp vụ nào. Kiểm phần này bằng các hàm
// probe_* trong gas2/main.js.
//
// NGOẠI LỆ DUY NHẤT: stampUpdatedAt() — mọi lời gọi API của nó nằm trong thân hàm, còn
// logic là dò vị trí trên một mảng, nên test được bằng sheet giả (xem test_updatedAt).
//
// Ba phần:
//   1. ĐỌC 2 master nguồn + ĐỌC/GHI タイトルマスタ
//   2. GHI 3 tab log (GAS2ログ, GAS2警告, GAS2変更詳細)
//   3. GỬI Slack

// ==============================================================================
// PHẦN 1 — ĐỌC/GHI SHEET
// ==============================================================================

/**
 * Đọc TOÀN BỘ giá trị ô của 1 sheet, kể cả hàng header và các hàng ghi chú phía trên.
 *
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @returns {Array<Array<*>>}
 * @throws {Error} Nếu spreadsheet không có sheet tên đó
 */
function readSheetValues(spreadsheetId, sheetName) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName + ' (spreadsheet ' + spreadsheetId + ')');
  return sheet.getDataRange().getValues();
}

/**
 * @returns {Array<object>} Kết quả parseCustomerMasterRows()
 */
function readCustomerMaster() {
  var cfg = CONFIG.SOURCES.CUSTOMER_WORK_MASTER;
  return parseCustomerMasterRows(readSheetValues(cfg.spreadsheetId, cfg.sheetName));
}

/**
 * @returns {{records: Array<object>, hasPreConfirmation: boolean}}
 */
function readCopyrightMaster() {
  var cfg = CONFIG.SOURCES.COPYRIGHT_MASTER;
  return parseCopyrightMasterRows(readSheetValues(cfg.spreadsheetId, cfg.sheetName));
}

/**
 * Mở タイトルマスタ và trả về mọi thứ mà một lần chạy cần — sheet để ghi, values để
 * stampUpdatedAt() dò ô 更新日, và kết quả parse.
 *
 * Trả `values` luôn để bên gọi không phải getDataRange() lần thứ hai: mỗi lời gọi
 * Apps Script API là một round-trip.
 *
 * columnCount = max(getLastColumn(), bề rộng hàng header) — không bao giờ ghi hẹp hơn số
 * cột đã biết, kể cả khi các cột bên phải đang trống nên getLastColumn() trả về ít hơn.
 *
 * @returns {{sheet: Sheet, values: Array<Array<*>>, headerRowIndex: number,
 *   headerIndex: Map<string,number>, columnCount: number, rows: Array<object>}}
 */
function readTitleMaster() {
  var cfg = CONFIG.OUTPUTS.TITLE_MASTER;
  var ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  var sheet = ss.getSheetByName(cfg.sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + cfg.sheetName + ' (spreadsheet ' + cfg.spreadsheetId + ')');
  var values = sheet.getDataRange().getValues();
  var parsed = parseTitleMasterRows(values);
  var headerRow = values[parsed.headerRowIndex];
  return {
    sheet: sheet,
    values: values,
    headerRowIndex: parsed.headerRowIndex,
    headerIndex: parsed.headerIndex,
    columnCount: Math.max(sheet.getLastColumn(), headerRow.length, 1),
    rows: parsed.rows,
  };
}

/**
 * Đặt kết quả diff lên sheet: update từng dòng, append các dòng mới trong 1 lệnh.
 *
 * Append bắt đầu từ max(getLastRow(), hàng header) + 1 — dùng getLastRow() chứ không phải
 * số dòng đã parse, vì phía dưới vùng dữ liệu có thể có ô ghi chú (ガワ mẫu có ghi chú ở
 * hàng 27 và 29). Ghi đè lên chúng là mất chú thích của 池永.
 *
 * @param {object} sheetContext - Kết quả readTitleMaster()
 * @param {{toUpdate: Array<object>, toAdd: Array<object>}} diffResult
 * @param {Date} runAt
 * @returns {{updatedAtCell: string|null}}
 */
function writeTitleMaster(sheetContext, diffResult, runAt) {
  var sheet = sheetContext.sheet;
  var columnCount = sheetContext.columnCount;

  diffResult.toUpdate.forEach(function (item) {
    sheet.getRange(item.sheetRow, 1, 1, columnCount).setValues([item.values]);
  });

  if (diffResult.toAdd.length > 0) {
    var startRow = Math.max(sheet.getLastRow(), sheetContext.headerRowIndex + 1) + 1;
    var values = diffResult.toAdd.map(function (item) { return item.values; });
    sheet.getRange(startRow, 1, values.length, columnCount).setValues(values);
  }

  return { updatedAtCell: stampUpdatedAt(sheet, sheetContext.values, sheetContext.headerRowIndex, runAt) };
}

// Nhãn ô 更新日 trong khối ghi chú phía trên vùng dữ liệu. Ô ngay BÊN PHẢI nhãn này nhận
// thời điểm chạy (trên ガワ hiện tại: nhãn B5, giá trị C5).
var UPDATED_AT_LABEL = '更新日';

/**
 * Ghi thời điểm chạy vào ô 更新日.
 *
 * DÒ THEO NHÃN, KHÔNG HARDCODE 'C5': 池永 chèn thêm một hàng ghi chú phía trên là C5 thành
 * C6, và hằng 'C5' sẽ âm thầm ghi đè lên một ô ghi chú thay vì báo lỗi.
 *
 * CHỈ QUÉT CÁC HÀNG TRÊN HÀNG HEADER: dưới đó là dữ liệu thật, và hàng nghìn dòng hoàn
 * toàn có thể chứa chữ 更新日 trong một ô 備考. So khớp là ĐÚNG BẰNG (sau
 * normalizeHeaderText) chứ không phải "chứa" — nếu không thì '①更新タイミング：…' và
 * '[1]更新ルール' ở ngay các hàng bên cạnh cũng khớp.
 *
 * Ghi Date object chứ không phải chuỗi: ô đó đang được định dạng ngày trên sheet.
 *
 * @param {Sheet} sheet
 * @param {Array<Array<*>>} values
 * @param {number} headerRowIndex
 * @param {Date} runAt
 * @returns {string|null} Ô đã ghi dạng A1 (vd 'C5'), null nếu không tìm thấy nhãn
 */
function stampUpdatedAt(sheet, values, headerRowIndex, runAt) {
  for (var r = 0; r < headerRowIndex; r++) {
    var row = values[r];
    if (!row) continue;
    // row.length - 1: nhãn nằm ở cột cuối cùng thì không có ô nào bên phải để ghi.
    for (var c = 0; c < row.length - 1; c++) {
      if (normalizeHeaderText(row[c]) !== UPDATED_AT_LABEL) continue;
      sheet.getRange(r + 1, c + 2).setValue(runAt);
      return columnIndexToLetter(c + 1) + (r + 1);
    }
  }
  return null;
}

// ==============================================================================
// PHẦN 2 — 3 TAB LOG
// ==============================================================================
//
// Cả 3 tab nằm trong CHÍNH spreadsheet タイトルマスタ, không phải nơi khác: đó là chỗ
// người dùng đang mở khi họ thắc mắc "sao dòng này đổi".

var LOG_SHEET_NAME = 'GAS2ログ';
var WARNING_SHEET_NAME = 'GAS2警告';
var CHANGE_DETAIL_SHEET_NAME = 'GAS2変更詳細';

var LOG_HEADER = ['開始時刻', '終了時刻', '追加行数', '更新行数',
  'タイトルNo欠落', 'タイトルNo重複', 'コピーライト未登録', '孤立行', 'エラー'];
var WARNING_HEADER = ['実行時刻', '種別', 'タイトルNo', 'タイトルID', 'タイトル名', '詳細'];
var CHANGE_DETAIL_HEADER = ['実行時刻', 'タイトルNo', 'タイトル名', '項目', '変更前', '変更後'];

/**
 * Lấy 1 tab log, tự tạo nếu chưa có, và tự NÂNG CẤP hàng header nếu tab đã tồn tại với
 * bộ cột cũ (thêm cột vào LOG_HEADER về sau mà không phải xoá tab bằng tay).
 *
 * @param {string} sheetName
 * @param {Array<string>} header
 * @returns {Sheet}
 */
function getOrCreateLogTab(sheetName, header) {
  var ss = SpreadsheetApp.openById(CONFIG.OUTPUTS.TITLE_MASTER.spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
    return sheet;
  }
  var width = Math.max(sheet.getLastColumn(), header.length);
  var current = sheet.getRange(1, 1, 1, width).getValues()[0];
  var same = header.every(function (name, i) {
    return String(current[i] === undefined || current[i] === null ? '' : current[i]) === name;
  });
  if (!same) sheet.getRange(1, 1, 1, header.length).setValues([header]);
  return sheet;
}

/**
 * Ghi 1 dòng log cho 1 lần chạy — gọi ở CẢ nhánh thành công lẫn nhánh catch của runGas2().
 *
 * Mọi field số đếm đều TUỲ CHỌN (thiếu thì ghi 0) để nhánh catch gọi được với entry tối thiểu.
 *
 * @param {{startedAt: Date, finishedAt: Date, addedCount: number, updatedCount: number,
 *   missingNoCount: number, duplicateNoCount: number, noCopyrightCount: number,
 *   orphanCount: number, errors: Array<string>}} entry
 * @returns {void}
 */
function appendLogEntry(entry) {
  var sheet = getOrCreateLogTab(LOG_SHEET_NAME, LOG_HEADER);
  sheet.appendRow([
    entry.startedAt,
    entry.finishedAt,
    entry.addedCount || 0,
    entry.updatedCount || 0,
    entry.missingNoCount || 0,
    entry.duplicateNoCount || 0,
    entry.noCopyrightCount || 0,
    entry.orphanCount || 0,
    (entry.errors || []).join(' / '),
  ]);
}

/**
 * Ghi nhiều dòng cảnh báo trong 1 lệnh setValues().
 *
 * Rows rỗng -> không làm gì: không tạo dòng trống, và cũng không tạo tab GAS2警告 nếu lần
 * chạy đó hoàn toàn sạch.
 *
 * @param {Array<{runAt: Date, kind: string, titleNo: *, titleId: *, titleName: *, detail: string}>} rows
 * @returns {void}
 */
function appendWarningRows(rows) {
  if (!rows || rows.length === 0) return;
  var sheet = getOrCreateLogTab(WARNING_SHEET_NAME, WARNING_HEADER);
  var startRow = sheet.getLastRow() + 1;
  var values = rows.map(function (row) {
    return [row.runAt, row.kind, row.titleNo, row.titleId, row.titleName, row.detail];
  });
  sheet.getRange(startRow, 1, values.length, WARNING_HEADER.length).setValues(values);
}

/**
 * Ghi nhiều dòng log chi tiết (1 dòng = 1 cột của 1 tác phẩm đã đổi).
 *
 * @param {Array<{runAt: Date, titleNo: *, titleName: *, field: string, oldValue: *, newValue: *}>} rows
 * @returns {void}
 */
function appendChangeDetailRows(rows) {
  if (!rows || rows.length === 0) return;
  var sheet = getOrCreateLogTab(CHANGE_DETAIL_SHEET_NAME, CHANGE_DETAIL_HEADER);
  var startRow = sheet.getLastRow() + 1;
  var values = rows.map(function (row) {
    return [row.runAt, row.titleNo, row.titleName, row.field, row.oldValue, row.newValue];
  });
  sheet.getRange(startRow, 1, values.length, CHANGE_DETAIL_HEADER.length).setValues(values);
}

// ==============================================================================
// PHẦN 3 — SLACK
// ==============================================================================

/**
 * Gửi 1 tin nhắn Slack. Không cấu hình token/channel thì IM LẶNG bỏ qua.
 *
 * Im lặng là cố ý: Slack là kênh thông báo phụ, không phải điều kiện để GAS❷ chạy được.
 * Throw ở đây sẽ biến "chưa điền Script Property" thành "cả lần chạy thất bại".
 *
 * Điền 2 giá trị thật qua Apps Script editor > Project Settings > Script Properties, tên
 * property lấy từ CONFIG.SLACK_PROPERTY_KEYS.
 *
 * @param {string} message
 * @returns {void}
 */
function notifySlack(message) {
  var properties = PropertiesService.getScriptProperties();
  var token = properties.getProperty(CONFIG.SLACK_PROPERTY_KEYS.BOT_TOKEN);
  var channel = properties.getProperty(CONFIG.SLACK_PROPERTY_KEYS.CHANNEL_ID);
  if (!token || !channel) return;
  UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ channel: channel, text: message }),
    muteHttpExceptions: true,
  });
}
```

- [ ] **Step 4: Thêm `gas2/io.js` vào `PURE_FILES`**

```js
const PURE_FILES = ['gas2/common.js', 'gas2/config.js', 'gas2/sources.js',
  'gas2/titleMaster.js', 'gas2/io.js'];
```

Nạp được vì mọi lời gọi `SpreadsheetApp`/`UrlFetchApp` nằm TRONG thân hàm — nạp file không chạm tới API nào. Ranh giới phải giữ: **không test nào được gọi** `readCustomerMaster`/`readTitleMaster`/`writeTitleMaster`/`appendLogEntry`/`notifySlack` — chúng ném `ReferenceError` ở Node và đó là hành vi đúng.

- [ ] **Step 5: Chạy test — phải XANH**

Run: `node tools/verify-gas2/run.js`
Expected: `43 passed, 0 failed`

- [ ] **Step 6: Commit**

```bash
git add gas2/io.js tools/verify-gas2/
git commit -m "Keep every Google call behind one door"
```

---

### Task 8: `gas2/main.js` — `runGas2()`, trigger, probe

**Files:**
- Create: `gas2/main.js`
- Test: chạy tay trong Apps Script editor (file này là tầng dàn dựng, cố tình không nạp vào harness Node — cùng lối với `src/main.js`)

**Interfaces:**
- Consumes: toàn bộ interface của Task 2–7
- Produces: `runGas2()`, `createGas2Trigger()`, `probe_readTitleMasterHeader()`, `probe_readCustomerMaster()`, `probe_readCopyrightMaster()`, `probe_dryRunDiff()`

- [ ] **Step 1: Viết `gas2/main.js`**

```js
// gas2/main.js — TẦNG DÀN DỰNG của GAS❷.
//
// File này KHÔNG được nạp vào harness Node (tools/verify-gas2/run.js): nó chỉ ghép các
// mảnh đã test lại với nhau và gọi tầng io. Kiểm nó bằng các hàm probe_* ở cuối file,
// chạy tay trong Apps Script editor.
//
// Điểm vào: runGas2(). Cài lịch: chạy tay createGas2Trigger() MỘT lần.

/**
 * Một lần chạy GAS❷: đọc 2 master nguồn, diff với タイトルマスタ, ghi phần khác biệt,
 * đóng dấu 更新日, ghi 3 tab log.
 *
 * HAI MỨC LỖI NGUỒN, CỐ Ý KHÁC NHAU (spec §7):
 *   顧客作品マスタ (nguồn CHÍNH) đọc không được -> throw ra ngoài, KHÔNG ghi một ô nào lên
 *     タイトルマスタ. Ghi tiếp với danh sách rỗng sẽ biến mọi tác phẩm thành 孤立行.
 *   コピーライトマスタ (nguồn PHỤ) đọc không được -> copyrightAvailable = false, 3 cột
 *     S/T/AA giữ nguyên giá trị đang có và lần chạy VẪN tiếp tục. Bắt buộc phải vậy: S/T
 *     là cột GAS❷ ghi đè hoàn toàn, coi "không đọc được" = "rỗng" sẽ xoá sạch copyright
 *     của toàn bộ tác phẩm chỉ vì một lần mất quyền truy cập.
 *
 * @returns {void}
 */
function runGas2() {
  var startedAt = new Date();
  var errors = [];
  var addedCount = 0;
  var updatedCount = 0;
  var warnings = [];

  try {
    // Nguồn chính — không bọc try/catch: hỏng thì cả lần chạy phải dừng.
    var customerRecords = readCustomerMaster();

    // Nguồn phụ.
    var copyrightRecords = [];
    var copyrightAvailable = true;
    var preConfirmationAvailable = false;
    try {
      var copyright = readCopyrightMaster();
      copyrightRecords = copyright.records;
      preConfirmationAvailable = copyright.hasPreConfirmation;
      if (!preConfirmationAvailable) {
        warnings.push({
          runAt: startedAt, kind: 'コピーライト未登録', titleNo: '', titleId: '', titleName: '',
          detail: 'コピーライトマスタ chưa có cột 出版社事前確認 — cột AA của タイトルマスタ được giữ nguyên. Thêm cột đúng tên này vào nguồn là đủ để kích hoạt.',
        });
      }
    } catch (copyrightError) {
      copyrightAvailable = false;
      errors.push('コピーライトマスタ đọc không được (3 cột S/T/AA giữ nguyên): ' + String(copyrightError));
    }

    var titleMaster = readTitleMaster();
    var result = diffTitleMaster({
      customerRecords: customerRecords,
      copyrightLookup: buildCopyrightLookup(copyrightRecords),
      copyrightAvailable: copyrightAvailable,
      preConfirmationAvailable: preConfirmationAvailable,
      existing: titleMaster.rows,
      headerIndex: titleMaster.headerIndex,
      columnCount: titleMaster.columnCount,
      runAt: startedAt,
    });

    writeTitleMaster(titleMaster, result, startedAt);
    addedCount = result.toAdd.length;
    updatedCount = result.toUpdate.length;
    warnings = warnings.concat(result.warnings);
    appendWarningRows(warnings);
    appendChangeDetailRows(result.changeDetails);
  } catch (error) {
    errors.push(String(error));
    notifySlack('GAS❷ タイトルマスタ thất bại: ' + String(error));
  }

  appendLogEntry({
    startedAt: startedAt,
    finishedAt: new Date(),
    addedCount: addedCount,
    updatedCount: updatedCount,
    missingNoCount: countWarnings(warnings, WARNING_KIND_MISSING_NO),
    duplicateNoCount: countWarnings(warnings, WARNING_KIND_DUPLICATE_NO),
    noCopyrightCount: countWarnings(warnings, WARNING_KIND_NO_COPYRIGHT),
    orphanCount: countWarnings(warnings, WARNING_KIND_ORPHAN),
    errors: errors,
  });
}

/**
 * Đếm số cảnh báo thuộc 1 loại — dùng cho các cột đếm của GAS2ログ.
 *
 * @param {Array<{kind: string}>} warnings
 * @param {string} kind
 * @returns {number}
 */
function countWarnings(warnings, kind) {
  var count = 0;
  warnings.forEach(function (w) { if (w.kind === kind) count += 1; });
  return count;
}

/**
 * Xoá mọi trigger cũ của runGas2 rồi cài lại theo CONFIG.TRIGGER_HOURS.
 *
 * PHẢI CHẠY TAY MỘT LẦN sau khi đổi CONFIG.TRIGGER_HOURS — Apps Script không tự đọc lại.
 *
 * nearMinute(): trigger everyDays() của Apps Script chỉ nhận "gần phút thứ N", Google chạy
 * trong khoảng ±15 phút. Không có API đặt đúng phút cho trigger hằng ngày.
 *
 * @returns {void}
 */
function createGas2Trigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'runGas2') ScriptApp.deleteTrigger(trigger);
  });
  CONFIG.TRIGGER_HOURS.forEach(function (hour) {
    ScriptApp.newTrigger('runGas2')
      .timeBased()
      .atHour(hour)
      .nearMinute(CONFIG.TRIGGER_MINUTE)
      .everyDays(1)
      .inTimezone(CONFIG.TRIGGER_TIMEZONE)
      .create();
  });
}

// ==============================================================================
// PROBE — chạy tay trong Apps Script editor, KHÔNG ghi gì lên sheet
// ==============================================================================

/**
 * Xác nhận タイトルマスタ đọc được: đúng sheet, đúng hàng header, đủ 24 tên cột.
 *
 * CHẠY HÀM NÀY TRƯỚC LẦN CHẠY THẬT ĐẦU TIÊN. Nó là chỗ duy nhất phát hiện được việc một
 * tên trong TITLE_COLUMNS lệch so với sheet thật (thường là ngoặc full-width vs half-width)
 * mà không phải ghi thử lên master.
 *
 * @returns {void}
 */
function probe_readTitleMasterHeader() {
  var titleMaster = readTitleMaster();
  Logger.log('sheet: ' + CONFIG.OUTPUTS.TITLE_MASTER.sheetName);
  Logger.log('hàng header (1-based): ' + (titleMaster.headerRowIndex + 1));
  Logger.log('columnCount: ' + titleMaster.columnCount);
  Logger.log('số dòng có タイトルNo: ' + titleMaster.rows.length);
  // columnIndexToLetter() nhận index 0-BASED, còn col() vốn đã trả 0-based — truyền
  // thẳng, KHÔNG cộng 1 (cộng 1 sẽ in lệch đúng 1 cột và biến log chẩn đoán thành thứ
  // gây hiểu nhầm).
  TITLE_COLUMNS.forEach(function (column) {
    Logger.log(column.header + ' -> cột ' + columnIndexToLetter(col(titleMaster.headerIndex, column.header)));
  });
}

/**
 * @returns {void}
 */
function probe_readCustomerMaster() {
  var records = readCustomerMaster();
  Logger.log('số dòng đọc được: ' + records.length);
  Logger.log('dòng đầu: ' + JSON.stringify(records[0]));
}

/**
 * @returns {void}
 */
function probe_readCopyrightMaster() {
  var result = readCopyrightMaster();
  Logger.log('số dòng đọc được: ' + result.records.length);
  Logger.log('có cột 出版社事前確認: ' + result.hasPreConfirmation);
  Logger.log('dòng đầu: ' + JSON.stringify(result.records[0]));
}

/**
 * Chạy trọn vẹn phần TÍNH TOÁN của một lần chạy rồi in kết quả — KHÔNG ghi gì lên sheet,
 * không ghi cả log.
 *
 * Đây là hàm để chạy trước lần chạy thật: nếu nó báo "sẽ thêm 8.000 dòng, sửa 8.000 dòng"
 * thì có gì đó sai với khoá join, và biết điều đó TRƯỚC khi ghi rẻ hơn nhiều so với sau.
 *
 * @returns {void}
 */
function probe_dryRunDiff() {
  var runAt = new Date();
  var customerRecords = readCustomerMaster();
  var copyright = readCopyrightMaster();
  var titleMaster = readTitleMaster();
  var result = diffTitleMaster({
    customerRecords: customerRecords,
    copyrightLookup: buildCopyrightLookup(copyright.records),
    copyrightAvailable: true,
    preConfirmationAvailable: copyright.hasPreConfirmation,
    existing: titleMaster.rows,
    headerIndex: titleMaster.headerIndex,
    columnCount: titleMaster.columnCount,
    runAt: runAt,
  });
  Logger.log('sẽ THÊM: ' + result.toAdd.length + ' dòng');
  Logger.log('sẽ SỬA: ' + result.toUpdate.length + ' dòng');
  Logger.log('cảnh báo: ' + result.warnings.length + ' dòng');
  Logger.log('chi tiết thay đổi: ' + result.changeDetails.length + ' dòng');
  result.warnings.slice(0, 20).forEach(function (w) {
    Logger.log('[' + w.kind + '] ' + w.titleNo + ' ' + w.titleName + ' — ' + w.detail);
  });
}
```

- [ ] **Step 2: Chạy lại harness để chắc `main.js` không lọt vào `PURE_FILES`**

Run: `node tools/verify-gas2/run.js`
Expected: `43 passed, 0 failed` (số không đổi so với Task 7 — `main.js` cố tình không được nạp)

- [ ] **Step 3: Push lên Apps Script project và chạy 2 probe an toàn**

```bash
cd gas2 && npx clasp push
```

Trong Apps Script editor, chạy theo thứ tự: `probe_readCustomerMaster()` → `probe_readCopyrightMaster()` → `probe_readTitleMasterHeader()` → `probe_dryRunDiff()`.

Kiểm 3 điều trước khi đi tiếp:
1. `probe_readTitleMasterHeader` in ra hàng header là **15** và 24 dòng map cột, không throw.
2. `probe_readCopyrightMaster` in `có cột 出版社事前確認: true/false` — ghi lại giá trị thật, nó quyết định cột AA có được ghi hay không.
3. `probe_dryRunDiff` in số dòng thêm/sửa **hợp lý** (lần đầu: thêm ≈ số dòng của 顧客作品マスタ, sửa ≈ 0).

**Nếu số "sẽ SỬA" gần bằng tổng số dòng ở lần chạy thứ hai** → có churn, dừng lại và tìm cột nào bị so nhầm kiểu trước khi chạy `runGas2()`.

- [ ] **Step 4: Chạy thật `runGas2()` một lần trong editor, rồi chạy lại lần thứ hai**

Lần 1: `タイトルマスタ` được điền, `GAS2ログ` có 1 dòng.
Lần 2 (chạy ngay sau đó): `追加行数` và `更新行数` phải là **0**, `GAS2変更詳細` không có dòng mới. Đây là bằng chứng cuối cùng rằng không có churn.

- [ ] **Step 5: Cài trigger**

Chạy `createGas2Trigger()` một lần trong editor. Kiểm ở tab Triggers: đúng 2 trigger `runGas2`, 9h và 17h.

- [ ] **Step 6: Commit**

```bash
git add gas2/main.js
git commit -m "Run the whole thing on a schedule, and give it probes to run first"
```

---

### Task 9: Tài liệu vận hành

**Files:**
- Create: `docs/gas2-so-do-don-gian.md`
- Modify: `docs/superpowers/specs/2026-08-19-gas2-title-master-design.md` (§11 — ghi lại kết quả thật của probe)

**Interfaces:**
- Consumes: hành vi đã chạy thật ở Task 8
- Produces: tài liệu

- [ ] **Step 1: Viết `docs/gas2-so-do-don-gian.md`**

Theo đúng khuôn của `docs/gas1-so-do-don-gian.md`: mở đầu bằng một câu tóm tắt, sơ đồ `mermaid flowchart TD`, rồi các mục. Nội dung bắt buộc phải có:

- **Một câu:** GAS❷ đọc 2 master của GAS❶, ghi 24/36 cột của `タイトルマスタ` bằng diff theo `タイトルNo`, chạy 9:30 và 17:30 giờ Nhật.
- **Sơ đồ:** 2 nguồn → diff theo `タイトルNo` → `タイトルマスタ` + 3 tab log; nhánh 孤立行 rẽ sang cảnh báo chứ không xoá.
- **Bảng 24 cột** copy từ §3 của spec.
- **12 cột GAS❷ không đụng** và lý do từng cột (§1 của spec).
- **Cách chạy tay:** mở project GAS❷, chạy `runGas2()`; chạy `probe_dryRunDiff()` trước nếu muốn xem sẽ đổi gì.
- **Cách đọc 3 tab log**, kèm 4 loại cảnh báo và việc phải làm với từng loại.
- **Cách thêm nguồn cho 1 trong 12 cột còn treo:** thêm entry vào `gas2/config.js`, thêm 1 dòng vào `TITLE_COLUMNS`, thêm field vào record của `gas2/sources.js`.
- **Cảnh báo đồng bộ `common.js`:** sửa `src/common.js` thì phải copy lại sang `gas2/common.js`.

- [ ] **Step 2: Cập nhật §11 của spec bằng số liệu thật**

Thay bảng "Việc còn treo" bằng bảng đã cập nhật, và thêm một dòng ghi kết quả `probe_readCopyrightMaster` (cột `出版社事前確認` đã tồn tại bên nguồn hay chưa) — đây là thông tin lần chạy thật mới trả lời được.

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "Describe GAS2 the way an operator needs it, not the way it was built"
```

---

## Self-Review

**1. Spec coverage**

| Mục spec | Task |
|---|---|
| §1 phạm vi 24 cột / 12 cột không đụng | Task 3 (`TITLE_COLUMNS`), Task 3 Step 1 (test bảo toàn) |
| §2 vào/ra, 3 spreadsheet ID | Task 1 (`config.js`), Task 7 (`io.js`) |
| §3 bảng map 23 cột | Task 3 (`TITLE_COLUMNS`), Task 6 (đối chiếu tên cột với ガワ thật) |
| §3 header có `\n`, ngoặc full/half-width | Global Constraints, Task 1 Step 5, Task 6 Step 4 |
| §3.1 `E マスタ追加日` write-once | Task 3 (`source: 'stamp'`), Task 5 (test 3 ca write-once) |
| §4 cấu trúc `gas2/`, `common.js` là bản copy | Task 1 |
| §5 luồng 8 bước | Task 8 (`runGas2`) |
| §5 bước 4 dựng-từ-`rawRow` | Task 3 (`titleRecordToRow`), Task 3 Step 1 (test cột lạ) |
| §5 bước 5 so bằng `sameValue`/`sameDateValue` | Task 5 (`collectChangedColumns`) |
| §6 4 ca bất thường | Task 4 (2 ca khoá), Task 5 (2 ca còn lại) |
| §7 2 mức lỗi nguồn | Task 8 (`runGas2`), Task 3 + Task 5 (cờ `copyrightAvailable`) |
| §8 3 tab log | Task 7 |
| §9 trigger 9:30/17:30 | Task 1 (`CONFIG`), Task 8 (`createGas2Trigger`) |
| §10 5 nhóm test | Task 3 (map cột, bảo toàn), Task 5 (write-once, diff), Task 4+5 (4 ca bất thường), Task 6 (ガワ thật), Task 8 (probe) |
| §11 việc còn treo | Task 9 |

Không có mục nào của spec thiếu task.

**2. Placeholder scan**

Không có `TBD`/`TODO`/"tương tự Task N". Hai chỗ cố ý để engineer tự xác minh, cả hai đều nói rõ phải kiểm cái gì và làm gì với kết quả: Task 6 Step 4 (tên cột lệch so với ガワ thật) và Task 8 Step 3 (thấy churn ở lần dry-run thứ hai).

Ba giả định về mã nguồn hiện có đã được KIỂM CHỨNG trên `src/common.js` và `tools/verify/exportFixtures.py`, không phải suy đoán: `tryCol()` trả `undefined` khi thiếu cột (Task 2), `columnIndexToLetter()` nhận index 0-based (Task 8), và `main()` của exporter có vòng lặp inline cần rút hàm ra (Task 6).

**3. Type consistency** — đã đối chiếu, các tên dùng xuyên suốt khớp nhau:
`parseCustomerMasterRows` → `Array<record>`; `parseCopyrightMasterRows` → `{records, hasPreConfirmation}` (Task 2 định nghĩa, Task 7 `readCopyrightMaster` trả nguyên, Task 8 đọc `.records`/`.hasPreConfirmation`); `parseTitleMasterRows` → `{headerRowIndex, headerIndex, rows}` (Task 4 định nghĩa, Task 7 `readTitleMaster` bọc lại thêm `sheet`/`values`/`columnCount`); `titleRecordToRow(options)` nhận đúng 8 key ở cả Task 3 và Task 5; `diffTitleMaster(options)` nhận đúng 8 key ở cả Task 5, Task 6 và Task 8; 4 hằng `WARNING_KIND_*` (Task 4) được dùng lại ở Task 5 và Task 8; `blankIfEmpty()` khai báo ở Task 3, dùng ở Task 4 và Task 5.

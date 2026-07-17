# GAS❶ Customer Work Master / Copyright Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Google Apps Script (GAS) project that auto-generates and upserts `顧客作品マスタ` and `コピーライトマスタ` from 3 source spreadsheets, twice a day, per `docs/superpowers/specs/2026-07-17-gas1-customer-copyright-master-design.md`.

**Architecture:** Pure business logic (source parsing, master building, copyright priority resolution, upsert diffing, history shifting) lives in plain JS modules that are dual-loadable by Node (for Jest tests) and by the Apps Script V8 runtime (for production). A thin GAS-only I/O layer (`src/io/*.js`) wraps `SpreadsheetApp`/`UrlFetchApp`/`PropertiesService` and is verified manually in the Apps Script editor, since it can't run under Jest. `src/main.js` orchestrates: read 3 sources → build customer work rows → upsert into 顧客作品マスタ → resolve copyright per row (4-tier) → upsert into コピーライトマスタ with history shifting → log → Slack-notify on exceptions/cá biệt cases. A time-based trigger runs this at 9:00 and 18:00 Asia/Tokyo.

**Tech Stack:** Google Apps Script (V8 runtime), clasp (already authenticated), Node.js + Jest for local unit tests of pure logic, Slack Web API (`chat.postMessage`).

## Global Constraints

- Read 3 sources directly via `SpreadsheetApp.openById()` — no IMPORTRANGE (spec §5).
- Time-based trigger: 9:00 and 18:00 Asia/Tokyo (spec §5, matches `appsscript.json` `timeZone`).
- Upsert only — never delete existing rows; unchanged rows are not rewritten (spec §7).
- `正規コピーライト` history: shift into `CopyRight 過去1`..`10` only when the value actually changes; unchanged values must not touch history columns (spec §6).
- Copyright priority order: CMS column U → per-publisher sheet → 基本のC表記 auto-generation → cá biệt (spec §6).
- Slack via Web API `chat.postMessage` with Bearer token, not Incoming Webhook; token/channel read from `PropertiesService` (`SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`), no-op (log only) if either is unset (spec §8).
- Source/output spreadsheet IDs are exact and must be used verbatim (spec §3, §4).
- 配信停止タイトル source is out of scope this iteration — leave `配信NGフラグ` column always empty (spec §3.4).

---

## File Structure

```
appsscript.json                        (existing, unchanged)
.clasp.json                            (existing, unchanged)
.claspignore                           (new — keeps Node/test tooling out of the pushed GAS project)
package.json                           (new — Jest devDependency)
jest.config.js                         (new)
src/
  config.js                           (spreadsheet IDs, sheet names, constants)
  sources/
    regulationSource.js               (parse 作品レギュレーション判定)
    cmsSource.js                      (parse 先行タイトル情報(CMS))
    ngTitleSource.js                  (parse 外部出稿用NGタイトル)
    copyrightRules.js                 (parse 基本のC表記 + 5 per-publisher sheets + registry)
  logic/
    customerWorkMaster.js             (build 顧客作品マスタ rows)
    copyrightResolver.js              (4-tier copyright priority)
    upsert.js                         (generic key-based diff/upsert + numbering)
    copyrightHistory.js               (history-shift on change)
  io/
    sheetIO.js                        (GAS-only: read/write via SpreadsheetApp)
    slack.js                          (GAS-only: notifySlack via UrlFetchApp)
    logSheet.js                       (GAS-only: append log rows)
  main.js                             (orchestration: runGas1(), createGas1Trigger())
tests/
  sources/
    regulationSource.test.js
    cmsSource.test.js
    ngTitleSource.test.js
    copyrightRules.test.js
  logic/
    customerWorkMaster.test.js
    copyrightResolver.test.js
    upsert.test.js
    copyrightHistory.test.js
```

`コード.js` (the empty default file from `clasp clone`) is deleted in Task 1 — it's superseded by `src/main.js`.

Every `src/**/*.js` file ends with the dual-environment export shim:

```js
if (typeof module !== 'undefined') {
  module.exports = { /* ...exported names... */ };
}
```

`module` is undefined in the Apps Script V8 runtime, so this block is inert there; in Node it lets `tests/**` `require()` the same file Apps Script runs.

---

### Task 1: Project scaffolding — Jest harness + .claspignore + delete stub

**Files:**
- Create: `package.json`
- Create: `jest.config.js`
- Create: `.claspignore`
- Delete: `コード.js`
- Test: `tests/sanity.test.js`

**Interfaces:**
- Produces: a working `npm test` command; a `.claspignore` that keeps `node_modules/`, `tests/`, `package.json`, `package-lock.json`, `jest.config.js`, `docs/`, `example/`, and markdown files out of `clasp push`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "ntt-solmare-gas1",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "jest"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` created, no errors.

- [ ] **Step 3: Write `jest.config.js`**

```js
module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
};
```

- [ ] **Step 4: Write `.claspignore`**

```
**/node_modules/**
tests/**
package.json
package-lock.json
jest.config.js
docs/**
example/**
.code-review-graph/**
.git/**
*.md
```

- [ ] **Step 5: Delete the empty stub file**

Run: `rm "コード.js"`
Expected: file no longer present (its logic is superseded by `src/main.js` in Task 11).

- [ ] **Step 6: Write the sanity test**

```js
// tests/sanity.test.js
test('jest harness runs', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 7: Run tests to verify the harness works**

Run: `npx jest`
Expected: `1 passed, 1 total`

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json jest.config.js .claspignore tests/sanity.test.js
git rm "コード.js"
git commit -m "chore: set up Jest test harness and .claspignore for GAS❶"
```

---

### Task 2: `src/config.js` — spreadsheet IDs, sheet names, constants

**Files:**
- Create: `src/config.js`
- Test: `tests/config.test.js`

**Interfaces:**
- Produces: `CONFIG` object with `SOURCES.*`, `OUTPUTS.*`, `TRIGGER_HOURS`, `SLACK_PROPERTY_KEYS` — consumed by every later task.

- [ ] **Step 1: Write the failing test**

```js
// tests/config.test.js
const { CONFIG } = require('../src/config');

test('CONFIG has all 3 source spreadsheet IDs from info.md', () => {
  expect(CONFIG.SOURCES.REGULATION.spreadsheetId).toBe('1T8CooSrzcbZi768KXT7zTUlzpgz4dap0zWUJCkE5jZg');
  expect(CONFIG.SOURCES.CMS.spreadsheetId).toBe('1vU82_heOwwcYlJr9kv9VEqJVKu3kUPz9gh9R5_ycR0k');
  expect(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId).toBe('1y5l36o6mvQAtfx3xn3YC4EYa5vn5fy7g2KeWvv5faD8');
});

test('CONFIG has both output spreadsheet IDs', () => {
  expect(CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER.spreadsheetId).toBe('1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU');
  expect(CONFIG.OUTPUTS.COPYRIGHT_MASTER.spreadsheetId).toBe('1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc');
});

test('TRIGGER_HOURS is [9, 18]', () => {
  expect(CONFIG.TRIGGER_HOURS).toEqual([9, 18]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/config.test.js`
Expected: FAIL with "Cannot find module '../src/config'"

- [ ] **Step 3: Write `src/config.js`**

```js
// src/config.js
var CONFIG = {
  SOURCES: {
    REGULATION: {
      spreadsheetId: '1T8CooSrzcbZi768KXT7zTUlzpgz4dap0zWUJCkE5jZg',
      sheetName: 'シート1',
    },
    CMS: {
      spreadsheetId: '1vU82_heOwwcYlJr9kv9VEqJVKu3kUPz9gh9R5_ycR0k',
      sheetName: '★列追加の場合は増渕まで★',
    },
    PUBLISHER_RULES: {
      spreadsheetId: '1y5l36o6mvQAtfx3xn3YC4EYa5vn5fy7g2KeWvv5faD8',
      sheets: {
        NG_TITLES: '外部出稿用NGタイトル',
        BASIC_NOTATION: '基本のC表記',
        LINE: 'LINEコピーライト一覧',
        SQUARE_ENIX: 'スクエニコピーライト一覧',
        LIBRE: 'リブレコピーライト',
        OVERLAP: 'オーバーラップ_コピーライト一覧',
        HEROES: 'ヒーローズコピーライト一覧',
      },
    },
  },
  OUTPUTS: {
    CUSTOMER_WORK_MASTER: {
      spreadsheetId: '1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU',
      sheetName: '顧客作品マスタ',
    },
    COPYRIGHT_MASTER: {
      spreadsheetId: '1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc',
      sheetName: 'コピーライトマスタ',
    },
  },
  TRIGGER_HOURS: [9, 18],
  TRIGGER_TIMEZONE: 'Asia/Tokyo',
  SLACK_PROPERTY_KEYS: {
    BOT_TOKEN: 'SLACK_BOT_TOKEN',
    CHANNEL_ID: 'SLACK_CHANNEL_ID',
  },
  COPYRIGHT_HISTORY_SLOTS: 10,
};

if (typeof module !== 'undefined') {
  module.exports = { CONFIG };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/config.test.js`
Expected: `3 passed, 3 total`

- [ ] **Step 5: Commit**

```bash
git add src/config.js tests/config.test.js
git commit -m "feat(gas1): add CONFIG module with source/output spreadsheet IDs"
```

---

### Task 3: `src/sources/regulationSource.js` — parse 作品レギュレーション判定

**Files:**
- Create: `src/sources/regulationSource.js`
- Test: `tests/sources/regulationSource.test.js`

**Interfaces:**
- Consumes: raw 2D array as returned by `sheet.getDataRange().getValues()` for the `シート1` sheet (real header is row 4, i.e. index 3; data starts row 5, i.e. index 4; only rows where column index 1 `ステータス` === `'判定済み'` are usable — see spec §3.1).
- Produces: `parseRegulationRows(rawRows) -> Array<{cmsId: number|string, titleId: number|string, titleName: string, logoJudgement: string}>` and `buildRegulationLookup(records) -> Map<string, string>` keyed by `String(cmsId)`, value = `logoJudgement`.

- [ ] **Step 1: Write the failing test**

```js
// tests/sources/regulationSource.test.js
const { parseRegulationRows, buildRegulationLookup } = require('../../src/sources/regulationSource');

const RAW_ROWS = [
  [null, null, null, null, null, null, null, null, '①広告出稿ポリシー', null, null, null, null, null],
  [null, null, null, null, null, null, null, null, '②一般面出稿ＮＧ', null, null, null, null, null],
  [null, 'B列（ステータス）が「判定済み」のもののみ進行可', null, null, null, null, null, null, '③シーモアロゴ判定', null, null, null, null, null],
  ['No', 'ステータス', '更新日', 'ＣＭＳID', 'タイトルＩＤ', 'タイトル名', 'ジャンル', '出版社', '①広告出稿ポリシー\n（出稿NG）', '②一般面出稿NG\n（アダルト作品扱い）', '③シーモアロゴ判定', '使用NGコマ格納場所', '変更日', 'シーモアロゴ判定変更前の判定'],
  [1, '判定済み', null, 5948, 333581, 'サンプルタイトルA', 'TL', null, '問題なし', '一般面OK', 'ロゴなし', null, null, null],
  [2, '判定中', null, 5873, 332770, 'サンプルタイトルB', 'BL', null, '問題なし', '一般面OK', 'ロゴあり', null, null, null],
  [3, '判定済み', null, 5717, 332061, 'サンプルタイトルC', 'TL', null, '問題なし', 'アダルト作品扱い', 'ロゴなし', null, null, null],
];

test('parseRegulationRows skips the 4 header rows and non-判定済み rows', () => {
  const records = parseRegulationRows(RAW_ROWS);
  expect(records).toHaveLength(2);
  expect(records[0]).toEqual({ cmsId: 5948, titleId: 333581, titleName: 'サンプルタイトルA', logoJudgement: 'ロゴなし' });
  expect(records[1]).toEqual({ cmsId: 5717, titleId: 332061, titleName: 'サンプルタイトルC', logoJudgement: 'ロゴなし' });
});

test('buildRegulationLookup keys by cmsId as string', () => {
  const records = parseRegulationRows(RAW_ROWS);
  const lookup = buildRegulationLookup(records);
  expect(lookup.get('5948')).toBe('ロゴなし');
  expect(lookup.get('5717')).toBe('ロゴなし');
  expect(lookup.has('5873')).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/sources/regulationSource.test.js`
Expected: FAIL with "Cannot find module '../../src/sources/regulationSource'"

- [ ] **Step 3: Write `src/sources/regulationSource.js`**

```js
// src/sources/regulationSource.js
var HEADER_ROW_COUNT = 4; // rows 1-4 are notes/header, real data starts row 5
var STATUS_OK = '判定済み';

function parseRegulationRows(rawRows) {
  var records = [];
  for (var i = HEADER_ROW_COUNT; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || row[1] !== STATUS_OK) continue;
    records.push({
      cmsId: row[3],
      titleId: row[4],
      titleName: row[5],
      logoJudgement: row[10],
    });
  }
  return records;
}

function buildRegulationLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    if (record.cmsId === null || record.cmsId === undefined || record.cmsId === '') return;
    lookup.set(String(record.cmsId), record.logoJudgement);
  });
  return lookup;
}

if (typeof module !== 'undefined') {
  module.exports = { parseRegulationRows, buildRegulationLookup };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/sources/regulationSource.test.js`
Expected: `2 passed, 2 total`

- [ ] **Step 5: Commit**

```bash
git add src/sources/regulationSource.js tests/sources/regulationSource.test.js
git commit -m "feat(gas1): parse 作品レギュレーション判定 source"
```

---

### Task 4: `src/sources/cmsSource.js` — parse 先行タイトル情報(CMS)

**Files:**
- Create: `src/sources/cmsSource.js`
- Test: `tests/sources/cmsSource.test.js`

**Interfaces:**
- Consumes: raw 2D array for sheet `★列追加の場合は増渕まで★`; header is row 1 (index 0), data starts row 2 (index 1); column index 20 (column U) is `コピーライト` (spec §3.2).
- Produces: `parseCmsRows(rawRows) -> Array<{cmsId, titleId, titleName, author, genre, label, publisher, preStart, preEnd, copyrightU}>` (skips rows with empty `cmsId`), and `buildCmsCopyrightLookup(records) -> Map<string, string>` keyed by `String(cmsId)` for non-empty `copyrightU`.

- [ ] **Step 1: Write the failing test**

```js
// tests/sources/cmsSource.test.js
const { parseCmsRows, buildCmsCopyrightLookup } = require('../../src/sources/cmsSource');

function makeRow(overrides) {
  var row = new Array(25).fill(null);
  Object.keys(overrides).forEach(function (key) {
    row[Number(key)] = overrides[key];
  });
  return row;
}

const HEADER = [
  'CMSID', '変更区分', '記入日', '更新日', 'タイトルID', 'タイトル名', '巻数', '作家名', 'ジャンル',
  'R18フラグ(TL、BL)', 'レーベル名', '出版社', '先行開始日', '先行終了日', 'アダルト作品扱い',
  'アダルト媒体での出稿可否', '作品備考', 'コミット', '素材フォルダパス', '素材ステータス',
  'コピーライト', 'タイトル詳細文', '書影', '試し読み有無', '試し読み範囲',
];

const RAW_ROWS = [
  HEADER,
  makeRow({ 0: 1611, 4: 354296, 5: 'サンプルタイトルA', 7: '作家A', 8: '女性', 11: 'アルファポリス', 20: '©作家A/アルファポリス' }),
  makeRow({ 0: 1567, 4: 262237, 5: 'サンプルタイトルB', 7: '作家B', 8: '少女', 11: 'スターツ出版', 20: null }),
  makeRow({}), // trailing blank row, cmsId null
];

test('parseCmsRows extracts fields by fixed column index and skips blank rows', () => {
  const records = parseCmsRows(RAW_ROWS);
  expect(records).toHaveLength(2);
  expect(records[0]).toMatchObject({ cmsId: 1611, titleId: 354296, titleName: 'サンプルタイトルA', author: '作家A', publisher: 'アルファポリス', copyrightU: '©作家A/アルファポリス' });
  expect(records[1]).toMatchObject({ cmsId: 1567, copyrightU: null });
});

test('buildCmsCopyrightLookup only includes non-empty copyrightU', () => {
  const records = parseCmsRows(RAW_ROWS);
  const lookup = buildCmsCopyrightLookup(records);
  expect(lookup.get('1611')).toBe('©作家A/アルファポリス');
  expect(lookup.has('1567')).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/sources/cmsSource.test.js`
Expected: FAIL with "Cannot find module '../../src/sources/cmsSource'"

- [ ] **Step 3: Write `src/sources/cmsSource.js`**

```js
// src/sources/cmsSource.js
var CMS_COL = {
  CMS_ID: 0,
  TITLE_ID: 4,
  TITLE_NAME: 5,
  AUTHOR: 7,
  GENRE: 8,
  LABEL: 10,
  PUBLISHER: 11,
  PRE_START: 12,
  PRE_END: 13,
  COPYRIGHT_U: 20, // column U
};

function parseCmsRows(rawRows) {
  var records = [];
  for (var i = 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || row[CMS_COL.CMS_ID] === null || row[CMS_COL.CMS_ID] === undefined || row[CMS_COL.CMS_ID] === '') continue;
    records.push({
      cmsId: row[CMS_COL.CMS_ID],
      titleId: row[CMS_COL.TITLE_ID],
      titleName: row[CMS_COL.TITLE_NAME],
      author: row[CMS_COL.AUTHOR],
      genre: row[CMS_COL.GENRE],
      label: row[CMS_COL.LABEL],
      publisher: row[CMS_COL.PUBLISHER],
      preStart: row[CMS_COL.PRE_START],
      preEnd: row[CMS_COL.PRE_END],
      copyrightU: row[CMS_COL.COPYRIGHT_U],
    });
  }
  return records;
}

function buildCmsCopyrightLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    if (!record.copyrightU) return;
    lookup.set(String(record.cmsId), record.copyrightU);
  });
  return lookup;
}

if (typeof module !== 'undefined') {
  module.exports = { parseCmsRows, buildCmsCopyrightLookup, CMS_COL };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/sources/cmsSource.test.js`
Expected: `2 passed, 2 total`

- [ ] **Step 5: Commit**

```bash
git add src/sources/cmsSource.js tests/sources/cmsSource.test.js
git commit -m "feat(gas1): parse 先行タイトル情報(CMS) source, incl. column U copyright"
```

---

### Task 5: `src/sources/ngTitleSource.js` — parse 外部出稿用NGタイトル

**Files:**
- Create: `src/sources/ngTitleSource.js`
- Test: `tests/sources/ngTitleSource.test.js`

**Interfaces:**
- Consumes: raw 2D array for sheet `外部出稿用NGタイトル`; header is row 2 (index 1), data starts row 3 (index 2); columns: `出版社`(0), `記入日`(1), `更新日`(2), `タイトルID`(3), `タイトル名`(4), `作家名`(5), `ジャンル`(6), `備考`(7) (spec §3.3).
- Produces: `parseNgTitles(rawRows) -> Array<{titleId, titleName, remark}>` and `buildNgTitleLookup(records) -> Map<string, string>` keyed by `String(titleId)` when present, else by trimmed `titleName`.

- [ ] **Step 1: Write the failing test**

```js
// tests/sources/ngTitleSource.test.js
const { parseNgTitles, buildNgTitleLookup } = require('../../src/sources/ngTitleSource');

const RAW_ROWS = [
  ['外部出稿NGタイトル', null, null, null, null, null, null, null],
  ['　出版社', '　記入日', '更新日', 'タイトルID', '　タイトル名', '作家名', 'ジャンル', '　備考'],
  ['青年ジャンル作品', null, null, null, 'ロゴ判定リストで、シーモアロゴ「×」になっているタイトルすべて', null, null, 'Yahoo媒体に限り、バナー広告出稿NG'],
  ['出版社X', null, null, 332061, 'サンプルタイトルC', '作家C', 'TL', '個別注意事項'],
];

test('parseNgTitles skips the 2 header rows', () => {
  const records = parseNgTitles(RAW_ROWS);
  expect(records).toHaveLength(2);
  expect(records[1]).toEqual({ titleId: 332061, titleName: 'サンプルタイトルC', remark: '個別注意事項' });
});

test('buildNgTitleLookup keys by titleId when present, else by trimmed titleName', () => {
  const records = parseNgTitles(RAW_ROWS);
  const lookup = buildNgTitleLookup(records);
  expect(lookup.get('332061')).toBe('個別注意事項');
  expect(lookup.get('ロゴ判定リストで、シーモアロゴ「×」になっているタイトルすべて')).toBe('Yahoo媒体に限り、バナー広告出稿NG');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/sources/ngTitleSource.test.js`
Expected: FAIL with "Cannot find module '../../src/sources/ngTitleSource'"

- [ ] **Step 3: Write `src/sources/ngTitleSource.js`**

```js
// src/sources/ngTitleSource.js
var NG_COL = { PUBLISHER: 0, TITLE_ID: 3, TITLE_NAME: 4, REMARK: 7 };
var NG_HEADER_ROW_COUNT = 2;

function parseNgTitles(rawRows) {
  var records = [];
  for (var i = NG_HEADER_ROW_COUNT; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || (!row[NG_COL.TITLE_ID] && !row[NG_COL.TITLE_NAME])) continue;
    records.push({
      titleId: row[NG_COL.TITLE_ID],
      titleName: row[NG_COL.TITLE_NAME],
      remark: row[NG_COL.REMARK],
    });
  }
  return records;
}

function buildNgTitleLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    var key = record.titleId ? String(record.titleId) : String(record.titleName || '').trim();
    if (!key) return;
    lookup.set(key, record.remark);
  });
  return lookup;
}

if (typeof module !== 'undefined') {
  module.exports = { parseNgTitles, buildNgTitleLookup };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/sources/ngTitleSource.test.js`
Expected: `2 passed, 2 total`

- [ ] **Step 5: Commit**

```bash
git add src/sources/ngTitleSource.js tests/sources/ngTitleSource.test.js
git commit -m "feat(gas1): parse 外部出稿用NGタイトル source"
```

---

### Task 6: `src/sources/copyrightRules.js` — 基本のC表記 + 5 publisher-specific sheets + registry

**Files:**
- Create: `src/sources/copyrightRules.js`
- Test: `tests/sources/copyrightRules.test.js`

**Interfaces:**
- Consumes: raw 2D arrays for `基本のC表記`, `LINEコピーライト一覧`, `スクエニコピーライト一覧`, `リブレコピーライト`, `オーバーラップ_コピーライト一覧`, `ヒーローズコピーライト一覧` (real header rows/columns per sheet, verified against the actual downloaded files — see spec §3.3).
- Produces:
  - `parseBasicNotation(rawRows) -> Map<string, string>` keyed by trimmed 雑誌・レーベル (label) name → `©表記ルール` template text. **Known quirk:** in this sheet the header label `雑誌・レーベル` visually sits in column B (index 1) but the actual label data is in column A (index 0) for every data row — column B is blank. All other columns align normally with their headers (index 2 onward). The parser must read the label from index 0, not index 1.
  - `PUBLISHER_SHEET_PARSERS`: registry array of `{ key, sheetName, publisherAliases: string[], parse(rawRows) -> Map<string, string> }` — one entry per of the 5 publisher sheets, keyed by titleId (as string) with a titleName fallback key.
  - `resolvePublisherAliasMatch(publisherName, registry) -> registryEntry|null` — returns the first registry entry whose `publisherAliases` is contained in (or contains) `publisherName`.

- [ ] **Step 1: Write the failing test**

```js
// tests/sources/copyrightRules.test.js
const {
  parseBasicNotation,
  PUBLISHER_SHEET_PARSERS,
  resolvePublisherAliasMatch,
} = require('../../src/sources/copyrightRules');

test('parseBasicNotation reads label from column A (quirk) and rule from column G', () => {
  const rawRows = [
    [null, '雑誌・レーベル', '事前確認', '追加納品物', '加工', '©表記記載有無', '©表記ルール', '備考', '作家・タイトル別備考'],
    ['A-KAGURA', null, '不要', null, null, '必要', '©著者名/A-KAGURA', null, null],
    ['AMG出版', null, '不要', null, null, '必要', '作品名©漫画家名・原作者名／AMG出版', null, null],
  ];
  const map = parseBasicNotation(rawRows);
  expect(map.get('A-KAGURA')).toBe('©著者名/A-KAGURA');
  expect(map.get('AMG出版')).toBe('作品名©漫画家名・原作者名／AMG出版');
});

test('LINE parser keys by trimmed title name (no titleId column)', () => {
  const lineEntry = PUBLISHER_SHEET_PARSERS.find(function (e) { return e.key === 'LINE'; });
  const rawRows = [
    ['タイトル・©表記一覧（バナー用）2021.4.13更新', null, '※注記', null, null, null],
    ['タイトル', '著者', '©欧文表記 1', '©欧文表記 2', '©欧文表記 3', '備考'],
    ['Dの十字架', '井本仁', '© Hitoshi Imoto / LINE', null, null, null],
  ];
  const map = lineEntry.parse(rawRows);
  expect(map.get('Dの十字架')).toBe('© Hitoshi Imoto / LINE');
});

test('SQUARE_ENIX parser reads header at row 10 (index 9)', () => {
  const sqexEntry = PUBLISHER_SHEET_PARSERS.find(function (e) { return e.key === 'SQUARE_ENIX'; });
  const rawRows = new Array(9).fill([null]);
  rawRows.push([null, 'コンテンツID', '初巻配信月(予定含む）', 'タイトル名', '著者名', 'コピーライト', 'コピーライト(省略)', '備考']);
  rawRows.push([null, 1, null, '鋼の錬金術師', '荒川弘', '(C)Hiromu Arakawa/SQUARE ENIX', '(C)HA/SQEX', null]);
  const map = sqexEntry.parse(rawRows);
  expect(map.get('鋼の錬金術師')).toBe('(C)Hiromu Arakawa/SQUARE ENIX');
});

test('LIBRE parser keys by titleId and by title name', () => {
  const libreEntry = PUBLISHER_SHEET_PARSERS.find(function (e) { return e.key === 'LIBRE'; });
  const rawRows = [
    ['アダルト媒体でもコピーライトが「libre」の作品', null, null],
    ['タイトルＩＤ', 'タイトル', 'コピーライト'],
    [193584, 'ENNEAD', '©Mojito/ SEOUL MEDIA COMICS, INC./libre'],
  ];
  const map = libreEntry.parse(rawRows);
  expect(map.get('193584')).toBe('©Mojito/ SEOUL MEDIA COMICS, INC./libre');
  expect(map.get('ENNEAD')).toBe('©Mojito/ SEOUL MEDIA COMICS, INC./libre');
});

test('OVERLAP parser starts data at row 4 (index 3), columns B-E', () => {
  const overlapEntry = PUBLISHER_SHEET_PARSERS.find(function (e) { return e.key === 'OVERLAP'; });
  const rawRows = [
    [null, null, null, null, null],
    [null, 'オーバーラップ＿コピーライト一覧', null, null, null],
    [null, 'タイトルＩＤ', 'タイトル', 'コピーライト', '備考'],
    [null, 200001, 'サンプルタイトルD', '©作家D/オーバーラップ', null],
  ];
  const map = overlapEntry.parse(rawRows);
  expect(map.get('200001')).toBe('©作家D/オーバーラップ');
  expect(map.get('サンプルタイトルD')).toBe('©作家D/オーバーラップ');
});

test('HEROES parser has header at row 1 (index 0)', () => {
  const heroesEntry = PUBLISHER_SHEET_PARSERS.find(function (e) { return e.key === 'HEROES'; });
  const rawRows = [
    ['タイトル名', 'TID', 'COPYRIGHT'],
    ['アサシン ichiyo', 268299, '©細野不二彦･信濃川日出雄/ヒーローズ'],
  ];
  const map = heroesEntry.parse(rawRows);
  expect(map.get('268299')).toBe('©細野不二彦･信濃川日出雄/ヒーローズ');
  expect(map.get('アサシン ichiyo')).toBe('©細野不二彦･信濃川日出雄/ヒーローズ');
});

test('resolvePublisherAliasMatch finds SQUARE_ENIX by substring alias', () => {
  const entry = resolvePublisherAliasMatch('株式会社スクウェア・エニックス', PUBLISHER_SHEET_PARSERS);
  expect(entry.key).toBe('SQUARE_ENIX');
});

test('resolvePublisherAliasMatch returns null when nothing matches', () => {
  const entry = resolvePublisherAliasMatch('無関係の出版社', PUBLISHER_SHEET_PARSERS);
  expect(entry).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/sources/copyrightRules.test.js`
Expected: FAIL with "Cannot find module '../../src/sources/copyrightRules'"

- [ ] **Step 3: Write `src/sources/copyrightRules.js`**

```js
// src/sources/copyrightRules.js

function parseBasicNotation(rawRows) {
  var map = new Map();
  // Header is row 1 (index 0). Quirk: header label "雑誌・レーベル" sits at column
  // index 1, but the actual label data lives in column index 0 for every data row
  // (column index 1 is always blank). All other columns (事前確認, ©表記ルール, ...)
  // line up normally with their header positions.
  for (var i = 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[0]) continue;
    var label = String(row[0]).trim();
    var rule = row[6]; // ©表記ルール
    if (rule) map.set(label, rule);
  }
  return map;
}

function parseLineSheet(rawRows) {
  var map = new Map();
  for (var i = 2; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[0]) continue;
    var titleName = String(row[0]).trim();
    var copyright = row[2]; // ©欧文表記 1
    if (copyright) map.set(titleName, copyright);
  }
  return map;
}

function parseSquareEnixSheet(rawRows) {
  var map = new Map();
  for (var i = 10; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[3]) continue;
    var titleName = String(row[3]).trim();
    var copyright = row[5]; // コピーライト (full form)
    if (copyright) map.set(titleName, copyright);
  }
  return map;
}

function parseLibreSheet(rawRows) {
  var map = new Map();
  for (var i = 2; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[2]) continue;
    var copyright = row[2];
    if (row[0]) map.set(String(row[0]), copyright);
    if (row[1]) map.set(String(row[1]).trim(), copyright);
  }
  return map;
}

function parseOverlapSheet(rawRows) {
  var map = new Map();
  for (var i = 3; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[3]) continue;
    var copyright = row[3];
    if (row[1]) map.set(String(row[1]), copyright);
    if (row[2]) map.set(String(row[2]).trim(), copyright);
  }
  return map;
}

function parseHeroesSheet(rawRows) {
  var map = new Map();
  for (var i = 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row[2]) continue;
    var copyright = row[2];
    if (row[1]) map.set(String(row[1]), copyright);
    if (row[0]) map.set(String(row[0]).trim(), copyright);
  }
  return map;
}

var PUBLISHER_SHEET_PARSERS = [
  { key: 'LINE', sheetName: 'LINEコピーライト一覧', publisherAliases: ['LINE'], parse: parseLineSheet },
  { key: 'SQUARE_ENIX', sheetName: 'スクエニコピーライト一覧', publisherAliases: ['スクエニ', 'スクウェア・エニックス', 'SQUARE ENIX', 'SQEX'], parse: parseSquareEnixSheet },
  { key: 'LIBRE', sheetName: 'リブレコピーライト', publisherAliases: ['リブレ', 'libre'], parse: parseLibreSheet },
  { key: 'OVERLAP', sheetName: 'オーバーラップ_コピーライト一覧', publisherAliases: ['オーバーラップ'], parse: parseOverlapSheet },
  { key: 'HEROES', sheetName: 'ヒーローズコピーライト一覧', publisherAliases: ['ヒーローズ'], parse: parseHeroesSheet },
];

function resolvePublisherAliasMatch(publisherName, registry) {
  if (!publisherName) return null;
  for (var i = 0; i < registry.length; i++) {
    var entry = registry[i];
    for (var j = 0; j < entry.publisherAliases.length; j++) {
      if (publisherName.indexOf(entry.publisherAliases[j]) !== -1) return entry;
    }
  }
  return null;
}

if (typeof module !== 'undefined') {
  module.exports = {
    parseBasicNotation,
    PUBLISHER_SHEET_PARSERS,
    resolvePublisherAliasMatch,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/sources/copyrightRules.test.js`
Expected: `8 passed, 8 total`

- [ ] **Step 5: Commit**

```bash
git add src/sources/copyrightRules.js tests/sources/copyrightRules.test.js
git commit -m "feat(gas1): parse 基本のC表記 and 5 per-publisher copyright sheets"
```

---

### Task 7: `src/logic/customerWorkMaster.js` — build 顧客作品マスタ rows

**Files:**
- Create: `src/logic/customerWorkMaster.js`
- Test: `tests/logic/customerWorkMaster.test.js`

**Interfaces:**
- Consumes: `cmsRecords` (from Task 4's `parseCmsRows`), `regulationLookup` (from Task 3's `buildRegulationLookup`, keyed by `String(cmsId)`), `ngTitleLookup` (from Task 5's `buildNgTitleLookup`, keyed by `String(titleId)` or trimmed title name).
- Produces: `buildCustomerWorkRows(cmsRecords, regulationLookup, ngTitleLookup) -> Array<{cmsId, titleId, titleName, author, genre, publisher, preStart, preEnd, logoJudgement, remark, distributionNgFlag}>`. `distributionNgFlag` is always `''` (out of scope, spec §3.4). This is the shape later consumed by Task 9's upsert (keyed by `titleId`) and Task 8's copyright resolver.

- [ ] **Step 1: Write the failing test**

```js
// tests/logic/customerWorkMaster.test.js
const { buildCustomerWorkRows } = require('../../src/logic/customerWorkMaster');

const CMS_RECORDS = [
  { cmsId: 1611, titleId: 354296, titleName: 'サンプルタイトルA', author: '作家A', genre: '女性', publisher: 'アルファポリス', preStart: '2026-03-27', preEnd: '2026-06-25', copyrightU: '©作家A/アルファポリス' },
  { cmsId: 1567, titleId: 262237, titleName: 'サンプルタイトルB', author: '作家B', genre: '少女', publisher: 'スターツ出版', preStart: '2022-02-10', preEnd: null, copyrightU: null },
];

const REGULATION_LOOKUP = new Map([['1611', 'ロゴなし']]);
const NG_TITLE_LOOKUP = new Map([['262237', 'Yahoo媒体に限り、バナー広告出稿NG']]);

test('builds one row per CMS record, joining regulation and NG-title lookups', () => {
  const rows = buildCustomerWorkRows(CMS_RECORDS, REGULATION_LOOKUP, NG_TITLE_LOOKUP);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ titleId: 354296, logoJudgement: 'ロゴなし', remark: null, distributionNgFlag: '' });
  expect(rows[1]).toMatchObject({ titleId: 262237, logoJudgement: undefined, remark: 'Yahoo媒体に限り、バナー広告出稿NG', distributionNgFlag: '' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/logic/customerWorkMaster.test.js`
Expected: FAIL with "Cannot find module '../../src/logic/customerWorkMaster'"

- [ ] **Step 3: Write `src/logic/customerWorkMaster.js`**

```js
// src/logic/customerWorkMaster.js
function buildCustomerWorkRows(cmsRecords, regulationLookup, ngTitleLookup) {
  return cmsRecords.map(function (cms) {
    var titleIdKey = String(cms.titleId);
    return {
      cmsId: cms.cmsId,
      titleId: cms.titleId,
      titleName: cms.titleName,
      author: cms.author,
      genre: cms.genre,
      publisher: cms.publisher,
      preStart: cms.preStart,
      preEnd: cms.preEnd,
      logoJudgement: regulationLookup.get(String(cms.cmsId)),
      remark: ngTitleLookup.get(titleIdKey) || null,
      distributionNgFlag: '', // out of scope this iteration, spec §3.4
    };
  });
}

if (typeof module !== 'undefined') {
  module.exports = { buildCustomerWorkRows };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/logic/customerWorkMaster.test.js`
Expected: `1 passed, 1 total`

- [ ] **Step 5: Commit**

```bash
git add src/logic/customerWorkMaster.js tests/logic/customerWorkMaster.test.js
git commit -m "feat(gas1): build 顧客作品マスタ rows from CMS + regulation + NG-title sources"
```

---

### Task 8: `src/logic/copyrightResolver.js` — 4-tier copyright priority

**Files:**
- Create: `src/logic/copyrightResolver.js`
- Test: `tests/logic/copyrightResolver.test.js`

**Interfaces:**
- Consumes: one customer-work row (from Task 7), `cmsCopyrightLookup` (Task 4's `buildCmsCopyrightLookup`), `publisherRegistry` + `publisherMaps` (`{ [registryKey]: Map }`, built from Task 6's parsers), `basicNotationMap` (Task 6's `parseBasicNotation`).
- Produces: `resolveCopyright(work, cmsCopyrightLookup, publisherRegistry, publisherMaps, basicNotationMap) -> { value: string|null, tier: 1|2|3|4 }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/logic/copyrightResolver.test.js
const { resolveCopyright } = require('../../src/logic/copyrightResolver');
const { PUBLISHER_SHEET_PARSERS, resolvePublisherAliasMatch } = require('../../src/sources/copyrightRules');

const CMS_LOOKUP = new Map([['1611', '©作家A/アルファポリス（CMS）']]);
const PUBLISHER_MAPS = {
  SQUARE_ENIX: new Map([['サンプルタイトルE', '(C)SampleAuthor/SQUARE ENIX']]),
};
const BASIC_NOTATION = new Map([['スターツ出版', '©著者名/スターツ出版']]);

test('tier 1: CMS column U wins when present', () => {
  const work = { cmsId: 1611, titleId: 354296, titleName: 'サンプルタイトルA', author: '作家A', publisher: 'アルファポリス' };
  const result = resolveCopyright(work, CMS_LOOKUP, PUBLISHER_SHEET_PARSERS, PUBLISHER_MAPS, BASIC_NOTATION);
  expect(result).toEqual({ value: '©作家A/アルファポリス（CMS）', tier: 1 });
});

test('tier 2: publisher-specific sheet used when CMS has no value', () => {
  const work = { cmsId: 9999, titleId: 400001, titleName: 'サンプルタイトルE', author: 'SampleAuthor', publisher: '株式会社スクウェア・エニックス' };
  const result = resolveCopyright(work, CMS_LOOKUP, PUBLISHER_SHEET_PARSERS, PUBLISHER_MAPS, BASIC_NOTATION);
  expect(result).toEqual({ value: '(C)SampleAuthor/SQUARE ENIX', tier: 2 });
});

test('tier 3: basic notation auto-generation with 著者名 token replaced', () => {
  const work = { cmsId: 9998, titleId: 400002, titleName: 'サンプルタイトルF', author: '作家F', publisher: 'スターツ出版' };
  const result = resolveCopyright(work, CMS_LOOKUP, PUBLISHER_SHEET_PARSERS, PUBLISHER_MAPS, BASIC_NOTATION);
  expect(result).toEqual({ value: '©作家F/スターツ出版', tier: 3 });
});

test('tier 4: no rule matches anywhere -> cá biệt', () => {
  const work = { cmsId: 9997, titleId: 400003, titleName: 'サンプルタイトルG', author: '作家G', publisher: '無関係の出版社' };
  const result = resolveCopyright(work, CMS_LOOKUP, PUBLISHER_SHEET_PARSERS, PUBLISHER_MAPS, BASIC_NOTATION);
  expect(result).toEqual({ value: null, tier: 4 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/logic/copyrightResolver.test.js`
Expected: FAIL with "Cannot find module '../../src/logic/copyrightResolver'"

- [ ] **Step 3: Write `src/logic/copyrightResolver.js`**

```js
// src/logic/copyrightResolver.js
var TITLE_TOKENS = ['作品名', 'タイトル名'];
var AUTHOR_TOKENS = ['漫画家名・原作者名', '著者名', '作家名'];

function applyBasicNotationTemplate(template, work) {
  var text = template;
  TITLE_TOKENS.some(function (token) {
    if (text.indexOf(token) === -1) return false;
    text = text.replace(token, work.titleName);
    return true;
  });
  AUTHOR_TOKENS.some(function (token) {
    if (text.indexOf(token) === -1) return false;
    text = text.replace(token, work.author);
    return true;
  });
  return text;
}

function resolveCopyright(work, cmsCopyrightLookup, publisherRegistry, publisherMaps, basicNotationMap) {
  // Tier 1: CMS column U
  var cmsValue = cmsCopyrightLookup.get(String(work.cmsId));
  if (cmsValue) return { value: cmsValue, tier: 1 };

  // Tier 2: per-publisher sheet
  var registryEntry = null;
  for (var i = 0; i < publisherRegistry.length; i++) {
    var entry = publisherRegistry[i];
    var matched = entry.publisherAliases.some(function (alias) {
      return work.publisher && work.publisher.indexOf(alias) !== -1;
    });
    if (matched) { registryEntry = entry; break; }
  }
  if (registryEntry) {
    var map = publisherMaps[registryEntry.key];
    if (map) {
      var byId = work.titleId !== undefined ? map.get(String(work.titleId)) : undefined;
      var byName = work.titleName ? map.get(String(work.titleName).trim()) : undefined;
      var tier2Value = byId || byName;
      if (tier2Value) return { value: tier2Value, tier: 2 };
    }
  }

  // Tier 3: 基本のC表記 auto-generation
  var template = work.publisher ? basicNotationMap.get(String(work.publisher).trim()) : undefined;
  if (template) return { value: applyBasicNotationTemplate(template, work), tier: 3 };

  // Tier 4: cá biệt — no rule matched
  return { value: null, tier: 4 };
}

if (typeof module !== 'undefined') {
  module.exports = { resolveCopyright, applyBasicNotationTemplate };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/logic/copyrightResolver.test.js`
Expected: `4 passed, 4 total`

- [ ] **Step 5: Commit**

```bash
git add src/logic/copyrightResolver.js tests/logic/copyrightResolver.test.js
git commit -m "feat(gas1): implement 4-tier copyright priority resolver"
```

---

### Task 9: `src/logic/upsert.js` — generic key-based diff/upsert + stable numbering

**Files:**
- Create: `src/logic/upsert.js`
- Test: `tests/logic/upsert.test.js`

**Interfaces:**
- Consumes: `existingRecords: Array<object>` (already on the output sheet, each with a numeric `numberField`, e.g. `タイトルNo`), `newRecords: Array<object>` (freshly built, no `numberField` yet), `keyFn(record) -> string`, `isEqualFn(existing, incoming) -> boolean`.
- Produces:
  - `resolveNumbers(existingRecords, newRecords, keyFn, numberField) -> Array<record>` — for each `newRecord`, if its key already exists, **reuses the existing record's number** (so a title keeps the same `タイトルNo`/copyright-master row across runs); otherwise assigns the next free integer after the current max, in `newRecords` order. This must run **before** `diffUpsert`, over *all* new records (not just the ones that turn out to be additions), because 顧客作品マスタ and コピーライトマスタ share the same `タイトルNo` for the same title (spec §4.2) and コピーライトマスタ has no `タイトルID` column of its own to key on independently.
  - `diffUpsert(existingRecords, newRecords, keyFn, isEqualFn) -> { toUpdate: Array<{key, record}>, toAdd: Array<record>, unchangedKeys: Array<string> }`.
- Consumed by Task 14's `main.js`: customer rows are numbered by `titleId` first; the resulting `titleNo` is then reused as the copyright master's own key (see Task 14).

- [ ] **Step 1: Write the failing test**

```js
// tests/logic/upsert.test.js
const { diffUpsert, resolveNumbers } = require('../../src/logic/upsert');

const keyFn = function (r) { return String(r.titleId); };
const isEqualFn = function (a, b) {
  return a.titleName === b.titleName && a.publisher === b.publisher;
};

test('diffUpsert classifies unchanged, updated, and new records', () => {
  const existing = [
    { titleId: 1, titleName: 'A', publisher: 'PubA' },
    { titleId: 2, titleName: 'B', publisher: 'PubB' },
  ];
  const incoming = [
    { titleId: 1, titleName: 'A', publisher: 'PubA' },       // unchanged
    { titleId: 2, titleName: 'B changed', publisher: 'PubB' }, // updated
    { titleId: 3, titleName: 'C', publisher: 'PubC' },        // new
  ];
  const result = diffUpsert(existing, incoming, keyFn, isEqualFn);
  expect(result.unchangedKeys).toEqual(['1']);
  expect(result.toUpdate).toEqual([{ key: '2', record: incoming[1] }]);
  expect(result.toAdd).toEqual([incoming[2]]);
});

test('resolveNumbers reuses the existing number for a matching key and numbers new keys after the current max, in input order', () => {
  const existing = [{ titleId: 1, titleNo: 5 }, { titleId: 2, titleNo: 7 }];
  const incoming = [{ titleId: 2 }, { titleId: 3 }, { titleId: 1 }, { titleId: 4 }];
  const numbered = resolveNumbers(existing, incoming, keyFn, 'titleNo');
  expect(numbered.map(function (r) { return r.titleNo; })).toEqual([7, 8, 5, 9]);
});

test('resolveNumbers starts at 1 when there are no existing records', () => {
  const numbered = resolveNumbers([], [{ titleId: 10 }, { titleId: 11 }], keyFn, 'titleNo');
  expect(numbered.map(function (r) { return r.titleNo; })).toEqual([1, 2]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/logic/upsert.test.js`
Expected: FAIL with "Cannot find module '../../src/logic/upsert'"

- [ ] **Step 3: Write `src/logic/upsert.js`**

```js
// src/logic/upsert.js
function diffUpsert(existingRecords, newRecords, keyFn, isEqualFn) {
  var existingByKey = new Map();
  existingRecords.forEach(function (record) {
    existingByKey.set(keyFn(record), record);
  });

  var toUpdate = [];
  var toAdd = [];
  var unchangedKeys = [];

  newRecords.forEach(function (record) {
    var key = keyFn(record);
    var existing = existingByKey.get(key);
    if (!existing) {
      toAdd.push(record);
      return;
    }
    if (isEqualFn(existing, record)) {
      unchangedKeys.push(key);
    } else {
      toUpdate.push({ key: key, record: record });
    }
  });

  return { toUpdate: toUpdate, toAdd: toAdd, unchangedKeys: unchangedKeys };
}

function resolveNumbers(existingRecords, newRecords, keyFn, numberField) {
  var existingNumberByKey = new Map();
  var maxNumber = 0;
  existingRecords.forEach(function (record) {
    var num = Number(record[numberField]) || 0;
    existingNumberByKey.set(keyFn(record), num);
    if (num > maxNumber) maxNumber = num;
  });

  var nextNumber = maxNumber;
  return newRecords.map(function (record) {
    var key = keyFn(record);
    var copy = Object.assign({}, record);
    if (existingNumberByKey.has(key)) {
      copy[numberField] = existingNumberByKey.get(key);
    } else {
      nextNumber += 1;
      copy[numberField] = nextNumber;
    }
    return copy;
  });
}

if (typeof module !== 'undefined') {
  module.exports = { diffUpsert, resolveNumbers };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/logic/upsert.test.js`
Expected: `3 passed, 3 total`

- [ ] **Step 5: Commit**

```bash
git add src/logic/upsert.js tests/logic/upsert.test.js
git commit -m "feat(gas1): generic key-based diff/upsert + stable cross-run numbering"
```

---

### Task 10: `src/logic/copyrightHistory.js` — shift history on change

**Files:**
- Create: `src/logic/copyrightHistory.js`
- Test: `tests/logic/copyrightHistory.test.js`

**Interfaces:**
- Consumes: `existingRecord: { copyrightCurrent: string|null, copyrightHistory: Array<string> }` (up to 10 entries, oldest last), `newValue: string|null`, `maxSlots: number` (from `CONFIG.COPYRIGHT_HISTORY_SLOTS`, Task 2).
- Produces: `shiftCopyrightHistory(existingRecord, newValue, maxSlots) -> { copyrightCurrent, copyrightHistory }`. If `newValue === existingRecord.copyrightCurrent`, returns an equivalent object unchanged (history untouched). Otherwise prepends the old `copyrightCurrent` to `copyrightHistory`, truncated to `maxSlots`.

- [ ] **Step 1: Write the failing test**

```js
// tests/logic/copyrightHistory.test.js
const { shiftCopyrightHistory } = require('../../src/logic/copyrightHistory');

test('no change -> history untouched', () => {
  const existing = { copyrightCurrent: '©A/Pub', copyrightHistory: ['©Old1', '©Old2'] };
  const result = shiftCopyrightHistory(existing, '©A/Pub', 10);
  expect(result).toEqual({ copyrightCurrent: '©A/Pub', copyrightHistory: ['©Old1', '©Old2'] });
});

test('value changed -> old current value pushed to front of history', () => {
  const existing = { copyrightCurrent: '©A/Pub', copyrightHistory: ['©Old1', '©Old2'] };
  const result = shiftCopyrightHistory(existing, '©A-new/Pub', 10);
  expect(result).toEqual({ copyrightCurrent: '©A-new/Pub', copyrightHistory: ['©A/Pub', '©Old1', '©Old2'] });
});

test('history is truncated to maxSlots, dropping the oldest', () => {
  const existing = {
    copyrightCurrent: '©A/Pub',
    copyrightHistory: ['©H1', '©H2', '©H3', '©H4', '©H5', '©H6', '©H7', '©H8', '©H9', '©H10'],
  };
  const result = shiftCopyrightHistory(existing, '©A-new/Pub', 10);
  expect(result.copyrightHistory).toHaveLength(10);
  expect(result.copyrightHistory[0]).toBe('©A/Pub');
  expect(result.copyrightHistory).not.toContain('©H10');
});

test('first-ever value (no prior copyrightCurrent) does not add a null history entry', () => {
  const existing = { copyrightCurrent: null, copyrightHistory: [] };
  const result = shiftCopyrightHistory(existing, '©First/Pub', 10);
  expect(result).toEqual({ copyrightCurrent: '©First/Pub', copyrightHistory: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/logic/copyrightHistory.test.js`
Expected: FAIL with "Cannot find module '../../src/logic/copyrightHistory'"

- [ ] **Step 3: Write `src/logic/copyrightHistory.js`**

```js
// src/logic/copyrightHistory.js
function shiftCopyrightHistory(existingRecord, newValue, maxSlots) {
  var currentValue = existingRecord.copyrightCurrent || null;
  var history = existingRecord.copyrightHistory ? existingRecord.copyrightHistory.slice() : [];

  if (newValue === currentValue) {
    return { copyrightCurrent: currentValue, copyrightHistory: history };
  }

  if (currentValue) {
    history.unshift(currentValue);
    if (history.length > maxSlots) history = history.slice(0, maxSlots);
  }

  return { copyrightCurrent: newValue, copyrightHistory: history };
}

if (typeof module !== 'undefined') {
  module.exports = { shiftCopyrightHistory };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/logic/copyrightHistory.test.js`
Expected: `4 passed, 4 total`

- [ ] **Step 5: Commit**

```bash
git add src/logic/copyrightHistory.js tests/logic/copyrightHistory.test.js
git commit -m "feat(gas1): shift CopyRight history 過去1-10 only when value changes"
```

---

### Task 11: `src/io/sheetIO.js` — GAS-only read/write layer

**Files:**
- Create: `src/io/sheetIO.js`

**Interfaces:**
- Consumes: `CONFIG` (Task 2), and the pure functions from Tasks 3-10 (called by `main.js`, not by this file directly — this file only wraps `SpreadsheetApp`).
- Produces: `readSheetValues(spreadsheetId, sheetName) -> Array<Array<any>>`, `readCustomerWorkMaster() -> Array<object>` (rows mapped from sheet columns to the field names used in Task 7/9), `writeCustomerWorkMaster(diffResult) -> void`, `readCopyrightMaster() -> Array<object>` (including `copyrightCurrent`/`copyrightHistory` reconstructed from the 11 CopyRight columns), `writeCopyrightMaster(diffResult) -> void`. Column positions match the real headers documented in spec §4.1/§4.2.

This task has no Jest test — `SpreadsheetApp` does not exist outside the Apps Script runtime. Verification is manual, via `clasp push` + running a small probe function in the Apps Script editor.

- [ ] **Step 1: Write `src/io/sheetIO.js`**

```js
// src/io/sheetIO.js

function readSheetValues(spreadsheetId, sheetName) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  return sheet.getDataRange().getValues();
}

// 顧客作品マスタ columns (spec §4.1):
// タイトルNo, CMS ID, タイトルID, タイトル名, 作家名, ジャンル, 出版社, 先行開始日, 先行終了日, コピーライト, ③シーモアロゴ判定, 備考, 配信NGフラグ
var CUSTOMER_MASTER_COL = {
  TITLE_NO: 0, CMS_ID: 1, TITLE_ID: 2, TITLE_NAME: 3, AUTHOR: 4, GENRE: 5,
  PUBLISHER: 6, PRE_START: 7, PRE_END: 8, COPYRIGHT: 9, LOGO_JUDGEMENT: 10,
  REMARK: 11, DISTRIBUTION_NG_FLAG: 12,
};

function readCustomerWorkMaster() {
  var cfg = CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER;
  var rows = readSheetValues(cfg.spreadsheetId, cfg.sheetName);
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[CUSTOMER_MASTER_COL.TITLE_ID]) continue;
    records.push({
      titleNo: row[CUSTOMER_MASTER_COL.TITLE_NO],
      cmsId: row[CUSTOMER_MASTER_COL.CMS_ID],
      titleId: row[CUSTOMER_MASTER_COL.TITLE_ID],
      titleName: row[CUSTOMER_MASTER_COL.TITLE_NAME],
      author: row[CUSTOMER_MASTER_COL.AUTHOR],
      genre: row[CUSTOMER_MASTER_COL.GENRE],
      publisher: row[CUSTOMER_MASTER_COL.PUBLISHER],
      preStart: row[CUSTOMER_MASTER_COL.PRE_START],
      preEnd: row[CUSTOMER_MASTER_COL.PRE_END],
      copyright: row[CUSTOMER_MASTER_COL.COPYRIGHT],
      logoJudgement: row[CUSTOMER_MASTER_COL.LOGO_JUDGEMENT],
      remark: row[CUSTOMER_MASTER_COL.REMARK],
      distributionNgFlag: row[CUSTOMER_MASTER_COL.DISTRIBUTION_NG_FLAG],
    });
  }
  return records;
}

function customerRecordToRow(record) {
  var row = [];
  row[CUSTOMER_MASTER_COL.TITLE_NO] = record.titleNo;
  row[CUSTOMER_MASTER_COL.CMS_ID] = record.cmsId;
  row[CUSTOMER_MASTER_COL.TITLE_ID] = record.titleId;
  row[CUSTOMER_MASTER_COL.TITLE_NAME] = record.titleName;
  row[CUSTOMER_MASTER_COL.AUTHOR] = record.author;
  row[CUSTOMER_MASTER_COL.GENRE] = record.genre;
  row[CUSTOMER_MASTER_COL.PUBLISHER] = record.publisher;
  row[CUSTOMER_MASTER_COL.PRE_START] = record.preStart;
  row[CUSTOMER_MASTER_COL.PRE_END] = record.preEnd;
  row[CUSTOMER_MASTER_COL.COPYRIGHT] = record.copyright || '';
  row[CUSTOMER_MASTER_COL.LOGO_JUDGEMENT] = record.logoJudgement;
  row[CUSTOMER_MASTER_COL.REMARK] = record.remark;
  row[CUSTOMER_MASTER_COL.DISTRIBUTION_NG_FLAG] = record.distributionNgFlag || '';
  return row;
}

function writeCustomerWorkMaster(diffResult) {
  var cfg = CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER;
  var sheet = SpreadsheetApp.openById(cfg.spreadsheetId).getSheetByName(cfg.sheetName);
  var headerRowCount = 1;

  diffResult.toUpdate.forEach(function (item) {
    var sheetRowIndex = headerRowCount + item.rowOffset + 1; // 1-based sheet row
    sheet.getRange(sheetRowIndex, 1, 1, 13).setValues([customerRecordToRow(item.record)]);
  });

  if (diffResult.toAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    var values = diffResult.toAdd.map(customerRecordToRow);
    sheet.getRange(startRow, 1, values.length, 13).setValues(values);
  }
}

// コピーライトマスタ columns (spec §4.2):
// タイトルNo, タイトル名, 著者名, 出版社(雑誌名/レーベル), 正規コピーライト, CopyRight(個別ルールの場合),
// CopyRight自動生成, CopyRight過去1..10
var COPYRIGHT_MASTER_COL = {
  TITLE_NO: 0, TITLE_NAME: 1, AUTHOR: 2, PUBLISHER: 3, CURRENT: 4,
  INDIVIDUAL_RULE: 5, AUTO_GENERATED: 6, HISTORY_START: 7, HISTORY_SLOTS: 10,
};

function readCopyrightMaster() {
  var cfg = CONFIG.OUTPUTS.COPYRIGHT_MASTER;
  var rows = readSheetValues(cfg.spreadsheetId, cfg.sheetName);
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row[COPYRIGHT_MASTER_COL.TITLE_NO]) continue;
    var history = [];
    for (var h = 0; h < COPYRIGHT_MASTER_COL.HISTORY_SLOTS; h++) {
      var value = row[COPYRIGHT_MASTER_COL.HISTORY_START + h];
      if (value) history.push(value);
    }
    records.push({
      titleNo: row[COPYRIGHT_MASTER_COL.TITLE_NO],
      titleName: row[COPYRIGHT_MASTER_COL.TITLE_NAME],
      author: row[COPYRIGHT_MASTER_COL.AUTHOR],
      publisher: row[COPYRIGHT_MASTER_COL.PUBLISHER],
      copyrightCurrent: row[COPYRIGHT_MASTER_COL.CURRENT],
      copyrightHistory: history,
    });
  }
  return records;
}

function copyrightRecordToRow(record) {
  var row = [];
  row[COPYRIGHT_MASTER_COL.TITLE_NO] = record.titleNo;
  row[COPYRIGHT_MASTER_COL.TITLE_NAME] = record.titleName;
  row[COPYRIGHT_MASTER_COL.AUTHOR] = record.author;
  row[COPYRIGHT_MASTER_COL.PUBLISHER] = record.publisher;
  row[COPYRIGHT_MASTER_COL.CURRENT] = record.copyrightCurrent || '';
  row[COPYRIGHT_MASTER_COL.INDIVIDUAL_RULE] = record.tier === 2 ? record.copyrightCurrent : '';
  row[COPYRIGHT_MASTER_COL.AUTO_GENERATED] = record.tier === 3 ? record.copyrightCurrent : '';
  for (var h = 0; h < COPYRIGHT_MASTER_COL.HISTORY_SLOTS; h++) {
    row[COPYRIGHT_MASTER_COL.HISTORY_START + h] = record.copyrightHistory[h] || '';
  }
  return row;
}

function writeCopyrightMaster(diffResult) {
  var cfg = CONFIG.OUTPUTS.COPYRIGHT_MASTER;
  var sheet = SpreadsheetApp.openById(cfg.spreadsheetId).getSheetByName(cfg.sheetName);
  var totalCols = COPYRIGHT_MASTER_COL.HISTORY_START + COPYRIGHT_MASTER_COL.HISTORY_SLOTS;

  diffResult.toUpdate.forEach(function (item) {
    var sheetRowIndex = 1 + item.rowOffset + 1;
    sheet.getRange(sheetRowIndex, 1, 1, totalCols).setValues([copyrightRecordToRow(item.record)]);
  });

  if (diffResult.toAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    var values = diffResult.toAdd.map(copyrightRecordToRow);
    sheet.getRange(startRow, 1, values.length, totalCols).setValues(values);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    readSheetValues,
    readCustomerWorkMaster,
    writeCustomerWorkMaster,
    readCopyrightMaster,
    writeCopyrightMaster,
    CUSTOMER_MASTER_COL,
    COPYRIGHT_MASTER_COL,
  };
}
```

**Note:** `writeCustomerWorkMaster`/`writeCopyrightMaster` expect `item.rowOffset` on each `toUpdate` entry — this is the 0-based index of that record within the *existing* records array as read by `readCustomerWorkMaster`/`readCopyrightMaster`, computed in `main.js` (Task 14) since `upsert.js` (Task 9) is spreadsheet-agnostic and only knows about `key`, not sheet row position.

- [ ] **Step 2: Push to Apps Script and verify manually**

Run: `clasp push`
Expected: push succeeds, `src/io/sheetIO.js` appears in the Apps Script editor (`clasp open` to check visually).

In the Apps Script editor, temporarily run this ad-hoc function (paste into the editor, run once, check the execution log), then delete it:

```js
function _probeReadCustomerMaster() {
  Logger.log(JSON.stringify(readCustomerWorkMaster().slice(0, 2)));
}
```

Expected: execution log shows the 1 real sample row from `顧客作品マスタ` (spec §4.1) parsed into the expected object shape, with no thrown errors.

- [ ] **Step 3: Commit**

```bash
git add src/io/sheetIO.js
git commit -m "feat(gas1): add SpreadsheetApp read/write layer for both output masters"
```

---

### Task 12: `src/io/slack.js` — Slack Web API notification

**Files:**
- Create: `src/io/slack.js`

**Interfaces:**
- Consumes: `CONFIG.SLACK_PROPERTY_KEYS` (Task 2), `PropertiesService.getScriptProperties()`.
- Produces: `notifySlack(message: string) -> void`. No-op (does nothing, does not throw) if `SLACK_BOT_TOKEN` or `SLACK_CHANNEL_ID` script property is unset.

No Jest test (depends on `PropertiesService`/`UrlFetchApp`, GAS-only). Verified manually.

- [ ] **Step 1: Write `src/io/slack.js`**

```js
// src/io/slack.js
function notifySlack(message) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty(CONFIG.SLACK_PROPERTY_KEYS.BOT_TOKEN);
  var channel = props.getProperty(CONFIG.SLACK_PROPERTY_KEYS.CHANNEL_ID);

  if (!token || !channel) {
    Logger.log('notifySlack: SLACK_BOT_TOKEN or SLACK_CHANNEL_ID not set, skipping Slack, message was: ' + message);
    return;
  }

  UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ channel: channel, text: message }),
    muteHttpExceptions: true,
  });
}

if (typeof module !== 'undefined') {
  module.exports = { notifySlack };
}
```

- [ ] **Step 2: Push and verify manually**

Run: `clasp push`

In the Apps Script editor, run this ad-hoc probe (with `SLACK_BOT_TOKEN`/`SLACK_CHANNEL_ID` script properties left unset):

```js
function _probeNotifySlackNoop() {
  notifySlack('test message, should not actually send');
}
```

Expected: execution log shows the "skipping Slack" message, no exception thrown.

Once you've created a Slack App (`chat:write` scope) and filled in real values via **Project Settings → Script Properties** in the Apps Script editor, re-run `_probeNotifySlackNoop` (rename it back to a real call) and confirm the message actually arrives in the target Slack channel.

- [ ] **Step 3: Commit**

```bash
git add src/io/slack.js
git commit -m "feat(gas1): add Slack Web API notifier (chat.postMessage), no-op until token configured"
```

---

### Task 13: `src/io/logSheet.js` — run log

**Files:**
- Create: `src/io/logSheet.js`

**Interfaces:**
- Consumes: `CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER.spreadsheetId` (the log sheet lives alongside 顧客作品マスタ, per spec §8).
- Produces: `appendLogEntry(entry: { startedAt: Date, finishedAt: Date, addedCount: number, updatedCount: number, irregularTitles: Array<string>, errors: Array<string> }) -> void`. Creates the `GAS1ログ` sheet (with header row) on first use if it doesn't exist yet.

No Jest test (GAS-only). Verified manually.

- [ ] **Step 1: Write `src/io/logSheet.js`**

```js
// src/io/logSheet.js
var LOG_SHEET_NAME = 'GAS1ログ';
var LOG_HEADER = ['開始日時', '終了日時', '追加件数', '更新件数', '個別対応タイトル', 'エラー'];

function getOrCreateLogSheet() {
  var ss = SpreadsheetApp.openById(CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER.spreadsheetId);
  var sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET_NAME);
    sheet.appendRow(LOG_HEADER);
  }
  return sheet;
}

function appendLogEntry(entry) {
  var sheet = getOrCreateLogSheet();
  sheet.appendRow([
    entry.startedAt,
    entry.finishedAt,
    entry.addedCount,
    entry.updatedCount,
    entry.irregularTitles.join(', '),
    entry.errors.join(', '),
  ]);
}

if (typeof module !== 'undefined') {
  module.exports = { appendLogEntry, getOrCreateLogSheet, LOG_SHEET_NAME };
}
```

- [ ] **Step 2: Push and verify manually**

Run: `clasp push`

In the Apps Script editor, run:

```js
function _probeAppendLogEntry() {
  appendLogEntry({
    startedAt: new Date(),
    finishedAt: new Date(),
    addedCount: 0,
    updatedCount: 0,
    irregularTitles: ['probe run'],
    errors: [],
  });
}
```

Expected: opening `顧客作品マスタ` spreadsheet shows a new `GAS1ログ` sheet with a header row and one data row containing "probe run".

- [ ] **Step 3: Commit**

```bash
git add src/io/logSheet.js
git commit -m "feat(gas1): add GAS1ログ run-log sheet writer"
```

---

### Task 14: `src/main.js` — orchestration + trigger installer

**Files:**
- Create: `src/main.js`

**Interfaces:**
- Consumes: everything from Tasks 2-13.
- Produces: `runGas1()` (the function the trigger calls) and `createGas1Trigger()` (one-time setup function to install the 9:00/18:00 time-based trigger).

- [ ] **Step 1: Write `src/main.js`**

```js
// src/main.js
function buildRowOffsetIndex(existingRecords, keyFn) {
  var index = new Map();
  existingRecords.forEach(function (record, i) {
    index.set(keyFn(record), i);
  });
  return index;
}

function attachRowOffsets(diffResult, existingRecords, keyFn) {
  var offsetByKey = buildRowOffsetIndex(existingRecords, keyFn);
  diffResult.toUpdate.forEach(function (item) {
    item.rowOffset = offsetByKey.get(item.key);
  });
  return diffResult;
}

function runGas1() {
  var startedAt = new Date();
  var errors = [];
  var irregularTitles = [];

  try {
    var regulationRaw = readSheetValues(CONFIG.SOURCES.REGULATION.spreadsheetId, CONFIG.SOURCES.REGULATION.sheetName);
    var cmsRaw = readSheetValues(CONFIG.SOURCES.CMS.spreadsheetId, CONFIG.SOURCES.CMS.sheetName);
    var ngTitleRaw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.NG_TITLES);
    var basicNotationRaw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.BASIC_NOTATION);

    var regulationRecords = parseRegulationRows(regulationRaw);
    var regulationLookup = buildRegulationLookup(regulationRecords);

    var cmsRecords = parseCmsRows(cmsRaw);
    var cmsCopyrightLookup = buildCmsCopyrightLookup(cmsRecords);

    var ngTitleRecords = parseNgTitles(ngTitleRaw);
    var ngTitleLookup = buildNgTitleLookup(ngTitleRecords);

    var basicNotationMap = parseBasicNotation(basicNotationRaw);

    var publisherMaps = {};
    PUBLISHER_SHEET_PARSERS.forEach(function (entry) {
      var rawRows = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, entry.sheetName);
      publisherMaps[entry.key] = entry.parse(rawRows);
    });

    // ---- 顧客作品マスタ ----
    var customerKeyFn = function (r) { return String(r.titleId); };
    var existingCustomerRows = readCustomerWorkMaster();

    var builtCustomerRows = buildCustomerWorkRows(cmsRecords, regulationLookup, ngTitleLookup);

    // Resolve copyright per work BEFORE diffing/numbering the customer master,
    // since 顧客作品マスタ's コピーライト column mirrors the resolved value
    // (spec §4.1 assumption #2) and コピーライトマスタ's row-linking `タイトルNo`
    // must be assigned here too — コピーライトマスタ has no タイトルID column of
    // its own (spec §4.2), so its rows are keyed by the customer master's タイトルNo,
    // not by taitleId directly.
    builtCustomerRows.forEach(function (work) {
      var resolved = resolveCopyright(work, cmsCopyrightLookup, PUBLISHER_SHEET_PARSERS, publisherMaps, basicNotationMap);
      work.copyright = resolved.value;
      work.copyrightTier = resolved.tier;
      if (resolved.tier === 4) irregularTitles.push(work.titleId + ' ' + work.titleName);
    });

    var numberedCustomerRows = resolveNumbers(existingCustomerRows, builtCustomerRows, customerKeyFn, 'titleNo');

    var customerIsEqualFn = function (a, b) {
      return a.author === b.author && a.genre === b.genre && a.publisher === b.publisher
        && a.logoJudgement === b.logoJudgement && a.remark === b.remark && a.copyright === b.copyright;
    };
    var customerDiff = diffUpsert(existingCustomerRows, numberedCustomerRows, customerKeyFn, customerIsEqualFn);
    attachRowOffsets(customerDiff, existingCustomerRows, customerKeyFn);

    // ---- コピーライトマスタ (keyed by タイトルNo, reusing the numbers just assigned above) ----
    var copyrightKeyFn = function (r) { return String(r.titleNo); };
    var existingCopyrightRows = readCopyrightMaster();
    var existingCopyrightByTitleNo = new Map();
    existingCopyrightRows.forEach(function (r) {
      existingCopyrightByTitleNo.set(copyrightKeyFn(r), r);
    });

    var newCopyrightRows = numberedCustomerRows.map(function (work) {
      var prior = existingCopyrightByTitleNo.get(String(work.titleNo)) || { copyrightCurrent: null, copyrightHistory: [] };
      var shifted = shiftCopyrightHistory(prior, work.copyright, CONFIG.COPYRIGHT_HISTORY_SLOTS);

      return {
        titleNo: work.titleNo,
        titleName: work.titleName,
        author: work.author,
        publisher: work.publisher,
        copyrightCurrent: shifted.copyrightCurrent,
        copyrightHistory: shifted.copyrightHistory,
        tier: work.copyrightTier,
      };
    });

    var copyrightIsEqualFn = function (a, b) {
      return a.copyrightCurrent === b.copyrightCurrent && a.author === b.author && a.publisher === b.publisher;
    };
    var copyrightDiff = diffUpsert(existingCopyrightRows, newCopyrightRows, copyrightKeyFn, copyrightIsEqualFn);
    attachRowOffsets(copyrightDiff, existingCopyrightRows, copyrightKeyFn);

    // ---- persist ----
    writeCustomerWorkMaster(customerDiff);
    writeCopyrightMaster(copyrightDiff);

    if (irregularTitles.length > 0) {
      notifySlack('GAS❶: ' + irregularTitles.length + '件のタイトルが個別対応(コピーライト特定不可)になりました:\n' + irregularTitles.join('\n'));
    }

    appendLogEntry({
      startedAt: startedAt,
      finishedAt: new Date(),
      addedCount: customerDiff.toAdd.length,
      updatedCount: customerDiff.toUpdate.length,
      irregularTitles: irregularTitles,
      errors: errors,
    });
  } catch (error) {
    errors.push(String(error));
    notifySlack('GAS❶ 実行エラー: ' + String(error));
    appendLogEntry({
      startedAt: startedAt,
      finishedAt: new Date(),
      addedCount: 0,
      updatedCount: 0,
      irregularTitles: irregularTitles,
      errors: errors,
    });
    throw error;
  }
}

function createGas1Trigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'runGas1') ScriptApp.deleteTrigger(trigger);
  });

  CONFIG.TRIGGER_HOURS.forEach(function (hour) {
    ScriptApp.newTrigger('runGas1')
      .timeBased()
      .everyDays(1)
      .atHour(hour)
      .inTimezone(CONFIG.TRIGGER_TIMEZONE)
      .create();
  });
}

if (typeof module !== 'undefined') {
  module.exports = { runGas1, createGas1Trigger, attachRowOffsets };
}
```

- [ ] **Step 2: Push to Apps Script**

Run: `clasp push`
Expected: push succeeds with no errors, all `src/**` files visible via `clasp open`.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat(gas1): wire up runGas1() orchestration and trigger installer"
```

---

### Task 15: End-to-end manual verification + enable the trigger

**Files:** none (verification only).

- [ ] **Step 1: Confirm account permissions**

In the Apps Script editor (logged in as the account clasp is authenticated with, currently `nguyen_phi_long@ca-adv.co.jp`), confirm you have at least Viewer access to the 3 source spreadsheets and Editor access to the 2 output spreadsheets (spec §9.1). Fix sharing first if any `openById` call would fail with a permission error.

- [ ] **Step 2: Run `runGas1()` once manually**

In the Apps Script editor, select `runGas1` from the function dropdown and click Run. Approve any OAuth scope prompts (Spreadsheets, external requests for Slack).

Expected: execution completes without throwing; open `顧客作品マスタ` and `コピーライトマスタ` and confirm new/updated rows look correct; open `GAS1ログ` and confirm a new log row was appended with plausible counts.

- [ ] **Step 3: Run `runGas1()` a second time immediately**

Expected: `updatedCount` and `addedCount` in the new `GAS1ログ` row are both `0` (nothing changed between the two runs), confirming the upsert diffing is idempotent.

- [ ] **Step 4: Install the trigger**

In the Apps Script editor, select `createGas1Trigger` from the function dropdown and click Run once.

Verify: **Triggers** (clock icon in the left sidebar) shows 2 time-based triggers for `runGas1`, one at 9am and one at 6pm, Asia/Tokyo.

- [ ] **Step 5: Commit the plan's completion**

```bash
git log --oneline -15
```

Expected: 15 commits total for this plan, one per task, matching the task list above.

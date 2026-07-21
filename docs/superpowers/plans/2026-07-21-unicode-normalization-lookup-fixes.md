# Unicode-Normalization Lookup Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining gaps found in the `/code-review` of `normalizeForCompare()` (see conversation history and `docs/gas1-van-hanh.md` §3d/3e) — a full-width-parenthesized copyright gap, and the fact that Tier-2/Tier-3 copyright lookups still compare raw/trim-only strings instead of going through Unicode-tolerant normalization.

**Architecture:** Split `logic/upsert.js`'s `normalizeForCompare()` into a reusable generic layer (`normalizeJapaneseText()` — wave-dash/fullwidth-tilde folding + NFKC, no copyright-specific folding) and the existing copyright-specific layer (which now also folds full-width parenthesized copyright marks). `normalizeJapaneseText()` is then reused at the map-building AND map-querying sides of every title/publisher-name keyed lookup in `sources/copyrightRules.js`, `logic/copyrightResolver.js`, and `sources/ngTitleSource.js`, so a title or publisher name that differs only by wave-dash/fullwidth-tilde/full-width-vs-half-width form no longer causes a silent lookup miss.

**Tech Stack:** Google Apps Script (V8 runtime), no automated test suite in this project (per prior decision — verification is manual, via `Logger.log`/probe functions run in the Apps Script editor, same pattern as the rest of `src/main.js`).

## Global Constraints

- No Jest/Node test suite — every verification step in this plan is a manual probe function run in the Apps Script editor, matching the existing `probe_*` pattern in `src/main.js`.
- Never change what gets WRITTEN to a sheet — normalization is for comparison/lookup purposes only (existing rule, restated in `logic/upsert.js`'s JSDoc, must still hold after this plan).
- Every `.js` file under `src/` is pushed to the same Apps Script project via `clasp push` — functions in different files share one global scope (no `require`/`import`), so `normalizeJapaneseText()` defined in `logic/upsert.js` is directly callable from `sources/copyrightRules.js` etc. without any import.
- Commit after each task (`clasp push` + `git commit`), matching how every prior fix in this project was shipped.

## Scope: which of the 9 review findings this plan fixes

The `/code-review` surfaced 9 findings. This plan fixes 4 of them (Tasks 1-3) and documents all 9 (Task 4). The other 5 are deliberately NOT changed here — noted so this scope boundary is explicit, not silently dropped:

- **Fixed:** Tier-2/Tier-3 lookups bypassing normalization (`copyrightResolver.js`, `copyrightRules.js`) — Task 2. `resolvePublisherAliasMatch` no normalization — Task 2. `ngTitleSource.js` fallback key inconsistency — Task 3. Full-width parenthesized copyright gap — Task 1.
- **Documented, not changed (NFKC broader side effects, e.g. ellipsis folding):** the updated JSDoc in Task 1 now explicitly names this instead of silently under-documenting it — accepted as correct behavior for a comparison-only function, not a bug to fix.
- **Not changed — accepted trade-off (wave-dash fold collapsing all the way to ASCII `~`):** confirmed by the Simplification angle that removing this line breaks the intended 〜/～ equivalence; the ASCII-tilde side effect is real but the alternative (leaving 〜 and ～ unequal) is worse. No safe fix without excluding legitimate ASCII tildes from NFKC, which isn't practical.
- **Not changed — accepted trade-off (`shiftCopyrightHistory` freezes stale Unicode notation once `sameValue()` says equal):** the underlying cause is that `diffUpsert`'s equality check would independently re-derive "unchanged" and skip the row regardless of what `shiftCopyrightHistory` returns — making the sheet "self-heal" to a corrected notation would require writing rows the system currently (by design) treats as unchanged, reintroducing the sheet-churn problem this whole feature was built to eliminate. Left as a known, documented limitation.
- **Not changed — accepted risk (`(c)` regex applied unconditionally to all fields, not just copyright):** narrowing it to copyright-only fields would require threading a "field type" parameter through `normalizeForCompare`/`sameValue`, a larger API change for a low-probability edge case (a non-copyright field, like a remark, containing a literal "(c)" substring). Left as-is.
- **Not changed — accepted risk (`headerMap.js`'s `normalizeHeaderText` vs `logic/upsert.js`'s new `normalizeJapaneseText` remain two separate implementations):** header-name matching (column titles) and value-matching (Japanese free text) are genuinely different concerns — header names don't need copyright/wave-dash handling — so keeping them separate is a reasonable boundary, not an oversight. Noted in Task 4's doc update for future readers.
- **Not changed — accepted risk (order-dependency documented only in a comment, no test):** this project has no automated test suite by prior decision (see Global Constraints); adding one now would be a much larger scope change than this plan's fixes warrant.

---

## File Structure

```
src/logic/upsert.js              (Modify: split normalizeForCompare, add normalizeJapaneseText, fix full-width-parens gap)
src/logic/copyrightResolver.js   (Modify: Tier-2/Tier-3 lookups use normalizeJapaneseText for title/publisher keys)
src/sources/copyrightRules.js    (Modify: 6 parse functions build map keys with normalizeJapaneseText; resolvePublisherAliasMatch normalizes both sides)
src/sources/ngTitleSource.js     (Modify: buildNgTitleLookup's titleName fallback key uses normalizeJapaneseText)
docs/gas1-van-hanh.md            (Modify: document the fix, mục 3f)
```

---

### Task 1: `logic/upsert.js` — add `normalizeJapaneseText()`, fix full-width-parens gap

**Files:**
- Modify: `src/logic/upsert.js:1-45` (the `normalizeForCompare` function and its JSDoc)

**Interfaces:**
- Produces: `normalizeJapaneseText(value) -> string` — NEW, exported for reuse. Generic normalization (undefined/null/''/whitespace → `''`, trim, wave-dash/fullwidth-tilde folding, NFKC). No copyright-symbol folding — safe to use on titles/publisher names/any free text.
- Produces: `normalizeForCompare(value) -> string` — UNCHANGED signature/behavior for existing callers (`sameValue()`, and transitively `main.js`/`changeDetail.js`/`copyrightHistory.js`), but now internally composes copyright-folding + `normalizeJapaneseText()`, and additionally folds full-width parenthesized copyright marks (`（Ｃ）`/`（ｃ）`) which the previous version missed.
- Consumed by: Task 2/3 (`copyrightResolver.js`, `copyrightRules.js`, `ngTitleSource.js` all call `normalizeJapaneseText()`, not `normalizeForCompare()`, since they key title/publisher names, not copyright strings).

- [ ] **Step 1: Replace `normalizeForCompare` with the split implementation**

Open `src/logic/upsert.js`. Replace the entire `normalizeForCompare` function and its preceding JSDoc comment (currently lines 7-70, from `/**` right after the file-header comment down through the closing `}` of `normalizeForCompare`) with:

```js
/**
 * Chuẩn hoá 1 giá trị TIẾNG NHẬT chung (KHÔNG gồm ký hiệu bản quyền — xem
 * normalizeForCompare() bên dưới cho phần đó) để SO SÁNH/TRA CỨU — dùng cho
 * title/tên tác giả/tên NXB ở bất kỳ đâu cần so khớp dù có biến thể Unicode
 * cosmetic. KHÔNG dùng để lưu/ghi.
 *
 * Coi `undefined`/`null`/chuỗi rỗng/chuỗi chỉ có khoảng trắng là CÙNG 1 giá
 * trị "không có gì" (trim trước). Chuẩn hoá 2 nhóm ký tự tiếng Nhật hay bị
 * lẫn lộn:
 *
 * 1. `〜` (WAVE DASH, U+301C) và `～` (FULLWIDTH TILDE, U+FF5E) — trông GIỐNG
 *    HỆT NHAU trong hầu hết font, cực kỳ phổ biến trong タイトル名, nhưng
 *    Unicode KHÔNG coi 2 ký tự này tương đương (kể cả sau NFKC) — phải tự map
 *    thủ công. (Lưu ý: `.normalize('NFKC')` ở bước sau CÒN tiếp tục phân rã
 *    FULLWIDTH TILDE thành dấu ngã ASCII nửa-rộng `~` — nghĩa là kết quả cuối
 *    cùng thực chất là `~`, không phải `～`; vẫn đúng cho mục đích SO SÁNH vì
 *    áp dụng nhất quán cho cả 2 vế, chỉ không nên dùng hàm này để hiển thị.)
 * 2. Full-width vs half-width (Ａ-Ｚ/０-９/khoảng trắng　 vs A-Z/0-9/khoảng
 *    trắng thường), half-width vs full-width katakana — dùng
 *    `String.prototype.normalize('NFKC')`, đúng chuẩn Unicode. NFKC còn có
 *    tác dụng phụ RỘNG HƠN những gì liệt kê ở đây (vd gộp dấu ba chấm "…"
 *    thành "..." ASCII) — chấp nhận được vì mục đích của hàm này vốn là nới
 *    lỏng so sánh, không phải giữ nguyên văn.
 *
 * CỐ TÌNH KHÔNG chuẩn hoá: ký tự rõ ràng là lỗi gõ (vd "┴" — ký tự vẽ khung
 * bảng — dùng nhầm thay cho dấu chấm giữa "・" ở 1 vài tên tác giả thật) —
 * lỗi nhập liệu cần con người sửa ở nguồn, GAS không nên âm thầm coi tương
 * đương (có thể che mất lỗi thật cần sửa).
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeJapaneseText(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .trim()
    .replace(/[〜～]/g, '～') // wave dash (U+301C) vs fullwidth tilde (U+FF5E) -> 1 dạng
    .normalize('NFKC'); // full-width/half-width Latin+số+khoảng trắng, half-width katakana, v.v.
}

/**
 * Chuẩn hoá 1 giá trị field BẢN QUYỀN để SO SÁNH (không dùng để lưu/ghi) —
 * gồm normalizeJapaneseText() ở trên CỘNG THÊM chuẩn hoá các BIẾN THỂ
 * UNICODE của ký hiệu bản quyền "©": `©` (U+00A9, chuẩn), `Ⓒ`/`ⓒ`
 * (U+24B8/U+24D2, "circled Latin letter C"), và `(C)`/`(c)`/`（Ｃ）`/`（ｃ）`
 * (dạng ASCII lẫn full-width, có/không dấu ngoặc). Về ý nghĩa, tất cả đều là
 * "bản quyền" — nhưng so sánh `===` trực tiếp sẽ coi 2 chuỗi chỉ khác nhau
 * đúng 1 ký hiệu này là "đã đổi", gây log audit sai lệch và dịch chuyển lịch
 * sử CopyRight過去1-10 một cách không cần thiết. CHỈ chuẩn hoá để SO SÁNH —
 * giá trị thật sự GHI vào sheet vẫn giữ nguyên ký hiệu gốc từ nguồn.
 *
 * TẠI SAO CẦN HÀM NÀY (lịch sử): khi 1 record vừa build lại từ nguồn không
 * match được gì (vd `lookupRegulation()` trả về `undefined`), giá trị đó là
 * `undefined` trong JS. Nhưng khi GHI `undefined` vào 1 ô Google Sheets rồi
 * ĐỌC LẠI ở lần chạy sau, Sheets trả về CHUỖI RỖNG `''`, không phải
 * `undefined`. So sánh trực tiếp bằng `===` sẽ thấy `undefined !== ''` và
 * coi đó là "đã đổi" — dù cả 2 đều thực chất là "không có gì". Đã kiểm chứng
 * bug này gây ra ~99% số dòng bị đánh dấu update SAI ở mỗi lần chạy (xem
 * GAS1変更詳細 thực tế: 5639+3022 dòng log có cả 変更前/変更後 đều trống).
 * `normalizeJapaneseText()` (không nhận `undefined`/`null`) xử lý phần này.
 *
 * THỨ TỰ QUAN TRỌNG: phải chuẩn hoá ký hiệu © TRƯỚC khi gọi normalizeJapaneseText()
 * (tức trước NFKC) — vì NFKC tự nó phân rã `Ⓒ`/`ⓒ` (circled Latin letter C)
 * thành chữ "C" trần trụi (không phải "©" hay "(C)"), làm mất luôn dấu hiệu
 * để regex ©-family nhận diện được nếu gọi sau.
 *
 * Regex `[（(][CcＣｃ][）)]/g` xử lý CẢ full-width lẫn half-width ngoặc quanh
 * C — nếu chỉ dùng `\(c\)` (ASCII only) như bản trước, `（Ｃ）` (ngoặc +
 * chữ C đều full-width, kiểu gõ IME tiếng Nhật rất phổ biến) sẽ KHÔNG được
 * nhận diện tương đương với `©`/`(C)`, vì NFKC (bước fold full-width sang
 * half-width) chạy SAU quy tắc ©-family này, quá muộn để quy tắc đó bắt lại.
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeForCompare(value) {
  if (value === undefined || value === null) return '';
  var withCopyrightFolded = String(value)
    .trim()
    .replace(/[（(][CcＣｃ][）)]/g, '©') // (C)/(c)/（Ｃ）/（ｃ） -> ©
    .replace(/[©Ⓒⓒ]/g, '©'); // Ⓒ/ⓒ (circled Latin letter C) -> © (ký hiệu chuẩn)
  return normalizeJapaneseText(withCopyrightFolded);
}
```

- [ ] **Step 2: Push and manually verify with a probe function**

Add this temporary probe function to `src/main.js` (near the other `probe_*` functions):

```js
function probe_normalizeForCompareRegressionCheck() {
  var cases = [
    { a: 'Copyright (c) Foo', b: 'Copyright （Ｃ） Foo', expectSame: true, label: 'fullwidth parens (C)' },
    { a: '©Foo/Bar', b: 'Ⓒ Foo/Bar', expectSame: false, label: 'sanity: different text stays different' },
    { a: '©Foo/Bar', b: 'ⒸFoo/Bar', expectSame: true, label: 'circled C == standard ©' },
    { a: 'A〜B', b: 'A～B', expectSame: true, label: 'wave dash == fullwidth tilde' },
  ];
  cases.forEach(function (testCase) {
    var actual = sameValue(testCase.a, testCase.b);
    var pass = actual === testCase.expectSame;
    Logger.log((pass ? 'PASS' : 'FAIL') + ' — ' + testCase.label + ': sameValue(' + JSON.stringify(testCase.a) + ', ' + JSON.stringify(testCase.b) + ') = ' + actual + ', expected ' + testCase.expectSame);
  });
}
```

Run: `clasp push`, then in the Apps Script editor select `probe_normalizeForCompareRegressionCheck` and Run.
Expected: Execution log shows `PASS` for all 4 lines (note: the 2nd case is deliberately checking that `'©Foo/Bar'` vs `'Ⓒ Foo/Bar'` — which differ by an extra space AND the copyright symbol — are correctly judged DIFFERENT only because of the leftover space difference being irrelevant here; if this is confusing, remove that case — the important ones are cases 1, 3, 4).

Delete `probe_normalizeForCompareRegressionCheck` from `main.js` once you've confirmed all PASS (it was only for this verification step).

- [ ] **Step 3: Commit**

```bash
git add src/logic/upsert.js
git commit -m "$(cat <<'EOF'
Split normalizeForCompare into reusable normalizeJapaneseText + fix full-width-parens copyright gap

normalizeJapaneseText() (wave-dash/fullwidth-tilde folding + NFKC, no
copyright-symbol folding) is now a standalone reusable function, so
title/publisher-name lookups elsewhere (next tasks) can normalize
without pulling in copyright-specific folding that doesn't apply to
them. normalizeForCompare() composes copyright-folding + this new
function, and its copyright-folding regex now also matches full-width
parenthesized forms (（Ｃ）/（ｃ）), which the ASCII-only \(c\) regex
previously missed — verified with Node that a full-width-parenthesized
copyright string was NOT being recognized as equivalent to © before
this fix.
EOF
)"
```

---

### Task 2: `logic/copyrightResolver.js` + `sources/copyrightRules.js` — normalize Tier-2/Tier-3 lookup keys

**Files:**
- Modify: `src/sources/copyrightRules.js` (6 parse functions' map-building keys, plus `resolvePublisherAliasMatch`)
- Modify: `src/logic/copyrightResolver.js:82-91` (the Tier-2/Tier-3 `map.get()` calls in `resolveCopyright`)

**Interfaces:**
- Consumes: `normalizeJapaneseText(value) -> string` from Task 1 (`logic/upsert.js`).
- Produces: no new exported functions — same map shapes and `resolveCopyright()`/`resolvePublisherAliasMatch()` signatures as before, just Unicode-tolerant now on both the build side and the query side (they must change together — a query normalized one way against a map keyed the other way would still miss).

- [ ] **Step 1: Normalize map-building keys in `copyrightRules.js`**

Open `src/sources/copyrightRules.js`. Make these 6 targeted replacements (each replaces a `.trim()`-only key with `normalizeJapaneseText(...)`, keeping everything else identical):

In `parseBasicNotation` (around line 52):
```js
    var label = String(row[colLabel]).trim();
```
→
```js
    var label = normalizeJapaneseText(row[colLabel]);
```

In `parseLineSheet` (around line 79):
```js
    var titleName = String(row[colTitle]).trim();
```
→
```js
    var titleName = normalizeJapaneseText(row[colTitle]);
```

In `parseSquareEnixSheet` (around line 112):
```js
    if (copyright) map.set(String(row[colTitle]).trim(), copyright);
```
→
```js
    if (copyright) map.set(normalizeJapaneseText(row[colTitle]), copyright);
```

In `parseLibreSheet` (around lines 143-144):
```js
    if (row[colId]) map.set(String(row[colId]), copyright);
    if (row[colTitle]) map.set(String(row[colTitle]).trim(), copyright);
```
→
```js
    if (row[colId]) map.set(String(row[colId]), copyright);
    if (row[colTitle]) map.set(normalizeJapaneseText(row[colTitle]), copyright);
```

In `parseOverlapSheet` (around lines 172-173): same replacement pattern as `parseLibreSheet` (the `row[colTitle]` line).

In `parseHeroesSheet` (around lines 201-202): same replacement pattern as `parseLibreSheet` (the `row[colTitle]` line).

(Leave every `row[colId]`/`String(row[colId])` line untouched — IDs are numeric/alphanumeric codes, not free Japanese text, and don't have Unicode-variant issues.)

- [ ] **Step 2: Normalize `resolvePublisherAliasMatch`**

In `src/sources/copyrightRules.js`, replace:

```js
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
```

with:

```js
function resolvePublisherAliasMatch(publisherName, registry) {
  if (!publisherName) return null;
  var normalizedPublisherName = normalizeJapaneseText(publisherName);
  for (var i = 0; i < registry.length; i++) {
    var entry = registry[i];
    for (var j = 0; j < entry.publisherAliases.length; j++) {
      if (normalizedPublisherName.indexOf(normalizeJapaneseText(entry.publisherAliases[j])) !== -1) return entry;
    }
  }
  return null;
}
```

- [ ] **Step 3: Normalize the Tier-2/Tier-3 query side in `copyrightResolver.js`**

In `src/logic/copyrightResolver.js`, inside `resolveCopyright`, replace:

```js
      var byId = work.titleId !== undefined ? map.get(String(work.titleId)) : undefined;
      var byName = work.titleName ? map.get(String(work.titleName).trim()) : undefined;
```

with:

```js
      var byId = work.titleId !== undefined ? map.get(String(work.titleId)) : undefined;
      var byName = work.titleName ? map.get(normalizeJapaneseText(work.titleName)) : undefined;
```

And replace:

```js
  var template = work.publisher ? basicNotationMap.get(String(work.publisher).trim()) : undefined;
```

with:

```js
  var template = work.publisher ? basicNotationMap.get(normalizeJapaneseText(work.publisher)) : undefined;
```

- [ ] **Step 4: Push and manually verify with a probe function**

Add this temporary probe to `src/main.js`:

```js
function probe_tierLookupNormalizationCheck() {
  var basicNotationRaw = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, CONFIG.SOURCES.PUBLISHER_RULES.sheets.BASIC_NOTATION);
  var basicNotationMap = parseBasicNotation(basicNotationRaw);

  // Sửa 'A-KAGURA' thành 1 tên レーベル bạn biết chắc có trong 基本のC表記,
  // rồi thử tra bằng 1 biến thể full-width/half-width hoặc wave-dash khác đi
  // 1 chút để xác nhận vẫn tra ra kết quả.
  var realLabel = 'A-KAGURA';
  var withFullWidthDash = realLabel.replace('-', '－'); // half-width hyphen -> full-width
  Logger.log('Tra bằng tên gốc: ' + JSON.stringify(basicNotationMap.get(normalizeJapaneseText(realLabel))));
  Logger.log('Tra bằng biến thể full-width: ' + JSON.stringify(basicNotationMap.get(normalizeJapaneseText(withFullWidthDash))));
  Logger.log('2 kết quả có giống nhau không: ' + (basicNotationMap.get(normalizeJapaneseText(realLabel)) === basicNotationMap.get(normalizeJapaneseText(withFullWidthDash))));
}
```

Run: `clasp push`, then run `probe_tierLookupNormalizationCheck` in the Apps Script editor.
Expected: both `Logger.log` lines show the SAME non-null rule string, and the last line shows `true` — confirming a full-width-vs-half-width variant of the same label now resolves to the same map entry.

Delete `probe_tierLookupNormalizationCheck` after confirming.

- [ ] **Step 5: Commit**

```bash
git add src/sources/copyrightRules.js src/logic/copyrightResolver.js
git commit -m "$(cat <<'EOF'
Route Tier-2/Tier-3 copyright lookups through normalizeJapaneseText()

Found by code review: resolveCopyright()'s Tier-2 (per-publisher sheet)
and Tier-3 (基本のC表記 auto-generation) lookups, plus
resolvePublisherAliasMatch()'s publisher-name matching, all compared
raw/trim-only strings — the exact class of Unicode-variant mismatch
(wave-dash vs fullwidth-tilde, full-width vs half-width) that
normalizeForCompare() was built to handle at the diff/equality layer,
left unfixed at the lookup layer. A title or publisher name differing
only cosmetically between two source sheets could silently miss its
Tier-2/3 match and fall through to Tier 4 (cá biệt), triggering a false
Slack alert and leaving copyright blank. Map-building (copyrightRules.js)
and map-querying (copyrightResolver.js) now both key on
normalizeJapaneseText(titleName)/normalizeJapaneseText(publisher) —
IDs are left untouched since they're not free-text.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `sources/ngTitleSource.js` — normalize the titleName-fallback lookup key

**Files:**
- Modify: `src/sources/ngTitleSource.js:59-67` (`buildNgTitleLookup`)

**Interfaces:**
- Consumes: `normalizeJapaneseText(value) -> string` from Task 1.
- Produces: same `Map<string, string>` shape as before, just Unicode-tolerant for the titleName-fallback key case.

**Note before starting:** `buildCustomerWorkRows()` (`logic/customerWorkMaster.js`) currently only ever queries this map by `titleId`, never by `titleName` (see that file's own comment). This task makes the map's fallback key consistent with the rest of the codebase for when/if a titleName-based query is added later — it does not change today's runtime behavior, since the titleName-keyed entries aren't queried yet. Still worth doing now while the pattern is fresh, so the map isn't quietly inconsistent with the rest of the fix.

- [ ] **Step 1: Normalize the fallback key**

In `src/sources/ngTitleSource.js`, replace:

```js
function buildNgTitleLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    var key = record.titleId ? String(record.titleId) : String(record.titleName || '').trim();
    if (!key) return;
    lookup.set(key, record.remark);
  });
  return lookup;
}
```

with:

```js
function buildNgTitleLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    var key = record.titleId ? String(record.titleId) : normalizeJapaneseText(record.titleName);
    if (!key) return;
    lookup.set(key, record.remark);
  });
  return lookup;
}
```

- [ ] **Step 2: Push and manually verify**

Run: `clasp push`, then run the existing `probe_readNgTitles` function (already in `main.js`) in the Apps Script editor.
Expected: same output shape as before (this is a low-risk, mechanical change) — no errors, record count unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/sources/ngTitleSource.js
git commit -m "$(cat <<'EOF'
Normalize the titleName-fallback key in buildNgTitleLookup for consistency

No behavior change today (buildCustomerWorkRows only queries this map
by titleId currently), but keeps this lookup's key-building consistent
with the normalizeJapaneseText() pattern now used everywhere else a
titleName is used as a Map key, in case a titleName-based query is
added later.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Update `docs/gas1-van-hanh.md`

**Files:**
- Modify: `docs/gas1-van-hanh.md` (add a new subsection after the existing "3e" section)

**Interfaces:**
- None (documentation only).

- [ ] **Step 1: Add section 3f documenting this fix**

Find the line in `docs/gas1-van-hanh.md` that starts `## 4. Bảng tra nhanh: file nào làm việc gì` and insert this new section immediately BEFORE it:

```markdown
## 3f. Bài học 6: fix ở tầng SO SÁNH không tự lan sang tầng TRA CỨU

Sau khi `normalizeForCompare()`/`sameValue()` được thêm để tránh false-positive "đã đổi", 1 lượt `/code-review` phát hiện: các nơi TRA CỨU theo tên tác phẩm/NXB (không phải so sánh cũ-mới) — Tier 2/Tier 3 trong `copyrightResolver.js`, và toàn bộ 6 hàm `parseXxxSheet()` + `resolvePublisherAliasMatch()` trong `copyrightRules.js` — vẫn dùng `.trim()` hoặc `Map.get()` thô, KHÔNG đi qua `sameValue()`/`normalizeForCompare()`.

Hệ quả: nếu CMS ghi tên tác phẩm bằng wave dash `〜` còn sheet bản quyền riêng của NXB ghi bằng fullwidth tilde `～` (hoặc NXB ghi full-width Latin còn CMS ghi half-width), lookup Tier 2/3 **âm thầm miss** — tác phẩm bị rơi xuống tầng thấp hơn hoặc tầng 4 (cá biệt), dù về ý nghĩa 2 tên hoàn toàn giống nhau.

**Fix:** tách `normalizeForCompare()` thành 2 lớp — `normalizeJapaneseText()` (chung, không có phần fold ký hiệu ©, dùng được cho MỌI text tiếng Nhật) và `normalizeForCompare()` (= `normalizeJapaneseText()` + fold ©, chỉ dùng cho field bản quyền). Toàn bộ nơi build/tra Map theo titleName/tên NXB (cả 2 phía — lúc build map lẫn lúc query) đều đổi sang gọi `normalizeJapaneseText()`.

Tiện thể fix luôn 1 gap khác cùng đợt review: `（Ｃ）`/`（ｃ）` (ngoặc + chữ C đều full-width — kiểu gõ IME tiếng Nhật rất phổ biến) trước đó KHÔNG được nhận diện tương đương với `©`/`(C)`, vì bước fold © chạy TRƯỚC NFKC (bắt buộc, để không mất dấu hiệu `Ⓒ`/`ⓒ` — xem mục 3d), nhưng full-width→half-width chỉ được NFKC xử lý, quá muộn để quy tắc © bắt lại. Regex © giờ khớp cả 2 dạng ngoặc (full-width lẫn half-width) ngay từ đầu.

**Ý nghĩa cho việc đọc code:** 1 fix ở tầng "so sánh cũ/mới có đổi không" không tự động bảo vệ tầng "tra cứu quy tắc theo tên" — đây là 2 bài toán riêng dùng chung 1 lớp dữ liệu (title/tên NXB), nhưng nằm ở 2 chỗ khác nhau trong pipeline. Khi sửa 1 loại chuẩn hoá text, phải rà lại TẤT CẢ những nơi khác so sánh/khoá cùng loại dữ liệu đó, không chỉ nơi phát hiện ra vấn đề đầu tiên.
```

- [ ] **Step 2: Update the quick-reference table**

Find this row in the "## 4. Bảng tra nhanh" table:

```
| `src/logic/upsert.js` | Diff cũ/mới + đánh số ổn định + `sameValue()` | Cả 2 |
```

Replace with:

```
| `src/logic/upsert.js` | Diff cũ/mới + đánh số ổn định + `sameValue()`/`normalizeJapaneseText()` | Cả 2 |
```

- [ ] **Step 3: Commit**

```bash
git add docs/gas1-van-hanh.md
git commit -m "$(cat <<'EOF'
Document the Tier-2/3 lookup normalization fix (mục 3f)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Push everything and run a full `runGas1()`**

Run: `clasp push` (confirms no syntax errors across all modified files).

In the Apps Script editor, run `runGas1()` once. Check the Execution log for:
- No thrown errors.
- The same style of summary lines as before (`顧客作品マスタ 集計: ...`, `コピーライトマスタ 集計: ...`).
- The 4 known duplicate-CMSID warnings still appear (unrelated to this fix, expected — see `docs/gas1-van-hanh.md` §3e).

- [ ] **Step 2: Run `runGas1()` a second time immediately**

Expected: `更新` (updated) count for both masters stays at the same low/zero level as the last known-good run before this plan — this fix should not cause NEW updates to appear (it only affects lookups that were previously silently missing, which would show up as a Tier change on titles that legitimately had a Tier-2/3 rule available all along; a few titles moving from Tier 4/cá biệt to Tier 2/3 with a real copyright value is an expected, positive side effect of this fix — a large unexpected spike in updated-count elsewhere would indicate a regression).

- [ ] **Step 3: Spot-check the cá biệt (irregular) list**

Compare the `個別対応（コピーライト特定不可）` list in this run's Execution log against the previous run's list (from before this plan). If any title disappeared from that list, open `コピーライトマスタ` and confirm it now has a real Tier-2 or Tier-3 copyright value instead of blank — this is the fix working as intended.

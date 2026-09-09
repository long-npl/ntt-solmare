# Bám ガワ mới nhất — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa code bám đúng ガワ mới nhất — 2 cột mới của `顧客作品マスタ`, tự ghi bổ sung rule © còn thiếu (tra cứu giữ đúng 2 case, không thêm tầng nào), `素材共有日` của `タイトルマスタ` thành bản copy — kèm 4 anchor lý do và test hồi quy khoá chặt tính nhất quán danh tính.

**Architecture:** Mọi thay đổi nằm ở tầng NGHIỆP VỤ của 2 project (`gas_phase_1/`, `gas_phase_2/`). **Không sửa `shared/*`** nên không phải chạy `tools/sync-shared.js`. Quyết định logic đặt ở file được suite pure nạp (`3_sources.js`, `4_customer_master.js`, `5_copyright_master.js`, `7_warnings.js`) để test được bằng Node; phần IO (đọc/ghi sheet, Slack) đặt ở `9_main.js` — không nằm trong suite, nên nó chỉ được phép gọi hàm thuần đã có test.

**Tech Stack:** Google Apps Script (ES5, `var`, không arrow function, không template literal), Node ≥ 18 để chạy suite test (`vm` + fixtures JSON), không có dependency ngoài.

**Spec:** `docs/superpowers/specs/2026-09-08-gawa-alignment-design.md`

## Global Constraints

- **ガワ là nguồn sự thật:** `example/【ソル】タイトルマスタ　ガワ_最新.xlsx`. Header ở **hàng 15**, dữ liệu từ hàng 16, cột A là cột đệm trống.
- **Tra cột theo TÊN header, không theo chữ cái.** Không hardcode chữ cái cột, không hardcode số hàng. Ngoại lệ duy nhất đã có: file TSV `multi_title_*` (không có hàng header).
- **`削除等はしない`** — không bước nào được xoá dòng của bất kỳ master nào.
- **Bộ lọc NG không đổi:** `isWorkEligible()` giữ nguyên `judged === true && isNg !== true`. Dòng レギュレーション không phải `判定済み` **chỉ** được cấp cột `レギュレーション判定状況`; tuyệt đối không cấp `①②③`, không tham gia `isRegulationNg()`.
- **3 cột phán định giữ `write:'条件'`** (据え置き khi tra không ra).
- **3 giá trị của `レギュレーション判定状況`** (đúng chữ, không đổi): `レギュレーション判定済` / `顧客確認中` / `レギュレーション未判定`.
- **Tra rule © giữ ĐÚNG 2 case, KHÔNG thêm tầng nào** (spec §5.1, user chốt 2026-09-08):
  ① tác phẩm có cả `出版社`+`レーベル名` → khớp cặp; ② không có `レーベル名` → khớp dòng rule có
  `出版社` khớp và `雑誌名/レーベル = ""`. Đây đúng là hành vi hiện tại → **không sửa
  `resolvePublisherCopyright()` phần tra cứu, không sửa `buildPublisherCopyrightLookup()`**.
  Không thêm tra ngược theo `レーベル`: cùng một `レーベル` xuất hiện dưới nhiều `出版社`.
- **Sheet ④ `出版社別コピーライトマスタ`**: `spreadsheetId = 1FmW8IrpUQKDEdjsWvlLSPDvTKhWwdbEUf_HLWOgHuFM`, `sheetName = 出版社別コピーライトマスタ`. GAS chỉ được **append dòng mới dưới cùng**, không sửa/xoá dòng người nhập.
- **4 anchor mới trong `docs/decisions.md`** (tên đã chốt, không tự đổi): `regulation-status-01`, `material-shared-02`, `copyright-lookup-02`, `copyright-autoappend-01`. Viết anchor **trong cùng commit** với code trỏ tới nó.
- **`docs/master-columns.tsv` KHÔNG nằm trong plan này** — file làm việc riêng của 長 (long-npl). Không sửa, không thêm vào commit.
- **Commit message:** tiếng Anh, câu mệnh lệnh, **không** prefix `feat:`/`fix:` (theo style repo: *"Accept -, _, and ー as range separators in 初回配信巻数"*). Kèm trailer `Co-Authored-By:`.
- **Lệnh kiểm bắt buộc sau mỗi task:** `node tools/verify-phase1/run.js`, `node tools/verify-refs/run.js` (task 5 thêm `node tools/verify-phase2/run.js`). Suite tự chạy `tools/sync-shared.js --check` trước.

---

## File Structure

| File | Trách nhiệm | Task |
|---|---|---|
| `gas_phase_1/4_customer_master.js` | Bảng cột `顧客作品マスタ` + rule từng cột. Thêm 2 dòng cột, thêm 1 field vào `buildCustomerRecord()` | 1, 2 |
| `gas_phase_1/3_sources.js` | Nguồn ①: bỏ filter `判定済み` khỏi parse, index 2 lớp, hàm tra trạng thái | 2 |
| `gas_phase_1/5_copyright_master.js` | 2 hàm thuần cho auto-append + lý do `ルール未記入` | 3 |
| `gas_phase_1/7_warnings.js` | 1 loại cảnh báo mới `ルール自動追記` (lý do `ルール未記入` tự vào nhóm `コピーライト注意` sẵn có) | 3 |
| `gas_phase_1/9_main.js` | Nhạc trưởng + IO: đóng dấu `素材共有日` cho dòng mới, gọi append, Slack | 1, 3 |
| `gas_phase_1/0_config.js` | Khai báo `OUTPUTS.PUBLISHER_COPYRIGHT` (sheet ④ giờ GAS có quyền ghi) | 3 |
| `gas_phase_2/3_sources.js` | Đọc `素材共有日` từ `顧客作品マスタ` bằng `tryCol` (tuỳ chọn) | 4 |
| `gas_phase_2/4_title_master.js` | Nhánh `stamp` → copy + fallback | 4 |
| `tools/verify-phase1/tests.js` | Test nghiệp vụ GAS❶ | 1, 2, 3, 5 |
| `tools/verify-phase2/tests.js` | Test nghiệp vụ GAS❷ | 4, 5 |
| `docs/decisions.md` | 4 anchor lý do (append cuối file) | 1, 2, 3 |
| `docs/3-master-cot-nguon-va-logic.md` | Đổi `❌`/`⚠️` → `✅` cho phần vừa land | 1, 2, 3, 4 |

---

## Task 1: `顧客作品マスタ` › `素材共有日` — đóng dấu cho dòng mới

**Files:**
- Modify: `gas_phase_1/4_customer_master.js` (bảng `CUSTOMER_COLUMNS`, sau `タイトルID`)
- Modify: `gas_phase_1/9_main.js` (`runGas1()` — dời `runAt` lên trước diff, đóng dấu `toAdd`)
- Modify: `docs/decisions.md` (anchor `material-shared-02`)
- Modify: `docs/3-master-cot-nguon-va-logic.md` (§1.3 dòng `素材共有日`)
- Test: `tools/verify-phase1/tests.js`

**Interfaces:**
- Consumes: `toSheetRow(record, headerIndex, columnCount, columns, previousRow)` và `recordsEqual(existing, incoming, columns)` từ `shared/engine.js` (đã có).
- Produces: field `materialSharedAt` trên record của `顧客作品マスタ` — Task 4 đọc lại field cùng tên từ sheet.

- [ ] **Step 1: Viết test đỏ**

Thêm vào `tools/verify-phase1/tests.js` (trước `module.exports`):

```js
function test_materialSharedAt(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var headers = src.CUSTOMER_COLUMNS.map(function (c) { return c.header; });
  check('素材共有日 nam ngay sau タイトルID', headers.slice(0, 5),
    ['タイトルNo', 'CMS ID', 'タイトルID', '素材共有日', 'タイトル区分']);
  var column = src.CUSTOMER_COLUMNS.filter(function (c) { return c.header === '素材共有日'; })[0];
  check('素材共有日 la write-once', column.write, '1回');

  var idx = src.buildHeaderIndex(['', '素材共有日', 'タイトル名']);
  var cols = [
    { header: '素材共有日', field: 'materialSharedAt', from: 'stamp', write: '1回' },
    { header: 'タイトル名', field: 'titleName', from: 'cms', write: '上書', rowKey: true },
  ];
  var runAt = new Date(2026, 8, 8);

  var added = src.toSheetRow({ materialSharedAt: runAt, titleName: 'A' }, idx, 3, cols, undefined);
  check('dong MOI -> dong dau ngay chay', added[1], runAt);

  var updatedBlank = src.toSheetRow({ titleName: 'A moi' }, idx, 3, cols, ['', '', 'A cu']);
  check('dong CU o dang trong -> VAN de trong (khong backfill ngay hom nay)', updatedBlank[1], '');

  var updatedFilled = src.toSheetRow({ titleName: 'A moi' }, idx, 3, cols,
    ['', new Date(2026, 0, 5), 'A cu']);
  check('dong CU da co ngay -> khong doi', updatedFilled[1], new Date(2026, 0, 5));

  check('dong CU o trong + incoming rong -> KHONG bi coi la thay doi',
    src.recordsEqual({ materialSharedAt: '', titleName: 'A' }, { titleName: 'A' }, cols), true);
}
```

Và thêm `test_materialSharedAt` vào mảng `unit` của `module.exports`.

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `node tools/verify-phase1/run.js`
Expected: FAIL ở `素材共有日 nam ngay sau タイトルID` (mảng thật vẫn là `['タイトルNo','CMS ID','タイトルID','タイトル区分',…]`) và FAIL/throw ở dòng lấy `column.write` vì `column` là `undefined`.

- [ ] **Step 3: Thêm cột vào bảng**

Trong `gas_phase_1/4_customer_master.js`, chèn **ngay sau** dòng `タイトルID`:

```js
  // Ngày dòng được đưa vào master. GAS❶ chỉ đóng dấu cho dòng MỚI: runGas1() gán
  // materialSharedAt cho customerDiff.toAdd, dòng update không có field này nên nhận ''
  // và write:'1回' không ghi gì — kể cả khi ô đang trống. Cố ý KHÔNG backfill dòng cũ:
  // hôm nay không phải ngày tư liệu được chia sẻ. Xem docs/decisions.md #material-shared-02
  { header: '素材共有日', field: 'materialSharedAt', from: 'stamp', write: '1回' },
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

Run: `node tools/verify-phase1/run.js`
Expected: PASS. Nếu `test_customerColumns` đỏ vì nó so cả mảng dòng ghi, cập nhật kỳ vọng của nó — bảng cột nay dài thêm 1 ô, đó là thay đổi đúng.

- [ ] **Step 5: Đóng dấu cho dòng mới trong `runGas1()`**

Trong `gas_phase_1/9_main.js`, **dời** dòng `var runAt = new Date();` lên trước bước diff, và thêm vòng đóng dấu ngay sau `customerDiff`:

```js
    // runAt lấy MỘT lần ở đây: ô 更新日, tab 変更詳細, tab 警告 và cột 素材共有日 dùng chung
    // một mốc thời gian nên 4 nơi đối chiếu được với nhau cho cùng một lần chạy.
    var runAt = new Date();

    var matches = resolveNumbersFromMatches(filtered.matches, existingCustomer.records, 'titleNo');
    var customerDiff = diffUpsertFromMatches(matches, CUSTOMER_COLUMNS);
    // CHỈ dòng mới được đóng dấu. Dòng update không có field này -> '' -> write:'1回' không
    // ghi, và sameWriteOnceValue('', '') = "không đổi" nên 8.000 dòng cũ không bị churn.
    customerDiff.toAdd.forEach(function (record) { record.materialSharedAt = runAt; });
```

Xoá dòng `var runAt = new Date();` cũ (nằm trước `writeMaster`) cùng comment của nó để không khai báo 2 lần.

- [ ] **Step 6: Kiểm không có hàm nào gọi mà chưa tồn tại**

Run: `node tools/verify-refs/run.js`
Expected: exit 0.

- [ ] **Step 7: Viết anchor `material-shared-02`**

Append vào cuối `docs/decisions.md`:

```markdown
## material-shared-02 — một nguồn duy nhất cho 素材共有日, không backfill

`素材共有日` giờ có ở **cả** `顧客作品マスタ` và `タイトルマスタ` (ガワ mới nhất).
`顧客作品マスタ` là **nguồn duy nhất**: GAS❶ đóng dấu khi append dòng mới. `タイトルマスタ`
**copy** lại, vẫn write-once, và chỉ khi nguồn trống mới tự đóng dấu (hành vi cũ giữ làm
fallback) — nhờ vậy không dòng nào trên `タイトルマスタ` mất ngày đang có.

**Không backfill dòng cũ bằng ngày hôm nay.** Ô đang trống là "không biết", còn ghi hôm nay
vào là tạo ra dữ liệu sai trông như thật — mà đây đúng là cột người ta dùng để trả lời
"tư liệu chia sẻ từ bao giờ".

Cách cài không cần sửa engine: `runGas1()` gán `materialSharedAt` **chỉ cho**
`customerDiff.toAdd`. Dòng update không có field → `''` → `write:'1回'` không ghi, và
`sameWriteOnceValue('', '')` trả `true` ("không đổi") nên ~8.000 dòng cũ không vào `toUpdate`.

Nối tiếp `master-added-01` (chuyện `マスタ追加日` đổi tên thành `素材共有日`).
```

- [ ] **Step 8: Cập nhật `3-master-cot-nguon-va-logic.md`**

Trong §1.3, dòng `素材共有日`: đổi ô trạng thái từ
`❌ **chưa code** (cột mới của ガワ)` thành `✅`.

- [ ] **Step 9: Commit**

```bash
git add gas_phase_1/4_customer_master.js gas_phase_1/9_main.js tools/verify-phase1/tests.js docs/decisions.md docs/3-master-cot-nguon-va-logic.md
git commit -m "$(cat <<'EOF'
Stamp 素材共有日 on 顧客作品マスタ rows the run actually adds

顧客作品マスタ becomes the single source for 素材共有日: runGas1 stamps only
customerDiff.toAdd, so an existing row with a blank cell stays blank instead of
being backfilled with today - today is not when the material was shared.

No engine change needed. Update rows carry no materialSharedAt, so write:'1回'
writes nothing and sameWriteOnceValue('', '') reports "unchanged", keeping ~8,000
existing rows out of toUpdate.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `顧客作品マスタ` › `レギュレーション判定状況` — 3 trạng thái

**Files:**
- Modify: `gas_phase_1/3_sources.js:39` (hằng trạng thái), `:67-93` (`parseRegulation`), `:115-137` (`buildRegulationIndex`), thêm `lookupRegulationStatus()` sau `lookupRegulation()`
- Modify: `gas_phase_1/4_customer_master.js` (bảng cột + `buildCustomerRecord`)
- Modify: `docs/decisions.md` (anchor `regulation-status-01`)
- Modify: `docs/3-master-cot-nguon-va-logic.md` (§1.3 + §4.16)
- Test: `tools/verify-phase1/tests.js`

**Interfaces:**
- Consumes: `regulationKeyBoth/regulationKeyName/regulationKeyId(record)` → `string|null`; `lookupRegulation(work, index)` → `object|null` (giữ nguyên chữ ký và hành vi).
- Produces:
  - `buildRegulationIndex(records)` → `{byBoth, byName, byId, presenceByBoth, presenceByName, presenceById}` (3 map cũ giữ nguyên tên và nội dung = **chỉ** dòng `判定済み`).
  - `lookupRegulationStatus(work, index)` → một trong `'レギュレーション判定済' | '顧客確認中' | 'レギュレーション未判定'`.
  - Field `regulationStatus` trên record `顧客作品マスタ`.

- [ ] **Step 1: Viết test đỏ**

Thêm vào `tools/verify-phase1/tests.js`:

```js
function test_regulationStatus(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var HEADER = ['ステータス', 'タイトルID', 'タイトル名', '①広告出稿ポリシー（出稿NG）',
    '②一般面出稿NG（アダルト作品扱い）', '③シーモアロゴ判定'];
  var rows = [HEADER,
    ['判定済み', '111', 'Da phan dinh', '問題なし', '一般面OK', 'ロゴあり'],
    ['依頼中', '222', 'Dang cho', '問題あり', 'アダルト作品扱い', 'ロゴなし'],
    ['削除', '333', 'Da xoa', '問題なし', '一般面OK', 'ロゴあり'],
    ['', '444', 'Trong status', '問題なし', '一般面OK', 'ロゴあり'],
    ['判定済み', '', '', '', '', ''],
  ];

  var records = src.parseRegulation(rows);
  check('parseRegulation KHONG con loc 判定済み', records.length, 4);
  check('parseRegulation mang theo status',
    records.map(function (r) { return r.status; }), ['判定済み', '依頼中', '削除', '']);

  var index = src.buildRegulationIndex(records);
  function st(id, name) { return src.lookupRegulationStatus({ titleId: id, titleName: name }, index); }
  check('co dong 判定済み -> 判定済', st('111', 'Da phan dinh'), 'レギュレーション判定済');
  check('dong 依頼中 -> 顧客確認中', st('222', 'Dang cho'), '顧客確認中');
  check('dong 削除 -> 顧客確認中', st('333', 'Da xoa'), '顧客確認中');
  check('status trong -> 顧客確認中', st('444', 'Trong status'), '顧客確認中');
  check('khong tra ra dong nao -> 未判定', st('999', 'Khong ton tai'), 'レギュレーション未判定');
  check('chi khop ID (ten khac) van ra ket qua', st('222', 'Ten da doi'), '顧客確認中');

  // BAT BIEN: dong khong phai 判定済み chi cap DUNG cot trang thai.
  check('dong 依頼中 khong cap phan dinh',
    src.lookupRegulation({ titleId: '222', titleName: 'Dang cho' }, index), null);
  var pending = src.buildCustomerRecord({ titleId: '222', titleName: 'Dang cho' },
    { values: { regulation: index } });
  check('dong 依頼中 -> judged=false va isNg=false', [pending.judged, pending.isNg], [false, false]);
  check('dong 依頼中 -> ①②③ rong (de engine giu nguyen o)',
    [pending.policy, pending.general, pending.logoJudgement], ['', '', '']);
  check('dong 依頼中 -> KHONG du dieu kien vao master', src.isWorkEligible(pending), false);
  check('dong 依頼中 -> cot trang thai la 顧客確認中', pending.regulationStatus, '顧客確認中');

  var judged = src.buildCustomerRecord({ titleId: '111', titleName: 'Da phan dinh' },
    { values: { regulation: index } });
  check('dong 判定済み -> cot trang thai la 判定済', judged.regulationStatus, 'レギュレーション判定済');

  // Bang cot: phai la 上書, neu 条件 thi cot nay vo dung.
  var column = src.CUSTOMER_COLUMNS.filter(function (c) {
    return c.header === 'レギュレーション判定状況'; })[0];
  check('レギュレーション判定状況 la 上書', column.write, '上書');
  check('レギュレーション判定状況 nam ngay sau タイトル区分',
    src.CUSTOMER_COLUMNS.map(function (c) { return c.header; }).slice(4, 7),
    ['タイトル区分', 'レギュレーション判定状況', '①広告出稿ポリシー']);
}
```

Thêm `test_regulationStatus` vào mảng `unit`.

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `node tools/verify-phase1/run.js`
Expected: FAIL ở `parseRegulation KHONG con loc 判定済み` (hiện trả 2 dòng), và throw `lookupRegulationStatus is not a function`.

- [ ] **Step 3: Thêm hằng 3 trạng thái**

Trong `gas_phase_1/3_sources.js`, ngay dưới `var REGULATION_STATUS_OK = '判定済み';`:

```js
// 3 giá trị của cột レギュレーション判定状況. Đây là giá trị GAS SUY RA, không phải copy
// nguyên văn ステータス: nguồn có 8 cách viết (判定済み 5.158 / trống 1.376 / 削除 145 /
// Wチェック完了 16 / Wチェック待ち 11 / 担当者依頼中 9 / 再判定依頼 6 / 依頼中 1) và user chốt
// gộp về đúng 3 giá trị của ガワ. Xem docs/decisions.md #regulation-status-01
var REGULATION_STATE_JUDGED = 'レギュレーション判定済';
var REGULATION_STATE_PENDING = '顧客確認中';
var REGULATION_STATE_NONE = 'レギュレーション未判定';
```

- [ ] **Step 4: Bỏ filter khỏi `parseRegulation`, mang `status` theo**

Thay vòng lặp trong `parseRegulation()` bằng:

```js
  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    // Trước 2026-09-08 chỗ này lọc `ステータス !== 判定済み -> continue`. Bỏ đi vì cột
    // レギュレーション判定状況 cần phân biệt "có dòng nhưng chưa 判定済み" với "không có dòng
    // nào". Việc lọc 判定済み chuyển xuống buildRegulationIndex (lớp verdict).
    var titleName = row[colTitleName];
    var titleId = colTitleId === undefined ? '' : row[colTitleId];
    // Dòng trống hoàn toàn ở đuôi sheet: không có tên lẫn ID thì không tra được bằng gì.
    if (normalizeJapaneseText(titleName) === '' && normalizeJapaneseText(titleId) === '') continue;
    records.push({
      titleName: titleName,
      titleId: titleId,
      status: row[colStatus],
      policy: row[colPolicy],
      general: row[colGeneral],
      logoJudgement: row[colLogo],
    });
  }
  return records;
```

- [ ] **Step 5: `buildRegulationIndex` thành 2 lớp**

Thay toàn bộ thân `buildRegulationIndex()` bằng:

```js
function buildRegulationIndex(records) {
  function build(source, keyOf) {
    var lookup = new Map();
    source.forEach(function (record) {
      var key = keyOf(record);
      if (key === null) return;
      var incoming = {
        policy: record.policy,
        general: record.general,
        logoJudgement: record.logoJudgement,
        isNg: isRegulationNg(record),
      };
      var current = lookup.get(key);
      if (current === undefined || (incoming.isNg && !current.isNg)) lookup.set(key, incoming);
    });
    return lookup;
  }
  // Lớp PRESENCE chỉ trả lời "có dòng nào cho tác phẩm này hay không", không mang phán định.
  function buildPresence(source, keyOf) {
    var lookup = new Map();
    source.forEach(function (record) {
      var key = keyOf(record);
      if (key === null) return;
      lookup.set(key, true);
    });
    return lookup;
  }
  // Lớp VERDICT: CHỈ dòng 判定済み. Đây là ranh giới không được nới — dòng đang chờ xử lý
  // không bao giờ được cấp ①②③ hay làm tác phẩm bị coi là NG.
  var judged = records.filter(function (record) {
    return normalizeJapaneseText(record.status) === REGULATION_STATUS_OK;
  });
  return {
    byBoth: build(judged, regulationKeyBoth),
    byName: build(judged, regulationKeyName),
    byId: build(judged, regulationKeyId),
    presenceByBoth: buildPresence(records, regulationKeyBoth),
    presenceByName: buildPresence(records, regulationKeyName),
    presenceById: buildPresence(records, regulationKeyId),
  };
}
```

- [ ] **Step 6: Thêm `lookupRegulationStatus()`**

Ngay sau `lookupRegulation()` trong `gas_phase_1/3_sources.js`:

```js
/**
 * Trạng thái phán định của 1 tác phẩm — giá trị cột レギュレーション判定状況.
 *
 * Dùng ĐÚNG cascade 3 tầng của lookupRegulation() để hai cột không bao giờ kể hai câu
 * chuyện khác nhau về cùng một tác phẩm.
 *
 * @param {{titleId: *, titleName: *}} work
 * @param {object} index - buildRegulationIndex()
 * @returns {string} REGULATION_STATE_JUDGED | REGULATION_STATE_PENDING | REGULATION_STATE_NONE
 */
function lookupRegulationStatus(work, index) {
  if (lookupRegulation(work, index) !== null) return REGULATION_STATE_JUDGED;
  // Dung regulationKeyBoth() chu KHONG tu noi ten + ID: khoa ghep dung ky tu NUL
  // (xem docs/decisions.md #cascade-02) va noi tay o cho thu hai la cho thu hai de sai.
  var both = regulationKeyBoth(work);
  var name = regulationKeyName(work);
  var id = regulationKeyId(work);
  var tiers = [
    both !== null ? index.presenceByBoth.get(both) : undefined,
    name !== null ? index.presenceByName.get(name) : undefined,
    id !== null ? index.presenceById.get(id) : undefined,
  ];
  for (var i = 0; i < tiers.length; i++) {
    if (tiers[i] !== undefined) return REGULATION_STATE_PENDING;
  }
  return REGULATION_STATE_NONE;
}
```

- [ ] **Step 7: Thêm cột + field**

Trong `gas_phase_1/4_customer_master.js`, chèn **ngay sau** dòng `タイトル区分`:

```js
  // Kiểu ghi PHẢI là 上書: cột này chỉ có giá trị khi nó luôn kể lần chạy hiện tại. 3 cột
  // phán định bên cạnh là 条件 (据え置き) nên có thể đang là phán định của tuần trước; đây là
  // manh mối duy nhất để phân biệt. Xem docs/decisions.md #regulation-status-01
  { header: 'レギュレーション判定状況', field: 'regulationStatus', from: 'regulation', write: '上書' },
```

Trong `buildCustomerRecord()`, thêm vào object trả về (ngay dưới `logoJudgement:`):

```js
    regulationStatus: lookupRegulationStatus(cms, loaded.values.regulation),
```

- [ ] **Step 8: Chạy test, xác nhận XANH**

Run: `node tools/verify-phase1/run.js`
Expected: PASS. Nếu `test_regulationCascadeAndHold` đỏ vì nó đếm số record trả về từ `parseRegulation`, cập nhật kỳ vọng: số dòng nay gồm cả dòng chưa `判定済み` — đó là thay đổi đúng, và các check về "tra không ra thì 据え置き" phải **vẫn xanh** (lớp verdict vẫn lọc `判定済み`). Nếu một check nào đó về 据え置き đỏ thì **dừng lại**, đó là dấu hiệu lớp verdict bị nới.

- [ ] **Step 9: Kiểm refs**

Run: `node tools/verify-refs/run.js`
Expected: exit 0.

- [ ] **Step 10: Viết anchor `regulation-status-01`**

Append vào cuối `docs/decisions.md`:

```markdown
## regulation-status-01 — 3 trạng thái phán định, và ranh giới không được nới

Cột `レギュレーション判定状況` (`顧客作品マスタ`) tồn tại để trả lời đúng một câu: *3 cột phán
định bên cạnh là của lần chạy này, hay là giá trị cũ đang 据え置き?*

| Cascade 3 tầng tra được gì | Ghi ra |
|---|---|
| Dòng có `ステータス = 判定済み` | `レギュレーション判定済` |
| Có dòng, `ステータス` là thứ khác (`依頼中`, `Wチェック待ち`, `Wチェック完了`, `担当者依頼中`, `再判定依頼`, `削除`, trống) | `顧客確認中` |
| Không tầng nào tra ra dòng nào | `レギュレーション未判定` |

`顧客確認中` **không tồn tại trong nguồn** — nó là giá trị GAS suy ra. User chốt gộp cả
`削除` và trống vào đó (2026-09-08) để chỉ dùng đúng 3 giá trị ガワ đã nêu.

**Hai ràng buộc không được phá:**

1. **Kiểu ghi phải là `上書`.** Nếu là `条件` thì cột này cũng bị đóng băng cùng 3 cột nó
   đang mô tả, và trở thành vô dụng.
2. **Dòng không phải `判定済み` chỉ cấp đúng cột này.** `buildRegulationIndex()` vì vậy có
   2 lớp: lớp *verdict* (chỉ `判定済み`, cấp `①②③` + `isNg`) và lớp *presence* (mọi dòng,
   chỉ để suy ra `顧客確認中`). Nới lớp verdict = cho tác phẩm NG lọt vào master.

Kéo theo: `parseRegulation()` không còn lọc `判定済み` (trước 2026-09-08 filter nằm ở đó nên
code còn không "thấy" được là có dòng đang chờ xử lý hay không). Việc lọc chuyển xuống
`buildRegulationIndex()`.
```

- [ ] **Step 11: Cập nhật `3-master-cot-nguon-va-logic.md`**

- §1.3, dòng `レギュレーション判定状況`: `❌ **chưa code** (cột mới của ガワ)` → `✅`
- §4.16: đổi tiêu đề `### 4.16 レギュレーション判定状況 — 3 trạng thái, CHƯA CODE ❌` thành `### 4.16 レギュレーション判定状況 — 3 trạng thái ✅`, và xoá đoạn cuối "Kéo theo 1 thay đổi ở nguồn ①: `parseRegulation()` hiện **lọc bỏ**…" (đã làm rồi), thay bằng: `Cài 2026-09-08: parseRegulation() không còn lọc 判定済み, việc lọc chuyển xuống lớp verdict của buildRegulationIndex().`

- [ ] **Step 12: Commit**

```bash
git add gas_phase_1/3_sources.js gas_phase_1/4_customer_master.js tools/verify-phase1/tests.js docs/decisions.md docs/3-master-cot-nguon-va-logic.md
git commit -m "$(cat <<'EOF'
Say whether ①②③ came from this run or are being held over

New レギュレーション判定状況 column on 顧客作品マスタ folds the source's 8 ステータス
spellings into the 3 values the ガワ names: 判定済 when the cascade finds a
判定済み row, 顧客確認中 when it finds a row in any other state, 未判定 when it
finds nothing. Written 上書 on purpose - the column is only useful if it always
describes the current run, since the three verdict columns next to it are 条件
and may be weeks old.

parseRegulation no longer drops non-判定済み rows; buildRegulationIndex now keeps
a verdict layer (判定済み only, still the sole source of ①②③ and isNg) beside a
presence layer. The filter moved, it did not widen: a pending row still cannot
supply a verdict, mark a work NG, or change isWorkEligible.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Tự ghi bổ sung rule thiếu vào sheet ④

**Files:**
- Modify: `gas_phase_1/0_config.js:57-66` (thêm `OUTPUTS.PUBLISHER_COPYRIGHT`)
- Modify: `gas_phase_1/5_copyright_master.js` (thêm `collectMissingPublisherRules()`, `buildPublisherRuleRow()`)
- Modify: `gas_phase_1/7_warnings.js` (hằng `WARNING_KIND_RULE_APPENDED`, `buildRuleAppendedWarningRows()`, nối vào `buildAllWarnings()`)
- Modify: `gas_phase_1/9_main.js` (`appendMissingPublisherRules()` + gọi trong `runGas1()` + Slack)
- Modify: `docs/decisions.md` (anchor `copyright-autoappend-01`)
- Modify: `docs/3-master-cot-nguon-va-logic.md` (§4.9 thêm "Bước 4", §6 danh sách cảnh báo 13 → 14)
- Test: `tools/verify-phase1/tests.js`

**Interfaces:**
- Consumes: `publisherCopyrightKey(publisher, label)`, `COPYRIGHT_REASON_NO_RULE`, `resolvePublisherCopyright()` (tất cả **đã có, không sửa** — xem spec §5.1); `col(headerIndex, name)`, `resolveMasterHeader()`, `warningRow(runAt, kind, titleNo, titleId, titleName, detail)` (đã có). Lookup vẫn là `Map` trần như hiện tại (`rulesLookup.get(key)` / `rulesLookup.has(key)`).
- Produces:
  - `collectMissingPublisherRules(entries, rulesLookup)` → `Array<{publisher: *, label: *}>`
  - `buildPublisherRuleRow(pair, headerIndex, columnCount)` → `Array<*>` độ dài `columnCount`
  - `appendMissingPublisherRules(pairs)` → `{added: Array<object>, error: string|null}` (IO, `9_main.js`)
  - `buildRuleAppendedWarningRows(appended, runAt)` → `Array<object>`

- [ ] **Step 1: Viết test đỏ**

Thêm vào `tools/verify-phase1/tests.js`:

```js
function test_appendMissingRules(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var rules = [
    { publisher: '集英社', label: '', flag: '01：自動化', template: '©集英社', preConfirmation: '必要' },
  ];
  var lookup = src.buildPublisherCopyrightLookup(rules);
  function entry(publisher, label, reason) {
    return { record: { publisher: publisher, label: label, titleName: 'T' }, copyrightReason: reason };
  }

  var pairs = src.collectMissingPublisherRules([
    entry('新しい出版社', 'レーベルA', 'ルール無し'),
    entry('新しい出版社', 'レーベルA', 'ルール無し'),
    entry('新しい出版社', 'レーベルB', 'ルール無し'),
    entry('集英社', '', 'テンプレート不備'),
    entry('個別対応の出版社', '', '個別ルール'),
    entry('追記済みだが未記入', '', 'ルール未記入'),
    entry('', '', 'ルール無し'),
  ], lookup);
  check('chi gom ca ルール無し, dedupe theo (出版社,レーベル)',
    pairs.map(function (p) { return p.publisher + '|' + p.label; }),
    ['新しい出版社|レーベルA', '新しい出版社|レーベルB']);

  // ---- Dong placeholder GAS da them nhung chua ai dien -> ly do RIENG de alert ----
  function work(publisher) {
    return { titleName: 'T', author: 'A', publisher: publisher, label: '' };
  }
  var withPlaceholder = src.buildPublisherCopyrightLookup([
    // Dung y hinh dang GAS ghi ra o §5.2: chi 2 o, flag + template deu trong.
    { publisher: '追記済み出版社', label: '', flag: '', template: '', preConfirmation: '' },
    // 02：個別ルール la CO Y viet tay, khong phai viec con no -> phai giu ly do cu.
    { publisher: '個別ルール出版社', label: '', flag: '02：個別ルール', template: '都度問い合わせ要', preConfirmation: '必要' },
  ]);
  check('placeholder chua ai dien -> ly do rieng ルール未記入',
    src.resolvePublisherCopyright(work('追記済み出版社'), withPlaceholder).reason, 'ルール未記入');
  check('... va van de trong, khong tu sinh ©',
    src.resolvePublisherCopyright(work('追記済み出版社'), withPlaceholder).value, null);
  check('... canh bao noi ro la GAS da them va cho nguoi dien',
    src.resolvePublisherCopyright(work('追記済み出版社'), withPlaceholder).detail.indexOf('未記入') >= 0, true);
  check('02：個別ルール KHONG bi doi thanh ルール未記入',
    src.resolvePublisherCopyright(work('個別ルール出版社'), withPlaceholder).reason, '個別ルール');

  check('nguon rule doc loi (lookup null) -> khong ghi gi',
    src.collectMissingPublisherRules([entry('x', 'y', 'ルール無し')], null), []);

  // CHAY LAI lan sau: dong GAS da them hom truoc nam trong bang rule -> khong them nua.
  // Dong placeholder co flag/template trong, dung y hinh dang GAS ghi ra.
  var afterAppend = src.buildPublisherCopyrightLookup(rules.concat([
    { publisher: '新しい出版社', label: 'レーベルA', flag: '', template: '', preConfirmation: '' },
  ]));
  check('chay lai -> cap da co trong bang thi KHONG them lan 2',
    src.collectMissingPublisherRules([entry('新しい出版社', 'レーベルA', 'ルール無し')], afterAppend), []);

  // Dong ghi ra: DUNG 2 o, moi o khac de trong.
  var idx = src.buildHeaderIndex(['', '', '', '', '出版社', '危険', '雑誌名/レーベル', '自動化フラグ']);
  var row = src.buildPublisherRuleRow({ publisher: 'P', label: 'L' }, idx, 8);
  check('dong ghi ra dung be rong sheet', row.length, 8);
  check('出版社 vao dung cot', row[4], 'P');
  check('雑誌名/レーベル vao dung cot', row[6], 'L');
  check('moi o khac de trong (ke ca 自動化フラグ)',
    [row[0], row[1], row[2], row[3], row[5], row[7]], ['', '', '', '', '', '']);

  // Canh bao: 1 dong / 1 cap da them, va 1 dong rieng khi ghi loi.
  var runAt = new Date(2026, 8, 8);
  var rows = src.buildRuleAppendedWarningRows({ added: [{ publisher: 'P', label: 'L' }], error: null }, runAt);
  check('them 1 cap -> 1 dong canh bao', rows.length, 1);
  check('canh bao dung loai', rows[0].kind, 'ルール自動追記');
  check('canh bao neu ten NXB/レーベル', rows[0].titleName, 'P／L');
  var failed = src.buildRuleAppendedWarningRows({ added: [], error: 'mat quyen ghi' }, runAt);
  check('ghi loi -> 1 dong canh bao noi ro nguyen nhan',
    [failed.length, failed[0].detail.indexOf('mat quyen ghi') >= 0], [1, true]);
  check('khong co gi de them -> khong co canh bao',
    src.buildRuleAppendedWarningRows({ added: [], error: null }, runAt).length, 0);
}
```

Thêm `test_appendMissingRules` vào mảng `unit`.

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `node tools/verify-phase1/run.js`
Expected: throw `src.collectMissingPublisherRules is not a function`.

- [ ] **Step 3: Thêm lý do `ルール未記入` + tách nó khỏi `個別ルール`**

Trong `gas_phase_1/5_copyright_master.js`, thêm hằng cạnh các `COPYRIGHT_REASON_*`:

```js
// Dòng placeholder do GAS tự thêm (xem appendMissingPublisherRules): flag VÀ template đều
// trống. PHẢI tách khỏi 個別ルール — '02：個別ルール' là cố ý viết tay, còn cái này là việc
// còn nợ và cần alert. Xem docs/decisions.md #copyright-autoappend-01
var COPYRIGHT_REASON_UNFILLED = 'ルール未記入';
```

Trong `resolvePublisherCopyright()`, **thay** khối `if` kiểm `自動化フラグ` bằng:

```js
  if (normalizeJapaneseText(rule.flag).indexOf(PUBLISHER_COPYRIGHT_FLAG_AUTO_PREFIX) !== 0) {
    if (normalizeJapaneseText(rule.flag) === '' && normalizeJapaneseText(rule.template) === '') {
      return {
        value: null,
        reason: COPYRIGHT_REASON_UNFILLED,
        rule: rule,
        detail: 'GAS が以前この行を追記しましたが、自動化フラグとテンプレートが未記入のままです。'
          + '出版社別コピーライトマスタ に生成ルールを記入してください',
      };
    }
    return {
      value: null,
      reason: COPYRIGHT_REASON_MANUAL_FLAG,
      rule: rule,
      detail: '自動化フラグ「' + String(rule.flag) + '」→ 個別対応（テンプレート: 「' + String(rule.template) + '」）',
    };
  }
```

Không cần thêm hàm cảnh báo nào: `buildCopyrightWarningRows()` gom theo
`出版社 + レーベル + copyrightReason`, nên lý do mới **tự** thành một nhóm `コピーライト注意`
riêng với `detail` của chính nó.

- [ ] **Step 4: Thêm 2 hàm thuần cho auto-append**

Cuối phần "PHẦN 2" của `gas_phase_1/5_copyright_master.js` (sau `resolvePublisherPreConfirmation`):

```js
/**
 * Các cặp (出版社, レーベル) cần ghi bổ sung vào ④.
 *
 * CHỈ nhận ca `ルール無し` thật — trượt cả 2 case tra cứu (spec §5.1). Ca `個別ルール` /
 * `テンプレート不備` / `ルール未記入` thì rule ĐÃ tồn tại, thêm nữa chỉ làm bảng rule bẩn hơn.
 *
 * Dedupe 2 lớp: với bảng rule hiện có (kể cả dòng GAS đã thêm hôm trước) và trong chính
 * lần chạy này — nên chạy 100 lần cũng không sinh dòng trùng.
 * Xem docs/decisions.md #copyright-autoappend-01
 *
 * @param {Array<{record: object, copyrightReason: string}>} entries - resolveCopyrightFor()
 * @param {Map<string, object>|null} rulesLookup - buildPublisherCopyrightLookup(), null khi nguồn ④ đọc lỗi
 * @returns {Array<{publisher: *, label: *}>}
 */
function collectMissingPublisherRules(entries, rulesLookup) {
  if (!entries || !rulesLookup) return [];
  var seen = new Map();
  var missing = [];
  entries.forEach(function (entry) {
    if (entry.copyrightReason !== COPYRIGHT_REASON_NO_RULE) return;
    var publisher = entry.record.publisher;
    // 出版社 trống thì không thành khoá rule được (publisherCopyrightKey trả ''), thêm vào
    // chỉ là một dòng rác không ai tra được.
    if (normalizeJapaneseText(publisher) === '') return;
    var label = entry.record.label;
    var key = publisherCopyrightKey(publisher, label);
    if (rulesLookup.has(key) || seen.has(key)) return;
    seen.set(key, true);
    missing.push({ publisher: publisher, label: label });
  });
  return missing;
}

/**
 * Dòng để append vào ④: ĐÚNG 2 ô 出版社 / 雑誌名/レーベル, mọi ô khác để trống.
 *
 * Để trống 自動化フラグ là có chủ ý: lần chạy sau rule TỒN TẠI nhưng rơi vào nhánh
 * `個別ルール` nên vẫn để cột bản quyền trống + cảnh báo. Placeholder không bao giờ tự sinh
 * ra một bản quyền sai.
 */
function buildPublisherRuleRow(pair, headerIndex, columnCount) {
  var row = [];
  for (var c = 0; c < columnCount; c++) row.push('');
  row[col(headerIndex, '出版社')] = pair.publisher;
  row[col(headerIndex, '雑誌名/レーベル')] = pair.label === null || pair.label === undefined
    ? '' : pair.label;
  return row;
}
```

- [ ] **Step 5: Thêm loại cảnh báo**

Trong `gas_phase_1/7_warnings.js`, thêm hằng cạnh các `WARNING_KIND_*`:

```js
var WARNING_KIND_RULE_APPENDED = 'ルール自動追記';
```

Thêm hàm (đặt cạnh `buildCopyrightOrphanWarningRows`):

```js
/**
 * ルール自動追記 — các cặp (出版社/レーベル) GAS vừa ghi bổ sung vào ④, hoặc lý do ghi lỗi.
 */
function buildRuleAppendedWarningRows(appended, runAt) {
  var rows = [];
  if (!appended) return rows;
  if (appended.error) {
    rows.push(warningRow(runAt, WARNING_KIND_RULE_APPENDED, '', '', '',
      '出版社別コピーライトマスタ への自動追記に失敗しました（処理は継続、コピーライトは据え置き）: '
      + appended.error));
    return rows;
  }
  (appended.added || []).forEach(function (pair) {
    var label = normalizeJapaneseText(pair.label) === '' ? '' : '／' + String(pair.label);
    rows.push(warningRow(runAt, WARNING_KIND_RULE_APPENDED, '', '',
      String(pair.publisher) + label,
      'ルール未登録のため 出版社別コピーライトマスタ の最下部に行を追加しました。'
      + 'テンプレート列を記入してください（記入までは 出版社コピーライト は空欄のままです）'));
  });
  return rows;
}
```

Nối vào `buildAllWarnings()` — thêm ngay trước `.concat(buildUpdatedAtWarningRows(...))`:

```js
    .concat(buildRuleAppendedWarningRows(ctx.ruleAppended, ctx.runAt))
```

- [ ] **Step 6: Chạy test, xác nhận XANH**

Run: `node tools/verify-phase1/run.js`
Expected: PASS.

- [ ] **Step 7: Khai báo quyền ghi trong config**

Trong `gas_phase_1/0_config.js`, thêm vào `OUTPUTS` (sau `COPYRIGHT_MASTER`):

```js
    // Sheet ④ vốn là nguồn ĐỌC (SOURCES.PUBLISHER_COPYRIGHT, cùng spreadsheetId/sheetName).
    // Khai báo lại ở OUTPUTS vì từ 2026-09-08 GAS còn GHI THÊM dòng rule trống vào đây —
    // "GAS có quyền ghi vào sheet này" phải là một điều khai báo tường minh, không phải một
    // lệnh ghi lén nằm trong nhánh SOURCES. Xem docs/decisions.md #copyright-autoappend-01
    PUBLISHER_COPYRIGHT: {
      spreadsheetId: '1FmW8IrpUQKDEdjsWvlLSPDvTKhWwdbEUf_HLWOgHuFM',
      sheetName: '出版社別コピーライトマスタ',
    },
```

- [ ] **Step 8: Viết phần IO trong `9_main.js`**

Thêm hàm (đặt trên `runGas1()`, cạnh `notifyIrregular`):

```js
/**
 * Ghi bổ sung các cặp (出版社, レーベル) chưa có rule vào cuối sheet ④.
 *
 * Chỉ APPEND dòng mới dưới cùng — không sửa, không xoá dòng người nhập. Lỗi bị NUỐT: hàm
 * này chạy SAU khi 2 master đã ghi xong, một lần mất quyền ghi không được phép biến lần
 * chạy đã thành công thành thất bại. Xem docs/decisions.md #copyright-autoappend-01
 *
 * @param {Array<{publisher: *, label: *}>} pairs - collectMissingPublisherRules()
 * @returns {{added: Array<object>, error: string|null}}
 */
function appendMissingPublisherRules(pairs) {
  if (!pairs || pairs.length === 0) return { added: [], error: null };
  try {
    var cfg = CONFIG.OUTPUTS.PUBLISHER_COPYRIGHT;
    var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName,
      PUBLISHER_COPYRIGHT_REQUIRED_HEADERS);
    var width = resolved.columnCount;
    var values = pairs.map(function (pair) {
      return buildPublisherRuleRow(pair, resolved.headerIndex, width);
    });
    // getLastRow() chứ không phải số dòng đã parse: dưới vùng dữ liệu có thể còn ghi chú.
    var startRow = Math.max(resolved.sheet.getLastRow(), resolved.headerRowIndex + 1) + 1;
    resolved.sheet.getRange(startRow, 1, values.length, width).setValues(values);
    Logger.log('出版社別コピーライトマスタ: đã ghi bổ sung ' + values.length + ' dòng rule trống');
    return { added: pairs, error: null };
  } catch (failure) {
    Logger.log('Ghi bổ sung rule vào ④ thất bại (bỏ qua): ' + String(failure));
    return { added: [], error: String(failure) };
  }
}
```

Trong `runGas1()`, **sau** `appendChengeDetailRows(...)` và **trước** `var warningRows = buildAllWarnings({`:

```js
    // Sau khi 2 master đã ghi xong: bổ sung rule còn thiếu để lần chạy sau người ta có chỗ
    // điền テンプレート. Không được đặt trước bước ghi — lỗi ở đây không được kéo theo gì.
    var ruleAppended = appendMissingPublisherRules(
      collectMissingPublisherRules(copyrightWarnings, loaded.values.publisherCopyright));
    if (ruleAppended.added.length > 0) {
      notifySlack('GAS❶: đã thêm ' + ruleAppended.added.length
        + ' dòng (出版社/レーベル) chưa có rule vào 出版社別コピーライトマスタ.'
        + ' Cần điền テンプレート:\n'
        + ruleAppended.added.map(function (pair) {
          return String(pair.publisher)
            + (normalizeJapaneseText(pair.label) === '' ? '' : ' / ' + String(pair.label));
        }).join('\n'));
    }
```

Và thêm vào object truyền cho `buildAllWarnings({ ... })`:

```js
      ruleAppended: ruleAppended,
```

- [ ] **Step 9: Kiểm refs**

Run: `node tools/verify-refs/run.js`
Expected: exit 0. (Đây là bước bắt lỗi gõ sai tên `collectMissingPublisherRules` / `buildPublisherRuleRow` / `PUBLISHER_COPYRIGHT_REQUIRED_HEADERS` trong `9_main.js` — file này **không** nằm trong suite test.)

- [ ] **Step 10: Chạy lại suite**

Run: `node tools/verify-phase1/run.js`
Expected: PASS.

- [ ] **Step 11: Viết 2 anchor `copyright-lookup-02` + `copyright-autoappend-01`**

Append vào cuối `docs/decisions.md`:

```markdown
## copyright-lookup-02 — chỉ 2 case tra rule, và vì sao không tra ngược theo レーベル

ガワ ghi ở khối ghi chú của cột `出版社コピーライト`:
`引用方法 1. 出版社 2. レーベル から生成ルールを確認` — đúng 2 trục, `出版社` là trục chính.

| # | Điều kiện |
|---|---|
| 1 | Tác phẩm có cả `出版社` và `レーベル名` → khớp rule có **cùng cả 2** (chắc ăn nhất) |
| 2 | Tác phẩm không có `レーベル名` → khớp đúng dòng rule có `出版社` khớp **và** `雑誌名/レーベル = ""` |

Đây đúng là hành vi code vẫn làm từ đầu; ghi lại vì đã có một bản thiết kế đề xuất **thêm
tầng 3 tra ngược** (`rule.雑誌名/レーベル = CMS.出版社`) và **bị bác** (user chốt 2026-09-08).

Lý do bác: **cùng một `レーベル` xuất hiện dưới nhiều `出版社` khác nhau**, nên tra theo
`レーベル` đơn lẻ là đoán — đoán sai thì in tên NXB của người khác vào dòng bản quyền. Đo trên
nguồn thật, 6 `レーベル` bị dùng chung: `ライブコミックス` (`オトナ恋` + `ズレット！`),
`オトメチカ出版` và `ロマンチカ出版` (`CLLENN` + `コミックストック`), `アイプロダクション`
(`ビーグリー` + `小学館クリエイティブ`), `リバース`, `PEANUTOON`.

Hệ quả đo được: **970 tác phẩm** trượt cả 2 case (gồm 78 của `クロスフォリオ出版`, nơi ô
`雑誌名/レーベル` của rule ghi `旧：ブリック出版` — một **ghi chú**, không phải tên レーベル nào CMS
dùng). Chúng **không** được chữa bằng code mà bằng `copyright-autoappend-01`: ghi cặp thiếu
xuống master, báo 営業, để rule được sửa **tận gốc** thay vì code đoán mãi.

## copyright-autoappend-01 — GAS ghi vào sheet 手動入力, và giới hạn tới đâu

ガワ yêu cầu ở khối `▼追加要望` của `コピーライトマスタ`: NXB/レーベル không có trong
`出版社別コピーライトマスタ` thì ghi bổ sung xuống cuối sheet + thông báo 営業. Đây là **lần
đầu GAS ghi vào một sheet 100% `手動入力`** của 池永, nên giới hạn phải rõ:

- **Chỉ APPEND dòng mới dưới cùng.** Không sửa, không xoá dòng người nhập, không đụng ô nào
  đang có chữ.
- **Chỉ 2 ô**: `出版社` và `雑誌名/レーベル` (tra theo tên header). Mọi ô khác để trống.
- **Để trống `自動化フラグ` là có chủ ý.** Lần chạy sau, rule *tồn tại* nhưng rơi vào nhánh
  `個別ルール` → cột bản quyền vẫn trống + vẫn cảnh báo. Placeholder không bao giờ tự sinh ra
  một bản quyền sai; nó chỉ là một dòng chờ người điền テンプレート.
- **Chỉ ca `ルール無し` thật.** `個別ルール` / `テンプレート不備` / `ルール未記入` thì rule đã có,
  thêm nữa chỉ làm bảng rule bẩn hơn.
- **Chống trùng 2 lớp**: với toàn bộ bảng rule hiện có (kể cả dòng GAS thêm hôm trước) và
  trong cùng lần chạy. Chạy 100 lần không sinh dòng trùng.
- **Lỗi bị nuốt** + 1 dòng `ルール自動追記` trong `GAS1警告`. Hàm chạy SAU khi 2 master đã ghi
  xong: một lần mất quyền ghi không được biến lần chạy đã thành công thành thất bại.
- **Dòng đã ghi mà chưa ai điền thì phải ALERT** (user chốt 2026-09-08): rule tồn tại nhưng
  `自動化フラグ` **và** `テンプレート` đều trống = đúng hình dạng placeholder GAS ghi ra → lý do
  riêng `ルール未記入`, tuyệt đối không lẫn với `02：個別ルール` (cái đó là **cố ý** viết tay,
  không phải việc còn nợ). Nhập nhằng 2 thứ này là lý do 池永 không biết dòng nào cần mình xử lý.

`CONFIG.OUTPUTS.PUBLISHER_COPYRIGHT` trỏ cùng spreadsheet/sheet với
`CONFIG.SOURCES.PUBLISHER_COPYRIGHT`. Khai báo trùng là cố ý: "GAS có quyền ghi vào đây"
phải đọc thấy được ở `OUTPUTS`, không phải suy ra từ một lệnh `setValues` nằm trong nhánh
`SOURCES`.
```

- [ ] **Step 12: Cập nhật `3-master-cot-nguon-va-logic.md`**

- §2.2, dòng `出版社コピーライト`: `⚠️ tra cứu 2 tầng ✅ …; phần **tự ghi bổ sung rule thiếu + alert** đã có spec, **chưa code**` → `✅`
- §4.9 Bước 3: bảng lý do thành **5 dòng**, thêm `| ルール未記入 | rule tồn tại nhưng 自動化フラグ và テンプレート đều trống = dòng GAS tự thêm mà chưa ai điền | 池永 điền テンプレート |`, và đổi tiêu đề `**Bước 3 — 4 lý do**` → `**Bước 3 — 5 lý do**`
- §4.9: thêm mục **Bước 4** sau bảng lý do:
  `**Bước 4 — ルール無し thì ghi bổ sung.** Cặp (出版社, レーベル) trượt cả 3 tầng được append xuống cuối sheet ④ với 2 ô 出版社/レーベル, mọi ô khác trống → lần sau ra 個別ルール, vẫn không tự sinh ©. Chống trùng với cả bảng rule hiện có. Lỗi ghi bị nuốt + 1 dòng cảnh báo. Xem docs/decisions.md #copyright-autoappend-01`
- §6: `**13** loại cảnh báo GAS❶` → `**14** loại cảnh báo GAS❶`, thêm `· ルール自動追記` vào cuối danh sách; dòng bảng `1 cảnh báo (13 loại)` → `(14 loại)`

- [ ] **Step 13: Commit**

```bash
git add gas_phase_1/0_config.js gas_phase_1/5_copyright_master.js gas_phase_1/7_warnings.js gas_phase_1/9_main.js tools/verify-phase1/tests.js docs/decisions.md docs/3-master-cot-nguon-va-logic.md
git commit -m "$(cat <<'EOF'
Append the missing 出版社/レーベル rows the © rules never had

When a work finds no rule under either lookup case, GAS now writes that
(出版社, レーベル) pair to the bottom of 出版社別コピーライトマスタ and tells 営業 on
Slack, which is what the ガワ asked for in its ▼追加要望 note. On the fixture that
is 970 works collapsing into 83 rows to fill - including クロスフォリオ出版, whose
only rule keeps a note in the 雑誌名/レーベル cell and so was never reachable.

The lookup itself is untouched: 1. 出版社 + レーベル, 2. 出版社 with a blank
レーベル, exactly as the ガワ spells it out. Matching backwards through レーベル was
considered and dropped - the same レーベル sits under different 出版社 six times
over, so it would print one publisher's name into another's copyright line.

A row GAS added and nobody filled now reports ルール未記入 rather than 個別ルール:
02：個別ルール means someone chose to write it by hand, this means the work is
still owed, and blurring the two is why nobody could tell which rows needed them.

This is the first time GAS writes into a sheet that is 100% 手動入力, so the
limits are narrow: append below the last row only, fill exactly two cells, never
touch a row someone typed. 自動化フラグ is deliberately left blank - next run the
rule exists but lands on 個別ルール, so the placeholder still cannot invent a
copyright line. Dedupe runs against the whole existing table and within the run,
and a write failure is swallowed into a warning because both masters are already
written by then.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `タイトルマスタ` › `素材共有日` — copy + fallback

**Files:**
- Modify: `gas_phase_2/3_sources.js:42-73` (`parseCustomerMasterRows` đọc thêm field bằng `tryCol`)
- Modify: `gas_phase_2/4_title_master.js:69-86` (nhánh `stamp` của `titleRecordToRow`)
- Modify: `docs/3-master-cot-nguon-va-logic.md` (§3.3 + §4.12)
- Test: `tools/verify-phase2/tests.js`

**Interfaces:**
- Consumes: field `materialSharedAt` do Task 1 ghi lên `顧客作品マスタ`; `tryCol(headerIndex, name)` → `number|undefined`; `normalizeJapaneseText(value)`.
- Produces: không có API mới — chỉ đổi hành vi `titleRecordToRow()`.

- [ ] **Step 1: Viết test đỏ**

Thêm vào `tools/verify-phase2/tests.js`:

```js
function test_materialSharedAtCopy(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var headerRow = [''].concat(src.requiredHeaders(src.TITLE_COLUMNS));
  var headerIndex = src.buildHeaderIndex(headerRow);
  var width = headerRow.length;
  function at(row, header) { return row[src.col(headerIndex, header)]; }
  function blankRow() { return new Array(width).fill(''); }

  var runAt = new Date(2026, 8, 8);
  var fromCustomer = new Date(2026, 5, 1);
  var already = new Date(2026, 0, 5);

  function build(record, previousRow) {
    return src.titleRecordToRow({
      record: record, copyright: null, copyrightAvailable: false,
      preConfirmationAvailable: false, headerIndex: headerIndex,
      columnCount: width, runAt: runAt, previousRow: previousRow,
    });
  }

  var added = build({ titleNo: 1, materialSharedAt: fromCustomer }, undefined);
  check('dong moi + nguon co ngay -> copy ngay cua 顧客作品マスタ',
    at(added, '素材共有日'), fromCustomer);

  var addedNoSource = build({ titleNo: 1, materialSharedAt: '' }, undefined);
  check('dong moi + nguon trong -> fallback dong dau ngay chay',
    at(addedNoSource, '素材共有日'), runAt);

  var prev = blankRow();
  prev[src.col(headerIndex, '素材共有日')] = already;
  var kept = build({ titleNo: 1, materialSharedAt: fromCustomer }, prev);
  check('o dich DA co ngay -> khong dung tay vao, ke ca khi nguon khac',
    at(kept, '素材共有日'), already);

  var blankTarget = build({ titleNo: 1, materialSharedAt: fromCustomer }, blankRow());
  check('o dich trong + nguon co ngay -> copy', at(blankTarget, '素材共有日'), fromCustomer);

  var blankBoth = build({ titleNo: 1, materialSharedAt: '' }, blankRow());
  check('o dich trong + nguon trong -> fallback ngay chay', at(blankBoth, '素材共有日'), runAt);
}

function test_customerSourceOptionalMaterialShared(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  check('素材共有日 KHONG nam trong danh sach cot bat buoc',
    src.CUSTOMER_SOURCE_HEADERS.indexOf('素材共有日'), -1);

  var headerRow = [''].concat(src.CUSTOMER_SOURCE_HEADERS);
  var withColumn = [headerRow.concat(['素材共有日']), null];
  var shared = new Date(2026, 5, 1);
  var row = new Array(headerRow.length).fill('');
  row[headerRow.indexOf('タイトル名')] = 'A';
  row[headerRow.indexOf('タイトルNo')] = 7;
  withColumn[1] = row.concat([shared]);
  check('co cot -> doc duoc ngay',
    src.parseCustomerMasterRows(withColumn)[0].materialSharedAt, shared);

  var withoutColumn = [headerRow, row];
  check('THIEU cot -> khong throw, tra ve rong',
    src.parseCustomerMasterRows(withoutColumn)[0].materialSharedAt, '');
}
```

Thêm cả 2 tên vào mảng `unit` của `module.exports` trong `tools/verify-phase2/tests.js`.

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `node tools/verify-phase2/run.js`
Expected: FAIL ở `dong moi + nguon co ngay -> copy ngay cua 顧客作品マスタ` (hiện luôn ra `runAt`) và ở `o dich DA co ngay` / `co cot -> doc duoc ngay` (hiện `materialSharedAt` là `undefined`).

- [ ] **Step 3: Đọc `素材共有日` từ nguồn, dạng tuỳ chọn**

Trong `gas_phase_2/3_sources.js`, trong `parseCustomerMasterRows()`, thêm ngay dưới `var idx = resolved.headerIndex;`:

```js
  // tryCol chứ KHÔNG thêm vào CUSTOMER_SOURCE_HEADERS: danh sách đó là cột BẮT BUỘC, thiếu
  // 1 tên là findHeaderRowIndex() throw và sập cả lần chạy GAS❷. Cột mới phải degrade về
  // nhánh fallback (tự đóng dấu), không được thành ngòi nổ.
  var colMaterialSharedAt = tryCol(idx, '素材共有日');
```

Và thêm vào object `records.push({...})`:

```js
      materialSharedAt: colMaterialSharedAt === undefined ? '' : row[colMaterialSharedAt],
```

- [ ] **Step 4: Đổi nhánh `stamp` thành copy + fallback**

Trong `gas_phase_2/4_title_master.js`, thay khối `if (column.from === 'stamp') {...}` trong `titleRecordToRow()` bằng:

```js
    if (column.from === 'stamp') {
      // 顧客作品マスタ là nguồn duy nhất; GAS❷ chỉ tự đóng dấu khi nguồn trống (dòng có
      // trước khi cột được thêm) — giữ đúng hành vi cũ làm fallback. Và luôn write-once:
      // ô đích đã có ngày thì không bao giờ đụng, nên không dòng nào mất ngày đang có.
      // Xem docs/decisions.md #material-shared-02
      var stampIndex = col(options.headerIndex, column.header);
      if (normalizeJapaneseText(row[stampIndex]) !== '') return;
      var fromCustomer = blankIfEmpty(options.record[column.field]);
      row[stampIndex] = normalizeJapaneseText(fromCustomer) === '' ? options.runAt : fromCustomer;
      return;
    }
```

- [ ] **Step 5: Chạy test, xác nhận XANH**

Run: `node tools/verify-phase2/run.js`
Expected: PASS. Nếu `test_titleRecordToRow` cũ đỏ ở check về `素材共有日`, cập nhật kỳ vọng theo bảng ở spec §6 — dòng mới mà nguồn trống thì **vẫn** ra `runAt` (hành vi cũ được giữ), nên chỉ những check truyền `materialSharedAt` mới đổi kết quả.

- [ ] **Step 6: Kiểm refs**

Run: `node tools/verify-refs/run.js`
Expected: exit 0.

- [ ] **Step 7: Cập nhật `3-master-cot-nguon-va-logic.md`**

- §3.3, dòng `素材共有日`: cả ô "Nguồn" và ô trạng thái → `顧客作品マスタ › 素材共有日` / `✅` (bỏ phần `⚠️ … spec mới đổi thành copy … chưa code`), ô "Điều kiện lấy" đổi thành: `Copy từ 顧客作品マスタ, write-once (ô đã có ngày thì không đụng). Nguồn trống → GAS❷ tự đóng dấu ngày chạy (fallback)`
- §4.12: xoá blockquote `⚠️ **Chưa code:**`, thay bằng: `Cài 2026-09-08: 顧客作品マスタ là nguồn duy nhất, タイトルマスタ copy + fallback đóng dấu khi nguồn trống.`

- [ ] **Step 8: Commit**

```bash
git add gas_phase_2/3_sources.js gas_phase_2/4_title_master.js tools/verify-phase2/tests.js docs/3-master-cot-nguon-va-logic.md
git commit -m "$(cat <<'EOF'
Copy 素材共有日 from 顧客作品マスタ instead of stamping it twice

The column now exists on both masters, and 顧客作品マスタ owns it. GAS❷ copies the
date across and only stamps its own when the source cell is blank, which is the
case for every row that predates the column - so the old behaviour survives as a
fallback rather than as the rule.

Still write-once on the destination: a タイトルマスタ row that already carries a
date is never touched, whatever the source says. The source is read with tryCol
and stays out of CUSTOMER_SOURCE_HEADERS on purpose - that list is the required
set, and a missing column there throws before GAS❷ writes anything.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Test hồi quy — nhất quán danh tính khi `タイトル名` đổi

**Files:**
- Test: `tools/verify-phase1/tests.js`
- Test: `tools/verify-phase2/tests.js`

**Interfaces:**
- Consumes: `buildMasterMatchIndex()`, `claimMatch()`, `resolveNumbersFromMatches()`, `diffUpsertFromMatches()`, `recordsEqual()`, `CUSTOMER_COLUMNS`, `COPYRIGHT_COLUMNS`, `TITLE_COLUMNS`.
- Produces: không có code sản phẩm. Task này **khoá chặt hành vi đang đúng** để lần sau ai đổi write mode của `タイトル名`/`タイトルID` là test đỏ ngay.

- [ ] **Step 1: Viết test cho GAS❶**

Thêm vào `tools/verify-phase1/tests.js`:

```js
function test_identityRefresh(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  // Dieu kien can: 2 cot dinh danh phai la 上書 -> chung tham gia recordsEqual.
  ['タイトルID', 'タイトル名'].forEach(function (header) {
    var column = src.CUSTOMER_COLUMNS.filter(function (c) { return c.header === header; })[0];
    check(header + ' phai la 上書 (neu 条件 thi danh tinh dong bang)', column.write, '上書');
    check(header + ' khong duoc skipCompare', column.skipCompare === true, false);
  });

  // Ca 1: doi TEN, ID so giu nguyen -> khop tang 2, giu タイトルNo, ghi ten moi.
  var existing = [{ titleNo: 7, titleId: '111', titleName: 'Ten cu', sheetRow: 16 }];
  var index = src.buildMasterMatchIndex(existing);
  var incoming = { titleId: '111', titleName: 'Ten moi' };
  var match = src.claimMatch(index, incoming);
  check('doi ten + ID so giu nguyen -> khop tang 2', match.tier, 2);

  var matches = src.resolveNumbersFromMatches(
    [{ record: incoming, existing: match.existing, rowOffset: match.rowOffset }], existing, 'titleNo');
  check('dung lai タイトルNo cu', matches[0].record.titleNo, 7);
  var diff = src.diffUpsertFromMatches(matches, src.CUSTOMER_COLUMNS);
  check('ten doi -> dong vao toUpdate, KHONG phai toAdd',
    [diff.toUpdate.length, diff.toAdd.length], [1, 0]);
  check('gia tri ghi ra la ten MOI', diff.toUpdate[0].record.titleName, 'Ten moi');

  // Ca 2: ID tu chu -> so, ten giu nguyen -> khop tang 3, khong sinh dong trung.
  var existing2 = [{ titleNo: 9, titleId: 'ー', titleName: 'Giu ten', sheetRow: 20 }];
  var index2 = src.buildMasterMatchIndex(existing2);
  var match2 = src.claimMatch(index2, { titleId: '222', titleName: 'Giu ten' });
  check('ID tu chu thanh so -> khop tang 3', match2.tier, 3);
  var matches2 = src.resolveNumbersFromMatches(
    [{ record: { titleId: '222', titleName: 'Giu ten' }, existing: match2.existing, rowOffset: match2.rowOffset }],
    existing2, 'titleNo');
  var diff2 = src.diffUpsertFromMatches(matches2, src.CUSTOMER_COLUMNS);
  check('ID moi -> update dong cu, khong them dong',
    [diff2.toUpdate.length, diff2.toAdd.length], [1, 0]);
  check('gia tri ghi ra la ID MOI', diff2.toUpdate[0].record.titleId, '222');

  // Ca 3: コピーライトマスタ khoa theo タイトルNo nen ten moi cung lan sang.
  var priorCopyright = [{ titleNo: 7, titleId: '111', titleName: 'Ten cu', sheetRow: 16 }];
  var nextCopyright = [{ titleNo: 7, titleId: '111', titleName: 'Ten moi' }];
  var copyrightDiff = src.diffUpsert(priorCopyright, nextCopyright,
    function (r) { return String(r.titleNo); },
    function (a, b) { return src.recordsEqual(a, b, src.COPYRIGHT_COLUMNS); });
  check('コピーライトマスタ nhan ten moi qua khoa タイトルNo',
    [copyrightDiff.toUpdate.length, copyrightDiff.toUpdate[0].record.titleName], [1, 'Ten moi']);
}
```

Thêm `test_identityRefresh` vào mảng `unit`.

- [ ] **Step 2: Chạy, xác nhận XANH ngay (đây là test khoá hành vi đang đúng)**

Run: `node tools/verify-phase1/run.js`
Expected: PASS. Nếu ĐỎ thì **dừng lại** — nghĩa là một task trước đã làm hỏng đường cập nhật danh tính, không phải test sai.

- [ ] **Step 3: Viết test cho GAS❷**

Thêm vào `tools/verify-phase2/tests.js`:

```js
function test_identityRefreshTitleMaster(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  ['タイトルID', 'タイトル名'].forEach(function (header) {
    var column = src.TITLE_COLUMNS.filter(function (c) { return c.header === header; })[0];
    check('タイトルマスタ.' + header + ' phai la 上書', column.write, '上書');
  });

  var headerRow = [''].concat(src.requiredHeaders(src.TITLE_COLUMNS));
  var headerIndex = src.buildHeaderIndex(headerRow);
  var width = headerRow.length;
  function at(row, header) { return row[src.col(headerIndex, header)]; }

  var prev = new Array(width).fill('');
  prev[src.col(headerIndex, 'タイトルNo')] = 7;
  prev[src.col(headerIndex, 'タイトル名')] = 'Ten cu';
  prev[src.col(headerIndex, 'タイトルID')] = '111';

  var row = src.titleRecordToRow({
    record: { titleNo: 7, titleName: 'Ten moi', titleId: '222' },
    copyright: null, copyrightAvailable: false, preConfirmationAvailable: false,
    headerIndex: headerIndex, columnCount: width, runAt: new Date(2026, 8, 8), previousRow: prev,
  });
  check('ten/ID doi ben 顧客作品マスタ -> タイトルマスタ ghi gia tri moi',
    [at(row, 'タイトル名'), at(row, 'タイトルID')], ['Ten moi', '222']);

  var changed = src.collectChangedColumns(prev, row, headerIndex, new Date(2026, 8, 8),
    { titleNo: 7, titleName: 'Ten moi' });
  check('2 cot dinh danh duoc ghi vao GAS2変更詳細',
    changed.filter(function (c) {
      return c.field === 'タイトル名' || c.field === 'タイトルID'; }).length, 2);
}
```

Thêm `test_identityRefreshTitleMaster` vào mảng `unit`.

- [ ] **Step 4: Chạy, xác nhận XANH**

Run: `node tools/verify-phase2/run.js`
Expected: PASS.

- [ ] **Step 5: Chạy toàn bộ suite lần cuối**

```bash
node tools/verify-phase1/run.js && node tools/verify-phase2/run.js && node tools/verify-refs/run.js
```
Expected: cả 3 exit 0.

- [ ] **Step 6: Commit**

```bash
git add tools/verify-phase1/tests.js tools/verify-phase2/tests.js
git commit -m "$(cat <<'EOF'
Pin the identity refresh that the cascade quietly depends on

タイトルID and タイトル名 already follow CMS on every run, but only because both
are write:'上書' and therefore take part in recordsEqual. Nothing said so out
loud, so switching either to 条件 would freeze a work's identity at whatever it
was the day it first appeared - silently, with the cascade still matching on tier
2 or 3 forever.

These tests fail the moment that happens, across all three masters: rename with a
stable numeric ID (tier 2), an ID going from 「ー」 to a real number (tier 3), and
the new value propagating to コピーライトマスタ and タイトルマスタ through タイトルNo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Ghi chú vận hành sau khi cả 5 task xanh

1. **Chạy tay `probe_readCustomerMasterHeader()`** trong Apps Script editor của GAS❶ trước lần chạy trigger đầu tiên: 2 cột mới là **bắt buộc** với `顧客作品マスタ` (`requiredHeaders`), thiếu tên là throw. Đây là cách phát hiện trước khi 9h sáng thay vì sau.
2. **Lần chạy đầu sẽ ghi bổ sung khoảng 83 dòng** vào sheet ④ — đo trên fixture thật: **970 tác phẩm** trượt cả 2 case tra cứu, gom lại thành **83 cặp `(出版社, レーベル)`** riêng biệt. Nhiều nhất: `ソルマーレ編集部` (218 tác phẩm, chưa có rule nào), `ブリック出版` (77), `セ・キララ文庫` (76), `シーモアコミックス(トレモア)` + 3 レーベル (103), `クロスフォリオ出版` (31), `DEEPER-ZERO` + 2 レーベル (73). Sau lượt đó thì im, và mỗi dòng chưa ai điền sẽ ra `ルール未記入` mỗi lần chạy cho tới khi có テンプレート — **đó là alert có chủ ý**, không phải nhiễu.
3. **`素材共有日` của dòng cũ vẫn trống** ở cả 2 master. Đúng thiết kế; muốn lấp phải điền tay.
4. **`docs/master-columns.tsv`**: chủ file (長) tự đổi `status` từ `要対応` → `OK` cho 4 dòng tương ứng. Plan không sửa file này.

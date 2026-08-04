# GAS❶ — Lọc レギュレーション + khoá upsert 3 tầng + ガワ mới: Implementation Plan

> **ĐÃ TRIỂN KHAI XONG (2026-08-04).** Plan này giữ lại làm **hồ sơ thiết kế**: nó ghi *tại sao* mỗi quyết định được chọn và những phương án đã bị loại — thông tin không có trong code.
>
> **Hai chỗ plan khác thực tế đã ship:**
> 1. **Cấu trúc file đã gom lại: 19 file → 7 file** chia theo vấn đề (`config` / `common` / `sources` / `master` / `copyright` / `io` / `main`). Mọi đường dẫn kiểu `src/logic/*.js`, `src/sources/*.js`, `src/io/*.js` trong plan này **không còn tồn tại** — xem bảng tra ở [docs/gas1-van-hanh.md](../../gas1-van-hanh.md) mục 4 để biết hàm nào ở file nào. Test cũng gộp: 13 file → `tools/verify/run.js` + `tools/verify/tests.js` + `exportFixtures.py`.
> 2. **Task 13 (cột `掲載停止日付`) đã làm luôn, không tách sau Task 12** như plan viết, và khoá join là `タイトルID` + quy tắc **ghi một lần** (user chốt lại giữa lúc viết plan).
>
> Kết quả kiểm chứng: **124 test pass** (`node tools/verify/run.js --data`), trong đó có đối chiếu lại số liệu spec §12 trên dữ liệu thật và mô phỏng 4 lần chạy liên tiếp.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đổi GAS❶ sang: (a) `作品レギュレーション判定` trở thành **bộ lọc** quyết định tác phẩm nào được vào `顧客作品マスタ` + cấp 3 cột ①②③, (b) join CMS ↔ レギュレーション theo `タイトル名` 完全一致, (c) khoá upsert `顧客作品マスタ` đổi sang **cascade 3 tầng** (bỏ CMSID khỏi mọi logic), (d) đọc/ghi được **ガワ mới** (header hàng 15, cột B→U, thứ tự cột đã đổi hoàn toàn), (e) 4 loại cảnh báo + 2 số đếm mới vào log.

**Architecture:** Toàn bộ nghiệp vụ mới nằm ở tầng **pure** (`src/sources/*`, `src/logic/*`) — không đụng `SpreadsheetApp`. Hai hàm pure mới gánh phần khó: `filterAndMatchWorks()` (`logic/regulationFilter.js`) làm **một lượt duy nhất** vừa lọc vừa gán dòng master (2 phase: tác phẩm hợp lệ chiếm dòng trước, tác phẩm NG/未判定 chỉ giữ dòng còn trống — rule 2), và `matchExistingRow()` (`logic/upsert.js`) thực hiện cascade 3 tầng + ràng buộc chiếm-một-lần. `src/io/sheetIO.js` chuyển sang **hoàn toàn theo tên header** (tự dò hàng header) và **giữ nguyên các cột GAS không sở hữu** bằng cách ghi đè lên bản copy của dòng cũ. `src/main.js` vẫn chỉ là nhạc trưởng. Vì tầng pure không phụ thuộc Apps Script, plan này dựng thêm **harness chạy bằng Node** (`tools/verify/`, không cần npm install) để mỗi task được TDD thật và để đối chiếu lại đúng các con số trong spec §12.

**Tech Stack:** Google Apps Script (V8 runtime, ES6 `Map`/`Set` dùng được, không có module system — mọi file share 1 global scope qua `clasp push`), Node 24 (chỉ dùng cho harness kiểm chứng, `vm` + `fs` của core, **không** dependency), Python 3.10 + openpyxl (chỉ để export fixtures từ `example/*.xlsx`).

**Spec:** [docs/superpowers/specs/2026-08-03-regulation-title-name-key-design.md](../specs/2026-08-03-regulation-title-name-key-design.md) — mọi mục `§N` dưới đây trỏ tới spec này.

## Global Constraints

- **KHÔNG được sửa bất cứ gì trên sheet nguồn** (CLAUDE.md của repo): chỉ đọc `作品レギュレーション判定`, `先行タイトル情報(CMS)`, `出版社からの追記ルール...`. Chỉ được ghi vào 2 sheet output + các tab log của chính GAS❶.
- **Chuẩn hoá CHỈ để so khớp, không bao giờ để ghi** (§4.4). Giá trị ghi ra sheet luôn là giá trị **gốc** từ đúng nguồn sở hữu cột đó. `normalizeJapaneseText()` không được xuất hiện ở bất kỳ đường ghi nào.
- **KHÔNG có nhánh xoá dòng nào** trong GAS❶ (§3.4, `削除等はしない`). Chỉ update + append.
- Không có Jest/mocha. Test = harness Node thuần trong `tools/verify/` → chạy `node tools/verify/run.js`. Với file `io/*` và `main.js` (dùng `SpreadsheetApp`) thì kiểm chứng bằng `clasp push` + hàm `probe_*` chạy tay trong Apps Script editor, đúng pattern đang có trong `src/main.js`.
- `src/**` là code được `clasp push`; `tools/**`, `docs/**`, `example/**` đã bị `.claspignore` loại — **không** được để code test lọt vào `src/`.
- Mọi file trong `src/` share 1 global scope: hàm định nghĩa ở `logic/upsert.js` gọi trực tiếp được từ `logic/regulationFilter.js`, không `require`/`import`.
- `src/config.js` ở working copy đang trỏ **DEMO spreadsheet ID** (có comment `//DEMO`) và đang comment out 5 sheet NXB. **Giữ nguyên** — đó là cấu hình test có chủ đích của user; task 10 chỉ đổi đúng `TRIGGER_HOURS`.
- Commit sau mỗi task.

## ガワ mới của 顧客作品マスタ (đã xác minh lại trên file, 2026-08-03)

File `example/【池永社内】顧客作品マスタ0803.xlsx` (user vừa cập nhật) và sheet `顧客作品マスタ` trong `example/【ソル】タイトルマスタ　ガワ作成 0803 .xlsx` giờ **giống nhau**. Đây là layout thật phải code theo — **khác hẳn bảng §7 của spec** (spec viết theo bản ガワ cũ B→Q, có `コピーライト`, chưa có `タイトル区分`/`LP制作`):

Header ở **hàng 15** (1-based), dữ liệu từ **hàng 16**, cột **A là cột đệm trống**:

| Cột | idx (0-based) | Header | Hàng 13 ghi `自動入力/GAS`? | Plan này ghi? |
|---|---|---|---|---|
| A | 0 | *(trống)* | — | Không (đệm) |
| B | 1 | `タイトルNo` | ✅ | ✅ GAS cấp |
| C | 2 | `CMS ID` | ✅ | ✅ (chỉ ghi, không dùng logic) |
| D | 3 | `タイトルID` | ✅ | ✅ |
| E | 4 | `タイトル区分` | ✅ | ❌ **giữ nguyên** — nguồn `出稿コミット管理表` (安蒜社内) chưa có file |
| F | 5 | `①広告出稿ポリシー` | ✅ | ✅ **mới** |
| G | 6 | `②一般面出稿NG` | ✅ | ✅ **mới** |
| H | 7 | `③シーモアロゴ判定` | ✅ | ✅ |
| I | 8 | `掲載停止日付` | ✅ | ✅ **Task 13** — nguồn `multi_title_yyyyMMdd.tsv` trên Drive, join theo **`タイトルID`** (user cung cấp 2026-08-03, ghi đè §10d) |
| J | 9 | `LP制作` | ❌ | ❌ **giữ nguyên** |
| K | 10 | `タイトル名` | ✅ | ✅ |
| L | 11 | `作家名` | ✅ | ✅ |
| M | 12 | `ジャンル` | ✅ | ✅ |
| N | 13 | `出版社` | ✅ | ✅ |
| O | 14 | `レーベル名` | ✅ | ✅ **mới** (code đã parse sẵn `label`) |
| P | 15 | `先行開始日` | ✅ | ✅ |
| Q | 16 | `先行終了日` | ✅ | ✅ |
| R | 17 | `先行終了日（延長）` | ❌ | ❌ **giữ nguyên** |
| S | 18 | `先行終了日（最終確定）` | ❌ | ❌ **giữ nguyên** |
| T | 19 | `大量無料開始日` | ✅ | ❌ **giữ nguyên** — chưa có nguồn |
| U | 20 | `大量無料終了日` | ✅ | ❌ **giữ nguyên** — chưa có nguồn |

Hai điều quan trọng rút ra:

1. **Thứ tự cột đổi hoàn toàn nhưng code không cần biết** — `sheetIO` tra cột theo TÊN header (`col(idx, 'タイトル名')`), nên việc `タイトル名` nhảy từ E sang K không tốn 1 dòng code nào. Chỉ 3 thứ thật sự phải sửa: hàng header (1 → tự dò), danh sách header bắt buộc, và cách bảo toàn cột không sở hữu.
2. **7 cột GAS không ghi** (A, E, I, J, R, S, T, U). Cách ghi hiện tại (`new Array(columnCount).fill('')` rồi setValues cả dòng) sẽ **xoá trắng** những cột này mỗi lần update dòng — đây là bug thật sẽ xảy ra ngay lần chạy thứ 2 với dữ liệu người ta điền tay. Task 7 sửa bằng cách dựng dòng ghi **từ bản copy của dòng cũ**, chỉ ghi đè các cột GAS sở hữu.

## Ngoài phạm vi plan này (nêu rõ để không bị hiểu là bỏ sót)

Ngoài các mục spec đã tự loại (§2), ガワ mới thêm 3 thứ **chưa có trong spec** và plan này **không làm**:

- **`タイトル区分` (cột E)** — quy tắc trên sheet: `┗コミットフラグ：2.先行配信（出稿コミット）` / `┗独占フラグ：先行タイトル一覧からコミットフラグが入ってないもの全て`. Cần file `【安蒜社内】出稿コミット管理表（新作・既存・キャン強化）` — **chưa có file, chưa có ID**. Cần spec riêng.
- **`LP制作` (cột J)** — quy tắc `ジャンル＋ロゴ有無で管理`: `ロゴなし作品→K列が「ロゴなし」`, `TL→P列が「TL」`, `BL→P列が「BL」`. `K列` khớp với `③シーモアロゴ判定` của sheet レギュレーション, nhưng `P列` **không khớp cột nào** mang giá trị TL/BL ở cả 2 nguồn (レギュレーション có TL/BL ở cột `G ジャンル`). Ô này lại **không** có dấu `自動入力/GAS` ở hàng 13 → hiểu là cột người điền. Cần user xác nhận.
- **`先行終了日（延長）` / `（最終確定）` (R/S)** — nguồn `【先行作品】独占期間の延長（代理店共有）`, cũng không có dấu `自動入力/GAS`. Không làm.
- **ガワ mới của `コピーライトマスタ`** — sheet `コピーライトマスタ` trong workbook `【ソル】タイトルマスタ ガワ作成` đã đổi rất nặng: header hàng 15, cột B→P, tách `正規コピーライト` thành **2 cột** (`タイトル個別コピーライト(あれば優先使用)` = CMS U列, `出版社コピーライト` = GAS sinh), thêm `CMS ID`/`タイトルID`/`ジャンル`/`レーベル名`, và **lịch sử giảm 10 → 5 slot** (`コピーライト_過去分1..5`, ghi chú: `旧コピーライトは5つまで保存(6つ以前はマスタから削除)`), cộng thêm nguồn mới `出版社別コピーライトマスタ` thay cho `基本のC表記`. Đây là **một spec riêng**, không nhồi vào plan này. Plan này giữ `コピーライトマスタ` **đúng như hiện tại** (spreadsheet live vẫn layout cũ) và chỉ đảm bảo nó tiếp tục chạy sau khi khoá upsert đổi.
- **`タイトルマスタ`** (sheet mới, 36 cột, gộp 顧客作品マスタ + コピーライトマスタ + マトリクス媒体) — là output của bước sau trong pipeline, không phải GAS❶.

## Quyết định thiết kế bổ sung (spec chưa nói, plan này chốt)

1. **Cảnh báo ghi thành DÒNG ở tab riêng `GAS1警告`, không nhồi vào 1 ô của `GAS1ログ`.** Lý do: mô phỏng §5.4 lần 3 cho **110 ca `照合注意`** trong một lần chạy; nhồi 110 tên tác phẩm vào một ô thì không ai đọc được và sẽ đụng giới hạn 50.000 ký tự/ô khi dữ liệu lớn hơn. `GAS1ログ` vẫn nhận **6 cột số đếm mới** (đủ để nhìn 1 dòng biết lần chạy đó có gì lạ), chi tiết nằm ở `GAS1警告`. Vẫn đúng tinh thần §6 ("ghi vào log của chính GAS❶, không cần xin cột trên ガワ của 池永").
2. **Lọc và match làm CÙNG MỘT LƯỢT** (`filterAndMatchWorks`), 2 phase: phase A tác phẩm `判定済み && !isNg` chiếm dòng master trước, phase B tác phẩm NG/未判定 chỉ được giữ nếu còn dòng chưa bị chiếm. Nếu tách thành "lọc (peek)" rồi "match (claim)" như spec §8 gợi ý (bước 5 rồi bước 6/7) thì 2 lượt có thứ tự claim khác nhau → một tác phẩm NG có thể chiếm dòng của một tác phẩm hợp lệ ở lượt 1 rồi mất dòng ở lượt 2, và bị **append thành dòng mới** — đúng loại lỗi trùng dòng mà cả thiết kế này sinh ra để chống. Một lượt duy nhất loại bỏ hẳn class lỗi đó.
3. **Giữ `diffUpsert()`/`resolveNumbers()` cũ, thêm bản mới theo match** thay vì đổi chữ ký như §9 gợi ý. `コピーライトマスタ` vẫn khoá theo `タイトルNo` đơn giản và **không đổi 1 dòng nào** — giảm bề mặt rủi ro của lần thay đổi này.
4. **So sánh ngày theo NGÀY LỊCH, không theo instant** (`sameDateValue`). `先行開始日`/`先行終了日` lần đầu được đưa vào `isEqualFn` (hiện tại đang không so, nên `延長` đổi ngày sẽ không được cập nhật — gap thật). Nhưng so `String(Date)` trực tiếp thì lệch timezone giữa 2 spreadsheet sẽ gây churn vĩnh viễn → so bằng `年-月-日`.
5. **Cột `タイトルID` phải nằm trong `isEqualFn`.** Không có nó thì 108 dòng khớp ở tầng 3 (§5.4 lần 3) sẽ được coi là "không đổi" và **không bao giờ được ghi số ID mới** — mô phỏng "110 update" của spec sẽ ra 0 và cascade tầng 3 phải chạy lại vô hạn mỗi ngày.
6. **Dòng ghi được dựng từ bản copy của dòng cũ** (xem mục ガワ ở trên) để bảo toàn 7 cột GAS không sở hữu.
7. **Cột I `掲載停止日付` (Task 13, user chốt 2026-08-03 — ghi đè spec §10d):** nguồn là file TSV theo ngày trên Drive (`multi_title_yyyyMMdd.tsv`), join theo **`タイトルID`**. Bốn quyết định của user:
   - **GHI MỘT LẦN, KHÔNG BAO GIỜ GHI ĐÈ.** Ô nào đang có giá trị thì GAS không đụng tới — dù TSV nói khác, dù tác phẩm đã bị gỡ khỏi TSV. GAS chỉ điền vào ô đang TRỐNG khi tra ra ngày. Đây là quyết định thay thế phương án "TSV là nguồn chân lý, không khớp thì xoá" đã cân nhắc trước đó.
   - **Chỉ là dữ liệu**, không tham gia bộ lọc — bộ lọc vẫn chỉ theo レギュレーション (§3.3). Tác phẩm có ngày dừng vẫn được vào master.
   - **Lấy file mới nhất theo tên** (`yyyyMMdd` lớn nhất ≤ ngày chạy). Không tìm được file nào: ghi cảnh báo vào `GAS1警告` rồi chạy tiếp bình thường, cột I không bị đụng tới (hệ quả tự nhiên của quy tắc ghi-một-lần).
   - **Khoá join là `タイトルID`** (KHÔNG phải `タイトル名`), so khớp sau `normalizeJapaneseText` và **chỉ khi cả hai vế là số thật** (`isDigits`) — cùng lý do với tầng 2 của cascade (§5.2): `タイトルID` của CMS có 104 dòng trống và nhiều ô dùng để ghi chú (`ー`, `4415行目と同一`), không chặn thì các dòng đó khớp lẫn nhau qua khoá rỗng/khoá trùng. Hai hệ quả phải biết trước: (a) **~6% dòng master không bao giờ nhận được ngày dừng** vì `タイトルID` trống/không phải số; (b) 2 tác phẩm dùng chung một `タイトルID` (có thật: `冬すぎて桜` và `冬すぎて桜【タテヨミ】` cùng 266030) sẽ **cùng nhận một ngày dừng**. Cả hai đều được ghi vào cảnh báo, không im lặng.

   Lợi thế phụ của quy tắc ghi-một-lần: cột I không thể gây churn. Ô đã có giá trị thì `isEqualFn` luôn coi là "không đổi", nên không có nguy cơ mỗi lần chạy lại ghi đè cả sheet vì lệch định dạng ngày (chuỗi `2025/2/8` từ TSV so với `Date` mà Sheets tự chuyển đổi khi ghi vào ô).

8. **`readCustomerWorkMaster()` trả thêm `sheetRow`** (số dòng thật 1-based trên sheet) và đường ghi dùng trực tiếp giá trị này, thay vì suy ra từ `rowOffset + 2`. Công thức cũ ngầm giả định "header ở hàng 1 và không có dòng trống xen giữa" — cả 2 giả định đều đã sai với ガワ mới.

---

## File Structure

```
src/util/headerMap.js               (Modify: + colByPrefix — header レギュレーション có hậu tố ghi chú)
src/logic/upsert.js                 (Modify: + isDigits, sameDateValue, buildMasterMatchIndex,
                                     matchExistingRow, claimMatch, collectOrphanOffsets,
                                     resolveNumbersFromMatches, diffUpsertFromMatches.
                                     GIỮ NGUYÊN: normalizeJapaneseText, normalizeForCompare,
                                     sameValue, diffUpsert, resolveNumbers)
src/logic/regulationFilter.js       (NEW: filterAndMatchWorks — lọc + match 1 lượt, 2 phase)
src/logic/warnings.js               (NEW: 4 hàm build dòng cảnh báo, pure)
src/sources/regulationSource.js     (Rewrite: parse ①②③, isRegulationNg, lookup 1 map theo tên,
                                     NG-thắng. Xoá compositeKey/lookupRegulation/3 map theo ID)
src/sources/cmsSource.js            (Modify: lọc dòng trống theo タイトル名. Xoá buildCmsCopyrightLookup)
src/logic/customerWorkMaster.js     (Modify: bỏ remark/ngTitleLookup, thêm policy/general/logo/
                                     judged/isNg/label/copyrightU)
src/logic/copyrightResolver.js      (Modify: tầng 1 đọc work.copyrightU, bỏ tham số cmsCopyrightLookup)
src/logic/changeDetail.js           (Modify: fieldDef nhận compare tuỳ chọn — cho field ngày)
src/io/sheetIO.js                   (Modify: resolveMasterHeader tự dò hàng header + trả values;
                                     header map mới B→U; bảo toàn cột không sở hữu; ghi theo sheetRow)
src/io/logSheet.js                  (Modify: + tab GAS1警告, + 6 cột số đếm cho GAS1ログ)
src/main.js                         (Modify: thứ tự bước mới §8, bỏ CMSID khỏi logic, ghi cảnh báo)
src/config.js                       (Modify: TRIGGER_HOURS [9, 17]; + SOURCES.SUSPENSION cho Task 13)

--- chỉ Task 13 (cột I 掲載停止日付) ---
src/io/driveTsv.js                  (NEW: DriveApp — tìm file multi_title_yyyyMMdd.tsv mới nhất + đọc text)
src/sources/suspensionSource.js     (NEW, pure: parse TSV -> Map normalize(タイトル名) -> 掲載停止日付)
tools/verify/tests/80-suspension.test.js (NEW)

tools/verify/exportFixtures.py      (NEW: example/*.xlsx -> tools/verify/fixtures/*.json)
tools/verify/loadSrc.js             (NEW: nạp các file pure của src/ vào 1 vm context)
tools/verify/assert.js              (NEW: check() + report(), ~30 dòng)
tools/verify/run.js                 (NEW: chạy mọi tools/verify/tests/*.test.js)
tools/verify/tests/*.test.js        (NEW: 1 file/tầng, thêm dần theo từng task)
tools/verify/liveCheck.gs           (đã có, không sửa)
.gitignore                          (NEW: bỏ qua tools/verify/fixtures/)

docs/superpowers/specs/2026-08-03-regulation-title-name-key-design.md  (Modify: §7 ガワ mới, §11)
docs/gas1-van-hanh.md               (Modify: sơ đồ luồng mới + 3 bài học mới)
```

---

### Task 1: Harness kiểm chứng chạy bằng Node

Không có harness thì 11 task còn lại đều là "sửa rồi cầu nguyện": logic lọc mới quyết định **69% tác phẩm CMS bị loại khỏi master**, và khoá upsert mới là thứ đã từng gây sự cố trùng dòng. Task này dựng chỗ để mọi task sau viết test thật trước khi sửa code.

**Files:**
- Create: `tools/verify/exportFixtures.py`
- Create: `tools/verify/loadSrc.js`
- Create: `tools/verify/assert.js`
- Create: `tools/verify/run.js`
- Create: `tools/verify/tests/00-harness.test.js`
- Create: `.gitignore`

**Interfaces:**
- Produces: `loadSrc() -> object` — trả về global object của vm context sau khi nạp mọi file pure trong `src/`; mọi hàm top-level của các file đó truy cập được dạng property (vd `src.normalizeJapaneseText`).
- Produces: `check(label, actual, expected) -> void` — so sánh bằng `JSON.stringify`, ghi nhận pass/fail; `report() -> number` (exit code).
- Produces: mỗi file `tools/verify/tests/*.test.js` export `{ needsData?: boolean, run: function({src, check, fixtures}) }`. `fixtures.load(name)` đọc `tools/verify/fixtures/<name>.json` (mảng 2 chiều, ô trống = `''`, ngày = ISO string).
- Consumed by: Task 2-6 (mỗi task thêm 1 file test).

- [ ] **Step 1: Viết `tools/verify/assert.js`**

```js
// tools/verify/assert.js — 30 dòng thay cho cả 1 test framework.
// KHÔNG dùng jest/mocha: repo này không có node_modules và không muốn có
// (src/ chạy trên Apps Script, không có bundler). Harness chỉ cần đúng 2 việc:
// so sánh giá trị và đếm pass/fail.

var passes = 0;
var failures = [];

/**
 * So sánh actual với expected bằng JSON.stringify (đủ cho mảng/object phẳng
 * mà harness này dùng; KHÔNG so được Map/Set — hãy chuyển sang Array trước
 * khi truyền vào, vd Array.from(map.entries())).
 */
function check(label, actual, expected) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a === e) { passes += 1; return; }
  failures.push(label + '\n    expected: ' + e + '\n    actual  : ' + a);
}

/** In kết quả, trả về exit code (0 = tất cả pass). */
function report() {
  failures.forEach(function (f) { console.log('FAIL  ' + f); });
  console.log('');
  console.log(passes + ' passed, ' + failures.length + ' failed');
  return failures.length === 0 ? 0 : 1;
}

module.exports = { check: check, report: report };
```

- [ ] **Step 2: Viết `tools/verify/loadSrc.js`**

```js
// tools/verify/loadSrc.js — nạp tầng PURE của src/ vào 1 vm context để test
// bằng Node.
//
// Vì sao làm được: src/sources/*.js và src/logic/*.js KHÔNG hề gọi
// SpreadsheetApp/Logger/ScriptApp (đã kiểm: chỉ xuất hiện trong comment) —
// chúng là JS thuần nhận vào mảng 2 chiều đã đọc sẵn. Còn src/io/*.js và
// src/main.js thì có, nên CỐ TÌNH không nạp: 2 file đó được kiểm chứng bằng
// probe_* chạy tay trong Apps Script editor.
//
// Vì sao vm chứ không require: các file trong src/ không có module.exports
// (Apps Script share 1 global scope). Chạy trong vm context rồi đọc property
// của global object là cách nạp chúng nguyên vẹn, không phải sửa src/ chỉ để
// test được.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Thứ tự nạp không quan trọng về mặt kỹ thuật (đều là function declaration,
// được hoist), nhưng giữ theo tầng phụ thuộc cho dễ đọc.
const PURE_FILES = [
  'src/util/headerMap.js',
  'src/logic/upsert.js',
  'src/sources/regulationSource.js',
  'src/sources/cmsSource.js',
  'src/sources/ngTitleSource.js',
  'src/sources/copyrightRules.js',
  'src/logic/customerWorkMaster.js',
  'src/logic/regulationFilter.js',
  'src/logic/warnings.js',
  'src/logic/copyrightResolver.js',
  'src/logic/copyrightHistory.js',
  'src/logic/changeDetail.js',
];

function loadSrc() {
  const root = path.resolve(__dirname, '..', '..');
  const sandbox = { console: console };
  vm.createContext(sandbox);
  PURE_FILES.forEach(function (rel) {
    const abs = path.join(root, rel);
    // Bỏ qua file chưa tồn tại: plan này tạo regulationFilter.js/warnings.js
    // ở task sau, harness vẫn phải chạy được từ task 1.
    if (!fs.existsSync(abs)) return;
    vm.runInContext(fs.readFileSync(abs, 'utf8'), sandbox, { filename: rel });
  });
  return sandbox;
}

module.exports = { loadSrc: loadSrc, PURE_FILES: PURE_FILES };
```

- [ ] **Step 3: Viết `tools/verify/run.js`**

```js
// tools/verify/run.js — chạy toàn bộ test của tầng pure.
//
//   node tools/verify/run.js           chỉ chạy test đơn vị (nhanh, không cần fixtures)
//   node tools/verify/run.js --data    chạy thêm test đối chiếu số liệu spec §12
//                                      (cần chạy tools/verify/exportFixtures.py trước)

const fs = require('fs');
const path = require('path');
const { loadSrc } = require('./loadSrc');
const { check, report } = require('./assert');

const withData = process.argv.indexOf('--data') !== -1;
const src = loadSrc();
const fixturesDir = path.join(__dirname, 'fixtures');

const fixtures = {
  dir: fixturesDir,
  load: function (name) {
    return JSON.parse(fs.readFileSync(path.join(fixturesDir, name + '.json'), 'utf8'));
  },
};

const testsDir = path.join(__dirname, 'tests');
fs.readdirSync(testsDir).filter(function (f) { return /\.test\.js$/.test(f); }).sort().forEach(function (f) {
  const suite = require(path.join(testsDir, f));
  if (suite.needsData && !withData) {
    console.log('SKIP  ' + f + ' (chạy lại với --data để đối chiếu số liệu spec §12)');
    return;
  }
  if (suite.needsData && !fs.existsSync(fixturesDir)) {
    console.log('SKIP  ' + f + ' (chưa có fixtures — chạy: python tools/verify/exportFixtures.py)');
    return;
  }
  console.log('RUN   ' + f);
  suite.run({ src: src, check: check, fixtures: fixtures });
});

process.exit(report());
```

- [ ] **Step 4: Viết `tools/verify/exportFixtures.py`**

```python
# tools/verify/exportFixtures.py — export các sheet nguồn từ example/*.xlsx ra
# JSON mảng 2 chiều, để harness Node (tools/verify/run.js --data) đối chiếu lại
# đúng những con số trong spec §12.
#
# CHỈ ĐỌC. Không ghi gì vào Google Sheets, không sửa file .xlsx nào.
#
# Fidelity quan trọng nhất: ô trống phải ra '' (đúng như SpreadsheetApp trả về
# cho ô trống), KHÔNG phải None/null — vì logic thật phân biệt '' với undefined
# (xem JSDoc normalizeForCompare trong src/logic/upsert.js).
#
# Dùng: python tools/verify/exportFixtures.py

import datetime
import json
import os

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, 'tools', 'verify', 'fixtures')

PUBLISHER_RULES = 'example/【池永社内】出版社からの追記ルールと外部出稿NGタイトル (1).xlsx'

TARGETS = [
    ('regulation', 'example/【池永社内】【社外用】作品レギュレーション判定.xlsx', 'シート1'),
    ('cms', 'example/【池永社内】【マスタ】先行タイトル情報（CMS）_代理店共通_DX_debug.xlsx', '★列追加の場合は増渕まで★'),
    ('ngTitles', PUBLISHER_RULES, '外部出稿用NGタイトル'),
    ('basicNotation', PUBLISHER_RULES, '基本のC表記'),
    ('customerMasterGawa', 'example/【池永社内】顧客作品マスタ0803.xlsx', '顧客作品マスタ'),
]


def cell(value):
    if value is None:
        return ''
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    return value


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, rel_path, sheet_name in TARGETS:
        path = os.path.join(ROOT, rel_path)
        # data_only=True: các sheet này dùng IMPORTRANGE, không có nó openpyxl
        # trả về chuỗi công thức '=IFERROR(__xludf.DUMMYFUNCTION(...))' thay vì
        # giá trị thật.
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb[sheet_name]
        rows = [[cell(c) for c in row] for row in ws.iter_rows(values_only=True)]
        # Bỏ các dòng trống ở cuối (openpyxl hay trả thêm vài dòng rỗng, còn
        # getDataRange() của Sheets thì không).
        while rows and not any(str(c).strip() for c in rows[-1]):
            rows.pop()
        out = os.path.join(OUT_DIR, name + '.json')
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(rows, f, ensure_ascii=False)
        print('%-20s %5d dòng -> %s' % (name, len(rows), out))
        wb.close()


if __name__ == '__main__':
    main()
```

- [ ] **Step 5: Viết `tools/verify/tests/00-harness.test.js` (test để CHỨNG MINH harness hoạt động)**

Test này chỉ dùng hàm đã tồn tại, nên nó phải PASS ngay — mục đích là chứng minh vm loader nạp được `src/`, chứ không phải kiểm nghiệp vụ mới.

```js
// tools/verify/tests/00-harness.test.js — chứng minh loadSrc() nạp được tầng
// pure của src/. Chỉ dùng hàm đã tồn tại từ trước plan này.

module.exports = {
  run: function (ctx) {
    var src = ctx.src;
    var check = ctx.check;

    // normalizeJapaneseText: có thật, gộp 〜/～ + NFKC (src/logic/upsert.js)
    check('normalizeJapaneseText gộp wave dash và fullwidth tilde',
      src.normalizeJapaneseText('落城の美姫〜甘い執着〜') === src.normalizeJapaneseText('落城の美姫～甘い執着～'),
      true);
    check('normalizeJapaneseText coi null/undefined/rỗng như nhau',
      [src.normalizeJapaneseText(null), src.normalizeJapaneseText(undefined), src.normalizeJapaneseText('  ')],
      ['', '', '']);

    // headerMap: normalizeHeaderText bỏ khoảng trắng full-width + newline
    check('normalizeHeaderText bỏ newline trong header',
      src.normalizeHeaderText('①広告出稿ポリシー\n（出稿NG）'),
      '①広告出稿ポリシー（出稿NG）');

    // findHeaderRowIndex dò được hàng header không phải hàng 1
    var rows = [['ghi chú'], [''], ['タイトルNo', 'タイトル名'], [1, 'abc']];
    check('findHeaderRowIndex dò đúng hàng header',
      src.findHeaderRowIndex(rows, ['タイトルNo', 'タイトル名']),
      2);
  },
};
```

- [ ] **Step 6: Chạy harness — phải PASS**

Run: `node tools/verify/run.js`

Expected:
```
RUN   00-harness.test.js

4 passed, 0 failed
```

Nếu `FAIL` ở `normalizeHeaderText` → loader chưa nạp `headerMap.js`; kiểm lại đường dẫn trong `PURE_FILES`.

- [ ] **Step 7: Export fixtures và kiểm số dòng thô**

Run: `python tools/verify/exportFixtures.py`

Expected (khớp §12: レギュレーション 5.356 dòng data + 4 dòng trên header = 5.360; CMS 5.649 + 1 header = 5.650; con số in ra là **tổng số dòng kể cả header/ghi chú**, nên không phải khớp chính xác — chỉ cần đúng cỡ này và không có file nào 0 dòng):
```
regulation            5360 dòng -> ...\tools\verify\fixtures\regulation.json
cms                   5650 dòng -> ...\tools\verify\fixtures\cms.json
ngTitles               673 dòng -> ...\tools\verify\fixtures\ngTitles.json
basicNotation          ... dòng -> ...\tools\verify\fixtures\basicNotation.json
customerMasterGawa      15 dòng -> ...\tools\verify\fixtures\customerMasterGawa.json
```

`customerMasterGawa` phải ra **15 dòng** (ガワ mới: hàng 15 là header, chưa có dòng dữ liệu nào) — nếu ra nhiều hơn thì file `example/` đã có dữ liệu, ghi lại con số thật vào commit message để task 7 biết.

Nếu `openpyxl` chưa có: `pip install openpyxl`.

- [ ] **Step 8: Tạo `.gitignore`**

```
# Fixtures được sinh ra từ example/*.xlsx (bản tải về, không commit) —
# chạy lại bằng: python tools/verify/exportFixtures.py
tools/verify/fixtures/
```

- [ ] **Step 9: Commit**

```bash
rtk git add tools/verify .gitignore && rtk git commit -m "$(cat <<'EOF'
Add a dependency-free Node harness for the pure GAS1 layer

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `regulationSource.js` — parse ①②, định nghĩa NG, lookup theo タイトル名

Đây là task đổi vai trò của nguồn レギュレーション: từ "cấp 1 cột" thành "bộ lọc + cấp 3 cột" (§2, §3.2, §4.1).

**Files:**
- Modify: `src/util/headerMap.js` (thêm `colByPrefix()` vào cuối file)
- Rewrite: `src/sources/regulationSource.js` (toàn bộ)
- Create: `tools/verify/tests/10-regulation.test.js`

**Interfaces:**
- Consumes: `normalizeJapaneseText(value) -> string` (`logic/upsert.js`, đã có), `resolveHeaderIndex`/`col`/`buildHeaderIndex`/`normalizeHeaderText` (`util/headerMap.js`, đã có).
- Produces: `colByPrefix(headerIndex, prefix) -> number` — số cột (0-based) của header **duy nhất** bắt đầu bằng `prefix` (sau `normalizeHeaderText`); throw nếu 0 hoặc >1 cột khớp.
- Produces: `parseRegulationRows(rawRows) -> Array<{titleName, policy, general, logoJudgement}>` — chỉ dòng `ステータス === '判定済み'`, **giá trị nguyên văn**, không chuẩn hoá.
- Produces: `isRegulationNg(record) -> boolean` — theo đúng §3.2.
- Produces: `buildRegulationLookup(records) -> Map<string, {policy, general, logoJudgement, isNg}>` — khoá = `normalizeJapaneseText(titleName)`, tên trùng thì **dòng NG thắng**.
- **XOÁ:** `compositeKey()`, `lookupRegulation()`, `hasValue()`, và 3 map `byCmsIdAndTitleId`/`byCmsId`/`byTitleId`. Chỗ gọi `lookupRegulation()` duy nhất là `logic/customerWorkMaster.js`, được sửa ở Task 4 — nghĩa là giữa Task 2 và Task 4 repo ở trạng thái gọi hàm không tồn tại. **Không `clasp push` giữa 2 task này** (xem Task 4 Step cuối).
- Consumed by: Task 4 (`buildCustomerWorkRows`), Task 9 (`main.js`).

**Vì sao cần `colByPrefix`:** header thật của sheet `シート1` **không** phải `①広告出稿ポリシー` như spec §7 viết, mà là `'①広告出稿ポリシー\n（出稿NG）'` và `'②一般面出稿NG\n（アダルト作品扱い）'` (đã xác minh trên file trong `example/`). Phần trong ngoặc là **ghi chú giải thích** — đúng loại text người ta sửa lời mà không nghĩ là đang sửa cấu trúc. Tra bằng tên đầy đủ thì `col()` throw ngay khi 池永 đổi chữ trong ngoặc; tra bằng prefix `①広告出稿ポリシー` thì bền hơn, và vẫn throw (đúng triết lý của `col()`) nếu prefix biến mất hoặc khớp nhiều cột.

- [ ] **Step 1: Viết test — phải FAIL**

Create `tools/verify/tests/10-regulation.test.js`:

```js
// tools/verify/tests/10-regulation.test.js

// Header thật của sheet シート1 (hàng 4), copy nguyên văn kể cả \n trong header
// cột ① và ② — xem example/【池永社内】【社外用】作品レギュレーション判定.xlsx
var HEADER = ['No', 'ステータス', '更新日', 'ＣＭＳID', 'タイトルＩＤ', 'タイトル名', 'ジャンル',
  '出版社', '①広告出稿ポリシー\n（出稿NG）', '②一般面出稿NG\n（アダルト作品扱い）', '③シーモアロゴ判定'];

function sheet(rows) {
  return [['ghi chú 1'], ['ghi chú 2'], ['ghi chú 3'], HEADER].concat(rows);
}

/** 1 dòng data theo đúng thứ tự HEADER ở trên. */
function row(status, titleName, policy, general, logo) {
  return ['1', status, '', '5948', '333581', titleName, 'TL', '', policy, general, logo];
}

module.exports = {
  run: function (ctx) {
    var src = ctx.src;
    var check = ctx.check;

    // ---- colByPrefix ----
    var idx = src.buildHeaderIndex(HEADER);
    check('colByPrefix tim duoc cot ① du header co hau to ghi chu', src.colByPrefix(idx, '①広告出稿ポリシー'), 8);
    check('colByPrefix tim duoc cot ②', src.colByPrefix(idx, '②一般面出稿NG'), 9);
    check('colByPrefix van khop khi ten dung bang ca header', src.colByPrefix(idx, '③シーモアロゴ判定'), 10);
    var threwMissing = false;
    try { src.colByPrefix(idx, '④存在しない列'); } catch (e) { threwMissing = true; }
    check('colByPrefix throw khi khong cot nao khop', threwMissing, true);
    var threwAmbiguous = false;
    try { src.colByPrefix(src.buildHeaderIndex(['先行終了日', '先行終了日（延長）']), '先行終了日'); } catch (e) { threwAmbiguous = true; }
    check('colByPrefix throw khi >1 cot khop prefix', threwAmbiguous, true);

    // ---- parseRegulationRows: chỉ 判定済み ----
    var parsed = src.parseRegulationRows(sheet([
      row('判定済み', 'A作品', '問題なし', '一般面OK', 'ロゴなし'),
      row('判定中', 'B作品', '問題なし', '一般面OK', 'ロゴあり'),
      row('削除', 'C作品', '問題あり', 'アダルトジャンル', 'ロゴなし'),
      row('Wチェック待ち', 'D作品', '問題なし', '一般面OK', 'ロゴなし'),
      row('判定済み', 'E作品', '問題あり', 'アダルト作品扱い', 'ロゴあり'),
    ]));
    check('parseRegulationRows chi giu dong 判定済み', parsed.map(function (r) { return r.titleName; }), ['A作品', 'E作品']);
    check('parseRegulationRows giu nguyen van 3 cot', [parsed[1].policy, parsed[1].general, parsed[1].logoJudgement],
      ['問題あり', 'アダルト作品扱い', 'ロゴあり']);
    check('parseRegulationRows KHONG con tra cmsId/titleId',
      [parsed[0].cmsId === undefined, parsed[0].titleId === undefined], [true, true]);

    // ---- isRegulationNg: đúng theo spec §3.2 ----
    function ng(policy, general) { return src.isRegulationNg({ policy: policy, general: general }); }
    check('NG: ①=問題あり', ng('問題あり', '一般面OK'), true);
    check('NG: ②=アダルト作品扱い', ng('問題なし', 'アダルト作品扱い'), true);
    check('NG: ②=アダルトジャンル', ng('問題なし', 'アダルトジャンル'), true);
    // 4 giá trị spec §3.2 đã đo là KHÔNG tính NG — đừng "sửa cho hợp lý hơn"
    check('KHONG NG: ②=出稿NG (6 dong that, spec §3.2 chot la khong loai)', ng('問題なし', '出稿NG'), false);
    check('KHONG NG: ①=素材不足により判定不可', ng('素材不足により判定不可', '一般面OK'), false);
    check('KHONG NG: ②=素材不足により判定不可', ng('問題なし', '素材不足により判定不可'), false);
    check('KHONG NG: ② trong', ng('問題なし', ''), false);
    check('KHONG NG: ca 2 trong', ng('', ''), false);
    // chuẩn hoá chỉ để so khớp: khoảng trắng full-width vẫn phải nhận ra là NG
    check('NG nhan ra du co khoang trang full-width quanh gia tri', ng('　問題あり　', ''), true);

    // ---- buildRegulationLookup: khoá theo tên, NG thắng ----
    var lookup = src.buildRegulationLookup(src.parseRegulationRows(sheet([
      row('判定済み', '落城の美姫〜甘い執着〜', '問題なし', '一般面OK', 'ロゴなし'),
      row('判定済み', '同名作品', '問題なし', '一般面OK', 'ロゴなし'),
      row('判定済み', '同名作品', '問題なし', 'アダルトジャンル', 'ロゴあり'),
      row('判定済み', '同名作品', '問題なし', '一般面OK', 'ロゴなし'),
      row('判定済み', '', '問題なし', '一般面OK', 'ロゴなし'),
    ])));
    check('lookup tra duoc qua NFKC (〜 vs ～)',
      lookup.get(src.normalizeJapaneseText('落城の美姫～甘い執着～')).logoJudgement, 'ロゴなし');
    check('lookup: ten trung thi dong NG thang, ke ca khi dong NG khong o cuoi',
      [lookup.get('同名作品').isNg, lookup.get('同名作品').general], [true, 'アダルトジャンル']);
    check('lookup bo qua dong タイトル名 trong', lookup.has(''), false);
    check('lookup co dung 2 khoa', lookup.size, 2);
  },
};
```

Run: `node tools/verify/run.js`
Expected: nhiều dòng `FAIL`, trong đó có lỗi `src.colByPrefix is not a function` / `src.isRegulationNg is not a function`.

- [ ] **Step 2: Thêm `colByPrefix()` vào cuối `src/util/headerMap.js`**

```js
/**
 * Giống col(), nhưng khớp header theo TIỀN TỐ thay vì khớp toàn bộ tên.
 *
 * Dùng cho những cột mà tên header có kèm ghi chú giải thích ngay trong ô —
 * hiện tại là 2 cột của sheet 作品レギュレーション判定:
 *   '①広告出稿ポリシー\n（出稿NG）'
 *   '②一般面出稿NG\n（アダルト作品扱い）'
 * Phần trong ngoặc là văn bản giải thích do con người viết, có thể được sửa
 * lời bất cứ lúc nào mà người sửa không nghĩ là mình đang sửa cấu trúc dữ
 * liệu. Tra bằng tên đầy đủ (col()) sẽ throw ngay lần chạy sau đó; tra bằng
 * tiền tố '①広告出稿ポリシー' thì bền với việc sửa ghi chú.
 *
 * VẪN THROW (giữ đúng triết lý của col(), không âm thầm đoán) trong 2 trường
 * hợp: không cột nào khớp tiền tố, HOẶC nhiều hơn 1 cột khớp — trường hợp thứ
 * 2 quan trọng: ガワ mới của 顧客作品マスタ có cả '先行終了日', '先行終了日（延長）'
 * và '先行終了日（最終確定）', nên tra tiền tố '先行終了日' ở đó là nhập nhằng và
 * phải để con người quyết định, không được chọn bừa cột bên trái.
 *
 * @param {Map<string, number>} headerIndex - Kết quả buildHeaderIndex()/resolveHeaderIndex()
 * @param {string} prefix - Tiền tố tên cột (không cần normalize trước, hàm tự làm)
 * @returns {number} Số cột (0-based)
 * @throws {Error} Nếu không cột nào khớp, hoặc nhiều hơn 1 cột khớp
 */
function colByPrefix(headerIndex, prefix) {
  var normalizedPrefix = normalizeHeaderText(prefix);
  var matches = [];
  headerIndex.forEach(function (index, name) {
    if (name.indexOf(normalizedPrefix) === 0) matches.push({ name: name, index: index });
  });
  if (matches.length === 0) throw new Error('Không tìm thấy cột header bắt đầu bằng: ' + prefix);
  if (matches.length > 1) {
    throw new Error('Tiền tố cột "' + prefix + '" khớp nhiều cột, không xác định được cột nào: '
      + matches.map(function (m) { return m.name; }).join(', '));
  }
  return matches[0].index;
}
```

- [ ] **Step 3: Viết lại toàn bộ `src/sources/regulationSource.js`**

Thay **toàn bộ** nội dung file bằng:

```js
// sources/regulationSource.js — parse 【社外用】作品レギュレーション判定
//
// VAI TRÒ (đã đổi 2026-08-03, xem spec §2): trước đây nguồn này chỉ cấp thêm 1
// cột (③シーモアロゴ判定) cho tác phẩm đã có trong CMS. Bây giờ nó là BỘ LỌC
// quyết định tác phẩm nào ĐƯỢC vào 顧客作品マスタ, đồng thời cấp 3 cột
// ①広告出稿ポリシー / ②一般面出稿NG / ③シーモアロゴ判定.
//
// KHOÁ JOIN với CMS là タイトル名, so 完全一致 (sau chuẩn hoá Unicode) —
// KHÔNG dùng CMSID/タイトルID nữa (spec §4). Vì vậy file này không còn đọc 2
// cột ID đó, và 3 map tra theo ID (byCmsIdAndTitleId/byCmsId/byTitleId) cùng
// hàm lookupRegulation() đã bị xoá.
//
// HỆ QUẢ ĐÃ BIẾT VÀ ĐƯỢC USER CHẤP NHẬN (spec §4.5): 73 tác phẩm アダルト sẽ
// vào master vì CMS và レギュレーション viết tên khác nhau (vd CMS ghi
// '超肉食系年下男子たちに溺愛されて困っています(フルカラー)' còn レギュレーション ghi
// '超肉食系年下男子たちに溺愛されて困っています'). Tra bằng ID thì ra, tra bằng
// tên thì không. Nếu 営業 phản ánh có tác phẩm アダルト lọt xuống bước sau,
// ĐÂY là chỗ xem lại đầu tiên (spec §4.5 có bảng đối chiếu số liệu).
//
// Đặc điểm riêng của sheet シート1: 3 hàng đầu là ghi chú giải thích, hàng 4
// mới là header thật — findHeaderRowIndex() (trong headerMap.js) tự dò ra
// đúng hàng này, không cần hardcode số 4.

// CHỈ gồm những tên cột KHỚP TOÀN BỘ và ổn định — 2 cột ①/② có hậu tố ghi chú
// trong chính ô header nên được tra riêng bằng colByPrefix() (xem bên dưới).
var REGULATION_REQUIRED_HEADERS = ['ステータス', 'タイトル名', '③シーモアロゴ判定'];

var REGULATION_STATUS_OK = '判定済み';

// Prefix của 2 cột có ghi chú kèm trong ô header:
//   '①広告出稿ポリシー\n（出稿NG）'
//   '②一般面出稿NG\n（アダルト作品扱い）'
var REGULATION_POLICY_PREFIX = '①広告出稿ポリシー';
var REGULATION_GENERAL_PREFIX = '②一般面出稿NG';

// Định nghĩa NG — nguyên văn yêu cầu nghiệp vụ (spec §3.1/§3.2):
//   ①広告出稿ポリシー「問題あり」or ②一般面出稿NG「アダルト作品扱い」「アダルトジャンル」
//
// CỐ TÌNH KHÔNG có '出稿NG' trong danh sách ② dù nghe như phải chặn: nghiệp vụ
// chỉ định đúng 2 giá trị trên, đã nêu lại với user và user không yêu cầu đổi
// (spec §3.2 — 6 dòng thật đang mang giá trị này). Nếu 営業 phản ánh, đây là
// chỗ sửa đầu tiên.
var REGULATION_NG_POLICY_VALUE = '問題あり';
var REGULATION_NG_GENERAL_VALUES = ['アダルト作品扱い', 'アダルトジャンル'];

/**
 * Đọc + lọc dữ liệu thô của sheet 作品レギュレーション判定.
 *
 * CHỈ lấy dòng có ステータス = "判定済み". Căn cứ là ghi chú của chính sheet
 * nguồn (ô B3): "B列（ステータス）が「判定済み」のもののみ進行可　それ以外は
 * 判定中のためお待ちください。" — NỬA SAU của câu mới là điểm quyết định:
 * trạng thái khác 判定済み KHÔNG có nghĩa "không có vấn đề" mà là "đang chấm,
 * hãy chờ". Vì vậy tác phẩm không tra ra dòng 判定済み nào sẽ bị LOẠI khỏi
 * 顧客作品マスタ (xem logic/regulationFilter.js), khác hẳn hành vi cũ là vẫn
 * ghi vào master với cột phán定 để trống — tức âm thầm coi như đã thông qua.
 *
 * Các trạng thái bị bỏ qua trên dữ liệu thật (spec §12): 削除 145,
 * Wチェック完了 16, Wチェック待ち 11, 担当者依頼中 9, 再判定依頼 6, 依頼中 1,
 * trống 10 — tổng 198 dòng trên 5.356.
 *
 * GIÁ TRỊ TRẢ VỀ LÀ NGUYÊN VĂN — không chuẩn hoá gì. Chuẩn hoá chỉ xảy ra khi
 * DỰNG KHOÁ và SO SÁNH (spec §4.4), vì 3 cột này sẽ được ghi thẳng vào cột
 * F/G/H của 顧客作品マスタ.
 *
 * @param {Array<Array<*>>} rawRows - Kết quả sheet.getDataRange().getValues() của sheet シート1
 * @returns {Array<{titleName: string, policy: string, general: string, logoJudgement: string}>}
 */
function parseRegulationRows(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, REGULATION_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colStatus = col(idx, 'ステータス');
  var colTitleName = col(idx, 'タイトル名');
  var colPolicy = colByPrefix(idx, REGULATION_POLICY_PREFIX);
  var colGeneral = colByPrefix(idx, REGULATION_GENERAL_PREFIX);
  var colLogo = col(idx, '③シーモアロゴ判定');

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[colStatus]) !== REGULATION_STATUS_OK) continue;
    records.push({
      titleName: row[colTitleName],
      policy: row[colPolicy],
      general: row[colGeneral],
      logoJudgement: row[colLogo],
    });
  }
  return records;
}

/**
 * Tác phẩm này có bị coi là NG (không được đưa vào 顧客作品マスタ) hay không —
 * spec §3.2:
 *
 *   isNg  <=>  normalize(①広告出稿ポリシー) === '問題あり'
 *          ||  normalize(②一般面出稿NG)   ∈ { 'アダルト作品扱い', 'アダルトジャンル' }
 *
 * Chuẩn hoá qua normalizeJapaneseText() CẢ 2 VẾ (giá trị lẫn hằng số) để
 * không bị trượt vì khoảng trắng full-width hay biến thể Unicode — nhưng
 * KHÔNG dùng giá trị đã chuẩn hoá đó để ghi ra sheet.
 *
 * LƯU Ý về dữ liệu thật (spec §4.5): quy tắc ① hiện KHÔNG loại được dòng nào —
 * レギュレーション có 20 dòng '問題あり' nhưng 19 dòng không tồn tại trong danh
 * sách 先行タイトル của CMS, dòng thứ 20 (ヒグマグマ【単話版】) thì tên không
 * khớp. Toàn bộ 595 ca loại được đều đến từ quy tắc ②. Nghĩa là nhánh ① của
 * hàm này CHƯA được kiểm chứng bằng ca thật nào — chỉ bằng test đơn vị.
 *
 * @param {{policy: *, general: *}} record - 1 phần tử từ parseRegulationRows()
 * @returns {boolean}
 */
function isRegulationNg(record) {
  if (normalizeJapaneseText(record.policy) === normalizeJapaneseText(REGULATION_NG_POLICY_VALUE)) return true;
  var general = normalizeJapaneseText(record.general);
  for (var i = 0; i < REGULATION_NG_GENERAL_VALUES.length; i++) {
    if (general === normalizeJapaneseText(REGULATION_NG_GENERAL_VALUES[i])) return true;
  }
  return false;
}

/**
 * Build bảng tra DUY NHẤT của nguồn này: normalize(タイトル名) -> phán định.
 *
 * Khoá là タイトル名 đã chuẩn hoá, so 完全一致 — không cắt hậu tố 【】/(), không
 * fuzzy, không fallback sang ID (spec §4.1). Lý do bỏ phương án chuẩn hoá mạnh
 * (spec §4.3): phần bị cắt lại mang phán định KHÁC NHAU —
 *   'ひとつ屋根の下、幼馴染はふしだらに。【白抜き修正版】' = 一般面OK
 *   'ひとつ屋根の下、幼馴染はふしだらに。【棒消し修正版】' = アダルトジャンル
 * Cắt 【】 sẽ gộp 2 dòng này thành 1 và làm 179 tác phẩm tra sang phán định
 * của tác phẩm khác.
 *
 * TÊN TRÙNG NHAU -> DÒNG NGHIÊM NGẶT NHẤT THẮNG (có NG thì NG thắng), khác với
 * code cũ là "dòng sau đè dòng trước". Trên dữ liệu hôm nay có 14 tên trùng và
 * 0 ca phán định mâu thuẫn, nên quy tắc này chưa được dùng tới ca thật nào —
 * nhưng nếu ngày mai xuất hiện 2 dòng cùng tên khác phán định, hướng an toàn
 * là chặn, không phải cho qua.
 *
 * @param {Array<object>} records - Kết quả từ parseRegulationRows()
 * @returns {Map<string, {policy: string, general: string, logoJudgement: string, isNg: boolean}>}
 *   Giá trị trong map là NGUYÊN VĂN từ sheet (để ghi ra cột F/G/H), chỉ KHOÁ
 *   là giá trị đã chuẩn hoá.
 */
function buildRegulationLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    var key = normalizeJapaneseText(record.titleName);
    if (!key) return;
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
```

- [ ] **Step 4: Chạy test — phải PASS**

Run: `node tools/verify/run.js`
Expected: `RUN 00-harness.test.js`, `RUN 10-regulation.test.js`, dòng cuối `22 passed, 0 failed` (4 harness + 18 task này).

- [ ] **Step 5: Commit**

```bash
rtk git add src/util/headerMap.js src/sources/regulationSource.js tools/verify/tests/10-regulation.test.js && rtk git commit -m "Turn the regulation source into a title-name filter with NG detection"
```

---

### Task 3: `cmsSource.js` lọc theo タイトル名 + bỏ self-join của bản quyền tầng 1

Hai thay đổi đi cùng nhau vì cùng là "bỏ CMSID khỏi logic" (§5.5, §9.1).

**Files:**
- Modify: `src/sources/cmsSource.js` (comment đầu file, bộ lọc dòng trống, **xoá** `buildCmsCopyrightLookup()`)
- Modify: `src/logic/copyrightResolver.js` (tầng 1 + chữ ký `resolveCopyright`)
- Create: `tools/verify/tests/20-cms.test.js`

**Interfaces:**
- Produces: `parseCmsRows(rawRows) -> Array<{cmsId, titleId, titleName, author, genre, label, publisher, preStart, preEnd, copyrightU}>` — **chữ ký không đổi**, chỉ đổi điều kiện bỏ dòng: `タイトル名` rỗng thay vì `CMSID` rỗng.
- Produces: `resolveCopyright(work, publisherRegistry, publisherMaps, basicNotationMap) -> {value, tier}` — **bỏ tham số thứ 2 `cmsCopyrightLookup`**. Tầng 1 đọc `work.copyrightU`. Tầng 2/3/4 **không đổi**.
- **XOÁ:** `buildCmsCopyrightLookup()`.
- Consumed by: Task 4 (`work.copyrightU` phải được `buildCustomerWorkRows` mang theo), Task 9 (`main.js` bỏ biến `cmsCopyrightLookup`).

**Vì sao xoá `buildCmsCopyrightLookup` thay vì đổi khoá của nó (§9.1):** map này được build **từ chính `cmsRecords`**, rồi `resolveCopyright()` tra lại nó bằng `cmsId` của một `work` mà bản thân `work` đó sinh ra từ đúng `cmsRecord` ấy. Đây là self-join trên cùng một tập dữ liệu — đổi khoá sang `タイトル名` chỉ là mang bài toán trùng tên vào một chỗ vốn không cần khoá nào cả.

- [ ] **Step 1: Viết test — phải FAIL**

Create `tools/verify/tests/20-cms.test.js`:

```js
// tools/verify/tests/20-cms.test.js

var HEADER = ['CMSID', 'タイトルID', 'タイトル名', '作家名', 'ジャンル', 'レーベル名',
  '出版社', '先行開始日', '先行終了日', 'コピーライト'];

function sheet(rows) { return [HEADER].concat(rows); }

module.exports = {
  run: function (ctx) {
    var src = ctx.src;
    var check = ctx.check;

    var parsed = src.parseCmsRows(sheet([
      [1611, 262237, '鬼の戀 単話版', '桜田霊子', '少女', 'レーベルA', 'スターツ出版', '2026-01-01', '未定', '©桜田霊子/スターツ出版'],
      ['', 262238, 'CMSID trong nhung co ten', '作家B', '女性', '', '出版社B', '', '', ''],
      [1612, '', '', '作家C', '女性', '', '出版社C', '', '', ''],
      [1613, 'ー', 'titleID la placeholder', '作家D', '女性', '', '出版社D', '', '', ''],
      [1614, 262240, '　', '作家E', '女性', '', '出版社E', '', '', ''],
    ]));

    check('parseCmsRows loc theo タイトル名 (giu ca dong CMSID trong, bo dong ten chi co khoang trang)',
      parsed.map(function (r) { return r.titleName; }),
      ['鬼の戀 単話版', 'CMSID trong nhung co ten', 'titleID la placeholder']);
    check('parseCmsRows giu nguyen van タイトルID ke ca placeholder', parsed[2].titleId, 'ー');
    check('parseCmsRows van parse レーベル名 va コピーライト',
      [parsed[0].label, parsed[0].copyrightU], ['レーベルA', '©桜田霊子/スターツ出版']);
    check('buildCmsCopyrightLookup da bi xoa', typeof src.buildCmsCopyrightLookup, 'undefined');

    // ---- resolveCopyright: tầng 1 đọc work.copyrightU, không còn map ----
    var basicNotation = new Map([[src.normalizeJapaneseText('アルファポリス'), '©著者名/アルファポリス']]);
    var tier1 = src.resolveCopyright(
      { titleId: 1, titleName: 'X', author: '作家', publisher: 'アルファポリス', copyrightU: '©確認済み/CMS' },
      src.PUBLISHER_SHEET_PARSERS, {}, basicNotation);
    check('resolveCopyright tang 1 lay tu work.copyrightU', [tier1.value, tier1.tier], ['©確認済み/CMS', 1]);

    var tier3 = src.resolveCopyright(
      { titleId: 2, titleName: 'Y', author: '作家Y', publisher: 'アルファポリス', copyrightU: '' },
      src.PUBLISHER_SHEET_PARSERS, {}, basicNotation);
    check('resolveCopyright roi xuong tang 3 khi copyrightU rong',
      [tier3.value, tier3.tier], ['©作家Y/アルファポリス', 3]);

    var tier4 = src.resolveCopyright(
      { titleId: 3, titleName: 'Z', author: '作家Z', publisher: '出版社不明', copyrightU: null },
      src.PUBLISHER_SHEET_PARSERS, {}, basicNotation);
    check('resolveCopyright tang 4 khi khong tang nao khop', [tier4.value, tier4.tier], [null, 4]);
  },
};
```

Run: `node tools/verify/run.js`
Expected: FAIL ở test lọc `タイトル名` (dòng CMSID trống đang bị loại) và 3 test `resolveCopyright` (đang nhận sai số tham số nên `publisherRegistry` = `{}`).

- [ ] **Step 2: Sửa `src/sources/cmsSource.js`**

Thay khối comment `// LƯU Ý QUAN TRỌNG ...` ở đầu file (dòng 10-14) bằng:

```js
// LƯU Ý QUAN TRỌNG — bộ lọc "dòng có dữ liệu" đổi sang タイトル名 (2026-08-03,
// spec §5.5): trước đây file này bỏ dòng có CMSID rỗng, vì CMSID là khoá upsert
// của 顧客作品マスタ. Nay CMSID KHÔNG còn được dùng trong bất kỳ logic tra
// cứu/khoá nào (vẫn được GHI vào cột C của master để tra ngược khi điều tra sự
// cố), nên lọc theo nó là lọc theo một trường mà hệ thống không còn quan tâm.
// Đổi sang タイトル名 vì đó là trường AN TOÀN NHẤT trong 3 trường: 0 dòng trống
// trong 5.649 dòng CMS thật, so với タイトルID có 104 dòng trống (~6% số dòng
// vào master) và nhiều giá trị dùng ô ID để ghi chú ('ー', '4415行目と同一',
// '※既に配信済みのためCMS削除', '確認中').
```

Thay điều kiện bỏ dòng (dòng 51):

```js
    if (!row || row[colCmsId] === null || row[colCmsId] === undefined || row[colCmsId] === '') continue;
```

bằng:

```js
    // Lọc theo タイトル名 (KHÔNG phải CMSID): xem comment đầu file + spec §5.5.
    // Dùng normalizeJapaneseText() để ô chỉ chứa khoảng trắng (kể cả khoảng
    // trắng full-width '　') cũng được coi là trống.
    if (!row || normalizeJapaneseText(row[colTitleName]) === '') continue;
```

Xoá **toàn bộ** hàm `buildCmsCopyrightLookup()` cùng JSDoc của nó (từ `/**` ngay trước `Build bảng tra CMS ID` tới hết file), thay bằng:

```js
// buildCmsCopyrightLookup() ĐÃ BỊ XOÁ (2026-08-03, spec §9.1).
// Nó build 1 Map từ chính cmsRecords rồi để resolveCopyright() tra lại bằng
// cmsId của một work vốn sinh ra từ đúng cmsRecord đó — một self-join không
// cần thiết. Nay buildCustomerWorkRows() mang thẳng copyrightU vào work và
// resolveCopyright() đọc work.copyrightU. Đừng "khôi phục lại nhưng đổi khoá
// sang タイトル名": làm vậy chỉ mang bài toán trùng tên vào chỗ vốn không cần
// khoá nào cả.
```

- [ ] **Step 3: Sửa `src/logic/copyrightResolver.js`**

Trong JSDoc của `resolveCopyright()`, thay 2 dòng `@param` đầu:

```js
 * @param {{cmsId: *, titleId: *, titleName: string, author: string, publisher: string}} work
 *   Tác phẩm cần xác định bản quyền (1 phần tử từ buildCustomerWorkRows())
 * @param {Map<string, string>} cmsCopyrightLookup - Tầng 1, từ cmsSource.buildCmsCopyrightLookup()
```

bằng:

```js
 * @param {{titleId: *, titleName: string, author: string, publisher: string, copyrightU: *}} work
 *   Tác phẩm cần xác định bản quyền (1 phần tử từ buildCustomerWorkRows()).
 *   copyrightU (cột コピーライト của CMS) CHÍNH LÀ TẦNG 1 — đọc trực tiếp từ
 *   work, không qua map tra theo cmsId như trước (spec §9.1). work.cmsId
 *   KHÔNG còn được dùng ở hàm này.
```

Thay chữ ký + tầng 1:

```js
function resolveCopyright(work, cmsCopyrightLookup, publisherRegistry, publisherMaps, basicNotationMap) {
  // Tầng 1: CMS cột コピーライト — ưu tiên cao nhất vì đây là giá trị con người
  // đã trực tiếp xác nhận trong hệ thống CMS cho chính tác phẩm này.
  var cmsValue = cmsCopyrightLookup.get(String(work.cmsId));
  if (cmsValue) return { value: cmsValue, tier: 1 };
```

bằng:

```js
function resolveCopyright(work, publisherRegistry, publisherMaps, basicNotationMap) {
  // Tầng 1: CMS cột コピーライト — ưu tiên cao nhất vì đây là giá trị con người
  // đã trực tiếp xác nhận trong hệ thống CMS cho chính tác phẩm này. Đọc
  // TRỰC TIẾP từ work (buildCustomerWorkRows() đã mang sẵn copyrightU sang),
  // không qua map tra theo cmsId như trước — xem spec §9.1.
  if (work.copyrightU) return { value: work.copyrightU, tier: 1 };
```

- [ ] **Step 4: Chạy test — phải PASS**

Run: `node tools/verify/run.js`
Expected: `29 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
rtk git add src/sources/cmsSource.js src/logic/copyrightResolver.js tools/verify/tests/20-cms.test.js && rtk git commit -m "Key CMS rows off titleName and drop the CMSID copyright self-join"
```

---

### Task 4: `customerWorkMaster.js` — work object mang 3 cột phán định + `judged`/`isNg`

**Files:**
- Modify: `src/logic/customerWorkMaster.js` (viết lại `buildCustomerWorkRows` + JSDoc)
- Create: `tools/verify/tests/30-work-rows.test.js`

**Interfaces:**
- Consumes: `buildRegulationLookup()` (Task 2), `parseCmsRows()` (Task 3), `normalizeJapaneseText()`.
- Produces: `buildCustomerWorkRows(cmsRecords, regulationLookup) -> Array<work>` — **bỏ tham số thứ 3 `ngTitleLookup`**. `work` gồm:
  `{cmsId, titleId, titleName, author, genre, publisher, label, preStart, preEnd, copyrightU, policy, general, logoJudgement, judged, isNg}`
  - `judged` (boolean): tra ra được dòng `判定済み` khớp tên hay không. `false` = 未判定 → sẽ bị lọc (§3.3).
  - `isNg` (boolean): chỉ có nghĩa khi `judged === true`.
  - `policy`/`general`/`logoJudgement`: **nguyên văn từ レギュレーション**; `''` khi 未判定.
  - **Bỏ hẳn** `remark` (§10a — cột `備考` không còn trên ガワ) và `distributionNgFlag` (cột `配信NGフラグ` không tồn tại trên ガワ mới).
- Consumed by: Task 6 (`filterAndMatchWorks`), Task 9 (`main.js`).

**⚠️ Trạng thái repo giữa Task 2 và Task 9:** sau Task 2 thì `customerWorkMaster.js` còn gọi `lookupRegulation()` đã bị xoá; sau Task 4 thì `main.js` còn gọi `buildCustomerWorkRows()` với 3 tham số và `resolveCopyright()` với 5 tham số. **Không `clasp push`, không chạy `runGas1()` cho tới hết Task 9.** Harness Node vẫn chạy được bình thường vì nó không nạp `main.js`.

- [ ] **Step 1: Viết test — phải FAIL**

Create `tools/verify/tests/30-work-rows.test.js`:

```js
// tools/verify/tests/30-work-rows.test.js

module.exports = {
  run: function (ctx) {
    var src = ctx.src;
    var check = ctx.check;

    function reg(policy, general, logo) {
      return { policy: policy, general: general, logoJudgement: logo, isNg: src.isRegulationNg({ policy: policy, general: general }) };
    }
    // Khoá của lookup LUÔN là tên đã chuẩn hoá — mô phỏng đúng buildRegulationLookup()
    var lookup = new Map([
      [src.normalizeJapaneseText('落城の美姫～甘い執着～'), reg('問題なし', '一般面OK', 'ロゴなし')],
      [src.normalizeJapaneseText('アダルト作品'), reg('問題なし', 'アダルト作品扱い', 'ロゴあり')],
      [src.normalizeJapaneseText('政策NG作品'), reg('問題あり', '一般面OK', 'ロゴなし')],
    ]);

    var cmsRecords = [
      // CMS ghi bằng WAVE DASH U+301C, レギュレーション ghi FULLWIDTH TILDE U+FF5E
      { cmsId: 1, titleId: 100, titleName: '落城の美姫〜甘い執着〜', author: '作家1', genre: '女性',
        label: 'レーベル1', publisher: '出版社1', preStart: 's1', preEnd: 'e1', copyrightU: '©1' },
      { cmsId: 2, titleId: 200, titleName: 'アダルト作品', author: '作家2', genre: 'TL',
        label: '', publisher: '出版社2', preStart: '', preEnd: '', copyrightU: '' },
      { cmsId: 3, titleId: 300, titleName: '政策NG作品', author: '作家3', genre: 'BL',
        label: '', publisher: '出版社3', preStart: '', preEnd: '', copyrightU: '' },
      { cmsId: 4, titleId: 400, titleName: 'レギュレーションに無い作品', author: '作家4', genre: '女性',
        label: '', publisher: '出版社4', preStart: '', preEnd: '', copyrightU: '' },
    ];

    var works = src.buildCustomerWorkRows(cmsRecords, lookup);

    check('buildCustomerWorkRows giu nguyen so luong va thu tu CMS', works.length, 4);
    check('khop duoc qua NFKC va lay nguyen van 3 cot tu レギュレーション',
      [works[0].judged, works[0].isNg, works[0].policy, works[0].general, works[0].logoJudgement],
      [true, false, '問題なし', '一般面OK', 'ロゴなし']);
    check('cot E タイトル名 giu nguyen cach viet cua CMS (U+301C), KHONG lay khoa da chuan hoa',
      works[0].titleName, '落城の美姫〜甘い執着〜');
    check('isNg=true khi ②=アダルト作品扱い', [works[1].judged, works[1].isNg], [true, true]);
    check('isNg=true khi ①=問題あり', [works[2].judged, works[2].isNg], [true, true]);
    check('未判定: judged=false, 3 cot rong, isNg=false',
      [works[3].judged, works[3].isNg, works[3].policy, works[3].general, works[3].logoJudgement],
      [false, false, '', '', '']);
    check('work mang label va copyrightU sang (cho cot O va cho tang 1 ban quyen)',
      [works[0].label, works[0].copyrightU], ['レーベル1', '©1']);
    check('work KHONG con field remark/distributionNgFlag',
      [works[0].remark === undefined, works[0].distributionNgFlag === undefined], [true, true]);
  },
};
```

Run: `node tools/verify/run.js`
Expected: FAIL — `lookupRegulation is not defined` (hàm đã bị xoá ở Task 2) hoặc `works[0].judged` = `undefined`.

- [ ] **Step 2: Viết lại `src/logic/customerWorkMaster.js`**

Thay **toàn bộ** nội dung file bằng:

```js
// logic/customerWorkMaster.js — build dòng dữ liệu cho 顧客作品マスタ
//
// Đây là hàm PURE (không đụng SpreadsheetApp) — nhận vào dữ liệu đã parse
// sẵn từ 2 nguồn (sources/*.js) và tạo ra 1 "work object" cho mỗi tác phẩm CMS.
//
// LƯU Ý: hàm này KHÔNG lọc. Nó gắn nhãn (judged/isNg) cho MỌI tác phẩm CMS,
// việc lọc do filterAndMatchWorks() (logic/regulationFilter.js) làm ở bước sau
// — vì quyết định lọc còn phụ thuộc "tác phẩm này đã có trên master chưa"
// (rule 2, spec §3.4), thứ mà file này không biết.

/**
 * Build mảng "work" (1 phần tử = 1 tác phẩm CMS) bằng cách lấy CMS làm nền
 * tảng rồi join thêm phán định レギュレーション theo タイトル名.
 *
 * - cmsRecords quyết định DANH SÁCH tác phẩm nào tồn tại.
 * - regulationLookup cấp 3 cột ①広告出稿ポリシー / ②一般面出稿NG /
 *   ③シーモアロゴ判定 + cờ isNg, tra theo `normalizeJapaneseText(タイトル名)`,
 *   so 完全一致 (spec §4.1). KHÔNG còn tra theo CMSID/タイトルID.
 *
 * CHUẨN HOÁ CHỈ ĐỂ SO KHỚP (spec §4.4): khoá tra cứu là tên đã chuẩn hoá,
 * nhưng `titleName` trả về là NGUYÊN VĂN CỦA CMS, và policy/general/
 * logoJudgement là NGUYÊN VĂN CỦA レギュレーション. Hệ quả cần biết: cột
 * タイトル名 trên master theo cách viết của CMS, nên đối chiếu mắt thường giữa
 * master và レギュレーション vẫn sẽ thấy chênh nhau ở vài ký tự vô hình
 * (〜 vs ～, ngoặc nửa/toàn rộng) — đó là đúng thiết kế, không phải lỗi.
 *
 * 2 CỜ QUYẾT ĐỊNH SỐ PHẬN CỦA TÁC PHẨM (spec §3.3):
 *   judged=false (未判定) -> chưa ai chấm xong, phải CHỜ, không được vào master
 *   judged=true && isNg   -> đã chấm và bị chặn, không được vào master
 *   judged=true && !isNg  -> được vào master
 * Riêng tác phẩm ĐÃ CÓ trên master thì được giữ lại bất kể 2 cờ này (rule 2) —
 * xem logic/regulationFilter.js.
 *
 * KHÔNG gán copyright/copyrightTier/titleNo ở đây — main.js gắn thêm sau
 * (xem runGas1()).
 *
 * @param {Array<object>} cmsRecords - Kết quả cmsSource.parseCmsRows()
 * @param {Map<string, {policy: string, general: string, logoJudgement: string, isNg: boolean}>} regulationLookup
 *   Kết quả regulationSource.buildRegulationLookup()
 * @returns {Array<{
 *   cmsId: *, titleId: *, titleName: string, author: string, genre: string,
 *   publisher: string, label: string, preStart: *, preEnd: *, copyrightU: *,
 *   policy: string, general: string, logoJudgement: string,
 *   judged: boolean, isNg: boolean
 * }>} Thứ tự giữ nguyên theo cmsRecords đầu vào (quan trọng: thứ tự này quyết
 *   định thứ tự cấp タイトルNo cho tác phẩm mới).
 */
function buildCustomerWorkRows(cmsRecords, regulationLookup) {
  return cmsRecords.map(function (cms) {
    var regulation = regulationLookup.get(normalizeJapaneseText(cms.titleName));
    var judged = regulation !== undefined;
    return {
      cmsId: cms.cmsId,
      titleId: cms.titleId,
      titleName: cms.titleName,
      author: cms.author,
      genre: cms.genre,
      publisher: cms.publisher,
      label: cms.label,
      preStart: cms.preStart,
      preEnd: cms.preEnd,
      // copyrightU: tầng 1 của resolveCopyright() đọc trực tiếp field này
      // (spec §9.1) — không còn map tra theo cmsId.
      copyrightU: cms.copyrightU,
      // 3 cột dưới đây là NGUYÊN VĂN của レギュレーション, ghi vào cột F/G/H.
      // Để '' (không phải undefined) khi 未判定, để khớp với giá trị mà Google
      // Sheets trả về khi đọc lại ô trống — nếu để undefined thì sameValue()
      // vẫn coi là bằng nhau, nhưng '' làm ý định rõ ràng hơn ngay tại đây.
      policy: judged ? regulation.policy : '',
      general: judged ? regulation.general : '',
      logoJudgement: judged ? regulation.logoJudgement : '',
      judged: judged,
      isNg: judged ? regulation.isNg : false,
    };
  });
}
```

- [ ] **Step 3: Chạy test — phải PASS**

Run: `node tools/verify/run.js`
Expected: `37 passed, 0 failed`.

- [ ] **Step 4: Commit**

```bash
rtk git add src/logic/customerWorkMaster.js tools/verify/tests/30-work-rows.test.js && rtk git commit -m "Carry the regulation verdict and NG flags onto each work row"
```

---

### Task 5: `upsert.js` — cascade 3 tầng + chiếm-một-lần

Task nặng nhất về logic. Đây là thứ thay thế khoá CMSID: không còn trường nào bất biến, nên phải khớp bằng cascade (§5).

**Files:**
- Modify: `src/logic/upsert.js` (thêm hàm mới vào cuối file, **không sửa** `normalizeJapaneseText`/`normalizeForCompare`/`sameValue`/`diffUpsert`/`resolveNumbers`)
- Create: `tools/verify/tests/40-cascade.test.js`

**Interfaces:**
- Produces: `isDigits(value) -> boolean` — `true` chỉ khi giá trị (sau `String()` + `trim`) gồm toàn chữ số và không rỗng.
- Produces: `sameDateValue(a, b) -> boolean` — nếu ít nhất 1 vế là `Date` hợp lệ thì so theo **năm-tháng-ngày**; ngược lại rơi về `sameValue()`.
- Produces: `buildMasterMatchIndex(existingRecords) -> index` với `index = {records, byIdAndName, byNumericId, byName, claimed}`.
- Produces: `matchExistingRow(index, record) -> {tier, rowOffset, existing, ambiguous, candidateTitleNos} | null` — **không** chiếm dòng (peek).
- Produces: `claimMatch(index, record) -> match | null` — match rồi **chiếm** dòng đó.
- Produces: `collectOrphanOffsets(index) -> Array<number>` — offset các dòng master không record nào chiếm.
- Produces: `resolveNumbersFromMatches(matches, existingRecords, numberField) -> Array<match>` — trả về mảng match mới, `match.record` là **bản copy** đã có `numberField`.
- Produces: `diffUpsertFromMatches(matches, isEqualFn) -> {toUpdate, toAdd, unchangedKeys}`; mỗi item `toUpdate` gồm `{key, record, previous, rowOffset, sheetRow}` — **đã có sẵn vị trí dòng**, không cần `attachRowOffsets()`.
- Consumed by: Task 6 (`filterAndMatchWorks`), Task 7 (`sheetIO` dùng `sheetRow`), Task 8/Task 9 (cảnh báo dùng `tier`/`ambiguous`/`candidateTitleNos`/orphan).

**Vì sao tầng 2 bắt buộc điều kiện "cả hai bên đều là số thật" (§5.2):** không có điều kiện đó thì mọi dòng `タイトルID` trống khớp lẫn nhau ở tầng 2 (khoá rỗng = khoá rỗng), và 3 dòng cùng ghi `4415行目と同一` cũng khớp nhau.

**Vì sao cần chiếm-một-lần (§5.3):** có thật 2 tác phẩm CMS khác nhau dùng chung `タイトルID` 266030 (`冬すぎて桜` và `冬すぎて桜【タテヨミ】`). Không có ràng buộc này thì cả 2 ghi vào cùng 1 dòng ở tầng 2 và **một record mất im lặng**.

- [ ] **Step 1: Viết test — phải FAIL**

Create `tools/verify/tests/40-cascade.test.js`:

```js
// tools/verify/tests/40-cascade.test.js

module.exports = {
  run: function (ctx) {
    var src = ctx.src;
    var check = ctx.check;

    /** 1 dòng master đang có trên sheet. sheetRow = số dòng thật (header ở hàng 15). */
    function existing(titleNo, titleId, titleName) {
      return { titleNo: titleNo, titleId: titleId, titleName: titleName, sheetRow: 15 + titleNo };
    }
    function work(titleId, titleName) {
      return { titleId: titleId, titleName: titleName };
    }

    // ---- isDigits ----
    check('isDigits', [src.isDigits(347590), src.isDigits('347590'), src.isDigits(''), src.isDigits('ー'),
      src.isDigits('4415行目と同一'), src.isDigits('※既に配信済みのためCMS削除'), src.isDigits(null), src.isDigits(' 12 ')],
      [true, true, false, false, false, false, false, true]);

    // ---- sameDateValue ----
    check('sameDateValue: cung ngay khac gio -> bang nhau',
      src.sameDateValue(new Date(2026, 2, 27, 0, 0), new Date(2026, 2, 27, 9, 0)), true);
    check('sameDateValue: khac ngay -> khac',
      src.sameDateValue(new Date(2026, 2, 27), new Date(2026, 2, 28)), false);
    check('sameDateValue: Date vs chuoi 未定 -> khac',
      src.sameDateValue(new Date(2026, 2, 27), '未定'), false);
    check('sameDateValue: 2 ve khong phai Date -> roi ve sameValue',
      [src.sameDateValue('未定', '未定'), src.sameDateValue(undefined, ''), src.sameDateValue('a', 'b')],
      [true, true, false]);

    // ---- Tầng 1: ID và tên đều khớp ----
    var rows1 = [existing(1, 347590, 'A作品'), existing(2, 347591, 'B作品')];
    var idx1 = src.buildMasterMatchIndex(rows1);
    var m1 = src.matchExistingRow(idx1, work(347590, 'A作品'));
    check('tang 1: ID + ten deu khop', [m1.tier, m1.rowOffset, m1.ambiguous], [1, 0, false]);

    // Tầng 1 vẫn bắt được khi CẢ HAI bên đều có titleId trống
    var rowsEmpty = [existing(1, '', 'A作品')];
    var mEmpty = src.matchExistingRow(src.buildMasterMatchIndex(rowsEmpty), work('', 'A作品'));
    check('tang 1: ca 2 ben titleId trong van khop duoc', [mEmpty.tier, mEmpty.rowOffset], [1, 0]);

    // ---- Tầng 2: đổi tên (bỏ dấu 仮), ID số giữ nguyên ----
    var rows2 = [existing(1072, 266030, '恋人(仮)は妄想より奇なり')];
    var m2 = src.matchExistingRow(src.buildMasterMatchIndex(rows2), work(266030, '恋人は妄想より奇なり'));
    check('tang 2: doi ten, titleID so giu nguyen', [m2.tier, m2.rowOffset], [2, 0]);

    // Tầng 2 KHÔNG được khớp khi 1 trong 2 vế không phải số thật
    var rowsNonNumeric = [existing(1, 'ー', 'A作品'), existing(2, '4415行目と同一', 'B作品'), existing(3, '', 'C作品')];
    var idxNon = src.buildMasterMatchIndex(rowsNonNumeric);
    check('tang 2 KHONG khop khi master ghi placeholder (khac ten -> khong khop tang nao)',
      src.matchExistingRow(idxNon, work('ー', 'ten hoan toan khac')), null);
    check('tang 2 KHONG gop 2 dong cung ghi 4415行目と同一',
      src.matchExistingRow(idxNon, work('4415行目と同一', 'ten khac')), null);

    // ---- Tầng 3: titleId từ trống/chữ thành số ----
    var rows3 = [existing(870, 'ー', 'D作品'), existing(1116, '※既に配信済みのためCMS削除', 'E作品')];
    var idx3 = src.buildMasterMatchIndex(rows3);
    var m3a = src.claimMatch(idx3, work('900001', 'D作品'));
    var m3b = src.claimMatch(idx3, work('900004', 'E作品'));
    check('tang 3: titleID tu ー thanh so', [m3a.tier, m3a.existing.titleNo], [3, 870]);
    check('tang 3: titleID tu ghi chu thanh so', [m3b.tier, m3b.existing.titleNo], [3, 1116]);
    check('sau khi claim het thi khong con dong mo coi', src.collectOrphanOffsets(idx3), []);

    // ---- Chiếm-một-lần: 2 tác phẩm dùng chung 1 titleID số (case 冬すぎて桜) ----
    var rowsShared = [existing(1, 266030, '冬すぎて桜'), existing(2, 266030, '冬すぎて桜【タテヨミ】')];
    var idxShared = src.buildMasterMatchIndex(rowsShared);
    var s1 = src.claimMatch(idxShared, work(266030, '冬すぎて桜'));
    var s2 = src.claimMatch(idxShared, work(266030, '冬すぎて桜【タテヨミ】'));
    check('2 record chung titleID nhung khac ten -> tang 1 tach ra 2 dong khac nhau',
      [s1.tier, s1.rowOffset, s2.tier, s2.rowOffset], [1, 0, 1, 1]);

    // Cùng titleID số, tên đổi cả 2 -> tầng 2, nhưng KHÔNG được chiếm cùng 1 dòng
    var idxShared2 = src.buildMasterMatchIndex(rowsShared);
    var t1 = src.claimMatch(idxShared2, work(266030, 'ten moi 1'));
    var t2 = src.claimMatch(idxShared2, work(266030, 'ten moi 2'));
    check('chiem-mot-lan: 2 record cung titleID so khong duoc chiem cung 1 dong',
      [t1.rowOffset, t2.rowOffset].sort(), [0, 1]);
    check('canh bao 照合曖昧: co >1 ung vien chua bi chiem o tang thang',
      [t1.ambiguous, t1.candidateTitleNos, t2.ambiguous], [true, [1, 2], false]);
    check('chon deterministic: dong co タイトルNo nho nhat', t1.existing.titleNo, 1);

    // ---- Orphan ----
    var idxOrphan = src.buildMasterMatchIndex([existing(1, 1, 'A'), existing(2, 2, 'B'), existing(3, 3, 'C')]);
    src.claimMatch(idxOrphan, work(2, 'B'));
    check('collectOrphanOffsets tra ve dong khong ai chiem', src.collectOrphanOffsets(idxOrphan), [0, 2]);

    // ---- resolveNumbersFromMatches ----
    var existingRows = [existing(5, 500, 'A'), existing(9, 900, 'B')];
    var idxNum = src.buildMasterMatchIndex(existingRows);
    var matches = [work(500, 'A'), work(700, 'C moi'), work(900, 'B')].map(function (w) {
      var m = src.claimMatch(idxNum, w);
      return { record: w, existing: m ? m.existing : null, rowOffset: m ? m.rowOffset : null, tier: m ? m.tier : 0 };
    });
    var numbered = src.resolveNumbersFromMatches(matches, existingRows, 'titleNo');
    check('resolveNumbersFromMatches: dung lai so cu, so moi tiep sau max',
      numbered.map(function (m) { return m.record.titleNo; }), [5, 10, 9]);
    check('resolveNumbersFromMatches KHONG sua record goc (tra ban copy)',
      matches[1].record.titleNo === undefined, true);

    // ---- diffUpsertFromMatches ----
    var isEqualFn = function (a, b) { return src.sameValue(a.titleName, b.titleName); };
    var diff = src.diffUpsertFromMatches(numbered, isEqualFn);
    check('diffUpsertFromMatches: 1 them moi, 0 update, 2 khong doi',
      [diff.toAdd.length, diff.toUpdate.length, diff.unchangedKeys.length], [1, 0, 2]);
    check('toAdd la record da co titleNo', diff.toAdd[0].titleNo, 10);

    var diff2 = src.diffUpsertFromMatches(
      [{ record: { titleNo: 5, titleName: 'A doi ten' }, existing: existingRows[0], rowOffset: 0, tier: 2 }],
      isEqualFn);
    check('toUpdate mang san sheetRow + previous, khong can attachRowOffsets',
      [diff2.toUpdate[0].sheetRow, diff2.toUpdate[0].previous.titleName, diff2.toUpdate[0].rowOffset],
      [20, 'A', 0]);
  },
};
```

Run: `node tools/verify/run.js`
Expected: FAIL với `src.isDigits is not a function` và loạt lỗi tương tự.

- [ ] **Step 2: Thêm khối cascade vào cuối `src/logic/upsert.js`**

Thêm vào **cuối file** (giữ nguyên toàn bộ phần trên):

```js
// ============================================================
// KHỚP DÒNG MASTER THEO CASCADE 3 TẦNG (spec §5)
//
// Bối cảnh: khoá upsert của 顧客作品マスタ trước đây là CMSID. Từ 2026-08-03,
// CMSID bị loại khỏi mọi logic (vẫn ghi ra cột C để tra ngược) — và khi đó
// KHÔNG CÒN TRƯỜNG NÀO BẤT BIẾN. Đo trên 1.730 dòng thật vào master:
//
//   Chỉ タイトルID          : phân biệt 1.625/1.730, 108 dòng (6,2%) SẼ ĐỔI GIÁ TRỊ
//   Chỉ タイトル名          : phân biệt 1.727/1.730, 2 dòng (0,1%) sẽ đổi
//   Ghép ID + tên làm 1 khoá: phân biệt 1.729/1.730 nhưng 110 dòng đổi khoá
//
// "Đổi giá trị khoá" = sinh dòng trùng, vì GAS quét MỖI NGÀY nên '' -> 347590
// là một thay đổi thật sẽ xảy ra. Cascade giải quyết bằng cách thử 3 tầng theo
// thứ tự và DỪNG ở tầng đầu tiên có kết quả:
//
//   Tầng 1: normalize(タイトルID) VÀ normalize(タイトル名) đều khớp  -> bình thường
//   Tầng 2: タイトルID khớp VÀ cả hai bên đều là SỐ THẬT            -> bắt ca đổi TÊN
//   Tầng 3: タイトル名 khớp                                        -> bắt ca ID trống/chữ -> số
//
// Mô phỏng 4 lần chạy liên tiếp trên dữ liệu thật (spec §5.4): lần 2 và lần 4
// ra 0 thêm mới / 0 update, tức cascade ổn định, không sinh dòng trùng.
// ============================================================

/**
 * Giá trị này có phải "số thật" hay không — dùng cho điều kiện tầng 2 của
 * cascade.
 *
 * BẮT BUỘC phải có điều kiện này (spec §5.2): nếu tầng 2 chỉ so
 * normalize(タイトルID) thì mọi dòng có タイトルID trống sẽ khớp lẫn nhau (khoá
 * rỗng = khoá rỗng), và 3 dòng thật cùng ghi '4415行目と同一' trong ô ID cũng
 * khớp nhau — tức 2 tác phẩm khác nhau ghi đè lên cùng 1 dòng master.
 *
 * Chấp nhận cả number lẫn string: Google Sheets trả về number cho ô ID, còn
 * fixtures/export có thể trả về string — cả 2 đều phải cho ra cùng kết quả.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isDigits(value) {
  var text = String(value === null || value === undefined ? '' : value).trim();
  if (text === '') return false;
  return /^[0-9]+$/.test(text);
}

/**
 * Khoá ngày (năm-tháng-ngày) của 1 giá trị, hoặc null nếu không phải Date hợp lệ.
 *
 * @param {*} value
 * @returns {string|null}
 */
function toDateKey(value) {
  if (!(value instanceof Date)) return null;
  var time = value.getTime();
  if (isNaN(time)) return null;
  return value.getFullYear() + '-' + (value.getMonth() + 1) + '-' + value.getDate();
}

/**
 * So sánh 2 giá trị có thể là NGÀY — dùng cho 先行開始日/先行終了日 trong
 * isEqualFn của 顧客作品マスタ.
 *
 * TẠI SAO KHÔNG dùng sameValue() cho field ngày: sameValue() ép String(), và
 * String(Date) sinh ra chuỗi có cả giờ + timezone ('Fri Mar 27 2026 00:00:00
 * GMT+0900'). Hai spreadsheet có timezone khác nhau (hoặc script timezone khác
 * spreadsheet timezone) sẽ cho ra 2 instant lệch nhau vài giờ cho CÙNG một
 * ngày lịch — và vì GAS chạy mỗi ngày, chênh lệch đó thành churn VĨNH VIỄN:
 * mỗi lần chạy đều thấy "đã đổi", ghi lại toàn bộ sheet, và log 変更詳細 đầy
 * dòng vô nghĩa. So theo năm-tháng-ngày loại bỏ hẳn class lỗi đó.
 *
 * Nếu chỉ 1 vế là Date (vd master có ngày, CMS ghi '未定'), coi là ĐÃ ĐỔI —
 * đúng, vì đó là thay đổi thật cần được ghi lại.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function sameDateValue(a, b) {
  var keyA = toDateKey(a);
  var keyB = toDateKey(b);
  if (keyA !== null || keyB !== null) return keyA === keyB;
  return sameValue(a, b);
}

/**
 * Khoá tầng 1: ID + tên, ngăn cách bằng ký tự NUL (U+0000).
 *
 * Dùng NUL chứ không dùng '|' hay khoảng trắng: ô タイトルID thật có chứa cả
 * câu ('4415行目と同一', '※既に配信済みのためCMS削除'), nên mọi ký tự "bình
 * thường" đều có thể xuất hiện trong dữ liệu và làm khoá nhập nhằng
 * (titleId='1 2' + name='x' so với titleId='1' + name='2 x').
 */
function masterMatchKeyBoth(record) {
  return normalizeJapaneseText(record.titleId) + '\u0000' + normalizeJapaneseText(record.titleName);
}

/** Khoá tầng 2: chỉ ID. */
function masterMatchKeyId(record) {
  return normalizeJapaneseText(record.titleId);
}

/** Khoá tầng 3: chỉ tên. */
function masterMatchKeyName(record) {
  return normalizeJapaneseText(record.titleName);
}

function pushMatchCandidate(map, key, offset) {
  if (key === '') return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(offset);
}

/**
 * Build index tra cứu cho cascade, từ danh sách dòng ĐANG CÓ trên
 * 顧客作品マスタ (kết quả readCustomerWorkMaster()).
 *
 * Mỗi khoá trỏ tới MỘT MẢNG offset (không phải 1 offset duy nhất) — bắt buộc,
 * vì dữ liệu thật có 4 dòng nguy hiểm (3 dòng trùng タイトル名 với dòng khác,
 * 1 dòng trùng タイトルID số, spec §6). Nếu map chỉ giữ 1 offset thì dòng ghi
 * sau âm thầm che dòng ghi trước và không có cách nào phát cảnh báo 照合曖昧.
 *
 * `claimed` là trạng thái MUTABLE dùng chung cho cả lần chạy: mỗi dòng master
 * chỉ được 1 record chiếm (spec §5.3). Vì vậy index này KHÔNG dùng lại được
 * cho lần match thứ hai — muốn match lại từ đầu thì build index mới.
 *
 * Dòng master không có タイトル名 bị bỏ qua hoàn toàn (không là ứng viên của
 * tầng nào) — trên dữ liệu thật không có dòng nào như vậy, nhưng nếu có thì
 * đó là dòng rác và không nên được record nào khớp vào.
 *
 * @param {Array<object>} existingRecords - Mỗi phần tử cần có titleNo/titleId/titleName
 * @returns {{
 *   records: Array<object>,
 *   byIdAndName: Map<string, Array<number>>,
 *   byNumericId: Map<string, Array<number>>,
 *   byName: Map<string, Array<number>>,
 *   claimed: Object<number, boolean>
 * }}
 */
function buildMasterMatchIndex(existingRecords) {
  var index = {
    records: existingRecords,
    byIdAndName: new Map(),
    byNumericId: new Map(),
    byName: new Map(),
    claimed: {},
  };
  existingRecords.forEach(function (record, offset) {
    var nameKey = masterMatchKeyName(record);
    if (nameKey === '') return;
    pushMatchCandidate(index.byIdAndName, masterMatchKeyBoth(record), offset);
    if (isDigits(record.titleId)) pushMatchCandidate(index.byNumericId, masterMatchKeyId(record), offset);
    pushMatchCandidate(index.byName, nameKey, offset);
  });
  return index;
}

/**
 * Chọn 1 ứng viên trong danh sách offset của 1 tầng, bỏ qua dòng đã bị chiếm.
 *
 * Chọn DETERMINISTIC (dòng có タイトルNo nhỏ nhất) thay vì "dòng đầu tiên trong
 * mảng": thứ tự mảng phụ thuộc thứ tự đọc sheet, còn タイトルNo là thứ tự cấp
 * số ổn định — nhờ vậy 2 lần chạy trên cùng dữ liệu luôn cho cùng kết quả, kể
 * cả khi có dòng nhập nhằng.
 *
 * @param {object} index - Từ buildMasterMatchIndex()
 * @param {Array<number>|undefined} offsets
 * @returns {{rowOffset: number, ambiguous: boolean, candidateTitleNos: Array<*>}|null}
 */
function pickMatchCandidate(index, offsets) {
  if (!offsets) return null;
  var available = offsets.filter(function (offset) { return !index.claimed[offset]; });
  if (available.length === 0) return null;
  var chosen = available[0];
  available.forEach(function (offset) {
    if ((Number(index.records[offset].titleNo) || 0) < (Number(index.records[chosen].titleNo) || 0)) chosen = offset;
  });
  return {
    rowOffset: chosen,
    ambiguous: available.length > 1,
    candidateTitleNos: available.map(function (offset) { return index.records[offset].titleNo; }),
  };
}

/**
 * Tìm dòng master ứng với 1 record, theo cascade 3 tầng, DỪNG NGAY ở tầng đầu
 * tiên có ứng viên chưa bị chiếm. KHÔNG chiếm dòng (peek) — dùng claimMatch()
 * nếu muốn chiếm.
 *
 * @param {object} index - Từ buildMasterMatchIndex()
 * @param {{titleId: *, titleName: *}} record
 * @returns {{tier: 1|2|3, rowOffset: number, existing: object, ambiguous: boolean, candidateTitleNos: Array<*>}|null}
 */
function matchExistingRow(index, record) {
  var tiers = [
    { tier: 1, offsets: index.byIdAndName.get(masterMatchKeyBoth(record)) },
    // Tầng 2 CHỈ áp dụng khi CẢ HAI bên là số thật — vế master đã được lọc lúc
    // build index (chỉ dòng isDigits mới vào byNumericId), vế record lọc ở đây.
    { tier: 2, offsets: isDigits(record.titleId) ? index.byNumericId.get(masterMatchKeyId(record)) : null },
    { tier: 3, offsets: index.byName.get(masterMatchKeyName(record)) },
  ];
  for (var i = 0; i < tiers.length; i++) {
    var picked = pickMatchCandidate(index, tiers[i].offsets);
    if (picked === null) continue;
    return {
      tier: tiers[i].tier,
      rowOffset: picked.rowOffset,
      existing: index.records[picked.rowOffset],
      ambiguous: picked.ambiguous,
      candidateTitleNos: picked.candidateTitleNos,
    };
  }
  return null;
}

/**
 * matchExistingRow() + chiếm dòng đã khớp, để record sau không khớp vào cùng
 * dòng đó (spec §5.3).
 *
 * @param {object} index
 * @param {object} record
 * @returns {object|null} Cùng dạng trả về của matchExistingRow()
 */
function claimMatch(index, record) {
  var match = matchExistingRow(index, record);
  if (match !== null) index.claimed[match.rowOffset] = true;
  return match;
}

/**
 * Danh sách offset các dòng master mà KHÔNG record nào chiếm trong lần chạy này
 * — cảnh báo 孤立行 (spec §6). Nguyên nhân thường gặp: tác phẩm đổi tên (dòng
 * cũ mồ côi, dòng mới được thêm), hoặc tác phẩm bị rút khỏi 先行タイトル của CMS.
 * GAS❶ KHÔNG xoá dòng nào (`削除等はしない`) nên chỉ báo, không hành động.
 *
 * @param {object} index - Sau khi đã claimMatch() cho toàn bộ record
 * @returns {Array<number>} offset (0-based trong existingRecords)
 */
function collectOrphanOffsets(index) {
  var orphans = [];
  index.records.forEach(function (record, offset) {
    if (!index.claimed[offset]) orphans.push(offset);
  });
  return orphans;
}

/**
 * Bản theo-match của resolveNumbers(): gán タイトルNo cho từng match, dùng lại
 * số cũ nếu đã khớp dòng master, cấp số mới (tiếp sau max hiện có) nếu là dòng
 * mới.
 *
 * Khác resolveNumbers() cũ ở chỗ KHÔNG cần keyFn — quan hệ record <-> dòng
 * master đã được cascade quyết định xong ở bước trước, hàm này chỉ đọc lại
 * match.existing.
 *
 * Dòng master đã khớp nhưng có タイトルNo trống/0 sẽ được cấp số MỚI — đó là
 * dòng dữ liệu lỗi (mọi dòng do GAS ghi đều có số), cấp số là hành động sửa
 * chữa hợp lý nhất mà không phải xoá gì.
 *
 * @param {Array<{record: object, existing: object|null}>} matches
 * @param {Array<object>} existingRecords - Để tính max số hiện có
 * @param {string} numberField - vd 'titleNo'
 * @returns {Array<object>} Mảng match MỚI, match.record là bản copy đã có numberField
 */
function resolveNumbersFromMatches(matches, existingRecords, numberField) {
  var maxNumber = 0;
  existingRecords.forEach(function (record) {
    var num = Number(record[numberField]) || 0;
    if (num > maxNumber) maxNumber = num;
  });

  var nextNumber = maxNumber;
  return matches.map(function (match) {
    var copy = Object.assign({}, match.record);
    var reused = match.existing ? Number(match.existing[numberField]) || 0 : 0;
    if (reused > 0) {
      copy[numberField] = reused;
    } else {
      nextNumber += 1;
      copy[numberField] = nextNumber;
    }
    return Object.assign({}, match, { record: copy });
  });
}

/**
 * Bản theo-match của diffUpsert(): phân loại thêm mới / cần update / không đổi.
 *
 * Khác diffUpsert() cũ ở 2 điểm:
 *   1. Không dùng keyFn — quan hệ với dòng cũ lấy từ match.existing.
 *   2. Item toUpdate mang sẵn rowOffset + sheetRow, nên KHÔNG cần
 *      attachRowOffsets() nữa (main.js không phải tra ngược khoá -> vị trí).
 *
 * `sheetRow` (số dòng thật 1-based trên sheet) do readCustomerWorkMaster() gắn
 * vào existing record. Dùng nó thay vì tính rowOffset + 2 như code cũ, vì công
 * thức đó ngầm giả định header ở hàng 1 và không có dòng trống xen giữa — cả
 * 2 giả định đều sai với ガワ mới (header hàng 15).
 *
 * @param {Array<{record: object, existing: object|null, rowOffset: number|null}>} matches
 *   PHẢI đã đi qua resolveNumbersFromMatches() (record cần có titleNo)
 * @param {function(object, object): boolean} isEqualFn - (existing, incoming) -> true nếu coi là không đổi
 * @returns {{
 *   toUpdate: Array<{key: string, record: object, previous: object, rowOffset: number, sheetRow: number}>,
 *   toAdd: Array<object>,
 *   unchangedKeys: Array<string>
 * }}
 */
function diffUpsertFromMatches(matches, isEqualFn) {
  var toUpdate = [];
  var toAdd = [];
  var unchangedKeys = [];

  matches.forEach(function (match) {
    var key = String(match.record.titleNo);
    if (!match.existing) {
      toAdd.push(match.record);
      return;
    }
    if (isEqualFn(match.existing, match.record)) {
      unchangedKeys.push(key);
      return;
    }
    toUpdate.push({
      key: key,
      record: match.record,
      previous: match.existing,
      rowOffset: match.rowOffset,
      sheetRow: match.existing.sheetRow,
    });
  });

  return { toUpdate: toUpdate, toAdd: toAdd, unchangedKeys: unchangedKeys };
}
```

- [ ] **Step 3: Chạy test — phải PASS**

Run: `node tools/verify/run.js`
Expected: `59 passed, 0 failed`.

- [ ] **Step 4: Commit**

```bash
rtk git add src/logic/upsert.js tools/verify/tests/40-cascade.test.js && rtk git commit -m "Add the 3-tier cascade matcher with claim-once for the customer master"
```

---

### Task 6: `regulationFilter.js` — lọc + match một lượt, và đối chiếu lại số liệu spec §12

Task này là chỗ toàn bộ thiết kế được kiểm chứng lại bằng dữ liệu thật.

**Files:**
- Create: `src/logic/regulationFilter.js`
- Create: `tools/verify/tests/50-filter.test.js`
- Create: `tools/verify/tests/60-dataset.test.js` (`needsData: true`)

**Interfaces:**
- Consumes: `buildMasterMatchIndex`/`claimMatch`/`collectOrphanOffsets` (Task 5), work object (Task 4).
- Produces: `isWorkEligible(work) -> boolean` — `work.judged === true && work.isNg !== true`.
- Produces: `filterAndMatchWorks(works, existingRecords) -> {matches, orphanOffsets, excludedNg, excludedUnjudged}`
  - `matches`: **theo đúng thứ tự CMS**, mỗi phần tử `{record, existing, rowOffset, tier, ambiguous, candidateTitleNos}`; `existing === null` = dòng mới. Đây là **danh sách tác phẩm được vào master** — đồng thời là đầu vào của `resolveNumbersFromMatches()`.
  - `excludedNg` / `excludedUnjudged`: mảng work bị loại (để đếm + để ghi log §6).
  - `orphanOffsets`: offset dòng master không ai chiếm (cảnh báo 孤立行).
- Consumed by: Task 8 (cảnh báo), Task 9 (`main.js`).

- [ ] **Step 1: Viết test đơn vị — phải FAIL**

Create `tools/verify/tests/50-filter.test.js`:

```js
// tools/verify/tests/50-filter.test.js

module.exports = {
  run: function (ctx) {
    var src = ctx.src;
    var check = ctx.check;

    function work(titleId, titleName, judged, isNg) {
      return { titleId: titleId, titleName: titleName, judged: judged, isNg: isNg };
    }
    function existing(titleNo, titleId, titleName) {
      return { titleNo: titleNo, titleId: titleId, titleName: titleName, sheetRow: 15 + titleNo };
    }

    check('isWorkEligible', [
      src.isWorkEligible(work(1, 'A', true, false)),
      src.isWorkEligible(work(1, 'A', true, true)),
      src.isWorkEligible(work(1, 'A', false, false)),
    ], [true, false, false]);

    // ---- Master rỗng (lần chạy đầu, spec §10b): rule 2 không bảo vệ ai ----
    var first = src.filterAndMatchWorks([
      work(100, 'OK作品', true, false),
      work(200, 'NG作品', true, true),
      work(300, '未判定作品', false, false),
    ], []);
    check('master rong: chi tac pham hop le duoc vao',
      first.matches.map(function (m) { return m.record.titleName; }), ['OK作品']);
    check('master rong: dong moi co existing=null, tier=0',
      [first.matches[0].existing, first.matches[0].tier], [null, 0]);
    check('master rong: NG bi loai', first.excludedNg.map(function (w) { return w.titleName; }), ['NG作品']);
    check('master rong: 未判定 bi loai', first.excludedUnjudged.map(function (w) { return w.titleName; }), ['未判定作品']);
    check('master rong: khong co dong mo coi', first.orphanOffsets, []);

    // ---- Rule 2 (spec §3.4): tác phẩm ĐÃ CÓ trên master thì giữ lại ----
    var second = src.filterAndMatchWorks([
      work(100, 'OK作品', true, false),
      work(200, 'NG作品', true, true),
      work(300, '未判定作品', false, false),
      work(400, 'NG作品 chua co', true, true),
    ], [existing(1, 100, 'OK作品'), existing(2, 200, 'NG作品'), existing(3, 300, '未判定作品')]);
    check('rule 2: NG + 未判定 da co tren master thi GIU LAI',
      second.matches.map(function (m) { return m.record.titleName; }),
      ['OK作品', 'NG作品', '未判定作品']);
    check('rule 2: NG chua co tren master thi van bi loai',
      second.excludedNg.map(function (w) { return w.titleName; }), ['NG作品 chua co']);
    check('rule 2: 3 dong deu khop tang 1',
      second.matches.map(function (m) { return m.tier; }), [1, 1, 1]);
    check('rule 2: khong con dong mo coi', second.orphanOffsets, []);

    // ---- Ưu tiên 2 phase: tác phẩm hợp lệ chiếm dòng TRƯỚC tác phẩm NG ----
    // NG作品 đứng TRƯỚC trong danh sách CMS và cũng khớp được dòng titleNo=1
    // (tầng 2: cùng titleID số 100). Nếu match theo đúng thứ tự CMS thì nó
    // chiếm mất dòng của tác phẩm hợp lệ, và tác phẩm hợp lệ bị append thành
    // dòng MỚI -> trùng dòng. Phase A phải chặn đúng ca này.
    var priority = src.filterAndMatchWorks([
      work(100, 'ten da doi', true, true),
      work(100, 'A作品', true, false),
    ], [existing(1, 100, 'A作品')]);
    check('phase A: tac pham hop le chiem dong truoc, NG bi day ra',
      [priority.matches.length, priority.matches[0].record.titleName, priority.matches[0].tier,
        priority.excludedNg.length],
      [1, 'A作品', 1, 1]);

    // ---- 孤立行: dòng master không ai chiếm ----
    var orphan = src.filterAndMatchWorks(
      [work(100, 'A作品', true, false)],
      [existing(1, 100, 'A作品'), existing(2, 200, 'Bi go khoi CMS')]);
    check('孤立行: dong master khong record nao chiem', orphan.orphanOffsets, [1]);
    check('孤立行 KHONG bi xoa (chi bao) — matches khong chua no', orphan.matches.length, 1);
  },
};
```

Run: `node tools/verify/run.js`
Expected: FAIL — `src.isWorkEligible is not a function`.

- [ ] **Step 2: Tạo `src/logic/regulationFilter.js`**

```js
// logic/regulationFilter.js — lọc tác phẩm theo phán định レギュレーション VÀ
// gán dòng 顧客作品マスタ tương ứng, trong CÙNG MỘT LƯỢT.
//
// Hàm PURE (không đụng SpreadsheetApp). Đây là chỗ 2 quy tắc nghiệp vụ chính
// của spec gặp nhau:
//
//   Rule 1 (spec §3.3): tác phẩm chỉ được vào master khi tra ra 1 dòng
//     レギュレーション có ステータス=判定済み khớp タイトル名 完全一致, VÀ dòng đó
//     không NG. Tác phẩm 未判定 bị LOẠI — vì ghi chú ô B3 của sheet nguồn nói
//     rõ "それ以外は判定中のためお待ちください" (chưa chấm xong thì CHỜ), tức
//     未判定 KHÔNG đồng nghĩa với "không có vấn đề".
//
//   Rule 2 (spec §3.4): quy tắc lọc CHỈ áp cho tác phẩm CHƯA CÓ trên master.
//     Tác phẩm đã có rồi mà sau đó chuyển NG (hoặc bị rút phán định) thì GIỮ
//     NGUYÊN DÒNG, chỉ cập nhật cột F/G/H — `削除等はしない`.
//
// VÌ SAO LỌC VÀ MATCH PHẢI LÀ MỘT LƯỢT (không phải "lọc xong rồi mới match"
// như thứ tự bước 5 -> 6 trong spec §8): rule 2 cần biết "tác phẩm này đã có
// trên master chưa", mà câu trả lời đó chính là kết quả match. Nếu tách 2 lượt
// thì lượt 1 (chỉ để trả lời có/không) và lượt 2 (để ghi) sẽ chiếm dòng theo
// THỨ TỰ KHÁC NHAU, và một tác phẩm NG có thể chiếm dòng của một tác phẩm hợp
// lệ ở lượt 1 rồi mất dòng đó ở lượt 2 — kết quả là tác phẩm hợp lệ bị append
// thành dòng MỚI, tức trùng dòng: đúng loại sự cố mà cả thiết kế khoá 3 tầng
// này sinh ra để chống.
//
// Giải pháp: 1 index dùng chung, 2 PHASE:
//   Phase A — tác phẩm hợp lệ (判定済み && !NG) chiếm dòng TRƯỚC. Chúng là
//             những tác phẩm chắc chắn sẽ được ghi, nên có quyền ưu tiên.
//   Phase B — tác phẩm NG/未判定 chỉ được giữ nếu còn dòng CHƯA BỊ CHIẾM khớp
//             với nó (rule 2). Không còn -> loại.

/**
 * Tác phẩm này có đủ điều kiện vào 顧客作品マスタ mà không cần tới rule 2 hay không.
 *
 * @param {{judged: boolean, isNg: boolean}} work - 1 phần tử từ buildCustomerWorkRows()
 * @returns {boolean}
 */
function isWorkEligible(work) {
  return work.judged === true && work.isNg !== true;
}

/**
 * Lọc danh sách work theo rule 1 + rule 2, đồng thời gán dòng master tương ứng
 * cho từng work được giữ.
 *
 * @param {Array<object>} works - Kết quả buildCustomerWorkRows() (TOÀN BỘ tác phẩm CMS)
 * @param {Array<object>} existingRecords - Kết quả readCustomerWorkMaster() (dòng đang có trên sheet)
 * @returns {{
 *   matches: Array<{record: object, existing: object|null, rowOffset: number|null,
 *                   tier: 0|1|2|3, ambiguous: boolean, candidateTitleNos: Array<*>}>,
 *   orphanOffsets: Array<number>,
 *   excludedNg: Array<object>,
 *   excludedUnjudged: Array<object>
 * }}
 *   matches: tác phẩm ĐƯỢC vào master, giữ ĐÚNG THỨ TỰ CMS (thứ tự này quyết
 *     định thứ tự cấp タイトルNo cho dòng mới). tier=0 nghĩa là dòng mới hoàn
 *     toàn (không khớp tầng nào).
 *   orphanOffsets: dòng master không record nào chiếm -> cảnh báo 孤立行 (§6).
 *   excludedNg/excludedUnjudged: để đếm 除外_NG件数 / 除外_未判定件数 (§6).
 */
function filterAndMatchWorks(works, existingRecords) {
  var index = buildMasterMatchIndex(existingRecords);
  // Map dùng chính OBJECT work làm khoá (identity) — không dùng titleId/
  // titleName làm khoá vì cả 2 đều có thể trùng giữa các work khác nhau.
  var matchByWork = new Map();
  var excludedNg = [];
  var excludedUnjudged = [];

  // ---- Phase A: tác phẩm hợp lệ chiếm dòng trước ----
  works.forEach(function (work) {
    if (!isWorkEligible(work)) return;
    // Ghi cả khi null: null = "được vào master nhưng là dòng mới".
    matchByWork.set(work, claimMatch(index, work));
  });

  // ---- Phase B: NG/未判定 chỉ giữ được nếu còn dòng chưa bị chiếm (rule 2) ----
  works.forEach(function (work) {
    if (isWorkEligible(work)) return;
    var match = claimMatch(index, work);
    if (match !== null) {
      matchByWork.set(work, match);
      return;
    }
    if (work.isNg) excludedNg.push(work);
    else excludedUnjudged.push(work);
  });

  // ---- Dựng lại theo đúng thứ tự CMS ----
  var matches = [];
  works.forEach(function (work) {
    if (!matchByWork.has(work)) return;
    var match = matchByWork.get(work);
    matches.push({
      record: work,
      existing: match ? match.existing : null,
      rowOffset: match ? match.rowOffset : null,
      tier: match ? match.tier : 0,
      ambiguous: match ? match.ambiguous : false,
      candidateTitleNos: match ? match.candidateTitleNos : [],
    });
  });

  return {
    matches: matches,
    orphanOffsets: collectOrphanOffsets(index),
    excludedNg: excludedNg,
    excludedUnjudged: excludedUnjudged,
  };
}
```

- [ ] **Step 3: Chạy test đơn vị — phải PASS**

Run: `node tools/verify/run.js`
Expected: `70 passed, 0 failed` (và dòng `SKIP 60-dataset.test.js` chưa xuất hiện vì file đó chưa tạo).

- [ ] **Step 4: Viết test đối chiếu dữ liệu thật**

Create `tools/verify/tests/60-dataset.test.js`:

```js
// tools/verify/tests/60-dataset.test.js — đối chiếu lại TỪNG con số trong spec
// §12 và mô phỏng cascade §5.4 trên dữ liệu thật.
//
// Chạy: python tools/verify/exportFixtures.py && node tools/verify/run.js --data
//
// NẾU MỘT CON SỐ KHÔNG KHỚP: đừng sửa expected cho hết đỏ. Hai khả năng:
//   (a) logic sai -> sửa logic;
//   (b) file trong example/ đã được tải lại mới hơn 2026-08-03 -> ghi con số
//       mới + ngày đo vào spec §12 kèm 1 câu giải thích, RỒI mới sửa expected.
// Những con số này là bằng chứng duy nhất cho quyết định "loại 69% tác phẩm
// CMS khỏi master"; đánh mất chúng là đánh mất khả năng phát hiện hồi quy.

module.exports = {
  needsData: true,
  run: function (ctx) {
    var src = ctx.src;
    var check = ctx.check;

    var regulationRows = ctx.fixtures.load('regulation');
    var cmsRows = ctx.fixtures.load('cms');

    // ---- Nguồn レギュレーション (spec §12) ----
    var regulationRecords = src.parseRegulationRows(regulationRows);
    check('レギュレーション: so dong ステータス=判定済み', regulationRecords.length, 5158);
    var lookup = src.buildRegulationLookup(regulationRecords);
    check('レギュレーション: so ten duy nhat trong 判定済み (14 ten trung)', lookup.size, 5144);

    // ---- Nguồn CMS (spec §12) ----
    var cmsRecords = src.parseCmsRows(cmsRows);
    check('CMS: tong so 先行タイトル', cmsRecords.length, 5649);
    check('CMS: 0 dong タイトル名 trong (co so cua viec loc theo ten)',
      cmsRecords.filter(function (r) { return src.normalizeJapaneseText(r.titleName) === ''; }).length, 0);

    // ---- Join + phân loại (spec §12) ----
    var works = src.buildCustomerWorkRows(cmsRecords, lookup);
    var judged = works.filter(function (w) { return w.judged; });
    check('tra ra ten 完全一致', judged.length, 2325);
    check('trong so tra ra: NG', judged.filter(function (w) { return w.isNg; }).length, 595);
    check('trong so tra ra: khong NG -> vao master', judged.filter(function (w) { return !w.isNg; }).length, 1730);
    check('未判定', works.length - judged.length, 3324);
    // Phân tích NG theo giá trị (spec §12): アダルト作品扱い 374, アダルトジャンル 221, 問題あり 0
    var ngByGeneral = { adultWork: 0, adultGenre: 0, policyOnly: 0 };
    judged.filter(function (w) { return w.isNg; }).forEach(function (w) {
      var general = src.normalizeJapaneseText(w.general);
      if (general === 'アダルト作品扱い') ngByGeneral.adultWork += 1;
      else if (general === 'アダルトジャンル') ngByGeneral.adultGenre += 1;
      else ngByGeneral.policyOnly += 1;
    });
    check('NG chia theo gia tri (quy tac ① chua loai duoc dong nao)',
      [ngByGeneral.adultWork, ngByGeneral.adultGenre, ngByGeneral.policyOnly], [374, 221, 0]);

    // ---- Mô phỏng 4 lần chạy liên tiếp (spec §5.4) ----
    // isEqual chỉ so 2 field mà mô phỏng này theo dõi — đủ để phát hiện đúng
    // 110 dòng đổi định danh ở lần 3.
    function isEqualFn(a, b) {
      return src.sameValue(a.titleId, b.titleId) && src.sameValue(a.titleName, b.titleName);
    }
    /** Giả lập việc ghi sheet: update ghi đè đúng dòng, thêm mới append vào cuối. */
    function applyToMaster(numbered, existingRows) {
      var rows = existingRows.map(function (r) { return Object.assign({}, r); });
      numbered.forEach(function (m) {
        var row = { titleNo: m.record.titleNo, titleId: m.record.titleId, titleName: m.record.titleName };
        if (m.existing) rows[m.rowOffset] = row;
        else rows.push(row);
      });
      rows.forEach(function (r, i) { r.sheetRow = 16 + i; });
      return rows;
    }
    function runOnce(worksInput, master) {
      var filtered = src.filterAndMatchWorks(worksInput, master);
      var numbered = src.resolveNumbersFromMatches(filtered.matches, master, 'titleNo');
      var diff = src.diffUpsertFromMatches(numbered, isEqualFn);
      var tiers = { t0: 0, t1: 0, t2: 0, t3: 0 };
      filtered.matches.forEach(function (m) { tiers['t' + m.tier] += 1; });
      return { filtered: filtered, numbered: numbered, diff: diff, tiers: tiers,
        master: applyToMaster(numbered, master) };
    }

    // Lần 1 — nạp lần đầu, master rỗng
    var run1 = runOnce(works, []);
    check('lan 1: them moi 1.730, update 0, master 1.730',
      [run1.diff.toAdd.length, run1.diff.toUpdate.length, run1.master.length], [1730, 0, 1730]);
    check('lan 1: 595 NG + 3.324 未判定 bi loai',
      [run1.filtered.excludedNg.length, run1.filtered.excludedUnjudged.length], [595, 3324]);

    // Lần 2 — dữ liệu y nguyên: phải 0 thêm, 0 update, tất cả khớp tầng 1
    var run2 = runOnce(works, run1.master);
    check('lan 2: 0 them moi, 0 update, 1.730 dong khop tang 1',
      [run2.diff.toAdd.length, run2.diff.toUpdate.length, run2.tiers.t1], [0, 0, 1730]);
    check('lan 2: khong co dong mo coi', run2.filtered.orphanOffsets.length, 0);
    check('lan 2: NG van khong len duoc master (rule 2 khong bao ve tac pham chua co)',
      run2.filtered.excludedNg.length, 595);

    // Lần 3 — biến động thật: 108 dòng được cấp タイトルID số, 2 dòng bỏ dấu 仮
    var keptWorks = run1.filtered.matches.map(function (m) { return m.record; });
    var keptSet = new Set(keptWorks);
    var nonNumericCount = keptWorks.filter(function (w) { return !src.isDigits(w.titleId); }).length;
    var kariPattern = /[(（]仮[)）]/;
    var kariCount = keptWorks.filter(function (w) { return kariPattern.test(String(w.titleName)); }).length;
    check('so dong se doi gia tri titleID (spec §5.1: 108)', nonNumericCount, 108);
    check('so dong se doi titleName vi bo dau 仮 (spec §5.1: 2)', kariCount, 2);

    var nextFakeId = 900000;
    var worksRun3 = works.map(function (w) {
      if (!keptSet.has(w)) return w;
      var copy = Object.assign({}, w);
      if (!src.isDigits(w.titleId)) { nextFakeId += 1; copy.titleId = String(nextFakeId); }
      copy.titleName = String(w.titleName).replace(/[(（]仮[)）]/g, '');
      return copy;
    });

    var run3 = runOnce(worksRun3, run1.master);
    check('lan 3: 0 them moi (KHONG sinh dong trung), 110 update, master van 1.730',
      [run3.diff.toAdd.length, run3.diff.toUpdate.length, run3.master.length], [0, 110, 1730]);
    check('lan 3: tang 1 = 1.620, tang 2 = 2 (doi ten), tang 3 = 108 (ID trong -> so)',
      [run3.tiers.t1, run3.tiers.t2, run3.tiers.t3], [1620, 2, 108]);
    check('lan 3: khong co dong mo coi', run3.filtered.orphanOffsets.length, 0);

    // Lần 4 — chạy lại sau biến động: phải im lặng hoàn toàn
    var run4 = runOnce(worksRun3, run3.master);
    check('lan 4: 0 them moi, 0 update, 1.730 khop tang 1',
      [run4.diff.toAdd.length, run4.diff.toUpdate.length, run4.tiers.t1], [0, 0, 1730]);

    // Không bao giờ có タイトルNo trùng nhau qua cả 4 lần chạy
    [['lan 1', run1], ['lan 3', run3], ['lan 4', run4]].forEach(function (pair) {
      var numbers = pair[1].master.map(function (r) { return String(r.titleNo); });
      check(pair[0] + ': 0 タイトルNo trung nhau', numbers.length - new Set(numbers).size, 0);
    });
  },
};
```

- [ ] **Step 5: Chạy test dữ liệu — phải PASS**

Run: `python tools/verify/exportFixtures.py && node tools/verify/run.js --data`
Expected: `RUN 60-dataset.test.js` và tổng cộng `88 passed, 0 failed`.

Nếu có con số lệch: đọc lại ghi chú ở đầu file test trước khi sửa bất cứ gì. Chỗ dễ lệch nhất là `5158`/`5144` (file `example/` được tải lại) — nếu lệch ở đó mà 4 lần chạy vẫn `0 thêm mới` thì logic vẫn đúng, chỉ là dữ liệu đã thay đổi.

- [ ] **Step 6: Commit**

```bash
rtk git add src/logic/regulationFilter.js tools/verify/tests/50-filter.test.js tools/verify/tests/60-dataset.test.js && rtk git commit -m "Filter works by regulation verdict and match master rows in one pass"
```

---

### Task 7: `sheetIO.js` — ガワ mới, tự dò hàng header, bảo toàn cột GAS không sở hữu

**Files:**
- Modify: `src/io/sheetIO.js`

**Interfaces:**
- Produces: `resolveMasterHeader(spreadsheetId, sheetName, requiredHeaders) -> {sheet, headerIndex, headerRowIndex, columnCount, values}` — thêm `headerRowIndex` (0-based) và `values` (toàn bộ `getDataRange().getValues()`, để hàm gọi không phải đọc lần 2).
- Produces: `CUSTOMER_REQUIRED_HEADERS` mới (13 cột GAS ghi) và `CUSTOMER_OWNED_HEADERS` (danh sách cột GAS được phép ghi).
- Produces: `readCustomerWorkMaster() -> Array<{titleNo, cmsId, titleId, titleName, author, genre, publisher, label, preStart, preEnd, policy, general, logoJudgement, sheetRow, rawRow}>`
  - `sheetRow`: số dòng thật **1-based** trên sheet.
  - `rawRow`: mảng giá trị gốc của dòng đó — dùng để bảo toàn 7 cột GAS không sở hữu khi update.
- Produces: `customerRecordToRow(record, headerIndex, columnCount, previousRow) -> Array<*>`.
- Produces: `writeCustomerWorkMaster(diffResult)` — dùng `item.sheetRow`.
- `readCopyrightMaster`/`writeCopyrightMaster`/`copyrightRecordToRow`: **không đổi hành vi**, chỉ sửa để dùng `resolved.values`/`resolved.headerRowIndex` (được lợi miễn phí: nếu sau này コピーライトマスタ cũng đổi sang header hàng 15 thì đã chạy được).
- Consumed by: Task 9 (`main.js`).

**Không test tự động được** (file này gọi `SpreadsheetApp`) — kiểm chứng ở Task 12 bằng `probe_*`.

- [ ] **Step 1: Thay `resolveMasterHeader()`**

Thay toàn bộ hàm + JSDoc (dòng 25-54) bằng:

```js
/**
 * Đọc 1 sheet output, TỰ DÒ hàng header (không giả định hàng 1), build header
 * index và kiểm tra sheet có đủ các cột bắt buộc — throw ngay nếu thiếu.
 *
 * TẠI SAO PHẢI TỰ DÒ (2026-08-03): ガワ mới của 顧客作品マスタ có header ở
 * HÀNG 15 — 14 hàng trên là tiêu đề, 更新チーム/更新日, 3 dòng [1]更新ルール,
 * và 1 hàng đánh dấu '自動入力/GAS'. Bản cũ của hàm này hardcode
 * `getRange(1, 1, ...)` nên sẽ đọc hàng tiêu đề làm header và throw "Không tìm
 * thấy cột header" ngay lần chạy đầu tiên. CỐ TÌNH không hardcode số 15:
 * findHeaderRowIndex() (util/headerMap.js) đã làm đúng việc này cho các sheet
 * nguồn, và ガワ đã đổi 2 lần trong 1 ngày — hardcode là mời gọi lần thứ 3.
 *
 * Trả về luôn `values` (toàn bộ dữ liệu đã đọc) để hàm gọi không phải
 * getDataRange() lần thứ hai — mỗi lần gọi Apps Script API là một round-trip.
 *
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @param {Array<string>} requiredHeaders - Tên các cột BẮT BUỘC phải tồn tại
 * @returns {{sheet: Sheet, headerIndex: Map<string,number>, headerRowIndex: number,
 *   columnCount: number, values: Array<Array<*>>}}
 *   headerRowIndex: index 0-based của hàng header trong `values` (hàng thật trên
 *     sheet = headerRowIndex + 1)
 *   columnCount: bề rộng vùng ghi — lấy max(getLastColumn(), độ rộng hàng header)
 *     để không bao giờ ghi hẹp hơn số cột đã biết
 */
function resolveMasterHeader(spreadsheetId, sheetName, requiredHeaders) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + sheetName + ' (spreadsheet ' + spreadsheetId + ')');
  var values = sheet.getDataRange().getValues();
  var headerRowIndex = findHeaderRowIndex(values, requiredHeaders);
  var headerRow = values[headerRowIndex];
  var headerIndex = buildHeaderIndex(headerRow);
  requiredHeaders.forEach(function (name) { col(headerIndex, name); });
  return {
    sheet: sheet,
    headerIndex: headerIndex,
    headerRowIndex: headerRowIndex,
    columnCount: Math.max(sheet.getLastColumn(), headerRow.length, 1),
    values: values,
  };
}
```

- [ ] **Step 2: Thay 2 hằng số header của 顧客作品マスタ**

Thay khối `CUSTOMER_REQUIRED_HEADERS` + comment `配信NGフラグ` (dòng 56-64) bằng:

```js
// ==================== 顧客作品マスタ (ガワ mới 2026-08-03) ====================
//
// Layout ガワ mới: header HÀNG 15, dữ liệu từ hàng 16, cột A là cột đệm trống,
// dữ liệu ở B→U. Thứ tự cột đã đổi hoàn toàn so với bản cũ (vd タイトル名 từ
// cột E sang cột K) nhưng KHÔNG cần sửa gì ở đây ngoài 2 danh sách dưới, vì
// mọi truy cập đều qua col(headerIndex, 'tên cột').
//
// 7 CỘT GAS KHÔNG SỞ HỮU (phải giữ nguyên giá trị người ta điền tay):
//   A (đệm), E タイトル区分 (nguồn 出稿コミット管理表 chưa có file),
//   I 掲載停止日付 (spec §10d), J LP制作, R 先行終了日（延長）,
//   S 先行終了日（最終確定）, T/U 大量無料開始日・終了日 (nguồn chưa có).
// Xem customerRecordToRow() để biết cách bảo toàn.

// Cột GAS ĐỌC + GHI. Thiếu bất kỳ cột nào trong đây -> throw ngay, vì ghi
// thiếu cột nghĩa là dữ liệu master sai một cách âm thầm.
var CUSTOMER_REQUIRED_HEADERS = [
  'タイトルNo', 'CMS ID', 'タイトルID', 'タイトル名', '作家名', 'ジャンル', '出版社',
  'レーベル名', '先行開始日', '先行終了日', '①広告出稿ポリシー', '②一般面出稿NG', '③シーモアロゴ判定',
];
```

- [ ] **Step 3: Thay `readCustomerWorkMaster()`**

Thay toàn bộ hàm + JSDoc bằng:

```js
/**
 * Đọc toàn bộ dòng dữ liệu hiện có trên 顧客作品マスタ — đầu vào cho
 * filterAndMatchWorks()/resolveNumbersFromMatches() (logic/*) ở main.js.
 *
 * Bỏ qua dòng không có タイトル名 (thay vì CMS ID như bản cũ): タイトル名 là
 * trường duy nhất chắc chắn có giá trị ở mọi dòng do GAS ghi (spec §5.5), và
 * nó cũng là 1 trong 2 trường của khoá cascade — lọc theo đúng trường mà khoá
 * đang dùng là bài học đã ghi trong docs/gas1-van-hanh.md §3c.
 *
 * Trả về thêm 2 field KHÔNG có trên sheet:
 *   - sheetRow: số dòng THẬT (1-based) của dòng đó. Đường ghi dùng trực tiếp
 *     giá trị này thay vì tính rowOffset + 2 như bản cũ — công thức cũ ngầm
 *     giả định header ở hàng 1 VÀ không có dòng trống xen giữa, cả 2 đều sai
 *     với ガワ mới.
 *   - rawRow: mảng giá trị gốc của dòng, để customerRecordToRow() bảo toàn 7
 *     cột GAS không sở hữu khi ghi đè.
 *
 * @returns {Array<object>}
 */
function readCustomerWorkMaster() {
  var cfg = CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER;
  var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName, CUSTOMER_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colTitleNo = col(idx, 'タイトルNo');
  var colCmsId = col(idx, 'CMS ID');
  var colTitleId = col(idx, 'タイトルID');
  var colTitleName = col(idx, 'タイトル名');
  var colAuthor = col(idx, '作家名');
  var colGenre = col(idx, 'ジャンル');
  var colPublisher = col(idx, '出版社');
  var colLabel = col(idx, 'レーベル名');
  var colPreStart = col(idx, '先行開始日');
  var colPreEnd = col(idx, '先行終了日');
  var colPolicy = col(idx, '①広告出稿ポリシー');
  var colGeneral = col(idx, '②一般面出稿NG');
  var colLogo = col(idx, '③シーモアロゴ判定');

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < resolved.values.length; i++) {
    var row = resolved.values[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[colTitleName]) === '') continue;
    records.push({
      titleNo: row[colTitleNo],
      cmsId: row[colCmsId],
      titleId: row[colTitleId],
      titleName: row[colTitleName],
      author: row[colAuthor],
      genre: row[colGenre],
      publisher: row[colPublisher],
      label: row[colLabel],
      preStart: row[colPreStart],
      preEnd: row[colPreEnd],
      policy: row[colPolicy],
      general: row[colGeneral],
      logoJudgement: row[colLogo],
      sheetRow: i + 1,
      rawRow: row,
    });
  }
  return records;
}
```

- [ ] **Step 4: Thay `customerRecordToRow()`**

```js
/**
 * Chuyển 1 work record thành mảng giá trị theo ĐÚNG vị trí cột thật của sheet.
 *
 * ĐIỂM QUAN TRỌNG NHẤT — dòng ghi được dựng TỪ BẢN COPY CỦA DÒNG CŨ, rồi chỉ
 * ghi đè các cột GAS sở hữu. ガワ mới có 7 cột GAS KHÔNG ghi (タイトル区分,
 * 掲載停止日付, LP制作, 先行終了日（延長）, 先行終了日（最終確定）, 大量無料開始日/
 * 終了日) — có cột do người điền tay, có cột chờ nguồn dữ liệu chưa tồn tại.
 * Cách cũ (`new Array(columnCount).fill('')`) sẽ XOÁ TRẮNG cả 7 cột đó mỗi
 * lần dòng bị update. Dựng từ dòng cũ còn bền với việc 池永 thêm cột mới:
 * cột lạ được giữ nguyên thay vì bị xoá, không cần sửa code.
 *
 * @param {object} record - Work record đã qua resolveNumbersFromMatches()
 * @param {Map<string,number>} headerIndex - Từ resolveMasterHeader()
 * @param {number} columnCount - Bề rộng hàng cần ghi
 * @param {Array<*>|undefined} previousRow - rawRow của dòng cũ (chỉ có khi UPDATE).
 *   undefined khi append dòng mới -> các cột không sở hữu để trống.
 * @returns {Array<*>} Mảng giá trị, sẵn sàng cho Range.setValues([...])
 */
function customerRecordToRow(record, headerIndex, columnCount, previousRow) {
  var row = [];
  for (var c = 0; c < columnCount; c++) {
    var previousValue = previousRow ? previousRow[c] : '';
    row.push(previousValue === null || previousValue === undefined ? '' : previousValue);
  }

  row[col(headerIndex, 'タイトルNo')] = record.titleNo;
  row[col(headerIndex, 'CMS ID')] = record.cmsId;
  row[col(headerIndex, 'タイトルID')] = record.titleId;
  row[col(headerIndex, 'タイトル名')] = record.titleName;
  row[col(headerIndex, '作家名')] = record.author;
  row[col(headerIndex, 'ジャンル')] = record.genre;
  row[col(headerIndex, '出版社')] = record.publisher;
  row[col(headerIndex, 'レーベル名')] = record.label;
  row[col(headerIndex, '先行開始日')] = record.preStart;
  row[col(headerIndex, '先行終了日')] = record.preEnd;
  // 3 cột phán định: NGUYÊN VĂN từ レギュレーション (spec §4.4)
  row[col(headerIndex, '①広告出稿ポリシー')] = record.policy || '';
  row[col(headerIndex, '②一般面出稿NG')] = record.general || '';
  row[col(headerIndex, '③シーモアロゴ判定')] = record.logoJudgement || '';
  return row;
}
```

- [ ] **Step 5: Thay `writeCustomerWorkMaster()`**

```js
/**
 * Ghi kết quả diffUpsertFromMatches() vào 顧客作品マスタ thật.
 *
 * - toUpdate: ghi đè đúng dòng cũ theo `item.sheetRow` (số dòng thật 1-based,
 *   do readCustomerWorkMaster() gắn) — KHÔNG tính lại từ rowOffset nữa.
 *   Truyền `item.previous.rawRow` vào customerRecordToRow() để bảo toàn 7 cột
 *   GAS không sở hữu.
 * - toAdd: append ngay sau dòng cuối cùng hiện có, ghi 1 lần bằng setValues().
 *   Dùng max(getLastRow(), hàng header) để trường hợp sheet mới (chưa có dòng
 *   dữ liệu nào, getLastRow() có thể nhỏ hơn hàng header do vùng ghi chú hẹp
 *   hơn) vẫn ghi vào ngay dưới header thay vì đè lên vùng ghi chú.
 *
 * KHÔNG BAO GIỜ xoá dòng nào (spec §3.4 — `削除等はしない`).
 *
 * @param {{toUpdate: Array<{record: object, previous: object, sheetRow: number}>, toAdd: Array<object>}} diffResult
 * @returns {void}
 */
function writeCustomerWorkMaster(diffResult) {
  var cfg = CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER;
  var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName, CUSTOMER_REQUIRED_HEADERS);
  var sheet = resolved.sheet;
  var headerIndex = resolved.headerIndex;
  var columnCount = resolved.columnCount;
  var headerRowNumber = resolved.headerRowIndex + 1;

  diffResult.toUpdate.forEach(function (item) {
    var values = customerRecordToRow(item.record, headerIndex, columnCount, item.previous.rawRow);
    sheet.getRange(item.sheetRow, 1, 1, columnCount).setValues([values]);
  });

  if (diffResult.toAdd.length > 0) {
    var startRow = Math.max(sheet.getLastRow(), headerRowNumber) + 1;
    var rows = diffResult.toAdd.map(function (record) {
      return customerRecordToRow(record, headerIndex, columnCount, undefined);
    });
    sheet.getRange(startRow, 1, rows.length, columnCount).setValues(rows);
  }
}
```

- [ ] **Step 6: Sửa 2 chỗ trong đường コピーライトマスタ (không đổi hành vi)**

Trong `readCopyrightMaster()`, thay:

```js
  var rows = resolved.sheet.getDataRange().getValues();
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
```

bằng:

```js
  // Dùng resolved.values + headerRowIndex thay vì đọc lại sheet và giả định
  // header ở hàng 1: コピーライトマスタ hiện vẫn header hàng 1, nhưng ガワ của
  // nó cũng đang được thiết kế lại (header hàng 15) — viết theo headerRowIndex
  // thì lần đó không phải sửa hàm này nữa.
  var rows = resolved.values;
  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rows.length; i++) {
    var row = rows[i];
```

Trong `writeCopyrightMaster()`, thay:

```js
  diffResult.toUpdate.forEach(function (item) {
    var sheetRowIndex = 1 + item.rowOffset + 1;
```

bằng:

```js
  var headerRowNumber = resolved.headerRowIndex + 1;
  diffResult.toUpdate.forEach(function (item) {
    var sheetRowIndex = headerRowNumber + item.rowOffset + 1;
```

và thay `var startRow = sheet.getLastRow() + 1;` bằng `var startRow = Math.max(sheet.getLastRow(), headerRowNumber) + 1;`.

- [ ] **Step 7: Kiểm tra không còn tham chiếu cột đã bỏ**

Run: `rtk grep -n "コピーライト'\)\|備考\|配信NGフラグ" src/io/sheetIO.js`
Expected: **không có dòng nào** khớp `'備考'`, `'配信NGフラグ'`, hay `col(headerIndex, 'コピーライト')` trong phần 顧客作品マスタ (phần コピーライトマスタ vẫn có `正規コピーライト`/`CopyRight...` — đúng, không đổi).

- [ ] **Step 8: Commit**

```bash
rtk git add src/io/sheetIO.js && rtk git commit -m "Read and write the new customer-master layout without clobbering unowned columns"
```

---

### Task 8: 4 loại cảnh báo + 2 số đếm — `warnings.js`, `changeDetail.js`, `logSheet.js`

Sau thay đổi này, tác phẩm **biến mất khỏi master một cách im lặng** (595 NG + 3.324 未判定) và khoá upsert có 2 tầng dự phòng có thể bắt sang dòng láng giềng. Không có cảnh báo thì không ai biết chuyện gì đã xảy ra.

**Files:**
- Create: `src/logic/warnings.js`
- Modify: `src/logic/changeDetail.js` (fieldDef nhận `compare` tuỳ chọn)
- Modify: `src/io/logSheet.js` (tab `GAS1警告` + 6 cột số đếm cho `GAS1ログ`)
- Create: `tools/verify/tests/70-warnings.test.js`

**Interfaces:**
- Produces (`warnings.js`): 4 hằng số `WARNING_KIND_*` và 3 hàm pure, tất cả trả về mảng
  `{runAt, kind, titleNo, titleId, titleName, detail}`:
  - `buildMatchWarningRows(matches, runAt)` → `照合注意` (tier 2/3) + `照合曖昧` (`ambiguous`)
  - `buildOrphanWarningRows(existingRecords, orphanOffsets, runAt)` → `孤立行`
  - `buildNgTitleWarningRows(records, ngTitleLookup, runAt)` → `外部出稿NG注意`
- Produces (`changeDetail.js`): `buildChangeDetailRows(masterLabel, toUpdateItems, fieldDefs, runAt)` — `fieldDefs` giờ nhận thêm `compare` tuỳ chọn (`function(old, new): boolean`), mặc định `sameValue`.
- Produces (`logSheet.js`): `appendWarningRows(rows)`; `appendLogEntry(entry)` nhận thêm `excludedNgCount`, `excludedUnjudgedCount`, `matchNoticeCount`, `matchAmbiguousCount`, `orphanCount`, `ngTitleNoticeCount` (thiếu field nào thì tính là 0).
- Consumed by: Task 9 (`main.js`).

- [ ] **Step 1: Viết test — phải FAIL**

Create `tools/verify/tests/70-warnings.test.js`:

```js
// tools/verify/tests/70-warnings.test.js

module.exports = {
  run: function (ctx) {
    var src = ctx.src;
    var check = ctx.check;
    var runAt = new Date(2026, 7, 3, 9, 0, 0);

    function match(tier, titleNo, titleId, titleName, prevTitleId, prevTitleName, ambiguous, candidates) {
      return {
        tier: tier,
        record: { titleNo: titleNo, titleId: titleId, titleName: titleName },
        existing: { titleNo: titleNo, titleId: prevTitleId, titleName: prevTitleName },
        ambiguous: !!ambiguous,
        candidateTitleNos: candidates || [],
      };
    }

    var matchRows = src.buildMatchWarningRows([
      match(1, 1, 100, 'A', 100, 'A'),
      match(2, 2, 200, 'ten moi', 200, 'ten cu(仮)'),
      match(3, 3, '900001', 'C', 'ー', 'C'),
      match(3, 4, '900002', 'D', '', 'D', true, [4, 9]),
      { tier: 0, record: { titleNo: 5, titleId: 500, titleName: 'E' }, existing: null, ambiguous: false, candidateTitleNos: [] },
    ], runAt);

    check('照合注意 chi sinh o tang 2 va 3 (tang 1 va dong moi thi khong)',
      matchRows.filter(function (r) { return r.kind === src.WARNING_KIND_MATCH; })
        .map(function (r) { return r.titleNo; }), [2, 3, 4]);
    check('照合注意 tang 2 noi ro ten da doi',
      matchRows[0].detail.indexOf('ten cu(仮)') !== -1 && matchRows[0].detail.indexOf('ten moi') !== -1, true);
    check('照合注意 tang 3 noi ro titleID da doi',
      matchRows[1].detail.indexOf('ー') !== -1 && matchRows[1].detail.indexOf('900001') !== -1, true);
    check('照合曖昧 sinh rieng 1 dong va liet ke ung vien',
      matchRows.filter(function (r) { return r.kind === src.WARNING_KIND_AMBIGUOUS; })
        .map(function (r) { return [r.titleNo, r.detail.indexOf('4, 9') !== -1]; }), [[4, true]]);
    check('moi dong canh bao deu co runAt', matchRows.every(function (r) { return r.runAt === runAt; }), true);

    var orphanRows = src.buildOrphanWarningRows([
      { titleNo: 1, titleId: 100, titleName: 'con dung' },
      { titleNo: 2, titleId: 200, titleName: 'mo coi' },
    ], [1], runAt);
    check('孤立行 chi bao dong khong ai chiem',
      orphanRows.map(function (r) { return [r.kind, r.titleNo, r.titleName]; }),
      [[src.WARNING_KIND_ORPHAN, 2, 'mo coi']]);

    var ngLookup = new Map([
      ['12345', '一般面での出稿ＮＧ（アダルト面での出稿はＯＫ）'],
      [src.normalizeJapaneseText('ヒグマグマ'), '熊被害が発生しているため出稿NG'],
      ['99999', ''],
    ]);
    var ngRows = src.buildNgTitleWarningRows([
      { titleNo: 1, titleId: 12345, titleName: 'MY SWEET BUNNY CAGE' },
      { titleNo: 2, titleId: 67890, titleName: 'ヒグマグマ' },
      { titleNo: 3, titleId: 99999, titleName: '備考 rong -> khong bao' },
      { titleNo: 4, titleId: 11111, titleName: 'khong co trong danh sach NG' },
    ], ngLookup, runAt);
    check('外部出稿NG注意: tra duoc ca theo titleId va theo ten, bo qua 備考 rong',
      ngRows.map(function (r) { return r.titleNo; }), [1, 2]);
    check('外部出稿NG注意 mang noi dung 備考 vao detail',
      ngRows[1].detail.indexOf('熊被害') !== -1, true);

    // ---- changeDetail: fieldDef có compare tuỳ chọn ----
    var detailRows = src.buildChangeDetailRows('顧客作品マスタ', [{
      key: '1',
      previous: { titleName: 'A', preStart: new Date(2026, 2, 27, 0, 0), author: 'X' },
      record: { titleNo: 1, titleName: 'A', preStart: new Date(2026, 2, 27, 9, 0), author: 'Y' },
    }], [
      { key: 'preStart', label: '先行開始日', compare: src.sameDateValue },
      { key: 'author', label: '作家名' },
    ], runAt);
    check('changeDetail: field ngay dung compare rieng -> cung ngay khac gio KHONG log',
      detailRows.map(function (r) { return r.field; }), ['作家名']);
  },
};
```

Run: `node tools/verify/run.js`
Expected: FAIL — `src.buildMatchWarningRows is not a function`.

- [ ] **Step 2: Tạo `src/logic/warnings.js`**

```js
// logic/warnings.js — dựng các dòng cảnh báo cho tab GAS1警告 (spec §6).
//
// Hàm PURE (không đụng SpreadsheetApp). io/logSheet.appendWarningRows() ghi
// kết quả của các hàm ở đây.
//
// VÌ SAO CẦN 4 LOẠI CẢNH BÁO NÀY: sau thay đổi 2026-08-03, tác phẩm có thể
// BIẾN MẤT khỏi 顧客作品マスタ một cách hoàn toàn im lặng (595 NG + 3.324
// 未判定 trên dữ liệu hôm nay), và khoá upsert có 2 tầng dự phòng có thể bắt
// sang dòng láng giềng khi tầng 1 trượt. Dữ liệu hôm nay đã có 4 dòng nguy
// hiểm cho cascade: 3 dòng trùng タイトル名 với dòng khác + 1 dòng trùng
// タイトルID số. Không có cảnh báo thì không có cách nào phát hiện.

var WARNING_KIND_MATCH = '照合注意';
var WARNING_KIND_AMBIGUOUS = '照合曖昧';
var WARNING_KIND_ORPHAN = '孤立行';
var WARNING_KIND_NG_TITLE = '外部出稿NG注意';

function warningRow(runAt, kind, titleNo, titleId, titleName, detail) {
  return {
    runAt: runAt,
    kind: kind,
    titleNo: titleNo === undefined || titleNo === null ? '' : titleNo,
    titleId: titleId === undefined || titleId === null ? '' : titleId,
    titleName: titleName === undefined || titleName === null ? '' : titleName,
    detail: detail,
  };
}

/**
 * 照合注意 + 照合曖昧 — 2 cảnh báo phát sinh từ chính cơ chế cascade.
 *
 * 照合注意 (khớp ở TẦNG 2 hoặc 3): một trong hai trường định danh vừa đổi giá
 * trị. KHÔNG phải lỗi (mô phỏng §5.4 lần 3 có 110 ca hợp lệ) nhưng phải nhìn
 * thấy được — vì đây cũng chính là hình dạng của một ca khớp SAI: nếu dòng
 * master láng giềng trùng tên/trùng ID, tầng 2/3 có thể bắt sang đúng nó.
 *
 * 照合曖昧 (ở tầng thắng có >1 dòng ứng viên chưa bị chiếm): cảnh báo THẬT.
 * GAS chọn dòng có タイトルNo nhỏ nhất rồi báo, để người kiểm — không tự quyết
 * định im lặng, cũng không dừng cả lần chạy vì một dòng nhập nhằng.
 *
 * @param {Array<object>} matches - filterAndMatchWorks().matches, ĐÃ qua
 *   resolveNumbersFromMatches() (cần record.titleNo để cảnh báo trỏ được về dòng)
 * @param {Date} runAt - Dùng chung 1 giá trị cho cả lần chạy
 * @returns {Array<object>} Dòng cảnh báo
 */
function buildMatchWarningRows(matches, runAt) {
  var rows = [];
  matches.forEach(function (match) {
    if (!match.existing) return;
    if (match.tier === 2) {
      rows.push(warningRow(runAt, WARNING_KIND_MATCH, match.record.titleNo, match.record.titleId, match.record.titleName,
        'タイトルID 一致・タイトル名 変更: 「' + match.existing.titleName + '」→「' + match.record.titleName + '」'));
    } else if (match.tier === 3) {
      rows.push(warningRow(runAt, WARNING_KIND_MATCH, match.record.titleNo, match.record.titleId, match.record.titleName,
        'タイトル名 一致・タイトルID 変更: 「' + match.existing.titleId + '」→「' + match.record.titleId + '」'));
    }
    if (match.ambiguous) {
      rows.push(warningRow(runAt, WARNING_KIND_AMBIGUOUS, match.record.titleNo, match.record.titleId, match.record.titleName,
        '第' + match.tier + '層で候補が複数（タイトルNo: ' + match.candidateTitleNos.join(', ')
        + '）→ 最小のタイトルNoを採用。要確認'));
    }
  });
  return rows;
}

/**
 * 孤立行 — dòng master mà KHÔNG record nào chiếm trong lần chạy này.
 *
 * Nguyên nhân thường gặp: tác phẩm đổi tên (dòng cũ mồ côi, dòng mới được
 * thêm), hoặc tác phẩm bị gỡ khỏi 先行タイトル của CMS. GAS❶ không có nhánh xoá
 * (`削除等はしない`) nên chỉ báo.
 *
 * @param {Array<object>} existingRecords - readCustomerWorkMaster()
 * @param {Array<number>} orphanOffsets - filterAndMatchWorks().orphanOffsets
 * @param {Date} runAt
 * @returns {Array<object>}
 */
function buildOrphanWarningRows(existingRecords, orphanOffsets, runAt) {
  return orphanOffsets.map(function (offset) {
    var record = existingRecords[offset];
    return warningRow(runAt, WARNING_KIND_ORPHAN, record.titleNo, record.titleId, record.titleName,
      'この行に対応する CMS 先行タイトルが今回の実行で見つかりませんでした（改名/取り下げの可能性）。行は削除していません');
  });
}

/**
 * 外部出稿NG注意 — thay cho cột 備考 đã bị bỏ khỏi ガワ (spec §10a).
 *
 * ガワ mới không còn cột nào chứa nội dung 備考 của nguồn 外部出稿用NGタイトル.
 * Đo mức ảnh hưởng thật: 671 dòng trong sheet đó nhưng chỉ **10 tác phẩm CMS**
 * thật sự nhận được 備考 — phần lớn dòng NG không có タイトルID vì chúng là quy
 * tắc theo NXB/theo điều kiện ('すべての作品', 'ロゴ判定リストで、シーモアロゴ
 * 「×」になっているタイトル'), không trỏ tới tác phẩm cụ thể nào.
 *
 * Phần lớn 10 nội dung đó trùng ý nghĩa với 2 cột F/G mới (đây có lẽ là lý do
 * 池永 bỏ cột 備考 — phán định đã được cấu trúc hoá). NHƯNG không trùng hết: vài
 * dòng là thông tin DỪNG PHÂN PHỐI ('作家様都合で配信停止', '2025/2/8（土）～：
 * 出版社都合により配信停止') mà F/G không diễn đạt được, đúng ra thuộc cột
 * 掲載停止日付 — nên vẫn phải báo, không được để mất im lặng.
 *
 * Tra CẢ 2 khoá mà buildNgTitleLookup() sinh ra: theo titleId (dòng NG có ID)
 * và theo tên đã chuẩn hoá (dòng NG chỉ có tên). Bỏ qua khi 備考 rỗng.
 *
 * @param {Array<object>} records - Tác phẩm ĐƯỢC vào master (đã có titleNo)
 * @param {Map<string, string>} ngTitleLookup - ngTitleSource.buildNgTitleLookup()
 * @param {Date} runAt
 * @returns {Array<object>}
 */
function buildNgTitleWarningRows(records, ngTitleLookup, runAt) {
  var rows = [];
  records.forEach(function (record) {
    var remark = ngTitleLookup.get(String(record.titleId));
    if (!remark) remark = ngTitleLookup.get(normalizeJapaneseText(record.titleName));
    if (!remark) return;
    rows.push(warningRow(runAt, WARNING_KIND_NG_TITLE, record.titleNo, record.titleId, record.titleName,
      '外部出稿用NGタイトルの備考: ' + remark));
  });
  return rows;
}
```

- [ ] **Step 3: Sửa `src/logic/changeDetail.js`**

Trong JSDoc, thay dòng mô tả `fieldDefs`:

```js
 * @param {Array<{key: string, label: string}>} fieldDefs - Danh sách field cần
```

bằng:

```js
 * @param {Array<{key: string, label: string, compare?: function(*, *): boolean}>} fieldDefs
 *   Danh sách field cần
```

và thêm ngay dưới đoạn mô tả `label`:

```js
 *   compare (tuỳ chọn): hàm so sánh riêng cho field đó, mặc định sameValue().
 *   Dùng cho field NGÀY (先行開始日/先行終了日) với sameDateValue(): String(Date)
 *   chứa cả giờ + timezone, nên 2 spreadsheet khác timezone sẽ cho ra "đã đổi"
 *   ở MỌI lần chạy cho cùng một ngày lịch — log sẽ đầy dòng vô nghĩa.
```

Thay 3 dòng trong thân hàm:

```js
      var oldValue = item.previous[fieldDef.key];
      var newValue = item.record[fieldDef.key];
      if (sameValue(oldValue, newValue)) return;
```

bằng:

```js
      var oldValue = item.previous[fieldDef.key];
      var newValue = item.record[fieldDef.key];
      var isEqual = fieldDef.compare || sameValue;
      if (isEqual(oldValue, newValue)) return;
```

- [ ] **Step 4: Chạy test — phải PASS**

Run: `node tools/verify/run.js`
Expected: `79 passed, 0 failed`.

- [ ] **Step 5: Sửa `src/io/logSheet.js`**

Thay 2 hằng số đầu file:

```js
var LOG_SHEET_NAME = 'GAS1ログ';
var LOG_HEADER = ['開始日時', '終了日時', '追加件数', '更新件数', '個別対応タイトル', 'エラー'];
```

bằng:

```js
var LOG_SHEET_NAME = 'GAS1ログ';
// 6 cột số đếm ở giữa được thêm 2026-08-03 (spec §6). Từ nay tác phẩm có thể
// biến mất khỏi master một cách im lặng (595 NG + 3.324 未判定 trên dữ liệu
// hôm nay), nên 1 dòng log phải đủ để biết lần chạy đó có gì bất thường mà
// không cần mở tab GAS1警告.
var LOG_HEADER = ['開始日時', '終了日時', '追加件数', '更新件数',
  '除外_NG件数', '除外_未判定件数', '照合注意件数', '照合曖昧件数', '孤立行件数', '外部出稿NG注意件数',
  '個別対応タイトル', 'エラー'];

var WARNING_SHEET_NAME = 'GAS1警告';
var WARNING_HEADER = ['実行日時', '種別', 'タイトルNo', 'タイトルID', 'タイトル名', '詳細'];
```

Thêm helper + sửa `getOrCreateLogSheet()`:

```js
/**
 * Đảm bảo hàng 1 của sheet log đúng bằng `header`.
 *
 * Cần thiết vì GAS1ログ ĐÃ TỒN TẠI với 6 cột (bản trước 2026-08-03) trong
 * spreadsheet 顧客作品マスタ. Nếu chỉ appendRow() 12 giá trị vào sheet header 6
 * cột thì 6 cột số mới sẽ nằm dưới ô header TRỐNG — không ai đọc được đó là số
 * gì. CHỈ ghi lại đúng hàng header, không đụng dòng dữ liệu cũ (dữ liệu cũ vẫn
 * đúng cho 4 cột đầu + 2 cột cuối bị dịch sang phải — chấp nhận được, đây là
 * sheet log của chính GAS❶, không phải master).
 *
 * @param {Sheet} sheet
 * @param {Array<string>} header
 * @returns {void}
 */
function ensureLogHeaderRow(sheet, header) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
    return;
  }
  var current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), header.length)).getValues()[0];
  var same = header.every(function (name, i) { return String(current[i] || '') === name; });
  if (!same) sheet.getRange(1, 1, 1, header.length).setValues([header]);
}

/**
 * Lấy sheet log, tự tạo mới (kèm header) nếu tab "GAS1ログ" chưa tồn tại, và tự
 * NÂNG CẤP hàng header nếu tab đã tồn tại với bộ cột cũ.
 *
 * @returns {Sheet}
 */
function getOrCreateLogSheet() {
  var ss = SpreadsheetApp.openById(CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER.spreadsheetId);
  var sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(LOG_SHEET_NAME);
  ensureLogHeaderRow(sheet, LOG_HEADER);
  return sheet;
}
```

Thay thân `appendLogEntry()`:

```js
function appendLogEntry(entry) {
  var sheet = getOrCreateLogSheet();
  sheet.appendRow([
    entry.startedAt,
    entry.finishedAt,
    entry.addedCount,
    entry.updatedCount,
    entry.excludedNgCount || 0,
    entry.excludedUnjudgedCount || 0,
    entry.matchNoticeCount || 0,
    entry.matchAmbiguousCount || 0,
    entry.orphanCount || 0,
    entry.ngTitleNoticeCount || 0,
    entry.irregularTitles.join(', '),
    entry.errors.join(', '),
  ]);
}
```

(và bổ sung 6 field mới vào JSDoc của `appendLogEntry`, mô tả: `số đếm của lần chạy này; thiếu field nào thì ghi 0 — cho phép hàm probe_appendLogEntry() gọi với entry tối thiểu`.)

Thêm vào **cuối file**:

```js
/**
 * Lấy tab GAS1警告, tự tạo kèm header nếu chưa có.
 *
 * VÌ SAO LÀ TAB RIÊNG chứ không nhồi vào 1 ô của GAS1ログ: mô phỏng spec §5.4
 * lần 3 cho 110 ca 照合注意 trong MỘT lần chạy. Nhồi 110 tên tác phẩm vào một
 * ô thì không ai đọc được, và sẽ đụng giới hạn 50.000 ký tự/ô của Google Sheets
 * khi dữ liệu lớn hơn. 1 dòng = 1 cảnh báo thì lọc/sort/tìm được như dữ liệu
 * bình thường — cùng lý do vì sao GAS1変更詳細 là tab riêng.
 *
 * @returns {Sheet}
 */
function getOrCreateWarningSheet() {
  var ss = SpreadsheetApp.openById(CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER.spreadsheetId);
  var sheet = ss.getSheetByName(WARNING_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(WARNING_SHEET_NAME);
  ensureLogHeaderRow(sheet, WARNING_HEADER);
  return sheet;
}

/**
 * Ghi thêm nhiều dòng cảnh báo trong 1 lần setValues() duy nhất — nhận kết quả
 * đã gộp của cả 4 hàm build trong logic/warnings.js.
 *
 * Rows rỗng -> không làm gì (không tạo dòng trống, và cũng không tạo tab
 * GAS1警告 nếu lần chạy đó sạch sẽ).
 *
 * @param {Array<{runAt: Date, kind: string, titleNo: *, titleId: *, titleName: string, detail: string}>} rows
 * @returns {void}
 */
function appendWarningRows(rows) {
  if (!rows || rows.length === 0) return;
  var sheet = getOrCreateWarningSheet();
  var startRow = sheet.getLastRow() + 1;
  var values = rows.map(function (row) {
    return [row.runAt, row.kind, row.titleNo, row.titleId, row.titleName, row.detail];
  });
  sheet.getRange(startRow, 1, values.length, WARNING_HEADER.length).setValues(values);
}
```

- [ ] **Step 6: Commit**

```bash
rtk git add src/logic/warnings.js src/logic/changeDetail.js src/io/logSheet.js tools/verify/tests/70-warnings.test.js && rtk git commit -m "Record the four new regulation warnings and six run counters"
```

---

### Task 9: `main.js` — nối lại toàn bộ luồng theo thứ tự mới

Task này đưa repo trở lại trạng thái **chạy được** (từ Task 2 tới giờ `main.js` vẫn gọi các chữ ký cũ).

**Files:**
- Modify: `src/main.js`

**Interfaces:**
- Consumes: tất cả những gì Task 2-8 tạo ra.
- Produces: `runGas1()` theo thứ tự spec §8; `customerIsEqualFn` nội bộ; các `probe_*` mới: `probe_readCustomerMasterHeader()`, `probe_dryRunFilter()`.
- **XOÁ:** khối cảnh báo `titleNamesByCmsId` (phát hiện CMSID trùng) — CMSID không còn là khoá nên cảnh báo đó không còn ý nghĩa; vai trò của nó được `照合曖昧` thay thế. Giữ `buildRowOffsetIndex`/`attachRowOffsets` vì コピーライトマスタ vẫn dùng.

- [ ] **Step 1: Thay khối JSDoc "THỨ TỰ CÁC BƯỚC" của `runGas1()`**

Thay đoạn liệt kê 10 bước (dòng 53-81) bằng:

```js
 * THỨ TỰ CÁC BƯỚC (quan trọng, không được đảo lộn — spec §8):
 *
 *  1. Đọc thô + parse các nguồn (io/sheetIO.readSheetValues + sources/*.js).
 *  2. buildRegulationLookup(): Map normalize(タイトル名) -> phán định, chỉ dòng
 *     ステータス=判定済み, tên trùng thì dòng NG thắng.
 *  3. buildCustomerWorkRows(): gắn 3 cột phán định + cờ judged/isNg cho TỪNG
 *     tác phẩm CMS (chưa lọc gì).
 *  4. readCustomerWorkMaster(): PHẢI đọc TRƯỚC bước 5, vì rule 2 (spec §3.4)
 *     cần biết "tác phẩm này đã có trên master chưa".
 *  5. filterAndMatchWorks(): lọc theo rule 1 + rule 2 VÀ gán dòng master
 *     (cascade 3 tầng + chiếm-một-lần) trong CÙNG MỘT LƯỢT. Đây là bước quyết
 *     định tác phẩm nào tồn tại trong lần chạy này.
 *  6. resolveCopyright() cho TỪNG tác phẩm được giữ — chỉ tác phẩm được giữ,
 *     không tính bản quyền cho tác phẩm bị loại (vô nghĩa và tốn thời gian).
 *  7. resolveNumbersFromMatches(): cấp/dùng lại タイトルNo. PHẢI sau bước 5
 *     (tác phẩm bị loại không được chiếm số) và TRƯỚC bước 9
 *     (コピーライトマスタ dùng chung タイトルNo).
 *  8. diffUpsertFromMatches() -> writeCustomerWorkMaster().
 *  9. Build + ghi コピーライトマスタ từ CHÍNH danh sách đã lọc ở bước 5.
 * 10. appendChangeDetailRows() (audit từng field đã đổi).
 * 11. appendWarningRows(): 4 loại cảnh báo (spec §6).
 * 12. notifySlack() nếu có tác phẩm tầng 4, rồi appendLogEntry() (luôn chạy).
 *
 * LƯU Ý LẦN CHẠY ĐẦU TIÊN (spec §10b): bước 4 đọc về mảng rỗng, nên MỌI tác
 * phẩm đều rơi vào nhánh "chưa có trong master" — rule 2 không bảo vệ ai và
 * toàn bộ 595 tác phẩm NG bị loại thẳng, kể cả những cái đang tồn tại ở sheet
 * 顧客作品マスタ_元. Rule 2 chỉ có tác dụng TỪ LẦN CHẠY THỨ HAI. コピーライト
 * マスタ cũng phải được xoá sạch trước lần chạy đầu, vì タイトルNo được cấp lại
 * từ 1 và số cũ sẽ trỏ sai tác phẩm.
```

- [ ] **Step 2: Thay phần thân từ `// ---- Bước 1` tới hết khối `顧客作品マスタ 集計`**

Thay từ dòng `var regulationRecords = parseRegulationRows(regulationRaw);` tới dòng `Logger.log('顧客作品マスタ 集計: ...')` bằng:

```js
    var regulationRecords = parseRegulationRows(regulationRaw);
    var regulationLookup = buildRegulationLookup(regulationRecords);
    Logger.log('作品レギュレーション判定: ' + regulationRecords.length + ' 件（判定済み）読み込み完了、'
      + 'タイトル名ユニーク ' + regulationLookup.size + ' 件');

    var cmsRecords = parseCmsRows(cmsRaw);
    // cmsRaw.length - 1 = tổng số dòng data thô. Số dòng KHÔNG vào cmsRecords là
    // dòng タイトル名 trống (bị parseCmsRows loại) hoặc dòng trống cuối sheet —
    // CỐ TÌNH log để dòng bị loại không biến mất trong im lặng (đã gặp trường
    // hợp thật: file nguồn lệch cột hàng loạt khiến cột định danh trống).
    var cmsSkippedCount = (cmsRaw.length - 1) - cmsRecords.length;
    Logger.log('先行タイトル情報(CMS): ' + cmsRecords.length + ' 件読み込み完了（タイトル名欠落等でスキップ: '
      + cmsSkippedCount + ' 件）');

    var ngTitleRecords = parseNgTitles(ngTitleRaw);
    var ngTitleLookup = buildNgTitleLookup(ngTitleRecords);
    Logger.log('外部出稿用NGタイトル: ' + ngTitleRecords.length + ' 件読み込み完了');

    var basicNotationMap = parseBasicNotation(basicNotationRaw);
    Logger.log('基本のC表記: ' + basicNotationMap.size + ' レーベル読み込み完了');

    // Đọc + parse các sheet quy tắc riêng NXB theo registry — thêm NXB mới chỉ
    // cần sửa PUBLISHER_SHEET_PARSERS ở sources/copyrightRules.js.
    var publisherMaps = {};
    PUBLISHER_SHEET_PARSERS.forEach(function (entry) {
      var rawRows = readSheetValues(CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId, entry.sheetName);
      publisherMaps[entry.key] = entry.parse(rawRows);
      Logger.log(entry.key + ' (' + entry.sheetName + '): ' + publisherMaps[entry.key].size + ' 件読み込み完了');
    });

    // ---- Bước 3-5: gắn phán định -> đọc master -> LỌC + khớp dòng ----
    var builtCustomerRows = buildCustomerWorkRows(cmsRecords, regulationLookup);
    var existingCustomerRows = readCustomerWorkMaster();
    var filtered = filterAndMatchWorks(builtCustomerRows, existingCustomerRows);
    Logger.log('レギュレーションフィルタ: 対象 ' + filtered.matches.length + ' 件 / 除外(NG) '
      + filtered.excludedNg.length + ' 件 / 除外(未判定) ' + filtered.excludedUnjudged.length
      + ' 件（CMS 全 ' + builtCustomerRows.length + ' 件、既存マスタ ' + existingCustomerRows.length + ' 行）');

    // ---- Bước 6: bản quyền, CHỈ cho tác phẩm được giữ ----
    filtered.matches.forEach(function (match) {
      var work = match.record;
      var resolved = resolveCopyright(work, PUBLISHER_SHEET_PARSERS, publisherMaps, basicNotationMap);
      work.copyright = resolved.value;
      work.copyrightTier = resolved.tier;
      if (resolved.tier === 4) irregularTitles.push(work.titleId + ' ' + work.titleName);
    });

    // ---- Bước 7-8: cấp số + diff + ghi ----
    var numberedMatches = resolveNumbersFromMatches(filtered.matches, existingCustomerRows, 'titleNo');
    var numberedCustomerRows = numberedMatches.map(function (match) { return match.record; });

    // isEqualFn quyết định "coi là không đổi" -> KHÔNG ghi lại dòng đó.
    //
    // PHẢI có titleId và titleName: chúng là 2 trường của khoá cascade, và 110
    // dòng khớp ở tầng 2/3 (mô phỏng spec §5.4 lần 3) khớp được CHÍNH VÌ một
    // trong hai vừa đổi giá trị. Nếu không so 2 trường này thì những dòng đó bị
    // coi là "không đổi", giá trị mới không bao giờ được ghi, và tầng 2/3 phải
    // chạy lại mỗi ngày mãi mãi.
    //
    // 2 field ngày dùng sameDateValue() (không phải sameValue()): xem JSDoc của
    // sameDateValue trong logic/upsert.js — String(Date) chứa cả giờ+timezone.
    //
    // Dùng sameValue() thay vì '===' cho phần còn lại: giá trị vừa build có thể
    // là undefined trong khi giá trị đọc lại từ sheet cho cùng "không có gì" đó
    // là chuỗi rỗng — so '===' trực tiếp từng gây update sai ~99% số dòng.
    var customerIsEqualFn = function (a, b) {
      return sameValue(a.cmsId, b.cmsId)
        && sameValue(a.titleId, b.titleId)
        && sameValue(a.titleName, b.titleName)
        && sameValue(a.author, b.author)
        && sameValue(a.genre, b.genre)
        && sameValue(a.publisher, b.publisher)
        && sameValue(a.label, b.label)
        && sameValue(a.policy, b.policy)
        && sameValue(a.general, b.general)
        && sameValue(a.logoJudgement, b.logoJudgement)
        && sameDateValue(a.preStart, b.preStart)
        && sameDateValue(a.preEnd, b.preEnd);
    };
    var customerDiff = diffUpsertFromMatches(numberedMatches, customerIsEqualFn);
    Logger.log('顧客作品マスタ 集計: 追加 ' + customerDiff.toAdd.length + ' 件 / 更新 ' + customerDiff.toUpdate.length
      + ' 件 / 変化なし ' + customerDiff.unchangedKeys.length + ' 件 / 孤立行 ' + filtered.orphanOffsets.length + ' 行');
```

- [ ] **Step 3: Sửa khối コピーライトマスタ**

Trong khối `// ---- Bước 6-7: コピーライトマスタ`, đổi comment tiêu đề thành `// ---- Bước 9: コピーライトマスタ (key theo タイトルNo, dùng lại số vừa gán ở trên) ----`. Phần code **không đổi** — nó đã dùng `numberedCustomerRows`, biến này vẫn tồn tại (Step 2 đã định nghĩa lại từ `numberedMatches`).

- [ ] **Step 4: Sửa khối changeDetail (Bước 10)**

Thay danh sách `fieldDefs` của `顧客作品マスタ`:

```js
    var customerChangeRows = buildChangeDetailRows('顧客作品マスタ', customerDiff.toUpdate, [
      { key: 'author', label: '作家名' },
      { key: 'genre', label: 'ジャンル' },
      { key: 'publisher', label: '出版社' },
      { key: 'logoJudgement', label: '③シーモアロゴ判定' },
      { key: 'remark', label: '備考' },
      { key: 'copyright', label: 'コピーライト' },
    ], runAt);
```

bằng:

```js
    // Danh sách này PHẢI khớp với các cột mà customerRecordToRow() thực sự ghi
    // (io/sheetIO.js) — field không có cột thì log ra chỉ gây nhiễu (cột 備考 và
    // コピーライト đã bị bỏ khỏi ガワ mới nên bị xoá khỏi đây).
    var customerChangeRows = buildChangeDetailRows('顧客作品マスタ', customerDiff.toUpdate, [
      { key: 'titleId', label: 'タイトルID' },
      { key: 'titleName', label: 'タイトル名' },
      { key: 'cmsId', label: 'CMS ID' },
      { key: 'author', label: '作家名' },
      { key: 'genre', label: 'ジャンル' },
      { key: 'publisher', label: '出版社' },
      { key: 'label', label: 'レーベル名' },
      { key: 'preStart', label: '先行開始日', compare: sameDateValue },
      { key: 'preEnd', label: '先行終了日', compare: sameDateValue },
      { key: 'policy', label: '①広告出稿ポリシー' },
      { key: 'general', label: '②一般面出稿NG' },
      { key: 'logoJudgement', label: '③シーモアロゴ判定' },
    ], runAt);
```

- [ ] **Step 5: Thêm bước 11 (cảnh báo) ngay sau `appendChangeDetailRows`**

```js
    // ---- Bước 11: 4 loại cảnh báo (spec §6) ----
    // Gộp cả 4 loại rồi ghi 1 lần, để 1 lần chạy = 1 khối dòng liền nhau trên
    // GAS1警告, dễ đọc theo thời điểm chạy.
    var warningRows = buildMatchWarningRows(numberedMatches, runAt)
      .concat(buildOrphanWarningRows(existingCustomerRows, filtered.orphanOffsets, runAt))
      .concat(buildNgTitleWarningRows(numberedCustomerRows, ngTitleLookup, runAt));
    appendWarningRows(warningRows);
    var warningCounts = { match: 0, ambiguous: 0, orphan: 0, ngTitle: 0 };
    warningRows.forEach(function (row) {
      if (row.kind === WARNING_KIND_MATCH) warningCounts.match += 1;
      else if (row.kind === WARNING_KIND_AMBIGUOUS) warningCounts.ambiguous += 1;
      else if (row.kind === WARNING_KIND_ORPHAN) warningCounts.orphan += 1;
      else if (row.kind === WARNING_KIND_NG_TITLE) warningCounts.ngTitle += 1;
    });
    Logger.log('GAS1警告 記録: ' + warningRows.length + ' 件（照合注意 ' + warningCounts.match
      + ' / 照合曖昧 ' + warningCounts.ambiguous + ' / 孤立行 ' + warningCounts.orphan
      + ' / 外部出稿NG注意 ' + warningCounts.ngTitle + '）');
```

- [ ] **Step 6: Thêm 6 số đếm vào `appendLogEntry()` ở nhánh try**

```js
    appendLogEntry({
      startedAt: startedAt,
      finishedAt: finishedAt,
      addedCount: customerDiff.toAdd.length,
      updatedCount: customerDiff.toUpdate.length,
      excludedNgCount: filtered.excludedNg.length,
      excludedUnjudgedCount: filtered.excludedUnjudged.length,
      matchNoticeCount: warningCounts.match,
      matchAmbiguousCount: warningCounts.ambiguous,
      orphanCount: warningCounts.orphan,
      ngTitleNoticeCount: warningCounts.ngTitle,
      irregularTitles: irregularTitles,
      errors: errors,
    });
```

Nhánh `catch` giữ nguyên (6 field mới thiếu -> `appendLogEntry` tự ghi 0).

- [ ] **Step 7: Xoá khối cảnh báo CMSID trùng**

Xoá toàn bộ khối từ comment `// Cảnh báo nếu 1 CMSID vẫn ứng với NHIỀU tác phẩm khác nhau` tới hết `titleNamesByCmsId.forEach(...)`, thay bằng:

```js
    // (Khối cảnh báo "1 CMSID ứng với nhiều tác phẩm" đã bị xoá 2026-08-03:
    // CMSID không còn là khoá nên việc nó trùng không còn gây hậu quả gì. Vai
    // trò "báo khi khoá nhập nhằng" giờ do cảnh báo 照合曖昧 đảm nhiệm — nó báo
    // đúng thứ bây giờ mới nguy hiểm: nhiều dòng master cùng khớp một record.)
```

- [ ] **Step 8: Sửa 3 hàm probe cũ + thêm 2 hàm probe mới**

`probe_readRegulation()` — thay thân bằng:

```js
function probe_readRegulation() {
  var raw = readSheetValues(CONFIG.SOURCES.REGULATION.spreadsheetId, CONFIG.SOURCES.REGULATION.sheetName);
  var records = parseRegulationRows(raw);
  var lookup = buildRegulationLookup(records);
  var ngCount = 0;
  lookup.forEach(function (value) { if (value.isNg) ngCount += 1; });
  Logger.log('判定済み: ' + records.length + ' 件 / タイトル名ユニーク: ' + lookup.size
    + ' 件 / うち NG 判定: ' + ngCount + ' 件');
  Logger.log(JSON.stringify(records.slice(0, 3), null, 2));
}
```

`probe_resolveCopyrightForOneWork()` — thay 2 dòng liên quan `cmsCopyrightLookup`:

```js
  var work = { cmsId: 999999, titleId: 111111, titleName: 'サンプルタイトル', author: 'サンプル作家', publisher: 'アルファポリス' };

  var cmsRaw = readSheetValues(CONFIG.SOURCES.CMS.spreadsheetId, CONFIG.SOURCES.CMS.sheetName);
  var cmsCopyrightLookup = buildCmsCopyrightLookup(parseCmsRows(cmsRaw));
```

bằng:

```js
  // copyrightU chính là tầng 1 — đặt '' để thử các tầng dưới, hoặc điền giá trị
  // thật của cột コピーライト (CMS) để xác nhận tầng 1 hoạt động.
  var work = { titleId: 111111, titleName: 'サンプルタイトル', author: 'サンプル作家',
    publisher: 'アルファポリス', copyrightU: '' };
```

và dòng gọi:

```js
  var result = resolveCopyright(work, cmsCopyrightLookup, PUBLISHER_SHEET_PARSERS, publisherMaps, basicNotationMap);
```

bằng:

```js
  var result = resolveCopyright(work, PUBLISHER_SHEET_PARSERS, publisherMaps, basicNotationMap);
```

Thêm 2 probe mới vào cuối file:

```js
/**
 * Chạy thử CHỈ ĐỌC: xác nhận GAS❶ dò đúng hàng header của ガワ mới 顧客作品マスタ
 * và thấy đủ 13 cột bắt buộc. Chạy hàm này TRƯỚC khi chạy runGas1() lần đầu
 * sau khi đổi ガワ — nó không ghi gì, chỉ đọc.
 */
function probe_readCustomerMasterHeader() {
  var cfg = CONFIG.OUTPUTS.CUSTOMER_WORK_MASTER;
  var resolved = resolveMasterHeader(cfg.spreadsheetId, cfg.sheetName, CUSTOMER_REQUIRED_HEADERS);
  Logger.log('ヘッダー行: ' + (resolved.headerRowIndex + 1) + ' 行目 / 列数: ' + resolved.columnCount
    + ' / データ行: ' + Math.max(resolved.values.length - resolved.headerRowIndex - 1, 0) + ' 行');
  var names = [];
  resolved.headerIndex.forEach(function (index, name) { names.push(index + ':' + name); });
  Logger.log(names.sort(function (a, b) { return Number(a.split(':')[0]) - Number(b.split(':')[0]); }).join('\n'));
}

/**
 * Chạy thử CHỈ ĐỌC toàn bộ luồng lọc + khớp dòng, KHÔNG ghi gì lên sheet nào.
 *
 * Đây là hàm cần chạy trước lần `runGas1()` đầu tiên: nó in ra đúng những con
 * số mà spec §12 đã đo (đối tượng vào master / bị loại NG / bị loại 未判定) để
 * đối chiếu, cộng thêm phân bố tầng khớp và số cảnh báo — nhìn là biết ngay
 * lần chạy thật sẽ làm gì.
 */
function probe_dryRunFilter() {
  var regulationRaw = readSheetValues(CONFIG.SOURCES.REGULATION.spreadsheetId, CONFIG.SOURCES.REGULATION.sheetName);
  var cmsRaw = readSheetValues(CONFIG.SOURCES.CMS.spreadsheetId, CONFIG.SOURCES.CMS.sheetName);

  var regulationLookup = buildRegulationLookup(parseRegulationRows(regulationRaw));
  var works = buildCustomerWorkRows(parseCmsRows(cmsRaw), regulationLookup);
  var existingRows = readCustomerWorkMaster();
  var filtered = filterAndMatchWorks(works, existingRows);

  var tiers = [0, 0, 0, 0];
  var ambiguous = 0;
  filtered.matches.forEach(function (match) {
    tiers[match.tier] += 1;
    if (match.ambiguous) ambiguous += 1;
  });

  Logger.log('CMS 全: ' + works.length + ' 件 / 既存マスタ: ' + existingRows.length + ' 行');
  Logger.log('対象: ' + filtered.matches.length + ' 件（新規 ' + tiers[0] + ' / 第1層 ' + tiers[1]
    + ' / 第2層 ' + tiers[2] + ' / 第3層 ' + tiers[3] + '）');
  Logger.log('除外: NG ' + filtered.excludedNg.length + ' 件、未判定 ' + filtered.excludedUnjudged.length + ' 件');
  Logger.log('照合曖昧: ' + ambiguous + ' 件 / 孤立行: ' + filtered.orphanOffsets.length + ' 行');
  Logger.log('除外(NG) の先頭5件: ' + filtered.excludedNg.slice(0, 5).map(function (w) {
    return w.titleName + '【' + w.policy + '/' + w.general + '】';
  }).join(' | '));
}
```

- [ ] **Step 9: Kiểm tra không còn tham chiếu tới API cũ**

Run: `rtk grep -rn "cmsCopyrightLookup\|lookupRegulation\|attachRowOffsets(customerDiff\|buildCmsCopyrightLookup" src/`
Expected: **0 kết quả**. (`attachRowOffsets` vẫn còn định nghĩa + dùng cho `copyrightDiff` — đúng.)

Run: `node tools/verify/run.js --data`
Expected: `88 passed, 0 failed` — harness không nạp `main.js` nhưng chạy lại toàn bộ để chắc chắn Task 9 không vô tình sửa file pure nào.

- [ ] **Step 10: `clasp push` — lần đầu tiên kể từ Task 2**

Run: `rtk npx clasp push`
Expected: push thành công, **không có lỗi syntax**. Nếu báo lỗi "function not defined" thì đó là lỗi runtime, `clasp push` không bắt được — bước kiểm chứng thật ở Task 12.

- [ ] **Step 11: Commit**

```bash
rtk git add src/main.js && rtk git commit -m "Rewire runGas1 around the regulation filter and cascade key"
```

---

### Task 10: `config.js` — giờ chạy 9時・17時

**Files:**
- Modify: `src/config.js` (đúng 1 dòng)

**Interfaces:** không có API mới.

- [ ] **Step 1: Đổi `TRIGGER_HOURS`**

Thay:

```js
  TRIGGER_HOURS: [9, 18],
```

bằng:

```js
  // 9時・17時 theo ô B8 của ガワ mới: '①更新タイミング：毎日　9時、17時にGASで
  // 更新＋旧情報アーカイブ' (spec §10c). Phần '旧情報アーカイブ' CHƯA được cài
  // đặt — ngoài phạm vi (spec §2).
  TRIGGER_HOURS: [9, 17],
```

**KHÔNG sửa gì khác trong file này.** Các `spreadsheetId` đang trỏ bản DEMO (có comment `//DEMO`) và 5 sheet NXB đang bị comment out là cấu hình test có chủ đích của user — giữ nguyên.

- [ ] **Step 2: Commit**

```bash
rtk git add src/config.js && rtk git commit -m "Move the GAS1 trigger to 9:00 and 17:00 per the new master note"
```

- [ ] **Step 3: Cài lại trigger (chạy tay trong Apps Script editor)**

Trigger cũ (9h/18h) vẫn tồn tại trong project cho tới khi hàm này chạy lại — `createGas1Trigger()` tự xoá mọi trigger trỏ tới `runGas1` trước khi tạo mới, nên chạy lại nhiều lần vẫn chỉ có đúng 2 trigger.

**Chỉ chạy sau khi Task 12 xác nhận `runGas1()` chạy đúng** — cài trigger trước nghĩa là để bản chưa kiểm chứng tự chạy lúc 9h/17h.

---

### Task 11: Cập nhật spec và tài liệu vận hành

Spec §7 hiện đang mô tả ガワ **cũ** (B→Q, có cột `コピーライト`, chưa có `タイトル区分`/`LP制作`). Ai đọc spec sau này sẽ tưởng code sai.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-regulation-title-name-key-design.md` (§7, §11, thêm §13)
- Modify: `docs/gas1-van-hanh.md` (§1, §2, §4, §5, thêm §3g/§3h)

- [ ] **Step 1: Thay bảng cột ở spec §7**

Thay tiêu đề `## 7. ガワ mới của 顧客作品マスタ` + đoạn mô tả + bảng cột bằng nội dung mới: header hàng 15, dữ liệu từ hàng 16, cột A đệm, **B→U**, và bảng 21 dòng đúng như bảng "ガワ mới của 顧客作品マスタ" ở đầu file plan này (copy nguyên bảng đó sang, kèm cột "Hàng 13 ghi `自動入力/GAS`?").

Thêm ngay dưới bảng:

```markdown
> ⚠️ **ガワ đã đổi 2 lần trong ngày 2026-08-03.** Bảng trên là bản thứ hai, đã
> xác minh trên CẢ `example/【池永社内】顧客作品マスタ0803.xlsx` (bản user cập
> nhật buổi chiều) và sheet `顧客作品マスタ` của `example/【ソル】タイトルマスタ
> ガワ作成 0803 .xlsx` — hai file khớp nhau. Bản đầu tiên (B→Q, có cột
> `コピーライト`, chưa có `タイトル区分`/`LP制作`/`先行終了日（延長）`) KHÔNG còn
> hiệu lực.
>
> Vì `io/sheetIO.js` tra cột theo TÊN header, việc thứ tự cột đổi hoàn toàn
> (vd `タイトル名` từ cột E sang cột K) không tốn dòng code nào. Nhưng **7 cột
> GAS không sở hữu** (A đệm, E `タイトル区分`, I `掲載停止日付`, J `LP制作`,
> R/S `先行終了日（延長）/（最終確定）`, T/U `大量無料開始日/終了日`) thì bắt buộc
> phải bảo toàn khi update — xem `customerRecordToRow()`.
```

- [ ] **Step 2: Thêm §13 vào spec — 3 cột mới chưa có quyết định**

```markdown
## 13. Ba cột mới của ガワ (bản chiều 2026-08-03) — CHƯA thiết kế, chờ user

Ba cột dưới đây xuất hiện ở bản ガワ thứ hai và **không** nằm trong phạm vi lần
triển khai này. Cần user trả lời trước khi làm:

| Cột | Ghi chú trên sheet | Vướng ở đâu |
|---|---|---|
| E `タイトル区分` | `┗コミットフラグ：2.先行配信（出稿コミット）` / `┗独占フラグ：先行タイトル一覧からコミットフラグが入ってないもの全て` | Cần file `【安蒜社内】出稿コミット管理表（新作・既存・キャン強化）` — **chưa có file, chưa có ID**. Có dấu `自動入力/GAS` nên đúng là việc của GAS. |
| J `LP制作` | `ジャンル＋ロゴ有無で管理` / `・ロゴなし作品→K列が「ロゴなし」の場合` / `・TL→P列が「TL」の場合` / `・BL→P列が「BL」の場合` | `K列` khớp với `③シーモアロゴ判定` của sheet レギュレーション. Nhưng `P列` **không** khớp cột nào mang giá trị TL/BL ở cả 2 nguồn (レギュレーション có TL/BL ở cột `G ジャンル`, CMS có ở `J R18フラグ(TL、BL)`). Ô này lại **KHÔNG** có dấu `自動入力/GAS` → có thể là cột người điền. Cần user xác nhận: GAS làm hay người làm, và `P列` là cột nào. |
| R/S `先行終了日（延長）` / `（最終確定）` | `→【先行作品】独占期間の延長（代理店共有）から反映` / `・W列記載無し→V列反映` / `・W列記載あり→W列反映` | Nguồn `【安蒜社内】【先行作品】独占期間の延長（代理店共有）` chưa có. Cũng không có dấu `自動入力/GAS`. |

Ngoài ra, `コピーライトマスタ` cũng đã có ガワ mới trong workbook `【ソル】タイトル
マスタ ガワ作成` (header hàng 15, B→P, tách `正規コピーライト` thành
`タイトル個別コピーライト(あれば優先使用)` + `出版社コピーライト`, lịch sử giảm
10 → **5** slot, thêm nguồn `出版社別コピーライトマスタ` thay `基本のC表記`) —
**cần spec riêng**, không gộp vào lần này.
```

- [ ] **Step 3: Cập nhật spec §11 (kiểm chứng)**

Thay bảng 2 script Python + đoạn "Đề nghị chuyển vào repo" bằng:

```markdown
Kiểm chứng đã được đưa vào repo (thay cho 2 script Python nằm ở scratchpad,
vốn đã mất cùng session):

| Đường | Kiểm chứng gì |
|---|---|
| `node tools/verify/run.js` | Test đơn vị tầng pure: định nghĩa NG (§3.2), lookup theo tên + NG-thắng (§4.1), cascade 3 tầng + chiếm-một-lần (§5.2/§5.3), rule 2 (§3.4), 4 loại cảnh báo (§6). Không cần dữ liệu thật, chạy trong ~1 giây. |
| `python tools/verify/exportFixtures.py` rồi `node tools/verify/run.js --data` | Đối chiếu lại TỪNG con số ở §12 trên dữ liệu thật trong `example/`, và mô phỏng lại 4 lần chạy liên tiếp của §5.4 (khẳng định 0 dòng trùng). |
| `tools/verify/liveCheck.gs` | Đo trên sheet LIVE (chỉ đọc) — dùng khi cần biết dữ liệu live có khác bản export không. |
| `probe_dryRunFilter()` (trong `src/main.js`) | Chạy trong Apps Script editor, chỉ ĐỌC: in ra số vào master / bị loại / phân bố tầng khớp trên dữ liệu live trước khi chạy thật. |

`tools/**` đã bị `.claspignore` loại nên không đẩy lên project GAS❶.
```

- [ ] **Step 4: Cập nhật `docs/gas1-van-hanh.md`**

4 chỗ phải sửa (nội dung hiện tại đều đã sai sau thay đổi này):

1. **§1 sơ đồ luồng**: thêm bước lọc レギュレーション giữa "build work" và "đánh số"; đổi mũi tên nguồn レギュレーション từ "cấp cột ③" thành "lọc + cấp cột ①②③"; đổi nguồn `外部出稿用NGタイトル` từ "→ cột 備考" thành "→ cảnh báo `GAS1警告`".
2. **§2 thứ tự thực thi**: thay bằng 12 bước của spec §8 (copy từ JSDoc `runGas1()` sau Task 9).
3. **§4 bảng "file nào làm việc gì"**: thêm 2 dòng `logic/regulationFilter.js` và `logic/warnings.js`; sửa dòng `sources/regulationSource.js` (vai trò bộ lọc) và `logic/upsert.js` (cascade 3 tầng).
4. **§5 "2 sheet log"** → **"3 sheet log"**: thêm `GAS1警告` (1 dòng = 1 cảnh báo, 4 loại), và ghi rõ `GAS1ログ` giờ có 6 cột số đếm mới.

Thêm 2 mục bài học mới ở cuối phần bài học:

```markdown
## 3g. Bài học 7: khoá không còn trường bất biến thì phải là CASCADE, không phải khoá ghép

Bỏ CMSID khỏi logic (2026-08-03) làm mất trường bất biến duy nhất. Phản xạ đầu
tiên là ghép `タイトルID + タイトル名` thành một khoá — nhưng đo trên 1.730 dòng
thật thì khoá ghép có **110 dòng sẽ đổi giá trị khoá** (đổi trường nào cũng đổi
khoá), mà đổi khoá = sinh dòng trùng. Cascade 3 tầng (`ID+tên` → `ID số` →
`tên`) giữ được cả 1.730 dòng qua 4 lần chạy mô phỏng với 0 dòng trùng, vì mỗi
tầng bắt đúng một kiểu biến động: tầng 2 bắt ca đổi TÊN, tầng 3 bắt ca ID từ
trống/chữ thành SỐ.

Kèm theo cascade là 2 thứ **không thể bỏ**:
- **Chiếm-một-lần**: 2 tác phẩm thật dùng chung `タイトルID` 266030
  (`冬すぎて桜` và `冬すぎて桜【タテヨミ】`) sẽ cùng ghi vào 1 dòng ở tầng 2 và
  **mất 1 record trong im lặng** nếu thiếu ràng buộc này.
- **Điều kiện "cả hai bên đều là số thật" ở tầng 2**: thiếu nó thì mọi dòng
  `タイトルID` trống khớp lẫn nhau (khoá rỗng = khoá rỗng), và 3 dòng cùng ghi
  `4415行目と同一` trong ô ID cũng khớp nhau.

## 3h. Bài học 8: ghi cả dòng bằng mảng rỗng sẽ XOÁ những cột mình không sở hữu

ガワ mới của 顧客作品マスタ có 7 cột GAS không ghi (`タイトル区分`, `掲載停止日付`,
`LP制作`, `先行終了日（延長）`, `（最終確定）`, `大量無料開始日/終了日`) — có cột
người điền tay, có cột chờ nguồn dữ liệu chưa tồn tại. Cách ghi cũ
(`new Array(columnCount).fill('')` rồi `setValues` cả dòng) sẽ xoá trắng cả 7
cột đó **mỗi lần dòng bị update** — không có lỗi nào để nhận ra, chỉ là dữ liệu
người ta nhập tự nhiên biến mất sau 9h sáng.

Cách đúng: dựng dòng ghi **từ bản copy của dòng cũ** (`previous.rawRow`) rồi chỉ
ghi đè các cột GAS sở hữu. Lợi thêm: cột do 池永 thêm về sau cũng tự động được
giữ, không cần sửa code.
```

- [ ] **Step 5: Commit**

```bash
rtk git add docs/ && rtk git commit -m "Document the new master layout, cascade key, and warning sheet"
```

---

### Task 12: Kiểm chứng end-to-end trên sheet thật

**Files:** không sửa file nào (chỉ chạy + quan sát).

⚠️ **Chạy trên spreadsheet DEMO** (các ID có comment `//DEMO` trong `src/config.js`). Nếu ai đó đã đổi `config.js` sang ID production thì **dừng và xin xác nhận user trước**, vì bước Step 3 xoá dữ liệu `コピーライトマスタ`.

- [ ] **Step 1: Xác nhận dò được header của ガワ mới (chỉ đọc)**

Trong Apps Script editor, chạy `probe_readCustomerMasterHeader()`.

Expected:
```
ヘッダー行: 15 行目 / 列数: 21 / データ行: 0 行
1:タイトルNo
2:CMSID
3:タイトルID
4:タイトル区分
5:①広告出稿ポリシー
...
20:大量無料終了日
```
(tên cột in ra đã qua `normalizeHeaderText` nên `CMS ID` hiện thành `CMSID`, `先行終了日（延長）` hiện liền không có `\n` — đúng.)

Nếu throw `Không tìm thấy dòng header chứa đủ các cột` → sheet live **chưa** được cập nhật sang ガワ mới. Dừng ở đây và báo user; không sửa `CUSTOMER_REQUIRED_HEADERS` cho khớp sheet cũ.

- [ ] **Step 2: Dry-run bộ lọc (chỉ đọc) và đối chiếu spec §12**

Chạy `probe_dryRunFilter()`.

Expected — với master đang trống, các con số phải xấp xỉ §12:
```
CMS 全: 5649 件 / 既存マスタ: 0 行
対象: 1730 件（新規 1730 / 第1層 0 / 第2層 0 / 第3層 0）
除外: NG 595 件、未判定 3324 件
照合曖昧: 0 件 / 孤立行: 0 行
```
Dữ liệu live có thể đã trôi so với bản export trong `example/` — chênh vài chục là bình thường. **Chênh lớn (vd 対象 < 1.000 hoặc > 3.000) thì DỪNG**: khả năng cao là join theo tên bị trượt, không phải dữ liệu trôi.

- [ ] **Step 3: Xoá sạch `コピーライトマスタ` trước lần chạy đầu (spec §10b)**

`タイトルNo` được cấp lại từ 1, nên số cũ trong `コピーライトマスタ` sẽ **trỏ sai tác phẩm**. Trước khi xoá: **File > Make a copy** để giữ bản backup, rồi xoá các dòng dữ liệu (giữ hàng header).

Nếu `顧客作品マスタ` chưa trống thì cũng phải xoá dòng dữ liệu của nó (giữ hàng 1-15). Bản gốc đã được 池永 giữ ở sheet `顧客作品マスタ_元` nên không mất gì.

- [ ] **Step 4: Chạy `runGas1()` lần 1**

Expected trong Execution log:
- Không có exception.
- `レギュレーションフィルタ: 対象 ~1730 件 / 除外(NG) ~595 件 / 除外(未判定) ~3324 件`
- `顧客作品マスタ 集計: 追加 ~1730 件 / 更新 0 件 / 変化なし 0 件 / 孤立行 0 行`
- `GAS1警告 記録: ~10 件（照合注意 0 / 照合曖昧 0 / 孤立行 0 / 外部出稿NG注意 ~10）`
  — 10 ca `外部出稿NG注意` là con số spec §10a đã đo.

Mở sheet kiểm bằng mắt:
- Dữ liệu bắt đầu từ **hàng 16**, cột **A trống**.
- Cột F/G/H có giá trị phán định (vd `問題なし` / `一般面OK` / `ロゴなし`).
- Cột O `レーベル名` có giá trị (cột mới lần này).
- Cột E, I, J, R, S, T, U **trống**.
- Không có dòng nào có `②一般面出稿NG` = `アダルト作品扱い` hoặc `アダルトジャンル`, và không có dòng nào `①広告出稿ポリシー` = `問題あり` (đúng theo bộ lọc, vì đây là lần chạy đầu nên rule 2 không giữ ai).

- [ ] **Step 5: Chạy `runGas1()` lần 2 ngay sau đó — đây là bài kiểm quan trọng nhất**

Expected: `追加 0 件 / 更新 0 件 / 変化なし ~1730 件`, `孤立行 0 行`, `GAS1警告` chỉ thêm lại ~10 dòng `外部出稿NG注意` (loại cảnh báo này ghi lại mỗi lần chạy, đúng thiết kế).

- **`追加 > 0` = khoá upsert đang sinh dòng trùng.** Dừng, so `タイトルNo` của dòng vừa thêm với dòng cũ có cùng tên để tìm tầng nào trượt.
- **`更新` lớn (vd > 100)** = có field bị coi là "đã đổi" ở mọi lần chạy. Mở `GAS1変更詳細`, xem cột `変更フィールド` nào chiếm đa số — nếu là `先行開始日`/`先行終了日` thì `sameDateValue` chưa được áp đúng chỗ.

- [ ] **Step 6: Kiểm bảo toàn 7 cột GAS không sở hữu**

Trên `顧客作品マスタ`, gõ tay giá trị thử vào **một dòng bất kỳ**: `コミット` vào cột E, `2026/12/31` vào cột I, `TL` vào cột J, ngày vào T và U.

Sửa nguồn để dòng đó chắc chắn bị update — cách an toàn nhất là **sửa ngay trên master**: xoá giá trị cột L `作家名` của chính dòng đó (GAS sẽ ghi lại từ CMS).

Chạy `runGas1()` lần 3. Expected:
- `更新 1 件` và `作家名` được ghi lại đúng.
- **Cả 5 giá trị gõ tay ở E/I/J/T/U vẫn còn nguyên.**

Nếu chúng bị xoá → `customerRecordToRow()` chưa nhận `previous.rawRow`, hoặc `writeCustomerWorkMaster()` truyền `undefined` cho nhánh update.

- [ ] **Step 7: Kiểm rule 2 (tác phẩm chuyển NG sau khi đã vào master)**

Không sửa được sheet レギュレーション (chỉ đọc), nên kiểm bằng cách **sửa trên chính master**: chọn 1 dòng, đổi tay cột G `②一般面出稿NG` thành `アダルト作品扱い`, rồi chạy `runGas1()`.

Expected: dòng đó **vẫn còn** trên master (không bị xoá — `削除等はしない`), và bị `更新 1 件` để trả cột G về giá trị thật của レギュレーション. Đây đúng là hành vi rule 2: GAS không xoá, chỉ đồng bộ lại cột F/G/H.

- [ ] **Step 8: Kiểm 3 tab log**

- `GAS1ログ`: hàng 1 giờ có **12 cột**, dòng mới nhất có số ở `除外_NG件数` / `除外_未判定件数`.
- `GAS1警告`: có tab mới, ~10 dòng `外部出稿NG注意` mỗi lần chạy, cột `詳細` ghi rõ nội dung `備考`.
- `GAS1変更詳細`: chỉ có dòng của những field thật sự đổi.

- [ ] **Step 9: Cài lại trigger**

Chạy `createGas1Trigger()` (Task 10 Step 3). Kiểm ở **Triggers** (biểu tượng đồng hồ): đúng **2** trigger `runGas1`, 9h và 17h, timezone Asia/Tokyo.

- [ ] **Step 10: Commit kết quả kiểm chứng vào tài liệu**

Ghi các con số THẬT đo được ở Step 2/4/5 vào spec §12 dưới dạng một dòng bảng mới `(đo trên sheet live, ngày ...)` — để lần sau có mốc so sánh, thay vì chỉ có số từ bản export.

```bash
rtk git add docs/superpowers/specs/2026-08-03-regulation-title-name-key-design.md && rtk git commit -m "Record the live-run numbers from the first regulation-filter run"
```

---

### Task 13: Cột I `掲載停止日付` — TSV trên Drive, join theo `タイトルID`, ghi một lần

Làm **sau Task 12**, tức tăng dần trên hệ thống đã chạy được và đã kiểm chứng. Trước task này cột I luôn trống và được bảo toàn; sau task này GAS điền vào ô trống nhưng **không bao giờ ghi đè**.

> **⚠️ MỘT Ô TRỐNG DUY NHẤT TRONG PLAN NÀY:** tôi không mở được file TSV (Drive connector chưa authorize, và không có bản tải về trong `example/`), nên **2 tên cột** của TSV + **encoding** chưa biết. Step 1-2 của task này là chạy probe (code đầy đủ ở dưới) để in ra header thật rồi điền vào 3 giá trị CONFIG. Không có chỗ nào khác trong task phải đoán.
>
> Nếu muốn tôi điền sẵn: lưu 1 file `multi_title_yyyyMMdd.tsv` vào `example/` rồi bảo tôi cập nhật plan.

**Files:**
- Modify: `src/config.js` (thêm `SOURCES.SUSPENSION`)
- Create: `src/io/driveTsv.js`
- Create: `src/sources/suspensionSource.js`
- Modify: `src/logic/upsert.js` (thêm `sameWriteOnceValue`)
- Modify: `src/logic/warnings.js` (thêm `WARNING_KIND_SUSPENSION` + `buildSuspensionWarningRows`)
- Modify: `src/io/sheetIO.js` (cột I vào `CUSTOMER_REQUIRED_HEADERS`, đọc + ghi-một-lần)
- Modify: `src/io/logSheet.js` (thêm 1 cột `掲載停止注意件数`)
- Modify: `src/main.js` (đọc TSV, gắn `suspensionDate`, cảnh báo, số đếm, probe)
- Modify: `tools/verify/loadSrc.js` (thêm `src/sources/suspensionSource.js` vào `PURE_FILES`)
- Create: `tools/verify/tests/80-suspension.test.js`

**Interfaces:**
- Produces: `findLatestSuspensionFile(config, today) -> {file: File, dateKey: string} | null` (`io/driveTsv.js`)
- Produces: `readTsvRows(file, encoding) -> Array<Array<string>>` (`io/driveTsv.js`)
- Produces: `parseSuspensionRows(rawRows, titleIdHeader, suspensionDateHeader) -> Array<{titleId, suspensionDate}>` (pure)
- Produces: `buildSuspensionLookup(records) -> Map<string, string>` — khoá `normalizeJapaneseText(titleId)`, **chỉ nhận ID là số thật**, giá trị là ngày **nguyên văn** từ TSV
- Produces: `lookupSuspensionDate(work, suspensionLookup) -> string` — `''` nếu không tra ra
- Produces: `sameWriteOnceValue(existingValue, incomingValue) -> boolean` (`logic/upsert.js`)
- Produces: `buildSuspensionWarningRows(records, suspensionLookup, suspensionFileName, runAt) -> Array<object>`
- Đổi: `readCustomerWorkMaster()` trả thêm `suspensionDate`; `customerRecordToRow()` ghi cột I khi ô đang trống.

- [ ] **Step 1: Thêm `SOURCES.SUSPENSION` vào `src/config.js` + viết `src/io/driveTsv.js` + probe, rồi CHẠY probe**

Trong `src/config.js`, thêm vào cuối object `SOURCES` (sau `PUBLISHER_RULES`):

```js
    // Nguồn cột I 掲載停止日付 của 顧客作品マスタ (user cung cấp 2026-08-03).
    // Folder: https://drive.google.com/drive/folders/1nv1ivJBdMGe7LOdHfAqX30AIZY55ge6a
    // Trong folder có nhiều file theo ngày; GAS lấy file có yyyyMMdd LỚN NHẤT
    // mà không vượt ngày chạy.
    SUSPENSION: {
      folderId: "1nv1ivJBdMGe7LOdHfAqX30AIZY55ge6a",
      filePattern: "^multi_title_(\\d{8})\\.tsv$",
      // 3 giá trị dưới đây phải được XÁC NHẬN bằng probe_dumpSuspensionTsv()
      // trước lần chạy thật đầu tiên — xem plan Task 13 Step 1-2.
      encoding: "UTF-8",
      titleIdHeader: "",
      suspensionDateHeader: "",
    },
```

Create `src/io/driveTsv.js`:

```js
// io/driveTsv.js — đọc file TSV từ 1 folder Drive (chỉ ĐỌC).
//
// Đây là file DUY NHẤT trong codebase dùng DriveApp. Nằm ở io/ vì đúng nguyên
// tắc module của spec §9: mọi thứ nói chuyện với Google đều ở io/, còn phần
// parse nội dung TSV là hàm pure ở sources/suspensionSource.js.
//
// ⚠️ QUYỀN TRUY CẬP: đây là lần đầu project dùng DriveApp, nên scope OAuth
// của project sẽ đổi. Lần chạy đầu sau khi push, Apps Script sẽ hỏi cấp quyền
// lại (Review permissions -> Allow) — kể cả với người đã authorize trước đó.
// Trigger tự động cũng sẽ THẤT BẠI cho tới khi có người chạy tay 1 lần để cấp
// quyền. appsscript.json không cần khai oauthScopes: Apps Script tự phát hiện.

/**
 * Tìm file TSV mới nhất trong folder mà không vượt quá ngày chạy.
 *
 * So sánh bằng CHUỖI 'yyyyMMdd' thay vì parse ra Date: chuỗi yyyyMMdd có thứ
 * tự từ điển trùng khớp với thứ tự thời gian, nên so chuỗi vừa đúng vừa không
 * gặp bất kỳ vấn đề timezone nào.
 *
 * Bỏ qua file có ngày TRONG TƯƠNG LAI (nếu ai đó đặt sẵn file cho ngày mai)
 * để kết quả không phụ thuộc việc hôm nay là ngày nào của người đọc log.
 *
 * @param {{folderId: string, filePattern: string}} config - CONFIG.SOURCES.SUSPENSION
 * @param {Date} today - Thời điểm chạy (truyền startedAt của runGas1 vào)
 * @returns {{file: File, dateKey: string}|null} null nếu folder không có file nào khớp
 */
function findLatestSuspensionFile(config, today) {
  var folder = DriveApp.getFolderById(config.folderId);
  var pattern = new RegExp(config.filePattern);
  var todayKey = Utilities.formatDate(today, CONFIG.TRIGGER_TIMEZONE, 'yyyyMMdd');

  var files = folder.getFiles();
  var best = null;
  while (files.hasNext()) {
    var file = files.next();
    var matched = pattern.exec(file.getName());
    if (!matched) continue;
    if (matched[1] > todayKey) continue;
    if (best === null || matched[1] > best.dateKey) best = { file: file, dateKey: matched[1] };
  }
  return best;
}

/**
 * Đọc 1 file TSV thành mảng 2 chiều, cùng dạng với kết quả
 * sheet.getDataRange().getValues() — nhờ vậy các hàm parse trong sources/ dùng
 * được resolveHeaderIndex()/col() y như với dữ liệu đọc từ Sheets.
 *
 * KHÔNG xử lý dấu ngoặc kép kiểu CSV (TSV xuất từ hệ thống thường không quote,
 * và tab không thể xuất hiện trong tên tác phẩm). Nếu về sau phát hiện file có
 * quote, đây là chỗ phải sửa.
 *
 * Bỏ dòng rỗng (file TSV hay có 1 dòng trắng ở cuối).
 *
 * @param {File} file - Từ findLatestSuspensionFile()
 * @param {string} encoding - vd 'UTF-8' hoặc 'Shift_JIS' (CONFIG.SOURCES.SUSPENSION.encoding)
 * @returns {Array<Array<string>>}
 */
function readTsvRows(file, encoding) {
  var text = file.getBlob().getDataAsString(encoding);
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(function (line) { return line !== ''; })
    .map(function (line) { return line.split('\t'); });
}
```

Thêm probe vào cuối `src/main.js`:

```js
/**
 * Chạy thử CHỈ ĐỌC: tìm file multi_title_yyyyMMdd.tsv mới nhất và in ra 3 dòng
 * đầu theo CẢ 2 encoding, để xác nhận 3 giá trị CONFIG.SOURCES.SUSPENSION
 * (encoding / titleIdHeader / suspensionDateHeader) trước lần chạy thật.
 *
 * Chạy hàm này TRƯỚC KHI điền 3 giá trị đó — xem plan Task 13 Step 1-2.
 */
function probe_dumpSuspensionTsv() {
  var config = CONFIG.SOURCES.SUSPENSION;
  var found = findLatestSuspensionFile(config, new Date());
  if (found === null) {
    Logger.log('Không tìm thấy file nào khớp ' + config.filePattern + ' trong folder ' + config.folderId);
    return;
  }
  Logger.log('File: ' + found.file.getName() + ' (' + found.dateKey + '), '
    + found.file.getSize() + ' bytes, updated ' + found.file.getLastUpdated());

  ['UTF-8', 'Shift_JIS'].forEach(function (encoding) {
    Logger.log('===== ' + encoding + ' =====');
    try {
      var rows = readTsvRows(found.file, encoding);
      Logger.log('Số dòng: ' + rows.length + ' / số cột dòng đầu: ' + rows[0].length);
      rows.slice(0, 3).forEach(function (row, i) {
        Logger.log('[' + i + '] ' + row.map(function (cell, c) { return c + ':' + cell; }).join(' | '));
      });
    } catch (error) {
      Logger.log('Lỗi đọc với ' + encoding + ': ' + String(error));
    }
  });
}
```

Run: `rtk npx clasp push`, rồi trong Apps Script editor chạy `probe_dumpSuspensionTsv()`.
Lần đầu Google sẽ hỏi cấp quyền Drive → **Review permissions → Allow**.

Expected: log in ra tên file + 3 dòng đầu, trong đó **một** encoding cho ra tiếng Nhật đọc được (encoding kia ra mojibake).

- [ ] **Step 2: Điền 3 giá trị CONFIG theo kết quả probe**

Trong `src/config.js`, sửa 3 dòng:
- `encoding`: đặt bằng encoding cho ra tiếng Nhật đọc được ở Step 1.
- `titleIdHeader`: **copy chính xác** tên ô header của cột chứa `タイトルID` (in ra ở dòng `[0]`).
- `suspensionDateHeader`: **copy chính xác** tên ô header của cột chứa ngày dừng phân phối.

Nếu log dòng `[0]` **không phải header** (file không có hàng header, dòng đầu đã là dữ liệu) thì **DỪNG và báo user** — parse theo tên cột không dùng được, cần chốt lại cách định vị cột (theo số cột) và đó là một quyết định thiết kế mới, không phải chi tiết triển khai.

- [ ] **Step 3: Viết test — phải FAIL**

Thêm `'src/sources/suspensionSource.js'` vào `PURE_FILES` trong `tools/verify/loadSrc.js` (đặt ngay sau `'src/sources/ngTitleSource.js'`).

Create `tools/verify/tests/80-suspension.test.js`:

```js
// tools/verify/tests/80-suspension.test.js
//
// Header dùng trong test là tên GIẢ ĐỊNH ('タイトルID' / '掲載停止日付') — mục
// đích là kiểm LOGIC parse/lookup/ghi-một-lần, không phải kiểm tên cột thật.
// Tên thật nằm ở CONFIG.SOURCES.SUSPENSION và được truyền vào như tham số
// (chính vì vậy parseSuspensionRows nhận tên cột qua tham số chứ không hardcode).

module.exports = {
  run: function (ctx) {
    var src = ctx.src;
    var check = ctx.check;

    var TSV = [
      ['タイトルID', '作品名', '掲載停止日付'],
      ['266030', '冬すぎて桜', '2025/2/8'],
      ['300001', '別作品', '2026/01/31'],
      ['300002', '停止日なし', ''],
      ['ー', 'ID placeholder', '2026/03/01'],
      ['', 'ID trống', '2026/03/02'],
      ['266030', 'trùng ID, dòng sau', '2099/12/31'],
    ];

    var records = src.parseSuspensionRows(TSV, 'タイトルID', '掲載停止日付');
    check('parseSuspensionRows doc het dong data (loc o buoc lookup)', records.length, 6);

    var lookup = src.buildSuspensionLookup(records);
    check('lookup chi nhan タイトルID la so that, bo qua ー va rong',
      Array.from(lookup.keys()).sort(), ['266030', '300001']);
    check('lookup bo qua dong khong co ngay dung', lookup.has('300002'), false);
    check('lookup: ID trung thi dong DAU TIEN thang', lookup.get('266030'), '2025/2/8');
    check('lookup giu NGUYEN VAN ngay tu TSV (khong parse, khong format)',
      lookup.get('300001'), '2026/01/31');

    function work(titleId) { return { titleId: titleId }; }
    check('lookupSuspensionDate: tra duoc theo so, ke ca khi titleId la number',
      [src.lookupSuspensionDate(work(266030), lookup), src.lookupSuspensionDate(work('266030'), lookup)],
      ['2025/2/8', '2025/2/8']);
    check('lookupSuspensionDate tra "" khi titleId khong phai so hoac khong tra ra',
      [src.lookupSuspensionDate(work('ー'), lookup), src.lookupSuspensionDate(work(''), lookup),
        src.lookupSuspensionDate(work(999999), lookup)],
      ['', '', '']);

    // ---- Ghi một lần: ô đã có giá trị thì LUÔN coi là "không đổi" ----
    check('sameWriteOnceValue: o da co gia tri -> khong bao gio ghi de',
      [src.sameWriteOnceValue('2025/2/8', '2099/12/31'),
        src.sameWriteOnceValue('2025/2/8', ''),
        src.sameWriteOnceValue(new Date(2025, 1, 8), '2026/01/31')],
      [true, true, true]);
    check('sameWriteOnceValue: o trong + co gia tri moi -> can ghi (khac nhau)',
      src.sameWriteOnceValue('', '2026/01/31'), false);
    check('sameWriteOnceValue: o trong + khong co gia tri moi -> khong doi',
      [src.sameWriteOnceValue('', ''), src.sameWriteOnceValue(undefined, ''),
        src.sameWriteOnceValue('　', undefined)],
      [true, true, true]);

    // ---- Cảnh báo ----
    var noFileRows = src.buildSuspensionWarningRows([], new Map(), null, new Date(2026, 7, 3));
    check('canh bao khi khong tim thay file TSV',
      [noFileRows.length, noFileRows[0].kind], [1, src.WARNING_KIND_SUSPENSION]);

    var shared = [
      { titleNo: 1, titleId: 266030, titleName: '冬すぎて桜' },
      { titleNo: 2, titleId: 266030, titleName: '冬すぎて桜【タテヨミ】' },
      { titleNo: 3, titleId: 300001, titleName: '別作品' },
    ];
    var sharedRows = src.buildSuspensionWarningRows(shared, lookup, 'multi_title_20260803.tsv', new Date());
    check('canh bao khi nhieu tac pham dung chung 1 titleID co ngay dung',
      sharedRows.map(function (r) { return r.titleNo; }), [1, 2]);
    check('khong canh bao cho titleID chi 1 tac pham dung',
      sharedRows.filter(function (r) { return r.titleNo === 3; }).length, 0);
  },
};
```

Run: `node tools/verify/run.js`
Expected: FAIL — `src.parseSuspensionRows is not a function`.

- [ ] **Step 4: Tạo `src/sources/suspensionSource.js`**

```js
// sources/suspensionSource.js — parse file multi_title_yyyyMMdd.tsv để lấy
// 掲載停止日付 (cột I của 顧客作品マスタ).
//
// Hàm PURE — nhận mảng 2 chiều đã đọc sẵn (io/driveTsv.readTsvRows()).
//
// KHOÁ JOIN LÀ タイトルID (user chốt 2026-08-03), so khớp CHỈ KHI cả hai vế là
// số thật. Vì sao phải chặn (cùng lý do tầng 2 của cascade, spec §5.2):
// タイトルID của CMS có 104 dòng trống và nhiều ô bị dùng để ghi chú ('ー',
// '4415行目と同一', '※既に配信済みのためCMS削除') — không chặn thì các dòng đó
// khớp lẫn nhau qua khoá rỗng/khoá trùng và nhận ngày dừng của nhau.
//
// HAI HỆ QUẢ ĐÃ BIẾT, đều được ghi cảnh báo chứ không im lặng:
//   (a) ~6% dòng master không bao giờ nhận được 掲載停止日付 vì タイトルID
//       trống/không phải số.
//   (b) 2 tác phẩm dùng chung 1 タイトルID (có thật: 冬すぎて桜 và
//       冬すぎて桜【タテヨミ】 cùng 266030) sẽ cùng nhận một ngày dừng.
//
// GIÁ TRỊ NGÀY được giữ NGUYÊN VĂN, không parse thành Date và không format lại
// (spec §4.4): ta không biết chắc định dạng trong TSV, và parse sai một ngày
// dừng phân phối là loại lỗi im lặng tệ nhất. Cột I lại là cột GHI MỘT LẦN nên
// không có nguy cơ churn do lệch định dạng.

/**
 * Parse nội dung TSV thành danh sách bản ghi thô.
 *
 * Tên 2 cột được TRUYỀN VÀO (không hardcode) vì file này do hệ thống khác xuất
 * ra, tên header chỉ được xác nhận bằng probe_dumpSuspensionTsv() và được lưu ở
 * CONFIG.SOURCES.SUSPENSION — coi tên cột là CẤU HÌNH, không phải code.
 *
 * @param {Array<Array<string>>} rawRows - Kết quả io/driveTsv.readTsvRows()
 * @param {string} titleIdHeader - CONFIG.SOURCES.SUSPENSION.titleIdHeader
 * @param {string} suspensionDateHeader - CONFIG.SOURCES.SUSPENSION.suspensionDateHeader
 * @returns {Array<{titleId: string, suspensionDate: string}>}
 * @throws {Error} Nếu 2 tên cột chưa được điền, hoặc không dò được hàng header
 */
function parseSuspensionRows(rawRows, titleIdHeader, suspensionDateHeader) {
  if (!titleIdHeader || !suspensionDateHeader) {
    throw new Error('CONFIG.SOURCES.SUSPENSION.titleIdHeader/suspensionDateHeader chưa được điền — '
      + 'chạy probe_dumpSuspensionTsv() để xem header thật của file TSV');
  }
  var resolved = resolveHeaderIndex(rawRows, [titleIdHeader, suspensionDateHeader]);
  var idx = resolved.headerIndex;
  var colTitleId = col(idx, titleIdHeader);
  var colDate = col(idx, suspensionDateHeader);

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    records.push({
      titleId: row[colTitleId],
      suspensionDate: row[colDate],
    });
  }
  return records;
}

/**
 * Build bảng tra normalize(タイトルID) -> 掲載停止日付 (nguyên văn).
 *
 * Bỏ qua dòng có タイトルID không phải số thật, và dòng không có ngày dừng
 * (dòng như vậy không mang thông tin gì để ghi).
 *
 * ID trùng nhau -> DÒNG ĐẦU TIÊN THẮNG. Chọn "đầu tiên" thay vì "cuối cùng" để
 * kết quả không đổi khi hệ thống nguồn thêm dòng vào cuối file; nếu về sau phát
 * hiện TSV chứa nhiều dòng cho cùng 1 ID với ngày khác nhau và ngày cuối mới là
 * ngày đúng, đây là chỗ sửa.
 *
 * @param {Array<object>} records - Kết quả parseSuspensionRows()
 * @returns {Map<string, string>}
 */
function buildSuspensionLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    if (!isDigits(record.titleId)) return;
    if (normalizeJapaneseText(record.suspensionDate) === '') return;
    var key = normalizeJapaneseText(record.titleId);
    if (!lookup.has(key)) lookup.set(key, record.suspensionDate);
  });
  return lookup;
}

/**
 * Tra 掲載停止日付 cho 1 tác phẩm theo タイトルID.
 *
 * @param {{titleId: *}} work
 * @param {Map<string, string>} suspensionLookup - Kết quả buildSuspensionLookup()
 * @returns {string} Ngày dừng nguyên văn, hoặc '' nếu không tra ra
 */
function lookupSuspensionDate(work, suspensionLookup) {
  if (!isDigits(work.titleId)) return '';
  var value = suspensionLookup.get(normalizeJapaneseText(work.titleId));
  return value === undefined ? '' : value;
}
```

- [ ] **Step 5: Thêm `sameWriteOnceValue()` vào `src/logic/upsert.js`**

Thêm ngay sau `sameDateValue()`:

```js
/**
 * So sánh dành cho cột GHI MỘT LẦN (hiện chỉ có cột I 掲載停止日付).
 *
 * Quy tắc (user chốt 2026-08-03): ô nào ĐANG CÓ giá trị thì không bao giờ bị
 * ghi đè — dù nguồn nói khác, dù giá trị đó do người gõ tay. GAS chỉ điền vào ô
 * đang trống. Vì vậy hàm này trả về true ("không đổi") ngay khi vế existing có
 * giá trị, bất kể incoming là gì.
 *
 * Hệ quả tốt: cột ghi-một-lần KHÔNG THỂ gây churn. Nếu so bằng sameValue() thì
 * chuỗi '2025/2/8' đọc từ TSV và giá trị Date mà Google Sheets tự chuyển đổi
 * khi ghi vào ô sẽ khác nhau ở MỌI lần chạy, làm cả sheet bị ghi lại mỗi ngày.
 *
 * CHÚ Ý THỨ TỰ THAM SỐ: hàm này KHÔNG đối xứng. Phải gọi
 * sameWriteOnceValue(existing, incoming) — đảo 2 vế sẽ cho hành vi ngược lại.
 *
 * @param {*} existingValue - Giá trị đang có trên sheet
 * @param {*} incomingValue - Giá trị vừa tra được từ nguồn
 * @returns {boolean} true nếu coi là "không cần ghi"
 */
function sameWriteOnceValue(existingValue, incomingValue) {
  if (normalizeForCompare(existingValue) !== '') return true;
  return normalizeForCompare(incomingValue) === '';
}
```

- [ ] **Step 6: Thêm cảnh báo vào `src/logic/warnings.js`**

Thêm hằng số cạnh 4 hằng số cũ:

```js
var WARNING_KIND_SUSPENSION = '掲載停止注意';
```

Thêm hàm vào cuối file:

```js
/**
 * 掲載停止注意 — 2 tình huống của nguồn TSV cột I (spec: quyết định bổ sung 7).
 *
 * 1. Không tìm thấy file multi_title_yyyyMMdd.tsv nào trong folder: cột I được
 *    để nguyên (đúng theo quy tắc ghi-một-lần), nhưng phải báo — nếu file ngừng
 *    được xuất ra mà không ai biết, cột I sẽ âm thầm đứng yên vĩnh viễn.
 * 2. Nhiều tác phẩm dùng chung một タイトルID có ngày dừng: cả nhóm sẽ nhận
 *    CÙNG một ngày. Có thể đúng (2 phiên bản của cùng tác phẩm cùng dừng), có
 *    thể sai — con người phải xem.
 *
 * KHÔNG cảnh báo cho tác phẩm có タイトルID trống/không phải số (khoảng 6% dòng
 * master): chúng không bao giờ tra ra được ngày dừng, nhưng cảnh báo ~104 dòng
 * mỗi lần chạy sẽ nhấn chìm 4 loại cảnh báo còn lại. Con số này đã được ghi
 * trong spec §12 và trong JSDoc của sources/suspensionSource.js.
 *
 * @param {Array<object>} records - Tác phẩm được vào master (đã có titleNo)
 * @param {Map<string, string>} suspensionLookup - buildSuspensionLookup(), Map rỗng nếu không có file
 * @param {string|null} suspensionFileName - Tên file đã dùng, null nếu không tìm thấy file nào
 * @param {Date} runAt
 * @returns {Array<object>}
 */
function buildSuspensionWarningRows(records, suspensionLookup, suspensionFileName, runAt) {
  var rows = [];
  if (!suspensionFileName) {
    rows.push(warningRow(runAt, WARNING_KIND_SUSPENSION, '', '', '',
      'multi_title_yyyyMMdd.tsv が見つかりませんでした → 掲載停止日付(I列)は今回据え置き'));
  }

  var byTitleId = new Map();
  records.forEach(function (record) {
    if (!isDigits(record.titleId)) return;
    var key = normalizeJapaneseText(record.titleId);
    if (!suspensionLookup.has(key)) return;
    if (!byTitleId.has(key)) byTitleId.set(key, []);
    byTitleId.get(key).push(record);
  });
  byTitleId.forEach(function (group, key) {
    if (group.length < 2) return;
    var names = group.map(function (record) { return record.titleName; }).join(' / ');
    group.forEach(function (record) {
      rows.push(warningRow(runAt, WARNING_KIND_SUSPENSION, record.titleNo, record.titleId, record.titleName,
        'タイトルID ' + key + ' を ' + group.length + ' 作品が共有 → 同じ掲載停止日付「'
        + suspensionLookup.get(key) + '」が入ります: ' + names));
    });
  });
  return rows;
}
```

- [ ] **Step 7: Chạy test — phải PASS**

Run: `node tools/verify/run.js`
Expected: `99 passed, 0 failed`.

- [ ] **Step 8: Sửa `src/io/sheetIO.js` — đọc + ghi-một-lần cột I**

Thêm `'掲載停止日付'` vào cuối `CUSTOMER_REQUIRED_HEADERS`.

Sửa khối comment "7 CỘT GAS KHÔNG SỞ HỮU" thành:

```js
// 6 CỘT GAS KHÔNG SỞ HỮU (phải giữ nguyên giá trị người ta điền tay):
//   A (đệm), E タイトル区分 (nguồn 出稿コミット管理表 chưa có file),
//   J LP制作, R 先行終了日（延長）, S 先行終了日（最終確定）,
//   T/U 大量無料開始日・終了日 (nguồn chưa có).
//
// Cột I 掲載停止日付 là trường hợp RIÊNG: GAS ĐIỀN nhưng chỉ khi ô đang TRỐNG —
// ghi một lần, không bao giờ ghi đè (nguồn: multi_title_yyyyMMdd.tsv trên
// Drive, join theo タイトルID). Xem customerRecordToRow().
```

Trong `readCustomerWorkMaster()`, thêm khai báo cột và field:

```js
  var colSuspension = col(idx, '掲載停止日付');
```

```js
      suspensionDate: row[colSuspension],
```

Trong `customerRecordToRow()`, thêm **sau** 3 dòng ghi cột F/G/H:

```js
  // Cột I 掲載停止日付 — GHI MỘT LẦN: chỉ điền khi ô đang trống. row[] tại đây
  // đang giữ giá trị của dòng cũ (hoặc '' nếu là dòng mới), nên điều kiện dưới
  // đây đọc đúng "ô trên sheet có trống không".
  var colSuspension = col(headerIndex, '掲載停止日付');
  if (normalizeJapaneseText(row[colSuspension]) === '' && record.suspensionDate) {
    row[colSuspension] = record.suspensionDate;
  }
```

- [ ] **Step 9: Thêm 1 cột vào `GAS1ログ` (`src/io/logSheet.js`)**

Trong `LOG_HEADER`, thêm `'掲載停止注意件数'` ngay sau `'外部出稿NG注意件数'`. Trong `appendLogEntry()`, thêm `entry.suspensionNoticeCount || 0` vào đúng vị trí tương ứng.

`ensureLogHeaderRow()` tự nâng cấp hàng header của sheet đang có — không cần làm gì tay.

- [ ] **Step 10: Nối vào `src/main.js`**

Thêm sau khối đọc `basicNotationMap`/`publisherMaps` (trước bước 3):

```js
    // ---- Nguồn cột I 掲載停止日付 (ghi một lần, join theo タイトルID) ----
    // Không tìm thấy file thì KHÔNG throw: cột I là cột ghi-một-lần nên "không
    // có dữ liệu mới" là trạng thái vô hại (giá trị đang có được giữ nguyên).
    // Chỉ cảnh báo, để việc nguồn ngừng xuất file không im lặng mãi.
    var suspensionFound = findLatestSuspensionFile(CONFIG.SOURCES.SUSPENSION, startedAt);
    var suspensionFileName = suspensionFound === null ? null : suspensionFound.file.getName();
    var suspensionLookup = new Map();
    if (suspensionFound === null) {
      Logger.log('掲載停止日付: フォルダに ' + CONFIG.SOURCES.SUSPENSION.filePattern
        + ' に一致するファイルがありません -> I列は据え置き');
    } else {
      var suspensionRaw = readTsvRows(suspensionFound.file, CONFIG.SOURCES.SUSPENSION.encoding);
      suspensionLookup = buildSuspensionLookup(parseSuspensionRows(suspensionRaw,
        CONFIG.SOURCES.SUSPENSION.titleIdHeader, CONFIG.SOURCES.SUSPENSION.suspensionDateHeader));
      Logger.log('掲載停止日付: ' + suspensionFileName + ' から ' + suspensionLookup.size + ' 件読み込み完了');
    }
```

Trong vòng lặp bước 6 (tính bản quyền), thêm 1 dòng:

```js
      work.suspensionDate = lookupSuspensionDate(work, suspensionLookup);
```

Trong `customerIsEqualFn`, thêm 1 vế **cuối cùng** (thứ tự tham số quan trọng — `a` là existing, `b` là incoming):

```js
        && sameWriteOnceValue(a.suspensionDate, b.suspensionDate);
```

(chuyển dấu `;` của vế cuối cũ thành phần của biểu thức — vế `sameDateValue(a.preEnd, b.preEnd)` kết thúc bằng `&&`.)

Trong khối cảnh báo (bước 11), nối thêm builder mới:

```js
      .concat(buildSuspensionWarningRows(numberedCustomerRows, suspensionLookup, suspensionFileName, runAt));
```

và thêm vào `warningCounts` + vòng đếm:

```js
    var warningCounts = { match: 0, ambiguous: 0, orphan: 0, ngTitle: 0, suspension: 0 };
```
```js
      else if (row.kind === WARNING_KIND_SUSPENSION) warningCounts.suspension += 1;
```

và vào `appendLogEntry()` của nhánh try:

```js
      suspensionNoticeCount: warningCounts.suspension,
```

Thêm `{ key: 'suspensionDate', label: '掲載停止日付', compare: sameWriteOnceValue }` vào `fieldDefs` của `buildChangeDetailRows('顧客作品マスタ', ...)` — nhờ `compare` riêng, log chỉ ghi lần GAS thật sự điền vào ô trống, không ghi lần nào khác.

- [ ] **Step 11: Kiểm tra + push**

Run: `node tools/verify/run.js --data`
Expected: `99 passed, 0 failed` (test dữ liệu không đụng tới cột I nên không đổi).

Run: `rtk npx clasp push`

- [ ] **Step 12: Kiểm chứng trên sheet thật**

1. Chạy `probe_dumpSuspensionTsv()` lần nữa — xác nhận `titleIdHeader`/`suspensionDateHeader` đã điền đúng (không throw).
2. Chạy `runGas1()`. Expected trong log:
   - `掲載停止日付: multi_title_yyyyMMdd.tsv から N 件読み込み完了`
   - `更新 X 件` với X = số dòng master vừa được điền cột I lần đầu.
   - `GAS1警告` có thêm dòng `掲載停止注意` nếu có タイトルID bị nhiều tác phẩm dùng chung.
3. Mở sheet: cột I có ngày ở những dòng tra ra được, trống ở những dòng không tra ra.
4. **Sửa tay 1 ô cột I** (đổi ngày thành `2099/12/31`) rồi chạy `runGas1()` lần nữa.
   Expected: **`更新 0 件`** và ô đó **vẫn là `2099/12/31`** — đây là bài kiểm quy tắc ghi-một-lần. Nếu giá trị bị đổi về ngày của TSV thì `sameWriteOnceValue` đang bị gọi ngược thứ tự tham số ở `customerIsEqualFn`.
5. **Xoá trắng 1 ô cột I** đang có ngày, chạy lại. Expected: ô đó được điền lại bằng ngày trong TSV (`更新 1 件`).

- [ ] **Step 13: Commit**

```bash
rtk git add src/config.js src/io/driveTsv.js src/sources/suspensionSource.js src/logic/upsert.js src/logic/warnings.js src/io/sheetIO.js src/io/logSheet.js src/main.js tools/verify && rtk git commit -m "Fill 掲載停止日付 once from the daily Drive TSV, keyed by titleID"
```

- [ ] **Step 14: Cập nhật spec §10d và §13**

Trong spec, thay mục **(d) Cột Q `掲載停止日付` — tạm skip** bằng:

```markdown
### (d) Cột I `掲載停止日付` — ĐÃ CÓ NGUỒN (cập nhật 2026-08-03)

Bản đầu của mục này viết "tạm skip, để trống" vì bản レギュレーション ta có không
có cột nào mang nghĩa này. User đã cung cấp nguồn thật:

- **Folder Drive:** `1nv1ivJBdMGe7LOdHfAqX30AIZY55ge6a`
- **File:** `multi_title_yyyyMMdd.tsv` (nhiều file theo ngày; GAS lấy file có
  `yyyyMMdd` lớn nhất mà không vượt ngày chạy)
- **Khoá join:** `タイトルID`, chỉ khớp khi cả hai vế là số thật
- **Ghi một lần:** ô đang có giá trị thì GAS không bao giờ ghi đè; chỉ điền vào
  ô trống

Hai hệ quả đã biết: ~6% dòng master không bao giờ nhận được ngày dừng (`タイトルID`
trống/không phải số), và 2 tác phẩm dùng chung 1 `タイトルID` sẽ cùng nhận một
ngày (cả 2 được ghi cảnh báo `掲載停止注意` trong `GAS1警告`).

Lưu ý cho lần sau: một phần thông tin dừng phân phối cũng đang nằm rải trong
`備考` của `外部出稿用NGタイトル` (mục a) và trong nguồn `配信停止一覧` (ngoài phạm
vi). Khi có thời gian, đối chiếu 3 nguồn này với nhau.
```

Trong §13, xoá dòng nói `掲載停止日付` còn treo (nếu có), giữ lại 3 cột còn thiếu nguồn.

```bash
rtk git add docs/ && rtk git commit -m "Record the Drive TSV source for 掲載停止日付"
```

---

## Self-Review: đối chiếu plan với spec

**Bao phủ spec** — mỗi mục có task tương ứng:

| Spec | Task |
|---|---|
| §3.1/§3.2 định nghĩa NG (kể cả 4 giá trị KHÔNG tính NG) | Task 2 (`isRegulationNg` + 5 test cho các giá trị không NG) |
| §3.3 điều kiện vào master, 未判定 bị loại | Task 6 (`filterAndMatchWorks` phase B) |
| §3.4 rule 2 — đã có trên master thì giữ | Task 6 (phase B), Task 12 Step 7 |
| §3.5 chiều ngược NG → không NG (được thêm mới như tác phẩm mới) | Task 6 — không cần code riêng: work hết NG sẽ vào phase A và nhận `titleNo` kế tiếp nếu không khớp dòng nào |
| §3.6 コピーライトマスタ dựng từ danh sách đã lọc | Task 9 Step 3 (`numberedCustomerRows` = danh sách đã lọc) |
| §4.1 khoá join `タイトル名` 完全一致, NG thắng | Task 2 (`buildRegulationLookup`) |
| §4.4 chuẩn hoá chỉ để so khớp | Task 4 (test "cột タイトル名 giữ nguyên cách viết CMS"), Global Constraints |
| §5.2 cascade 3 tầng + điều kiện số thật | Task 5 (`matchExistingRow`, `isDigits`) |
| §5.3 chiếm-một-lần | Task 5 (`claimMatch`, test case `冬すぎて桜`) |
| §5.4 mô phỏng 4 lần chạy | Task 6 Step 4 (`60-dataset.test.js`) |
| §5.5 CMSID: vẫn ghi, không dùng logic; lọc theo `タイトル名` | Task 3, Task 7 |
| §6 4 cảnh báo + 2 số đếm | Task 8 (+ 4 số đếm nữa: 照合注意/照合曖昧/孤立行/外部出稿NG注意) |
| §7 ガワ mới (đã cập nhật sang bản B→U) | Task 7, Task 11 Step 1 |
| §8 thứ tự thực thi | Task 9 |
| §9 ranh giới module | Task 2-9 (bảng File Structure) |
| §9.1 xoá `buildCmsCopyrightLookup` | Task 3 |
| §10a 備考 → cảnh báo | Task 8 (`buildNgTitleWarningRows`) |
| §10b lần chạy đầu không seed, xoá コピーライトマスタ | Task 12 Step 3 |
| §10c `TRIGGER_HOURS [9, 17]` | Task 10 |
| §10d cột `掲載停止日付` | **Task 13** — user đã cung cấp nguồn (TSV trên Drive, join theo `タイトルID`, ghi một lần), ghi đè quyết định "tạm skip" của spec |
| §11 chuyển kiểm chứng vào repo | Task 1, Task 11 Step 3 |
| §12 số liệu tham chiếu | Task 6 Step 4 (assert từng con số) |

**Lệch có chủ ý so với spec** (đã giải thích lý do ở mục "Quyết định thiết kế bổ sung"): cảnh báo ghi ở tab `GAS1警告` thay vì trong ô của `GAS1ログ`; lọc + match làm 1 lượt thay vì 2 bước rời như §8; giữ `diffUpsert`/`resolveNumbers` cũ cho `コピーライトマスタ` thay vì đổi chữ ký như §9.

**Không có trong spec, plan này thêm:** bảo toàn 7 cột GAS không sở hữu (quyết định 6), `sameDateValue` cho field ngày (quyết định 4), `titleId`/`titleName` trong `isEqualFn` (quyết định 5), `sheetRow` thay cho `rowOffset + 2` (quyết định 7), `colByPrefix` cho header có hậu tố ghi chú (Task 2).

**Thêm sau khi viết plan (user cung cấp 2026-08-03):** Task 13 — cột I `掲載停止日付` lấy từ `multi_title_yyyyMMdd.tsv` trên Drive, join theo `タイトルID`, **ghi một lần không ghi đè**. Đây là file đầu tiên trong project dùng `DriveApp`, nên scope OAuth đổi và **phải có người chạy tay 1 lần để cấp quyền Drive**, nếu không trigger tự động sẽ thất bại.

**Còn treo, cần user quyết trước khi làm:** 3 cột mới `タイトル区分` / `LP制作` / `先行終了日（延長）(最終確定）` và ガワ mới của `コピーライトマスタ` — xem mục "Ngoài phạm vi" và spec §13 (Task 11 Step 2).

---

## Execution Handoff

Plan hoàn tất, lưu ở `docs/superpowers/plans/2026-08-03-regulation-filter-cascade-key.md`. Hai cách thực thi:

**1. Subagent-Driven (khuyến nghị)** — mỗi task 1 subagent mới, review giữa các task, vòng lặp nhanh. Dùng skill `superpowers:subagent-driven-development`.

**2. Inline Execution** — chạy các task trong session này theo `superpowers:executing-plans`, có checkpoint để review.

Lưu ý về thứ tự khi thực thi: Task 1 → 6 chạy hoàn toàn offline (Node), **Task 2 tới Task 8 để repo ở trạng thái không chạy được trên Apps Script** — chỉ `clasp push` ở Task 9. Task 12 cần quyền chạy trên spreadsheet DEMO. **Task 13 làm sau Task 12** (tăng dần trên hệ thống đã kiểm chứng) và cần cấp quyền Drive lần đầu.

# GAS❶ — Sơ đồ vận hành

Tài liệu này giải thích **luồng dữ liệu** và **thứ tự thực thi** của GAS❶ ở mức tổng quan, để đọc trước khi đi vào từng file code (mỗi function trong `src/` đều có JSDoc chi tiết riêng).

Xem thêm:
- Spec thiết kế: `docs/superpowers/specs/2026-07-17-gas1-customer-copyright-master-design.md`
- Kế hoạch implement: `docs/superpowers/plans/2026-07-17-gas1-customer-copyright-master.md`

## 1. Sơ đồ luồng dữ liệu (data flow)

```mermaid
flowchart TB
    subgraph SRC["3 spreadsheet nguồn (đọc trực tiếp qua SpreadsheetApp.openById)"]
        REG["作品レギュレーション判定<br/>(sheet: シート1)"]
        CMS["先行タイトル情報 CMS<br/>(sheet: ★列追加の場合は増渕まで★)"]
        PUB["出版社からの追記ルールと外部出稿NGタイトル<br/>(7 sheet: NG title, 基本のC表記,<br/>+ 5 sheet riêng NXB)"]
    end

    subgraph PARSE["src/sources/*.js — parse theo TÊN header (không hardcode số cột)"]
        parseReg["parseRegulationRows()"]
        parseCms["parseCmsRows()"]
        parseNg["parseNgTitles()"]
        parseBasic["parseBasicNotation()"]
        parsePub["PUBLISHER_SHEET_PARSERS<br/>(LINE/スクエニ/リブレ/オーバーラップ/ヒーローズ)"]
    end

    REG --> parseReg --> lookupReg["buildRegulationLookup()<br/>Map cmsId → ③シーモアロゴ判定"]
    CMS --> parseCms
    parseCms --> lookupCms["buildCmsCopyrightLookup()<br/>Map cmsId → コピーライト (tầng 1)"]
    PUB --> parseNg --> lookupNg["buildNgTitleLookup()<br/>Map titleId/titleName → 備考"]
    PUB --> parseBasic --> mapBasic["Map NXB → công thức (tầng 3)"]
    PUB --> parsePub --> mapsPub["publisherMaps{key: Map}<br/>(tầng 2)"]

    parseCms --> buildCustomer["buildCustomerWorkRows()<br/>(logic/customerWorkMaster.js)"]
    lookupReg --> buildCustomer
    lookupNg --> buildCustomer

    buildCustomer --> resolveCopy["resolveCopyright() × mỗi tác phẩm<br/>(logic/copyrightResolver.js)<br/>4 tầng ưu tiên"]
    lookupCms --> resolveCopy
    mapsPub --> resolveCopy
    mapBasic --> resolveCopy

    resolveCopy --> numberCustomer["resolveNumbers()<br/>key = CMSID<br/>(logic/upsert.js)"]
    existingCustomer[("顧客作品マスタ<br/>(đọc trước khi build)")] -.existingCustomerRows.-> numberCustomer
    numberCustomer --> diffCustomer["diffUpsert()<br/>key = CMSID"]
    diffCustomer --> writeCustomer["writeCustomerWorkMaster()<br/>(io/sheetIO.js)"]
    writeCustomer --> customerMasterOut[("顧客作品マスタ")]

    numberCustomer -- "titleNo đã gán" --> buildCopyRows["build コピーライトマスタ rows<br/>+ shiftCopyrightHistory()<br/>(logic/copyrightHistory.js)"]
    existingCopyright[("コピーライトマスタ<br/>(đọc trước khi build)")] -.existingCopyrightRows.-> buildCopyRows
    buildCopyRows --> diffCopyright["diffUpsert()<br/>key = タイトルNo"]
    diffCopyright --> writeCopyright["writeCopyrightMaster()<br/>(io/sheetIO.js)"]
    writeCopyright --> copyrightMasterOut[("コピーライトマスタ")]

    resolveCopy -. "tier === 4 (cá biệt)" .-> slackLog["notifySlack() + appendLogEntry()<br/>(io/slack.js, io/logSheet.js)"]
    diffCustomer -.-> slackLog
```

**Điểm mấu chốt cần nhớ:**

1. **CMS là nguồn nền tảng** — danh sách tác phẩm trong `顧客作品マスタ` hoàn toàn theo CMS; 2 nguồn còn lại chỉ *bổ sung field* cho tác phẩm đã có trong CMS, không tự thêm tác phẩm mới.
2. **Khoá upsert của `顧客作品マスタ` là CMSID**, không phải タイトルID (タイトルID có thể trống hoặc dùng chung placeholder "ー" ở nhiều tác phẩm khác nhau — xem bài học ở mục 3).
3. **`コピーライトマスタ` không có cột タイトルID riêng** — nó dùng lại đúng `タイトルNo` mà `顧客作品マスタ` vừa gán, nên việc đánh số (`resolveNumbers`) phải xong TRƯỚC khi build `コピーライトマスタ`.
4. **Không bao giờ xoá dòng** — cả 2 sheet chỉ được thêm dòng mới hoặc cập nhật dòng đã đổi.

## 2. Thứ tự thực thi trong 1 lần chạy `runGas1()`

```mermaid
sequenceDiagram
    participant Trigger as Time trigger (9h/18h)
    participant Main as main.js: runGas1()
    participant Sources as sources/*.js
    participant Logic as logic/*.js
    participant IO as io/sheetIO.js
    participant Slack as io/slack.js + io/logSheet.js

    Trigger->>Main: gọi runGas1()
    Main->>IO: readSheetValues() × 3 nguồn + 5 sheet NXB
    IO-->>Main: rawRows thô
    Main->>Sources: parse*() + build*Lookup()
    Sources-->>Main: records + Map tra cứu

    Main->>Logic: buildCustomerWorkRows(cms, regulation, ngTitle)
    Logic-->>Main: danh sách work (chưa có copyright/titleNo)

    loop mỗi work
        Main->>Logic: resolveCopyright(work, ...)
        Logic-->>Main: {value, tier} — gắn vào work.copyright/copyrightTier
    end

    Main->>IO: readCustomerWorkMaster() (existing)
    Main->>Logic: resolveNumbers(existing, work[], key=CMSID)
    Logic-->>Main: work[] đã có titleNo (tái dùng số cũ nếu đã tồn tại)

    Main->>Logic: diffUpsert(existing, work[], key=CMSID)
    Logic-->>Main: {toUpdate, toAdd, unchanged}
    Main->>IO: writeCustomerWorkMaster(diff)
    IO-->>Main: đã ghi 顧客作品マスタ

    Main->>IO: readCopyrightMaster() (existing, key=titleNo)
    loop mỗi work (đã có titleNo)
        Main->>Logic: shiftCopyrightHistory(prior, work.copyright)
        Logic-->>Main: {copyrightCurrent, copyrightHistory}
    end
    Main->>Logic: diffUpsert(existingCopyright, newRows, key=titleNo)
    Main->>IO: writeCopyrightMaster(diff)
    IO-->>Main: đã ghi コピーライトマスタ

    alt có tác phẩm tier===4 (cá biệt)
        Main->>Slack: notifySlack(danh sách cá biệt)
    end
    Main->>Slack: appendLogEntry(kết quả lần chạy)

    Note over Main: Nếu bất kỳ bước nào throw:<br/>catch → log lỗi + Slack → re-throw<br/>(2 sheet output KHÔNG bị ghi dữ liệu thiếu/sai)
```

## 3. Bài học từ 1 lần debug thật (tại sao khoá = CMSID, không phải タイトルID)

Khi chạy nhiều lần, sheet output bị **trùng dòng ngày càng nhiều**. Nguyên nhân: bản đầu tiên dùng `タイトルID` làm khoá so khớp giữa dữ liệu cũ/mới. Nhưng khi kiểm tra 5649 dòng thật trong `先行タイトル情報(CMS)`:

| Vấn đề | Số liệu |
|---|---|
| タイトルID trống (null) | 197 dòng (~3.5%) |
| タイトルID = placeholder `"ー"` dùng chung cho nhiều tác phẩm khác nhau | ≥ 9 tác phẩm không liên quan |
| CMSID trống | **0 dòng** |
| CMSID bị lặp (2 dòng khác nhau cùng CMSID) | 4 giá trị (trường hợp hiếm, re-đăng ký) |

Vì nhiều tác phẩm khác nhau cùng rơi vào 1 khoá (`"null"` hoặc `"ー"`), `diffUpsert`/`resolveNumbers` (`logic/upsert.js`) không phân biệt được chúng với dòng đã ghi ở lần chạy trước → bị hiểu nhầm là "tác phẩm mới" → thêm lặp lại mỗi lần chạy. Đã sửa bằng cách đổi khoá sang `CMSID` (xem `customerKeyFn` trong `main.js`).

**Ý nghĩa cho việc đọc code:** bất cứ khi nào thấy 1 cột được chọn làm "khoá" (key) để so khớp dữ liệu cũ/mới, hãy tự hỏi "cột này có thể trống hoặc trùng giữa các bản ghi khác nhau không?" trước khi tin tưởng nó.

## 4. Bảng tra nhanh: file nào làm việc gì

| File | Vai trò | Chạy được ở đâu |
|---|---|---|
| `src/config.js` | ID spreadsheet, tên sheet, hằng số | Cả 2 (không có logic) |
| `src/util/headerMap.js` | Dò hàng header + tra cột theo tên | Cả 2 |
| `src/sources/regulationSource.js` | Parse 作品レギュレーション判定 | Cả 2 |
| `src/sources/cmsSource.js` | Parse 先行タイトル情報(CMS) | Cả 2 |
| `src/sources/ngTitleSource.js` | Parse 外部出稿用NGタイトル | Cả 2 |
| `src/sources/copyrightRules.js` | Parse 基本のC表記 + 5 sheet NXB riêng | Cả 2 |
| `src/logic/customerWorkMaster.js` | Ghép 3 nguồn thành work list | Cả 2 |
| `src/logic/copyrightResolver.js` | Logic 4 tầng bản quyền | Cả 2 |
| `src/logic/upsert.js` | Diff cũ/mới + đánh số ổn định | Cả 2 |
| `src/logic/copyrightHistory.js` | Dịch chuyển lịch sử CopyRight過去1-10 | Cả 2 |
| `src/io/sheetIO.js` | Đọc/ghi 2 sheet output thật | **Chỉ Apps Script** |
| `src/io/slack.js` | Gửi cảnh báo Slack | **Chỉ Apps Script** |
| `src/io/logSheet.js` | Ghi log GAS1ログ | **Chỉ Apps Script** |
| `src/main.js` | Điều phối toàn bộ + trigger + hàm probe debug | **Chỉ Apps Script** |

"Cả 2" nghĩa là hàm thuần JS, không đụng `SpreadsheetApp`/`UrlFetchApp`/`PropertiesService` — về mặt kỹ thuật chạy được cả trong Node lẫn Apps Script, dù project này hiện không có bộ test Node (đã bỏ theo yêu cầu, chỉ debug tay trong Apps Script editor).

# Tổ chức lại GAS❶/GAS❷ thành `gas_phase_1` / `gas_phase_2`

Ngày chốt: 2026-09-01 · Branch: `gas2-title-master` · Nền: commit `3569423` + 5 file
đang sửa dở chưa commit.

---

## 1. Vấn đề

Mục tiêu user đặt ra: **"nhìn vào là hiểu, có thể sửa liền"**.

Bản hiện tại không đạt, và lý do KHÔNG phải là file dài. Lý do là **một cột nằm rải ở
4 file**:

| Bước | File | Việc |
|---|---|---|
| 1 | `src/sources.js` | parse giá trị ra khỏi sheet nguồn |
| 2 | `src/master.js` | quy tắc suy ra giá trị cuối |
| 3 | `src/main.js` | nối dây + chọn hàm so sánh trong `customerIsEqualFn` + khai báo trong `buildChangeDetailRows` |
| 4 | `src/io.js` | đọc lại từ master + quyết định ghi hay giữ ô |

Hai bằng chứng đo được trong chính phiên làm việc này:

- Thêm cột `初回配信巻数` phải sửa **7 chỗ**.
- Bug `LP制作` tồn tại **chính vì** bước 2 và bước 4 trôi lệch nhau: `io.js` chọn
  "giữ ô khi rỗng" còn quy tắc ở `master.js` lại tính từ dữ liệu chỉ của lần chạy
  hiện tại. 13 dòng master hiện `③=ロゴあり` rõ ràng mà cột J trống vĩnh viễn.

Số liệu hiện trạng:

| | Dòng | Comment | File lớn nhất |
|---|---|---|---|
| `src/` (GAS❶) | 5.502 | 51% | `master.js` 1.281 · `sources.js` 1.080 · `main.js` 1.055 · `io.js` 915 |
| `gas2/` (GAS❷) | 1.729 | 48% | `titleMaster.js` 441 |

`gas2/titleMaster.js` là file DUY NHẤT trong repo không mắc bệnh trên, vì nó đã khai
báo cột dạng bảng (`TITLE_MASTER_COLUMNS`) — mỗi cột một dòng.

---

## 2. Quyết định đã chốt với user

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | 51% comment, nhiều đoạn là biên bản lịch sử 20–30 dòng | Giữ **1–3 dòng tại chỗ** nói hàm làm gì; toàn bộ lập luận "vì sao" dồn về `docs/decisions.md`, code chỉ còn link |
| 2 | Bản mới port nguyên trạng hay gồm cả việc đang treo | **Port + 2 fix đã xong + code luôn `初回配信巻数`** |
| 3 | Tên thư mục | `gas_phase_1` / `gas_phase_2` |
| 4 | Hướng tổ chức | **A — bảng cột khai báo + engine nhỏ** |
| 5 | Ngôn ngữ tên file | **Tiếng Anh**, cả tên file lẫn tên hàm/biến. Comment vẫn tiếng Việt |

Script ID mới (user tự tạo, 2 project Apps Script riêng):

```
gas_phase_1  1_A7ZqJ8wrois90nP0ujfhdEJnmaV4qwLJUbHJdOo5lwugBYNlHzkBmNE
gas_phase_2  1b_WPDe0I8o4ojmKT94YxfLmPhyYJYBo-gcfr2MkudDN_oMashbNGBHyY
```

Hai hướng bị loại:

- **B — chia theo giai đoạn** (`read/` → `decide/` → `write/`): gọn hơn nhưng KHÔNG
  chữa bệnh gốc. Một cột vẫn nằm ở 3 giai đoạn, `write` vẫn ở xa `compare`.
- **C — mỗi cột một file**: locality tuyệt đối nhưng 18/21 cột của 顧客作品マスタ chỉ là
  "nguyên văn từ CMS", ba dòng mỗi file. Nghi thức nhiều hơn nội dung.

---

## 3. Bố cục thư mục

Số đầu tên file là **thứ tự luồng chạy** — đọc từ `0` xuống `9` là hiểu hết hệ. Nó cũng
khoá thứ tự nạp của Apps Script thay vì phó mặc cho alphabet.

```
gas_phase_1/                          gas_phase_2/
  .clasp.json  .claspignore             .clasp.json  .claspignore
  appsscript.json                       appsscript.json
  0_config.js                           0_config.js
  1_common.js       ← shared/           1_common.js       ← shared/
  2_sheet.js        ← shared/           2_sheet.js        ← shared/
  3_sources.js                          3_sources.js
  4_customer_master.js                  4_title_master.js
  5_copyright_master.js                 8_engine.js       ← shared/
  6_matching.js                         9_main.js
  7_warnings.js
  8_engine.js       ← shared/
  9_main.js

shared/   common.js · sheet.js · engine.js · masterHeaders.js
tools/    sync-shared.js · verify/ · verify-gas2/ · parity/
docs/     decisions.md
```

`8_engine.js` **dùng chung cả 2 project**. Hiện `src/io.js` và `gas2/titleMaster.js`
cài hai bản của cùng một việc "đọc bảng cột → dựng dòng → diff → ghi"; gộp lại còn
một, ba master cùng đi qua nó.

Giữ nguyên cơ chế `shared/` chép + `--check` (`tools/sync-shared.js`) vì nó đã chặn
được drift thật; chỉ đổi đích sang 2 thư mục mới và thêm 2 file vào danh sách.

---

## 4. Engine và schema bảng cột

### 4.1 Bỏ trường `compare`

Bản nháp đầu có cả `write` lẫn `compare`. **Bỏ `compare`** — nó suy được từ `write`, và
chính việc để hai trường rời nhau là nguyên nhân bug `LP制作`.

| `write` | Nghĩa | `compare` bị ép thành |
|---|---|---|
| `上書` | ghi đè vô điều kiện, kể cả ghi rỗng | `sameValue` hoặc `sameDateValue` theo `type` |
| `条件` | có giá trị thì đè, rỗng thì giữ nguyên ô | `sameKeepWhenBlankValue` |
| `1回` | ô đã có chữ thì không bao giờ đụng | `sameWriteOnceValue` |
| `—` | GAS không ghi | (không so) |

Một trường, không còn cách nào để lệch. Bug hôm nay tồn tại đúng vì hai chỗ chọn khác
nhau; sau thay đổi này một lựa chọn duy nhất quyết định cả hai.

### 4.2 Schema

```js
{
  header: '初回配信巻数',     // tên cột THẬT trên sheet — khoá tra duy nhất
  field:  'firstVolume',     // tên property trên record
  from:   'cms',             // 'cms' | 'regulation' | 'lookup:<key>' | 'derive' | 'self'
  rule:   ruleFirstVolume,   // chỉ khi from === 'derive'; nhận (record, existing)
  write:  '上書',
  type:   'text',            // 'text' | 'date' — chỉ ảnh hưởng khi write === '上書'
  keep:   false,             // true = nguồn phụ lỗi thì lấy lại giá trị đang có trên sheet
}
```

**Không có chữ cái cột ở bất kỳ đâu.** `header` là khoá tra duy nhất — đó là thứ code
thật sự dùng và là thứ duy nhất không đổi khi 池永 chèn cột. Ba trong năm chỗ tài liệu
lệch code hiện nay tồn tại chỉ vì neo vào chữ cái.

### 4.3 `rule` nhận cả `existing`

Chữ ký `rule(record, existing)` là thứ vá bug `LP制作` một cách tự nhiên: quy tắc **thấy
được** giá trị đang có trên sheet, không phải chỉ thấy dữ liệu của lần chạy hiện tại.
Cột `③シーモアロゴ判定` được GIỮ khi 未判定, nên phán định có hiệu lực của một dòng có thể
nằm ở `existing`.

### 4.4 `keep` thay cho 5 khối `try/catch` chép tay

Hiện quy tắc "nguồn phụ lỗi thì giữ nguyên cột" nằm rải trong 5 khối
`if (xxxError !== null) { work.x = match.existing ? match.existing.x : '' }` ở
`main.js`. Giờ là một cờ, engine lo.

---

## 5. Bảng cột — file sẽ mở 90% thời gian

`4_customer_master.js`: bảng 21 dòng ở đầu, ngay dưới là **7 hàm quy tắc** của 7 cột có
logic thật (`ruleTitleCategory`, `ruleLpProduction`, `ruleFirstVolume`,
`rulePreEndFinal`, …). Toàn bộ định nghĩa master nằm trong một file cuộn hết trong một
phút, thay vì lần theo 4 file.

```js
var CUSTOMER_COLUMNS = [
  { header:'タイトルNo',     field:'titleNo',       from:'self',              write:'上書' },
  { header:'CMS ID',        field:'cmsId',         from:'cms',               write:'上書' },
  { header:'タイトル区分',    field:'titleCategory', from:'lookup:commit',     write:'上書', keep:true },
  { header:'③シーモアロゴ判定', field:'logoJudgement', from:'regulation',      write:'条件' },
  { header:'掲載停止日付',    field:'suspensionDate',from:'lookup:suspension', write:'1回' },
  { header:'LP制作',         field:'lpProduction',  from:'derive', rule:ruleLpProduction, write:'条件' },
  { header:'初回配信巻数',    field:'firstVolume',   from:'derive', rule:ruleFirstVolume,  write:'上書' },
  { header:'先行終了日（延長）',field:'preEndExtended',from:'lookup:preEnd',    write:'上書', type:'date', keep:true },
  // … 13 dòng nữa
];
```

Đúng 21 cột theo layout ガワ 0826 (`B`→`V`, header hàng 15). `5_copyright_master.js`
cùng khuôn, 16 cột. `gas_phase_2/4_title_master.js` cùng khuôn, 24 cột.

### Quy tắc `初回配信巻数` (mới, chưa từng được code)

Nguồn: CMS cột `巻数`.

| Đầu vào | Ra |
|---|---|
| `1` | `1` |
| `〇〇~XX` | `XX` |
| còn lại — số khác 1, chữ, có đuôi, ô trống, ô bị Sheets nuốt thành ngày | `顧客確認` |

Đã kiểm chứng trên dữ liệu thật:

- Dấu ngăn thật là `~` ASCII, nhưng `normalizeJapaneseText()` đã gộp sẵn cả `~` / `～` /
  `〜` và số full-width về một dạng → regex chỉ cần `~`. **Nếu theo mặt chữ của rule mà
  chỉ bắt `∼` thì 1.792 dòng rơi hết xuống `顧客確認`.**
- 5 ô đã bị Google Sheets nuốt thành NGÀY (người gõ `1-5`, `1-12`, `1-6`) — dữ liệu gốc
  đã mất, rơi vào `顧客確認`, đúng và an toàn.
- Phân bố dự kiến trên 1.977 dòng vào master: **175 / 1.792 / 10**.

Ca biên đã chốt với user: ô trống → `顧客確認`; giá trị có đuôi
(`1~5(全話一挙配信)`, `1~3巻`, `1(初回配信話数確認中)`) → `顧客確認`.

Cột này KHÔNG cần loại cảnh báo mới: chữ `顧客確認` nằm ngay trên ô đã là tín hiệu, và
nguồn CMS là nguồn bắt buộc nên không có nhánh "nguồn lỗi".

`gas_phase_2` copy nguyên văn cột này từ 顧客作品マスタ (GAS❷ không đọc CMS) — thêm đúng
một dòng vào bảng cột.

---

## 6. Nguồn và cảnh báo

`3_sources.js`: 8 parser, mỗi cái làm đúng một việc và trả ra một `Map` phẳng. Parser
dị (⑥ có 3 hàng header, ⑤ là TSV trên Drive) giữ nguyên code — chúng đã đúng và đã có
test, chỉ cắt comment.

Cơ chế "nguồn phụ hỏng thì chạy tiếp" chuyển từ 5 khối `try/catch` chép tay thành **một
bảng khai báo** + một vòng lặp:

```js
var SOURCES = [
  { key:'regulation', config:CONFIG.SOURCES.REGULATION, parse:parseRegulation, required:true  },
  { key:'cms',        config:CONFIG.SOURCES.CMS,        parse:parseCms,        required:true  },
  { key:'commit',     config:CONFIG.SOURCES.COMMIT_MANAGEMENT, parse:parseCommit, required:false },
  // …
];
```

`required:false` → lỗi được nuốt, ghi 1 dòng cảnh báo, cột `keep:true` giữ nguyên giá
trị. `required:true` → lỗi lan ra ngoài và cả lần chạy thất bại.

`7_warnings.js`: 13 loại, mỗi loại một hàm nhỏ, **giữ nguyên hành vi**.

---

## 7. Parity harness — lưới an toàn

Tầng logic của cả hai bản đều thuần (không đụng `SpreadsheetApp`) nên nạp được vào `vm`
cùng lúc. `tools/parity/run.js` chạy **bản cũ và bản mới trên cùng fixtures** rồi diff
từng record, từng field.

Kết quả kỳ vọng: **0 khác biệt ngoài đúng 3 khoản có chủ đích**

| Khoản | Số record đổi |
|---|---|
| cascade ① (3 tầng) | 313 record đổi `①②③` |
| fix `LP制作` | 13 record đổi `J` |
| `初回配信巻数` (cột mới) | 1.977 record có `L` |

Không có harness này thì "bản mới đã đúng chưa" chỉ là niềm tin. Có nó thì mỗi khác
biệt phải được giải thích, và nó là thứ cho user dám tắt project cũ.

Test đơn vị: `tools/verify/` và `tools/verify-gas2/` giữ nguyên cấu trúc, chỉ trỏ sang
thư mục mới. **301 test hiện có phải xanh** trước khi coi là xong.

---

## 8. Thứ tự thực thi

### ⚠️ Việc đầu tiên, trước cả khi tạo file

`.clasp.json` ở gốc repo có `rootDir:""` và `skipSubdirectories:false` — nó đẩy **mọi
thư mục con** không nằm trong `.claspignore` lên project GAS❶ **đang chạy production**.
Không thêm `gas_phase_1/**` và `gas_phase_2/**` vào `.claspignore` gốc thì lần
`clasp push` kế tiếp sẽ nạp code mới đè vào project cũ, trùng ~29 tên hàm và trùng cả
`var CONFIG` — GAS❶ hỏng ngay từ bước đọc nguồn đầu tiên.

| # | Bước | Xong khi |
|---|---|---|
| 1 | Chặn `.claspignore` gốc + scaffold 2 thư mục (clasp, appsscript, config với 2 script ID mới) | `clasp push` ở gốc không thấy file mới |
| 2 | `shared/` → common + sheet + engine, sync sang cả 2 | `sync-shared.js --check` xanh |
| 3 | `gas_phase_1`: nguồn → bảng cột → khớp dòng → cảnh báo → main | 301 test xanh |
| 4 | Parity harness | 0 khác biệt ngoài 3 khoản ở §7 |
| 5 | `gas_phase_2` trên cùng engine | test GAS❷ xanh |
| 6 | `docs/decisions.md` — gom toàn bộ "vì sao", code chỉ còn link | — |

`src/` và `gas2/` **không bị xoá, không bị sửa** cho tới khi user tự xác nhận bản mới
chạy đúng trên script ID mới.

---

## 9. Ngoài phạm vi

Ba việc dưới đây KHÔNG nằm trong lần này, và không được âm thầm "tiện tay sửa":

1. **GAS❷ đang throw mỗi lần chạy** — cột `マスタ追加日` bị đổi tên thành `素材共有日` trên
   sheet thật ngày 2026-08-31. Hai khái niệm khác nhau ("ngày dòng vào master" vs "ngày
   chia sẻ tư liệu"), **user phải quyết** đổi tên cột về cũ / sửa bảng cột / tách thành
   hai cột. `gas_phase_2` port nguyên trạng, bug này đi theo cho tới khi có quyết định.
2. **13 dòng không được GAS xử lý** (`タイトルNo` 1587, 1630, 1632, 1633, 1637, 1641,
   1653, 1660, 1670, 1690, 1706, 1709, 1715). Chúng có `①②③` nhưng trống
   `タイトルID`/`タイトル区分`/`LP制作` và **thiếu hẳn dòng trong コピーライトマスタ**. Vì
   `lookupTitleCategory()` không bao giờ trả rỗng và コピーライトマスタ dựng từ chính danh
   sách đã lọc, cả hai dữ kiện chỉ về: **GAS không chạm vào những dòng này** — nhiều khả
   năng là `孤立行`. Cần lọc tab `GAS1警告` để xác nhận. Đây KHÔNG phải bug logic cột.
3. **Rule `掲載停止日付` của ガワ 0826 bị cắt cụt** — text đổi sang
   `顧客Google Drive＞配信停止一覧＞` nhưng câu đứt giữa chừng. Chưa rõ còn dùng TSV trên
   Drive hay đổi sang spreadsheet. Port nguyên trạng.

---

## 10. Tiêu chí hoàn thành

- [ ] `clasp push` ở gốc không đụng tới 2 thư mục mới
- [ ] `node tools/sync-shared.js --check` xanh
- [ ] `node tools/verify/run.js --data` — 301 test xanh
- [ ] `node tools/verify-gas2/run.js` xanh
- [ ] `node tools/parity/run.js` — 0 khác biệt ngoài 3 khoản ở §7
- [ ] Thêm một cột mới vào 顧客作品マスタ chỉ cần sửa **1 dòng** trong `4_customer_master.js`
      (+ 1 hàm quy tắc nếu cột đó có logic)
- [ ] Không còn chữ cái cột (`R列`, `S列`…) trong code lẫn comment
- [ ] `src/` và `gas2/` còn nguyên, chưa xoá

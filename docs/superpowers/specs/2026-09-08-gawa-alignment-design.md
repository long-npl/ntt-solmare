# Bám ガワ mới nhất — 2 cột mới + tra rule © 3 tầng (thiết kế, 2026-09-08)

**Một câu:** ガワ (`example/【ソル】タイトルマスタ　ガワ_最新.xlsx`) giờ là nguồn sự thật đã
được các cuộc họp thống nhất; vòng này đưa code bám theo nó ở 4 điểm — 2 cột mới của
`顧客作品マスタ` (`素材共有日`, `レギュレーション判定状況`), tra rule © thêm tầng thứ 3 kèm
tự ghi bổ sung vào master rule, và `素材共有日` của `タイトルマスタ` đổi thành bản copy.

Nền tảng dữ liệu của thiết kế này đều đo trực tiếp trên file thật, không suy đoán:
`docs/master-columns.tsv` (đã verify 3 chiều tsv ↔ ガワ ↔ code ngày 2026-09-08) là bảng
điểm danh kèm trạng thái `要対応` cho đúng những gì spec này sẽ làm.

---

## 1. Phạm vi

**Trong phạm vi:**

1. `顧客作品マスタ` › `素材共有日` — GAS❶ đóng dấu ngày khi thêm dòng mới (write-once).
2. `顧客作品マスタ` › `レギュレーション判定状況` — 3 trạng thái, luôn phản ánh lần chạy hiện tại.
3. `コピーライトマスタ` › `出版社コピーライト` — **tự ghi bổ sung** cặp (出版社, レーベル) chưa có
   rule vào cuối sheet 20 + thông báo 営業, và **alert** khi dòng đã ghi mà lần sau vẫn chưa
   ai điền rule. **Không** đổi logic tra cứu (2 tầng giữ nguyên — xem §5.1).
4. `タイトルマスタ` › `素材共有日` — đổi từ "tự đóng dấu" sang "copy từ `顧客作品マスタ`,
   fallback đóng dấu khi nguồn trống".
5. Test hồi quy khoá chặt tính nhất quán danh tính khi `タイトル名` đổi.
6. Tài liệu: **4 anchor mới** trong `docs/decisions.md` (tên đã chốt ở §11) — bắt buộc, vì
   comment code của project này trỏ tới anchor thay vì chứa lý do.

**Ngoài phạm vi (có lý do, không phải bỏ quên):**

- **`外部出稿NGタイトル`** — ガワ không nhắc tới nguồn này, nhưng user chốt 2026-09-08 là
  **giữ nguyên logic**: vẫn đọc file cũ, vẫn chỉ sinh 1 dòng `外部出稿NG注意` trong
  `GAS1警告`, không sinh cột nào. Đã ghi thành 1 dòng riêng trong `master-columns.tsv`
  (out_file = `(列を持たないソース)`) để lần sau không bị báo là "thiếu so với ガワ".
- **4 cột mới của sheet 20** (`危険`, `要注意作品あり`, `順番指定`, `(CL)C表記の事前確認`) —
  không đọc. Chưa có quy tắc nghiệp vụ nào gắn với chúng; đọc vào mà không dùng chỉ là
  thêm chỗ để lệch.
- **Cột `出版社事前確認` trùng tên ở コピーライトマスタ** (ガワ local có **2 cột cùng tên**:
  một đứng ngay sau `出版社コピーライト`, một nằm cuối bảng sau khối `コピーライト_過去分`) —
  user xác nhận production đã thống nhất theo format mới. Code không xử lý riêng; nếu sheet
  thật còn cột trùng thì `buildHeaderIndex()` lấy cột **trái nhất** và cột còn lại nằm im —
  hành vi này đã được ghi rõ trong `shared/common.js:73`.
- **`タイトルキー`, `AB~AK 媒体除外`** — vẫn `未実装` như trước, ガワ chưa chốt nguồn.

## 2. Vào / ra

| Vai trò | Spreadsheet | ID | Sheet |
|---|---|---|---|
| Nguồn rule © (đọc **+ ghi mới**) | ガワ | `1FmW8IrpUQKDEdjsWvlLSPDvTKhWwdbEUf_HLWOgHuFM` | `出版社別コピーライトマスタ` |
| Nguồn ①②③ + trạng thái | 作品レギュレーション判定 | `1T8CooSr…` | `シート1` |
| Nguồn NG (giữ nguyên) | 出版社からの追記ルールと外部出稿NGタイトル | `1y5l36o6…` | `外部出稿用NGタイトル` |

`spreadsheetId` của sheet 20 **đúng bằng cái CONFIG đang trỏ tới** — nên không đổi nguồn
đọc. Thay đổi duy nhất về config: khai báo thêm `CONFIG.OUTPUTS.PUBLISHER_COPYRIGHT` trỏ
cùng spreadsheet/sheet, để "GAS có quyền ghi vào đây" là một điều khai báo tường minh chứ
không phải một lệnh ghi lén nằm trong nhánh `SOURCES`.

## 3. `顧客作品マスタ` › `素材共有日`

Khai báo thêm vào `CUSTOMER_COLUMNS`:

```js
{ header: '素材共有日', field: 'materialSharedAt', from: 'stamp', write: '1回' }
```

**Không sửa engine.** Cơ chế: `runGas1()` gán `record.materialSharedAt = runAt` **chỉ cho
các record trong `customerDiff.toAdd`**; record của dòng update không có field này (=`''`).
Ghép với `write:'1回'`:

- Dòng mới → ô đang trống + incoming có giá trị → ghi ngày. ✅
- Dòng cũ (kể cả ô E đang trống) → incoming `''` → `toSheetRow` không ghi gì. ✅
- So diff: `sameWriteOnceValue('', '')` → `true` = "không đổi" → **không gây churn** cho
  ~8.000 dòng cũ. ✅

Cố ý **không** backfill dòng cũ bằng ngày hôm nay: hôm nay không phải ngày tư liệu được
chia sẻ, ghi vào là tạo ra dữ liệu sai trông như thật.

`runAt` phải được tạo **trước** bước gán này (hiện `runGas1()` tạo nó sau `diff`); dời 1
dòng, và vẫn dùng chung một `runAt` cho ô `更新日` / `変更詳細` / `警告` như hiện tại.

Cột này vào `CUSTOMER_COLUMNS` nghĩa là nó thành **bắt buộc** với `顧客作品マスタ`
(`requiredHeaders()`) — thiếu cột là throw. Đây là lựa chọn có ý: `顧客作品マスタ` là output
của chính GAS❶, thiếu một cột ở đó là hỏng thật, không phải trạng thái cần dung thứ. Khác
hẳn phía đọc của GAS❷ ở §6, nơi cột thiếu chỉ được degrade.

## 4. `顧客作品マスタ` › `レギュレーション判定状況`

```js
{ header: 'レギュレーション判定状況', field: 'regulationStatus', from: 'regulation', write: '上書' }
```

`write:'上書'` là **điểm cốt tử**, không phải chi tiết: cột này chỉ có giá trị khi nó luôn
kể lần chạy hiện tại. ①②③ là `条件` (据え置き) nên có thể đang là phán định của 3 tuần
trước; G là manh mối duy nhất để phân biệt. Nếu G cũng `条件` thì nó vô dụng.

**3 trạng thái** (user chốt, đúng vocabulary ガワ):

| Điều kiện | Giá trị ghi |
|---|---|
| Cascade tìm ra dòng có `ステータス = 判定済み` | `レギュレーション判定済` |
| Cascade tìm ra dòng, nhưng `ステータス` là thứ khác (`依頼中` / `Wチェック待ち` / `Wチェック完了` / `担当者依頼中` / `再判定依頼` / `削除` / trống) | `顧客確認中` |
| Không tầng nào tìm ra dòng | `レギュレーション未判定` |

Vocabulary trên đo từ nguồn thật (6.726 dòng): `判定済み` 5.158 / trống 1.376 / `削除` 145 /
`Wチェック完了` 16 / `Wチェック待ち` 11 / `担当者依頼中` 9 / `再判定依頼` 6 / `依頼中` 1.
Chú ý: `顧客確認中` **không tồn tại** trong nguồn — nó là giá trị GAS suy ra.

**Thay đổi ở nguồn ①:**

- `parseRegulation()` **bỏ** dòng `if (... !== REGULATION_STATUS_OK) continue;`, thay bằng
  mang `status` theo từng record.
- `buildRegulationIndex()` trả về **2 lớp trên cùng 3 tầng cascade**:
  - lớp `verdict` — chỉ từ dòng `判定済み`, cấp ①②③ + `isNg` (y hệt hôm nay);
  - lớp `presence` — từ **mọi** dòng, chỉ dùng để suy ra `顧客確認中`.
- `lookupRegulation()` giữ nguyên chữ ký/hành vi (đọc lớp `verdict`). Thêm
  `lookupRegulationStatus(work, index)` đọc lớp `presence`.

**Ranh giới bắt buộc:** dòng không phải `判定済み` **chỉ** cấp giá trị cho cột G. Nó
không được cấp ①②③, không được tham gia `isRegulationNg()`, không được ảnh hưởng
`isWorkEligible()`. Bộ lọc vào master **không đổi một chữ** — đây là bất biến quan trọng
nhất của thay đổi này, vì nới nó ra là cho tác phẩm NG lọt vào master.

`判定消失注意` giữ nguyên; nó và cột G nói cùng một chuyện ở hai nơi (cảnh báo để biết,
cột để tra chéo).

## 5. `コピーライトマスタ` › `出版社コピーライト` — tự ghi bổ sung rule thiếu

### 5.1 Tra cứu giữ ĐÚNG 2 tầng — không thêm tầng nào (user chốt 2026-09-08)

ガワ nói rõ ở khối ghi chú của cột này: *`引用方法 1. 出版社 2. レーベル から生成ルールを確認`* —
đúng 2 trục, và `出版社` là trục chính. Hai case, dừng ở case đầu tiên khớp:

| # | Điều kiện | Ý nghĩa |
|---|---|---|
| 1 | Tác phẩm có **cả** `出版社` và `レーベル名` → khớp rule có **cùng cả 2** | chắc ăn nhất |
| 2 | Tác phẩm **không có** `レーベル名` → khớp đúng dòng rule có `出版社` khớp **và** `雑誌名/レーベル = ""` | rule "áp dụng cho mọi レーベル" của NXB đó |

**Đây chính xác là hành vi code hiện tại** ([5_copyright_master.js:194-195](../../../gas_phase_1/5_copyright_master.js#L194-L195)),
nên **không sửa một dòng nào** trong `resolvePublisherCopyright()` /
`resolvePublisherPreConfirmation()` / `buildPublisherCopyrightLookup()`.

**Vì sao KHÔNG thêm tầng tra ngược (`rule.雑誌名/レーベル = CMS.出版社`)** — bản thiết kế trước
có đề xuất tầng này, user bác bỏ với lý do: **cùng một `レーベル` xuất hiện dưới nhiều `出版社`
khác nhau**, nên tra theo `レーベル` đơn lẻ là đoán. Đo trên nguồn thật xác nhận đúng — 6 `レーベル`
bị nhiều NXB dùng chung:

| `レーベル` | Số rule | Thuộc các `出版社` |
|---|---|---|
| `ライブコミックス` | 3 | `オトナ恋`, `ズレット！` |
| `オトメチカ出版` | 2 | `CLLENN`, `コミックストック` |
| `ロマンチカ出版` | 2 | `CLLENN`, `コミックストック` |
| `アイプロダクション` | 2 | `ビーグリー`, `小学館クリエイティブ` |
| `リバース` | 2 | `RIVERSE` |
| `PEANUTOON` | 2 | `PEANUTOON` |

**Vậy `クロスフォリオ出版` (78 tác phẩm) được chữa bằng đường nào?** Không phải bằng code —
bằng **§5.2**: rule duy nhất của họ ghi `雑誌名/レーベル = 旧：ブリック出版` (một ghi chú, không
phải tên レーベル nào CMS dùng), nên case 2 trượt → cặp `(クロスフォリオ出版, "")` được ghi
xuống cuối sheet 20 + báo 営業 → 池永 điền テンプレート → từ lần chạy sau case 2 khớp. Sửa
**tận gốc ở master**, không để code đoán mãi.

### 5.2 Tự ghi bổ sung vào sheet 20

ガワ yêu cầu việc này ở khối ghi chú `▼追加要望` dưới cột `出版社事前確認` của
`コピーライトマスタ`: NXB/レーベル không có trong sheet 20 thì ghi bổ sung xuống cuối sheet +
thông báo 営業.

- Gom các cặp `(出版社, レーベル名)` của những tác phẩm có lý do **`ルール無し`** (trượt cả 2
  case ở §5.1). Dedupe trong cùng lần chạy, và dedupe với **toàn bộ** rule đang có (kể cả
  dòng GAS đã thêm hôm trước) → chạy 100 lần vẫn không sinh dòng trùng.
- Ghi vào cuối vùng dữ liệu: chỉ 2 ô `出版社` và `雑誌名/レーベル` (tra theo tên header),
  **mọi cột khác để trống**. Vị trí append tính như `placeNewRows()`:
  `max(sheet.getLastRow(), headerRowIndex + 1) + 1`.
- Hệ quả **có chủ ý**: `自動化フラグ` trống → lần chạy sau rule *tồn tại* nhưng không sinh
  được gì, và `出版社コピーライト` vẫn để trống. Placeholder **không bao giờ tự sinh © sai**;
  nó chỉ là một dòng chờ người điền テンプレート.
- **Alert khi dòng đã ghi mà vẫn chưa ai điền** (user chốt 2026-09-08): rule tồn tại nhưng
  **`自動化フラグ` trống VÀ `テンプレート` trống** = đúng hình dạng placeholder do GAS ghi ra →
  lý do riêng **`ルール未記入`** + cảnh báo nói rõ "GAS đã thêm dòng này ngày trước, chưa ai
  điền rule". Phải tách khỏi `個別ルール` (`02：個別ルール` là **cố ý** viết tay, không phải
  việc còn nợ) — nhập nhằng 2 thứ này là lý do 池永 không biết dòng nào cần mình xử lý.
- Lỗi khi ghi bị **nuốt** + 1 dòng cảnh báo, không re-throw: đây là tiện ích, không phải
  sản phẩm chính, không được phép làm sập lần chạy đã tính xong.
- Thêm 1 loại cảnh báo `ルール自動追記` + 1 tin Slack liệt kê các cặp vừa thêm. Không thêm
  cột đếm vào `GAS1ログ` (YAGNI — `GAS1警告` đã đủ để truy).

**Đây là lần đầu GAS ghi vào một sheet 100% `手動入力`.** Vì vậy: chỉ ghi *thêm dòng mới
dưới cùng*, không bao giờ sửa/ghi đè dòng người nhập, và không bao giờ xoá.

## 6. `タイトルマスタ` › `素材共有日` — đổi thành bản copy

Nguồn sự thật chuyển sang `素材共有日` của `顧客作品マスタ`. Nhánh `stamp` trong `titleRecordToRow()` đổi
thành: lấy `record.materialSharedAt`; nếu trống thì dùng `runAt`; và **chỉ ghi khi ô đích
đang trống**.

| Ô đích (`タイトルマスタ`) | Nguồn (`顧客作品マスタ`) | Kết quả |
|---|---|---|
| đã có ngày | bất kỳ | **không đụng** (giữ toàn bộ ngày cũ) |
| trống / dòng mới | có ngày | copy ngày từ 顧客作品マスタ |
| trống / dòng mới | trống (dòng cũ có trước khi thêm cột) | đóng dấu `runAt` — giữ đúng hành vi hôm nay |

Đọc `素材共有日` từ 顧客作品マスタ bằng **`tryCol`**, và **không** thêm vào
`CUSTOMER_SOURCE_HEADERS`. Lý do: danh sách đó là *bắt buộc* — thiếu 1 tên là
`findHeaderRowIndex()` throw và sập cả lần chạy GAS❷. Cột mới nên degrade về nhánh
fallback, không nên là ngòi nổ.

## 7. Nhất quán danh tính khi `タイトル名` đổi

Phần `タイトルID`/`タイトル名` **đã đúng sẵn**, không sửa code: cả hai là `write:'上書'` nên
tham gia `recordsEqual()`; khớp ở tầng 2 (ID trùng, tên đổi) → `recordsEqual` = false →
dòng vào `toUpdate` → `toSheetRow` ghi tên mới; `コピーライトマスタ`/`タイトルマスタ` khoá theo
`タイトルNo` (bất biến) nên copy lại giá trị mới ở lần chạy cùng ngày.

Việc cần làm là **khoá chặt hành vi đó bằng test**, vì nó phụ thuộc vào write mode — mai
sau ai đổi `タイトル名` sang `条件` là danh tính đóng băng trong im lặng. 3 case:

1. Tên đổi + ID số giữ nguyên → khớp tầng 2 → `顧客作品マスタ` ghi tên mới, `タイトルNo` giữ nguyên.
2. Cùng tình huống → `コピーライトマスタ` và `タイトルマスタ` cũng mang tên mới.
3. ID từ trống/chữ → số + tên giữ nguyên → khớp tầng 3 → ghi ID mới, không sinh dòng trùng.

Phần "cập nhật theo `作品レギュレーション判定`" của yêu cầu này chính là cột G ở §4: nó phơi
ra việc phán định có được xác nhận lại trong lần chạy này hay không.

## 8. Xử lý lỗi & an toàn dữ liệu

Giữ nguyên chính sách đang có, không nới:

- Nguồn ① và CMS vẫn `required: true` — lỗi là sập cả lần chạy (không được đoán bừa khi
  không biết tác phẩm nào NG).
- Nguồn rule © vẫn `required: false` + `publisherCopyrightSkipped` → đọc lỗi thì
  `出版社コピーライト`/`出版社事前確認` giữ nguyên giá trị cũ, không xoá.
- Tự ghi bổ sung (§5.2) là bước **sau** khi mọi thứ đã ghi xong, lỗi bị nuốt.
- Không bước nào xoá dòng (`削除等はしない`).

## 9. Test

TDD, viết đỏ trước. `tools/verify-phase1/tests.js` + `tools/verify-phase2/tests.js`
(harness đã gọi `node tools/sync-shared.js --check` nên không sửa lén bản chép engine được).

| Nhóm | Case |
|---|---|
| §3 stamp | dòng mới → có ngày; dòng cũ ô trống → vẫn trống; dòng cũ ô trống → **không** vào `toUpdate` |
| §4 status | `判定済み`→判定済 / `依頼中`,`削除`,trống→顧客確認中 / không có dòng→未判定 |
| §4 bất biến | dòng `依頼中` **không** cấp ①②③, **không** làm tác phẩm NG lọt vào master |
| §5.1 tra cứu | **test khoá hành vi, không đổi code**: có cả 2 giá trị → khớp cặp; không có `レーベル名` → khớp dòng rule `レーベル` rỗng; `クロスフォリオ出版` (rule ghi `旧：ブリック出版`) → `ルール無し` |
| §5.2 append | cặp mới → 1 dòng; chạy lại → 0 dòng; lỗi ghi → không throw + có cảnh báo |
| §5.2 alert | rule có flag+template **đều trống** → `ルール未記入` (khác `個別ルール`); `02：個別ルール` vẫn ra `個別ルール` |
| §6 copy | 3 nhánh của bảng ở §6; thiếu cột nguồn → fallback stamp, không throw |
| §7 danh tính | 3 case ở §7 |

## 10. Quyết định đã chốt trong vòng này

| # | Quyết định | Ngày |
|---|---|---|
| 1 | ①②③ giữ 据え置き, cột G ghi trạng thái thật của lần chạy | 2026-09-08 |
| 2 | Map `ステータス` về đúng 3 giá trị của ガワ (`削除`/trống gộp vào `顧客確認中`) | 2026-09-08 |
| 3 | `素材共有日` của `顧客作品マスタ` là nguồn duy nhất, bên `タイトルマスタ` copy + fallback | 2026-09-08 |
| 4 | Tra rule © **giữ đúng 2 case** (`出版社+レーベル` → `出版社` với rule `レーベル` rỗng); **không** thêm tầng tra ngược vì cùng `レーベル` xuất hiện ở nhiều `出版社`. Rule thiếu thì tự ghi bổ sung + báo 営業; lần sau vẫn trống thì alert | 2026-09-08 |
| 5 | `外部出稿NGタイトル` giữ nguyên logic dù ガワ không nhắc | 2026-09-08 |
| 6 | ガワ là nguồn sự thật; format cột production đã update theo ガワ | 2026-09-08 |

## 11. Sản phẩm tài liệu kèm theo

Project này có quy ước: comment trong code **không** chứa lý do dài, nó trỏ tới một anchor
trong `docs/decisions.md` (hiện 29 anchor, 44 câu `Xem docs/decisions.md #…` rải trong 16
file, **0 câu trỏ vào chỗ không tồn tại** — con số cuối phải giữ nguyên bằng 0). Vì vậy 4
quyết định của vòng này phải có anchor **trước** khi viết comment code. Tên đã chốt:

| Anchor | Ghi lại điều gì |
|---|---|
| `regulation-status-01` | Vì sao `レギュレーション判定状況` buộc phải là `上書` (nếu `条件` thì cột vô dụng), và **ranh giới**: dòng non-`判定済み` chỉ cấp cột này, không cấp `①②③`, không tham gia phán định NG, không đổi bộ lọc |
| `material-shared-02` | `顧客作品マスタ` là nguồn duy nhất của `素材共有日`, `タイトルマスタ` copy + fallback đóng dấu; vì sao **không** backfill dòng cũ bằng ngày hôm nay. Nối tiếp `master-added-01` (chuyện đổi tên cột) |
| `copyright-lookup-02` | Vì sao tra cứu **giữ đúng 2 case** và **không** thêm tầng tra ngược: cùng một `レーベル` xuất hiện dưới nhiều `出版社` khác nhau (6 ca đo được), nên tra theo `レーベル` đơn lẻ là đoán. Rule sai/thiếu thì sửa ở master, không sửa bằng code |
| `copyright-autoappend-01` | Lần đầu GAS ghi vào sheet `手動入力` của 池永: chỉ append dòng mới dưới cùng, chỉ 2 ô, không sửa/xoá dòng người nhập, lỗi thì nuốt + cảnh báo. Kèm `ルール未記入`: dòng placeholder chưa ai điền phải alert riêng, không lẫn với `02：個別ルール` |

`docs/3-master-cot-nguon-va-logic.md` cập nhật khi từng phần land (đổi `❌`/`⚠️` → `✅`).

> 🔒 `docs/master-columns.tsv` là **file làm việc riêng của 長 (long-npl)** — **không** nằm
> trong danh sách việc của plan. Khi một phần land, chủ file tự đổi `status` từ `要対応` sang
> `OK`; ai thấy sai thì báo, không sửa trực tiếp.

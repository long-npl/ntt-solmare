# GAS❷ — タイトルマスタ (thiết kế, 2026-08-19)

**Một câu:** GAS❷ đọc 2 master do GAS❶ sinh ra (`顧客作品マスタ` + `コピーライトマスタ`),
gộp lại rồi ghi vào `タイトルマスタ` bằng cơ chế diff theo khoá `タイトルNo`, chạy 9:30
và 17:30 giờ Nhật.

Đây là bước STEP2 của pipeline 5-GAS (xem `docs/gas1-so-do-don-gian.md` cho bước
trước). GAS❷ **chỉ đọc** 2 master nguồn, không sửa gì trên đó.

---

## 1. Phạm vi

**Trong phạm vi (vòng này):** điền 24 trong 36 cột `B~AK` của `タイトルマスタ` — 23 cột
copy nguyên văn từ 2 master nguồn, cộng `E マスタ追加日` do GAS❷ tự đóng dấu.

**Ngoài phạm vi (vòng sau):** 12 cột chưa có nguồn — `M タイトルキー`, `N 初回配信巻数`,
`AB~AK 掲出可能媒体`. GAS❷ **không ghi gì** vào 12 cột này; giá trị ai nhập tay ở đó
được giữ nguyên qua mọi lần chạy.

Vì sao để trống chứ không đoán: mỗi cột còn một câu hỏi chưa có lời đáp —

- `M タイトルキー`: hàng 13 của ガワ đánh dấu `制御シート` (nhập tay), nhưng ghi chú ở
  hàng 29 lại viết `→GASで更新、VN担当者→嘉数さんに変える？を検討`. Hai chỗ mâu thuẫn,
  chưa chốt bên nào.
- `N 初回配信巻数`: ghi chú `CMSから、お尻の巻数だけ反映するルールにする` — nguồn là CMS
  (GAS❷ hiện không đọc CMS) và quy tắc "chỉ lấy số tập cuối" chưa được định nghĩa chính xác.
- `AB~AK 掲出可能媒体`: logic nằm ở `媒体除外マスタ` (`ロゴ有無 × ジャンル → 除外媒体`),
  chưa có spreadsheetId và chưa chốt cách so khớp giá trị `ジャンル`.

Thêm nguồn cho một trong các cột này là việc mở rộng, không phải sửa lại thiết kế:
`config.js` thêm 1 entry + `titleRecordToRow()` thêm 1 dòng gán.

## 2. Vào / ra

| Vai trò | Spreadsheet | ID | Sheet |
|---|---|---|---|
| Nguồn chính (đọc) | `【池永社内】顧客作品マスタ` | `1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU` | `顧客作品マスタ` |
| Nguồn phụ (đọc) | `【池永社内】コピーライトマスタ` | `1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc` | `コピーライトマスタ` |
| Output (đọc + ghi) | `タイトルマスタ` | `16Fw9KrvKskewy9OAWqPegYXvhOkRPywatd512Ncn4rI` | `タイトルマスタ` |

Tên sheet đích đã được user xác nhận (2026-08-19). Vẫn giữ
`probe_readTitleMasterHeader()` để kiểm hàng header + đủ tên cột trước lần chạy thật
đầu tiên.

Layout `タイトルマスタ` theo ガワ: cột A là cột đệm trống, header ở hàng 15, dữ liệu từ
hàng 16, dải cột `B~AK`. Hàng 13 đánh dấu `自動入力/GAS` cho toàn bộ trừ `M` (`制御シート`).
Ô `C5` là `更新日`.

## 3. Bảng map cột

Mọi cột được tra theo **tên header ở hàng header**, không hardcode chữ cái cột và
không hardcode số hàng — cùng lý do đã ghi trong `src/config.js`: 池永/安蒜 chèn thêm
cột là chuyện đã xảy ra nhiều lần, hardcode thì lần đó dữ liệu lệch cột trong im lặng.

| Cột `タイトルマスタ` | Nguồn |
|---|---|
| `B タイトルNo` | 顧客作品マスタ `タイトルNo` — **khoá join** |
| `C CMS ID` | 顧客作品マスタ `CMS ID` |
| `D タイトルID` | 顧客作品マスタ `タイトルID` |
| `E マスタ追加日` | **Ngày chạy** — chỉ đóng dấu khi dòng được thêm mới (§3.1) |
| `F タイトル区分` | 顧客作品マスタ `タイトル区分` |
| `G ①広告出稿ポリシー` | 顧客作品マスタ `①広告出稿ポリシー` |
| `H ②一般面出稿NG` | 顧客作品マスタ `②一般面出稿NG` |
| `I ③シーモアロゴ判定` | 顧客作品マスタ `③シーモアロゴ判定` |
| `J 掲載停止日付` | 顧客作品マスタ `掲載停止日付` |
| `K LP制作` | 顧客作品マスタ `LP制作` |
| `L タイトル名` | 顧客作品マスタ `タイトル名` |
| `M タイトルキー` | *(không ghi)* |
| `N 初回配信巻数` | *(không ghi)* |
| `O 作家名` | 顧客作品マスタ `作家名` |
| `P ジャンル` | 顧客作品マスタ `ジャンル` |
| `Q 出版社` | 顧客作品マスタ `出版社` |
| `R レーベル名` | 顧客作品マスタ `レーベル名` |
| `S 出版社コピーライト` | コピーライトマスタ `出版社コピーライト` |
| `T タイトル個別コピーライト(あれば優先使用)` | コピーライトマスタ cùng tên |
| `U 先行開始日` | 顧客作品マスタ `先行開始日` |
| `V 先行終了日` | 顧客作品マスタ `先行終了日` |
| `W 先行終了日（延長）` | 顧客作品マスタ `先行終了日（延長）` |
| `X 先行終了日（最終確定）` | 顧客作品マスタ `先行終了日（最終確定）` |
| `Y 大量無料開始日` | 顧客作品マスタ `大量無料開始日` |
| `Z 大量無料終了日` | 顧客作品マスタ `大量無料終了日` |
| `AA 出版社事前確認` | コピーライトマスタ `出版社事前確認` |
| `AB~AK 掲出可能媒体` | *(không ghi)* |

**Header có ký tự xuống dòng:** trên sheet thật `W15` là `先行終了日\n（延長）`,
`X15` là `先行終了日\n（最終確定）`, `N15` là `初回配信\n巻数`. `normalizeHeaderText()`
trong `common.js` đã bỏ newline và khoảng trắng full-width trước khi so, nên tra bằng
tên viết liền như bảng trên là khớp. Không cần xử lý riêng.

### 3.1. `E マスタ追加日` — cột duy nhất GAS❷ tự sinh giá trị

Quy tắc (user chốt 2026-08-19): "ngày đưa dòng đó vào master" — hôm nay GAS❷ thêm dòng
thì `E` = hôm nay.

Đây là cột **write-once**: chỉ ghi đúng một lần, ở thời điểm dòng được `append` lần đầu.
Dòng đã có sẵn giá trị `E` — kể cả giá trị người nhập tay từ trước khi GAS❷ ra đời —
**không bao giờ bị ghi đè**. Dùng `sameWriteOnceValue()` của `common.js`, đúng helper
sinh ra cho tình huống này.

Vì sao không ghi lại mỗi lần chạy: `E` là dữ liệu lịch sử, không phải trạng thái. Ghi
đè theo ngày chạy sẽ biến toàn bộ cột thành "ngày hôm nay" ngay lần chạy đầu tiên, xoá
mất thông tin dòng nào cũ dòng nào mới — mà đó chính là thứ duy nhất cột này dùng để trả lời.

Hệ quả cần biết trước: các dòng **đã có trên `タイトルマスタ` nhưng `E` đang trống** sẽ
vẫn trống mãi, vì GAS❷ chỉ đóng dấu lúc append. Nếu muốn lấp, phải điền tay một lần
(hoặc thêm một hàm chạy tay riêng — không nằm trong phạm vi vòng này).

**Không có phép biến đổi nào khác trong bảng trên** — 23 cột còn lại là copy nguyên văn. Toàn bộ
logic nghiệp vụ (lọc レギュレーション, sinh 出版社コピーライト, suy `先行終了日（最終確定）`,
phán định `LP制作`) đã nằm ở GAS❶; GAS❷ cố ý không lặp lại một mảnh nào của nó. Đây là
ranh giới đáng giữ: khi quy tắc đổi, chỉ có đúng một nơi phải sửa.

## 4. Cấu trúc code

Thư mục `gas2/` trong repo này, có `.clasp.json` riêng → push lên **Apps Script project
riêng**, độc lập runtime với GAS❶ (đúng thiết kế "5 GAS độc lập" của bản redesign).

```
gas2/
  .clasp.json      scriptId 1hI2TqTyvB-D7KEoDSXcWtUx4mCG0HfiG-c5x551ovrGApqWzlEdAJZlU
  appsscript.json
  config.js        3 spreadsheet ID + trigger + Slack property keys
  common.js        BẢN COPY của src/common.js
  io.js            đọc 2 master nguồn, đọc/ghi diff タイトルマスタ, 3 tab log, Slack
  titleMaster.js   tầng thuần: buildTitleRecords / diffTitleMaster / buildWarningRows
  main.js          runGas2(), createGas2Trigger(), các probe_*
```

`common.js` là **bản copy**, không phải module dùng chung: Apps Script không cho project
này import project kia, và tách thành thư viện (Apps Script Library) thì thêm một bước
triển khai/versioning cho thứ chỉ là vài hàm thuần. Cái giá là phải đồng bộ tay khi sửa
— ghi rõ ở đầu `gas2/common.js` kèm dòng "nguồn gốc: src/common.js, đồng bộ ngày ...".

`titleMaster.js` tách khỏi `io.js` để test được: mọi thứ trong đó là hàm thuần nhận
mảng vào, trả mảng ra, không chạm `SpreadsheetApp`.

## 5. Luồng chạy `runGas2()`

1. **Đọc 顧客作品マスタ** → `records[]`, mỗi record là 20 field theo bảng map. Bỏ qua
   dòng có `タイトル名` rỗng (cùng quy ước với `readCustomerWorkMaster()` bên GAS❶).
2. **Đọc コピーライトマスタ** → `Map<タイトルNo, {publisherCopyright, individualCopyright, preConfirmation}>`.
   Bọc trong `try/catch` — xem §7.
3. **Đọc タイトルマスタ** → `Map<タイトルNo, {sheetRow, rawRow}>` + `headerIndex` + `columnCount`.
4. **Dựng dòng đích** cho từng record:
   - Dòng đã tồn tại: bắt đầu từ **bản copy của `rawRow`**, rồi ghi đè đúng 23 cột copy
     nguyên văn. **Không đụng `E`** — giữ giá trị đang có (§3.1).
   - Dòng mới: bắt đầu từ mảng rỗng độ dài `columnCount`, ghi 23 cột + `E` = ngày chạy,
     phần còn lại rỗng.
5. **Diff**: so dòng dựng được với `rawRow` từng ô một. Bằng nhau → không ghi. Kết quả
   chia `toUpdate[]` / `toAdd[]`.
6. **Ghi**: `setValues` từng dòng update; các dòng add ghi 1 lần ở cuối sheet.
7. **Stamp `更新日`** (ô `C5`) = giờ bắt đầu chạy.
8. **Ghi 3 tab log** + bắn Slack nếu có lỗi.

**Bước 4 là chỗ bảo vệ 12 cột không có nguồn (và cả `E`).** Dựng từ bản copy `rawRow` thay vì từ mảng
rỗng nghĩa là mọi cột GAS❷ không ghi — kể cả cột 池永 thêm sau này mà code chưa biết —
được giữ nguyên. Cách làm ngược lại (`new Array(n).fill('')`) sẽ xoá trắng chúng mỗi lần
dòng bị update, không có lỗi nào để nhận ra; đây là bài học đã trả giá bên GAS❶, xem
JSDoc của `customerRecordToRow()` trong `src/io.js`.

**So sánh ở bước 5** dùng `sameValue()` / `sameDateValue()` của `common.js`. Bắt buộc phải
vậy: Google Sheets trả ngày về dưới dạng `Date`, còn giá trị vừa đọc từ master nguồn có
thể là chuỗi — so bằng `===` thì mọi dòng đều "khác" và mỗi lần chạy sẽ ghi lại toàn bộ
sheet, làm `GAS2変更詳細` ngập rác và tốn quota.

## 6. Các ca bất thường

Không ca nào làm dừng lần chạy. Tất cả ghi vào `GAS2警告`, 1 dòng = 1 ca.

| Ca | Xử lý | Loại cảnh báo |
|---|---|---|
| Dòng 顧客作品マスタ không có `タイトルNo` | Bỏ qua dòng đó | `タイトルNo欠落` |
| Trùng `タイトルNo` trong 顧客作品マスタ | Dòng đầu tiên thắng, các dòng sau bỏ qua | `タイトルNo重複` |
| `タイトルNo` không tìm thấy bên コピーライトマスタ | `S`/`T`/`AA` để rỗng, các cột khác vẫn ghi bình thường | `コピーライト未登録` |
| Dòng タイトルマスタ có `タイトルNo` không còn bên 顧客作品マスタ | **Không xoá, không sửa** | `孤立行` |

Vì sao `孤立行` không bị xoá: GAS❷ không có cách nào phân biệt "tác phẩm đã bị gỡ khỏi
master" với "một lần đọc nguồn ra thiếu dòng". Xoá là thao tác không hoàn tác được trên
dữ liệu営業 đang dùng để chọn tác phẩm; cảnh báo thì người ta xoá tay được. Cùng lập
trường với GAS❶.

## 7. Xử lý lỗi nguồn

Hai nguồn có hai mức nghiêm trọng khác nhau:

- **`顧客作品マスタ` — nguồn chính.** Đọc không được → dừng ngay, **không ghi một ô nào**
  lên `タイトルマスタ`, ghi 1 dòng `GAS2ログ` có cột lỗi + bắn Slack.
- **`コピーライトマスタ` — nguồn phụ.** Đọc không được → bỏ qua bước 2, gán cho mỗi record
  giá trị `S`/`T`/`AA` **đang có sẵn trên `タイトルマスタ`**, rồi chạy tiếp phần còn lại.
  Kết quả là 3 cột đó được coi là "không đổi" nên không dòng nào bị ghi lại vì chúng.

Nguồn phụ bắt buộc phải cư xử như vậy, không phải để cho tiện: `S`/`T` là cột GAS❷ ghi
đè hoàn toàn, nên coi "không đọc được" = "rỗng" sẽ xoá sạch copyright của toàn bộ tác
phẩm chỉ vì một lần mất quyền truy cập — mà copyright sai là đúng loại tai nạn mà cả dự
án này sinh ra để chặn. Cùng lập luận với `PRE_END_EXTENSION` trong `src/config.js`.

## 8. Log

3 tab tạo tự động trong chính spreadsheet `タイトルマスタ`, cùng shape với GAS❶ để người
vận hành không phải học lại cách đọc:

| Tab | Nội dung |
|---|---|
| `GAS2ログ` | 1 dòng/lần chạy: `開始/終了時刻`, số dòng thêm, số dòng sửa, số cảnh báo từng loại, lỗi (rỗng nếu thành công) |
| `GAS2警告` | 1 dòng/cảnh báo: `実行時刻`, loại, `タイトルNo`, `タイトルID`, `タイトル名`, chi tiết |
| `GAS2変更詳細` | 1 dòng/field đổi: `実行時刻`, `タイトルNo`, `タイトル名`, tên cột, giá trị cũ, giá trị mới |

Đặt trong spreadsheet output chứ không phải nơi khác vì đó là chỗ người dùng đang mở khi
họ thắc mắc "sao dòng này đổi".

## 9. Trigger

Time-based, 9:30 và 17:30 `Asia/Tokyo`, cài bằng `createGas2Trigger()` chạy tay một lần.
Đi sau GAS❶ (9:00 / 17:00) 30 phút để đọc được 2 master vừa cập nhật; khớp với nhịp ghi
trong ガワ của `コピーライトマスタ` (`毎日 9時30分、17時30分にGASで更新`).

Ô `B8` của ガワ `タイトルマスタ` hiện vẫn ghi `毎週XX曜日` (bản mẫu chưa điền). Sau khi cài
trigger, sửa dòng đó trên sheet thật cho khớp.

Nếu GAS❶ chạy quá 30 phút hoặc lỗi, GAS❷ đọc dữ liệu của lần trước và vẫn chạy thành
công — không có cơ chế chờ. Chấp nhận được: hệ quả xấu nhất là `タイトルマスタ` trễ nửa
ngày, và `GAS1ログ` đã ghi lại việc GAS❶ lỗi.

## 10. Test

Dùng lại harness đang có (`node tools/verify/run.js`): nạp file qua `vm` rồi test tầng
thuần, không đụng `SpreadsheetApp`. Thêm `tools/verify-gas2/` với fixture export từ
`example/【DX見本】タイトルマスタ.xlsx` (giữ đúng layout ガワ thật: cột A đệm, header hàng 15).

Năm nhóm phải phủ:

1. **Map cột** — 23 cột ra đúng vị trí trên layout ガワ thật, kể cả 3 header có xuống dòng.
2. **Bảo toàn** — update một dòng đang có giá trị ở `M`/`N`/`AB~AK` thì 12 cột đó không
   đổi; thêm một cột lạ vào sheet thì cột đó cũng không bị xoá.
3. **`E` write-once** (§3.1) — dòng mới nhận `E` = ngày chạy; dòng đã có `E` thì chạy lại
   không làm đổi giá trị, kể cả khi ngày chạy khác; dòng đã có nhưng `E` trống thì vẫn trống.
4. **Diff** — dòng không đổi thì không nằm trong `toUpdate`; `Date(2025-11-30)` và chuỗi
   `'2025/11/30'` không tính là đổi.
5. **Bốn ca bất thường** ở §6, mỗi ca ra đúng 1 dòng cảnh báo đúng loại.

Phần thật sự đọc/ghi sheet kiểm bằng `probe_*` chạy tay trong Apps Script editor:
`probe_readTitleMasterHeader()` (xác nhận hàng header + đủ 24 tên cột),
`probe_readCustomerMaster()`, `probe_readCopyrightMaster()`, `probe_dryRunDiff()`
(in ra số dòng sẽ thêm/sửa mà không ghi gì).

## 11. Việc còn treo

| # | Việc | Chặn cái gì |
|---|---|---|
| 1 | Chốt `M タイトルキー` do GAS ghi hay người nhập | Cột `M` |
| 2 | Quy tắc `N 初回配信巻数` ("chỉ số tập cuối" nghĩa là gì) + đọc CMS | Cột `N` |
| 3 | spreadsheetId + quy tắc so khớp `ジャンル` của `媒体除外マスタ` | Cột `AB~AK` |
| 4 | Chạy `probe_readCopyrightMaster()` và ghi lại `hasPreConfirmation` | Cột `AA` có được ghi hay không |

Không việc nào chặn triển khai: 12 cột đó để trống, GAS❷ vẫn chạy đủ và đúng cho 24 cột
còn lại. Việc 4 không chặn gì cả — cột `AA` tự động được ghi ngay khi cột
`出版社事前確認` xuất hiện bên `コピーライトマスタ`, không phải sửa code.

**Đã chốt 2026-08-19:** tên sheet đích là `タイトルマスタ` (§2); `E マスタ追加日` = ngày
dòng được thêm vào master, write-once (§3.1).

## 12. Ghi nhận sau khi triển khai (2026-08-19)

Code đã viết xong và push lên project GAS❷; đã pull ngược về và diff để xác nhận 7 file
trên remote khớp bản local. Ba điều phát hiện trong lúc làm, khác với giả định của spec:

1. **`example/*.xlsx` của 2 master nguồn là ガワ rỗng.** `顧客作品マスタ0803.xlsx` parse ra
   **0 record** (không dòng nào có `タイトル名`), `コピーライトマスタ0804.xlsx` ra 3 record
   mà 2 là dòng chú thích. Vì vậy §10 nhóm test "đối chiếu ガワ thật" **không kiểm được số
   lượng** — nó kiểm việc 3 danh sách tên cột bắt buộc khớp byte-chính-xác với sheet thật,
   còn phép kiểm số lượng nằm ở `probe_dryRunDiff()` trên spreadsheet thật.

2. **`tools/verify/exportFixtures.py` có một đường dẫn chết** (`publisherCopyright` trỏ vào
   bản `0803` đã bị thay bằng `0819`), và nó throw nên giết luôn mọi fixture đứng sau. Đã
   sửa để in `SKIP` rồi đi tiếp, trả exit code khác 0. **Chưa** trỏ lại sang file mới —
   đó là quyết định về baseline test của GAS❶, không thuộc phạm vi việc này.

3. **Thêm `tools/verify-gas2/smoke.js`** ngoài kế hoạch: chạy trọn `runGas2()` trên
   `SpreadsheetApp` giả. `main.js` không có logic đáng test đơn vị, nhưng nó là chỗ lỗi
   NỐI DÂY sống, và cách duy nhất khác để phát hiện là push rồi bấm chạy lên master thật.

**Đã triển khai 2026-08-19** — branch `gas2-title-master`, xem
[docs/gas2-so-do-don-gian.md](../../gas2-so-do-don-gian.md) (mô tả vận hành) và
[docs/superpowers/plans/2026-08-19-gas2-title-master.md](../plans/2026-08-19-gas2-title-master.md)
(plan). Hai điều phát hiện khi làm, chưa có trong bản spec gốc:

- **Cột `出版社事前確認` có thể chưa tồn tại trên `コピーライトマスタ`.** GAS❶ ghi nó bằng
  `tryCol()` vì 池永 phải thêm tay. GAS❷ vì vậy có cờ `hasPreConfirmation` riêng: nguồn
  chưa có cột thì cột `AA` được **giữ nguyên** thay vì bị ghi rỗng đè lên. Chạy
  `probe_readCopyrightMaster()` để biết trạng thái thật.
- **Mọi file `example/*.xlsx` của 2 master nguồn là ガワ rỗng** (`顧客作品マスタ` parse ra 0
  record). Nên test local không kiểm được số lượng — nó kiểm tên cột khớp byte-chính-xác.
  Phép kiểm số lượng là `probe_dryRunDiff()` trên spreadsheet thật.

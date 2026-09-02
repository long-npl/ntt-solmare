# 3 master GAS sinh ra — cột / nguồn / điều kiện / logic phán đoán

**Bản 2026-08-28.** Viết lại toàn bộ theo **hạng mục mới nhất** = layout ガワ `0826`
(`example/【ソル】タイトルマスタ　ガワ作成.xlsx`) + `example/【DX見本】タイトルマスタ.xlsx`.
Mọi bản mô tả trước ngày này dùng **chữ cái cột cũ** — bỏ qua.

Ba output đã được ガワ chốt (sheet `【1】基幹マスタ(=GAS生成)`, ô B31–B37):

| # | Output | Spreadsheet | Ai ghi | Số cột |
|---|---|---|---|---|
| 1 | `【池永社内】顧客作品マスタ` | `1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU` | GAS❶ | **21** (B~V) |
| 2 | `【池永社内】コピーライトマスタ` | `1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc` | GAS❶ | **16** (B~Q) |
| 3 | `【DX見本】タイトルマスタ` | `16Fw9KrvKskewy9OAWqPegYXvhOkRPywatd512Ncn4rI` | GAS❷ | **36** (B~AK), ghi **24** |

Cả 3 sheet cùng layout: **cột A là cột đệm trống, header ở hàng 15, dữ liệu từ hàng 16**,
ô `C5` là `更新日`. GAS **tra cột theo TÊN header**, không theo chữ cái → chèn/di chuyển cột
vẫn chạy, **đổi tên hoặc xoá cột thì throw**.

> 📋 **Bảng phẳng để check list:** `docs/master-columns.tsv` — 73 dòng (21 + 16 + 36), một
> dòng một cột output, các trường
> `out_file / out_col / out_header / from_file / from_sheet / from_col / condition / write_mode / status`.
> TSV nên **dán thẳng vào Google Sheets là ra bảng**, và git diff được khi ガワ đổi.
> File đó dùng để **điểm danh**; file này dùng để **hiểu tại sao**.
> Hai thứ **không** vào được bảng phẳng vì chúng ở mức DÒNG chứ không mức cột:
> bộ lọc tác phẩm (§1.1) và khoá khớp dòng (§1.2).

**Ký hiệu trạng thái** dùng trong mọi bảng dưới đây:

| | Nghĩa |
|---|---|
| ✅ | ガワ có rule + code đã cài + đã chạy trên dữ liệu thật |
| ⚠️ | code có cài nhưng **lệch** so với ガワ 0826, hoặc rule của ガワ mơ hồ |
| ❌ | ガワ yêu cầu nhưng **code chưa có** |

**Kiểu ghi** (quan trọng không kém nguồn — quyết định giá trị gõ tay có bị mất hay không):

| Kiểu | Hành vi |
|---|---|
| `上書` | Ghi đè **mỗi lần chạy**. Nguồn là nơi duy nhất đúng; gõ tay khác nguồn sẽ bị thay. Tác phẩm bị rút khỏi nguồn → ô bị **xoá** |
| `1回` | Chỉ ghi khi ô **đang trống**. Đã có chữ thì không bao giờ ghi đè |
| `条件` | Tính ra được thì ghi đè; tính ra rỗng thì **giữ nguyên ô** |
| `生成` | GAS tự sinh, không có nguồn ngoài |
| `—` | GAS **không đụng tới**, giá trị nhập tay được bảo toàn qua mọi lần chạy |

> ⚠️ **Nợ trên chính ガワ, đọc rule phải cẩn thận:** khối chú thích `▼反映ルール` đã bị đẩy
> theo cột khi chèn `L 初回配信巻数`, nhưng **nội dung text vẫn ghi chữ cái cũ**. Ví dụ
> S24–S40 nói `R列「先行終了日(延長)」`, `Q列「先行終了日」`, `T列/U列 大量無料…` trong khi
> layout 0826 là `S / R / U / V`. Tài liệu này **đã quy đổi hết sang chữ cái mới** —
> ai đối chiếu với ô ghi chú trên ガワ sẽ thấy lệch 1 cột, đó là lỗi của ガワ.

---

## 0. Tám nguồn đầu vào (GAS chỉ ĐỌC, không bao giờ ghi)

| # | Nguồn | Sheet | spreadsheetId | Cấp gì | Bắt buộc | Đặc thù khi đọc |
|---|---|---|---|---|---|---|
| ① | `【社外用】作品レギュレーション判定` | `シート1` | `1T8CooSrzcbZi768KXT7zTUlzpgz4dap0zWUJCkE5jZg` | **Bộ lọc dòng** + `①②③` | **Bắt buộc** | 3 hàng đầu là ghi chú, header thật ở **hàng 4** (tự dò) |
| ② | `【マスタ】先行タイトル情報（CMS）_代理店共通` | `★列追加の場合は増渕まで★` | `1vU82_heOwwcYlJr9kv9VEqJVKu3kUPz9gh9R5_ycR0k` | **Danh sách tác phẩm** + 9 cột thông tin + `コピーライト` | **Bắt buộc** | Bỏ dòng có `タイトル名` trống (không lọc theo `CMSID`) |
| ③ | `出版社からの追記ルールと外部出稿NGタイトル` | `外部出稿用NGタイトル` | `1y5l36o6mvQAtfx3xn3YC4EYa5vn5fy7g2KeWvv5faD8` | **Không cấp cột nào** — chỉ sinh cảnh báo | **Bắt buộc** | Header hàng 2, ô header có khoảng trắng full-width |
| ④ | `出版社別コピーライトマスタ` | `出版社別コピーライトマスタ` | `1FmW8IrpUQKDEdjsWvlLSPDvTKhWwdbEUf_HLWOgHuFM` | `K 出版社コピーライト`, `Q 出版社事前確認` | Phụ | Header **hàng 15** |
| ⑤ | `配信停止一覧` → hiện dùng TSV trên Drive | `multi_title_yyyyMMdd.tsv` | folder `1nv1ivJBdMGe7LOdHfAqX30AIZY55ge6a` | `I 掲載停止日付` | Phụ | Lấy file có `yyyyMMdd` **lớn nhất không vượt ngày chạy**; định vị theo **chữ cái cột** A=`タイトルID`, D=ngày |
| ⑥ | `【先行作品】独占期間の延長（代理店共有）` | `Sheet1` | `1OX4LXjKU99QSiy1EpcPf7e8BHWRuv8Bq3Ckbn6seOfY` | `S 先行終了日（延長）` → suy ra `T` | Phụ | **3 hàng header**: hàng 1 tên cột thật, hàng 3 chứa `1回目〜7回目` (dò 2 hàng riêng) |
| ⑦ | `大量無料希望作品リスト_CA様` | `★出稿回答シート` | `13IeYif2S2I1Hka504DPEHG5wqPVKRwOyDzoo2aHGgdU` | `U 大量無料開始日`, `V 大量無料終了日` | Phụ | File có 8 sheet, **2 sheet khác cũng có cột cùng tên nhưng lệch vị trí** — sai tên sheet là parse ra dữ liệu sai mà không lỗi |
| ⑧ | `出稿コミット管理表（新作・既存・キャン強化）` | `広告出稿必須タイトル` | `12DgvzixrfyaUtDlHjXdgsrSfT0oUsZhiqaHeeG5EWvU` | `E タイトル区分` | Phụ | Cột `タイトルID` của nguồn này **gần như trống hết** → buộc join theo `タイトル名` |

Ba nguồn ガワ có nêu mà **GAS chưa đọc**:

| Nguồn | Đáng ra cấp | Tình trạng |
|---|---|---|
| `媒体除外マスタ` (ロゴ有無 × ジャンル → 除外媒体) | `AB~AK 掲出可能媒体` của タイトルマスタ | ❌ chưa có spreadsheetId, và rule chưa khớp dữ liệu mẫu (xem §5) |
| `媒体×ADFMTマスタ` | ガワ ghi là nguồn thứ ③ của タイトルマスタ | ❌ chưa dùng — nó cấp `ADFMT` cho STEP3 制作指示, không cấp cột nào của タイトルマスタ |
| `【池永社内】配信停止一覧` | `I 掲載停止日付` (thay TSV?) | ⚠️ ガワ 0826 đổi text sang `顧客Google Drive＞配信停止一覧＞` nhưng **câu bị cắt cụt** — chưa chốt (xem §5) |

**"Phụ"** = đọc không được (mất quyền / đổi tên sheet / chưa có ID) thì **lần chạy vẫn tiếp
tục**, cột tương ứng **giữ nguyên giá trị đang có** (không bị xoá), lý do ghi 1 dòng vào
`GAS1警告`. Bắt buộc phải vậy: coi "không đọc được" = "rỗng" sẽ xoá ngày độc quyền / bản
quyền của cả nghìn tác phẩm chỉ vì một lần mất quyền truy cập.

---

## 1. `【池永社内】顧客作品マスタ` — 21 cột (B~V)

Chạy: **9h và 17h** giờ Nhật (`runGas1()`), theo ô B8 của ガワ.

### 1.1 Điều kiện DÒNG — tác phẩm nào được có mặt

Đây là **quyết định đầu tiên và quan trọng nhất**, xảy ra trước khi điền bất kỳ cột nào.

Nền dòng = **mọi tác phẩm của ② CMS** (nguồn 基幹). Sau đó lọc bằng ① レギュレーション:

| Điều kiện | Kết quả | Căn cứ |
|---|---|---|
| `ステータス` ≠ `判定済み` (hoặc tên không tra ra dòng nào) | **Không thêm dòng mới** | Ghi chú ô B3 của chính sheet ①: `「判定済み」のもののみ進行可　それ以外は判定中のためお待ちください` — trạng thái khác **không** nghĩa là "không vấn đề" mà là "đang chấm, hãy chờ" |
| `①広告出稿ポリシー` = `問題あり` | **Không thêm dòng mới** | ガワ F20 |
| `②一般面出稿NG` ∈ {`アダルト作品扱い`, `アダルトジャンル`} | **Không thêm dòng mới** | ガワ F20 |
| Còn lại | **Được vào master** | |
| **Dòng ĐÃ CÓ trên master** rồi sau đó mới bị NG | **KHÔNG xoá dòng.** Dòng đó được **cập nhật bình thường như mọi dòng khác** (tất cả cột, không chỉ 3 cột phán định) | ガワ F21: `顧客作品マスタ上で情報を更新して、削除等はしない` |

> ⚠️ Chữ `N-O列の情報を更新して` của ガワ F21 chỉ **các cột phán định của sheet nguồn ①**
> (ô B9 ghi `③作品レギュレーション判定＞N~Q列`), không phải cột N/O của 顧客作品マスタ. Code
> hiểu câu đó là "cập nhật thông tin, đừng xoá dòng" và cập nhật **toàn bộ** cột cho dòng
> đó — dòng NG cũ vẫn nhận `E`, `I`, `J`, `S`, `T`, `U`, `V` mới. Đây là **siêu tập** của
> chữ trên ガワ; nếu 営業 muốn dòng NG bị đóng băng hoàn toàn thì phải nói rõ, hiện không phải vậy.

Ba điểm phải nhớ:

- **Khoá join ① ↔ ② là `タイトル名`, so 完全一致** (sau chuẩn hoá Unicode NFKC), **không** dùng ID.
  Hệ quả đã biết và được chấp nhận: ~73 tác phẩm アダルト vẫn vào master vì CMS và
  レギュレーション viết tên khác nhau (`…困っています(フルカラー)` vs `…困っています`). Nếu 営業
  phản ánh có tác phẩm アダルト lọt xuống bước sau, **đây là chỗ xem lại đầu tiên**.
- **Tên trùng nhau → dòng NGHIÊM NGẶT NHẤT thắng** (có NG thì NG thắng). Không cắt hậu tố
  `【】`/`()` để gộp tên: 2 bản `【白抜き修正版】` = `一般面OK` và `【棒消し修正版】` = `アダルトジャンル`
  mang phán định **khác nhau** — cắt sẽ làm 179 tác phẩm nhận phán định của tác phẩm khác.
- `②` **cố tình KHÔNG chặn giá trị `出稿NG`** dù nghe như phải chặn: ガワ chỉ định đúng 2 giá
  trị trên. Có 6 dòng thật đang mang `出稿NG`. Muốn chặn thì thêm vào danh sách, không phải sửa logic.

### 1.2 Khoá — GAS biết "tác phẩm này là dòng nào"

**Cascade 3 tầng, dừng ở tầng đầu tiên khớp**, mỗi dòng master chỉ 1 record được chiếm:

| Tầng | Khoá | Bắt được ca |
|---|---|---|
| 1 | `タイトルID` + `タイトル名` | bình thường |
| 2 | `タイトルID` dạng **số thật** | tác phẩm **đổi tên** |
| 3 | `タイトル名` | ID **trống → có số** |

Khớp → dòng **CŨ**, dùng lại `タイトルNo` đang có. Không khớp → dòng **MỚI**, `タイトルNo` = max+1.
`CMS ID` **không** dùng làm khoá (chỉ để tra ngược khi điều tra sự cố).
Dòng master không record nào chiếm → cảnh báo `孤立行`, **không xoá**.

### 1.3 Bảng 21 cột

| Cột | Tên | Nguồn | Điều kiện lấy | Kiểu | TT |
|---|---|---|---|---|---|
| B | `タイトルNo` | **không có nguồn** | Dòng cũ: dùng lại số đang có. Dòng mới: `max(現在) + 1`, cấp theo đúng thứ tự CMS | 生成 | ✅ |
| C | `CMS ID` | ② CMS › `CMSID` | nguyên văn | 上書 | ✅ |
| D | `タイトルID` | ② CMS › `タイトルID` | nguyên văn (có thể trống / là ghi chú kiểu `ー`, `4415行目と同一`) | 上書 | ✅ |
| E | `タイトル区分` | ⑧ 出稿コミット管理表 › `タイトル区分` + `タイトル名` | **Logic §4.4** — `コミット` / `独占`, không bao giờ trống | 上書 | ✅ |
| F | `①広告出稿ポリシー` | ① レギュレーション › `①広告出稿ポリシー…` | nguyên văn của dòng `判定済み` khớp `タイトル名`. Ô header có hậu tố ghi chú `（出稿NG）` → tra theo **tiền tố** | 上書 | ✅ |
| G | `②一般面出稿NG` | ① レギュレーション › `②一般面出稿NG…` | như trên (header có hậu tố `（アダルト作品扱い）`) | 上書 | ✅ |
| H | `③シーモアロゴ判定` | ① レギュレーション › `③シーモアロゴ判定` | nguyên văn | 上書 | ✅ |
| I | `掲載停止日付` | ⑤ TSV › cột `D` | Join theo `タイトルID` **chỉ khi cả 2 vế là số thật**. Ngày giữ **nguyên văn**, không parse. Trùng ID → **dòng đầu tiên thắng** | **1回** | ⚠️ nguồn có thể đổi sang `配信停止一覧` |
| J | `LP制作` | **không có nguồn** — suy từ `N ジャンル` + `H ③ロゴ判定` | **Logic §4.5** | **条件** | ⚠️ điều kiện ジャンル lệch nhẹ |
| K | `タイトル名` | ② CMS › `タイトル名` | nguyên văn. Dòng CMS có ô này trống thì **bị bỏ khỏi cả lần chạy** | 上書 | ✅ |
| **L** | **`初回配信巻数`** | ② CMS › `巻数` | ガワ L27: `G列＞「巻数」から以下ルールで反映` — **phần "以下ルール" bị bỏ trống trên sheet** | 上書 | ❌ **chưa code** |
| M | `作家名` | ② CMS › `作家名` | nguyên văn (chuỗi tự do, có thể chứa `原作：`, `/`, `┴`) | 上書 | ✅ |
| N | `ジャンル` | ② CMS › `ジャンル` | nguyên văn | 上書 | ✅ |
| O | `出版社` | ② CMS › `出版社` | nguyên văn | 上書 | ✅ |
| P | `レーベル名` | ② CMS › `レーベル名` | nguyên văn | 上書 | ✅ |
| Q | `先行開始日` | ② CMS › `先行開始日` | nguyên văn | 上書 | ✅ |
| R | `先行終了日` | ② CMS › `先行終了日` | nguyên văn | 上書 | ✅ |
| S | `先行終了日（延長）` | ⑥ 独占期間の延長 › `1回目`〜`n回目` | **Logic §4.6** — lần gia hạn **cuối cùng có 期日** thắng; ô `NG` / ghi chú tự do bị bỏ qua | 上書 | ✅ |
| T | `先行終了日（最終確定）` | **suy ra** từ `S` và `R` | **Logic §4.7** — `S` có ngày → `T = S`; không thì `T = R` | 生成 | ✅ |
| U | `大量無料開始日` | ⑦ 大量無料 › `キャンペーン開始日` | **Logic §4.8** — join `タイトルID` số thật, gộp mọi dòng cùng ID, lấy **min**; bỏ dòng `出稿回答 = ✕` | 上書 | ✅ |
| V | `大量無料終了日` | ⑦ 大量無料 › `キャンペーン終了日` | như trên, lấy **max** (lấy độc lập với U, không phải nguyên cặp của 1 dòng) | 上書 | ✅ |

> `S` full-width `（延長）`, `T` full-width `（最終確定）` — chuẩn hoá header **chỉ bỏ khoảng
> trắng/xuống dòng, KHÔNG làm NFKC**, nên viết nhầm ngoặc half-width là throw.

### 1.4 Ba thứ tự không được đảo

1. **Đọc master cũ → rồi mới lọc** (dòng đã có luôn được giữ).
2. **Lọc → rồi mới cấp `タイトルNo`** (tác phẩm bị loại không được chiếm số).
3. **Cấp số → rồi mới build `コピーライトマスタ`** (nó dùng chính số đó làm khoá).

---

## 2. `【池永社内】コピーライトマスタ` — 16 cột (B~Q)

Ô B9 của ガワ: `①顧客作品マスタ＞B~I列　②【マスタ】先行タイトル情報（CMS）＞J~K列`.
Ô B10: `①「タイトル個別コピーライト」がある場合は優先　②旧コピーライトは5つまで保存(6つ以前は削除)`.

### 2.1 Điều kiện DÒNG

**Không có bộ lọc riêng và không có khoá riêng.** Mỗi dòng `顧客作品マスタ` được giữ lại
trong lần chạy đó → đúng 1 dòng ở đây, khoá là **chính `タイトルNo`**.
Vì vậy bước cấp số (§1.2) buộc phải xong trước.

### 2.2 Bảng 16 cột

| Cột | Tên | Nguồn | Điều kiện lấy | Kiểu | TT |
|---|---|---|---|---|---|
| B | `タイトルNo` | 顧客作品マスタ | **khoá** — copy nguyên | 生成 | ✅ |
| C | `CMS ID` | 顧客作品マスタ | copy nguyên | 上書 | ✅ |
| D | `タイトルID` | 顧客作品マスタ | copy nguyên | 上書 | ✅ |
| E | `タイトル名` | 顧客作品マスタ | copy nguyên | 上書 | ✅ |
| F | `作家名` | 顧客作品マスタ | copy nguyên | 上書 | ✅ |
| G | `ジャンル` | 顧客作品マスタ | copy nguyên | 上書 | ✅ |
| H | `出版社` | 顧客作品マスタ | copy nguyên | 上書 | ✅ |
| I | `レーベル名` | 顧客作品マスタ | copy nguyên | 上書 | ✅ |
| J | `タイトル個別コピーライト(あれば優先使用)` | ② CMS › `コピーライト` | **nguyên văn**, không sinh, không sửa. Có giá trị ở đây thì nó là bản quyền **hiệu lực** | 上書 | ✅ |
| K | `出版社コピーライト` | ④ 出版社別コピーライトマスタ | **Logic §4.9** — sinh lại **mỗi lần chạy** từ template; 3 trường hợp để trống + cảnh báo | 上書 | ✅ |
| L~P | `コピーライト_過去分1`〜`5` | **giá trị cũ của chính sheet** | **Logic §4.10** — chỉ dịch xuống 1 bậc khi bản quyền **hiệu lực** thật sự đổi; quá slot 5 thì **xoá** | 生成 | ✅ |
| Q | `出版社事前確認` | ④ › `(出版社)事前確認` | **Logic §4.11** — nguyên văn `必要`/`不要`. Tra 2 tầng như K nhưng **bỏ qua `自動化フラグ`** | 上書 | ⚠️ cột có thể chưa tồn tại trên ガワ |

> Cột `Q` được tra bằng `tryCol()`: ガワ hiện tại dừng ở `P コピーライト_過去分5`.
> **Chưa có cột thì GAS bỏ qua** (không throw, không so diff) + 1 dòng `GAS1警告` mỗi lần chạy.
> Thêm cột với **đúng tên `出版社事前確認`** là tự kích hoạt, không phải sửa code.

---

## 3. `【DX見本】タイトルマスタ` — 36 cột (B~AK), GAS❷ ghi 24

Chạy: **9:30 và 17:30** giờ Nhật (`runGas2()`), là **Apps Script project RIÊNG**
(`scriptId 1hI2TqTyvB-D7KEoDSXcWtUx4mCG0HfiG-c5x551ovrGApqWzlEdAJZlU`).
Header của `【DX見本】タイトルマスタ.xlsx` **giống hệt** sheet `タイトルマスタ` trong ガワ.

### 3.1 Điều kiện CHẠY — chống chạy sớm (kiểm TRƯỚC mọi thứ khác)

Trước khi đọc gì, GAS❷ so ô `更新日` của `顧客作品マスタ` với ngày hôm nay:

| Điều kiện | Xử lý |
|---|---|
| `更新日` ≠ hôm nay | Ghi **1 dòng `設定注意`** rồi **THOÁT, không đụng một ô nào** của `タイトルマスタ` |
| Không dò được nhãn `更新日` (= `null`) | **Vẫn chạy tiếp** — "không biết" khác "chưa chạy"; một nhãn bị đổi tên không được quyền dừng cả pipeline |
| `更新日` = hôm nay | Chạy bình thường |

**Vì sao cần:** lịch 9:00 / 9:30 **không** tách nhau như tưởng. Trigger `everyDays().atHour(9)`
của Apps Script chạy đâu đó **trong khoảng 9:00–10:00**; GAS❷ thêm `nearMinute(30)` nên rơi
vào **9:15–9:45**. Hai khoảng **chồng nhau** → GAS❷ hoàn toàn có thể chạy khi GAS❶ **đang ghi dở**.

Ca nguy hiểm **không phải** "GAS❶ chưa chạy" (khi đó nguồn mang dữ liệu hôm qua, diff kết luận
không đổi) mà là **"GAS❶ đang ghi giữa chừng"**: đọc phải một master nửa mới nửa cũ rồi mang
cái hỗn hợp đó ghi sang `タイトルマスタ`, và nó nằm sai như vậy **tới lần chạy sau — 8 tiếng**,
trong khi STEP3/STEP4 vẫn đọc.

Bỏ một lần chạy **không mất dữ liệu**: lần 17:30 làm lại toàn bộ.

> ⚠️ **Khoảng trống còn lại:** guard chỉ kiểm `更新日` của `顧客作品マスタ`, **không** kiểm
> `コピーライトマスタ`. GAS❶ ghi `顧客作品マスタ` (đóng dấu `更新日`) **rồi mới** ghi
> `コピーライトマスタ` — nên vẫn có cửa sổ mà nguồn CHÍNH đã "xong hôm nay" trong khi nguồn
> PHỤ còn cũ/ghi dở. Xem §5 mục 9.

### 3.2 Điều kiện DÒNG

Nguồn **CHÍNH** = `顧客作品マスタ`, nguồn **PHỤ** = `コピーライトマスタ`. Khoá join = `タイトルNo`.

| Tình huống | Xử lý |
|---|---|
| Dòng `顧客作品マスタ` thiếu `タイトルNo` | **Bỏ dòng** + cảnh báo `タイトルNo欠落` (lỗi của GAS❶) |
| 2 dòng cùng `タイトルNo` | Dòng **đầu tiên thắng** + cảnh báo `タイトルNo重複` |
| `タイトルNo` không có bên `コピーライトマスタ` | S/T/AA để **rỗng** + cảnh báo `コピーライト未登録` |
| Dòng `タイトルマスタ` không còn bên `顧客作品マスタ` | **KHÔNG xoá** + cảnh báo `孤立行` |
| Nguồn **CHÍNH** đọc không được | **Dừng ngay, không ghi một ô nào** |
| Nguồn **PHỤ** đọc không được | Giữ nguyên S/T/AA đang có, lần chạy vẫn tiếp tục (`エラー` + Slack, **không** sinh 8.000 dòng cảnh báo) |
| Nguồn PHỤ đọc được nhưng **thiếu cột** `出版社事前確認` | 1 dòng `設定注意`, bỏ riêng cột AA |

**Không có phép biến đổi nào ở GAS❷** — 23/24 cột là copy nguyên văn. Mọi logic nghiệp vụ
(lọc レギュレーション, sinh `出版社コピーライト`, suy `先行終了日（最終確定）`, phán định `LP制作`)
nằm ở GAS❶. GAS❷ cố ý không lặp lại một mảnh nào: rule đổi thì chỉ đúng một nơi phải sửa.

### 3.3 Bảng 36 cột

| Cột | Tên | Nguồn | Điều kiện lấy | Kiểu | TT |
|---|---|---|---|---|---|
| B | `タイトルNo` | 顧客作品マスタ | **khoá join** | 上書 | ✅ |
| C | `CMS ID` | 顧客作品マスタ | copy | 上書 | ✅ |
| D | `タイトルID` | 顧客作品マスタ | copy | 上書 | ✅ |
| E | `マスタ追加日` | **GAS❷ tự đóng dấu** | **Logic §4.12** — ngày dòng được **append**. Dòng đã có thì không đụng, kể cả khi ô đang trống | **1回** | ❌ **sheet thật đã đổi tên cột này thành `素材共有日` → GAS❷ throw mỗi lần chạy.** Xem §7 |
| F | `タイトル区分` | 顧客作品マスタ `E` | copy | 上書 | ✅ |
| G | `①広告出稿ポリシー` | 顧客作品マスタ `F` | copy | 上書 | ✅ |
| H | `②一般面出稿NG` | 顧客作品マスタ `G` | copy | 上書 | ✅ |
| I | `③シーモアロゴ判定` | 顧客作品マスタ `H` | copy | 上書 | ✅ |
| J | `掲載停止日付` | 顧客作品マスタ `I` | copy, so diff **theo ngày** | 上書 | ✅ |
| K | `LP制作` | 顧客作品マスタ `J` | copy | 上書 | ✅ |
| L | `タイトル名` | 顧客作品マスタ `K` | copy | 上書 | ✅ |
| **M** | `タイトルキー` | — | Hàng 13 ghi `制御シート` (nhập tay), ghi chú M29 lại ghi `→GASで更新、VN担当者→嘉数さんに変える？を検討`. **Hai chỗ mâu thuẫn, chưa chốt** | **—** | ❌ |
| **N** | `初回配信巻数` | ② CMS | Ghi chú N29: `CMSから、お尻の巻数だけ反映するルールにする` — **"お尻の巻数" chưa định nghĩa chính xác** | 上書 | ❌ |
| O | `作家名` | 顧客作品マスタ `M` | copy | 上書 | ✅ |
| P | `ジャンル` | 顧客作品マスタ `N` | copy | 上書 | ✅ |
| Q | `出版社` | 顧客作品マスタ `O` | copy | 上書 | ✅ |
| R | `レーベル名` | 顧客作品マスタ `P` | copy | 上書 | ✅ |
| S | `出版社コピーライト` | **コピーライトマスタ** `K` | copy; nguồn phụ chết → **giữ nguyên ô** | 上書 | ✅ |
| T | `タイトル個別コピーライト(あれば優先使用)` | **コピーライトマスタ** `J` | copy; ngoặc **half-width** `()` | 上書 | ✅ |
| U | `先行開始日` | 顧客作品マスタ `Q` | copy, diff theo ngày | 上書 | ✅ |
| V | `先行終了日` | 顧客作品マスタ `R` | copy, diff theo ngày | 上書 | ✅ |
| W | `先行終了日（延長）` | 顧客作品マスタ `S` | copy; ngoặc **full-width** `（）` | 上書 | ✅ |
| X | `先行終了日（最終確定）` | 顧客作品マスタ `T` | copy | 上書 | ✅ |
| Y | `大量無料開始日` | 顧客作品マスタ `U` | copy | 上書 | ✅ |
| Z | `大量無料終了日` | 顧客作品マスタ `V` | copy | 上書 | ✅ |
| AA | `出版社事前確認` | **コピーライトマスタ** `Q` | Nguồn thiếu cột này → **bỏ qua riêng AA**, 2 cột copyright kia vẫn ghi | 上書 | ✅ đã có trên sheet, 44/51 dòng có giá trị |
| **AB** | `GDN(CM)` | `媒体除外マスタ` | **Logic §4.13** — chưa chốt | **—** | ❌ |
| **AC** | `デマジェン` | `媒体除外マスタ` | như trên | **—** | ❌ |
| **AD** | `YDA` | `媒体除外マスタ` | như trên; ⚠️ nguồn ghi `YDA（LINE面）` / `YDA（Y面）` còn master chỉ có **một** cột `YDA` | **—** | ❌ |
| **AE** | `Meta` | `媒体除外マスタ` | như trên | **—** | ❌ |
| **AF** | `TikTok` | `媒体除外マスタ` | như trên; ⚠️ nguồn ghi `Tiktok` | **—** | ❌ |
| **AG** | `X` | `媒体除外マスタ` | như trên | **—** | ❌ |
| **AH~AK** | `新規媒体` ×4 | — | 4 cột **cùng tên** `新規媒体`, dữ liệu mẫu để `-` | **—** | ❌ |

### 3.4 Cơ chế bảo vệ 12 cột chưa ghi

Dòng ghi ra được **dựng từ BẢN COPY của dòng cũ**, rồi mới ghi đè 24 cột GAS❷ sở hữu.
Nghĩa là `M`, `N`, `AB~AK` **và mọi cột 池永 thêm về sau** tự động được bảo toàn — không
cần thêm danh sách "cấm ghi" nào. Cách khác (`new Array(n)` rồi fill) sẽ xoá trắng chúng
mỗi lần dòng bị update, không có lỗi nào để nhận ra. Đây là bài học đã trả giá ở GAS❶.

---

## 4. Tổng hợp — 13 chỗ CẦN LOGIC PHÁN ĐOÁN

Đây là phần trả lời trực tiếp câu "cột nào cần logic để phán đoán". 10 chỗ đã cài, 3 chưa.

### 4.1 Bộ lọc dòng của `顧客作品マスタ` — quyết định TỒN TẠI ✅
Xem §1.1. Không phải một cột, nhưng là logic đắt nhất: sai ở đây thì tác phẩm アダルト
đi thẳng ra creative của khách.

### 4.2 Khớp dòng (cascade 3 tầng) ✅
Xem §1.2. Quyết định "dòng cũ hay dòng mới", tức quyết định `タイトルNo` được dùng lại hay cấp mới.

### 4.3 `B タイトルNo` — cấp số ✅
Dòng cũ dùng lại; dòng mới `max + 1`, cấp theo đúng thứ tự CMS. Chỉ tác phẩm **được giữ**
mới được cấp số (tác phẩm bị loại không chiếm số).

### 4.4 `E タイトル区分` — `コミット` / `独占` ✅
Join theo **`タイトル名`** (không phải ID — cột ID của nguồn ⑧ trống gần hết):

| Điều kiện | Kết quả |
|---|---|
| Có **ít nhất một** dòng cùng tên mang `タイトル区分` = `2.先行配信（出稿コミット）` | `コミット` |
| Còn lại | `独占` |

Ba cái bẫy đã trả giá:
- **Chỉ đúng chuỗi `2.先行配信（出稿コミット）`.** `4.既存作品（出稿コミット）` (32 dòng) **cũng**
  chứa chữ `出稿コミット` nhưng **không** được tính — ガワ nêu đích danh một chuỗi.
- So **sau NFKC** chứ không so chuỗi thô: ngoặc full-width `（）` trên sheet đã thành `()`
  sau chuẩn hoá. Bẫy này từng làm **3.099 dòng lặng lẽ rơi hết sang `独占`**.
- Một tên xuất hiện nhiều dòng (64 tên thật): hỏi "**có dòng nào** cam kết không", không
  phải "mọi dòng có cam kết không".

**Không bao giờ trống**: danh sách dòng master vốn đã là tập con của 先行タイトル情報, nên
"không tra ra cờ コミット" đồng nghĩa với `独占`. Đúng như ガワ E28 (bản 0826 nói rõ là
**phép GIAO** với 先行タイトル情報).

### 4.5 `J LP制作` — `必要` / `不要` / để yên ✅
Xét **đúng thứ tự này** (thứ tự là phần của rule):

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | `ジャンル` bắt đầu bằng `TL` hoặc `BL` | **`必要`** (bỏ qua ロゴ判定) |
| 2 | còn lại, `③シーモアロゴ判定` = `ロゴなし` | **`必要`** |
| 3 | còn lại, `③シーモアロゴ判定` = `ロゴあり` | **`不要`** |
| 4 | còn lại (未判定) | **rỗng** = giữ nguyên ô + 1 dòng `LP制作注意` |

Nhánh 4 là lý do cột này thuộc kiểu `条件`: tính ra rỗng thì **không xoá** chữ `営業` gõ tay.

**Về việc so `ジャンル` bằng TIỀN TỐ, không phải 4 giá trị của ガワ:** ガワ J28/J29 viết
`「TL」「TLマンガ」` / `「BL」「BLマンガ」`, nhưng team đã chốt dùng **prefix** (2026-08-13). Lý do
lấy từ dữ liệu thật (5.649 dòng CMS): còn có `TLコミック` (2), `BLコミック` (5), `TL（R18）` (2)
— **cùng thể loại, chỉ khác đuôi**. Liệt kê cứng 4 giá trị thì **9 tác phẩm đó im lặng không
được đánh `必要`**, và mỗi cách viết mới của 池永 lại là một lần phải sửa code.
So sau NFKC + `toUpperCase()` nên `ＴＬ` full-width và `tl` chữ thường đều khớp.

### 4.6 `S 先行終了日（延長）` — chọn lần gia hạn nào ✅
Nguồn ⑥ có 7 cột `1回目`〜`7回目`. Rule ガワ: `データ取得元のG∼M列に記載のある期日のみを記載`.

**Quét từ lần LỚN NHẤT về lần nhỏ nhất, lấy ô đầu tiên là 期日 thật.**

| Ca | Kết quả |
|---|---|
| `1回目` có ngày, `2回目`〜 trống | ngày của `1回目` |
| `1回目` có ngày, `2回目` có ngày | ngày của `2回目` (lần cuối thắng) |
| `1回目` có ngày, `2回目` = `NG` | ngày của `1回目` — ô `NG` **bị bỏ qua chứ không dừng vòng quét** (86 dòng thật dạng này) |
| Cả 7 ô không có ô nào là 期日 | rỗng |

149 ô `NG` + ~15 ô ghi chú tự do (`一旦無期限先行`…) bị bỏ, đúng chữ `期日のみ`. Những ô bị bỏ
mà **nằm sau lần thắng** (tức nội dung mới hơn nhưng không dùng được) được ghi vào
`GAS1警告` để chúng không biến mất trong im lặng.

Join theo `タイトルID` **chỉ khi cả 2 vế là số thật**. Giá trị ngày ghi ra **nguyên bản**;
Date đã parse chỉ dùng để **quyết định ô đó có phải 期日 hay không**.

### 4.7 `T 先行終了日（最終確定）` — bảng chân lý ✅

| `R 先行終了日` | `S （延長）` | → `T （最終確定）` |
|---|---|---|
| có ngày | trống | **`R`** |
| có ngày | có ngày | **`S`** |
| trống | có ngày | **`S`** |
| trống | trống | **rỗng** |

> Spec gốc **tự mâu thuẫn** ở chỗ này (2 gạch đầu dòng ghi điều kiện giống nhau nhưng kết
> quả khác nhau). Team đã chốt: **có gia hạn thì ngày gia hạn mới là ngày chốt cuối.**
> Điều kiện cài là "`S` **không rỗng**", không phải "`S` là 期日" — để hàm vẫn đúng khi ai
> đó gõ tay giá trị lạ vào ô `S`.

### 4.8 `U/V 大量無料開始日・終了日` — gộp cả kỳ ✅
Một `タイトルID` xuất hiện nhiều dòng (65/372 dòng thật) vì chiến dịch được gia hạn theo
tháng (cột `新規/延長`: ID 267846 có `新規` 5/1–5/31 rồi `延長` 6/1–6/30, 7/1–7/31, 8/1–8/31).

| Bước | Rule |
|---|---|
| 1 | **Bỏ** dòng có `出稿回答` ∈ {`✕`, `×`, `✗`, `X`, `x`} — chỉ 2 dòng thật |
| 2 | Dòng `◯` **và dòng TRỐNG** đều được tính (trống = "chưa trả lời", không phải "không xuất"; bỏ nó sẽ làm rỗng 159/372 dòng) |
| 3 | `U` = `キャンペーン開始日` **nhỏ nhất**, `V` = `キャンペーン終了日` **lớn nhất** |
| 4 | `U` và `V` lấy **độc lập** — không phải nguyên cặp của một dòng nào |

Ví dụ trên: `U` = 5/1, `V` = 8/31 (coi cả chuỗi là **một** kỳ 大量無料 — cùng tinh thần với
`T`: gia hạn thì lấy mốc cuối). ID mà **mọi** dòng đều bị loại → không ghi gì.

### 4.9 `K 出版社コピーライト` — sinh từ template ✅
Đây là logic phức tạp nhất của cả hệ. Nguồn ④, 381 dòng / 292 NXB.

**Bước 1 — tra quy tắc, 2 tầng, tầng cụ thể hơn thắng:**

| Thứ tự thử | Khoá |
|---|---|
| 1 | `出版社` + `雑誌名/レーベル` |
| 2 | `出版社` |

Bắt buộc phải theo thứ tự này: 100/381 dòng có レーベル và chúng **cố tình khác** dòng chỉ
có 出版社 của cùng NXB —
`集英社` → `©.集英社/作家名/タイトル名` nhưng `集英社 + ブリンク` → `『タイトル名』©著者名／ホーム社`.
Tra 出版社 trước sẽ cho ra bản quyền **ghi tên công ty SAI**. Khoá trùng → dòng đầu tiên thắng.

**Bước 2 — điền placeholder.** Quy luật: mọi placeholder đều kết thúc bằng `名`.

| Nhóm | Token nhận | Điền từ |
|---|---|---|
| Tên tác phẩm | `タイトル名` (308 dòng), `作品名` (1), `タイトル` (3) | `タイトル名` |
| Tên tác giả | `著者名` (273), `作家名` (13), `作者名` (12) | `作家名` |
| レーベル | `レーベル名` (9), `雑誌名` (1) | `レーベル名` |
| NXB | `出版社名` (4) | `出版社` |

> ⚠️ **Tuyệt đối không thêm `出版社` (không có 名) vào danh sách.** Có 2 template chứa
> `出版社` mà đó là **tên NXB thật**: `『タイトル名』©著者名/英和出版社` → thay sẽ ra
> `英和英和出版社`. Bản đầu đã sinh ra đúng 4 giá trị sai như vậy.

Thay trong **một lượt quét**, mỗi vị trí thử token **dài nhất trước** — để tên tác phẩm
tình cờ chứa một token không bị lần thay sau ăn vào.

**Bước 3 — 3 lý do KHÔNG sinh được → để trống + cảnh báo (gộp theo NXB):**

| Lý do | Điều kiện | Ai sửa |
|---|---|---|
| `ルール無し` | NXB của tác phẩm không có dòng nào trong ④ | thêm 1 dòng cho NXB đó |
| `個別ルール` | `自動化フラグ` không bắt đầu bằng `01` (tức `02：個別ルール`, 11 dòng) | viết tay — **đúng spec**, không phải lỗi |
| `テンプレート不備` | (a) template **không chứa** `©`/`Ⓒ`/`ⓒ`/`(C)`/`（Ｃ）`, hoặc (b) chứa placeholder không điền được, hoặc (c) tác phẩm thiếu giá trị mà template đòi | sửa template |

**Cách nhận diện (a) cố tình không dùng danh sách đen câu chỉ thị** (danh sách đó lỗi thời
ngay khi ai viết câu mới): mọi bản quyền thật **đều phải có ký hiệu ©**, câu chỉ thị thì
không. Nhờ vậy `コピーライトについて都度確認`, `都度問い合わせ要`, `コピーライトルール参照して個別記載`
(19 dòng có template mà không có placeholder) bị chặn, còn `©レジンコミックス`, `©ブリック出版`
(bản quyền cứng, không placeholder) vẫn hợp lệ.

Placeholder **không điền được** (CMS không cấp riêng lẻ): `原作者名`, `漫画家名`, `作画者名`,
`英字作者名`, `英字著者名`, `ローマ字著者名`, `イラストレーター名`, `会社名`, `発行元社名`, và 2 dạng viết
tắt `©著` / `©原作`. Hai cái cuối **phải** kiểm bằng regex có negative lookahead:
`©著` là **tiền tố** của `©著者名` — placeholder phổ biến nhất (273/381 dòng). Bản đầu dùng
so chuỗi thường và đã loại sạch 273 quy tắc hợp lệ.

**Không đọc cột `著者名区切り方` (N)** — team chốt bỏ. Cột đó nói cách nối **nhiều** tác giả,
nhưng CMS chỉ cấp **một** chuỗi định dạng tự do (`原作：Shigeky 漫画：こくだかや`,
`Djade(作画) ┴KRE(ストーリー)`, `福,YTA`) — không có dấu phân cách nào đáng tin. Chèn nguyên
văn thì bản quyền có thể còn dính `原作：`, nhưng **không bóp méo tên tác giả**.

**J và K cùng trống** → tác phẩm là `個別対応`, được báo Slack.

### 4.10 `L~P コピーライト_過去分1〜5` — khi nào dịch ✅
Bản quyền **hiệu lực** = `J` nếu có, không thì `K` (theo ô B10 ガワ: `個別コピーライト`
được ưu tiên).

| Điều kiện | Hành động |
|---|---|
| Dòng mới (chưa có giá trị cũ) | lịch sử giữ nguyên |
| Hiệu lực cũ ≡ hiệu lực mới (so đã bỏ qua biến thể `©`/`Ⓒ`/`(C)` và ký tự vô hình) | **không dịch** |
| Hiệu lực **thật sự** đổi | đẩy giá trị cũ vào `過去分1`, mọi cái còn lại dịch xuống 1 bậc |
| Quá slot 5 | **cắt bỏ** — yêu cầu nghiệp vụ (ô B10), không phải giới hạn kỹ thuật |

Điều kiện "thật sự đổi" là bắt buộc: không có nó, **mỗi lần chạy đẩy lịch sử đi 1 ô** và
sau 5 lần chạy là mất sạch lịch sử thật.

### 4.11 `Q 出版社事前確認` — tra 2 tầng nhưng khác K ✅
Dùng **đúng** cơ chế 2 tầng của §4.9 (cùng một dòng quy tắc: `集英社` và `集英社+ブリンク`
có thể khác nhau ở cột `事前確認` y như khác nhau ở template).

**Khác K ở một điểm quan trọng:** hàm này **không quan tâm** `自動化フラグ` hay template có
dùng được không. `02：個別ルール` nghĩa là *bản quyền phải viết tay*, **không** nghĩa là NXB
đó miễn kiểm duyệt trước — trả rỗng ở những dòng đó sẽ là **nói sai**. Chỉ khi NXB không có
dòng quy tắc nào thì mới không biết → rỗng.

Giá trị **nguyên văn** `必要`/`不要`/rỗng, không map lại.

### 4.12 `E マスタ追加日` của タイトルマスタ — write-once ✅
Giá trị = **ngày dòng đó được append** vào master. Đóng dấu **đúng một lần**.

Ghi đè mỗi lần chạy sẽ biến cả cột thành "hôm nay" ngay lần đầu, xoá mất thông tin dòng nào
cũ dòng nào mới — đúng thứ duy nhất cột này dùng để trả lời.

**Hệ quả:** dòng đã có trên sheet mà `E` đang trống sẽ **trống mãi**. Muốn lấp phải điền tay.

### 4.13 `AB~AK 掲出可能媒体` — CHƯA CHỐT ❌
Rule dự kiến: `媒体除外マスタ` (`ロゴ有無` × `ジャンル` → `除外媒体`), media nào **không** bị
loại thì `〇`, bị loại thì `×`, cột `新規媒体` chưa dùng thì `-`.

Toàn bộ `媒体除外マスタ` hiện chỉ có **2 dòng**:

| `ロゴ有無` | `ジャンル` | `除外媒体` |
|---|---|---|
| `-` | `TL` | `YDA（LINE面）` |
| `ロゴ無し` | `-` | `GDN（CM）` |

Bốn lý do **chưa code được** (xem §5):
1. Dữ liệu mẫu **mâu thuẫn với rule**: dòng 17 của 見本 có `ロゴなし` + `ジャンル 女性`, theo
   rule phải là `GDN(CM) = ×`, nhưng mẫu ghi `GDN(CM) = 〇` và `YDA = ×`.
2. Giá trị `ロゴ有無` viết `ロゴ無し` (kanji) còn レギュレーション/master viết `ロゴなし` (hiragana).
3. `除外媒体` phân biệt `YDA（LINE面）` / `YDA（Y面）` còn master chỉ có **một** cột `YDA`.
4. Cách khớp `ジャンル` chưa chốt: `TL` là **khớp đúng** hay **prefix** (như §4.5)?

### 4.14 `L/N 初回配信巻数` — CHƯA CHỐT ❌
Hai chỗ nói hai kiểu, cùng chỉ về CMS:

| Nơi | Rule |
|---|---|
| ガワ `顧客作品マスタ` L27 | `G列＞「巻数」から以下ルールで反映` — **phần "以下ルール" bỏ trống** |
| ガワ `タイトルマスタ` N29 | `CMSから、お尻の巻数だけ反映するルールにする` |

"お尻の巻数" nghĩa là **số tập cuối**, nhưng chưa rõ: cột `巻数` của CMS định dạng thế nào
(một số? một dải `1-5`? một chuỗi `全5巻`?), lấy min / lấy dòng đầu / regex số cuối?
`grep 初回配信|巻数` trong `src/` và `gas2/` = **0 hit** — hoàn toàn chưa làm.

### 4.15 `M タイトルキー` — CHƯA CHỐT ❌
Hàng 13 ghi `制御シート` (tức **nhập tay**), ghi chú M29 ghi `→GASで更新`. Hai chỗ mâu thuẫn.
Hiện GAS❷ **không đụng** → giá trị nhập tay được giữ nguyên qua mọi lần chạy.

---

## 5. Câu hỏi CHẶN — cần team trả lời trước khi code

| # | Cột | Câu hỏi | Chặn cái gì |
|---|---|---|---|
| 1 | `顧客作品マスタ L` + `タイトルマスタ N` `初回配信巻数` | Cột `巻数` của CMS có định dạng gì, "お尻の巻数" lấy bằng cách nào (min / dòng đầu / regex số cuối)? | Cả 2 cột, xuyên GAS❶→GAS❷ |
| 2 | `顧客作品マスタ I` `掲載停止日付` | ガワ 0826 đổi text sang `顧客Google Drive＞配信停止一覧＞` (**câu bị cắt cụt**). Vẫn giữ TSV `multi_title_*` hay đổi sang spreadsheet `【池永社内】配信停止一覧`? | Nếu đổi thì phải viết lại NGUỒN ⑤ |
| 3 | `タイトルマスタ AB~AK` `掲出可能媒体` | 4 điểm ở §4.13: dữ liệu mẫu mâu thuẫn rule, `ロゴ無し`/`ロゴなし`, `YDA（LINE面）` vs `YDA`, cách khớp `ジャンル`. Và **spreadsheetId** của `媒体除外マスタ` | 10 cột |
| 4 | `タイトルマスタ M` `タイトルキー` | `制御シート` (hàng 13) hay `GASで更新` (M29)? | 1 cột |
| 5 | `顧客作品マスタ L13` | Ô `L13` **không có tag** `自動入力/GAS` trong khi `B–K` và `M–V` đều có → nhiều khả năng sót khi chèn cột. `初回配信巻数` có phải GAS ghi không? | Xác nhận trước khi làm #1 |
| 6 | `コピーライトマスタ` giờ chạy | Ô B8 của ガワ `コピーライトマスタ` ghi **9時30分、17時30分** nhưng GAS❶ ghi cả 2 master lúc **9時、17時** (9:30/17:30 là giờ của GAS❷). Ghi chú ガワ có cần sửa? | Chỉ là docs |

### 5b. Hai việc chỉ cần THÊM CỘT — không phải câu hỏi

Đối chiếu với 2 file thật trong `example/` (bản đã tải về, có thể cũ hơn sheet đang chạy):

| Sheet | Tình trạng thật | Hệ quả | Việc phải làm |
|---|---|---|---|
| `【池永社内】顧客作品マスタ` | Đang là **20 cột (B~U)** — layout `0819`, **chưa có** `初回配信巻数` | GAS❶ chạy bình thường (nó chỉ đòi 20 cột). Cột `L` của ガワ 0826 **chưa tồn tại để mà ghi** | 池永 chèn cột `初回配信巻数` giữa `タイトル名` và `作家名`. Code tra theo TÊN nên việc dời cột **không cần sửa gì** |
| `【池永社内】コピーライトマスタ` | Dừng ở **`P コピーライト_過去分5`** — **chưa có** `Q 出版社事前確認` | GAS❶ **bỏ qua** cột Q + ghi 1 dòng `出版社事前確認注意` mỗi lần chạy. Kéo theo `タイトルマスタ AA` cũng bị GAS❷ bỏ qua + 1 dòng `設定注意` | Thêm **1 cột** tên đúng `出版社事前確認`. Cả 2 GAS **tự kích hoạt**, không sửa code |

### 5c. Một khoảng trống trong code (không phải câu hỏi cho team)

| # | Chỗ nào | Vấn đề |
|---|---|---|
| 9 | GAS❷ guard chống chạy sớm (§3.1) | Guard chỉ kiểm `更新日` của `顧客作品マスタ`. GAS❶ ghi `顧客作品マスタ` **rồi đóng dấu `更新日`**, **sau đó** mới ghi `コピーライトマスタ` → tồn tại cửa sổ mà guard cho qua trong khi `コピーライトマスタ` còn cũ hoặc đang ghi dở. Khi đó `S/T/AA` của `タイトルマスタ` nhận copyright **cũ** và giữ nguyên **tới lần chạy sau (8 tiếng)** — đúng loại tai nạn mà guard sinh ra để chặn, chỉ là cho nguồn phụ. Tự khỏi ở lần chạy kế tiếp. **Cách sửa:** kiểm luôn `更新日` của `コピーライトマスタ` (nguồn phụ → chỉ cần đặt `copyrightAvailable = false` thay vì thoát hẳn), hoặc để GAS❶ đóng dấu cả 2 master **sau khi cả 2 đã ghi xong** |

---

## 6. Ba tab log của mỗi GAS

| GAS | Nằm trong | Tab | Mỗi dòng là |
|---|---|---|---|
| ❶ | `顧客作品マスタ` | `GAS1ログ` / `GAS1警告` / `GAS1変更詳細` | 1 lần chạy / 1 cảnh báo (12 loại) / 1 field đã đổi |
| ❷ | `タイトルマスタ` | `GAS2ログ` / `GAS2警告` / `GAS2変更詳細` | 1 lần chạy / 1 cảnh báo (**5 loại**) / 1 cột đã đổi |

12 loại cảnh báo GAS❶: `照合注意` · `照合曖昧` · `孤立行` · `外部出稿NG注意` · `掲載停止注意` ·
`コピーライト注意` · `先行延長注意` · `大量無料注意` · `タイトル区分注意` · `LP制作注意` ·
`出版社事前確認注意` · `更新日注意`.

**5** loại cảnh báo GAS❷: `タイトルNo欠落` · `タイトルNo重複` · `コピーライト未登録` · `孤立行` ·
`設定注意`. `GAS2ログ` có đúng 5 cột đếm tương ứng.

`設定注意` gom 2 việc khác nhau — đọc `詳細` để biết là việc nào:
1. **`更新日` của `顧客作品マスタ` không phải hôm nay** → lần chạy đã **thoát mà không ghi gì** (§3.1)
2. **`コピーライトマスタ` thiếu cột `出版社事前確認`** → chỉ cột `AA` bị bỏ, phần còn lại ghi bình thường

Cả 3 master được đóng dấu `更新日` (ô `C5`) = thời điểm chạy, **dùng chung một mốc** với tab
警告 và 変更詳細 để 3 nơi đối chiếu được với nhau.

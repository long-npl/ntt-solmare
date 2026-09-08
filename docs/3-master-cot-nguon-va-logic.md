# 3 master GAS sinh ra — cột / nguồn / điều kiện / logic phán đoán

**Bản 2026-09-08.** Viết lại chữ cái cột + trạng thái theo **ガワ mới nhất**
(`example/【ソル】タイトルマスタ　ガワ_最新.xlsx`, đã đọc trực tiếp bằng openpyxl) và theo code
hiện hành. Mọi bản mô tả trước ngày này dùng **chữ cái cột cũ** (`顧客作品マスタ` khi đó chỉ
có 21 cột `B~V`) — bỏ qua.

Bốn thay đổi lớn so với bản 2026-08-28: `顧客作品マスタ` thêm `素材共有日` và
`レギュレーション判定状況` (mọi cột từ `タイトル区分` trở đi dịch phải), `コピーライトマスタ`
dời `出版社事前確認` từ `Q` lên `L`, `初回配信巻数` **đã cài xong** (§4.14), và khoá join
① ↔ ② **không còn là chỉ `タイトル名`** (§1.1).

Ba output đã được ガワ chốt (sheet `【1】基幹マスタ(=GAS生成)`, ô B31–B37):

| # | Output | Spreadsheet | Ai ghi | Số cột |
|---|---|---|---|---|
| 1 | `【池永社内】顧客作品マスタ` | `1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU` | GAS❶ | **23** (B~X) |
| 2 | `【池永社内】コピーライトマスタ` | `1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc` | GAS❶ | **16** (B~Q) |
| 3 | `【DX見本】タイトルマスタ` | `16Fw9KrvKskewy9OAWqPegYXvhOkRPywatd512Ncn4rI` | GAS❷ | **36** (B~AK), ghi **25** (24 bắt buộc + `出版社事前確認` optional) |

Cả 3 sheet cùng layout: **cột A là cột đệm trống, header ở hàng 15, dữ liệu từ hàng 16**,
ô `C5` là `更新日`. GAS **tra cột theo TÊN header**, không theo chữ cái → chèn/di chuyển cột
vẫn chạy, **đổi tên hoặc xoá cột thì throw**.

> 📌 **Quy ước của tài liệu này (chốt 2026-09-08): định danh cột bằng TÊN HEADER, không bằng
> chữ cái cột.** Lý do không chỉ là cho gọn: code tra theo tên, nên **tên** mới là thứ thật sự
> định nghĩa vị trí. Chữ cái cột là hệ quả của thứ tự hiện tại — 池永 chèn 1 cột là toàn bộ
> chữ cái phía sau lệch, và mọi câu trong tài liệu viết theo chữ cái **sai lặng lẽ** cùng lúc.
> Đã xảy ra 2 lần: ガワ `0826` chèn `初回配信巻数`, rồi ガワ mới nhất chèn `素材共有日` +
> `レギュレーション判定状況`. Cần chữ cái của **từng cột** thì tra `docs/master-columns.tsv`
> (cột `out_col`) — chỗ duy nhất giữ chữ cái từng cột, và nó được verify lại theo ガワ. Trong
> file này chỉ còn **dải cột tổng thể** (`B~X`…) ở bảng tổng quan phía trên, vì dải đó dùng để
> mở sheet cho nhanh chứ không dùng để định danh cột nào.

> 📋 **Bảng phẳng để check list:** `docs/master-columns.tsv` — 76 dòng (23 + 16 + 36 + 1 dòng
> cho nguồn chỉ sinh cảnh báo, không sinh cột), một dòng một cột output, các trường
> `out_file / out_col / out_header / from_file / from_sheet / from_col / condition / write_mode / flags / status`.
> Cột `flags` soi 1:1 với bảng cột trong code (`rowKey` / `keep` / `optional` / `skipCompare` / `date`),
> nên tsv lệch code là thấy được ngay.
> TSV nên **dán thẳng vào Google Sheets là ra bảng**, và git diff được khi ガワ đổi.
> File đó dùng để **điểm danh**; file này dùng để **hiểu tại sao**.
> Hai thứ **không** vào được bảng phẳng vì chúng ở mức DÒNG chứ không mức cột:
> bộ lọc tác phẩm (§1.1) và khoá khớp dòng (§1.2).
>
> ⚠️ **Cách đọc, dễ hiểu ngược:** 6 trường đầu (`from_*`, `condition`, `write_mode`) mô tả
> **trạng thái ĐÍCH đã chốt theo ガワ**, còn `status` mới cho biết code hiện tại có làm đúng
> vậy chưa. Dòng `要対応` = ガワ đã chốt nhưng **code chưa theo** — đọc 6 trường đầu rồi kết
> luận "code đang làm thế" là sai. Ví dụ dòng `タイトルマスタ / 素材共有日` ghi
> `from_file = 顧客作品マスタ`, nhưng hôm nay GAS❷ vẫn **tự đóng dấu ngày của chính nó**;
> `status` mới nói ra điều đó. Hiện có **4 dòng** ở trạng thái này: `素材共有日` +
> `レギュレーション判定状況` (顧客作品マスタ), `出版社コピーライト` + `出版社事前確認`
> (コピーライトマスタ). `未実装` thì khác: chưa chốt, chưa có kế hoạch làm.
>
> 🔒 **Chủ sở hữu:** `master-columns.tsv` là **file làm việc riêng của 長 (long-npl)**.
> Người khác **không sửa trực tiếp** — thấy sai thì báo để chủ file sửa, hoặc sửa ở file này
> (`3-master-cot-nguon-va-logic.md`) là chỗ mọi người dùng chung.

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
| `—` | GAS **không đụng tới**, giá trị nhập tay được bảo toàn qua mọi lần chạy |

> Chỉ có **đúng 4 kiểu ghi** vì engine chỉ có 4 (`上書` / `1回` / `条件` / `—`) — kiểu ghi
> quyết định luôn hàm so diff, xem `compareFor()`. Cột "GAS tự sinh, không có nguồn ngoài"
> vẫn là `上書`; việc nó tự sinh thể hiện ở ô **Nguồn** (`không có nguồn` / `suy ra`), không
> phải ở kiểu ghi. Bản cũ có thêm nhãn `生成` — đó là nhãn của tài liệu, không phải của code,
> nên đã bỏ để `master-columns.tsv` và file này nói cùng một thứ.

> ⚠️ **Nợ trên chính ガワ, đọc rule phải cẩn thận:** khối chú thích `▼反映ルール` bị đẩy theo
> cột mỗi lần 池永 chèn cột, nhưng **nội dung text vẫn ghi chữ cái cũ**. Hai ca đã gặp:
> ô nói `▼R列「先行終了日(延長)」` trong khi cột đó giờ nằm ở `U`; và ô `▼反映ルール` của
> `LP制作` ghi `データ取得先：出稿コミット管理表` — **sai**, cột đó là cột **suy ra** từ
> `ジャンル` + `③シーモアロゴ判定`, không đọc 出稿コミット管理表 (đã xác nhận với user
> 2026-09-08: đây là ghi chú bị lệch cột khi chèn, không phải rule mới).
> Rút ra: **đọc ghi chú của ガワ theo TÊN CỘT nó nằm dưới, đừng tin chữ cái viết trong text.**

---

## 0. Tám nguồn đầu vào (GAS chỉ ĐỌC, không bao giờ ghi)

| # | Nguồn | Sheet | spreadsheetId | Cấp gì | Bắt buộc | Đặc thù khi đọc |
|---|---|---|---|---|---|---|
| ① | `【社外用】作品レギュレーション判定` | `シート1` | `1T8CooSrzcbZi768KXT7zTUlzpgz4dap0zWUJCkE5jZg` | **Bộ lọc dòng** + `①②③` | **Bắt buộc** | 3 hàng đầu là ghi chú, header thật ở **hàng 4** (tự dò) |
| ② | `【マスタ】先行タイトル情報（CMS）_代理店共通` | `★列追加の場合は増渕まで★` | `1vU82_heOwwcYlJr9kv9VEqJVKu3kUPz9gh9R5_ycR0k` | **Danh sách tác phẩm** + 9 cột thông tin + `コピーライト` | **Bắt buộc** | Bỏ dòng có `タイトル名` trống (không lọc theo `CMSID`) |
| ③ | `出版社からの追記ルールと外部出稿NGタイトル` | `外部出稿用NGタイトル` | `1y5l36o6mvQAtfx3xn3YC4EYa5vn5fy7g2KeWvv5faD8` | **Không cấp cột nào** — chỉ sinh cảnh báo | **Bắt buộc** | Header hàng 2, ô header có khoảng trắng full-width |
| ④ | `出版社別コピーライトマスタ` | `出版社別コピーライトマスタ` | `1FmW8IrpUQKDEdjsWvlLSPDvTKhWwdbEUf_HLWOgHuFM` | `出版社コピーライト`, `出版社事前確認` | Phụ | Header **hàng 15**. Là **1 tab trong ガワ**, không phải file riêng |
| ⑤ | `配信停止一覧` → hiện dùng TSV trên Drive | `multi_title_yyyyMMdd.tsv` | folder `1nv1ivJBdMGe7LOdHfAqX30AIZY55ge6a` | `掲載停止日付` | Phụ | Lấy file có `yyyyMMdd` **lớn nhất không vượt ngày chạy**. File TSV **không có hàng header** nên đây là **ngoại lệ duy nhất** buộc định vị theo chữ cái cột: `A` = `タイトルID`, `D` = ngày |
| ⑥ | `【先行作品】独占期間の延長（代理店共有）` | `Sheet1` | `1OX4LXjKU99QSiy1EpcPf7e8BHWRuv8Bq3Ckbn6seOfY` | `先行終了日（延長）` → suy ra `先行終了日（最終確定）` | Phụ | **3 hàng header**: hàng 1 tên cột thật, hàng 3 chứa `1回目〜7回目` (dò 2 hàng riêng) |
| ⑦ | `大量無料希望作品リスト_CA様` | `★出稿回答シート` | `13IeYif2S2I1Hka504DPEHG5wqPVKRwOyDzoo2aHGgdU` | `大量無料開始日`, `大量無料終了日` | Phụ | File có 8 sheet, **2 sheet khác cũng có cột cùng tên nhưng lệch vị trí** — sai tên sheet là parse ra dữ liệu sai mà không lỗi |
| ⑧ | `出稿コミット管理表（新作・既存・キャン強化）` | `広告出稿必須タイトル` | `12DgvzixrfyaUtDlHjXdgsrSfT0oUsZhiqaHeeG5EWvU` | `タイトル区分` | Phụ | Cột `タイトルID` của nguồn này **gần như trống hết** → buộc join theo `タイトル名` |

Ba nguồn ガワ có nêu mà **GAS chưa đọc**:

| Nguồn | Đáng ra cấp | Tình trạng |
|---|---|---|
| `媒体除外マスタ` (ロゴ有無 × ジャンル → 除外媒体) | `AB~AK 掲出可能媒体` của タイトルマスタ | ❌ chưa có spreadsheetId, và rule chưa khớp dữ liệu mẫu (xem §5) |
| `媒体×ADFMTマスタ` | ガワ ghi là nguồn thứ ③ của タイトルマスタ | ❌ chưa dùng — nó cấp `ADFMT` cho STEP3 制作指示, không cấp cột nào của タイトルマスタ |
| `【池永社内】配信停止一覧` | `掲載停止日付` (thay TSV?) | ⚠️ ガワ ghi `顧客Google Drive＞配信停止一覧` nhưng chính sheet `仕様整理` của ガワ vẫn để ngỏ "file này là dự kiến dừng hay đã dừng?" — chưa chốt (xem §5) |

**"Phụ"** = đọc không được (mất quyền / đổi tên sheet / chưa có ID) thì **lần chạy vẫn tiếp
tục**, cột tương ứng **giữ nguyên giá trị đang có** (không bị xoá), lý do ghi 1 dòng vào
`GAS1警告`. Bắt buộc phải vậy: coi "không đọc được" = "rỗng" sẽ xoá ngày độc quyền / bản
quyền của cả nghìn tác phẩm chỉ vì một lần mất quyền truy cập.

---

## 1. `【池永社内】顧客作品マスタ` — 23 cột (B~X)

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
> đó — dòng NG cũ vẫn nhận `F`, `K`, `L`, `U`, `V`, `W`, `X` mới. Đây là **siêu tập** của
> chữ trên ガワ; nếu 営業 muốn dòng NG bị đóng băng hoàn toàn thì phải nói rõ, hiện không phải vậy.

Ba điểm phải nhớ:

- **Khoá join ① ↔ ② là CASCADE 3 TẦNG, không còn là "chỉ `タイトル名`"** (đổi 2026-09-01,
  `docs/decisions.md` #cascade-01): ① `タイトル名` + `タイトルID` (số) cùng khớp → ② chỉ
  `タイトル名` → ③ chỉ `タイトルID` (số), dừng ở tầng đầu tiên khớp. Hai tầng dùng ID là phần
  thêm mới, và chúng **thu hồi 313 tác phẩm** trước đây bị coi là 未判定 vì tên viết khác,
  **đồng thời chặn thêm 67 tác phẩm NG** đang lọt vào master. Tầng 2 giữ nguyên vị trí (tên)
  để không lật kết quả của ca nào đang đúng.
  Hệ quả **còn lại**: tác phẩm mà CMS và レギュレーション vừa khác tên vừa không có `タイトルID`
  số ở một trong hai bên thì vẫn không join được. Nếu 営業 phản ánh có tác phẩm アダルト lọt
  xuống bước sau, **đây vẫn là chỗ xem lại đầu tiên** — nay kèm cột
  `レギュレーション判定状況` để biết tác phẩm đó tra ra dòng nào hay không tra ra gì.
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

### 1.3 Bảng 23 cột

Thứ tự dòng = thứ tự cột trên sheet (trái → phải) theo ガワ mới nhất, nhưng **định danh là
tên header** — xem quy ước ở đầu tài liệu.

| Cột (tên header) | Nguồn | Điều kiện lấy | Kiểu | TT |
|---|---|---|---|---|
| `タイトルNo` | **không có nguồn** | Dòng cũ: dùng lại số đang có. Dòng mới: `max(現在) + 1`, cấp theo đúng thứ tự CMS | 上書 | ✅ |
| `CMS ID` | ② CMS › `CMSID` | nguyên văn | 上書 | ✅ |
| `タイトルID` | ② CMS › `タイトルID` | nguyên văn (có thể trống / là ghi chú kiểu `ー`, `4415行目と同一`) | 上書 | ✅ |
| `素材共有日` | **không có nguồn** — GAS❶ đóng dấu | Ngày dòng được **append**. Dòng cũ để **trống** (không backfill ngày sai). Là **nguồn duy nhất** của `素材共有日` bên `タイトルマスタ` | **1回** | ✅ |
| `タイトル区分` | ⑧ 出稿コミット管理表 › `タイトル区分` + `タイトル名` | **Logic §4.4** — `コミット` / `独占`, không bao giờ trống | 上書 | ✅ |
| `レギュレーション判定状況` | ① レギュレーション › `ステータス` | **Logic §4.16** — `レギュレーション判定済` / `顧客確認中` / `レギュレーション未判定`. Kiểu `上書` để **luôn kể lần chạy hiện tại** → là manh mối duy nhất biết 3 cột phán định là mới hay đang 据え置き | 上書 | ❌ **chưa code** (cột mới của ガワ) |
| `①広告出稿ポリシー` | ① レギュレーション › `①広告出稿ポリシー…` | nguyên văn của dòng `判定済み` khớp qua cascade 3 tầng (§1.1). Ô header có hậu tố ghi chú `（出稿NG）` → tra theo **tiền tố** | **条件** | ✅ |
| `②一般面出稿NG` | ① レギュレーション › `②一般面出稿NG…` | như trên (header có hậu tố `（アダルト作品扱い）`) | **条件** | ✅ |
| `③シーモアロゴ判定` | ① レギュレーション › `③シーモアロゴ判定` | nguyên văn | **条件** | ✅ |
| `掲載停止日付` | ⑤ TSV › cột `D` của file TSV | Join theo `タイトルID` **chỉ khi cả 2 vế là số thật**. Ngày giữ **nguyên văn**, không parse. Trùng ID → **dòng đầu tiên thắng** | **1回** | ⚠️ nguồn có thể đổi sang `配信停止一覧` |
| `LP制作` | **không có nguồn** — suy từ `ジャンル` + `③シーモアロゴ判定` | **Logic §4.5** — **tính lại mỗi lần chạy**, nên khách đổi `ジャンル` là giá trị đổi theo | **条件** | ✅ |
| `タイトル名` | ② CMS › `タイトル名` | nguyên văn. Dòng CMS có ô này trống thì **bị bỏ khỏi cả lần chạy** | 上書 | ✅ |
| `初回配信巻数` | ② CMS › `巻数` | **Logic §4.14** — số đơn lẻ → chính nó; `〇〇[dấu ngăn]XX` → `XX`; `XX巻目…` → `XX`; còn lại → `顧客確認`. **Không bao giờ trống** | 上書 | ✅ |
| `作家名` | ② CMS › `作家名` | nguyên văn (chuỗi tự do, có thể chứa `原作：`, `/`, `┴`) | 上書 | ✅ |
| `ジャンル` | ② CMS › `ジャンル` | nguyên văn. Là đầu vào của `LP制作` → **khách đổi ô này là `LP制作` phải tính lại** | 上書 | ✅ |
| `出版社` | ② CMS › `出版社` | nguyên văn. Là khoá tra rule © (§4.9) | 上書 | ✅ |
| `レーベル名` | ② CMS › `レーベル名` | nguyên văn | 上書 | ✅ |
| `先行開始日` | ② CMS › `先行開始日` | nguyên văn | 上書 | ✅ |
| `先行終了日` | ② CMS › `先行終了日` | nguyên văn | 上書 | ✅ |
| `先行終了日（延長）` | ⑥ 独占期間の延長 › `1回目`〜`n回目` | **Logic §4.6** — lần gia hạn **cuối cùng có 期日** thắng; ô `NG` / ghi chú tự do bị bỏ qua | 上書 | ✅ |
| `先行終了日（最終確定）` | **suy ra** từ `先行終了日（延長）` và `先行終了日` | **Logic §4.7** — `（延長）` có ngày → lấy `（延長）`; không thì lấy `先行終了日` | 上書 | ✅ |
| `大量無料開始日` | ⑦ 大量無料 › `キャンペーン開始日` | **Logic §4.8** — join `タイトルID` số thật, gộp mọi dòng cùng ID, lấy **min**; bỏ dòng `出稿回答 = ✕` | 上書 | ✅ |
| `大量無料終了日` | ⑦ 大量無料 › `キャンペーン終了日` | như trên, lấy **max** (lấy độc lập với `大量無料開始日`, không phải nguyên cặp của 1 dòng) | 上書 | ✅ |

> `先行終了日（延長）` và `先行終了日（最終確定）` dùng ngoặc **full-width** `（）` — chuẩn hoá
> header **chỉ bỏ khoảng trắng/xuống dòng, KHÔNG làm NFKC**, nên viết nhầm ngoặc half-width là throw.

> ⚠️ 3 cột phán định là kiểu **`条件`** chứ không phải `上書` (bản cũ của tài liệu này ghi sai):
> lần chạy nào tra không ra phán định thì **giữ nguyên ô**, đúng nguyên tắc `削除等はしない`.
> Đó chính là lý do cột `レギュレーション判定状況` phải tồn tại — nhìn 3 cột kia một mình thì
> không biết chúng mới hay cũ.

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

Thứ tự dòng = thứ tự cột trên sheet theo ガワ mới nhất (`出版社事前確認` giờ nằm **trước**
5 cột lịch sử, không còn ở cuối bảng).

| Cột (tên header) | Nguồn | Điều kiện lấy | Kiểu | TT |
|---|---|---|---|---|
| `タイトルNo` | 顧客作品マスタ | **khoá** — copy nguyên | 上書 | ✅ |
| `CMS ID` | 顧客作品マスタ | copy nguyên | 上書 | ✅ |
| `タイトルID` | 顧客作品マスタ | copy nguyên | 上書 | ✅ |
| `タイトル名` | 顧客作品マスタ | copy nguyên | 上書 | ✅ |
| `作家名` | 顧客作品マスタ | copy nguyên | 上書 | ✅ |
| `ジャンル` | 顧客作品マスタ | copy nguyên | 上書 | ✅ |
| `出版社` | 顧客作品マスタ | copy nguyên | 上書 | ✅ |
| `レーベル名` | 顧客作品マスタ | copy nguyên | 上書 | ✅ |
| `タイトル個別コピーライト(あれば優先使用)` | ② CMS › `コピーライト` | **nguyên văn**, không sinh, không sửa. Có giá trị ở đây thì nó là bản quyền **hiệu lực** | 上書 | ✅ |
| `出版社コピーライト` | ④ 出版社別コピーライトマスタ | **Logic §4.9** — sinh lại **mỗi lần chạy** từ template; **4** trường hợp để trống + cảnh báo | 上書 | ⚠️ tra cứu 2 tầng ✅ (giữ nguyên, user chốt 2026-09-08); phần **tự ghi bổ sung rule thiếu + alert** đã có spec, **chưa code** |
| `出版社事前確認` | ④ › `(出版社)事前確認` | **Logic §4.11** — nguyên văn `必要`/`不要`. Tra cùng 2 tầng như `出版社コピーライト` nhưng **bỏ qua `自動化フラグ`** | 上書 | ✅ cột đã có trên sheet (xác nhận 2026-09-01) |
| `コピーライト_過去分1`〜`5` | **giá trị cũ của chính sheet** | **Logic §4.10** — chỉ dịch xuống 1 bậc khi bản quyền **hiệu lực** thật sự đổi; quá slot 5 thì **xoá** | 上書 | ✅ |

> `出版社事前確認` vẫn được tra bằng `tryCol()` (cột tuỳ chọn): **thiếu cột thì GAS bỏ qua**
> (không throw, không so diff) + 1 dòng `GAS1警告` mỗi lần chạy. Cơ chế này giữ lại dù cột
> đã tồn tại — nó là lưới an toàn cho ca cột bị xoá/đổi tên, không phải trạng thái tạm.

> ⚠️ ガワ local còn **2 cột trùng tên** `出版社事前確認` (một trước, một sau khối lịch sử).
> `buildHeaderIndex()` lấy cột **trái nhất**, cột còn lại nằm im và không bao giờ được ghi.
> User xác nhận production đã thống nhất theo format mới (2026-09-08).

---

## 3. `【DX見本】タイトルマスタ` — 36 cột (B~AK), GAS❷ ghi 25

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
> PHỤ còn cũ/ghi dở. Xem §5c.

### 3.2 Điều kiện DÒNG

Nguồn **CHÍNH** = `顧客作品マスタ`, nguồn **PHỤ** = `コピーライトマスタ`. Khoá join = `タイトルNo`.

| Tình huống | Xử lý |
|---|---|
| Dòng `顧客作品マスタ` thiếu `タイトルNo` | **Bỏ dòng** + cảnh báo `タイトルNo欠落` (lỗi của GAS❶) |
| 2 dòng cùng `タイトルNo` | Dòng **đầu tiên thắng** + cảnh báo `タイトルNo重複` |
| `タイトルNo` không có bên `コピーライトマスタ` | 3 cột lấy từ đó (`出版社コピーライト`, `タイトル個別コピーライト`, `出版社事前確認`) để **rỗng** + cảnh báo `コピーライト未登録` |
| Dòng `タイトルマスタ` không còn bên `顧客作品マスタ` | **KHÔNG xoá** + cảnh báo `孤立行` |
| Nguồn **CHÍNH** đọc không được | **Dừng ngay, không ghi một ô nào** |
| Nguồn **PHỤ** đọc không được | Giữ nguyên 3 cột copyright đang có, lần chạy vẫn tiếp tục (`エラー` + Slack, **không** sinh 8.000 dòng cảnh báo) |
| Nguồn PHỤ đọc được nhưng **thiếu cột** `出版社事前確認` | 1 dòng `設定注意`, bỏ riêng cột `出版社事前確認` |

**Không có phép biến đổi nào ở GAS❷** — 24/25 cột là copy nguyên văn. Mọi logic nghiệp vụ
(lọc レギュレーション, sinh `出版社コピーライト`, suy `先行終了日（最終確定）`, phán định `LP制作`)
nằm ở GAS❶. GAS❷ cố ý không lặp lại một mảnh nào: rule đổi thì chỉ đúng một nơi phải sửa.

### 3.3 Bảng 36 cột

| Cột (tên header) | Nguồn | Điều kiện lấy | Kiểu | TT |
|---|---|---|---|---|
| `タイトルNo` | 顧客作品マスタ | **khoá join** | 上書 | ✅ |
| `CMS ID` | 顧客作品マスタ | copy | 上書 | ✅ |
| `タイトルID` | 顧客作品マスタ | copy | 上書 | ✅ |
| `素材共有日` | **GAS❷ tự đóng dấu** | **Logic §4.12** — ngày dòng được **append**. Dòng đã có thì không đụng, kể cả khi ô đang trống | **1回** | ⚠️ đang chạy đúng (tên cột đã khớp `素材共有日`), nhưng spec mới đổi thành **copy từ `顧客作品マスタ`** + fallback đóng dấu — **chưa code** |
| `タイトル区分` | 顧客作品マスタ › `タイトル区分` | copy | 上書 | ✅ |
| `①広告出稿ポリシー` | 顧客作品マスタ › cùng tên | copy | 上書 | ✅ |
| `②一般面出稿NG` | 顧客作品マスタ › cùng tên | copy | 上書 | ✅ |
| `③シーモアロゴ判定` | 顧客作品マスタ › cùng tên | copy | 上書 | ✅ |
| `掲載停止日付` | 顧客作品マスタ › cùng tên | copy, so diff **theo ngày** | 上書 | ✅ |
| `LP制作` | 顧客作品マスタ › cùng tên | copy | 上書 | ✅ |
| `タイトル名` | 顧客作品マスタ › cùng tên | copy | 上書 | ✅ |
| `タイトルキー` | — | Hàng 13 ghi `制御シート` (nhập tay), ghi chú lại ghi `→GASで更新、VN担当者→嘉数さんに変える？を検討`. **Hai chỗ mâu thuẫn, chưa chốt** | **—** | ❌ |
| `初回配信巻数` | 顧客作品マスタ › cùng tên | copy. GAS❷ **không** đọc CMS — phép tính `お尻の巻数` chạy 1 lần ở GAS❶ (§4.14) | 上書 | ✅ |
| `作家名` | 顧客作品マスタ › cùng tên | copy | 上書 | ✅ |
| `ジャンル` | 顧客作品マスタ › cùng tên | copy | 上書 | ✅ |
| `出版社` | 顧客作品マスタ › cùng tên | copy | 上書 | ✅ |
| `レーベル名` | 顧客作品マスタ › cùng tên | copy | 上書 | ✅ |
| `出版社コピーライト` | **コピーライトマスタ** › cùng tên | copy; nguồn phụ chết → **giữ nguyên ô** | 上書 | ✅ |
| `タイトル個別コピーライト(あれば優先使用)` | **コピーライトマスタ** › cùng tên | copy; ngoặc **half-width** `()` | 上書 | ✅ |
| `先行開始日` | 顧客作品マスタ › cùng tên | copy, diff theo ngày | 上書 | ✅ |
| `先行終了日` | 顧客作品マスタ › cùng tên | copy, diff theo ngày | 上書 | ✅ |
| `先行終了日（延長）` | 顧客作品マスタ › cùng tên | copy; ngoặc **full-width** `（）` | 上書 | ✅ |
| `先行終了日（最終確定）` | 顧客作品マスタ › cùng tên | copy | 上書 | ✅ |
| `大量無料開始日` | 顧客作品マスタ › cùng tên | copy | 上書 | ✅ |
| `大量無料終了日` | 顧客作品マスタ › cùng tên | copy | 上書 | ✅ |
| `出版社事前確認` | **コピーライトマスタ** › cùng tên | Nguồn thiếu cột này → **bỏ qua riêng cột này**, 2 cột copyright kia vẫn ghi | 上書 | ✅ đã có trên sheet, 44/51 dòng có giá trị |
| `GDN(CM)` | `媒体除外マスタ` | **Logic §4.13** — chưa chốt | **—** | ❌ |
| `デマジェン` | `媒体除外マスタ` | như trên | **—** | ❌ |
| `YDA` | `媒体除外マスタ` | như trên; ⚠️ nguồn ghi `YDA（LINE面）` / `YDA（Y面）` còn master chỉ có **một** cột `YDA` | **—** | ❌ |
| `Meta` | `媒体除外マスタ` | như trên | **—** | ❌ |
| `TikTok` | `媒体除外マスタ` | như trên; ⚠️ nguồn ghi `Tiktok` | **—** | ❌ |
| `X` | `媒体除外マスタ` | như trên | **—** | ❌ |
| `新規媒体` ×4 | — | 4 cột **cùng tên** `新規媒体` → `buildHeaderIndex()` chỉ thấy cột trái nhất; dữ liệu mẫu để `-` | **—** | ❌ |

### 3.4 Cơ chế bảo vệ 12 cột chưa ghi

Dòng ghi ra được **dựng từ BẢN COPY của dòng cũ**, rồi mới ghi đè 25 cột GAS❷ sở hữu.
Nghĩa là `タイトルキー`, 10 cột `掲出可能媒体` **và mọi cột 池永 thêm về sau** tự động được bảo toàn — không
cần thêm danh sách "cấm ghi" nào. Cách khác (`new Array(n)` rồi fill) sẽ xoá trắng chúng
mỗi lần dòng bị update, không có lỗi nào để nhận ra. Đây là bài học đã trả giá ở GAS❶.

---

## 4. Tổng hợp — 16 chỗ CẦN LOGIC PHÁN ĐOÁN

Đây là phần trả lời trực tiếp câu "cột nào cần logic để phán đoán". **13 chỗ đã cài, 3 chưa**
(và 2 trong 13 chỗ đã cài còn phần mới chưa code — xem `⚠️` ở §4.9 và §4.12).

### 4.1 Bộ lọc dòng của `顧客作品マスタ` — quyết định TỒN TẠI ✅
Xem §1.1. Không phải một cột, nhưng là logic đắt nhất: sai ở đây thì tác phẩm アダルト
đi thẳng ra creative của khách.

### 4.2 Khớp dòng (cascade 3 tầng) ✅
Xem §1.2. Quyết định "dòng cũ hay dòng mới", tức quyết định `タイトルNo` được dùng lại hay cấp mới.

### 4.3 `タイトルNo` — cấp số ✅
Dòng cũ dùng lại; dòng mới `max + 1`, cấp theo đúng thứ tự CMS. Chỉ tác phẩm **được giữ**
mới được cấp số (tác phẩm bị loại không chiếm số).

### 4.4 `タイトル区分` — `コミット` / `独占` ✅
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

### 4.5 `LP制作` — `必要` / `不要` / để yên ✅
Xét **đúng thứ tự này** (thứ tự là phần của rule):

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | `ジャンル` bắt đầu bằng `TL` hoặc `BL` | **`必要`** (bỏ qua ロゴ判定) |
| 2 | còn lại, `③シーモアロゴ判定` = `ロゴなし` | **`必要`** |
| 3 | còn lại, `③シーモアロゴ判定` = `ロゴあり` | **`不要`** |
| 4 | còn lại (未判定) | **rỗng** = giữ nguyên ô + 1 dòng `LP制作注意` |

Nhánh 4 là lý do cột này thuộc kiểu `条件`: tính ra rỗng thì **không xoá** chữ `営業` gõ tay.

**Tính lại MỖI LẦN CHẠY, không phải tính một lần rồi thôi** (quan trọng vì `ジャンル` là dữ
liệu của khách và khách có sửa): mỗi lần chạy, `ジャンル` được đọc mới từ CMS, chạy lại đúng
4 nhánh trên, và vì kiểu ghi là `条件` nên **tính ra giá trị khác là ghi đè giá trị cũ**.
Khách đổi `ジャンル` từ `TL` sang `女性` mà tác phẩm đang `ロゴあり` → ô tự đổi `必要` → `不要`.

> ⚠️ **Nhưng đổi `ジャンル` KHÔNG phải lúc nào cũng lật được giá trị.** Nếu khách bỏ
> `ジャンル` khỏi TL/BL **và** `③シーモアロゴ判定` lúc đó không phải `ロゴあり`/`ロゴなし`
> (kể cả giá trị đang có trên sheet — hàm đọc "giá trị **có hiệu lực**", không chỉ phán định
> của lần chạy này), thì rơi vào nhánh 4 → tính ra rỗng → **`必要` cũ nằm lại trên sheet**.
> Đây là 据え置き có chủ ý (không xoá dữ liệu), không phải bug — nhưng nó có nghĩa là
> **`LP制作` có thể đang phản ánh `ジャンル` cũ**. Mỗi ca như vậy đều có 1 dòng `LP制作注意`
> trong `GAS1警告` ghi rõ `ジャンル` hiện tại là gì và vì sao không phán định được; đó là chỗ
> để đối chiếu khi nghi giá trị đã lỗi thời.

**Về việc so `ジャンル` bằng TIỀN TỐ, không phải 4 giá trị của ガワ:** ガワ J28/J29 viết
`「TL」「TLマンガ」` / `「BL」「BLマンガ」`, nhưng team đã chốt dùng **prefix** (2026-08-13). Lý do
lấy từ dữ liệu thật (5.649 dòng CMS): còn có `TLコミック` (2), `BLコミック` (5), `TL（R18）` (2)
— **cùng thể loại, chỉ khác đuôi**. Liệt kê cứng 4 giá trị thì **9 tác phẩm đó im lặng không
được đánh `必要`**, và mỗi cách viết mới của 池永 lại là một lần phải sửa code.
So sau NFKC + `toUpperCase()` nên `ＴＬ` full-width và `tl` chữ thường đều khớp.

### 4.6 `先行終了日（延長）` — chọn lần gia hạn nào ✅
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

### 4.7 `先行終了日（最終確定）` — bảng chân lý ✅

| `先行終了日` | `先行終了日（延長）` | → `先行終了日（最終確定）` |
|---|---|---|
| có ngày | trống | **`先行終了日`** |
| có ngày | có ngày | **`（延長）`** |
| trống | có ngày | **`（延長）`** |
| trống | trống | **rỗng** |

> Spec gốc **tự mâu thuẫn** ở chỗ này (2 gạch đầu dòng ghi điều kiện giống nhau nhưng kết
> quả khác nhau). Team đã chốt: **có gia hạn thì ngày gia hạn mới là ngày chốt cuối.**
> Điều kiện cài là "`（延長）` **không rỗng**", không phải "`（延長）` là 期日" — để hàm vẫn
> đúng khi ai đó gõ tay giá trị lạ vào ô `（延長）`.

### 4.8 `大量無料開始日` / `大量無料終了日` — gộp cả kỳ ✅
Một `タイトルID` xuất hiện nhiều dòng (65/372 dòng thật) vì chiến dịch được gia hạn theo
tháng (cột `新規/延長`: ID 267846 có `新規` 5/1–5/31 rồi `延長` 6/1–6/30, 7/1–7/31, 8/1–8/31).

| Bước | Rule |
|---|---|
| 1 | **Bỏ** dòng có `出稿回答` ∈ {`✕`, `×`, `✗`, `X`, `x`} — chỉ 2 dòng thật |
| 2 | Dòng `◯` **và dòng TRỐNG** đều được tính (trống = "chưa trả lời", không phải "không xuất"; bỏ nó sẽ làm rỗng 159/372 dòng) |
| 3 | `大量無料開始日` = `キャンペーン開始日` **nhỏ nhất**, `大量無料終了日` = `キャンペーン終了日` **lớn nhất** |
| 4 | Hai cột lấy **độc lập** — không phải nguyên cặp của một dòng nào |

Ví dụ trên: `大量無料開始日` = 5/1, `大量無料終了日` = 8/31 (coi cả chuỗi là **một** kỳ 大量無料
— cùng tinh thần với `先行終了日（最終確定）`: gia hạn thì lấy mốc cuối). ID mà **mọi** dòng đều
bị loại → không ghi gì.

### 4.9 `出版社コピーライト` — sinh từ template ✅
Đây là logic phức tạp nhất của cả hệ. Nguồn ④, 381 dòng / 292 NXB.

**Bước 1 — tra quy tắc, 2 tầng, tầng cụ thể hơn thắng:**

| Thứ tự thử | Khoá |
|---|---|
| 1 | `出版社` + `雑誌名/レーベル` |
| 2 | `出版社` (chỉ khớp dòng rule có `雑誌名/レーベル` **trống**) |

> ⚠️ **Tầng 2 KHÔNG phải "bất kể レーベル nào"** — nó chỉ khớp dòng rule mà chính ô
> `雑誌名/レーベル` để trống, đúng chữ ガワ: `引用方法 1. 出版社 2. レーベル`. Đo trên nguồn thật:
> **16/292 NXB chỉ có rule kèm レーベル**, nên tác phẩm của họ trượt cả 2 tầng và ra
> `ルール無し` dù rule rõ ràng tồn tại — vì bảng rule hay ghi **công ty mẹ** ở cột `出版社` còn
> tên mà CMS dùng lại nằm ở cột `雑誌名/レーベル` (`BookLive` → `BookLive Link`,
> `RIDI Corporation` → `RIDI`, `クロスフォリオ出版` → `旧：ブリック出版` — ô này còn là **ghi chú**
> "trước là Brick", không phải tên レーベル nào CMS dùng).
>
> **Cách chữa là sửa MASTER, không phải thêm tầng tra cứu** (user chốt 2026-09-08): thêm tầng
> tra ngược theo `レーベル` nghe hợp lý nhưng **cùng một `レーベル` xuất hiện dưới nhiều `出版社`
> khác nhau** — 6 ca đo được (`ライブコミックス` ở `オトナ恋` và `ズレット！`; `オトメチカ出版` và
> `ロマンチカ出版` ở cả `CLLENN` và `コミックストック`; `アイプロダクション` ở `ビーグリー` và
> `小学館クリエイティブ`) — nên tra theo `レーベル` đơn lẻ là **đoán**, và đoán sai thì in tên NXB
> của người khác vào dòng bản quyền. Thay vào đó GAS ghi cặp thiếu xuống cuối sheet ④ + báo
> 営業, lần sau vẫn chưa ai điền thì alert. **Chưa code**, xem
> `docs/superpowers/specs/2026-09-08-gawa-alignment-design.md` §5.

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

**Bước 3 — 4 lý do KHÔNG sinh được → để trống + cảnh báo (gộp theo NXB):**

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

### 4.10 `コピーライト_過去分1`〜`5` — khi nào dịch ✅
Bản quyền **hiệu lực** = `タイトル個別コピーライト` nếu có, không thì `出版社コピーライト`
(theo ô B10 ガワ: `個別コピーライト` được ưu tiên).

| Điều kiện | Hành động |
|---|---|
| Dòng mới (chưa có giá trị cũ) | lịch sử giữ nguyên |
| Hiệu lực cũ ≡ hiệu lực mới (so đã bỏ qua biến thể `©`/`Ⓒ`/`(C)` và ký tự vô hình) | **không dịch** |
| Hiệu lực **thật sự** đổi | đẩy giá trị cũ vào `過去分1`, mọi cái còn lại dịch xuống 1 bậc |
| Quá slot 5 | **cắt bỏ** — yêu cầu nghiệp vụ (ô B10), không phải giới hạn kỹ thuật |

Điều kiện "thật sự đổi" là bắt buộc: không có nó, **mỗi lần chạy đẩy lịch sử đi 1 ô** và
sau 5 lần chạy là mất sạch lịch sử thật.

### 4.11 `出版社事前確認` — tra cùng cơ chế nhưng khác `出版社コピーライト` ✅
Dùng **đúng** cơ chế tra nhiều tầng của §4.9 (cùng một dòng quy tắc: `集英社` và
`集英社+ブリンク` có thể khác nhau ở cột `事前確認` y như khác nhau ở template).

**Khác `出版社コピーライト` ở một điểm quan trọng:** hàm này **không quan tâm** `自動化フラグ` hay template có
dùng được không. `02：個別ルール` nghĩa là *bản quyền phải viết tay*, **không** nghĩa là NXB
đó miễn kiểm duyệt trước — trả rỗng ở những dòng đó sẽ là **nói sai**. Chỉ khi NXB không có
dòng quy tắc nào thì mới không biết → rỗng.

Giá trị **nguyên văn** `必要`/`不要`/rỗng, không map lại.

### 4.12 `素材共有日` — write-once ✅ (đang đổi thành 1 nguồn duy nhất ⚠️)
Giá trị = **ngày dòng đó được append** vào master. Đóng dấu **đúng một lần**.
Tên cũ là `マスタ追加日`; sheet đổi tên 2026-08-31, user chốt hai cái là **một** ngày, code đã
theo tên mới.

Ghi đè mỗi lần chạy sẽ biến cả cột thành "hôm nay" ngay lần đầu, xoá mất thông tin dòng nào
cũ dòng nào mới — đúng thứ duy nhất cột này dùng để trả lời.

**Hệ quả:** dòng đã có trên sheet mà ô này đang trống sẽ **trống mãi**. Muốn lấp phải điền tay.

> ⚠️ **Chưa code:** ガワ mới nhất thêm `素材共有日` vào **cả** `顧客作品マスタ`. Spec 2026-09-08
> chốt `顧客作品マスタ` là **nguồn duy nhất** (GAS❶ đóng dấu khi thêm dòng mới), còn
> `タイトルマスタ` **copy** lại — vẫn write-once, và chỉ khi nguồn trống mới tự đóng dấu như
> hôm nay. Nhờ vậy ngày cũ trên `タイトルマスタ` không mất dòng nào.

### 4.13 10 cột `掲出可能媒体` (`GDN(CM)` → `新規媒体`) — CHƯA CHỐT ❌
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

### 4.14 `初回配信巻数` — 4 nhánh, không bao giờ trống ✅
Đầu vào duy nhất: cột `巻数` của ② CMS. Cài 2026-09-02, đảo lại 3 quyết định + thêm dấu ngăn
2026-09-04 (`docs/decisions.md` #volume-01 #volume-02 #volume-03). Xét **đúng thứ tự này**:

| # | Dạng giá trị `巻数` | Kết quả | Ví dụ |
|---|---|---|---|
| 1 | Toàn bộ ô **chỉ là chữ số** | **chính số đó** (không riêng gì `1`) | `1` → `1`, `2` → `2`, `12` → `12` |
| 2 | `〇〇[dấu ngăn]XX`, **cho phép có đuôi chữ** | **`XX`** (số thứ hai) | `1~5` → `5`, `1~5(全話一挙配信)` → `5`, `1~3巻` → `3` |
| 3 | `XX巻目` + bất kỳ đuôi gì | **`XX`** | `5巻目` → `5`, `5巻目まで` → `5`, `5巻目(予定)` → `5` |
| 4 | Còn lại | **`顧客確認`** | trống, `1(初回配信話数確認中)`, `12話目`, `1巻完結`, ô bị Sheets nuốt thành ngày |

**Dấu ngăn nhận ở nhánh 2:** `~` `～` `〜` `-` `－` `_` `＿` `ー`. Regex trong code chỉ có 4 ký
tự `[~\-_ー]` vì `normalizeJapaneseText()` đã gộp sẵn `～`/`〜` → `~` và bản full-width của
`-`/`_` → half-width. Riêng `ー` (chouonpu U+30FC) **phải nằm thẳng trong regex**: NFKC không
coi nó là biến thể của dấu gạch nên không tự gộp. Một dấu `-` đứng một mình (không có số ở cả
hai bên) vẫn rơi vào nhánh 4.

**Hai ca cố tình KHÔNG khớp nhánh 3:** `話目` là *số话*, không phải *số tập* — nghĩa khác hẳn;
`1巻完結` nghĩa là "trọn bộ 1 tập", không phải "tập thứ 1". Cả hai → `顧客確認`.

**Không bao giờ trống** — nhánh 4 luôn ghi ra chữ `顧客確認` để mắt người rà được. Nhờ vậy
`条件`/`1回` là không cần thiết, cột này là `上書` thuần.

> ⚠️ **Rủi ro còn để mở có chủ ý:** giá trị serial của Excel (đã gặp thật `44563`, `44929`)
> lọt vào ô `巻数` sẽ khớp **nhánh 1** và đi qua như một số tập bình thường — tức lọt khỏi lưới
> `顧客確認`. Chưa đặt ngưỡng chặn vì chọn ngưỡng bao nhiêu là quyết định nghiệp vụ, chưa ai yêu cầu.

Bên `タイトルマスタ`, cột cùng tên **chỉ là bản copy**: GAS❷ không đọc CMS, phép tính trên chạy
đúng một lần ở GAS❶ (đúng ý ghi chú `N29 お尻の巻数` của ガワ).

### 4.15 `タイトルキー` — CHƯA CHỐT ❌
Hàng 13 ghi `制御シート` (tức **nhập tay**), ghi chú cùng cột lại ghi `→GASで更新`. Hai chỗ mâu
thuẫn. Hiện GAS❷ **không đụng** → giá trị nhập tay được giữ nguyên qua mọi lần chạy.

### 4.16 `レギュレーション判定状況` — 3 trạng thái, CHƯA CODE ❌
Cột mới của ガワ, nằm ở `顧客作品マスタ` (**không** có bên `タイトルマスタ` — cố ý, không transfer).
Nó tồn tại để trả lời đúng một câu: *3 cột phán định bên cạnh là của lần chạy này, hay là giá
trị cũ đang 据え置き?*

| Cascade 3 tầng (§1.1) tra được gì | Ghi ra |
|---|---|
| Dòng có `ステータス` = `判定済み` | `レギュレーション判定済` |
| Có dòng, nhưng `ステータス` là thứ khác (`依頼中`, `Wチェック待ち`, `Wチェック完了`, `担当者依頼中`, `再判定依頼`, `削除`, hoặc trống) | `顧客確認中` |
| Không tầng nào tra ra dòng nào | `レギュレーション未判定` |

Vocabulary đo trên nguồn thật (6.726 dòng): `判定済み` 5.158 · trống 1.376 · `削除` 145 ·
`Wチェック完了` 16 · `Wチェック待ち` 11 · `担当者依頼中` 9 · `再判定依頼` 6 · `依頼中` 1.
**`顧客確認中` không tồn tại trong nguồn** — nó là giá trị GAS suy ra, và user chốt gộp cả
`削除`/trống vào đó (2026-09-08) để chỉ dùng đúng 3 giá trị ガワ đã nêu.

Hai ràng buộc **không được phá** khi code:
- Kiểu ghi phải là `上書`. Nếu là `条件` thì cột này cũng bị đóng băng và **vô dụng**.
- Dòng không phải `判定済み` **chỉ** cấp giá trị cho cột này. Nó tuyệt đối không được cấp
  `①②③`, không tham gia phán định NG, không đổi bộ lọc ở §1.1 — nới ra là cho tác phẩm NG
  lọt vào master.

Kéo theo 1 thay đổi ở nguồn ①: `parseRegulation()` hiện **lọc bỏ** mọi dòng ≠ `判定済み` nên
code còn không "thấy" được là có dòng đang chờ xử lý hay không. Phải bỏ filter đó và mang
`ステータス` đi theo. Xem `docs/superpowers/specs/2026-09-08-gawa-alignment-design.md` §4.

---

## 5. Câu hỏi CHẶN — cần team trả lời trước khi code

| # | Cột | Câu hỏi | Chặn cái gì |
|---|---|---|---|
| 1 | `掲載停止日付` | ガワ ghi取得先 là `顧客Google Drive＞配信停止一覧`, nhưng chính sheet `仕様整理` của ガワ để ngỏ "file này là **dự kiến** dừng hay **đã** dừng, còn tác phẩm dừng trong quá khứ thì sao?". Vẫn giữ TSV `multi_title_*` hay đổi sang spreadsheet `【池永社内】配信停止一覧`? | Nếu đổi thì phải viết lại NGUỒN ⑤ |
| 2 | 10 cột `掲出可能媒体` | 4 điểm ở §4.13: dữ liệu mẫu mâu thuẫn rule, `ロゴ無し`/`ロゴなし`, `YDA（LINE面）` vs `YDA`, cách khớp `ジャンル`. Và **spreadsheetId** của `媒体除外マスタ` | 10 cột |
| 3 | `タイトルキー` | `制御シート` (hàng 13) hay `GASで更新` (ghi chú cùng cột)? | 1 cột |
| 4 | Giờ chạy ghi trên ガワ | Ô B8 của ガワ `コピーライトマスタ` ghi **9時30分、17時30分** nhưng GAS❶ ghi cả 2 master lúc **9時、17時** (9:30/17:30 là giờ của GAS❷). Ghi chú ガワ có cần sửa? | Chỉ là docs |

**Đã đóng 2026-09-08** (bản trước là câu hỏi #1 và #5): quy tắc `初回配信巻数` đã chốt và đã
code (§4.14); và câu "ô hàng 13 của `初回配信巻数` thiếu tag `自動入力/GAS`" hết giá trị vì ガワ
mới nhất đã có tag cho cột đó.

> Trên ガワ mới nhất, cột **thiếu tag `自動入力/GAS` ở hàng 13** là `レギュレーション判定状況`
> — cùng kiểu sót khi chèn cột như lần trước. **Không** coi là câu hỏi chặn: ô ghi chú ngay
> dưới cột đó ghi rõ `データ取得先：【社外用】作品レギュレーション判定`, và user đã chốt GAS ghi
> cột này (2026-09-08).

### 5b. Hai việc chỉ cần THÊM CỘT — không phải câu hỏi

Đối chiếu với 2 file thật trong `example/` (bản đã tải về, có thể cũ hơn sheet đang chạy):

| Sheet | Tình trạng | Việc phải làm |
|---|---|---|
| `【池永社内】顧客作品マスタ` | ✅ **Đã xong** — sheet thật giờ đúng 23 cột theo ガワ, có `初回配信巻数`, và user xác nhận đã thống nhất format (2026-09-08) | — |
| `【池永社内】コピーライトマスタ` | ✅ **Đã xong** — cột `出版社事前確認` đã tồn tại (xác nhận 2026-09-01), GAS❶/GAS❷ tự kích hoạt đúng như thiết kế | — |

Việc "chỉ cần thêm cột" giờ đã hết; 2 việc còn lại là **code**, không phải sheet:
`素材共有日` và `レギュレーション判定状況` của `顧客作品マスタ` đã có cột trên sheet nhưng
**GAS chưa ghi** (§4.12, §4.16).

### 5c. Một khoảng trống trong code (không phải câu hỏi cho team)

| # | Chỗ nào | Vấn đề |
|---|---|---|
| 1 | GAS❷ guard chống chạy sớm (§3.1) | Guard chỉ kiểm `更新日` của `顧客作品マスタ`. GAS❶ ghi `顧客作品マスタ` **rồi đóng dấu `更新日`**, **sau đó** mới ghi `コピーライトマスタ` → tồn tại cửa sổ mà guard cho qua trong khi `コピーライトマスタ` còn cũ hoặc đang ghi dở. Khi đó 3 cột copyright của `タイトルマスタ` nhận giá trị **cũ** và giữ nguyên **tới lần chạy sau (8 tiếng)** — đúng loại tai nạn mà guard sinh ra để chặn, chỉ là cho nguồn phụ. Tự khỏi ở lần chạy kế tiếp. **Cách sửa:** kiểm luôn `更新日` của `コピーライトマスタ` (nguồn phụ → chỉ cần đặt `copyrightAvailable = false` thay vì thoát hẳn), hoặc để GAS❶ đóng dấu cả 2 master **sau khi cả 2 đã ghi xong** |

---

## 6. Ba tab log của mỗi GAS

| GAS | Nằm trong | Tab | Mỗi dòng là |
|---|---|---|---|
| ❶ | `顧客作品マスタ` | `GAS1ログ` / `GAS1警告` / `GAS1変更詳細` | 1 lần chạy / 1 cảnh báo (13 loại) / 1 field đã đổi |
| ❷ | `タイトルマスタ` | `GAS2ログ` / `GAS2警告` / `GAS2変更詳細` | 1 lần chạy / 1 cảnh báo (**5 loại**) / 1 cột đã đổi |

**13** loại cảnh báo GAS❶: `照合注意` · `照合曖昧` · `孤立行` · `外部出稿NG注意` · `掲載停止注意` ·
`コピーライト注意` · `先行延長注意` · `大量無料注意` · `タイトル区分注意` · `LP制作注意` ·
`出版社事前確認注意` · `更新日注意` · `判定消失注意` (thêm 2026-09-01: tác phẩm **đang** có
`①②③` trên master mà lần chạy này tra không ra dòng `判定済み` — số này xấp xỉ tổng số dòng
master nghĩa là sheet nguồn ① đã gãy, không phải vài tác phẩm lẻ đổi `ステータス`).

**5** loại cảnh báo GAS❷: `タイトルNo欠落` · `タイトルNo重複` · `コピーライト未登録` · `孤立行` ·
`設定注意`. `GAS2ログ` có đúng 5 cột đếm tương ứng.

`設定注意` gom 2 việc khác nhau — đọc `詳細` để biết là việc nào:
1. **`更新日` của `顧客作品マスタ` không phải hôm nay** → lần chạy đã **thoát mà không ghi gì** (§3.1)
2. **`コピーライトマスタ` thiếu cột `出版社事前確認`** → chỉ cột `出版社事前確認` bên `タイトルマスタ` bị bỏ, phần còn lại ghi bình thường

Cả 3 master được đóng dấu `更新日` (ô `C5`) = thời điểm chạy, **dùng chung một mốc** với tab
警告 và 変更詳細 để 3 nơi đối chiếu được với nhau.

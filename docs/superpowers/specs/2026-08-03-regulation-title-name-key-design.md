# GAS❶ — Đổi cấu trúc: lọc レギュレーション theo タイトル名 + khoá upsert 3 tầng

Ngày viết: 2026-08-03
Trạng thái: Chờ user review
Spec gốc được bổ sung/ghi đè: [2026-07-17-gas1-customer-copyright-master-design.md](2026-07-17-gas1-customer-copyright-master-design.md)

## 1. Bối cảnh (Why)

Ba thay đổi đến cùng lúc, và chúng liên quan tới nhau nên phải thiết kế chung một lần:

1. **池永 phát hành ガワ mới cho 顧客作品マスタ** (bản tải về `example/【池永社内】顧客作品マスタ0803.xlsx`). Layout thay đổi hoàn toàn: header xuống hàng 15, thêm 4 cột mới, **bỏ 2 cột** `コピーライト` và `備考`, và thêm đúng 2 cột `①広告出稿ポリシー` / `②一般面出稿NG` mà GAS❶ hiện đang bỏ không đọc.
2. **Nghiệp vụ yêu cầu 2 quy tắc lọc mới** dựa trên 2 cột đó (mục 3.1 dưới đây).
3. **Bỏ CMSID khỏi logic**, chỉ dùng `タイトルID` + `タイトル名` — trong khi CMSID đang là khoá upsert của 顧客作品マスタ.

Điểm 3 là điểm nhạy nhất: CMSID được chọn làm khoá sau một sự cố trùng dòng (xem comment [src/sources/cmsSource.js:10-14](../../../src/sources/cmsSource.js#L10)), chính vì `タイトルID` có 3,5% dòng trống. Bỏ nó đi mà không thiết kế lại khoá thì sự cố đó quay lại.

## 2. Phạm vi

**Trong phạm vi:**
- Đổi vai trò nguồn `作品レギュレーション判定`: từ "cấp 1 cột `③シーモアロゴ判定`" thành "bộ lọc quyết định tác phẩm nào được vào master + cấp 3 cột N/O/P".
- Đổi khoá join giữa CMS và レギュレーション sang `タイトル名`, so 完全一致.
- Đổi khoá upsert của 顧客作品マスタ sang cascade 3 tầng, bỏ CMSID khỏi mọi logic.
- Đọc/ghi được ガワ mới (header hàng 15, cột A là cột đệm, B→Q).
- Ba loại cảnh báo mới ghi vào `GAS1ログ`.
- コピーライトマスタ: loại theo cùng danh sách đã lọc, đổi khoá theo `タイトルNo` mới.

**Ngoài phạm vi (nêu rõ để không bị hiểu là bỏ sót):**
- Cột **L `大量無料開始日`** / **M `大量無料終了日`** — nguồn `大量無料希望作品リスト_CA様` chưa có file, chưa có ID. Để trống.
- Cột **Q `掲載停止日付`** — ghi chú trên sheet nói lấy từ レギュレーション (ô B9: `③【社外用】作品レギュレーション判定＞N~Q列`) nhưng bản レギュレーション ta đang có **không có cột nào** mang nghĩa này. **Đã chốt: tạm skip, để trống** (mục 10d).
- Cột `備考` không còn tồn tại trên ガワ mới. Nguồn `外部出稿用NGタイトル` chuyển từ "điền cột 備考" thành "cảnh báo trong `GAS1ログ`" — **đã chốt**, xem mục 10a.
- `旧情報アーカイブ` — ô B8 của ガワ mới nói `毎日 9時、17時にGASで更新＋旧情報アーカイブ`. Chức năng archive bản cũ chưa tồn tại trong code, không làm ở lần này.
- Slack notification (vẫn như spec gốc: chỉ ghi log sheet).

## 3. Quy tắc nghiệp vụ

### 3.1 Hai quy tắc gốc (nguyên văn yêu cầu)

> ・レギュレーションシート上で①広告出稿ポリシー「問題あり」or②一般面出稿NG「アダルト作品扱い」「アダルトジャンル」の作品が先行作品リストに含まれていた場合は顧客作品マスタに反映しない
>
> ・途中からレギュレーションシート上で①広告出稿ポリシー「問題あり」or②一般面出稿NG「アダルト作品扱い」「アダルトジャンル」に変更された場合、顧客作品マスタ上でN-O列の情報を更新して、削除等はしない

### 3.2 Định nghĩa NG

```
isNg  <=>  normalize(①広告出稿ポリシー) === '問題あり'
       ||  normalize(②一般面出稿NG)   ∈ { 'アダルト作品扱い', 'アダルトジャンル' }
```

`normalize` = `normalizeJapaneseText()` hiện có ([src/logic/upsert.js:39](../../../src/logic/upsert.js#L39)): trim → gộp `〜`(U+301C)/`～`(U+FF5E) → NFKC.

**Các giá trị KHÔNG tính là NG** (đã đo trên dữ liệu thật, giữ nguyên văn khi ghi ra cột N/O):

| Giá trị | Số dòng 判定済み |
|---|---|
| `②一般面出稿NG = 出稿NG` | 6 |
| `①広告出稿ポリシー = 素材不足により判定不可` | 1 |
| `②一般面出稿NG = 素材不足により判定不可` | 2 |
| `②一般面出稿NG` trống | 8 |

> ⚠️ `②=出稿NG` (6 dòng) nghe như phải chặn nhưng không nằm trong danh sách 2 giá trị mà nghiệp vụ chỉ định. Đã nêu với user, user không yêu cầu đổi → giữ "không loại". Nếu 営業 phản ánh, đây là chỗ sửa đầu tiên.

### 3.3 Điều kiện vào 顧客作品マスタ

Một tác phẩm CMS chỉ được ghi vào master khi **cả hai** điều kiện đúng:

1. Tra ra được **một dòng レギュレーション có `ステータス = 判定済み`** khớp `タイトル名` 完全一致.
2. Dòng đó **không NG** theo 3.2.

Tác phẩm không tra ra (**未判定**) bị **loại**, không ghi vào master.

Căn cứ: ghi chú của chính sheet nguồn, ô **B3** của `シート1`:

> `B列（ステータス）が「判定済み」のもののみ進行可　それ以外は判定中のためお待ちください。`

Nửa sau của câu mới là điểm quyết định: trạng thái khác `判定済み` không có nghĩa "không có vấn đề" mà là **"đang chấm, hãy chờ"**. Nên 未判定 không được coi là an toàn để đưa vào master — phải chờ. Điều này khác hẳn cách code hiện tại xử lý (tra không ra thì để cột trống nhưng vẫn ghi tác phẩm vào master, tức âm thầm coi như đã thông qua).

Cùng logic đó áp cho tác phẩm **không có dòng nào** trong レギュレーション: cũng là "chưa được chấm" → chờ, không vào master.

### 3.4 Rule 2 — tác phẩm đã có trong master rồi mới chuyển NG

Lọc chỉ áp dụng cho tác phẩm **chưa có** trong master:

| Trạng thái | Đã có trong master | Chưa có trong master |
|---|---|---|
| 判定済み, không NG | Update bình thường | **Thêm mới** |
| 判定済み, **NG** | **Giữ dòng, update N/O/P**, không xoá | **Không thêm** |
| **未判定** (rút phán định / chưa chấm) | **Giữ dòng, giữ nguyên N/O/P cũ**, báo log | **Không thêm** |

GAS❶ **không có bất kỳ nhánh xoá dòng nào** — đúng theo `削除等はしない`.

Rule 2 không cần code riêng: `diffUpsert()` thấy cột N/O đổi → update dòng, `GAS1変更詳細` tự log `変更前`/`変更後`.

### 3.5 Chiều ngược lại (NG → không NG)

Tác phẩm từng bị loại vì NG, sau đó レギュレーション sửa thành `問題なし`/`一般面OK` → **được thêm mới** vào master như tác phẩm mới, nhận `タイトルNo` kế tiếp. Không lưu danh sách "đã từng bị loại".

### 3.6 コピーライトマスタ

Dựng từ **chính danh sách đã lọc** của 顧客作品マスタ. Tác phẩm bị loại (NG hoặc 未判定) tự động vắng mặt ở コピーライトマスタ, vì nó không có `タイトルNo` — và `タイトルNo` là khoá của master đó.

## 4. Khoá join CMS ↔ レギュレーション: タイトル名, 完全一致

### 4.1 Quy tắc

```
key = normalizeJapaneseText(タイトル名)     // trim + 〜/～ + NFKC
```

So sánh **完全一致**. **Không** cắt hậu tố `【】`/`()`, **không** fuzzy, **không** fallback sang `CMSID`/`タイトルID`.

Tên trùng nhau giữa các dòng 判定済み → **dòng nghiêm ngặt nhất thắng** (có NG thì NG thắng), thay vì "dòng sau đè dòng trước" như code hiện tại. Trên dữ liệu hôm nay: 14 tên trùng, 0 ca phán định mâu thuẫn nên chưa ca nào cần tới quy tắc này.

### 4.2 Vì sao giữ NFKC mà vẫn gọi là 完全一致

77 dòng chênh giữa "so chuỗi thô" và "NFKC" đều là **cùng một tên, khác mã ký tự vô hình**:

| CMS | レギュレーション | Khác nhau |
|---|---|---|
| `落城の美姫〜堅物皇子の甘い執着〜` | `落城の美姫～堅物皇子の甘い執着～` | U+301C vs U+FF5E, hiển thị y hệt |
| `マンションゲーム 全2101戸…` | `マンションゲーム　全2101戸…` | space vs space toàn rộng |
| `…(フルカラー)` | `…（フルカラー）` | ngoặc nửa rộng vs toàn rộng |
| `…お控えください！？` | `…お控えください!?` | ！？ vs !? |
| `ヤれなかった女たち(フルカラー)` | cùng chuỗi + NBSP cuối | ký tự vô hình U+00A0 |

Bỏ NFKC mất 77 dòng (11 trong đó là tác phẩm NG) mà không được gì.

### 4.3 Đã cân nhắc và bị loại

| Phương án | Tra ra | Loại NG | Lý do loại |
|---|---|---|---|
| Tên + fallback ID (3 tầng) | 2.676 | 668 | User chọn không dùng ID |
| Tên, cắt hết `【】()`, dấu câu | 2.663 | 688 | **179 ca tra sang tác phẩm khác**, 528 tác phẩm CMS riêng biệt bị gộp |
| **Tên, 完全一致 (đã chốt)** | **2.325** | **595** | — |

Chuẩn hoá mạnh không dùng được vì phần bị cắt lại mang phán định khác nhau:

- `ひとつ屋根の下、幼馴染はふしだらに。【白抜き修正版】` = **一般面OK**
- `ひとつ屋根の下、幼馴染はふしだらに。【棒消し修正版】` = **アダルトジャンル**
- `先輩たちに求められすぎて困っています…(フルカラー)` (CMSID 1601) và `…【タテヨミ】` (CMSID 1602) là **2 tác phẩm CMS khác nhau**

### 4.4 Chuẩn hoá CHỈ để so khớp — ghi ra luôn là giá trị gốc

`normalizeJapaneseText()` chỉ được dùng để **dựng khoá và so sánh**. Không có giá trị nào đã chuẩn hoá được ghi vào sheet.

Sau khi khớp, mỗi cột lấy giá trị gốc từ **đúng nguồn sở hữu cột đó** theo ghi chú ô B9 của ガワ (`CMS＞C~K列`, `レギュレーション＞N~Q列`):

| Cột ghi ra | Giá trị gốc lấy từ |
|---|---|
| C `CMS ID`, D `タイトルID`, **E `タイトル名`**, F→K | **CMS**, nguyên văn |
| **N `①広告出稿ポリシー`**, **O `②一般面出稿NG`**, **P `③シーモアロゴ判定`** | **レギュレーション**, nguyên văn |

Ví dụ cụ thể — tác phẩm khớp nhau nhờ NFKC nhưng hai bảng viết khác nhau:

```
CMS         : 落城の美姫〜堅物皇子の甘い執着〜      (U+301C)
レギュレーション : 落城の美姫～堅物皇子の甘い執着～      (U+FF5E)
khoá khớp    : 落城の美姫～堅物皇子の甘い執着～      (sau NFKC, chỉ tồn tại trong bộ nhớ)

-> cột E ghi : 落城の美姫〜堅物皇子の甘い執着〜      (gốc CMS, U+301C — KHÔNG phải khoá)
-> cột N/O/P : giá trị gốc của dòng レギュレーション đã khớp
```

Áp dụng cho cả cascade khoá upsert ở mục 5: so khớp bằng giá trị đã chuẩn hoá, nhưng cột D `タイトルID` ghi **nguyên văn CMS** — kể cả khi giá trị đó là `ー` hay `※既に配信済みのためCMS削除`, giữ y nguyên cho tới khi CMS cấp số thật.

Hệ quả cần biết: `タイトル名` trên master sẽ theo cách viết của **CMS**, nên nếu đối chiếu mắt thường giữa master và レギュレーション vẫn sẽ thấy chênh nhau ở mấy ký tự vô hình — đó là đúng thiết kế, không phải lỗi.

### 4.5 Hệ quả đã biết và được user chấp nhận

**73 tác phẩm アダルト sẽ vào master** vì tên hai bên viết khác nhau. Chúng tra ra được nếu dùng `タイトルID`/`CMSID` nhưng không tra ra bằng tên. Đây là quyết định của user sau khi được trình bày số liệu 2 lần. Mẫu:

| CMS ghi | レギュレーション ghi | 判定 |
|---|---|---|
| `超肉食系年下男子たちに溺愛されて困っています(フルカラー)` | `超肉食系年下男子たちに溺愛されて困っています` | アダルト作品扱い |
| `【ラブパルフェ】藤咲さんはびしょぬれ名器～…` | `藤咲さんはびしょぬれ名器～…` | アダルト作品扱い |
| `管理人さんと秘密の家チン交渉【タテヨミ】` | `管理人さんと秘密の家チン交渉` | アダルト作品扱い |
| `帰れないふたり` | `帰れないふたり 1巻 ～台風の夜、憧れの先輩と…` | アダルト作品扱い |
| `ヒグマグマ` | `ヒグマグマ【単話版】` | ①=問題あり |

→ Nếu sau này 営業 phản ánh có tác phẩm アダルト lọt xuống bước sau, đây là chỗ xem lại đầu tiên, và có số liệu trong spec này để đối chiếu.

**Quy tắc ① hiện không loại được dòng nào.** レギュレーション có 20 dòng `①=問題あり`, nhưng **19 dòng không tồn tại trong danh sách 先行タイトル CMS** dù tra bằng tên hay ID (`そして、ミナになった。`, `澱の中`, `動物人間`, `藻屑蟹【コミック単話版】`…). Dòng thứ 20 là `ヒグマグマ【単話版】`, tên không khớp. Toàn bộ 595 ca loại được đều đến từ quy tắc ②. Đây là đặc điểm dữ liệu, không phải lỗi logic — nhưng nghĩa là **quy tắc ① chưa được kiểm chứng bằng ca thật nào**.

## 5. Khoá upsert 顧客作品マスタ: cascade 3 tầng

### 5.1 Vì sao không dùng một trường đơn

Bỏ CMSID thì **không còn trường nào bất biến**. Đo trên 1.730 dòng thực sự vào master:

| Khoá | Phân biệt được | Số dòng khoá sẽ **đổi giá trị** |
|---|---|---|
| Chỉ `タイトルID` | 1.625 / 1.730 (mất 105) | **108 (6,2%)** |
| Chỉ `タイトル名` | 1.727 / 1.730 (mất 3) | 2 (0,1%) |
| `タイトルID` + `タイトル名` ghép | 1.729 / 1.730 | **110** — đổi trường nào cũng đổi khoá |

`タイトルID` biến động vì 104 dòng trống + các giá trị dùng ô ID để ghi chú: `ー`, `4415行目と同一`, `4429行目と同一`, `※既に配信済みのためCMS削除`, `確認中`. Vì GAS quét **mỗi ngày**, `""` → `347590` là một thay đổi thật, và nếu khoá chứa `タイトルID` thì đó là **đổi khoá → sinh dòng trùng**.

`タイトル名` biến động ở 2 tác phẩm còn dấu 仮: `優里亜、聞いてる？　恋人(仮)は妄想より奇なり【単話】`, `愛され天くんの執着カレシ（仮）`.

### 5.2 Quy tắc cascade

Tìm dòng master ứng với 1 record CMS, thử theo thứ tự, **dừng ngay ở tầng đầu tiên có kết quả**:

| Tầng | Điều kiện khớp | Bắt được tình huống |
|---|---|---|
| **1** | `normalize(タイトルID)` **và** `normalize(タイトル名)` đều khớp | Bình thường, không có gì đổi |
| **2** | `タイトルID` khớp, **và cả hai bên đều là số thật** (`isDigit`) | **Đổi tên** (bỏ dấu 仮) |
| **3** | `タイトル名` khớp | **`タイトルID` từ trống/chữ thành số** |

Không khớp tầng nào → dòng mới, cấp `タイトルNo` kế tiếp.

Điều kiện `cả hai bên đều là số thật` ở tầng 2 là bắt buộc: nếu không, mọi dòng có `タイトルID` trống sẽ khớp lẫn nhau ở tầng 2 (khoá rỗng = khoá rỗng), và 3 dòng cùng ghi `4415行目と同一` sẽ khớp nhau.

### 5.3 Ràng buộc chiếm-một-lần (bắt buộc)

**Một dòng master chỉ được một record chiếm trong cùng một lần chạy.** Record sau phải bỏ qua dòng đã bị chiếm và thử tiếp ở dòng/tầng khác.

Không có ràng buộc này thì 2 record dùng chung một `タイトルID` — thật sự tồn tại: `冬すぎて桜` và `冬すぎて桜【タテヨミ】` cùng `タイトルID` 266030 — sẽ cùng ghi vào một dòng ở tầng 2, **mất một record im lặng**.

### 5.4 Kết quả mô phỏng

Script: `scratchpad/sim_cascade.py`. Chạy 4 lần liên tiếp trên dữ liệu thật:

| Lần chạy | Thêm mới | Update | Master | Khớp ở tầng |
|---|---|---|---|---|
| 1 — nạp lần đầu (master rỗng) | 1.730 | 0 | 1.730 | — |
| 2 — dữ liệu y nguyên | **0** | **0** | 1.730 | tầng 1: 1.730 |
| 3 — sau biến động | **0** | 110 | 1.730 | tầng 1: 1.620, tầng 2: 2, tầng 3: 108 |
| 4 — chạy lại sau biến động | **0** | **0** | 1.730 | tầng 1: 1.730 |

Lần 3 biến đổi đúng 2 kiểu thật: 108 dòng `""`/`ー`/`4415行目と同一`/`※既に配信済みのためCMS削除` được cấp số, và 2 dòng bỏ dấu 仮. Mỗi kiểu được bắt bởi đúng tầng còn lại:

```
No=870  tầng 3  titleId  : 'ー'                       -> '900001'
No=1116 tầng 3  titleId  : '※既に配信済みのためCMS削除'    -> '900004'
No=1072 tầng 2  titleName: '…恋人(仮)は妄想より奇なり…'   -> '…恋人は妄想より奇なり…'
No=1283 tầng 2  titleName: '愛され天くんの執着カレシ(仮)'   -> '愛され天くんの執着カレシ'
```

Cascade còn **tốt hơn** khoá theo tên đơn thuần: giữ đủ 1.730 dòng thay vì gộp mất 3, vì 3 cặp trùng tên được tầng 1 tách ra nhờ `タイトルID` khác nhau.

### 5.5 CMSID sau thay đổi

- **Không** dùng trong bất kỳ logic tra cứu/khoá nào.
- **Vẫn ghi giá trị** vào cột C `CMS ID` của master, để tra ngược về CMS khi điều tra sự cố.
- Bộ lọc "dòng trống" đổi từ `CMSID rỗng → bỏ` sang **`タイトル名 rỗng → bỏ`**:
  - [src/sources/cmsSource.js:51](../../../src/sources/cmsSource.js#L51)
  - [src/io/sheetIO.js:108](../../../src/io/sheetIO.js#L108)
  - Lý do: `タイトル名` có **0 dòng trống** trong 5.649 dòng CMS — an toàn nhất trong 3 trường.

## 6. Năm loại cảnh báo mới → tab `GAS1警告`

Hôm nay đã có **4 dòng nguy hiểm** trong 1.730: 3 dòng trùng `タイトル名` với dòng khác, 1 dòng trùng `タイトルID` số. Với những dòng này, khi tầng 1 trượt thì tầng 2/3 có thể bắt sang dòng láng giềng sai.

| Loại | Khi nào | Ý nghĩa |
|---|---|---|
| **照合注意** | Khớp ở **tầng 2 hoặc 3** | Một trong hai trường định danh vừa đổi. Không phải lỗi, nhưng phải nhìn thấy được (110 ca trong mô phỏng lần 3) |
| **照合曖昧** | Ở tầng thắng có **>1 dòng ứng viên** chưa bị chiếm | Cảnh báo thật. GAS chọn theo thứ tự cố định (dòng có `タイトルNo` nhỏ nhất) rồi báo, để người kiểm |
| **孤立行** | Dòng master **không record nào chiếm** trong lần chạy | Tác phẩm đổi tên (dòng cũ mồ côi), hoặc bị rút phán định. Rule 2 cấm xoá → chỉ báo |
| **外部出稿NG注意** | Tác phẩm khớp `外部出稿用NGタイトル` và dòng đó có `備考` | Thay cho cột `備考` đã bị bỏ khỏi ガワ (mục 10a). Ghi kèm tên tác phẩm + nội dung `備考`. Hôm nay: **10 tác phẩm** |
| **掲載停止注意** | Không tìm thấy file TSV, HOẶC nhiều tác phẩm dùng chung 1 `タイトルID` có ngày dừng | Nguồn cột I (mục 10d). Cùng 1 `タイトルID` nghĩa là cả nhóm nhận cùng một ngày — có thể đúng, có thể sai, người phải xem |

### 6.1 Ghi thành DÒNG ở tab riêng `GAS1警告`, không nhồi vào 1 ô của `GAS1ログ`

Spec bản đầu viết "ghi vào `GAS1ログ`" mà không nói hình dạng. Khi triển khai đã chốt: **tab riêng, 1 dòng = 1 cảnh báo**, cột `実行日時 / 種別 / タイトルNo / タイトルID / タイトル名 / 詳細`.

Lý do: mô phỏng mục 5.4 lần 3 cho **110 ca `照合注意` trong MỘT lần chạy**. Nhồi 110 tên tác phẩm vào một ô thì không ai đọc được và sẽ đụng giới hạn 50.000 ký tự/ô khi dữ liệu lớn hơn. 1 dòng = 1 cảnh báo thì lọc/sort/tìm được như dữ liệu bình thường — cùng lý do vì sao `GAS1変更詳細` là tab riêng. Vẫn đúng tinh thần "ghi vào log của chính GAS❶, không cần xin cột trên ガワ của 池永".

### 6.2 Bảy số đếm mới trong `GAS1ログ`

`GAS1ログ` (1 dòng = 1 lần chạy) nhận thêm 7 cột, để nhìn 1 dòng là biết lần chạy đó có gì lạ mà không cần mở `GAS1警告`:

- **除外_NG件数** (hôm nay: 595) và **除外_未判定件数** (hôm nay: 3.353) — 2 con số quan trọng nhất của bộ lọc mới, vì giờ tác phẩm biến mất khỏi master một cách im lặng.
- **照合注意件数 / 照合曖昧件数 / 孤立行件数 / 外部出稿NG注意件数 / 掲載停止注意件数** — số dòng của từng loại cảnh báo.

Tab `GAS1ログ` đã tồn tại với 6 cột từ bản trước; `ensureLogHeaderRow()` tự nâng cấp hàng header khi thấy khác, không đụng dòng dữ liệu cũ.

Nếu muốn thấy cảnh báo trên **từng dòng master** thì phải thêm cột vào ガワ — cần 池永 đồng ý, chưa làm ở lần này.

## 7. ガワ mới của 顧客作品マスタ

> ⚠️ **ガワ đã đổi 2 lần trong ngày 2026-08-03.** Bảng dưới đây là **bản thứ hai**, đã xác minh trên CẢ `example/【池永社内】顧客作品マスタ0803.xlsx` (bản user cập nhật buổi chiều) và sheet `顧客作品マスタ` của `example/【ソル】タイトルマスタ　ガワ作成 0803 .xlsx` — hai file khớp nhau. Bản đầu tiên (B→Q, có cột `コピーライト`, chưa có `タイトル区分`/`LP制作`/`先行終了日（延長）`) KHÔNG còn hiệu lực.

File: `example/【池永社内】顧客作品マスタ0803.xlsx`, sheet `顧客作品マスタ`. Dữ liệu cũ được 池永 giữ ở sheet `顧客作品マスタ_元`.

**Header ở hàng 15, dữ liệu từ hàng 16, cột A là cột đệm trống, dữ liệu B→U:**

| Cột | idx | Header | Hàng 13 ghi `自動入力/GAS`? | GAS❶ ghi? |
|---|---|---|---|---|
| A | 0 | *(trống)* | — | Không (cột đệm) |
| B | 1 | `タイトルNo` | ✅ | ✅ GAS tự cấp |
| C | 2 | `CMS ID` | ✅ | ✅ (chỉ ghi, không dùng logic — mục 5.5) |
| D | 3 | `タイトルID` | ✅ | ✅ |
| E | 4 | `タイトル区分` | ✅ | ❌ **giữ nguyên** — nguồn `出稿コミット管理表` (安蒜社内) chưa có file (mục 13) |
| F | 5 | `①広告出稿ポリシー` | ✅ | ✅ **mới** |
| G | 6 | `②一般面出稿NG` | ✅ | ✅ **mới** |
| H | 7 | `③シーモアロゴ判定` | ✅ | ✅ |
| I | 8 | `掲載停止日付` | ✅ | ✅ **ghi một lần** — nguồn TSV trên Drive, join theo `タイトルID` (mục 10d) |
| J | 9 | `LP制作` | ❌ | ❌ **giữ nguyên** (mục 13) |
| K | 10 | `タイトル名` | ✅ | ✅ |
| L | 11 | `作家名` | ✅ | ✅ |
| M | 12 | `ジャンル` | ✅ | ✅ |
| N | 13 | `出版社` | ✅ | ✅ |
| O | 14 | `レーベル名` | ✅ | ✅ **mới** (code đã parse sẵn `label`, trước đây bỏ không dùng) |
| P | 15 | `先行開始日` | ✅ | ✅ |
| Q | 16 | `先行終了日` | ✅ | ✅ |
| R | 17 | `先行終了日（延長）` | ❌ | ❌ **giữ nguyên** (mục 13) |
| S | 18 | `先行終了日（最終確定）` | ❌ | ❌ **giữ nguyên** (mục 13) |
| T | 19 | `大量無料開始日` | ✅ | ❌ **giữ nguyên** — nguồn `大量無料希望作品リスト_CA様` chưa có file |
| U | 20 | `大量無料終了日` | ✅ | ❌ **giữ nguyên** — cùng lý do |

Hai điều quan trọng rút ra:

1. **Thứ tự cột đổi hoàn toàn nhưng code gần như không cần biết** — `io/sheetIO.js` tra cột theo TÊN header, nên việc `タイトル名` nhảy từ cột E sang cột K không tốn dòng code nào. Chỉ 3 thứ thật sự phải sửa: hàng header (1 → tự dò), danh sách header bắt buộc, và cách bảo toàn cột không sở hữu.
2. **6 cột GAS không ghi + 1 cột ghi-một-lần.** Cách ghi cũ (`new Array(columnCount).fill('')` rồi `setValues` cả dòng) sẽ **xoá trắng** những cột này mỗi lần dòng bị update — bug thật sẽ xảy ra ngay khi có người điền tay. Đã sửa: dòng ghi được dựng **từ bản copy của dòng cũ**, chỉ ghi đè cột GAS sở hữu (xem `customerRecordToRow()`).

### 7.1 Thay đổi bắt buộc ở sheetIO

[src/io/sheetIO.js:50](../../../src/io/sheetIO.js#L50) đang hardcode header ở hàng 1:

```js
var headerRow = sheet.getRange(1, 1, 1, columnCount).getValues()[0];
```

→ **hỏng** với ガワ mới. Phải dùng `findHeaderRowIndex()` sẵn có trong [src/util/headerMap.js](../../../src/util/headerMap.js) để dò hàng header (đã dùng cho các nguồn có hàng ghi chú ở trên), và ghi từ `headerRow + 1`. Không hardcode số 15.

### 7.2 Hai cột bị bỏ khỏi master này

- **`コピーライト`** — vẫn tính bình thường (`resolveCopyright`, 4 tầng, không đổi) để đổ sang コピーライトマスタ. Chỉ là không còn ghi vào 顧客作品マスタ.
- **`備考`** — cảnh báo `外部出稿NGタイトル` không còn cột output nào ở master này. Nguồn `ngTitleSource` chuyển thành nguồn **cảnh báo trong `GAS1ログ`**, ảnh hưởng 10 tác phẩm. Chi tiết + số liệu ở **mục 10a**.

## 8. Thứ tự thực thi trong `runGas1()`

```
 1. Đọc các nguồn (レギュレーション, CMS, 出版社ルール, + TSV 掲載停止日付 trên Drive)
 2. buildRegulationLookup()  -> Map<normalize(タイトル名), {policy, general, logo, isNg}>
                                chỉ dòng ステータス=判定済み, tên trùng thì NG thắng
 3. buildCustomerWorkRows()  -> gắn ①②③ + judged/isNg cho từng tác phẩm CMS (CHƯA lọc)
 4. readCustomerWorkMaster() -> existingRows (kèm sheetRow + rawRow mỗi dòng)
 5. filterAndMatchWorks()    -> LỌC (rule 1 + rule 2) VÀ khớp dòng master (cascade 3
                                tầng + chiếm-một-lần) trong CÙNG MỘT LƯỢT, 2 phase:
                                  Phase A: tác phẩm 判定済み && !isNg chiếm dòng TRƯỚC
                                  Phase B: NG/未判定 chỉ giữ nếu còn dòng chưa bị chiếm
 6. resolveCopyright() + lookupSuspensionDate(), CHỈ cho tác phẩm được giữ
 7. resolveNumbersFromMatches()  -> cấp/dùng lại タイトルNo
 8. diffUpsertFromMatches() -> writeCustomerWorkMaster()
 9. Build + ghi コピーライトマスタ từ CHÍNH danh sách đã lọc ở bước 5
10. Ghi GAS1変更詳細
11. Ghi GAS1警告 (5 loại cảnh báo, mục 6)
12. Slack (nếu có tầng 4) + GAS1ログ (kèm 7 số đếm, mục 6.2)
```

### 8.1 Vì sao lọc và khớp dòng là MỘT LƯỢT (khác bản đầu của spec này)

Bản đầu tách bước 5 (lọc) và bước 6/7 (đánh số + diff) thành 2 lượt riêng. Khi triển khai phát hiện điều đó **tự tạo lại đúng lỗi trùng dòng mà cả thiết kế này sinh ra để chống**:

Lọc cần trả lời "tác phẩm này đã có trên master chưa" (rule 2), mà câu trả lời đó chính là kết quả khớp dòng. Tách 2 lượt thì lượt 1 và lượt 2 chiếm dòng theo **thứ tự khác nhau** → một tác phẩm NG có thể chiếm dòng của một tác phẩm hợp lệ ở lượt 1 rồi mất dòng đó ở lượt 2 → tác phẩm hợp lệ bị **append thành dòng MỚI**.

Giải pháp: 1 index dùng chung, 2 phase như mô tả ở bước 5. Tác phẩm chắc chắn được ghi có quyền ưu tiên chiếm dòng. Đã có test cho đúng ca này (`tools/verify/tests.js`, hàm `test_filter`: "phase A: tác phẩm hợp lệ chiếm dòng trước").

### 8.2 Các ràng buộc thứ tự khác

- Bước 4 phải **trước** bước 5, vì rule 2 cần biết "đã có trên sheet chưa".
- Bước 5 phải **trước** bước 7, vì tác phẩm bị loại không được chiếm `タイトルNo`.
- Bước 7 phải **trước** bước 9, vì `コピーライトマスタ` dùng lại chính `タイトルNo` đó làm khoá riêng của nó.
- Bước 6 chỉ chạy cho tác phẩm được giữ: tính bản quyền cho 3.948 tác phẩm bị loại là vô nghĩa và tốn thời gian thực thi.

**Lần chạy đầu tiên** (mục 10b): bước 4 đọc về mảng rỗng, nên mọi tác phẩm đều rơi vào nhánh "chưa có trong master" — rule 2 không bảo vệ ai, 595 tác phẩm NG bị loại thẳng. Từ lần chạy thứ hai rule 2 mới có tác dụng. `コピーライトマスタ` cũng phải được xoá sạch trước lần chạy đầu, vì `タイトルNo` được cấp lại từ 1 và số cũ sẽ trỏ sai tác phẩm.

## 9. Ranh giới module

Spec bản đầu giữ nguyên cấu trúc 4 thư mục của spec gốc (`sources/` chỉ parse, `logic/` pure, `io/` nói chuyện với Google). Khi triển khai xong, **cấu trúc đã được gom lại thành 7 file chia theo VẤN ĐỀ** (2026-08-04, từ 19 file) vì 19 file nhỏ quá khó quản lý. Nguyên tắc quan trọng vẫn được giữ nguyên và còn rõ hơn:

> Ranh giới có ý nghĩa nhất KHÔNG phải `sources` vs `logic`, mà là **test được vs không test được**. `io.js` và `main.js` dùng `SpreadsheetApp`/`DriveApp` nên không test được bằng Node; 4 file còn lại (`common.js`, `sources.js`, `master.js`, `copyright.js`) là hàm pure và **được test đầy đủ** (mục 11). Mọi logic nghiệp vụ mới PHẢI nằm ở nhóm test được — logic đặt trong `main.js` là logic không thể kiểm chứng.

| File mới | Gộp từ | Thay đổi của lần này |
|---|---|---|
| `src/common.js` | `util/headerMap.js` + phần chuẩn hoá/so sánh của `logic/upsert.js` | **+ `colByPrefix()`** (header cột ①/② của レギュレーション có hậu tố ghi chú trong chính ô: `'①広告出稿ポリシー
（出稿NG）'`). **+ `isDigits()`, `toDateKey()`, `sameDateValue()`, `sameWriteOnceValue()`** |
| `src/sources.js` | `regulationSource` + `cmsSource` + `ngTitleSource` + `suspensionSource` | レギュレーション **viết lại** (bỏ `compositeKey`/3 map theo ID/`lookupRegulation`, thêm parse ①②, `isRegulationNg()`, lookup theo tên NG-thắng). CMS lọc dòng theo `タイトル名`, **xoá `buildCmsCopyrightLookup()`** (mục 9.1). NG title đổi *chỗ tiêu thụ* sang cảnh báo. **suspensionSource MỚI** (mục 10d) |
| `src/master.js` | `customerWorkMaster` + `regulationFilter` (mới) + phần cascade/diff của `upsert` + `warnings` (mới) + `changeDetail` | **`filterAndMatchWorks()` MỚI** — lọc + khớp dòng một lượt 2 phase (mục 8.1). **Cascade 3 tầng + chiếm-một-lần MỚI**. **5 hàm cảnh báo MỚI** (mục 6). `diffUpsert()`/`resolveNumbers()` cũ giữ nguyên cho コピーライトマスタ. `changeDetail` fieldDef nhận `compare` tuỳ chọn |
| `src/copyright.js` | `copyrightRules` + `copyrightResolver` + `copyrightHistory` | Tầng 1 đọc `work.copyrightU`, bỏ tham số `cmsCopyrightLookup` (mục 9.1). Tầng 2/3/4 không đổi |
| `src/io.js` | `sheetIO` + `driveTsv` (mới) + `logSheet` + `slack` | `resolveMasterHeader()` **tự dò hàng header** + trả `values`. Map cột sang **B→U**. Ghi theo `sheetRow`. **Dựng dòng ghi từ bản copy dòng cũ** để giữ 6 cột GAS không sở hữu. **`driveTsv` MỚI** — file duy nhất dùng `DriveApp`. **+ tab `GAS1警告`** + 7 số đếm + `ensureLogHeaderRow()` |
| `src/main.js` | (giữ) | Thứ tự bước mới (mục 8), bỏ CMSID khỏi logic, ghi cảnh báo, **+ 3 probe mới**: `probe_readCustomerMasterHeader()`, `probe_dryRunFilter()`, `probe_dumpSuspensionTsv()` |
| `src/config.js` | (giữ) | `TRIGGER_HOURS: [9, 17]` (mục 10c) + `SOURCES.SUSPENSION` (mục 10d) |
| `tools/verify/**` | — | **MỚI**: harness Node không cần `npm install` + 124 test (mục 11), gồm `run.js`, `tests.js`, `exportFixtures.py` |

### 9.1 Tầng 1 của bản quyền: xoá lookup thay vì đổi khoá

[src/logic/copyrightResolver.js:71](../../../src/logic/copyrightResolver.js#L71) hiện tra tầng 1 như sau:

```js
var cmsValue = cmsCopyrightLookup.get(String(work.cmsId));
```

Đây là **self-join trên chính dữ liệu CMS**: `cmsCopyrightLookup` được build từ `cmsRecords`, rồi tra lại bằng `cmsId` của một `work` mà bản thân nó sinh ra từ đúng `cmsRecord` đó. Nên khi bỏ CMSID, cách xử lý đúng **không phải** đổi sang khoá tên (sẽ gặp lại đúng bài toán trùng tên), mà là:

- `buildCustomerWorkRows()` mang luôn `copyrightU` vào work object.
- `resolveCopyright()` đọc trực tiếp `work.copyrightU`, bỏ tham số `cmsCopyrightLookup`.
- Xoá hẳn `buildCmsCopyrightLookup()` khỏi [cmsSource.js](../../../src/sources/cmsSource.js).

Kết quả: ít một hàm, ít một lần tra cứu, và tầng 1 không còn phụ thuộc bất kỳ khoá nào. Tầng 2/3/4 của `resolveCopyright()` **không đổi** (vốn đã tra theo `titleId`/`titleName`/`publisher`).

## 10. Bốn mục đã chốt (2026-08-03)

### (a) `備考` — bỏ khỏi master, chuyển thành cảnh báo trong log

ガワ mới không có cột nào cho nội dung `備考` của nguồn `外部出稿用NGタイトル`. Đo mức ảnh hưởng thật:

| | Số |
|---|---|
| Dòng trong sheet `外部出稿用NGタイトル` | 671 (644 khoá tra) |
| **Tác phẩm CMS thật sự đang nhận được `備考`** | **10 / 5.649** |

Chỉ 10, vì phần lớn dòng NG **không có `タイトルID`** — chúng là quy tắc theo nhà xuất bản hoặc theo điều kiện chứ không theo tác phẩm cụ thể (`すべての作品`, `基本すべての作品`, `ロゴ判定リストで、シーモアロゴ「×」になっているタイトル`), nên `buildNgTitleLookup()` không tạo được khoá tra tới tác phẩm nào.

Phần lớn nội dung 10 cái đó **trùng ý nghĩa với 2 cột N–O mới** — đây có lẽ là lý do 池永 bỏ cột `備考`, vì phán định đã được cấu trúc hoá:

| Tác phẩm | `備考` | Tương ứng cột mới |
|---|---|---|
| `MY SWEET BUNNY CAGE` | `一般面での出稿ＮＧ（アダルト面での出稿はＯＫ）` | = `②一般面出稿NG` |
| `ヒグマグマ` | `熊被害が発生しているため出稿NG` | = `①広告出稿ポリシー` (レギュレーション đánh `問題あり`) |
| `華嫁（はなよめ）～…` | `諸般の事情により、広告出稿ＮＧ` | = `①広告出稿ポリシー` |

Nhưng **không trùng hết** — mấy dòng dưới đây là thông tin *dừng phân phối*, N–O không diễn đạt được, đúng ra thuộc cột **Q `掲載停止日付`** (xem mục d):

```
隙あらば…カレシが泣くまでいじめたい！   作家様都合で配信停止
ヤバい人に沼りました…                 2025/2/8（土）～：出版社都合により配信停止
心音【電子単話版】                    作家先生都合
```

**Quyết định:** bỏ cột `備考` khỏi 顧客作品マスタ theo đúng ガワ, nhưng **vẫn đọc nguồn** `外部出稿用NGタイトル` và ghi các tác phẩm có `備考` vào `GAS1ログ` dưới dạng cảnh báo **`外部出稿NG注意`** (kèm tên tác phẩm + nội dung `備考`). Không mất thông tin im lặng, không cần xin thêm cột.

→ `buildCustomerWorkRows()` bỏ field `remark`; `ngTitleLookup` chuyển từ "nguồn điền cột" thành "nguồn cảnh báo" (xem mục 6).

### (b) Lần chạy đầu — KHÔNG seed, chạy sạch từ đầu

Sheet `顧客作品マスタ` mới đang trống 0 dòng, dữ liệu cũ để lại ở `顧客作品マスタ_元`. **Không seed từ sheet cũ.**

Hệ quả cần nắm: lần chạy đầu mọi tác phẩm đều "chưa có trong master" → rule 2 (mục 3.4) không bảo vệ ai → **toàn bộ 595 tác phẩm NG bị loại thẳng**, kể cả những cái đang tồn tại trong `顧客作品マスタ_元`. Rule 2 chỉ bắt đầu có tác dụng **từ lần chạy thứ hai trở đi**.

`タイトルNo` cũng được cấp lại từ 1 — số cũ trong `顧客作品マスタ_元` không được kế thừa. コピーライトマスタ dùng `タイトルNo` làm khoá nên cũng phải được dựng lại từ đầu cùng lúc, **không được giữ dữ liệu cũ** (nếu không, `タイトルNo` mới sẽ trỏ sai tác phẩm).

### (c) Giờ chạy — 9時・17時

Đổi [src/config.js:66](../../../src/config.js#L66) `TRIGGER_HOURS` từ `[9, 18]` sang **`[9, 17]`** theo ô B8 của ガワ. Trigger cũ phải xoá và cài lại (`createGas1Trigger()`).

### (d) Cột I `掲載停止日付` — ĐÃ CÓ NGUỒN (cập nhật 2026-08-03)

Bản đầu của mục này viết "tạm skip, để trống" vì bản レギュレーション ta có không có cột nào mang nghĩa này. User đã cung cấp nguồn thật:

- **Folder Drive:** `1nv1ivJBdMGe7LOdHfAqX30AIZY55ge6a`
- **File:** `multi_title_yyyyMMdd.tsv` — nhiều file theo ngày; GAS lấy file có `yyyyMMdd` **lớn nhất mà không vượt ngày chạy**. Không tìm được file nào → ghi cảnh báo `掲載停止注意` rồi chạy tiếp bình thường, cột I không bị đụng tới.
- **Khoá join:** `タイトルID` (KHÔNG phải `タイトル名`), so khớp sau `normalizeJapaneseText` và **chỉ khi cả hai vế là số thật** — cùng lý do với tầng 2 của cascade (mục 5.2).
- **GHI MỘT LẦN, KHÔNG BAO GIỜ GHI ĐÈ:** ô nào đang có giá trị thì GAS không đụng tới, dù TSV nói khác, dù tác phẩm đã bị gỡ khỏi TSV. GAS chỉ điền vào ô đang trống.

**Vì sao ghi một lần chứ không "TSV là nguồn chân lý":** quyết định của user, và nó còn loại bỏ luôn một cái bẫy — TSV cho ra chuỗi `2025/2/8`, nhưng Google Sheets tự chuyển thành `Date` khi ghi vào ô, nên so sánh 2 thứ đó sẽ thấy "đã đổi" ở **mọi** lần chạy và ghi lại cả sheet mỗi ngày. Với ghi-một-lần thì không thể xảy ra (`sameWriteOnceValue`).

**Hai hệ quả đã biết**, cả hai đều được ghi cảnh báo chứ không im lặng:

- **~6% dòng master không bao giờ nhận được ngày dừng** vì `タイトルID` trống/không phải số (104 dòng trên 1.730).
- **2 tác phẩm dùng chung một `タイトルID` sẽ cùng nhận một ngày** — có thật: `冬すぎて桜` và `冬すぎて桜【タテヨミ】` cùng 266030.

**Định vị cột theo VỊ TRÍ, không theo tên header** (xác nhận trên file thật 2026-08-04): cột **A** = `タイトルID`, cột **D** = `掲載停止日付`. Đây là ngoại lệ duy nhất trong codebase — mọi nguồn Google Sheet khác đều tra cột theo TÊN (bền với việc chèn/xoá/đổi thứ tự cột). Lý do: TSV do hệ thống khác xuất ra, hàng đầu không phải hàng header đáng tin.

Nhờ ràng buộc "`タイトルID` phải là số thật", hàm parse **không cần biết file có hàng header hay không**: nếu có, hàng đó cho ra `titleId = 'TitleID'` và bị `buildSuspensionLookup()` bỏ đi. An toàn với cả 2 dạng file, không phải đoán.

**Còn treo:** `encoding` chưa được xác nhận bằng mắt trên file thật (đang để `UTF-8`). Sai encoding **không** làm sai việc so khớp vì khoá là số `タイトルID`, chỉ làm giá trị ngày bị mojibake NẾU ngày có kèm chữ Nhật (vd `2025/2/8（土）`). Chạy `probe_dumpSuspensionTsv()` để so 2 encoding rồi đổi nếu cần.

Lưu ý cho lần sau: một phần thông tin dừng phân phối cũng đang nằm rải trong `備考` của `外部出稿用NGタイトル` (mục a) và trong nguồn `配信停止一覧` (ngoài phạm vi). Khi có thời gian, đối chiếu 3 nguồn này với nhau.

## 11. Kiểm chứng

Kiểm chứng đã được đưa vào repo (thay cho 2 script Python nằm ở scratchpad, vốn đã mất cùng session):

| Đường | Kiểm chứng gì |
|---|---|
| `node tools/verify/run.js` | Test đơn vị tầng pure: định nghĩa NG (mục 3.2), lookup theo tên + NG-thắng (4.1), cascade 3 tầng + chiếm-một-lần (5.2/5.3), rule 2 (3.4), 5 loại cảnh báo (6), nguồn `掲載停止日付` (10d). Không cần dữ liệu thật, chạy ~1 giây. **Hiện 124 test, tất cả pass.** |
| `python tools/verify/exportFixtures.py` rồi `node tools/verify/run.js --data` | Đối chiếu lại từng con số ở mục 12 trên dữ liệu thật trong `example/`, và mô phỏng lại 4 lần chạy liên tiếp của mục 5.4 (khẳng định 0 dòng trùng). |
| `tools/verify/liveCheck.gs` | Đo trên sheet LIVE (chỉ đọc) — dùng khi cần biết dữ liệu live có khác bản export không. |
| `probe_dryRunFilter()` (trong `src/main.js`) | Chạy trong Apps Script editor, chỉ ĐỌC: in ra số vào master / bị loại / phân bố tầng khớp trên dữ liệu live **trước khi chạy thật**. |
| `probe_readCustomerMasterHeader()` | Xác nhận GAS dò đúng hàng header 15 của ガワ mới trước lần chạy đầu. |

`tools/verify/run.js` nạp 4 file pure của `src/` vào 1 `vm` context rồi đọc hàm ra từ global object — nhờ vậy không phải sửa `src/` chỉ để test được (các file trong `src/` không có `module.exports` vì Apps Script share 1 global scope). `tools/**` đã bị `.claspignore` loại nên không bị đẩy lên project GAS❶.

## 12. Số liệu tham chiếu

Nguồn: `example/【池永社内】【マスタ】先行タイトル情報（CMS）_代理店共通_DX_debug.xlsx`, `example/【池永社内】【社外用】作品レギュレーション判定.xlsx`

Toàn bộ bảng này được **kiểm chứng lại tự động** mỗi lần chạy `node tools/verify/run.js --data` (xem hàm `test_dataset` trong `tools/verify/tests.js`).

| Chỉ số | Số | Ghi chú |
|---|---|---|
| CMS: dòng có `タイトル名` | **5.678** | Đo lại 2026-08-04 sau khi đổi bộ lọc sang `タイトル名`. Bản đo 2026-08-03 (lọc theo CMSID) ra 5.649 |
| ┗ trong đó, dòng **không có CMSID** | **29** | **Dòng LỆCH CỘT** trong file nguồn (ô `タイトルID` chứa chuỗi copyright, ô `タイトル名` chứa あらすじ). Bộ lọc CMSID cũ vô tình chặn được; cả 29 đều `未判定` nên không vào master. `main.js` log riêng con số này |
| レギュレーション tổng số dòng | 5.356 | |
| ┗ `ステータス = 判定済み` | **5.158** | |
| ┗ trạng thái khác (bỏ qua) | 198 | `削除` 145, `Wチェック完了` 16, `Wチェック待ち` 11, `担当者依頼中` 9, `再判定依頼` 6, `依頼中` 1, trống 10 |
| Tên duy nhất trong 判定済み | **5.144** | 14 tên trùng |
| Tác phẩm CMS tra ra tên 完全一致 | **2.325 (40,9%)** | |
| **→ Vào 顧客作品マスタ** | **1.730 (30,5%)** | Khớp chính xác bản đo 2026-08-03 |
| → Loại vì NG | **595 (10,5%)** | アダルト作品扱い 374, アダルトジャンル 221, 問題あり **0** |
| → Loại vì 未判定 | **3.353 (59,1%)** | = 3.324 (bản 08-03) + 29 dòng lệch cột |
| Dòng NG nếu có fallback ID (không dùng) | 668 | → chênh **73 tác phẩm アダルト**, mục 4.5 |
| `タイトルID` trống trong 1.730 dòng | 104 (6,0%) | Đây cũng là ~6% dòng không bao giờ nhận được `掲載停止日付` (mục 10d) |
| Dòng có khoá sẽ đổi giá trị: `タイトルID` | **108 (6,2%)** | Kiểm chứng tự động: mô phỏng lần 3 khớp đúng 108 dòng ở tầng 3 |
| Dòng có khoá sẽ đổi giá trị: `タイトル名` | **2 (0,1%)** | Kiểm chứng tự động: khớp đúng 2 dòng ở tầng 2 |
| Dòng nguy hiểm cho cascade | 4 | 3 trùng tên + 1 trùng ID số |

**Vì sao quy tắc ① `問題あり` loại được 0 dòng** (mục 4.5): レギュレーション có 20 dòng `問題あり` nhưng 19 dòng không tồn tại trong danh sách 先行タイトル của CMS, dòng thứ 20 (`ヒグマグマ【単話版】`) thì tên không khớp. Đây là đặc điểm dữ liệu, không phải lỗi logic — nhưng nghĩa là nhánh ① chỉ được kiểm chứng bằng test đơn vị, chưa có ca thật nào.

## 13. Ba cột mới của ガワ (bản chiều 2026-08-03) — CHƯA thiết kế, chờ user

Ba cột dưới đây xuất hiện ở bản ガワ thứ hai và **không** nằm trong phạm vi lần triển khai này. Cần user trả lời trước khi làm:

| Cột | Ghi chú trên sheet | Vướng ở đâu |
|---|---|---|
| E `タイトル区分` | `┗コミットフラグ：2.先行配信（出稿コミット）` / `┗独占フラグ：先行タイトル一覧からコミットフラグが入ってないもの全て` | Cần file `【安蒜社内】出稿コミット管理表（新作・既存・キャン強化）` — **chưa có file, chưa có ID**. Có dấu `自動入力/GAS` nên đúng là việc của GAS |
| J `LP制作` | `ジャンル＋ロゴ有無で管理` / `・ロゴなし作品→K列が「ロゴなし」の場合` / `・TL→P列が「TL」の場合` / `・BL→P列が「BL」の場合` | `K列` khớp với `③シーモアロゴ判定` của sheet レギュレーション. Nhưng `P列` **không** khớp cột nào mang giá trị TL/BL ở cả 2 nguồn (レギュレーション có TL/BL ở cột `G ジャンル`, CMS có ở `J R18フラグ(TL、BL)`). Ô này lại **KHÔNG** có dấu `自動入力/GAS` → có thể là cột người điền. Cần user xác nhận: GAS làm hay người làm, và `P列` là cột nào |
| R/S `先行終了日（延長）` / `（最終確定）` | `→【先行作品】独占期間の延長（代理店共有）から反映` / `・W列記載無し→V列反映` / `・W列記載あり→W列反映` | Nguồn `【安蒜社内】【先行作品】独占期間の延長（代理店共有）` chưa có. Cũng không có dấu `自動入力/GAS` |

Ngoài ra, `コピーライトマスタ` cũng đã có ガワ mới trong workbook `【ソル】タイトルマスタ　ガワ作成 0803` (header hàng 15, cột B→P, tách `正規コピーライト` thành `タイトル個別コピーライト(あれば優先使用)` + `出版社コピーライト`, thêm `CMS ID`/`タイトルID`/`ジャンル`/`レーベル名`, lịch sử giảm **10 → 5** slot với ghi chú `旧コピーライトは5つまで保存(6つ以前はマスタから削除)`, và nguồn mới `出版社別コピーライトマスタ` thay `基本のC表記`) — **cần spec riêng**, không gộp vào lần này. Spreadsheet live của nó hiện vẫn layout cũ, và code lần này giữ đường ghi `コピーライトマスタ` không đổi.

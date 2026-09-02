# ガワ 0819 → 0826: các điều kiện mới & danh sách task

Nguồn so sánh: `example/【ソル】タイトルマスタ　ガワ作成 0819.xlsx` vs `… 0826.xlsx`
(so từng ô, đã chuẩn hoá ArrayFormula). **Chỉ 3 sheet có thay đổi thật**:
`【1】基幹マスタ(=GAS生成)`, `顧客作品マスタ`, `制作指示シート(ルールモノクラム)`.
Mọi sheet còn lại 0 diff (khác biệt duy nhất là địa chỉ object của ArrayFormula — nhiễu).

---

## A. 【1】基幹マスタ(=GAS生成) — +2 dòng

| | 0819 | 0826 |
|---|---|---|
| アウトプットデータ | 1. 顧客作品マスタ<br>2. コピーライトマスタ | + **3. 【DX見本】タイトルマスタ** |

タイトルマスタ chính thức được ghi nhận là output thứ 3 của GAS. Header của
`【DX見本】タイトルマスタ.xlsx` **giống hệt** sheet `タイトルマスタ` trong ガワ → không có
spec mới, chỉ là tài liệu bắt kịp `gas2/` đã có.

**Task A1** (docs, nhỏ): cập nhật `docs/gas2-so-do-don-gian.md` + `claude.md` ghi rõ GAS❷
là output #3 đã được chốt trên ガワ.

---

## B. 顧客作品マスタ — thêm 1 cột + 2 khối 反映ルール mới

### B1. Cột mới `L 初回配信巻数` (23 → 24 cột) — ƯU TIÊN CAO

Chèn giữa `K タイトル名` và `作家名`, đẩy toàn bộ cột từ 作家名 trở đi sang phải 1:

```
0819:  L 作家名  M ジャンル  N 出版社  O レーベル名  P 先行開始日  Q 先行終了日
       R 先行終了日（延長） S （最終確定） T 大量無料開始日 U 大量無料終了日
0826:  L 初回配信巻数  M 作家名  N ジャンル  O 出版社  P レーベル名  Q 先行開始日
       R 先行終了日  S （延長）  T （最終確定）  U 大量無料開始日  V 大量無料終了日
```

反映ルール mới (L24/L25/L27):
- データ取得先: `【マスタ】先行タイトル情報（CMS）_代理店共通`
- `G列＞「巻数」から以下ルールで反映` — **phần "以下ルール" bị bỏ trống trên sheet**.

Liên đới: `gas2/titleMaster.js:21` đang ghi *"12 cột CỐ TÌNH VẮNG MẶT (M タイトルキー,
N 初回配信巻数, …): chưa có nguồn"*. 0826 vừa cấp nguồn cho 初回配信巻数 → mở khoá được
cột N của タイトルマスタ. Grep `初回配信|巻数` trong `src/` = 0 hit → hoàn toàn chưa làm.

- **Task B1a** (blocker): hỏi team rule cụ thể của L27 — G列「巻数」 định dạng thế nào,
  lấy min / lấy dòng đầu / regex số? Không có rule thì không code được.
- **Task B1b**: thêm `初回配信巻数` vào `CUSTOMER_REQUIRED_HEADERS` + record + writer
  (`src/io.js:159`, `:200`, `:290`), thêm nguồn vào `src/sources.js` (NGUỒN 2), thêm vào
  diff list `src/main.js:539`.
- **Task B1c**: sau B1b, bỏ `初回配信巻数` khỏi danh sách "cố tình vắng mặt" của
  `gas2/titleMaster.js` và thêm vào `TITLE_COLUMNS` (cột N).
- **Không cần task cho việc dịch cột**: code tra cột bằng `col(idx, header)` theo TÊN,
  không theo chữ cái → shift cột không làm hỏng gì. Chỉ cần verify lại 1 lần.

### B2. 反映ルール mới cho `I 掲載停止日付` (I24/I25)

`データ取得先：顧客Google Drive＞配信停止一覧＞` — **chuỗi bị cắt cụt ở dấu ＞ cuối**.
Hiện `src/config.js:118 SUSPENSION` đang đọc `multi_title_yyyyMMdd.tsv` trên Drive.

- **Task B2**: xác nhận với team — vẫn giữ TSV `multi_title_*`, hay đổi sang spreadsheet
  `【池永社内】配信停止一覧`? Nếu đổi thì phải viết lại NGUỒN 4 trong `src/sources.js:345`.

### B3. Định nghĩa 独占フラグ được làm rõ (E28)

| | |
|---|---|
| 0819 | 先行タイトル情報から**Ｃ列：「2.先行配信（出稿コミット）」が入ってないもの全て** |
| 0826 | 先行タイトル情報**に入っているタイトル×**Ｃ列：「2.先行配信（出稿コミット）」が入ってないもの全て |

→ nói rõ là phép GIAO với 先行タイトル情報. `src/sources.js:815` đã implement đúng như vậy
(*"独占フラグ: mọi tác phẩm còn lại của 先行タイトル情報"*).

- **Task B3** (verify-only): chạy lại probe đối chiếu, không sửa code.

### B4. Nợ kỹ thuật trên chính ガワ (báo lại cho team, không phải task code)

- Khối chú thích 反映ルール bị đẩy sang phải theo cột nhưng **nội dung text vẫn ghi chữ cái
  cũ**: S24–S40 nói "R列「先行終了日(延長)」", "Q列「先行終了日」", "T列/U列 大量無料…"
  trong khi layout mới là S / R / U / V. Ai đọc rule theo chữ cái sẽ sai 1 cột.
- `L13` không có tag `自動入力/GAS` trong khi B–K và M–V đều có → nhiều khả năng sót khi
  chèn cột. Cần xác nhận 初回配信巻数 có phải GAS ghi không.

---

## C. 制作指示シート(ルールモノクラム) — tái cấu trúc lớn (phần nặng nhất)

Kích thước: **68 → 60 cột**, **1020 → 50500 dòng** (mọi công thức mới viết cho `6:50500`).

### C1. 8 cột bị XOÁ

`テキスト×タイトルかけ合わせチェック`, `巻数`, `ホワイトリスト`, `カルーセル日付`,
`静止画日付`, `マルチフォト日付`, `動画日付`, `昇順`.

Tất cả đều là các cột mà 0819 còn đang hỏi *"→いる？いる場合どこから反映？"* → team chọn
**bỏ** thay vì trả lời.

### C2. Đảo thứ tự cột

- Khối `タイトル情報` (タイトルNo / CMS ID / タイトルID / **タイトル名 / タイトルキー**)
  chuyển lên **trước** khối `納品ステータス` (チケット発行 / 納品日).
  `H–J,N,O → F–J` ; `F,G → K,L` ; `K–M → M–O`.
- `構成者` dời `AE → AM`, nằm cạnh `CRE名` (đúng yêu cầu note `AM12=CRE名に近い方がいい`).
- Bỏ group header `入稿情報`; 静止画テキストNo1–3 gộp vào `制作管理情報`.
- Khối `営業チェック項目` co từ 10 cột (AW–BF) còn 4 (AU–AX).
- Layout request chưa xử lý: `E2 = 今のCR管理表の並びに寄せた方が嬉しい`,
  `F12–I12 = ここ左よせ`.

### C3. Đổi kiểu nhập (row 13)

| Cột | 0819 | 0826 |
|---|---|---|
| 検証フラグ / 漫画素材加工有無 / 静止画テキストNo1–3 / 構成者 | 手動入力 | **選択** |
| AIチェック / コピーライトチェック | → | **選択** (+note `モノクラム利用`) |
| 枚数 | (trống) | **手動入力（選択）** |
| CRE名 / CRE連番 / 重複チェック / LP / URL / ADFMT / リリース日 / テキストチェック / ファイル名確認用 | (trống) hoặc → | **自動入力** |
| CRE名(手動で指定) | (trống) | 手動入力 |

Băng `営業が確認` gỡ khỏi `AL..BF` và khỏi `初回配信巻数`; chỉ còn trên
ジャンル / 出版社 / レーベル / 使用コピーライト.

### C4. ~20 câu hỏi mở của 0819 đã được TRẢ LỜI → đây là các task thật

Row 24 giờ là `タスク内容`, row 25 là `反映ルール`, row 26 chứa công thức mẫu.

| # | Cột (0826) | 0819 | Rule mới ở 0826 | CT mẫu |
|---|---|---|---|---|
| C4-01 | AA ブラッシュアップ回数 | có CT + note "V列参照に書き換える" | đếm số lần `ブラッシュアップ元` xuất hiện | **CT cũ bị xoá, chỉ còn text** → phải viết lại theo cột Z |
| C4-02 | AC クリエイティブの転用 | →いる？どこから反映？ | "手動だけど選択に修正したい": 分冊版→単行本版 / 分冊版→タテヨミ | – |
| C4-03 | AD 新規/既存分類 | →どこから反映？＋カラム名変えたい | dò lịch sử chế tác theo タイトル名 trên MỌI FMT; ngày < cột L, cùng title + cùng FMT | MAP/LAMBDA |
| C4-04 | AH/AI/AJ 静止画テキストNo1–3 | →反映ルールを決めたい ×3 | lấy số từ テキストマスタ; dropdown giới hạn theo テキストNo; **validation loại số không tồn tại** | – |
| C4-05 | AK/AL CRE名 | →反映ルールを決めたい | AL tự sinh; nếu AK có giá trị thì AK ghi đè AL; dùng cho "CR名称最終FIX" | – |
| C4-06 | AL CRE名 (quy tắc đặt tên) | – | `提出日+1_タイトルキー_タイトルID_CMSID_ADFMT_検証フラグ_独占フラグ_BUフラグ` | ARRAYFORMULA rất dài |
| C4-07 | AM 構成者 | →構成者マスタから選択肢反映 | giữ nguyên rule, chuyển sang 選択 + dời cột | – |
| C4-08 | AN CRE連番 | →反映ルールを決めたい | lần thứ mấy chế tác cho cùng title + cùng FMT | COUNTIFS |
| C4-09 | AO CRE名重複チェック | →反映ルールを決めたい | đếm CR名; ≥2 → hiện `重複` | COUNTIF |
| C4-10 | AP LP | →どこから反映？（タイトルマスタU列でOK？） | có trong LP管理表 → `あり`; dùng cho VN入稿 | XLOOKUP |
| C4-11 | AQ URL | →反映ルール確認 | sinh URL theo service từ 条件選択; *"マストではないが残し希望（モノクラム）"* | XLOOKUP |
| C4-12 | AR ADFMT | 媒体×ADFMTマスタ＋制作ベースルールマスタ | + `→最終FIX版で反映` | – |
| C4-13 | AS 枚数 | – | `カルーセルにて入力項目`; カルーセル以外 `-` | – |
| C4-14 | AT リリース日 | →どこから反映？（先行開始日？） | `マスタから反映` — **vẫn mơ hồ, master nào?** | – |
| C4-15 | AU/AV AI・コピーライトチェック | →営業反映ルール確認 | chỉ chọn `済`; モノクラム利用 | – |
| C4-16 | AW テキストチェック | →いる？どこから反映？ | XLOOKUP vào `テキストマスタ(静止画)` cột AC theo 静止画テキストNo1 | IF+XLOOKUP |
| C4-17 | AX ファイル名確認用 | →いる？どこから反映？ | `CRE名 をそのまま反映` | – |
| C4-18 | V/W 選定理由①② | "選択式にする、営業確認" | **chốt: モノクラム自由記載** (không làm dropdown) | – |
| C4-19 | C/D 顧客確認ステータス・更新日 | 2 ô riêng | gộp `CR名をkeyに反映` vào cùng ô rule | – |

### C5. Cảnh báo kỹ thuật cho toàn bộ 7 công thức mẫu ở row 26

Chúng được **dán từ CR管理表 hiện hành**, không chạy được trên ガワ này:

- Tham chiếu sheet không tồn tại trong workbook: `'■条件選択'`, `'■【検索・LP】CRE管理表'`,
  `'■テキストマスタ(静止画)'`. ガワ 0826 không có sheet `条件選択` lẫn `【検索・LP】CRE管理表`;
  sheet text thật tên `テキストマスタ(静止画)`, không có tiền tố `■`.
- Chữ cái cột **lệch so với layout mới**: CT của `AW` key theo `AT` (nay là リリース日,
  đáng lẽ là `AH 静止画テキストNo1`); CT của `AO` đếm `AG:AG` (nay là 漫画素材加工有無);
  CT của `AL` dùng `DD/CZ/EB/EC` — vượt quá 60 cột của sheet.
- Hard-code range `6:50500`.

- **Task C5**: trước khi implement bất cứ cột nào ở C4, phải remap sheet-name + column
  letter của 7 công thức sang layout 0826, hoặc xin bản CR管理表 gốc để đối chiếu.

---

## Thứ tự đề xuất xử lý

1. **B1a + B2 + C4-14** — 3 câu hỏi chặn, gom hỏi team 1 lượt.
2. **B1b → B1c** — 初回配信巻数 xuyên suốt GAS❶ → GAS❷ (giá trị cao nhất, spec đã đủ rõ nếu B1a có trả lời).
3. **B3, A1** — verify + docs, rẻ.
4. **C5** — remap công thức, là điều kiện tiên quyết của cả khối C4.
5. **C1 + C2 + C3** — đổi layout 制作指示シート (thuần cấu trúc, chưa cần logic).
6. **C4-01 … C4-19** — theo thứ tự phụ thuộc: AL (tên CR) → AK, AN, AO, AX → phần còn lại.

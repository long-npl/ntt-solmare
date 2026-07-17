# GAS❶ — 顧客作品マスタ・コピーライトマスタ 自動生成 設計書

Ngày viết: 2026-07-17
Trạng thái: Chờ user review

## 1. Bối cảnh (Why)

NTT Solmare đang thực hiện dự án tái thiết kế toàn bộ quy trình nhập liệu quảng cáo ("入稿フロー再設計", STEP3 trong lộ trình 6 STEP). Nguồn gốc:

- 3 tháng gần đây: 14 sự cố, ~80% do lỗi ở luồng "chọn tác phẩm → phân phối" và các quy tắc riêng theo khách hàng, thiệt hại bồi thường ~1,270万円.
- Nguyên nhân gốc: một "神マスタ" (God Master, đặc biệt là Title Master) gộp 54 sheet vào 1 file, phụ thuộc nặng vào thao tác tay của vài cá nhân cụ thể (属人化), và GAS hiện tại quá nặng/chạy chậm.
- Mục tiêu tái thiết kế: chuyển từ "人に頼るオペ" (vận hành dựa vào con người) sang "仕組みで守るオペ" (vận hành được hệ thống bảo vệ), vận hành chính thức từ tháng 9/2026.

Toàn bộ pipeline tái thiết kế gồm 4 STEP / 5 GAS (xem chi tiết trong bộ nhớ dự án). **Spec này chỉ bao phủ GAS❶** — bước đầu tiên, tạo ra 2 master độc lập (顧客作品マスタ, コピーライトマスタ) từ dữ liệu quản lý khách hàng và quản lý kinh doanh rải rác. Đây là input bắt buộc cho GAS❷ (Title Master) ở bước sau, nhưng GAS❷ không nằm trong phạm vi spec này.

## 2. Phạm vi (Scope)

**Trong phạm vi:**
- 1 Google Apps Script project (standalone), chạy tự động theo lịch, tạo/cập nhật 2 spreadsheet output: 顧客作品マスタ, コピーライトマスタ.
- Đọc dữ liệu từ 5 nguồn: 作品レギュレーション判定, 先行タイトル情報(CMS)_代理店共通, 出版社からの追記ルールと外部出稿NGタイトル (gồm cả các sheet quy tắc riêng theo NXB), 出版社別©ルール (cùng file với NG title), và 顧客作品マスタ vừa build (dùng làm input cho bước copyright).
- Logic upsert (cập nhật thay đổi + thêm mới, không xoá dữ liệu cũ).
- Logic ưu tiên xác định bản quyền 4 tầng.
- Log lỗi/cảnh báo vào 1 sheet log riêng.

**Ngoài phạm vi (rõ ràng loại trừ ở bản thiết kế này):**
- GAS❷ (Title Master), GAS❸/❹ (ADFMT別入稿管理マスタ), GAS❺ (sheet nhập liệu theo media).
- Nguồn 配信停止タイトル (danh sách dừng phát hành) — hiện là 1 thư mục Drive, chưa có cấu trúc file cụ thể. Để placeholder (cột trống + TODO trong code), bổ sung ở phiên sau khi có cấu trúc thật.
- Gửi cảnh báo qua Slack — chỉ ghi log trong sheet ở bản này; Slack sẽ bổ sung sau khi có Incoming Webhook thật.
- Tái cấu trúc Google Drive theo mô hình 3 folder (GAS制御/各マスタ/GAS生成物) mô tả trong tài liệu tổng — không thực hiện ở spec này, chỉ tạo/dùng 2 spreadsheet output đã có sẵn ID.

## 3. Nguồn dữ liệu thực tế (Input)

Tất cả ID lấy từ `info.md`. Bản copy cục bộ (để tham chiếu cấu trúc cột, không dùng để đọc trực tiếp trong code — code sẽ đọc từ Google Sheet thật qua ID) nằm trong `example/`.

### 3.1 作品レギュレーション判定
- Spreadsheet ID: `1T8CooSrzcbZi768KXT7zTUlzpgz4dap0zWUJCkE5jZg`
- Sheet dùng: `シート1`
- Header thật ở **row 4** (row 1-3 là ghi chú hướng dẫn, không phải data):
  `No | ステータス | 更新日 | ＣＭＳID | タイトルＩＤ | タイトル名 | ジャンル | 出版社 | ①広告出稿ポリシー（出稿NG） | ②一般面出稿NG（アダルト作品扱い） | ③シーモアロゴ判定 | 使用NGコマ格納場所 | 変更日 | シーモアロゴ判定変更前の判定`
- **Chỉ dùng dòng có `ステータス` = "判定済み"** — dòng khác đang chờ xử lý, phải bỏ qua.
- Match key: CMS ID (`ＣＭＳID`) ưu tiên, fallback タイトルＩＤ hoặc タイトル名 nếu CMS ID trống.
- Trường lấy: `③シーモアロゴ判定`.

### 3.2 先行タイトル情報(CMS)_代理店共通
- Spreadsheet ID: `1vU82_heOwwcYlJr9kv9VEqJVKu3kUPz9gh9R5_ycR0k`
- Sheet dùng: `★列追加の場合は増渕まで★`
- Header (row 1): `CMSID | 変更区分 | 記入日 | 更新日 | タイトルID | タイトル名 | 巻数 | 作家名 | ジャンル | R18フラグ(TL、BL) | レーベル名 | 出版社 | 先行開始日 | 先行終了日 | アダルト作品扱い | アダルト媒体での出稿可否 | 作品備考 | コミット | 素材フォルダパス | 素材ステータス | コピーライト | タイトル詳細文 | 書影 | 試し読み有無 | 試し読み範囲`
- Đây là nguồn nền tảng chính (基幹データ) cho 顧客作品マスタ: CMSID, タイトルID, タイトル名, 作家名, ジャンル, 出版社, 先行開始日, 先行終了日.
- Cột **U = コピーライト** — nguồn ưu tiên cao nhất (tầng 1) cho コピーライトマスタ.
- Match key: CMSID.

### 3.3 出版社からの追記ルールと外部出稿NGタイトル
- Spreadsheet ID: `1y5l36o6mvQAtfx3xn3YC4EYa5vn5fy7g2KeWvv5faD8`
- Các sheet liên quan:
  - `外部出稿用NGタイトル` — header: `出版社 | 記入日 | 更新日 | タイトルID | タイトル名 | 作家名 | ジャンル | 備考`. Match theo タイトルID/タイトル名. Nếu match → ghi nội dung `備考` vào cột 備考 của 顧客作品マスタ (không tự động chặn phân phối, chỉ cảnh báo qua 備考, đúng như info.md mô tả).
  - `基本のC表記` — header: `雑誌・レーベル | 事前確認 | 追加納品物 | 加工 | ©表記記載有無 | ©表記ルール | 備考 | 作家・タイトル別備考 | クリエイティブの転用`. Dùng làm nguồn ưu tiên tầng 3 (tự sinh bản quyền) khi NXB không có nguồn ưu tiên cao hơn. Match theo `雑誌・レーベル` (= 出版社/レーベル của tác phẩm).
  - **Các sheet quy tắc riêng theo NXB** (ưu tiên tầng 2, cao hơn 基本のC表記 tự sinh): `LINEコピーライト一覧`, `スクエニコピーライト一覧`, `リブレコピーライト`, `オーバーラップ_コピーライト一覧`, `ヒーローズコピーライト一覧`. Mỗi sheet có cấu trúc cột hơi khác nhau (xem chi tiết code), nhưng đều tra theo タイトルID hoặc タイトル名. Danh sách NXB có sheet riêng có thể tăng theo thời gian — code cần thiết kế dạng registry dễ mở rộng (thêm 1 NXB mới = thêm 1 entry cấu hình, không sửa logic core).
  - `個別C表記リスト`, `よくあるミス等`, `GANMA!制作可否リスト`, `アダルト媒体OK作品`, `吹き出し移動可リスト`, `エイシス制作可否リスト`, `出版社からの連絡事項` — **không dùng trong GAS❶**, thuộc phạm vi khác (制作 team hoặc GAS❷+).

### 3.4 配信停止タイトル (ngoài phạm vi — placeholder)
- Link gốc là 1 thư mục Google Drive (`1nv1ivJBdMGe7LOdHfAqX30AIZY55ge6a`), không phải 1 spreadsheet ID.
- Code để 1 hàm `checkDistributionStopped(title)` luôn trả `null`/`false` kèm `// TODO: cần cấu trúc file thật từ nguồn 配信停止タイトル`, và thêm sẵn 1 cột `配信NGフラグ` trống trong 顧客作品マスタ để nối logic vào sau mà không phải đổi schema.

## 4. Output Schema thực tế

### 4.1 顧客作品マスタ
- Spreadsheet ID: `1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU`, sheet `顧客作品マスタ`
- Header hiện tại (bản nháp/"ガワ"): `タイトルNo | CMS ID | タイトルID | タイトル名 | 作家名 | ジャンル | 出版社 | 先行開始日 | 先行終了日 | コピーライト | ③シーモアロゴ判定 | 備考`
- **Thay đổi đề xuất so với bản nháp hiện tại** (cần Ikenaga/Trang xác nhận trước khi build thật):
  1. Thêm cột `配信NGフラグ` (trống, placeholder cho mục 3.4).
  2. Cột `コピーライト` hiện tại — đề xuất **giữ lại** nhưng chỉ copy giá trị `正規コピーライト` cuối cùng từ コピーライトマスタ sau khi tầng đó build xong, để tra cứu nhanh không cần mở 2 file; nguồn chân lý (source of truth) vẫn là コピーライトマスタ.
- タイトルNo: số thứ tự, giữ ổn định qua các lần chạy cho cùng 1 タイトルID (không đánh số lại toàn bộ mỗi lần chạy — tác phẩm mới thêm vào cuối).
- Khoá chính (primary key) cho upsert: `タイトルID` (fallback `CMS ID` nếu タイトルID trống).

### 4.2 コピーライトマスタ
- Spreadsheet ID: `1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc`, sheet `コピーライトマスタ`
- Header hiện tại: `タイトルNo | タイトル名 | 著者名 | 出版社(雑誌名/レーベル) | 正規コピーライト | CopyRight(個別ルールの場合) | CopyRight自動生成 | CopyRight過去1 ... CopyRight過去10`
- `タイトルNo` tham chiếu 1-1 với タイトルNo của 顧客作品マスタ (cùng tác phẩm, cùng số).
- Khoá chính cho upsert: `タイトルNo` (tương ứng タイトルID gốc).

## 5. Kiến trúc & lịch chạy

- 1 Apps Script project standalone (project đã clone sẵn, scriptId `15bs3ihjzlSmcziJUW-PM7o2rCLFdOyBBssuuSTWK5hTeV2wR4fC0ru05`).
- Time-based trigger: chạy 2 lần/ngày, 9:00 và 18:00 (Asia/Tokyo — khớp `timeZone` đã đặt trong `appsscript.json`).
- Không dùng IMPORTRANGE: đọc trực tiếp từng nguồn bằng `SpreadsheetApp.openById(id).getSheetByName(name)`. Tài khoản chạy trigger (hiện là tài khoản clasp đã login, `nguyen_phi_long@ca-adv.co.jp`) **phải có quyền đọc cả 3 spreadsheet nguồn** và quyền ghi cả 2 spreadsheet output — cần xác nhận quyền trước khi build thật.
- Thứ tự chạy trong 1 lần trigger (tuần tự, cùng 1 execution, đảm bảo dependency):
  1. Đọc + chuẩn hoá dữ liệu từ 3 nguồn (3.1–3.3).
  2. Build/upsert `顧客作品マスタ`.
  3. Dùng `顧客作品マスタ` vừa build + nguồn 3.3 để build/upsert `コピーライトマスタ` (áp dụng logic 4 tầng ở mục 6).
  4. Copy `正規コピーライト` ngược lại cột `コピーライト` của `顧客作品マスタ` (xem 4.1).
  5. Ghi log kết quả (số dòng thêm/sửa, danh sách cá biệt) vào sheet log.

## 6. Logic xác định bản quyền (4 tầng ưu tiên)

Với mỗi tác phẩm, xác định `正規コピーライト` theo thứ tự, dừng ở tầng đầu tiên có giá trị:

1. **CMS cột U** (先行タイトル情報 sheet, cột コピーライト) — nếu có giá trị non-empty.
2. **Sheet riêng theo NXB** (LINE/スクエニ/リブレ/オーバーラップ/ヒーローズ...) — nếu 出版社 của tác phẩm khớp với 1 trong các sheet này VÀ tìm được タイトルID/タイトル名 tương ứng trong sheet đó.
3. **基本のC表記 tự sinh** — nếu 出版社/レーベル có rule trong sheet `基本のC表記`, dùng rule đó (`©表記ルール`) để sinh chuỗi bản quyền (thay thế placeholder trong rule bằng 作家名 thật của tác phẩm).
4. **Cá biệt** — không tầng nào khớp: để `正規コピーライト` trống, ghi vào log (không tự bịa dữ liệu), để người phụ trách xử lý tay.

Khi `正規コピーライト` **thay đổi so với giá trị đang lưu** ở lần chạy trước: giá trị cũ được đẩy vào `CopyRight 過去1`, các giá trị 過去1→10 cũ dịch xuống 1 bậc (過去10 cũ bị loại nếu đã đầy 10 giá trị). Nếu giá trị không đổi, không chạm vào các cột 過去.

## 7. Chiến lược ghi dữ liệu (Upsert)

- Mỗi lần chạy: build toàn bộ dataset mới trong bộ nhớ (array of objects, khoá theo タイトルID/タイトルNo).
- Đọc dữ liệu hiện có trên sheet output vào 1 Map theo cùng khoá.
- Với mỗi tác phẩm trong dataset mới:
  - Nếu khoá đã tồn tại và có ít nhất 1 field thay đổi → cập nhật đúng dòng đó (giữ nguyên `タイトルNo`).
  - Nếu khoá chưa tồn tại → thêm dòng mới ở cuối, gán `タイトルNo` tiếp theo.
  - Nếu khoá tồn tại nhưng không có gì thay đổi → bỏ qua, không ghi lại (giảm nhiễu lịch sử chỉnh sửa trên Google Sheets).
- Không xoá dòng nào (kể cả khi tác phẩm không còn xuất hiện ở nguồn — việc dừng phân phối sẽ được đánh dấu qua cột `配信NGフラグ` ở giai đoạn sau, không phải bằng cách xoá dòng).
- Ghi bằng batch `Range.setValues()` theo từng nhóm dòng liền kề để giảm số lần gọi API, thay vì set từng ô.

## 8. Logging & xử lý lỗi

- 1 sheet log riêng (trong cùng spreadsheet `顧客作品マスタ` hoặc 1 sheet control riêng — quyết định khi implement) ghi mỗi lần chạy:
  - Timestamp bắt đầu/kết thúc, số dòng thêm mới, số dòng cập nhật, danh sách タイトルID rơi vào "cá biệt" (tầng 4 copyright), danh sách lỗi (nếu có nguồn không đọc được).
- Nếu 1 nguồn input lỗi (không mở được spreadsheet, sheet đổi tên...): ghi log lỗi rõ ràng, dừng an toàn (không ghi dữ liệu thiếu/sai vào output), giữ nguyên output của lần chạy trước.
- **Gửi Slack qua Slack Web API** (`chat.postMessage`, không dùng Incoming Webhook): hàm `notifySlack(message)` gọi `UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {...})` với header `Authorization: Bearer <token>`, `channel` và `text` lấy từ Script Properties (`SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`). Giá trị thật của token/channel **chưa có** — để placeholder trong `Script Properties` (không hardcode trong code), user tự điền sau khi tạo Slack App nội bộ (scope `chat:write`, invite bot vào channel).
  - Gọi `notifySlack()` ở 2 điểm: (a) khi có tác phẩm rơi vào tầng "cá biệt" (mục 6, tầng 4) — gộp thành 1 tin nhắn liệt kê danh sách タイトルID/タイトル名 cuối mỗi lần chạy, không gửi từng dòng riêng lẻ; (b) khi 1 nguồn input lỗi không đọc được.
  - Nếu `SLACK_BOT_TOKEN`/`SLACK_CHANNEL_ID` chưa được cấu hình (rỗng) → `notifySlack()` chỉ ghi vào log sheet, bỏ qua gọi API (không throw lỗi), để không chặn luồng chính khi chưa có token thật.

## 9. Giả định & điều kiện tiên quyết (cần xác nhận trước khi build thật)

1. Tài khoản chạy GAS trigger có quyền đọc 3 spreadsheet nguồn (3.1–3.3) và quyền ghi 2 spreadsheet output (4.1–4.2).
2. Cột `コピーライト` trong 顧客作品マスタ giữ lại (xem 4.1) — cần Ikenaga/Trang xác nhận, vì tài liệu gốc ghi "ガワ chưa chốt".
3. Cấu trúc thật của nguồn 配信停止タイトル (hiện là thư mục Drive) — cần bổ sung khi có, không block việc build GAS❶ ở các nguồn còn lại.
4. Danh sách NXB có sheet quy tắc riêng (LINE/スクエニ/リブレ/オーバーラップ/ヒーローズ) có thể chưa đầy đủ — thiết kế registry mở để dễ thêm NXB mới.
5. `SLACK_BOT_TOKEN` và `SLACK_CHANNEL_ID` (Script Properties) — chưa có giá trị thật, user sẽ tạo Slack App nội bộ (scope `chat:write`) và điền sau khi code xong.

@Thuy Trang Tran（トゥイ チャン）
チャンさん、下記でお願いいたしますmm

【インプットデータ】
▼ 顧客管理データ（importrangeにて社内向けに引用）
1. 作品レギュレーション判定
【池永社内】【社外用】作品レギュレーション判定
https://docs.google.com/spreadsheets/d/1T8CooSrzcbZi768KXT7zTUlzpgz4dap0zWUJCkE5jZg/edit?gid=0#gid=0
2. 先行タイトル情報(CMS)
【池永社内】【マスタ】先行タイトル情報（CMS）_代理店共通
https://docs.google.com/spreadsheets/d/1vU82_heOwwcYlJr9kv9VEqJVKu3kUPz9gh9R5_ycR0k/edit?gid=1489992656#gid=1489992656
3. 外部出稿NGタイトル
【池永社内】出版社からの追記ルールと外部出稿NGタイトル
┗外部出稿用NGタイトル
https://docs.google.com/spreadsheets/d/1y5l36o6mvQAtfx3xn3YC4EYa5vn5fy7g2KeWvv5faD8/edit?gid=1120323773#gid=1120323773
4. 配信停止タイトル
【池永社内】配信停止一覧
https://drive.google.com/drive/folders/1nv1ivJBdMGe7LOdHfAqX30AIZY55ge6a?fbclid=IwY2xjawTCqm1leHRuA2FlbQIxMQBzcnRjBmFwcF9pZAEwAAEeofDCtrG-sbYDgsZbJ4fgr75siFrZAiZJ63K-QVlyLE7UnID-x3LbnTDhnaA_aem_tYDNZVPGYdABgifC0z6rPw
▼ 営業管理データ
1. 出版社別©ルール
【池永社内】出版社からの追記ルールと外部出稿NGタイトル
┗基本のC表記
https://docs.google.com/spreadsheets/d/1y5l36o6mvQAtfx3xn3YC4EYa5vn5fy7g2KeWvv5faD8/edit?gid=1120323773#gid=1120323773
2. 先行タイトル情報(CMS)　（CL管理と同一）
【池永社内】【マスタ】先行タイトル情報（CMS）_代理店共通　U列
https://docs.google.com/spreadsheets/d/1vU82_heOwwcYlJr9kv9VEqJVKu3kUPz9gh9R5_ycR0k/edit?gid=1489992656#gid=1489992656

【アウトプットデータ】
1. 顧客作品マスタ
【池永社内】顧客作品マスタ
https://docs.google.com/spreadsheets/d/1ILmNpxlDIa-J0XiNnRprsdYVcUUiIEt59Miwey214hU/edit?usp=sharing
2. コピーライトマスタ
【池永社内】コピーライトマスタ
https://docs.google.com/spreadsheets/d/1lGybYJHGeYy7Lzu_8aK9I4DokVLolkBGO-vaVoeO_Dc/edit?usp=sharing
・基本は先行作品はCMSIDシートをもとに正として反映
【池永社内】【マスタ】先行タイトル情報（CMS）_代理店共通　U列
https://docs.google.com/spreadsheets/d/1vU82_heOwwcYlJr9kv9VEqJVKu3kUPz9gh9R5_ycR0k/edit?gid=1489992656#gid=1489992656
・先行作品外の作品は基本のC表記をもとにGASで作成
【池永社内】出版社からの追記ルールと外部出稿NGタイトル
┗基本のC表記
https://docs.google.com/spreadsheets/d/1y5l36o6mvQAtfx3xn3YC4EYa5vn5fy7g2KeWvv5faD8/edit?gid=1120323773#gid=1120323773
・それ以外の作品は個別対応（イレギュラー記載を作成）



各マスタのガワはこれからきれいにする予定なので、
最終確定版は改めてお渡しするようにしますね！


Chào bạn, dựa vào tin nhắn bạn cung cấp và đối chiếu với tài liệu thiết kế của dự án, phần thông tin này chính là **bản đặc tả luồng dữ liệu (Data Mapping) cho STEP 1 (GAS 1)**. 

Tôi sẽ giúp bạn đọc hiểu, định nghĩa và phân loại cấu trúc của các tài liệu này để team dev dễ dàng thiết lập code:

### 1. PHÂN LOẠI DỮ LIỆU ĐẦU VÀO (INPUT DATA)
Đây là các file dữ liệu gốc đang nằm rải rác mà GAS 1 sẽ cần dùng lệnh `importrange` (hoặc API sau này) để trích xuất thông tin. Dữ liệu được chia làm 2 nhóm nguồn chính:

**Nhóm 1: Dữ liệu quản lý khách hàng (顧客管理データ)**
Nhóm này chủ yếu cung cấp thông tin để GAS 1 nhào nặn ra **Master Tác phẩm khách hàng**. Bao gồm 4 file:
*   **File 1 - Phán đoán quy định (作品レギュレーション判定):** Chứa các quy định, ràng buộc về việc sử dụng tác phẩm (ví dụ: có cần chèn logo hay không).
*   **File 2 - Thông tin tác phẩm tiên quyết CMS (先行タイトル情報):** Chứa ID và thông tin nền tảng của tác phẩm từ hệ thống CMS.
*   **File 3 - Tác phẩm cấm xuất bản ngoài (外部出稿NGタイトル):** Chứa danh sách các tác phẩm không được phép chạy quảng cáo/xuất bản bên ngoài theo yêu cầu của nhà xuất bản.
*   **File 4 - Tác phẩm dừng phân phối (配信停止タイトル):** Danh sách các tác phẩm đang bị ngừng phát hành (dùng để GAS tự động cảnh báo nếu lỡ đưa vào nhập liệu).

**Nhóm 2: Dữ liệu quản lý kinh doanh/Sales (営業管理データ)**
Nhóm này cung cấp thông tin để GAS 1 tạo ra **Master Bản quyền**. Bao gồm 2 file/trường dữ liệu:
*   **File 1 - Quy tắc bản quyền theo Nhà xuất bản (出版社別©ルール):** Bảng chứa các quy tắc ghi ký hiệu Bản quyền (©) cơ bản của từng nhà xuất bản.
*   **File 2 - Thông tin tác phẩm CMS (先行タイトル情報_U列):** Cụ thể là lấy dữ liệu từ **Cột U** trong file quản lý CMS để đối chiếu bản quyền.

---

### 2. PHÂN LOẠI DỮ LIỆU ĐẦU RA (OUTPUT DATA)
Đây là đích đến của GAS 1. Sau khi thu thập toàn bộ Input ở trên, GAS 1 sẽ tổng hợp và tự động sinh ra 2 file Master chuẩn hóa để dùng cho các bước nhập liệu sau này:
1.  **Master Tác phẩm khách hàng (顧客作品マスタ):** Nơi gom toàn bộ thông tin tác phẩm, tình trạng phân phối, các lưu ý cấm kỵ.
2.  **Master Bản quyền (コピーライトマスタ):** Nơi chuẩn hóa toàn bộ chuỗi text bản quyền (©) của từng tác phẩm.

---

### 3. ĐỊNH NGHĨA LOGIC CODE CHO GAS (Dành cho xử lý Bản quyền)
Ba gạch đầu dòng ở cuối tin nhắn chính là **Yêu cầu logic (If/Else) để code GAS 1** khi tạo file Master Bản quyền. Cụ thể phân loại như sau:

*   **Logic 1 (Ưu tiên cao nhất - Mặc định):** Nếu tác phẩm là tác phẩm tiên quyết có trong CMS -> Lấy nội dung ở **Cột U** của sheet CMSID làm bản quyền chính xác nhất để phản ánh vào Master.
*   **Logic 2 (Tác phẩm không có trong CMS):** Nếu tác phẩm không nằm trong danh sách tiên quyết -> GAS phải tự động khởi tạo chuỗi bản quyền dựa vào file "Quy tắc ký hiệu C cơ bản" (基本のC表記). (Tương ứng với tính năng "tự động sinh text nếu thiếu thông tin" trong tài liệu).
*   **Logic 3 (Ngoại lệ - Irregular):** Bất kỳ tác phẩm nào không thỏa mãn 2 điều kiện trên thì GAS không tự bịa data, mà phải đánh dấu lại để con người "xử lý cá biệt" (nhập tay các ghi chú bất thường).

**Tóm lại:** Người gửi đang cung cấp cho bạn (Trang) tên các file nháp (Gawa) hiện tại trên Drive của anh Ikenaga. Nhiệm vụ của bạn dựa trên tin nhắn này là **viết kịch bản cho GAS 1 chui vào 6 file Input (ở mục 1), móc dữ liệu ra, chạy qua bộ lọc Logic (ở mục 3) và nhả dữ liệu vào 2 file Output (ở mục 2).**
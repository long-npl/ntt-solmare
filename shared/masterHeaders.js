// masterHeaders.js — tên cột BẮT BUỘC của 顧客作品マスタ.
//
// NGUỒN GỐC: shared/masterHeaders.js. src/masterHeaders.js và gas2/masterHeaders.js
// được SINH RA từ đây bởi tools/sync-shared.js — sửa ở đây, rồi chạy
// `node tools/sync-shared.js`.
//
// VÌ SAO DÙNG CHUNG: đây không phải "danh sách cột GAS❶ cần" hay "danh sách cột GAS❷
// cần" — nó là HÌNH DẠNG của sheet 顧客作品マスタ. GAS❶ ghi cả 20 cột, GAS❷ đọc cả 20
// cột, nên cả hai có cùng một yêu cầu: 20 cột này phải tồn tại.
//
// Trước khi tách ra đây, danh sách này nằm 2 chỗ (src/io.js và gas2/sources.js) với
// CÙNG 20 tên nhưng KHÁC THỨ TỰ — nghĩa là không ai đối chiếu chúng bao giờ. Thứ tự
// không quan trọng (resolveHeaderIndex chỉ kiểm tra sự TỒN TẠI), nhưng nội dung thì
// có: 池永 đổi tên một cột trên ガワ mà chỉ sửa 1 trong 2 chỗ thì một GAS throw còn
// GAS kia im lặng chạy sai.
//
// KHÔNG gộp COPYRIGHT_REQUIRED_HEADERS vào đây: 2 bản của nó là 2 danh sách KHÁC
// NHAU thật, không phải bản copy. GAS❶ cần 10 cột (nó GHI コピーライトマスタ), GAS❷
// cần 4 cột (nó chỉ ĐỌC 3 giá trị + khoá join). Gộp lại sẽ buộc GAS❷ throw vì thiếu
// một cột mà nó không bao giờ đọc.
//
// Ngoặc trong '先行終了日（延長）' là ngoặc FULL-WIDTH đúng như trên sheet;
// normalizeHeaderText() CHỈ bỏ khoảng trắng/xuống dòng, KHÔNG làm NFKC — nên viết
// nhầm sang ngoặc half-width là throw.
//
// Thứ tự dưới đây theo ĐÚNG trái→phải của ガワ, để đối chiếu bằng mắt với sheet thật.

var CUSTOMER_REQUIRED_HEADERS = [
  'タイトルNo', 'CMS ID', 'タイトルID', 'タイトル区分',
  '①広告出稿ポリシー', '②一般面出稿NG', '③シーモアロゴ判定',
  '掲載停止日付', 'LP制作', 'タイトル名', '作家名', 'ジャンル', '出版社', 'レーベル名',
  '先行開始日', '先行終了日', '先行終了日（延長）', '先行終了日（最終確定）',
  '大量無料開始日', '大量無料終了日',
];

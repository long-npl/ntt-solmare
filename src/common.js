// common.js — NỀN TẢNG: tra cột theo TÊN header + chuẩn hoá/so sánh giá trị
//
// Đây là lớp thấp nhất của GAS❶: mọi file khác đều gọi vào đây. Gom 2 nhóm hàm
// vào cùng 1 file vì chúng cùng giải một vấn đề — "dữ liệu người nhập tay không
// bao giờ sạch": cột có thể bị chèn/đổi thứ tự/đổi tên (nhóm 1), giá trị có thể
// khác nhau ở những ký tự vô hình mà mắt thường không thấy (nhóm 2).
//
// Hàm PURE, không đụng SpreadsheetApp — được test bằng Node (tools/verify/).

// ==============================================================================
// NHÓM 1 — TRA CỘT THEO TÊN HEADER
// Không hardcode số cột, và tự dò cả vị trí HÀNG header (mỗi sheet
// khác nhau: có sheet header ở hàng 1, có sheet ở hàng 4, hàng 15).
// ==============================================================================

/**
 * Chuẩn hoá 1 chuỗi header để so sánh: bỏ khoảng trắng thường, khoảng trắng
 * full-width (　), xuống dòng (\n)... Lý do cần hàm này: cùng 1 tên cột có thể
 * viết khác nhau chút xíu giữa các sheet thật (vd "CMS ID" vs "CMSID", hoặc
 * "①広告出稿ポリシー\n（出稿NG）" có xuống dòng giữa chừng) — nếu so sánh chuỗi
 * y hệt (===) sẽ bị trật, nên mọi so khớp tên cột trong file này đều đi qua
 * normalize trước.
 *
 * @param {*} value - Giá trị ô header thô (có thể null/undefined/số/chuỗi)
 * @returns {string} Chuỗi đã bỏ hết khoảng trắng các loại, dùng để so khớp
 */
function normalizeHeaderText(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/　/g, '') // khoảng trắng full-width hay dùng để canh lề trong header
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Dò xem HÀNG NÀO trong rawRows là hàng header thật, bằng cách tìm hàng đầu
 * tiên chứa ĐỦ tất cả các tên cột bắt buộc (requiredHeaderNames), so khớp sau
 * khi normalize. Cần hàm này vì các sheet nguồn không thống nhất: có sheet
 * header ở hàng 1, có sheet có vài hàng ghi chú/tiêu đề phía trên nên header
 * thật nằm ở hàng 2, 4, hay thậm chí hàng 10 (vd スクエニコピーライト一覧).
 *
 * Nếu không tìm thấy hàng nào khớp đủ, THROW lỗi ngay — cố tình không âm thầm
 * trả về hàng đoán mò, vì đọc nhầm hàng header sẽ kéo theo đọc sai TOÀN BỘ cột
 * phía sau mà không ai nhận ra cho tới khi dữ liệu ra sai lệch khó truy vết.
 *
 * @param {Array<Array<*>>} rawRows - Toàn bộ dữ liệu thô của sheet (kết quả getValues())
 * @param {Array<string>} requiredHeaderNames - Danh sách tên cột bắt buộc phải có trên hàng header
 * @returns {number} Index (0-based) của hàng header trong rawRows
 * @throws {Error} Nếu không có hàng nào chứa đủ các tên cột yêu cầu
 */
function findHeaderRowIndex(rawRows, requiredHeaderNames) {
  var normalizedRequired = requiredHeaderNames.map(normalizeHeaderText);
  for (var i = 0; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    var normalizedRow = row.map(normalizeHeaderText);
    var hasAll = normalizedRequired.every(function (name) {
      return normalizedRow.indexOf(name) !== -1;
    });
    if (hasAll) return i;
  }
  throw new Error('Không tìm thấy dòng header chứa đủ các cột: ' + requiredHeaderNames.join(', '));
}

/**
 * Từ 1 hàng header cụ thể, build ra bảng tra "tên cột (đã normalize)" -> "số
 * cột (0-based)". Đây là cái cho phép code viết `col(idx, 'コピーライト')` thay vì
 * `row[20]` — dù NXB có chèn thêm cột ở giữa, tên "コピーライト" vẫn trỏ đúng cột
 * mới vì map này được build lại mỗi lần đọc sheet, không hardcode.
 *
 * Nếu 2 cột có tên trùng nhau sau khi normalize, chỉ giữ cột ĐẦU TIÊN (bên
 * trái) — trường hợp này không gặp trong dữ liệu thật hiện tại nhưng xử lý an
 * toàn cho tương lai.
 *
 * @param {Array<*>} headerRow - 1 hàng header thô (1 phần tử của rawRows)
 * @returns {Map<string, number>} Map tên cột đã normalize -> số cột (0-based)
 */
function buildHeaderIndex(headerRow) {
  var map = new Map();
  headerRow.forEach(function (cell, index) {
    var name = normalizeHeaderText(cell);
    if (name && !map.has(name)) map.set(name, index);
  });
  return map;
}

/**
 * Hàm tiện ích gộp 2 bước findHeaderRowIndex + buildHeaderIndex làm 1 —
 * đây là hàm mà các file src/sources/*.js gọi ở đầu mỗi parse function.
 *
 * @param {Array<Array<*>>} rawRows - Toàn bộ dữ liệu thô của sheet
 * @param {Array<string>} requiredHeaderNames - Tên các cột bắt buộc phải có
 * @returns {{headerRowIndex: number, headerIndex: Map<string, number>}}
 *   headerRowIndex: dùng để biết data thật bắt đầu từ hàng nào (headerRowIndex + 1)
 *   headerIndex: dùng với hàm col()/tryCol() bên dưới để tra số cột theo tên
 */
function resolveHeaderIndex(rawRows, requiredHeaderNames) {
  var headerRowIndex = findHeaderRowIndex(rawRows, requiredHeaderNames);
  var headerIndex = buildHeaderIndex(rawRows[headerRowIndex]);
  return { headerRowIndex: headerRowIndex, headerIndex: headerIndex };
}

/**
 * Lấy số cột (0-based) theo tên header. Đây là hàm dùng TRỰC TIẾP nhiều nhất
 * trong toàn bộ codebase — mỗi lần thấy `row[colXxx]` ở nơi khác, `colXxx` gần
 * như chắc chắn đến từ 1 lệnh gọi col(idx, 'Tên cột') ở đầu function đó.
 *
 * Bắt buộc (không phải tuỳ chọn): nếu tên cột không tồn tại trong headerIndex,
 * THROW lỗi ngay lập tức, thà dừng chương trình sớm còn hơn đọc nhầm cột do
 * gõ sai tên hoặc cột đã bị đổi tên/xoá trên sheet thật.
 *
 * @param {Map<string, number>} headerIndex - Kết quả từ buildHeaderIndex()/resolveHeaderIndex()
 * @param {string} name - Tên cột cần tìm (không cần normalize trước, hàm tự làm)
 * @returns {number} Số cột (0-based)
 * @throws {Error} Nếu không tìm thấy tên cột này trong headerIndex
 */
function col(headerIndex, name) {
  var index = headerIndex.get(normalizeHeaderText(name));
  if (index === undefined) throw new Error('Không tìm thấy cột header: ' + name);
  return index;
}

/**
 * Giống hệt col(), nhưng trả về `undefined` thay vì throw nếu không tìm thấy.
 *
 * Dành cho cột TUỲ CHỌN: cột có thể chưa tồn tại trên sheet thật cho tới khi ai đó
 * thêm header vào. Nếu dùng col() cho những cột đó, code throw ngay lần chạy đầu
 * tiên; dùng tryCol() thì code vẫn chạy, chỉ để giá trị trống.
 *
 * CHỖ DÙNG (2026-08-07): parseMassFreeRows() trong sources.js tra 2 cột 出稿回答 và
 * タイトル名 của sheet ★出稿回答シート. Cả 2 đều là cột "có thì tốt": 出稿回答 chỉ dùng để
 * LỌC (mất cột -> mọi dòng được tính, đúng hành vi mặc định an toàn), タイトル名 chỉ
 * dùng để cảnh báo đọc được. Để 1 trong 2 cột đó làm sập cả lần chạy là đánh đổi sai.
 *
 * CHÚ Ý KIỂU TRẢ VỀ: `undefined`, KHÔNG phải `null` — so `=== null` sẽ luôn sai và
 * `row[undefined]` thì trả về undefined một cách im lặng.
 *
 * @param {Map<string, number>} headerIndex
 * @param {string} name
 * @returns {number|undefined} Số cột (0-based), hoặc undefined nếu cột chưa tồn tại
 */
function tryCol(headerIndex, name) {
  return headerIndex.get(normalizeHeaderText(name));
}

/**
 * Giống col(), nhưng khớp header theo TIỀN TỐ thay vì khớp toàn bộ tên.
 *
 * Dùng cho những cột mà tên header có kèm ghi chú giải thích ngay trong ô —
 * hiện tại là 2 cột của sheet 作品レギュレーション判定:
 *   '①広告出稿ポリシー\n（出稿NG）'
 *   '②一般面出稿NG\n（アダルト作品扱い）'
 * Phần trong ngoặc là văn bản giải thích do con người viết, có thể được sửa lời
 * bất cứ lúc nào mà người sửa không nghĩ là mình đang sửa cấu trúc dữ liệu. Tra
 * bằng tên đầy đủ (col()) sẽ throw ngay lần chạy sau đó; tra bằng tiền tố
 * '①広告出稿ポリシー' thì bền với việc sửa ghi chú.
 *
 * VẪN THROW (giữ đúng triết lý của col(), không âm thầm đoán) trong 2 trường
 * hợp: không cột nào khớp tiền tố, HOẶC nhiều hơn 1 cột khớp — trường hợp thứ 2
 * quan trọng: ガワ mới của 顧客作品マスタ có cả '先行終了日', '先行終了日（延長）'
 * và '先行終了日（最終確定）', nên tra tiền tố '先行終了日' ở đó là nhập nhằng và
 * phải để con người quyết định, không được chọn bừa cột bên trái.
 *
 * @param {Map<string, number>} headerIndex - Kết quả buildHeaderIndex()/resolveHeaderIndex()
 * @param {string} prefix - Tiền tố tên cột (không cần normalize trước, hàm tự làm)
 * @returns {number} Số cột (0-based)
 * @throws {Error} Nếu không cột nào khớp, hoặc nhiều hơn 1 cột khớp
 */
/**
 * Đổi chữ cái cột kiểu spreadsheet ('A', 'D', 'AA') thành index 0-based.
 *
 * Dùng cho nguồn KHÔNG tra được cột theo tên — hiện chỉ có file TSV
 * `multi_title_yyyyMMdd.tsv` (cột I 掲載停止日付): file do hệ thống khác xuất ra,
 * không có gì bảo đảm hàng đầu là hàng header, nên vị trí cột là thứ duy nhất
 * đáng tin. Với mọi nguồn còn lại thì tra theo TÊN vẫn tốt hơn hẳn (bền với việc
 * chèn/xoá/đổi thứ tự cột) — đừng dùng hàm này ở đó.
 *
 * Nhận chữ cái thay vì số trong CONFIG là có chủ đích: người vận hành mở file ra
 * và thấy "cột A", "cột D", không thấy "cột 0", "cột 3". Đổi cấu hình khi nguồn
 * dịch cột thì chỉ sửa đúng 1 ký tự, và sửa đúng cái mình đang nhìn.
 *
 * @param {string} letter - vd 'A', 'd', 'AA' (không phân biệt hoa/thường)
 * @returns {number} Index 0-based ('A' -> 0, 'D' -> 3, 'AA' -> 26)
 * @throws {Error} Nếu không phải chuỗi chỉ gồm chữ cái A-Z
 */
function columnLetterToIndex(letter) {
  var text = String(letter === null || letter === undefined ? '' : letter).trim().toUpperCase();
  if (!/^[A-Z]+$/.test(text)) {
    throw new Error('Chữ cái cột không hợp lệ: "' + letter + '" (phải là dạng A, B, ... AA)');
  }
  var index = 0;
  for (var i = 0; i < text.length; i++) {
    index = index * 26 + (text.charCodeAt(i) - 64); // 'A'.charCodeAt(0) === 65
  }
  return index - 1;
}

/**
 * Chiều ngược của columnLetterToIndex(): 0 -> 'A', 3 -> 'D', 26 -> 'AA'.
 *
 * Chỉ dùng để HIỂN THỊ trong log/chẩn đoán (xem probe_readCustomerMasterHeader
 * trong main.js) — người đọc log đang mở sheet ra và nhìn thấy chữ cái cột, nên
 * log kiểu 'K=タイトル名' đối chiếu được ngay, còn 'cột 10' thì phải tự đếm.
 *
 * @param {number} index - Index 0-based
 * @returns {string} Chữ cái cột
 */
function columnIndexToLetter(index) {
  var n = Number(index);
  if (!isFinite(n) || n < 0) return '?';
  var letters = '';
  n = Math.floor(n) + 1;
  while (n > 0) {
    var remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function colByPrefix(headerIndex, prefix) {
  var normalizedPrefix = normalizeHeaderText(prefix);
  var matches = [];
  headerIndex.forEach(function (index, name) {
    if (name.indexOf(normalizedPrefix) === 0) matches.push({ name: name, index: index });
  });
  if (matches.length === 0) throw new Error('Không tìm thấy cột header bắt đầu bằng: ' + prefix);
  if (matches.length > 1) {
    throw new Error('Tiền tố cột "' + prefix + '" khớp nhiều cột, không xác định được cột nào: '
      + matches.map(function (m) { return m.name; }).join(', '));
  }
  return matches[0].index;
}


// ==============================================================================
// NHÓM 2 — CHUẨN HOÁ VÀ SO SÁNH GIÁ TRỊ
// CHỈ dùng để SO SÁNH/TRA CỨU, KHÔNG BAO GIỜ dùng giá trị đã chuẩn
// hoá để ghi ra sheet (spec §4.4).
// ==============================================================================

/**
 * Chuẩn hoá 1 giá trị TIẾNG NHẬT chung (KHÔNG gồm ký hiệu bản quyền — xem
 * normalizeForCompare() bên dưới cho phần đó) để SO SÁNH/TRA CỨU — dùng cho
 * title/tên tác giả/tên NXB ở bất kỳ đâu cần so khớp dù có biến thể Unicode
 * cosmetic. KHÔNG dùng để lưu/ghi.
 *
 * Coi `undefined`/`null`/chuỗi rỗng/chuỗi chỉ có khoảng trắng là CÙNG 1 giá
 * trị "không có gì" (trim trước). Chuẩn hoá 2 nhóm ký tự tiếng Nhật hay bị
 * lẫn lộn:
 *
 * 1. `〜` (WAVE DASH, U+301C) và `～` (FULLWIDTH TILDE, U+FF5E) — trông GIỐNG
 *    HỆT NHAU trong hầu hết font, cực kỳ phổ biến trong タイトル名, nhưng
 *    Unicode KHÔNG coi 2 ký tự này tương đương (kể cả sau NFKC) — phải tự map
 *    thủ công. (Lưu ý: `.normalize('NFKC')` ở bước sau CÒN tiếp tục phân rã
 *    FULLWIDTH TILDE thành dấu ngã ASCII nửa-rộng `~` — nghĩa là kết quả cuối
 *    cùng thực chất là `~`, không phải `～`; vẫn đúng cho mục đích SO SÁNH vì
 *    áp dụng nhất quán cho cả 2 vế, chỉ không nên dùng hàm này để hiển thị.)
 * 2. Full-width vs half-width (Ａ-Ｚ/０-９/khoảng trắng　 vs A-Z/0-9/khoảng
 *    trắng thường), half-width vs full-width katakana — dùng
 *    `String.prototype.normalize('NFKC')`, đúng chuẩn Unicode. NFKC còn có
 *    tác dụng phụ RỘNG HƠN những gì liệt kê ở đây (vd gộp dấu ba chấm "…"
 *    thành "..." ASCII) — chấp nhận được vì mục đích của hàm này vốn là nới
 *    lỏng so sánh, không phải giữ nguyên văn.
 *
 * CỐ TÌNH KHÔNG chuẩn hoá: ký tự rõ ràng là lỗi gõ (vd "┴" — ký tự vẽ khung
 * bảng — dùng nhầm thay cho dấu chấm giữa "・" ở 1 vài tên tác giả thật) —
 * lỗi nhập liệu cần con người sửa ở nguồn, GAS không nên âm thầm coi tương
 * đương (có thể che mất lỗi thật cần sửa).
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeJapaneseText(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .trim()
    .replace(/[〜～]/g, '～') // wave dash (U+301C) vs fullwidth tilde (U+FF5E) -> 1 dạng
    .normalize('NFKC'); // full-width/half-width Latin+số+khoảng trắng, half-width katakana, v.v.
}

/**
 * Chuẩn hoá 1 giá trị field BẢN QUYỀN để SO SÁNH (không dùng để lưu/ghi) —
 * gồm normalizeJapaneseText() ở trên CỘNG THÊM chuẩn hoá các BIẾN THỂ
 * UNICODE của ký hiệu bản quyền "©": `©` (U+00A9, chuẩn), `Ⓒ`/`ⓒ`
 * (U+24B8/U+24D2, "circled Latin letter C"), và `(C)`/`(c)`/`（Ｃ）`/`（ｃ）`
 * (dạng ASCII lẫn full-width, có/không dấu ngoặc). Về ý nghĩa, tất cả đều là
 * "bản quyền" — nhưng so sánh `===` trực tiếp sẽ coi 2 chuỗi chỉ khác nhau
 * đúng 1 ký hiệu này là "đã đổi", gây log audit sai lệch và dịch chuyển lịch
 * sử CopyRight過去1-10 một cách không cần thiết. CHỈ chuẩn hoá để SO SÁNH —
 * giá trị thật sự GHI vào sheet vẫn giữ nguyên ký hiệu gốc từ nguồn.
 *
 * TẠI SAO CẦN HÀM NÀY (lịch sử): khi 1 record vừa build lại từ nguồn không
 * match được gì (vd tra レギュレーション không ra, xem buildCustomerWorkRows()),
 * giá trị đó là `undefined` trong JS. Nhưng khi GHI `undefined` vào 1 ô Google Sheets rồi
 * ĐỌC LẠI ở lần chạy sau, Sheets trả về CHUỖI RỖNG `''`, không phải
 * `undefined`. So sánh trực tiếp bằng `===` sẽ thấy `undefined !== ''` và
 * coi đó là "đã đổi" — dù cả 2 đều thực chất là "không có gì". Đã kiểm chứng
 * bug này gây ra ~99% số dòng bị đánh dấu update SAI ở mỗi lần chạy (xem
 * GAS1変更詳細 thực tế: 5639+3022 dòng log có cả 変更前/変更後 đều trống).
 * `normalizeJapaneseText()` (không nhận `undefined`/`null`) xử lý phần này.
 *
 * THỨ TỰ QUAN TRỌNG: phải chuẩn hoá ký hiệu © TRƯỚC khi gọi normalizeJapaneseText()
 * (tức trước NFKC) — vì NFKC tự nó phân rã `Ⓒ`/`ⓒ` (circled Latin letter C)
 * thành chữ "C" trần trụi (không phải "©" hay "(C)"), làm mất luôn dấu hiệu
 * để regex ©-family nhận diện được nếu gọi sau.
 *
 * Regex `[（(][CcＣｃ][）)]/g` xử lý CẢ full-width lẫn half-width ngoặc quanh
 * C — nếu chỉ dùng `\(c\)` (ASCII only) như bản trước, `（Ｃ）` (ngoặc +
 * chữ C đều full-width, kiểu gõ IME tiếng Nhật rất phổ biến) sẽ KHÔNG được
 * nhận diện tương đương với `©`/`(C)`, vì NFKC (bước fold full-width sang
 * half-width) chạy SAU quy tắc ©-family này, quá muộn để quy tắc đó bắt lại.
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeForCompare(value) {
  if (value === undefined || value === null) return '';
  var withCopyrightFolded = String(value)
    .trim()
    .replace(/[（(][CcＣｃ][）)]/g, '©') // (C)/(c)/（Ｃ）/（ｃ） -> ©
    .replace(/[©Ⓒⓒ]/g, '©'); // Ⓒ/ⓒ (circled Latin letter C) -> © (ký hiệu chuẩn)
  return normalizeJapaneseText(withCopyrightFolded);
}

/**
 * So sánh 2 giá trị field SAU KHI đã chuẩn hoá (xem normalizeForCompare()).
 * Dùng cho MỌI so sánh field-by-field trong customerIsEqualFn/
 * copyrightIsEqualFn (main.js) và buildChangeDetailRows() (master.js)
 * — không dùng `===` trực tiếp ở những nơi đó nữa.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function sameValue(a, b) {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

/**
 * Giá trị này có phải "số thật" hay không — dùng cho điều kiện tầng 2 của
 * cascade (và cho khoá join của nguồn 掲載停止日付, xem sources.js).
 *
 * BẮT BUỘC phải có điều kiện này (spec §5.2): nếu tầng 2 chỉ so
 * normalize(タイトルID) thì mọi dòng có タイトルID trống sẽ khớp lẫn nhau (khoá
 * rỗng = khoá rỗng), và 3 dòng thật cùng ghi '4415行目と同一' trong ô ID cũng
 * khớp nhau — tức 2 tác phẩm khác nhau ghi đè lên cùng 1 dòng master.
 *
 * Chấp nhận cả number lẫn string: Google Sheets trả về number cho ô ID, còn
 * fixtures/export có thể trả về string — cả 2 đều phải cho ra cùng kết quả.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isDigits(value) {
  var text = String(value === null || value === undefined ? '' : value).trim();
  if (text === '') return false;
  return /^[0-9]+$/.test(text);
}

/**
 * Ô này có phải MỘT NGÀY CỤ THỂ (期日) hay không — trả về Date nếu có, null nếu không.
 *
 * KHÁC toDateKey() bên dưới ở đúng một điểm quyết định: hàm này CHẶT, toDateKey()
 * LỎNG. toDateKey() chỉ cần khớp TIỀN TỐ ('2026-03-27 ※3巻出るまで' vẫn ra khoá) vì
 * việc của nó là so 2 giá trị cho khỏi churn — nhận lỏng thì cùng lắm là coi 2 thứ
 * hơi khác nhau như nhau, vô hại. Hàm này thì quyết định CÓ GHI hay KHÔNG GHI một
 * ngày vào master, nên nhận lỏng nghĩa là ghi ra dữ liệu sai.
 *
 * VÌ SAO CẦN NÓ (nguồn 【先行作品】独占期間の延長, spec R列: "G∼M列に記載のある期日のみ"):
 * 7 cột 1回目〜7回目 của nguồn đó là ô người gõ tay, và trên dữ liệu thật
 * 2026-08-07 chúng chứa 149 ô 'NG' cộng khoảng 15 ô không phải ngày:
 * '一旦無期限先行', '11月末', '12月頃', '2025年2月予定', '4話の配信日', '以降の延長NG',
 * '#VALUE!', '2024/02/01\n※3巻出るまで', '2025/7/3（以降の延長NG)', và ô ghi dồn nhiều
 * lần gia hạn vào một ô ('6回目：2024/4/26\n7回目：2024/5/30\n...').
 *
 * 3 quyết định cố ý:
 *
 * 1. CHỈ nhận Date thật + chuỗi mà TOÀN BỘ ô là một ngày. Có chữ kèm theo -> null.
 *    '2024/02/01 ※3巻出るまで' bị bỏ chứ không lấy phần ngày: ghi chú đó nói điều
 *    kiện gia hạn chưa chắc chắn, lấy riêng con số ngày là bóp méo ý người nhập.
 *
 * 2. KIỂM TRA NGÀY CÓ TỒN TẠI THẬT trên lịch. Nguồn có 2 ô '2025/11/31' (tháng 11
 *    không có ngày 31). `new Date('2025/11/31')` của JS âm thầm cuộn sang 2025/12/01,
 *    tức tự ý dịch hạn độc quyền của tác phẩm đi 1 ngày. So lại 3 thành phần
 *    y/m/d sau khi dựng Date là cách duy nhất bắt được kiểu lỗi này.
 *
 * 3. KHÔNG nhận number. Ô định dạng ngày của Sheets luôn về đây dưới dạng Date, nên
 *    một ô số trần trong cột 期日 là dữ liệu lạ (serial ngày thô, hoặc số vô nghĩa)
 *    — đoán nghĩa cho nó rủi ro hơn là bỏ qua và để nó hiện ra ở cảnh báo.
 *
 * normalizeJapaneseText() chạy trước khi khớp regex nên NFKC gộp luôn chữ số
 * full-width — ô thật '2024/7/４' (chữ 4 full-width do lỗi IME) vì thế vẫn đọc được.
 *
 * @param {*} value - Giá trị ô nguyên bản
 * @returns {Date|null} Date (00:00 giờ địa phương) nếu ô là 1 期日, null nếu không
 */
function toDateOrNull(value) {
  // Kiểm theo internal class chứ không dùng instanceof — cùng lý do đã ghi trong
  // toDateKey() bên dưới (harness Node chạy src/ trong vm context riêng).
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number') return null;

  var text = normalizeJapaneseText(value);
  // ^...$ (khớp TOÀN BỘ chuỗi) là điểm khác biệt then chốt so với toDateKey().
  // Nhận cả 3 cách viết đang có thật trong nguồn: 2024/7/4, 2024-07-04, 2024年7月4日.
  var matched = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/.exec(text);
  if (!matched) return null;

  var year = Number(matched[1]);
  var month = Number(matched[2]);
  var day = Number(matched[3]);
  var date = new Date(year, month - 1, day);
  // Ngày không tồn tại trên lịch (vd 2025/11/31) -> Date tự cuộn sang tháng sau,
  // nên 3 thành phần đọc lại sẽ KHÁC 3 số đã nhập. Đó là cách bắt lỗi ở đây.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/**
 * Khoá ngày (năm-tháng-ngày) của 1 giá trị, hoặc null nếu không phải ngày.
 *
 * Nhận CẢ Date lẫn chuỗi dạng ngày ('2026-03-27', '2026/3/27'): giá trị ghi vào
 * ô Sheets dưới dạng chuỗi ngày sẽ được Sheets tự chuyển thành Date, nên lần đọc
 * sau ta nhận về Date trong khi giá trị vừa build lại vẫn là chuỗi — không nhận
 * cả 2 dạng thì so sánh sẽ luôn báo "đã đổi".
 *
 * @param {*} value
 * @returns {string|null}
 */
function toDateKey(value) {
  // Dùng Object.prototype.toString thay vì `value instanceof Date`: cách sau chỉ
  // đúng khi object được tạo trong CÙNG một realm JS. Trong Apps Script chỉ có 1
  // realm nên cả 2 cách giống nhau, nhưng harness Node (tools/verify) chạy code
  // này trong 1 vm context riêng — Date của test và Date của sandbox là 2 hàm tạo
  // khác nhau, nên instanceof trả về false và mọi so sánh ngày âm thầm sai. Kiểm
  // theo internal class thì đúng ở cả 2 nơi.
  if (Object.prototype.toString.call(value) === '[object Date]') {
    var time = value.getTime();
    if (isNaN(time)) return null;
    return value.getFullYear() + '-' + (value.getMonth() + 1) + '-' + value.getDate();
  }
  if (typeof value === 'string') {
    var matched = /^\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(value);
    if (!matched) return null;
    return Number(matched[1]) + '-' + Number(matched[2]) + '-' + Number(matched[3]);
  }
  return null;
}

/**
 * So sánh 2 giá trị có thể là NGÀY — dùng cho 先行開始日/先行終了日 trong
 * isEqualFn của 顧客作品マスタ.
 *
 * TẠI SAO KHÔNG dùng sameValue() cho field ngày: sameValue() ép String(), và
 * String(Date) sinh ra chuỗi có cả giờ + timezone ('Fri Mar 27 2026 00:00:00
 * GMT+0900'). Hai spreadsheet khác timezone (hoặc script timezone khác
 * spreadsheet timezone) sẽ cho ra 2 instant lệch nhau vài giờ cho CÙNG một ngày
 * lịch — và vì GAS chạy mỗi ngày, chênh lệch đó thành churn VĨNH VIỄN: mỗi lần
 * chạy đều thấy "đã đổi", ghi lại toàn bộ sheet, và log 変更詳細 đầy dòng vô
 * nghĩa. So theo năm-tháng-ngày loại bỏ hẳn class lỗi đó.
 *
 * Nếu chỉ 1 vế là ngày (vd master có ngày, CMS ghi '未定'), coi là ĐÃ ĐỔI —
 * đúng, vì đó là thay đổi thật cần được ghi lại.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function sameDateValue(a, b) {
  var keyA = toDateKey(a);
  var keyB = toDateKey(b);
  if (keyA !== null || keyB !== null) return keyA === keyB;
  return sameValue(a, b);
}

/**
 * So sánh dành cho cột GHI MỘT LẦN (hiện chỉ có cột I 掲載停止日付).
 *
 * Quy tắc (user chốt 2026-08-03): ô nào ĐANG CÓ giá trị thì không bao giờ bị ghi
 * đè — dù nguồn nói khác, dù giá trị đó do người gõ tay. GAS chỉ điền vào ô đang
 * trống. Vì vậy hàm này trả về true ("không đổi") ngay khi vế existing có giá
 * trị, bất kể incoming là gì.
 *
 * Hệ quả tốt: cột ghi-một-lần KHÔNG THỂ gây churn, kể cả khi định dạng ngày của
 * nguồn khác định dạng mà Sheets lưu.
 *
 * CHÚ Ý THỨ TỰ THAM SỐ: hàm này KHÔNG đối xứng. Phải gọi
 * sameWriteOnceValue(existing, incoming) — đảo 2 vế sẽ cho hành vi ngược lại
 * (ghi đè mọi lần, đúng cái ta đang tránh).
 *
 * @param {*} existingValue - Giá trị đang có trên sheet
 * @param {*} incomingValue - Giá trị vừa tra được từ nguồn
 * @returns {boolean} true nếu coi là "không cần ghi"
 */
function sameWriteOnceValue(existingValue, incomingValue) {
  if (normalizeForCompare(existingValue) !== '') return true;
  return normalizeForCompare(incomingValue) === '';
}

/**
 * So sánh dành cho cột mà GAS GHI ĐÈ ĐƯỢC nhưng KHÔNG ĐƯỢC PHÉP XOÁ (hiện chỉ có
 * cột J LP制作).
 *
 * Khác cả 2 hàm trên:
 *   - sameValue()          : incoming rỗng -> ghi rỗng đè lên (XOÁ dữ liệu người gõ)
 *   - sameWriteOnceValue() : ô đã có chữ -> không bao giờ đổi nữa (không sửa được
 *                            khi ロゴ判定 đổi từ ロゴなし sang ロゴあり)
 *   - hàm này             : incoming CÓ giá trị -> ghi đè bình thường;
 *                           incoming RỖNG -> coi là "không đổi", giữ nguyên ô.
 *
 * VÌ SAO CẦN NÓ: LP制作 rỗng nghĩa là "chưa phán định được" (ジャンル không phải
 * TL/BL và ③シーモアロゴ判定 đang 未判定), KHÔNG phải "phán định ra là rỗng". Ghi
 * rỗng đè lên sẽ xoá mất giá trị 営業 gõ tay chỉ vì レギュレーション chưa chấm xong
 * tác phẩm đó — cột này vốn là cột nhập tay trước khi GAS tiếp quản.
 *
 * CHÚ Ý THỨ TỰ THAM SỐ: hàm này KHÔNG đối xứng, phải gọi
 * sameKeepWhenBlankValue(existing, incoming) — giống sameWriteOnceValue().
 *
 * @param {*} existingValue - Giá trị đang có trên sheet
 * @param {*} incomingValue - Giá trị vừa tính ra
 * @returns {boolean} true nếu coi là "không cần ghi"
 */
function sameKeepWhenBlankValue(existingValue, incomingValue) {
  if (normalizeForCompare(incomingValue) === '') return true;
  return sameValue(existingValue, incomingValue);
}

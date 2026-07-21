// logic/upsert.js — diff/upsert theo khoá chung + đánh số ổn định qua nhiều lần chạy
//
// 2 hàm PURE ở đây được dùng CHUNG cho cả 顧客作品マスタ lẫn コピーライトマスタ
// trong main.js (mỗi master gọi resolveNumbers() + diffUpsert() riêng, với
// keyFn/isEqualFn khác nhau — xem runGas1() trong main.js).

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
 * match được gì (vd `lookupRegulation()` trả về `undefined`), giá trị đó là
 * `undefined` trong JS. Nhưng khi GHI `undefined` vào 1 ô Google Sheets rồi
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
 * copyrightIsEqualFn (main.js) và buildChangeDetailRows() (logic/changeDetail.js)
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
 * So sánh existingRecords (đang có trên sheet output, đọc lúc ĐẦU lần chạy)
 * với newRecords (vừa build lại từ nguồn, PHẢI đã được resolveNumbers() gán
 * số trước khi gọi hàm này) theo keyFn, để biết dòng nào cần update, dòng nào
 * cần thêm mới, dòng nào giữ nguyên không đổi.
 *
 * Nguyên tắc UPSERT (không phải REPLACE): dòng có key tồn tại ở cả 2 bên chỉ
 * bị ghi lại nếu isEqualFn phát hiện có thay đổi — dòng không đổi bị bỏ qua
 * hoàn toàn (không ghi lại), để giảm nhiễu lịch sử chỉnh sửa (version history)
 * trên Google Sheets và tránh việc GAS "động" vào dòng không cần thiết.
 *
 * @param {Array<object>} existingRecords - Dữ liệu đang có trên sheet output (đọc trước khi build mới)
 * @param {Array<object>} newRecords - Dữ liệu vừa build lại từ nguồn cho lần chạy này
 * @param {function(object): string} keyFn - Hàm lấy khoá định danh 1 record
 *   (vd r => String(r.cmsId) cho 顧客作品マスタ, r => String(r.titleNo) cho コピーライトマスタ)
 * @param {function(object, object): boolean} isEqualFn - So sánh (existing, incoming)
 *   -> true nếu coi là "không đổi", false nếu coi là "cần update"
 * @returns {{
 *   toUpdate: Array<{key: string, record: object, previous: object}>,
 *   toAdd: Array<object>,
 *   unchangedKeys: Array<string>
 * }}
 *   toUpdate: dòng đã tồn tại nhưng có thay đổi — record.rowOffset PHẢI được
 *     gán thêm bởi attachRowOffsets() (main.js) trước khi đưa cho sheetIO ghi.
 *     `previous` là bản ghi CŨ (từ existingRecords) tương ứng — giữ lại để
 *     logic/changeDetail.js so sánh field-by-field, phục vụ log audit chi
 *     tiết (xem buildChangeDetailRows() và io/logSheet.appendChangeDetailRows()).
 *   toAdd: dòng có key CHƯA từng xuất hiện trong existingRecords — sẽ được
 *     append vào cuối sheet (xem sheetIO.writeCustomerWorkMaster()/writeCopyrightMaster())
 *   unchangedKeys: chỉ để tham khảo/log, KHÔNG được ghi lại vào sheet
 */
function diffUpsert(existingRecords, newRecords, keyFn, isEqualFn) {
  var existingByKey = new Map();
  existingRecords.forEach(function (record) {
    existingByKey.set(keyFn(record), record);
  });

  var toUpdate = [];
  var toAdd = [];
  var unchangedKeys = [];

  newRecords.forEach(function (record) {
    var key = keyFn(record);
    var existing = existingByKey.get(key);
    if (!existing) {
      toAdd.push(record);
      return;
    }
    if (isEqualFn(existing, record)) {
      unchangedKeys.push(key);
    } else {
      toUpdate.push({ key: key, record: record, previous: existing });
    }
  });

  return { toUpdate: toUpdate, toAdd: toAdd, unchangedKeys: unchangedKeys };
}

/**
 * Gán số thứ tự (タイトルNo) cho newRecords, đảm bảo ỔN ĐỊNH qua nhiều lần
 * chạy: nếu 1 record đã tồn tại (key trùng với existingRecords), DÙNG LẠI
 * đúng số cũ — không bao giờ đổi số của 1 tác phẩm đã có. Nếu là key MỚI
 * (chưa từng xuất hiện), gán số tiếp theo sau giá trị lớn nhất hiện có, theo
 * đúng thứ tự record đó xuất hiện trong newRecords.
 *
 * PHẢI gọi hàm này TRƯỚC diffUpsert() (không phải sau) — lý do: コピーライト
 * マスタ dùng lại chính タイトルNo mà 顧客作品マスタ gán ở đây làm khoá của
 * riêng nó (コピーライトマスタ không có cột タイトルID), nên số phải được chốt
 * xong hết (kể cả cho những record rồi sẽ rơi vào "unchanged") trước khi
 * build コピーライトマスタ — xem giải thích trong runGas1() (main.js).
 *
 * @param {Array<object>} existingRecords - Dữ liệu đang có trên sheet, mỗi phần tử có sẵn numberField
 * @param {Array<object>} newRecords - Dữ liệu vừa build, CHƯA có numberField
 * @param {function(object): string} keyFn - Hàm lấy khoá định danh (PHẢI cùng
 *   loại khoá với existingRecords, vd cả 2 bên đều key theo cmsId)
 * @param {string} numberField - Tên field số thứ tự cần gán (vd 'titleNo')
 * @returns {Array<object>} Bản sao (shallow copy) của newRecords, mỗi phần tử
 *   đã có thêm numberField
 */
function resolveNumbers(existingRecords, newRecords, keyFn, numberField) {
  var existingNumberByKey = new Map();
  var maxNumber = 0;
  existingRecords.forEach(function (record) {
    var num = Number(record[numberField]) || 0;
    existingNumberByKey.set(keyFn(record), num);
    if (num > maxNumber) maxNumber = num;
  });

  var nextNumber = maxNumber;
  return newRecords.map(function (record) {
    var key = keyFn(record);
    var copy = Object.assign({}, record);
    if (existingNumberByKey.has(key)) {
      copy[numberField] = existingNumberByKey.get(key);
    } else {
      nextNumber += 1;
      copy[numberField] = nextNumber;
    }
    return copy;
  });
}

// logic/upsert.js — diff/upsert theo khoá chung + đánh số ổn định qua nhiều lần chạy
//
// 2 hàm PURE ở đây được dùng CHUNG cho cả 顧客作品マスタ lẫn コピーライトマスタ
// trong main.js (mỗi master gọi resolveNumbers() + diffUpsert() riêng, với
// keyFn/isEqualFn khác nhau — xem runGas1() trong main.js).

/**
 * Chuẩn hoá 1 giá trị field để SO SÁNH (không dùng để lưu/ghi) — coi
 * `undefined`, `null`, chuỗi rỗng, và chuỗi chỉ có khoảng trắng là CÙNG MỘT
 * GIÁ TRỊ "không có gì". Cũng trim khoảng trắng đầu/cuối trước khi so sánh.
 *
 * TẠI SAO CẦN HÀM NÀY: khi 1 record vừa build lại từ nguồn không match được
 * gì (vd lookupRegulation() trả về `undefined` vì tác phẩm chưa có phán定),
 * giá trị field đó là `undefined`. Nhưng khi GHI `undefined` vào 1 ô Google
 * Sheets rồi ĐỌC LẠI ở lần chạy sau, Sheets trả về CHUỖI RỖNG `''`, không
 * phải `undefined`. So sánh trực tiếp bằng `===` sẽ thấy `undefined !== ''`
 * và coi đó là "đã đổi" — dù cả 2 đều thực chất là "không có gì". Đã kiểm
 * chứng bug này gây ra ~99% số dòng bị đánh dấu update SAI ở mỗi lần chạy
 * (xem GAS1変更詳細 thực tế: 5639+3022 dòng log có cả 変更前/変更後 đều trống).
 *
 * Tương tự, khoảng trắng thừa ở đầu/cuối 1 giá trị (vd do copy-paste từ
 * nguồn) không phải là thay đổi có ý nghĩa nghiệp vụ, nên cũng được trim
 * trước khi so sánh.
 *
 * Cũng chuẩn hoá các BIẾN THỂ UNICODE của ký hiệu bản quyền "©" về cùng 1
 * dạng trước khi so sánh — dữ liệu thật cho thấy các NXB khác nhau dùng lẫn
 * lộn: `©` (U+00A9, ký hiệu chuẩn), `Ⓒ`/`ⓒ` (U+24B8/U+24D2, "circled Latin
 * letter C" trong khối Enclosed Alphanumerics), và `(C)`/`(c)` (3 ký tự ASCII
 * viết tay). Về ý nghĩa, tất cả đều là "bản quyền" — nhưng so sánh `===` trực
 * tiếp sẽ coi 2 chuỗi chỉ khác nhau đúng 1 ký hiệu này là "đã đổi", gây log
 * audit sai lệch và dịch chuyển lịch sử CopyRight過去1-10 một cách không cần
 * thiết (cùng loại vấn đề với bug ở undefined/null/''). CHỈ chuẩn hoá để SO
 * SÁNH — giá trị thật sự GHI vào sheet vẫn giữ nguyên ký hiệu gốc từ nguồn,
 * không bị đổi.
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeForCompare(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .trim()
    .replace(/\(c\)/gi, '©') // (C) hoặc (c) -> ©
    .replace(/[©Ⓒⓒ]/g, '©'); // Ⓒ/ⓒ (circled Latin letter C) -> © (ký hiệu chuẩn)
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

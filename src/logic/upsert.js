// logic/upsert.js — diff/upsert theo khoá chung + đánh số ổn định qua nhiều lần chạy
//
// 2 hàm PURE ở đây được dùng CHUNG cho cả 顧客作品マスタ lẫn コピーライトマスタ
// trong main.js (mỗi master gọi resolveNumbers() + diffUpsert() riêng, với
// keyFn/isEqualFn khác nhau — xem runGas1() trong main.js).

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
 *   toUpdate: Array<{key: string, record: object}>,
 *   toAdd: Array<object>,
 *   unchangedKeys: Array<string>
 * }}
 *   toUpdate: dòng đã tồn tại nhưng có thay đổi — record.rowOffset PHẢI được
 *     gán thêm bởi attachRowOffsets() (main.js) trước khi đưa cho sheetIO ghi
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
      toUpdate.push({ key: key, record: record });
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

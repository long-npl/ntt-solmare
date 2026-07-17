// logic/upsert.js — diff/upsert theo khoá chung + đánh số ổn định qua nhiều lần chạy

// So sánh existingRecords (đang trên sheet) với newRecords (vừa build) theo keyFn.
// Trả về: dòng cần update (giá trị đổi), dòng cần thêm mới (khoá chưa tồn tại),
// và danh sách khoá không đổi (bỏ qua, không ghi lại — giảm nhiễu lịch sử sheet).
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

// Với mỗi newRecord: nếu khoá đã tồn tại trong existingRecords, dùng lại đúng
// numberField cũ (để タイトルNo ổn định qua các lần chạy); nếu là khoá mới,
// gán số tiếp theo sau giá trị lớn nhất hiện có, theo thứ tự trong newRecords.
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

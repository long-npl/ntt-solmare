// logic/copyrightHistory.js — dịch chuyển lịch sử CopyRight 過去1-10 (spec §6)
// chỉ dịch chuyển khi giá trị 正規コピーライト thực sự thay đổi so với lần trước

function shiftCopyrightHistory(existingRecord, newValue, maxSlots) {
  var currentValue = existingRecord.copyrightCurrent || null;
  var history = existingRecord.copyrightHistory ? existingRecord.copyrightHistory.slice() : [];

  if (newValue === currentValue) {
    return { copyrightCurrent: currentValue, copyrightHistory: history };
  }

  if (currentValue) {
    history.unshift(currentValue);
    if (history.length > maxSlots) history = history.slice(0, maxSlots);
  }

  return { copyrightCurrent: newValue, copyrightHistory: history };
}

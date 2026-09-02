// 6_matching.js — quyết định tác phẩm nào vào master VÀ nó ứng với dòng nào.
//
// Ba việc, chạy theo đúng thứ tự này:
//   1. LỌC + KHỚP DÒNG (cascade 3 tầng + chiếm-một-lần), làm cùng một lượt
//   2. CẤP タイトルNo — phải sau bước 1, tác phẩm bị loại không được chiếm số
//   3. DIFF — phân loại thêm mới / cần update / không đổi
//
// Toàn bộ là hàm thuần. Phần này đã được mô phỏng 4 lần chạy liên tiếp trên dữ liệu
// thật và ra kết quả ổn định — port nguyên trạng, không đụng logic.

// ==============================================================================

/**
 * Tác phẩm này có đủ điều kiện vào 顧客作品マスタ mà không cần tới rule 2 hay không.
 * @param {{judged: boolean, isNg: boolean}} work - 1 phần tử từ buildCustomerWorkRows()
 * @returns {boolean}
 */
function isWorkEligible(work) {
  return work.judged === true && work.isNg !== true;
}

/**
 * Lọc danh sách work theo rule 1 + rule 2, đồng thời gán dòng master tương ứng
 * cho từng work được giữ.
 * @param {Array<object>} works - Kết quả buildCustomerWorkRows() (TOÀN BỘ tác phẩm CMS)
 * @param {Array<object>} existingRecords - Kết quả readCustomerWorkMaster() (dòng đang có trên sheet)
 * @returns {{
 */
function filterAndMatchWorks(works, existingRecords) {
  var index = buildMasterMatchIndex(existingRecords);
  // Map dùng chính OBJECT work làm khoá (identity) — không dùng titleId/titleName
  // làm khoá vì cả 2 đều có thể trùng giữa các work khác nhau.
  var matchByWork = new Map();
  var excludedNg = [];
  var excludedUnjudged = [];

  // ---- Phase A: tác phẩm hợp lệ chiếm dòng trước ----
  works.forEach(function (work) {
    if (!isWorkEligible(work)) return;
    // Ghi cả khi null: null = "được vào master nhưng là dòng mới".
    matchByWork.set(work, claimMatch(index, work));
  });

  // ---- Phase B: NG/未判定 chỉ giữ được nếu còn dòng chưa bị chiếm (rule 2) ----
  works.forEach(function (work) {
    if (isWorkEligible(work)) return;
    var match = claimMatch(index, work);
    if (match !== null) {
      matchByWork.set(work, match);
      return;
    }
    if (work.isNg) excludedNg.push(work);
    else excludedUnjudged.push(work);
  });

  // ---- Dựng lại theo đúng thứ tự CMS ----
  var matches = [];
  works.forEach(function (work) {
    if (!matchByWork.has(work)) return;
    var match = matchByWork.get(work);
    matches.push({
      record: work,
      existing: match ? match.existing : null,
      rowOffset: match ? match.rowOffset : null,
      tier: match ? match.tier : 0,
      ambiguous: match ? match.ambiguous : false,
      candidateTitleNos: match ? match.candidateTitleNos : [],
    });
  });

  return {
    matches: matches,
    orphanOffsets: collectOrphanOffsets(index),
    excludedNg: excludedNg,
    excludedUnjudged: excludedUnjudged,
  };
}

// ============================================================
// KHỚP DÒNG MASTER THEO CASCADE 3 TẦNG (spec §5)
//

/** Khoá tầng 1: ID + tên, ngăn cách bằng ký tự NUL (U+0000). */
function masterMatchKeyBoth(record) {
  return normalizeJapaneseText(record.titleId) + '\u0000' + normalizeJapaneseText(record.titleName);
}

function masterMatchKeyId(record) {
  return normalizeJapaneseText(record.titleId);
}

function masterMatchKeyName(record) {
  return normalizeJapaneseText(record.titleName);
}

function pushMatchCandidate(map, key, offset) {
  if (key === '') return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(offset);
}

/**
 * Build index tra cứu cho cascade, từ danh sách dòng ĐANG CÓ trên 顧客作品マスタ
 * (kết quả readCustomerWorkMaster()).
 * @param {Array<object>} existingRecords - Mỗi phần tử cần có titleNo/titleId/titleName
 * @returns {{
 */
function buildMasterMatchIndex(existingRecords) {
  var index = {
    records: existingRecords,
    byIdAndName: new Map(),
    byNumericId: new Map(),
    byName: new Map(),
    claimed: {},
  };
  existingRecords.forEach(function (record, offset) {
    var nameKey = masterMatchKeyName(record);
    if (nameKey === '') return;
    pushMatchCandidate(index.byIdAndName, masterMatchKeyBoth(record), offset);
    if (isDigits(record.titleId)) pushMatchCandidate(index.byNumericId, masterMatchKeyId(record), offset);
    pushMatchCandidate(index.byName, nameKey, offset);
  });
  return index;
}

/**
 * Chọn 1 ứng viên trong danh sách offset của 1 tầng, bỏ qua dòng đã bị chiếm.
 * @param {object} index - Từ buildMasterMatchIndex()
 * @param {Array<number>|undefined|null} offsets
 * @returns {{rowOffset: number, ambiguous: boolean, candidateTitleNos: Array<*>}|null}
 */
function pickMatchCandidate(index, offsets) {
  if (!offsets) return null;
  var available = offsets.filter(function (offset) { return !index.claimed[offset]; });
  if (available.length === 0) return null;
  var chosen = available[0];
  available.forEach(function (offset) {
    if ((Number(index.records[offset].titleNo) || 0) < (Number(index.records[chosen].titleNo) || 0)) chosen = offset;
  });
  return {
    rowOffset: chosen,
    ambiguous: available.length > 1,
    candidateTitleNos: available.map(function (offset) { return index.records[offset].titleNo; }),
  };
}

/**
 * Tìm dòng master ứng với 1 record, theo cascade 3 tầng, DỪNG NGAY ở tầng đầu
 * tiên có ứng viên chưa bị chiếm. KHÔNG chiếm dòng (peek) — dùng claimMatch()
 * nếu muốn chiếm.
 * @param {object} index - Từ buildMasterMatchIndex()
 * @param {{titleId: *, titleName: *}} record
 * @returns {{tier: number, rowOffset: number, existing: object, ambiguous: boolean, candidateTitleNos: Array<*>}|null}
 */
function matchExistingRow(index, record) {
  var tiers = [
    { tier: 1, offsets: index.byIdAndName.get(masterMatchKeyBoth(record)) },
    // Tầng 2 CHỈ áp dụng khi CẢ HAI bên là số thật — vế master đã được lọc lúc
    // build index (chỉ dòng isDigits mới vào byNumericId), vế record lọc ở đây.
    { tier: 2, offsets: isDigits(record.titleId) ? index.byNumericId.get(masterMatchKeyId(record)) : null },
    { tier: 3, offsets: index.byName.get(masterMatchKeyName(record)) },
  ];
  for (var i = 0; i < tiers.length; i++) {
    var picked = pickMatchCandidate(index, tiers[i].offsets);
    if (picked === null) continue;
    return {
      tier: tiers[i].tier,
      rowOffset: picked.rowOffset,
      existing: index.records[picked.rowOffset],
      ambiguous: picked.ambiguous,
      candidateTitleNos: picked.candidateTitleNos,
    };
  }
  return null;
}

/**
 * matchExistingRow() + chiếm dòng đã khớp, để record sau không khớp vào cùng
 * dòng đó (spec §5.3).
 * @param {object} index
 * @param {object} record
 * @returns {object|null} Cùng dạng trả về của matchExistingRow()
 */
function claimMatch(index, record) {
  var match = matchExistingRow(index, record);
  if (match !== null) index.claimed[match.rowOffset] = true;
  return match;
}

/**
 * Danh sách offset các dòng master mà KHÔNG record nào chiếm trong lần chạy này
 * — cảnh báo 孤立行 (spec §6). Nguyên nhân thường gặp: tác phẩm đổi tên (dòng cũ
 * mồ côi, dòng mới được thêm), hoặc tác phẩm bị gỡ khỏi 先行タイトル của CMS.
 * GAS❶ KHÔNG xoá dòng nào (`削除等はしない`) nên chỉ báo, không hành động.
 * @param {object} index - Sau khi đã claimMatch() cho toàn bộ record
 * @returns {Array<number>} offset (0-based trong existingRecords)
 */
function collectOrphanOffsets(index) {
  var orphans = [];
  index.records.forEach(function (record, offset) {
    if (!index.claimed[offset]) orphans.push(offset);
  });
  return orphans;
}

/**
 * Bản theo-match của resolveNumbers(): gán タイトルNo cho từng match, dùng lại số
 * cũ nếu đã khớp dòng master, cấp số mới (tiếp sau max hiện có) nếu là dòng mới.
 * @param {Array<{record: object, existing: object|null}>} matches
 * @param {Array<object>} existingRecords - Để tính max số hiện có
 * @param {string} numberField - vd 'titleNo'
 * @returns {Array<object>} Mảng match MỚI, match.record là bản copy đã có numberField
 */
function resolveNumbersFromMatches(matches, existingRecords, numberField) {
  var maxNumber = 0;
  existingRecords.forEach(function (record) {
    var num = Number(record[numberField]) || 0;
    if (num > maxNumber) maxNumber = num;
  });

  var nextNumber = maxNumber;
  return matches.map(function (match) {
    var copy = Object.assign({}, match.record);
    var reused = match.existing ? Number(match.existing[numberField]) || 0 : 0;
    if (reused > 0) {
      copy[numberField] = reused;
    } else {
      nextNumber += 1;
      copy[numberField] = nextNumber;
    }
    return Object.assign({}, match, { record: copy });
  });
}

/**
 * Bản theo-match của diffUpsert(): phân loại thêm mới / cần update / không đổi.
 *
 * Nhận BẢNG CỘT chứ không phải một isEqualFn rời: chế độ ghi của mỗi cột đã quyết
 * định hàm so sánh của nó (xem compareFor trong engine), nên một danh sách so sánh
 * viết tay ở đây chỉ là chỗ thứ hai để lệch.
 *
 * @param {Array<{record: object, existing: object|null, rowOffset: number|null}>} matches
 * @param {Array<object>} columns - Bảng cột của master đang xử lý
 */
function diffUpsertFromMatches(matches, columns) {
  var toUpdate = [];
  var toAdd = [];
  var unchangedKeys = [];

  matches.forEach(function (match) {
    var key = String(match.record.titleNo);
    if (!match.existing) {
      toAdd.push(match.record);
      return;
    }
    if (recordsEqual(match.existing, match.record, columns)) {
      unchangedKeys.push(key);
      return;
    }
    toUpdate.push({
      key: key,
      record: match.record,
      previous: match.existing,
      rowOffset: match.rowOffset,
      sheetRow: match.existing.sheetRow,
    });
  });

  return { toUpdate: toUpdate, toAdd: toAdd, unchangedKeys: unchangedKeys };
}

// ==============================================================================
// PHẦN 3 — DIFF/UPSERT THEO KHOÁ ĐƠN (dùng cho コピーライトマスタ)
// コピーライトマスタ vẫn khoá theo タイトルNo đơn giản nên dùng 2 hàm

/**
 * So sánh existingRecords (đang có trên sheet output, đọc lúc ĐẦU lần chạy)
 * với newRecords (vừa build lại từ nguồn, PHẢI đã được resolveNumbers() gán
 * số trước khi gọi hàm này) theo keyFn, để biết dòng nào cần update, dòng nào
 * cần thêm mới, dòng nào giữ nguyên không đổi.
 * @param {Array<object>} existingRecords - Dữ liệu đang có trên sheet output (đọc trước khi build mới)
 * @param {Array<object>} newRecords - Dữ liệu vừa build lại từ nguồn cho lần chạy này
 * @param {function(object): string} keyFn - Hàm lấy khoá định danh 1 record
 * @param {function(object, object): boolean} isEqualFn - So sánh (existing, incoming)
 * @returns {{
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
      // sheetRow: số dòng thật 1-based, do readCopyrightMaster()/
      // readCustomerWorkMaster() gắn vào existing record. Cấp thẳng ở đây để
      // đường ghi không phải tự tính từ rowOffset — công thức đó ngầm giả định
      toUpdate.push({ key: key, record: record, previous: existing, sheetRow: existing.sheetRow });
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
 * @param {Array<object>} existingRecords - Dữ liệu đang có trên sheet, mỗi phần tử có sẵn numberField
 * @param {Array<object>} newRecords - Dữ liệu vừa build, CHƯA có numberField
 * @param {function(object): string} keyFn - Hàm lấy khoá định danh (PHẢI cùng
 * @param {string} numberField - Tên field số thứ tự cần gán (vd 'titleNo')
 * @returns {Array<object>} Bản sao (shallow copy) của newRecords, mỗi phần tử
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

// ==============================================================================
// PHẦN 4 — CẢNH BÁO (GAS1警告) VÀ AUDIT TỪNG FIELD (GAS1変更詳細)

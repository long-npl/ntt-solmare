// master.js — NGHIỆP VỤ 顧客作品マスタ: build -> LỌC -> khoá upsert -> cảnh báo
//
// Đây là file chứa toàn bộ quyết định nghiệp vụ của GAS❶, và là nơi tập trung
// những thay đổi lớn nhất của bản 2026-08-03. Bốn phần, theo đúng thứ tự chạy:
//
//   1. BUILD    — gắn phán định レギュレーション + cờ judged/isNg cho mỗi tác phẩm CMS
//   2. LỌC + KHỚP DÒNG — quyết định tác phẩm nào vào master VÀ nó ứng với dòng nào
//                        (cascade 3 tầng + chiếm-một-lần), làm CÙNG MỘT LƯỢT
//   3. DIFF     — phân loại thêm mới / cần update / không đổi + cấp タイトルNo
//   4. CẢNH BÁO — dựng dòng cho tab GAS1警告 + diff từng field cho GAS1変更詳細
//
// Toàn bộ là hàm PURE (không đụng SpreadsheetApp) — đó là điều kiện để test được
// bằng Node. Mọi logic nghiệp vụ mới PHẢI nằm ở đây chứ không nằm trong main.js,
// vì logic trong main.js là logic không thể kiểm chứng.

// ==============================================================================
// PHẦN 1 — BUILD: gắn phán định cho từng tác phẩm CMS
// ==============================================================================

/**
 * Build mảng "work" (1 phần tử = 1 tác phẩm CMS) bằng cách lấy CMS làm nền tảng
 * rồi join thêm phán định レギュレーション theo タイトル名.
 *
 * - cmsRecords quyết định DANH SÁCH tác phẩm nào tồn tại.
 * - regulationLookup cấp 3 cột ①広告出稿ポリシー / ②一般面出稿NG /
 *   ③シーモアロゴ判定 + cờ isNg, tra theo `normalizeJapaneseText(タイトル名)`, so
 *   完全一致 (spec §4.1). KHÔNG còn tra theo CMSID/タイトルID.
 *
 * CHUẨN HOÁ CHỈ ĐỂ SO KHỚP (spec §4.4): khoá tra cứu là tên đã chuẩn hoá, nhưng
 * `titleName` trả về là NGUYÊN VĂN CỦA CMS, và policy/general/logoJudgement là
 * NGUYÊN VĂN CỦA レギュレーション. Hệ quả cần biết: cột タイトル名 trên master theo
 * cách viết của CMS, nên đối chiếu mắt thường giữa master và レギュレーション vẫn
 * sẽ thấy chênh nhau ở vài ký tự vô hình (〜 vs ～, ngoặc nửa/toàn rộng) — đó là
 * đúng thiết kế, không phải lỗi.
 *
 * 2 CỜ QUYẾT ĐỊNH SỐ PHẬN CỦA TÁC PHẨM (spec §3.3):
 *   judged=false (未判定) -> chưa ai chấm xong, phải CHỜ, không được vào master
 *   judged=true && isNg   -> đã chấm và bị chặn, không được vào master
 *   judged=true && !isNg  -> được vào master
 * Riêng tác phẩm ĐÃ CÓ trên master thì được giữ lại bất kể 2 cờ này (rule 2) —
 * xem master.js.
 *
 * KHÔNG gán 2 cột bản quyền / titleNo / suspensionDate ở đây — main.js gắn
 * thêm sau (xem runGas1()).
 *
 * @param {Array<object>} cmsRecords - Kết quả sources.js: parseCmsRows()
 * @param {Map<string, {policy: string, general: string, logoJudgement: string, isNg: boolean}>} regulationLookup
 *   Kết quả sources.js: buildRegulationLookup()
 * @returns {Array<{
 *   cmsId: *, titleId: *, titleName: string, author: string, genre: string,
 *   publisher: string, label: string, preStart: *, preEnd: *, copyrightU: *,
 *   policy: string, general: string, logoJudgement: string,
 *   judged: boolean, isNg: boolean
 * }>} Thứ tự giữ nguyên theo cmsRecords đầu vào (quan trọng: thứ tự này quyết
 *   định thứ tự cấp タイトルNo cho tác phẩm mới).
 */
function buildCustomerWorkRows(cmsRecords, regulationLookup) {
  return cmsRecords.map(function (cms) {
    var regulation = regulationLookup.get(normalizeJapaneseText(cms.titleName));
    var judged = regulation !== undefined;
    return {
      cmsId: cms.cmsId,
      titleId: cms.titleId,
      titleName: cms.titleName,
      author: cms.author,
      genre: cms.genre,
      publisher: cms.publisher,
      label: cms.label,
      preStart: cms.preStart,
      preEnd: cms.preEnd,
      // copyrightU: cột コピーライト của CMS. main.js copy nguyên văn sang
      // work.individualCopyright (cột J của コピーライトマスタ) — không qua map nào.
      copyrightU: cms.copyrightU,
      // 3 cột dưới đây là NGUYÊN VĂN của レギュレーション, ghi vào cột F/G/H.
      // Để '' (không phải undefined) khi 未判定, để khớp với giá trị mà Google
      // Sheets trả về khi đọc lại ô trống — sameValue() vốn đã coi 2 thứ đó
      // bằng nhau, nhưng '' làm ý định rõ ràng hơn ngay tại đây.
      policy: judged ? regulation.policy : '',
      general: judged ? regulation.general : '',
      logoJudgement: judged ? regulation.logoJudgement : '',
      judged: judged,
      isNg: judged ? regulation.isNg : false,
    };
  });
}


// ==============================================================================
// PHẦN 2 — LỌC + KHỚP DÒNG MASTER (một lượt, 2 phase)
// ==============================================================================

/**
 * Tác phẩm này có đủ điều kiện vào 顧客作品マスタ mà không cần tới rule 2 hay không.
 *
 * @param {{judged: boolean, isNg: boolean}} work - 1 phần tử từ buildCustomerWorkRows()
 * @returns {boolean}
 */
function isWorkEligible(work) {
  return work.judged === true && work.isNg !== true;
}

/**
 * Lọc danh sách work theo rule 1 + rule 2, đồng thời gán dòng master tương ứng
 * cho từng work được giữ.
 *
 * @param {Array<object>} works - Kết quả buildCustomerWorkRows() (TOÀN BỘ tác phẩm CMS)
 * @param {Array<object>} existingRecords - Kết quả readCustomerWorkMaster() (dòng đang có trên sheet)
 * @returns {{
 *   matches: Array<{record: object, existing: object|null, rowOffset: number|null,
 *                   tier: number, ambiguous: boolean, candidateTitleNos: Array<*>}>,
 *   orphanOffsets: Array<number>,
 *   excludedNg: Array<object>,
 *   excludedUnjudged: Array<object>
 * }}
 *   matches: tác phẩm ĐƯỢC vào master, giữ ĐÚNG THỨ TỰ CMS (thứ tự này quyết định
 *     thứ tự cấp タイトルNo cho dòng mới). tier=0 nghĩa là dòng mới hoàn toàn
 *     (không khớp tầng nào).
 *   orphanOffsets: dòng master không record nào chiếm -> cảnh báo 孤立行 (§6).
 *   excludedNg/excludedUnjudged: để đếm 除外_NG件数 / 除外_未判定件数 (§6).
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
// Bối cảnh: khoá upsert của 顧客作品マスタ trước đây là CMSID. Từ 2026-08-03,
// CMSID bị loại khỏi mọi logic (vẫn ghi ra cột C để tra ngược) — và khi đó
// KHÔNG CÒN TRƯỜNG NÀO BẤT BIẾN. Đo trên 1.730 dòng thật vào master:
//
//   Chỉ タイトルID          : phân biệt 1.625/1.730, 108 dòng (6,2%) SẼ ĐỔI GIÁ TRỊ
//   Chỉ タイトル名          : phân biệt 1.727/1.730, 2 dòng (0,1%) sẽ đổi
//   Ghép ID + tên làm 1 khoá: phân biệt 1.729/1.730 nhưng 110 dòng đổi khoá
//
// "Đổi giá trị khoá" = sinh dòng trùng, vì GAS quét MỖI NGÀY nên '' -> 347590 là
// một thay đổi thật sẽ xảy ra. Cascade giải quyết bằng cách thử 3 tầng theo thứ
// tự và DỪNG ở tầng đầu tiên có kết quả:
//
//   Tầng 1: normalize(タイトルID) VÀ normalize(タイトル名) đều khớp  -> bình thường
//   Tầng 2: タイトルID khớp VÀ cả hai bên đều là SỐ THẬT            -> bắt ca đổi TÊN
//   Tầng 3: タイトル名 khớp                                        -> bắt ca ID trống/chữ -> số
//
// Mô phỏng 4 lần chạy liên tiếp trên dữ liệu thật (spec §5.4): lần 2 và lần 4 ra
// 0 thêm mới / 0 update, tức cascade ổn định, không sinh dòng trùng.
// ============================================================

/**
 * Khoá tầng 1: ID + tên, ngăn cách bằng ký tự NUL (U+0000).
 *
 * Dùng NUL chứ không dùng '|' hay khoảng trắng: ô タイトルID thật có chứa cả câu
 * ('4415行目と同一', '※既に配信済みのためCMS削除'), nên mọi ký tự "bình thường"
 * đều có thể xuất hiện trong dữ liệu và làm khoá nhập nhằng (titleId='1 2' +
 * name='x' so với titleId='1' + name='2 x').
 */
function masterMatchKeyBoth(record) {
  return normalizeJapaneseText(record.titleId) + '\u0000' + normalizeJapaneseText(record.titleName);
}

/** Khoá tầng 2: chỉ ID. */
function masterMatchKeyId(record) {
  return normalizeJapaneseText(record.titleId);
}

/** Khoá tầng 3: chỉ tên. */
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
 *
 * Mỗi khoá trỏ tới MỘT MẢNG offset (không phải 1 offset duy nhất) — bắt buộc, vì
 * dữ liệu thật có 4 dòng nguy hiểm (3 dòng trùng タイトル名 với dòng khác, 1 dòng
 * trùng タイトルID số, spec §6). Nếu map chỉ giữ 1 offset thì dòng ghi sau âm
 * thầm che dòng ghi trước và không có cách nào phát cảnh báo 照合曖昧.
 *
 * `claimed` là trạng thái MUTABLE dùng chung cho cả lần chạy: mỗi dòng master
 * chỉ được 1 record chiếm (spec §5.3). Vì vậy index này KHÔNG dùng lại được cho
 * lần match thứ hai — muốn match lại từ đầu thì build index mới.
 *
 * Dòng master không có タイトル名 bị bỏ qua hoàn toàn (không là ứng viên của tầng
 * nào) — trên dữ liệu thật không có dòng nào như vậy, nhưng nếu có thì đó là
 * dòng rác và không nên được record nào khớp vào.
 *
 * @param {Array<object>} existingRecords - Mỗi phần tử cần có titleNo/titleId/titleName
 * @returns {{
 *   records: Array<object>,
 *   byIdAndName: Map<string, Array<number>>,
 *   byNumericId: Map<string, Array<number>>,
 *   byName: Map<string, Array<number>>,
 *   claimed: Object
 * }}
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
 *
 * Chọn DETERMINISTIC (dòng có タイトルNo nhỏ nhất) thay vì "dòng đầu tiên trong
 * mảng": thứ tự mảng phụ thuộc thứ tự đọc sheet, còn タイトルNo là thứ tự cấp số
 * ổn định — nhờ vậy 2 lần chạy trên cùng dữ liệu luôn cho cùng kết quả, kể cả
 * khi có dòng nhập nhằng.
 *
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
 *
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
 *
 * Không có ràng buộc này thì 2 record dùng chung một タイトルID — thật sự tồn
 * tại: 冬すぎて桜 và 冬すぎて桜【タテヨミ】 cùng タイトルID 266030 — sẽ cùng ghi vào
 * một dòng ở tầng 2 và MẤT MỘT RECORD trong im lặng.
 *
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
 *
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
 *
 * Khác resolveNumbers() cũ ở chỗ KHÔNG cần keyFn — quan hệ record <-> dòng master
 * đã được cascade quyết định xong ở bước trước, hàm này chỉ đọc lại match.existing.
 *
 * Dòng master đã khớp nhưng có タイトルNo trống/0 sẽ được cấp số MỚI — đó là dòng
 * dữ liệu lỗi (mọi dòng do GAS ghi đều có số), cấp số là hành động sửa chữa hợp
 * lý nhất mà không phải xoá gì.
 *
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
 * Khác diffUpsert() cũ ở 2 điểm:
 *   1. Không dùng keyFn — quan hệ với dòng cũ lấy từ match.existing.
 *   2. Item toUpdate mang sẵn rowOffset + sheetRow, nên KHÔNG cần
 *      attachRowOffsets() nữa (main.js không phải tra ngược khoá -> vị trí).
 *
 * `sheetRow` (số dòng thật 1-based trên sheet) do readCustomerWorkMaster() gắn
 * vào existing record. Dùng nó thay vì tính rowOffset + 2 như code cũ, vì công
 * thức đó ngầm giả định header ở hàng 1 VÀ không có dòng trống xen giữa — cả 2
 * giả định đều sai với ガワ mới (header hàng 15).
 *
 * @param {Array<{record: object, existing: object|null, rowOffset: number|null}>} matches
 *   PHẢI đã đi qua resolveNumbersFromMatches() (record cần có titleNo)
 * @param {function(object, object): boolean} isEqualFn - (existing, incoming) -> true nếu coi là không đổi
 * @returns {{
 *   toUpdate: Array<{key: string, record: object, previous: object, rowOffset: number, sheetRow: number}>,
 *   toAdd: Array<object>,
 *   unchangedKeys: Array<string>
 * }}
 */
function diffUpsertFromMatches(matches, isEqualFn) {
  var toUpdate = [];
  var toAdd = [];
  var unchangedKeys = [];

  matches.forEach(function (match) {
    var key = String(match.record.titleNo);
    if (!match.existing) {
      toAdd.push(match.record);
      return;
    }
    if (isEqualFn(match.existing, match.record)) {
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
// nguyên gốc này, KHÔNG đi qua cascade — giữ nguyên để giảm bề mặt
// rủi ro của lần thay đổi 2026-08-03.
// ==============================================================================

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
 *   toUpdate: dòng đã tồn tại nhưng có thay đổi — mang sẵn `sheetRow` (số dòng
 *     thật trên sheet) nên đường ghi dùng được trực tiếp, không cần bước gắn
 *     thêm nào. `previous` là bản ghi CŨ (từ existingRecords) tương ứng — giữ lại để
 *     master.js so sánh field-by-field, phục vụ log audit chi
 *     tiết (xem buildChangeDetailRows() và io/io.js: appendChangeDetailRows()).
 *   toAdd: dòng có key CHƯA từng xuất hiện trong existingRecords — sẽ được
 *     append vào cuối sheet (xem io.js: writeCustomerWorkMaster()/writeCopyrightMaster())
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
      // sheetRow: số dòng thật 1-based, do readCopyrightMaster()/
      // readCustomerWorkMaster() gắn vào existing record. Cấp thẳng ở đây để
      // đường ghi không phải tự tính từ rowOffset — công thức đó ngầm giả định
      // header ở hàng 1 và không có dòng trống xen giữa, cả 2 đều sai với ガワ mới.
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

// ==============================================================================
// PHẦN 4 — CẢNH BÁO (GAS1警告) VÀ AUDIT TỪNG FIELD (GAS1変更詳細)
// ==============================================================================

var WARNING_KIND_MATCH = '照合注意';
var WARNING_KIND_AMBIGUOUS = '照合曖昧';
var WARNING_KIND_ORPHAN = '孤立行';
var WARNING_KIND_NG_TITLE = '外部出稿NG注意';
var WARNING_KIND_SUSPENSION = '掲載停止注意';
var WARNING_KIND_COPYRIGHT = 'コピーライト注意';

/**
 * Dựng 1 dòng cảnh báo theo đúng thứ tự cột của tab GAS1警告.
 *
 * Ép undefined/null thành '' để không ghi chuỗi "undefined" vào ô.
 */
function warningRow(runAt, kind, titleNo, titleId, titleName, detail) {
  return {
    runAt: runAt,
    kind: kind,
    titleNo: titleNo === undefined || titleNo === null ? '' : titleNo,
    titleId: titleId === undefined || titleId === null ? '' : titleId,
    titleName: titleName === undefined || titleName === null ? '' : titleName,
    detail: detail,
  };
}

/**
 * 照合注意 + 照合曖昧 — 2 cảnh báo phát sinh từ chính cơ chế cascade.
 *
 * 照合注意 (khớp ở TẦNG 2 hoặc 3): một trong hai trường định danh vừa đổi giá
 * trị. KHÔNG phải lỗi (mô phỏng §5.4 lần 3 có 110 ca hợp lệ) nhưng phải nhìn
 * thấy được — vì đây cũng chính là hình dạng của một ca khớp SAI: nếu dòng master
 * láng giềng trùng tên/trùng ID, tầng 2/3 có thể bắt sang đúng nó.
 *
 * 照合曖昧 (ở tầng thắng có >1 dòng ứng viên chưa bị chiếm): cảnh báo THẬT. GAS
 * chọn dòng có タイトルNo nhỏ nhất rồi báo, để người kiểm — không tự quyết định
 * im lặng, cũng không dừng cả lần chạy vì một dòng nhập nhằng.
 *
 * @param {Array<object>} matches - filterAndMatchWorks().matches, ĐÃ qua
 *   resolveNumbersFromMatches() (cần record.titleNo để cảnh báo trỏ được về dòng)
 * @param {Date} runAt - Dùng chung 1 giá trị cho cả lần chạy
 * @returns {Array<object>} Dòng cảnh báo
 */
function buildMatchWarningRows(matches, runAt) {
  var rows = [];
  matches.forEach(function (match) {
    if (!match.existing) return;
    if (match.tier === 2) {
      rows.push(warningRow(runAt, WARNING_KIND_MATCH, match.record.titleNo, match.record.titleId, match.record.titleName,
        'タイトルID 一致・タイトル名 変更: 「' + match.existing.titleName + '」→「' + match.record.titleName + '」'));
    } else if (match.tier === 3) {
      rows.push(warningRow(runAt, WARNING_KIND_MATCH, match.record.titleNo, match.record.titleId, match.record.titleName,
        'タイトル名 一致・タイトルID 変更: 「' + match.existing.titleId + '」→「' + match.record.titleId + '」'));
    }
    if (match.ambiguous) {
      rows.push(warningRow(runAt, WARNING_KIND_AMBIGUOUS, match.record.titleNo, match.record.titleId, match.record.titleName,
        '第' + match.tier + '層で候補が複数（タイトルNo: ' + match.candidateTitleNos.join(', ')
        + '）→ 最小のタイトルNoを採用。要確認'));
    }
  });
  return rows;
}

/**
 * 孤立行 — dòng master mà KHÔNG record nào chiếm trong lần chạy này.
 *
 * Nguyên nhân thường gặp: tác phẩm đổi tên (dòng cũ mồ côi, dòng mới được thêm),
 * hoặc tác phẩm bị gỡ khỏi 先行タイトル của CMS. GAS❶ không có nhánh xoá
 * (`削除等はしない`) nên chỉ báo.
 *
 * @param {Array<object>} existingRecords - readCustomerWorkMaster()
 * @param {Array<number>} orphanOffsets - filterAndMatchWorks().orphanOffsets
 * @param {Date} runAt
 * @returns {Array<object>}
 */
function buildOrphanWarningRows(existingRecords, orphanOffsets, runAt) {
  return orphanOffsets.map(function (offset) {
    var record = existingRecords[offset];
    return warningRow(runAt, WARNING_KIND_ORPHAN, record.titleNo, record.titleId, record.titleName,
      'この行に対応する CMS 先行タイトルが今回の実行で見つかりませんでした（改名/取り下げの可能性）。行は削除していません');
  });
}

/**
 * 外部出稿NG注意 — thay cho cột 備考 đã bị bỏ khỏi ガワ (spec §10a).
 *
 * ガワ mới không còn cột nào chứa nội dung 備考 của nguồn 外部出稿用NGタイトル. Đo
 * mức ảnh hưởng thật: 671 dòng trong sheet đó nhưng chỉ **10 tác phẩm CMS** thật
 * sự nhận được 備考 — phần lớn dòng NG không có タイトルID vì chúng là quy tắc theo
 * NXB/theo điều kiện ('すべての作品', 'ロゴ判定リストで、シーモアロゴ「×」になって
 * いるタイトル'), không trỏ tới tác phẩm cụ thể nào.
 *
 * Phần lớn 10 nội dung đó trùng ý nghĩa với 2 cột F/G mới (đây có lẽ là lý do
 * 池永 bỏ cột 備考 — phán định đã được cấu trúc hoá). NHƯNG không trùng hết: vài
 * dòng là thông tin DỪNG PHÂN PHỐI ('作家様都合で配信停止', '2025/2/8（土）～：
 * 出版社都合により配信停止') mà F/G không diễn đạt được — nên vẫn phải báo, không
 * được để mất im lặng.
 *
 * Tra CẢ 2 khoá mà buildNgTitleLookup() sinh ra: theo titleId (dòng NG có ID) và
 * theo tên đã chuẩn hoá (dòng NG chỉ có tên). Bỏ qua khi 備考 rỗng.
 *
 * @param {Array<object>} records - Tác phẩm ĐƯỢC vào master (đã có titleNo)
 * @param {Map<string, string>} ngTitleLookup - sources.js: buildNgTitleLookup()
 * @param {Date} runAt
 * @returns {Array<object>}
 */
function buildNgTitleWarningRows(records, ngTitleLookup, runAt) {
  var rows = [];
  records.forEach(function (record) {
    var remark = ngTitleLookup.get(String(record.titleId));
    if (!remark) remark = ngTitleLookup.get(normalizeJapaneseText(record.titleName));
    if (!remark) return;
    rows.push(warningRow(runAt, WARNING_KIND_NG_TITLE, record.titleNo, record.titleId, record.titleName,
      '外部出稿用NGタイトルの備考: ' + remark));
  });
  return rows;
}

/**
 * コピーライト注意 — GOM THEO 出版社(+レーベル)+lý do, không phải 1 dòng/1 tác phẩm.
 *
 * VÌ SAO GOM: cột 出版社コピーライト được tính lại MỖI LẦN CHẠY (khác cột 掲載停止日付
 * ghi-một-lần), nên cảnh báo cũng lặp lại mỗi lần chạy. Đo trên dữ liệu thật:
 * 427 tác phẩm không sinh được -> 854 dòng/ngày với 2 lần chạy. Số đó sẽ nhấn chìm
 * 4 loại cảnh báo còn lại trong tab GAS1警告, nhất là 照合曖昧 — loại duy nhất cần
 * người xem NGAY. Gom lại còn 78 dòng/lần chạy (156/ngày).
 *
 * Gom mà KHÔNG mất thông tin, vì việc cần làm luôn ở mức NXB chứ không ở mức tác
 * phẩm: thêm 1 dòng quy tắc cho NXB đó là 99 tác phẩm được sửa cùng lúc. Mỗi dòng
 * cảnh báo mang: số tác phẩm bị ảnh hưởng, lý do, và tối đa 3 tên tác phẩm làm ví
 * dụ để tra cứu.
 *
 * `titleNo`/`titleId` để trống vì dòng cảnh báo giờ nói về 1 NXB, không về 1 dòng
 * master cụ thể — điền số của 1 tác phẩm đại diện sẽ khiến người đọc tưởng chỉ tác
 * phẩm đó bị.
 *
 * @param {Array<{record: object, copyrightReason: string, copyrightDetail: string}>} entries
 * @param {Date} runAt
 * @returns {Array<object>}
 */
function buildCopyrightWarningRows(entries, runAt) {
  var groups = new Map();
  entries.forEach(function (entry) {
    var key = normalizeJapaneseText(entry.record.publisher) + ' '
      + normalizeJapaneseText(entry.record.label) + ' ' + entry.copyrightReason;
    if (!groups.has(key)) {
      groups.set(key, {
        publisher: entry.record.publisher,
        label: entry.record.label,
        reason: entry.copyrightReason,
        detail: entry.copyrightDetail,
        titleNames: [],
        count: 0,
      });
    }
    var group = groups.get(key);
    group.count += 1;
    if (group.titleNames.length < 3) group.titleNames.push(entry.record.titleName);
  });

  var rows = [];
  groups.forEach(function (group) {
    var labelPart = normalizeJapaneseText(group.label) === '' ? '' : '／' + String(group.label);
    rows.push(warningRow(runAt, WARNING_KIND_COPYRIGHT, '', '',
      String(group.publisher) + labelPart,
      '出版社コピーライト未生成 ' + group.count + ' 件 [' + group.reason + '] ' + group.detail
      + ' 例: ' + group.titleNames.join(' / ')));
  });
  return rows;
}

/**
 * 掲載停止注意 — 2 tình huống của nguồn TSV cột I (multi_title_yyyyMMdd.tsv).
 *
 * 1. Không tìm thấy file nào trong folder: cột I được để nguyên (đúng theo quy
 *    tắc ghi-một-lần), nhưng phải báo — nếu file ngừng được xuất ra mà không ai
 *    biết, cột I sẽ âm thầm đứng yên vĩnh viễn.
 * 2. Nhiều tác phẩm dùng chung một タイトルID có ngày dừng: cả nhóm sẽ nhận CÙNG
 *    một ngày. Có thể đúng (2 phiên bản của cùng tác phẩm cùng dừng), có thể sai
 *    — con người phải xem.
 *
 * KHÔNG cảnh báo cho tác phẩm có タイトルID trống/không phải số (khoảng 6% dòng
 * master): chúng không bao giờ tra ra được ngày dừng, nhưng cảnh báo ~104 dòng
 * mỗi lần chạy sẽ nhấn chìm các loại cảnh báo còn lại. Con số này đã được ghi
 * trong spec §12 và trong JSDoc của sources.js.
 *
 * @param {Array<object>} records - Tác phẩm được vào master (đã có titleNo)
 * @param {Map<string, string>} suspensionLookup - buildSuspensionLookup(), Map rỗng nếu không có file
 * @param {string|null} suspensionFileName - Tên file đã dùng, null nếu không tìm thấy file nào
 * @param {Date} runAt
 * @param {string|null} [errorMessage] - Nội dung lỗi nếu bước đọc nguồn này THẤT BẠI
 *   (chưa cấp quyền Drive, CONFIG chưa điền tên cột, folder mất quyền...). main.js
 *   bắt lỗi đó rồi chạy tiếp thay vì để nó chặn cả lần chạy — nhưng lỗi PHẢI hiện
 *   ra ở đây, nếu không thì đúng là nuốt lỗi.
 * @returns {Array<object>}
 */
function buildSuspensionWarningRows(records, suspensionLookup, suspensionFileName, runAt, errorMessage) {
  var rows = [];
  if (errorMessage) {
    rows.push(warningRow(runAt, WARNING_KIND_SUSPENSION, '', '', '',
      '掲載停止日付の取得に失敗 → I列は今回据え置き（処理は継続）: ' + errorMessage));
  } else if (!suspensionFileName) {
    rows.push(warningRow(runAt, WARNING_KIND_SUSPENSION, '', '', '',
      'multi_title_yyyyMMdd.tsv が見つかりませんでした → 掲載停止日付(I列)は今回据え置き'));
  }

  var byTitleId = new Map();
  records.forEach(function (record) {
    if (!isDigits(record.titleId)) return;
    var key = normalizeJapaneseText(record.titleId);
    if (!suspensionLookup.has(key)) return;
    if (!byTitleId.has(key)) byTitleId.set(key, []);
    byTitleId.get(key).push(record);
  });
  byTitleId.forEach(function (group, key) {
    if (group.length < 2) return;
    var names = group.map(function (record) { return record.titleName; }).join(' / ');
    group.forEach(function (record) {
      rows.push(warningRow(runAt, WARNING_KIND_SUSPENSION, record.titleNo, record.titleId, record.titleName,
        'タイトルID ' + key + ' を ' + group.length + ' 作品が共有 → 同じ掲載停止日付「'
        + suspensionLookup.get(key) + '」が入ります: ' + names));
    });
  });
  return rows;
}


/**
 * Với mỗi item trong toUpdateItems, so sánh previous[field.key] và
 * record[field.key] cho TỪNG field trong fieldDefs — chỉ tạo 1 dòng log cho
 * field THỰC SỰ thay đổi (previous/record giống hệt nhau thì bỏ qua field
 * đó, không phải cả item). 1 tác phẩm đổi 2 field sẽ tạo ra 2 dòng log riêng
 * (không gộp chung 1 dòng nhiều field), để mỗi dòng log là 1 sự kiện đơn giản,
 * dễ lọc/tìm kiếm sau này trên sheet.
 *
 * So sánh bằng sameValue() (common.js/master.js), KHÔNG dùng `===` trực tiếp —
 * cùng lý do với customerIsEqualFn/copyrightIsEqualFn (main.js): oldValue đọc
 * từ sheet có thể là `''`, còn newValue vừa tính lại có thể là `undefined`,
 * dù cả 2 đều là "không có gì". Nếu dùng `===`, 1 tác phẩm dù CHỈ đổi đúng 1
 * field thật cũng sẽ bị log thêm các field khác "trống -> trống" một cách
 * sai lệch (đã kiểm chứng qua dữ liệu thật: 备考/③シーモアロゴ判定 chiếm ~97%
 * số dòng log, toàn bộ đều trống cả 2 phía).
 *
 * @param {string} masterLabel - Tên master để phân biệt khi 2 master cùng ghi
 *   chung 1 sheet log chi tiết (vd '顧客作品マスタ' hoặc 'コピーライトマスタ')
 * @param {Array<{key: string, record: object, previous: object}>} toUpdateItems
 *   Từ diffUpsert().toUpdate
 * @param {Array<{key: string, label: string, compare?: function(*, *): boolean}>} fieldDefs
 *   Danh sách field cần theo dõi thay đổi: key = tên property trên
 *   record/previous, label = tên hiển thị trong log (thường trùng tên cột trên
 *   sheet, vd '③シーモアロゴ判定').
 *   compare (TUỲ CHỌN): hàm so sánh riêng cho field đó, mặc định sameValue().
 *   - Field NGÀY (先行開始日/先行終了日) truyền sameDateValue(): String(Date) chứa
 *     cả giờ + timezone, nên 2 spreadsheet khác timezone sẽ cho ra "đã đổi" ở
 *     MỌI lần chạy cho cùng một ngày lịch — log sẽ đầy dòng vô nghĩa.
 *   - Cột GHI MỘT LẦN (掲載停止日付) truyền sameWriteOnceValue(): chỉ log đúng lần
 *     GAS thật sự điền vào ô đang trống.
 * @param {Date} runAt - Thời điểm chạy (dùng chung 1 giá trị cho cả lần chạy,
 *   truyền vào thay vì tự gọi `new Date()` ở đây để tất cả dòng log cùng 1
 *   lần chạy có cùng 1 timestamp, dễ nhóm lại khi xem log)
 * @returns {Array<{
 *   runAt: Date, master: string, titleNo: *, titleName: string,
 *   field: string, oldValue: *, newValue: *
 * }>}
 */
function buildChangeDetailRows(masterLabel, toUpdateItems, fieldDefs, runAt) {
  var rows = [];
  toUpdateItems.forEach(function (item) {
    fieldDefs.forEach(function (fieldDef) {
      var oldValue = item.previous[fieldDef.key];
      var newValue = item.record[fieldDef.key];
      var isEqual = fieldDef.compare || sameValue;
      if (isEqual(oldValue, newValue)) return;
      rows.push({
        runAt: runAt,
        master: masterLabel,
        titleNo: item.record.titleNo,
        titleName: item.record.titleName,
        field: fieldDef.label,
        oldValue: oldValue,
        newValue: newValue,
      });
    });
  });
  return rows;
}

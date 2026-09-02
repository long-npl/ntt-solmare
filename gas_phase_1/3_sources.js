// 3_sources.js — 8 nguồn đọc vào của GAS❶.
//
// Mỗi nguồn: một parser đọc sheet thô, một builder dựng Map tra cứu, và (nếu cần)
// một lookup trả về giá trị cho một tác phẩm. Không nguồn nào biết nó cấp cột nào —
// việc đó do bảng cột ở 4_customer_master.js khai báo.
//
// Nguồn nào BẮT BUỘC / nguồn nào PHỤ nằm ở bảng SOURCES cuối file.

// ==============================================================================
// NGUỒN 1 — 作品レギュレーション判定 (bộ lọc + cột ①②③)
// ==============================================================================

//
// VAI TRÒ (đã đổi 2026-08-03, xem spec §2): trước đây nguồn này chỉ cấp thêm 1
// cột (③シーモアロゴ判定) cho tác phẩm đã có trong CMS. Bây giờ nó là BỘ LỌC

// CHỈ gồm những tên cột KHỚP TOÀN BỘ và ổn định — 2 cột ①/② có hậu tố ghi chú
// trong chính ô header nên được tra riêng bằng colByPrefix() (xem bên dưới).
var REGULATION_REQUIRED_HEADERS = ['ステータス', 'タイトル名', '③シーモアロゴ判定'];

// Cột タイトルID của レギュレーション — tầng 1 và tầng 3 của cascade (xem
// buildRegulationIndex). KHÔNG nằm trong REGULATION_REQUIRED_HEADERS: mất cột này
// thì cascade tự rút về đúng hành vi cũ (chỉ tra theo tên) chứ không làm sập cả lần
var REGULATION_TITLE_ID_HEADERS = ['タイトルＩＤ', 'タイトルID'];

/**
 * Vị trí cột タイトルID trên レギュレーション, hoặc undefined nếu sheet không có.
 * @param {Map<string, number>} headerIndex
 * @returns {number|undefined}
 */
function resolveRegulationTitleIdColumn(headerIndex) {
  for (var i = 0; i < REGULATION_TITLE_ID_HEADERS.length; i++) {
    var index = tryCol(headerIndex, REGULATION_TITLE_ID_HEADERS[i]);
    if (index !== undefined) return index;
  }
  return undefined;
}

var REGULATION_STATUS_OK = '判定済み';

// Prefix của 2 cột có ghi chú kèm trong ô header:
//   '①広告出稿ポリシー\n（出稿NG）'
//   '②一般面出稿NG\n（アダルト作品扱い）'
var REGULATION_POLICY_PREFIX = '①広告出稿ポリシー';
var REGULATION_GENERAL_PREFIX = '②一般面出稿NG';

// Định nghĩa NG — nguyên văn yêu cầu nghiệp vụ (spec §3.1/§3.2):
//   ①広告出稿ポリシー「問題あり」or ②一般面出稿NG「アダルト作品扱い」「アダルトジャンル」
//
var REGULATION_NG_POLICY_VALUE = '問題あり';
var REGULATION_NG_GENERAL_VALUES = ['アダルト作品扱い', 'アダルトジャンル'];

// 3 cột phán định mà レギュレーション sở hữu, cùng tên field trên record. MỘT nguồn
// duy nhất cho cả 3 nơi phải nhất quán với nhau: đường GHI (customerRecordToRow),
// đường SO DIFF (customerIsEqualFn) và log audit (buildChangeDetailRows).
var REGULATION_VERDICT_FIELDS = [
  { key: 'policy', header: '①広告出稿ポリシー' },
  { key: 'general', header: '②一般面出稿NG' },
  { key: 'logoJudgement', header: '③シーモアロゴ判定' },
];

/**
 * Đọc + lọc dữ liệu thô của sheet 作品レギュレーション判定.
 * @param {Array<Array<*>>} rawRows - Kết quả sheet.getDataRange().getValues() của sheet シート1
 * @returns {Array<{titleName: string, policy: string, general: string, logoJudgement: string}>}
 */
function parseRegulation(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, REGULATION_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colStatus = col(idx, 'ステータス');
  var colTitleName = col(idx, 'タイトル名');
  var colPolicy = colByPrefix(idx, REGULATION_POLICY_PREFIX);
  var colGeneral = colByPrefix(idx, REGULATION_GENERAL_PREFIX);
  var colLogo = col(idx, '③シーモアロゴ判定');
  var colTitleId = resolveRegulationTitleIdColumn(idx);

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[colStatus]) !== REGULATION_STATUS_OK) continue;
    records.push({
      titleName: row[colTitleName],
      // '' (không phải undefined) khi sheet không có cột ID — buildRegulationIndex()
      // bỏ qua giá trị không phải số nên 2 tầng dùng ID tự tắt, không cần cờ riêng.
      titleId: colTitleId === undefined ? '' : row[colTitleId],
      policy: row[colPolicy],
      general: row[colGeneral],
      logoJudgement: row[colLogo],
    });
  }
  return records;
}

/**
 * Tác phẩm này có bị coi là NG (không được đưa vào 顧客作品マスタ) hay không —
 * spec §3.2:
 * @param {{policy: *, general: *}} record - 1 phần tử từ parseRegulation()
 * @returns {boolean}
 */
function isRegulationNg(record) {
  if (normalizeJapaneseText(record.policy) === normalizeJapaneseText(REGULATION_NG_POLICY_VALUE)) return true;
  var general = normalizeJapaneseText(record.general);
  for (var i = 0; i < REGULATION_NG_GENERAL_VALUES.length; i++) {
    if (general === normalizeJapaneseText(REGULATION_NG_GENERAL_VALUES[i])) return true;
  }
  return false;
}

/**
 * Build 3 bảng tra của nguồn này — CASCADE 3 TẦNG (2026-09-01):
 * @param {Array<object>} records - Kết quả từ parseRegulation()
 * @returns {{byBoth: Map, byName: Map, byId: Map}} Giá trị trong map là NGUYÊN VĂN
 */
function buildRegulationIndex(records) {
  function build(keyOf) {
    var lookup = new Map();
    records.forEach(function (record) {
      var key = keyOf(record);
      if (key === null) return;
      var incoming = {
        policy: record.policy,
        general: record.general,
        logoJudgement: record.logoJudgement,
        isNg: isRegulationNg(record),
      };
      var current = lookup.get(key);
      if (current === undefined || (incoming.isNg && !current.isNg)) lookup.set(key, incoming);
    });
    return lookup;
  }
  return {
    byBoth: build(regulationKeyBoth),
    byName: build(regulationKeyName),
    byId: build(regulationKeyId),
  };
}

function regulationKeyBoth(record) {
  var name = regulationKeyName(record);
  var id = regulationKeyId(record);
  return name === null || id === null ? null : name + '\u0000' + id;
}

function regulationKeyName(record) {
  var name = normalizeJapaneseText(record.titleName);
  return name === '' ? null : name;
}

function regulationKeyId(record) {
  return isDigits(record.titleId) ? normalizeJapaneseText(record.titleId) : null;
}

/**
 * Tra phán định レギュレーション cho 1 tác phẩm, theo cascade 3 tầng, DỪNG ở tầng
 * đầu tiên khớp.
 * @param {{titleId: *, titleName: *}} work
 * @param {{byBoth: Map, byName: Map, byId: Map}} index - Kết quả buildRegulationIndex()
 * @returns {{policy: *, general: *, logoJudgement: *, isNg: boolean, tier: number}|null}
 */
function lookupRegulation(work, index) {
  var name = regulationKeyName(work);
  var id = regulationKeyId(work);
  var tiers = [
    { tier: 1, hit: name !== null && id !== null ? index.byBoth.get(name + '\u0000' + id) : undefined },
    { tier: 2, hit: name !== null ? index.byName.get(name) : undefined },
    { tier: 3, hit: id !== null ? index.byId.get(id) : undefined },
  ];
  for (var i = 0; i < tiers.length; i++) {
    if (tiers[i].hit === undefined) continue;
    return {
      policy: tiers[i].hit.policy,
      general: tiers[i].hit.general,
      logoJudgement: tiers[i].hit.logoJudgement,
      isNg: tiers[i].hit.isNg,
      tier: tiers[i].tier,
    };
  }
  return null;
}

// ==============================================================================
// NGUỒN 2 — 先行タイトル情報(CMS) (danh sách tác phẩm)
// ==============================================================================

//
// Vai trò trong toàn bộ luồng: đây là nguồn NỀN TẢNG (基幹データ) của
// 顧客作品マスタ — mỗi dòng trong sheet ★列追加の場合は増渕まで★ ứng với 1 tác

var CMS_REQUIRED_HEADERS = [
  'CMSID', 'タイトルID', 'タイトル名', '巻数', '作家名', 'ジャンル', 'レーベル名',
  '出版社', '先行開始日', '先行終了日', 'コピーライト',
];

/**
 * Đọc dữ liệu thô của sheet 先行タイトル情報(CMS), bỏ qua dòng trống (không có
 * CMSID — thường là các dòng cuối sheet không có dữ liệu).
 * @param {Array<Array<*>>} rawRows - Kết quả sheet.getDataRange().getValues()
 * @returns {Array<{
 */
function parseCms(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, CMS_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colCmsId = col(idx, 'CMSID');
  var colTitleId = col(idx, 'タイトルID');
  var colTitleName = col(idx, 'タイトル名');
  // 巻数 là đầu vào DUY NHẤT của cột 初回配信巻数 — xem ruleFirstVolume().
  var colVolumes = col(idx, '巻数');
  var colAuthor = col(idx, '作家名');
  var colGenre = col(idx, 'ジャンル');
  var colLabel = col(idx, 'レーベル名');
  var colPublisher = col(idx, '出版社');
  var colPreStart = col(idx, '先行開始日');
  var colPreEnd = col(idx, '先行終了日');
  var colCopyright = col(idx, 'コピーライト');

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    // Lọc theo タイトル名 (KHÔNG phải CMSID): xem comment đầu file + spec §5.5.
    // Dùng normalizeJapaneseText() để ô chỉ chứa khoảng trắng (kể cả khoảng
    // trắng full-width '　') cũng được coi là trống.
    if (!row || normalizeJapaneseText(row[colTitleName]) === '') continue;
    records.push({
      cmsId: row[colCmsId],
      titleId: row[colTitleId],
      titleName: row[colTitleName],
      volumes: row[colVolumes],
      author: row[colAuthor],
      genre: row[colGenre],
      label: row[colLabel],
      publisher: row[colPublisher],
      preStart: row[colPreStart],
      preEnd: row[colPreEnd],
      copyrightU: row[colCopyright],
    });
  }
  return records;
}

// buildCmsCopyrightLookup() ĐÃ BỊ XOÁ (2026-08-03, spec §9.1).
//
// Nó build 1 Map từ chính cmsRecords rồi để bước resolve bản quyền tra lại bằng

// ==============================================================================
// NGUỒN 3 — 外部出稿用NGタイトル (nguồn cảnh báo)
// ==============================================================================

// (nằm trong file 出版社からの追記ルールと外部出稿NGタイトル)
//
// Vai trò trong toàn bộ luồng: cung cấp ghi chú "cấm xuất bản ngoài" cho từng

var NG_REQUIRED_HEADERS = ['出版社', 'タイトルID', 'タイトル名', '備考'];

/**
 * Đọc dữ liệu thô của sheet 外部出稿用NGタイトル.
 * @param {Array<Array<*>>} rawRows - Kết quả sheet.getDataRange().getValues()
 * @returns {Array<{titleId: *, titleName: string, remark: string}>}
 */
function parseNgTitles(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, NG_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colTitleId = col(idx, 'タイトルID');
  var colTitleName = col(idx, 'タイトル名');
  var colRemark = col(idx, '備考');

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || (!row[colTitleId] && !row[colTitleName])) continue;
    records.push({
      titleId: row[colTitleId],
      titleName: row[colTitleName],
      remark: row[colRemark],
    });
  }
  return records;
}

/**
 * Build bảng tra "khoá tác phẩm" -> nội dung 備考 cảnh báo.
 * @param {Array<object>} records - Kết quả từ parseNgTitles()
 * @returns {Map<string, string>} Map key (titleId hoặc titleName) -> remark
 */
function buildNgTitleLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    var key = record.titleId ? String(record.titleId) : normalizeJapaneseText(record.titleName);
    if (!key) return;
    lookup.set(key, record.remark);
  });
  return lookup;
}

// ==============================================================================
// NGUỒN 4 — multi_title_yyyyMMdd.tsv (掲載停止日付)
// ==============================================================================

// 掲載停止日付 (cột I của 顧客作品マスタ).
//
// Hàm PURE — nhận mảng 2 chiều đã đọc sẵn (io/io.js: readTsvRows()).

/**
 * Parse nội dung TSV thành danh sách bản ghi thô, định vị cột theo CHỮ CÁI CỘT.
 * @param {Array<Array<string>>} rawRows - Kết quả io.js: readTsvRows()
 * @param {string} titleIdColumn - Chữ cái cột chứa タイトルID (CONFIG...titleIdColumn, vd 'A')
 * @param {string} suspensionDateColumn - Chữ cái cột chứa ngày dừng (vd 'D')
 * @returns {Array<{titleId: *, suspensionDate: *}>} Mọi dòng của file, KHÔNG lọc —
 * @throws {Error} Nếu chữ cái cột trong CONFIG không hợp lệ
 */
function parseSuspension(rawRows, titleIdColumn, suspensionDateColumn) {
  var colTitleId = columnLetterToIndex(titleIdColumn);
  var colDate = columnLetterToIndex(suspensionDateColumn);

  var records = [];
  for (var i = 0; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    records.push({
      titleId: row[colTitleId],
      suspensionDate: row[colDate],
    });
  }
  return records;
}

/**
 * Build bảng tra normalize(タイトルID) -> 掲載停止日付 (nguyên văn).
 * @param {Array<object>} records - Kết quả parseSuspension()
 * @returns {Map<string, *>}
 */
function buildSuspensionLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    if (!isDigits(record.titleId)) return;
    if (normalizeJapaneseText(record.suspensionDate) === '') return;
    var key = normalizeJapaneseText(record.titleId);
    if (!lookup.has(key)) lookup.set(key, record.suspensionDate);
  });
  return lookup;
}

/**
 * Tra 掲載停止日付 cho 1 tác phẩm theo タイトルID.
 * @param {{titleId: *}} work
 * @param {Map<string, *>} suspensionLookup - Kết quả buildSuspensionLookup()
 * @returns {*} Ngày dừng nguyên văn, hoặc '' nếu không tra ra
 */
function lookupSuspensionDate(work, suspensionLookup) {
  if (!isDigits(work.titleId)) return '';
  var value = suspensionLookup.get(normalizeJapaneseText(work.titleId));
  return value === undefined ? '' : value;
}

// ==============================================================================
// NGUỒN 5 — 【先行作品】独占期間の延長（代理店共有）
//           -> cột R 先行終了日（延長）, và từ đó suy ra cột S 先行終了日（最終確定）

// QUY TẮC NGHIỆP VỤ (user cung cấp 2026-08-07), nguyên văn:
//
//   ▼R列「先行終了日(延長)」: データ取得元のG∼M列に記載のある期日のみを記載

var PRE_END_EXTENSION_ID_HEADERS = ['タイトルID', 'タイトル'];

// 2 tên cột đủ để dò ra HÀNG chứa 1回目〜7回目 (hàng 3 trên dữ liệu thật). Chỉ cần 2
// cột đầu là vì hàng đó không có tên cột nào khác trùng với hàng header thật (hàng 1).
var PRE_END_EXTENSION_ROUND_HEADERS = ['1回目', '2回目'];

// Tên cột của MỘT lần gia hạn: '1回目', '2回目', ... Dùng regex thay vì danh sách cố
// định 1〜7 để 8回目 (khi 安蒜 thêm) tự được nhận — xem comment CONFIG.
var PRE_END_EXTENSION_ROUND_PATTERN = /^(\d+)回目$/;

/**
 * Parse sheet 【先行作品】独占期間の延長 thành danh sách {titleId, titleName, rounds}.
 * @param {Array<Array<*>>} rawRows - getDataRange().getValues() của sheet Sheet1
 * @returns {Array<{titleId: *, titleName: *, rounds: Array<{roundName: string, value: *}>}>}
 * @throws {Error} Nếu thiếu cột タイトルID/タイトル hoặc không tìm được hàng 1回目/2回目
 */
function parsePreEndExtension(rawRows) {
  var idResolved = resolveHeaderIndex(rawRows, PRE_END_EXTENSION_ID_HEADERS);
  var colTitleId = col(idResolved.headerIndex, 'タイトルID');
  var colTitleName = col(idResolved.headerIndex, 'タイトル');

  // findHeaderRowIndex() tự throw khi không thấy; bọc lại chỉ để thông báo nói rõ ĐANG
  // ĐỌC NGUỒN NÀO và hàng header nào bị mất — lỗi trần chỉ ghi '1回目, 2回目', không đủ
  // để người đọc log biết phải mở sheet nào ra xem.
  var roundRowIndex;
  try {
    roundRowIndex = findHeaderRowIndex(rawRows, PRE_END_EXTENSION_ROUND_HEADERS);
  } catch (notFound) {
    throw new Error('【先行作品】独占期間の延長: không tìm thấy hàng header chứa '
      + PRE_END_EXTENSION_ROUND_HEADERS.join(' / ') + ' (dải cột 延長 → cột R). '
      + 'Sheet đã bị đổi cấu trúc — xem parsePreEndExtension() trong sources.js. '
      + String(notFound));
  }

  // Thu mọi cột '<n>回目' của hàng đó rồi SẮP THEO n (không theo vị trí cột): nếu
  // 安蒜 chèn 8回目 vào giữa thay vì thêm vào cuối, thứ tự nghiệp vụ vẫn đúng.
  var roundColumns = [];
  buildHeaderIndex(rawRows[roundRowIndex]).forEach(function (columnIndex, headerName) {
    var matched = PRE_END_EXTENSION_ROUND_PATTERN.exec(headerName);
    if (!matched) return;
    roundColumns.push({ round: Number(matched[1]), roundName: headerName, columnIndex: columnIndex });
  });
  roundColumns.sort(function (a, b) { return a.round - b.round; });

  var firstDataRow = Math.max(idResolved.headerRowIndex, roundRowIndex) + 1;
  var records = [];
  for (var i = firstDataRow; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[colTitleId]) === '') continue;
    records.push({
      titleId: row[colTitleId],
      titleName: row[colTitleName],
      rounds: roundColumns.map(function (column) {
        return { roundName: column.roundName, value: row[column.columnIndex] };
      }),
    });
  }
  return records;
}

/**
 * Chọn LẦN GIA HẠN CUỐI CÙNG có 期日 trong 1 dòng nguồn — trái tim của quy tắc R列.
 * @param {{rounds: Array<{roundName: string, value: *}>}} record - 1 phần tử của parsePreEndExtension()
 * @returns {{value: *, roundName: string, skipped: Array<{roundName: string, value: *}>}|null}
 */
function resolvePreEndExtension(record) {
  var rounds = record.rounds || [];
  for (var i = rounds.length - 1; i >= 0; i--) {
    if (toDateOrNull(rounds[i].value) === null) continue;
    var skipped = [];
    for (var j = i + 1; j < rounds.length; j++) {
      if (normalizeJapaneseText(rounds[j].value) === '') continue;
      skipped.push({ roundName: rounds[j].roundName, value: rounds[j].value });
    }
    return { value: rounds[i].value, roundName: rounds[i].roundName, skipped: skipped };
  }
  return null;
}

/**
 * Build bảng tra normalize(タイトルID) -> kết quả resolvePreEndExtension().
 * @param {Array<object>} records - Kết quả parsePreEndExtension()
 * @returns {Map<string, {value: *, roundName: string, skipped: Array<object>, titleName: *}>}
 */
function buildPreEndExtensionLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    if (!isDigits(record.titleId)) return;
    var resolved = resolvePreEndExtension(record);
    if (resolved === null) return;
    var key = normalizeJapaneseText(record.titleId);
    if (lookup.has(key)) return;
    lookup.set(key, {
      value: resolved.value,
      roundName: resolved.roundName,
      skipped: resolved.skipped,
      titleName: record.titleName,
    });
  });
  return lookup;
}

/**
 * Tra 先行終了日（延長）(cột R) cho 1 tác phẩm theo タイトルID.
 * @param {{titleId: *}} work
 * @param {Map<string, object>} extensionLookup - Kết quả buildPreEndExtensionLookup()
 * @returns {*} Ngày gia hạn NGUYÊN BẢN, hoặc '' nếu tác phẩm không có trong nguồn
 */
function lookupPreEndExtension(work, extensionLookup) {
  if (!isDigits(work.titleId)) return '';
  var found = extensionLookup.get(normalizeJapaneseText(work.titleId));
  return found === undefined ? '' : found.value;
}

/**
 * Quy tắc cột S 先行終了日（最終確定）— user chốt 2026-08-07: R có ngày thì lấy R,
 * không thì lấy Q.
 * @param {*} preEnd - Cột Q 先行終了日 (từ CMS)
 * @param {*} preEndExtended - Cột R 先行終了日（延長）
 * @returns {*} Giá trị NGUYÊN BẢN của Q hoặc R (không parse, không format lại)
 */
function resolvePreEndFinal(preEnd, preEndExtended) {
  if (normalizeJapaneseText(preEndExtended) !== '') return preEndExtended;
  if (normalizeJapaneseText(preEnd) !== '') return preEnd;
  return '';
}

// ==============================================================================
// NGUỒN 6 — 大量無料希望作品リスト_CA様, sheet ★出稿回答シート
//           -> cột T 大量無料開始日 / cột U 大量無料終了日

// QUY TẮC NGHIỆP VỤ (spec 2026-08-07):
//   H列「キャンペーン開始日」-> T列「大量無料開始日」
//   I列「キャンペーン終了日」-> U列「大量無料終了日」

var MASS_FREE_REQUIRED_HEADERS = ['タイトルID', 'キャンペーン開始日', 'キャンペーン終了日'];

// Tên cột 出稿回答 dùng để LỌC. tryCol() chứ không col(): mất cột này thì mọi dòng
// được tính (hành vi cũ, an toàn) chứ không làm sập cả lần chạy.
var MASS_FREE_ANSWER_HEADER = '出稿回答';

// Các cách viết "không xuất" bị loại. So sau normalizeJapaneseText() nên NFKC đã gộp
// Ｘ/ｘ full-width về X/x; 3 ký hiệu chéo Unicode (✕ U+2715 — ký tự thật đang có trong
// sheet, × U+00D7, ✗ U+2717) thì NFKC KHÔNG gộp nên phải liệt kê từng cái.
var MASS_FREE_REJECT_VALUES = ['✕', '×', '✗', 'X', 'x'];

/**
 * Parse sheet ★出稿回答シート thành danh sách {titleId, titleName, start, end, rejected}.
 * @param {Array<Array<*>>} rawRows - getDataRange().getValues() của sheet ★出稿回答シート
 * @returns {Array<{titleId: *, titleName: *, start: *, end: *, rejected: boolean}>}
 * @throws {Error} Nếu thiếu 1 trong 3 cột bắt buộc
 */
function parseMassFree(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, MASS_FREE_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colTitleId = col(idx, 'タイトルID');
  var colStart = col(idx, 'キャンペーン開始日');
  var colEnd = col(idx, 'キャンペーン終了日');
  // tryCol() trả về undefined (KHÔNG phải null) khi cột chưa tồn tại — xem JSDoc của
  // nó trong common.js. So sai kiểu ở đây sẽ cho colAnswer = undefined rồi
  // row[undefined] = undefined, tức mọi dòng đều được coi là không bị ✕: hỏng bộ lọc
  var colTitleName = tryCol(idx, 'タイトル名');
  var colAnswer = tryCol(idx, MASS_FREE_ANSWER_HEADER);

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[colTitleId]) === '') continue;
    var answer = colAnswer === undefined ? '' : normalizeJapaneseText(row[colAnswer]);
    records.push({
      titleId: row[colTitleId],
      titleName: colTitleName === undefined ? '' : row[colTitleName],
      start: row[colStart],
      end: row[colEnd],
      rejected: MASS_FREE_REJECT_VALUES.indexOf(answer) >= 0,
    });
  }
  return records;
}

/**
 * Build bảng tra normalize(タイトルID) -> {start, end} của TOÀN KỲ 大量無料.
 * @param {Array<object>} records - Kết quả parseMassFree()
 * @returns {Map<string, {start: *, end: *, rowCount: number, rejectedCount: number, titleName: *}>}
 */
function buildMassFreeLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    if (!isDigits(record.titleId)) return;
    var key = normalizeJapaneseText(record.titleId);
    if (!lookup.has(key)) {
      lookup.set(key, {
        start: '', end: '', rowCount: 0, rejectedCount: 0, titleName: record.titleName,
        startDate: null, endDate: null,
      });
    }
    var entry = lookup.get(key);
    if (record.rejected) {
      entry.rejectedCount += 1;
      return;
    }
    entry.rowCount += 1;

    var startDate = toDateOrNull(record.start);
    if (startDate !== null && (entry.startDate === null || startDate.getTime() < entry.startDate.getTime())) {
      entry.startDate = startDate;
      entry.start = record.start;
    }
    var endDate = toDateOrNull(record.end);
    if (endDate !== null && (entry.endDate === null || endDate.getTime() > entry.endDate.getTime())) {
      entry.endDate = endDate;
      entry.end = record.end;
    }
  });

  // Bỏ hẳn ID mà mọi dòng đều bị loại (✕) hoặc không có ô ngày nào dùng được: giữ lại
  // chỉ để cột T/U nhận '' thì không khác gì không có trong map, mà lại làm cảnh báo
  // "ID này được N dòng chia sẻ" đếm cả những ID không ghi ra gì.
  var keysToDrop = [];
  lookup.forEach(function (entry, key) {
    if (normalizeJapaneseText(entry.start) === '' && normalizeJapaneseText(entry.end) === '') {
      keysToDrop.push(key);
    }
  });
  keysToDrop.forEach(function (key) { lookup.delete(key); });
  return lookup;
}

/**
 * Tra cặp 大量無料開始日 / 大量無料終了日 (cột T/U) cho 1 tác phẩm theo タイトルID.
 * @param {{titleId: *}} work
 * @param {Map<string, object>} massFreeLookup - Kết quả buildMassFreeLookup()
 * @returns {{start: *, end: *}} Giá trị nguyên bản, cả 2 là '' nếu không tra ra
 */
function lookupMassFreePeriod(work, massFreeLookup) {
  if (!isDigits(work.titleId)) return { start: '', end: '' };
  var found = massFreeLookup.get(normalizeJapaneseText(work.titleId));
  if (found === undefined) return { start: '', end: '' };
  return { start: found.start, end: found.end };
}

// ==============================================================================
// NGUỒN 7 — 出稿コミット管理表（新作・既存・キャン強化）, sheet 広告出稿必須タイトル
//           -> cột E タイトル区分

// QUY TẮC NGHIỆP VỤ (user chốt 2026-08-13):
//   C列のフラグ × F列のタイトル名 → 先行タイトル情報 と掛け算
//   ┗コミットフラグ: có trong 先行タイトル情報 VÀ C列 = 「2.先行配信（出稿コミット）」

var COMMIT_MANAGEMENT_REQUIRED_HEADERS = ['タイトル区分', 'タイトル名'];

// Giá trị C列 được coi là "có cam kết xuất稿". Mảng (không phải hằng chuỗi) vì đây
// là chỗ 安蒜 nhiều khả năng sẽ nới ra — xem quyết định 2 ở trên.
//
var COMMIT_FLAG_VALUES = ['2.先行配信（出稿コミット）'];

/**
 * Giá trị C列 (ĐÃ qua normalizeJapaneseText) có phải cờ コミット không.
 * @param {string} normalizedCategory - Kết quả normalizeJapaneseText(ô C列)
 * @returns {boolean}
 */
function isCommitFlagValue(normalizedCategory) {
  for (var i = 0; i < COMMIT_FLAG_VALUES.length; i++) {
    if (normalizeJapaneseText(COMMIT_FLAG_VALUES[i]) === normalizedCategory) return true;
  }
  return false;
}

var TITLE_CATEGORY_COMMIT = 'コミット';
var TITLE_CATEGORY_EXCLUSIVE = '独占';

/**
 * Parse sheet 広告出稿必須タイトル thành danh sách {titleCategory, titleId, cmsId, titleName}.
 * @param {Array<Array<*>>} rawRows - getDataRange().getValues() của sheet 広告出稿必須タイトル
 * @returns {Array<{titleCategory: string, titleId: *, cmsId: *, titleName: *}>}
 * @throws {Error} Nếu thiếu cột タイトル区分 hoặc タイトル名
 */
function parseCommit(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, COMMIT_MANAGEMENT_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colCategory = col(idx, 'タイトル区分');
  var colTitleName = col(idx, 'タイトル名');
  // tryCol() trả về undefined (KHÔNG null) khi cột chưa có — xem JSDoc trong common.js.
  var colTitleId = tryCol(idx, 'タイトルID');
  var colCmsId = tryCol(idx, 'CMS ID');

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row) continue;
    if (normalizeJapaneseText(row[colTitleName]) === '') continue;
    records.push({
      titleCategory: row[colCategory],
      titleId: colTitleId === undefined ? '' : row[colTitleId],
      cmsId: colCmsId === undefined ? '' : row[colCmsId],
      titleName: row[colTitleName],
    });
  }
  return records;
}

/**
 * Build bảng tra normalize(タイトル名) -> {committed, rowCount, commitRowCount, categories}.
 * @param {Array<object>} records - Kết quả parseCommit()
 * @returns {Map<string, {committed: boolean, rowCount: number, commitRowCount: number, categories: Array<string>, titleName: *}>}
 */
function buildCommitFlagLookup(records) {
  var lookup = new Map();
  records.forEach(function (record) {
    var key = normalizeJapaneseText(record.titleName);
    if (key === '') return;
    if (!lookup.has(key)) {
      lookup.set(key, {
        committed: false, rowCount: 0, commitRowCount: 0, categories: [], titleName: record.titleName,
      });
    }
    var entry = lookup.get(key);
    entry.rowCount += 1;

    var category = normalizeJapaneseText(record.titleCategory);
    if (category !== '' && entry.categories.indexOf(category) < 0) {
      entry.categories.push(category);
    }
    if (isCommitFlagValue(category)) {
      entry.committed = true;
      entry.commitRowCount += 1;
    }
  });
  return lookup;
}

/**
 * Tra 区分 (cột E) cho 1 tác phẩm theo タイトル名.
 * @param {{titleName: *}} work
 * @param {Map<string, object>} commitFlagLookup - Kết quả buildCommitFlagLookup()
 * @returns {string} TITLE_CATEGORY_COMMIT hoặc TITLE_CATEGORY_EXCLUSIVE
 */
function lookupTitleCategory(work, commitFlagLookup) {
  var found = commitFlagLookup.get(normalizeJapaneseText(work.titleName));
  if (found !== undefined && found.committed === true) return TITLE_CATEGORY_COMMIT;
  return TITLE_CATEGORY_EXCLUSIVE;
}



// ==============================================================================
// BẢNG 8 NGUỒN
// ==============================================================================

/**
 * 8 nguồn của GAS❶.
 *
 * required:false = nguồn PHỤ: đọc không được thì cột lấy từ nó GIỮ NGUYÊN giá trị
 * đang có trên sheet và lần chạy vẫn tiếp tục. Bảng này thay cho 5 khối try/catch
 * chép tay từng nguồn một. Xem docs/decisions.md #sources-01
 */
var SOURCES = [
  { key: 'regulation', required: true, read: function () {
      return buildRegulationIndex(parseRegulation(readSheetValues(
        CONFIG.SOURCES.REGULATION.spreadsheetId, CONFIG.SOURCES.REGULATION.sheetName))); } },

  { key: 'cms', required: true, read: function () {
      return parseCms(readSheetValues(
        CONFIG.SOURCES.CMS.spreadsheetId, CONFIG.SOURCES.CMS.sheetName)); } },

  { key: 'ngTitle', required: false, read: function () {
      return buildNgTitleLookup(parseNgTitles(readSheetValues(
        CONFIG.SOURCES.PUBLISHER_RULES.spreadsheetId,
        CONFIG.SOURCES.PUBLISHER_RULES.sheets.NG_TITLES))); } },

  { key: 'publisherCopyright', required: false, read: function () {
      return buildPublisherCopyrightLookup(parsePublisherCopyrightRules(readSheetValues(
        CONFIG.SOURCES.PUBLISHER_COPYRIGHT.spreadsheetId,
        CONFIG.SOURCES.PUBLISHER_COPYRIGHT.sheetName))); } },

  { key: 'commit', required: false, read: function () {
      return buildCommitFlagLookup(parseCommit(readSheetValues(
        CONFIG.SOURCES.COMMIT_MANAGEMENT.spreadsheetId,
        CONFIG.SOURCES.COMMIT_MANAGEMENT.sheetName))); } },

  { key: 'preEnd', required: false, read: function () {
      return buildPreEndExtensionLookup(parsePreEndExtension(readSheetValues(
        CONFIG.SOURCES.PRE_END_EXTENSION.spreadsheetId,
        CONFIG.SOURCES.PRE_END_EXTENSION.sheetName))); } },

  { key: 'massFree', required: false, read: function () {
      return buildMassFreeLookup(parseMassFree(readSheetValues(
        CONFIG.SOURCES.MASS_FREE.spreadsheetId, CONFIG.SOURCES.MASS_FREE.sheetName))); } },

  // Nguồn duy nhất không phải spreadsheet: file TSV trên Drive. Trả null khi folder
  // không có file nào khớp — đó là trạng thái vô hại vì cột này ghi-một-lần.
  { key: 'suspension', required: false, read: function (startedAt) {
      var found = findLatestSuspensionFile(CONFIG.SOURCES.SUSPENSION, startedAt);
      if (found === null) return null;
      SUSPENSION_FILE_NAME = found.file.getName();
      return buildSuspensionLookup(parseSuspension(
        readTsvRows(found.file, CONFIG.SOURCES.SUSPENSION.encoding),
        CONFIG.SOURCES.SUSPENSION.titleIdColumn,
        CONFIG.SOURCES.SUSPENSION.suspensionDateColumn)); } },
];

// Tên file TSV đã dùng ở lần chạy này — chỉ để đưa vào dòng cảnh báo 掲載停止注意.
var SUSPENSION_FILE_NAME = null;

/**
 * Đọc một danh sách nguồn bất kỳ. Tách khỏi loadSources() để test được mà không
 * cần SpreadsheetApp.
 *
 * @returns {{values: Object, errors: Object}} errors[key] là null khi nguồn đọc được.
 */
function loadSourcesFrom(sources, startedAt) {
  var values = {};
  var errors = {};
  sources.forEach(function (source) {
    errors[source.key] = null;
    if (source.required) {
      values[source.key] = source.read(startedAt);
      return;
    }
    try {
      values[source.key] = source.read(startedAt);
    } catch (failure) {
      values[source.key] = null;
      errors[source.key] = String(failure);
      Logger.log('Nguồn ' + source.key + ': đọc lỗi -> cột liên quan giữ nguyên. ' + String(failure));
    }
  });
  return { values: values, errors: errors };
}

/** Đọc cả 8 nguồn của GAS❶. */
function loadSources(startedAt) {
  return loadSourcesFrom(SOURCES, startedAt);
}


// ==============================================================================
// PHẦN 2 — ĐỌC FILE TSV TRÊN DRIVE
// ==============================================================================

/**
 * Tìm file TSV mới nhất trong folder mà không vượt quá ngày chạy.
 * @param {{folderId: string, filePattern: string}} config - CONFIG.SOURCES.SUSPENSION
 * @param {Date} today - Thời điểm chạy (truyền startedAt của runGas1 vào)
 * @returns {{file: File, dateKey: string}|null} null nếu folder không có file nào khớp
 */
function findLatestSuspensionFile(config, today) {
  var folder = DriveApp.getFolderById(config.folderId);
  var pattern = new RegExp(config.filePattern);
  var todayKey = Utilities.formatDate(today, CONFIG.TRIGGER_TIMEZONE, 'yyyyMMdd');

  var files = folder.getFiles();
  var best = null;
  while (files.hasNext()) {
    var file = files.next();
    var matched = pattern.exec(file.getName());
    if (!matched) continue;
    if (matched[1] > todayKey) continue;
    if (best === null || matched[1] > best.dateKey) best = { file: file, dateKey: matched[1] };
  }
  return best;
}

/**
 * Đọc 1 file TSV thành mảng 2 chiều, cùng dạng với kết quả
 * sheet.getDataRange().getValues() — nhờ vậy các hàm parse trong sources/ dùng
 * được resolveHeaderIndex()/col() y như với dữ liệu đọc từ Sheets.
 * @param {File} file - Từ findLatestSuspensionFile()
 * @param {string} encoding - vd 'UTF-8' hoặc 'Shift_JIS' (CONFIG.SOURCES.SUSPENSION.encoding)
 * @returns {Array<Array<string>>}
 */
function readTsvRows(file, encoding) {
  var text = file.getBlob().getDataAsString(encoding);
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(function (line) { return line !== ''; })
    .map(function (line) { return line.split('\t'); });
}


// 4_customer_master.js — định nghĩa TRỌN VẸN của 顧客作品マスタ.
//
// Đây là file bạn sẽ mở 90% thời gian. Bảng 21 cột ở đầu, 3 hàm quy tắc ngay dưới.
// Thêm một cột = thêm MỘT dòng vào bảng (+ một hàm quy tắc nếu cột đó có logic).
//
// Layout ガワ 0826: cột đệm trống ở đầu, header hàng 15, dữ liệu từ hàng 16. Không có
// chữ cái cột ở đây và không được thêm vào — engine tra theo `header`, nên 池永 chèn
// hay dời cột đều không phải sửa gì. Xem docs/decisions.md #engine-03

// ------------------------------------------------------------------ LP制作

var LP_REQUIRED = '必要';
var LP_NOT_REQUIRED = '不要';

// So theo TIỀN TỐ chứ không liệt kê cứng: dữ liệu thật còn có TLコミック, BLコミック,
// TL（R18）— liệt kê 4 giá trị thì 9 tác phẩm đó im lặng không được đánh dấu.
// So sau normalizeJapaneseText() + toUpperCase() nên ＴＬ và tl đều bắt được.
var LP_GENRE_PREFIXES = ['TL', 'BL'];

var LOGO_NONE = 'ロゴなし';
var LOGO_PRESENT = 'ロゴあり';

/**
 * LP制作 — xét ジャンル TRƯỚC, ロゴ判定 chỉ xét cho phần còn lại.
 *
 * Thứ tự là một phần của quy tắc, không phải chi tiết cài đặt: 2 điều kiện đầu của
 * spec mâu thuẫn nhau ở ca「ジャンル=TL VÀ ロゴあり」và user đã chốt ジャンル thắng.
 *
 * Đọc ③ CÓ HIỆU LỰC — phán định mới nếu có, không thì giá trị đang có trên sheet.
 * Ô ③ được GIỮ khi 未判定, nên hai thứ đó khác nhau, và đọc nhầm bản của lần chạy
 * làm 13 dòng hiện ロゴあり mà cột này trống vĩnh viễn. Xem docs/decisions.md #lp-01
 *
 * @returns {string} '必要' | '不要' | '' (chưa phán định được -> engine giữ nguyên ô)
 */
function ruleLpProduction(record, existing) {
  var genre = normalizeJapaneseText(record.genre).toUpperCase();
  for (var i = 0; i < LP_GENRE_PREFIXES.length; i++) {
    if (genre.indexOf(LP_GENRE_PREFIXES[i]) === 0) return LP_REQUIRED;
  }
  var logo = normalizeJapaneseText(record.logoJudgement) !== ''
    ? record.logoJudgement
    : (existing ? existing.logoJudgement : '');
  var normalized = normalizeJapaneseText(logo);
  if (normalized === LOGO_NONE) return LP_REQUIRED;
  if (normalized === LOGO_PRESENT) return LP_NOT_REQUIRED;
  return '';
}

// ------------------------------------------------------------------ 初回配信巻数

var FIRST_VOLUME_CONFIRM = '顧客確認';

// Chỉ cần ~ ASCII: normalizeJapaneseText() đã gộp ~ / ～ / 〜 và số full-width về dạng
// này. Bắt đúng mặt chữ ∼ của rule thì 1.792 dòng rơi hết xuống 顧客確認.
// Xem docs/decisions.md #volume-01
var FIRST_VOLUME_RANGE = /^(\d+)~(\d+)$/;

/**
 * 初回配信巻数 — 1 giữ nguyên, 〇〇~XX lấy XX, mọi thứ khác là 顧客確認.
 *
 * Nhánh cuối cố tình vét cạn: số khác 1, chữ, giá trị có đuôi (1~5(全話一挙配信)),
 * ô trống, và cả ô đã bị Google Sheets nuốt thành NGÀY vì người gõ 1-5.
 * Xem docs/decisions.md #volume-02
 */
function ruleFirstVolume(record) {
  var value = normalizeJapaneseText(record.volumes);
  if (value === '1') return '1';
  var range = FIRST_VOLUME_RANGE.exec(value);
  if (range !== null) return range[2];
  return FIRST_VOLUME_CONFIRM;
}

// ------------------------------------------------------------------ 先行終了日（最終確定）

/** 先行終了日（最終確定）— ngày gia hạn nếu có, ngược lại ngày kết thúc gốc. */
function rulePreEndFinal(record) {
  if (normalizeJapaneseText(record.preEndExtended) !== '') return record.preEndExtended;
  if (normalizeJapaneseText(record.preEnd) !== '') return record.preEnd;
  return '';
}

// ==============================================================================
// BẢNG 21 CỘT
// ==============================================================================

/**
 * 顧客作品マスタ — mỗi cột một dòng.
 *
 * `write` quyết định LUÔN hàm so sánh (xem compareFor trong engine), nên không có
 * cách nào để chế độ ghi và phép so diff lệch nhau.
 *   上書 = ghi đè vô điều kiện, kể cả ghi rỗng
 *   条件 = có giá trị thì đè, rỗng thì giữ nguyên ô
 *   1回  = ô đã có chữ thì không bao giờ đụng
 * `keep:true` = nguồn phụ đọc lỗi thì lấy lại giá trị đang có trên sheet, KHÔNG coi
 * là rỗng — coi là rỗng sẽ xoá dữ liệu của hàng nghìn dòng vì một lần mất quyền.
 *
 * Ngoặc trong '先行終了日（延長）' là ngoặc FULL-WIDTH đúng như trên sheet:
 * normalizeHeaderText() chỉ bỏ khoảng trắng/xuống dòng, KHÔNG làm NFKC.
 */
var CUSTOMER_COLUMNS = [
  { header: 'タイトルNo', field: 'titleNo', from: 'self', write: '上書' },
  { header: 'CMS ID', field: 'cmsId', from: 'cms', write: '上書' },
  { header: 'タイトルID', field: 'titleId', from: 'cms', write: '上書' },
  { header: 'タイトル区分', field: 'titleCategory', from: 'lookup:commit', write: '上書', keep: true },
  { header: '①広告出稿ポリシー', field: 'policy', from: 'regulation', write: '条件' },
  { header: '②一般面出稿NG', field: 'general', from: 'regulation', write: '条件' },
  { header: '③シーモアロゴ判定', field: 'logoJudgement', from: 'regulation', write: '条件' },
  { header: '掲載停止日付', field: 'suspensionDate', from: 'lookup:suspension', write: '1回' },
  { header: 'LP制作', field: 'lpProduction', from: 'derive', rule: ruleLpProduction, write: '条件' },
  { header: 'タイトル名', field: 'titleName', from: 'cms', write: '上書' },
  { header: '初回配信巻数', field: 'firstVolume', from: 'derive', rule: ruleFirstVolume, write: '上書' },
  { header: '作家名', field: 'author', from: 'cms', write: '上書' },
  { header: 'ジャンル', field: 'genre', from: 'cms', write: '上書' },
  { header: '出版社', field: 'publisher', from: 'cms', write: '上書' },
  { header: 'レーベル名', field: 'label', from: 'cms', write: '上書' },
  { header: '先行開始日', field: 'preStart', from: 'cms', write: '上書', type: 'date' },
  { header: '先行終了日', field: 'preEnd', from: 'cms', write: '上書', type: 'date' },
  { header: '先行終了日（延長）', field: 'preEndExtended', from: 'lookup:preEnd', write: '上書', type: 'date', keep: true },
  { header: '先行終了日（最終確定）', field: 'preEndFinal', from: 'derive', rule: rulePreEndFinal, write: '上書', type: 'date' },
  { header: '大量無料開始日', field: 'massFreeStart', from: 'lookup:massFree', write: '上書', type: 'date', keep: true },
  { header: '大量無料終了日', field: 'massFreeEnd', from: 'lookup:massFree', write: '上書', type: 'date', keep: true },
];

/**
 * Dựng 1 record từ 1 dòng CMS + phán định レギュレーション.
 *
 * CHỈ điền cột 'cms' và 'regulation'. Cột 'derive' và 'lookup:' cần biết dòng master
 * tương ứng nên phải đợi tới applyRules(), sau bước khớp dòng.
 *
 * 3 cột phán định để '' khi 未判定 — engine hiểu '' là "giữ nguyên ô" nhờ write:'条件'.
 * judged/isNg quyết định số phận tác phẩm, xem filterAndMatchWorks().
 */
function buildCustomerRecord(cms, loaded) {
  var regulation = lookupRegulation(cms, loaded.values.regulation);
  var judged = regulation !== null;
  return {
    cmsId: cms.cmsId,
    titleId: cms.titleId,
    titleName: cms.titleName,
    volumes: cms.volumes,
    author: cms.author,
    genre: cms.genre,
    publisher: cms.publisher,
    label: cms.label,
    preStart: cms.preStart,
    preEnd: cms.preEnd,
    // Cột コピーライト của CMS. main.js copy nguyên văn sang コピーライトマスタ.
    copyrightU: cms.copyrightU,
    policy: judged ? regulation.policy : '',
    general: judged ? regulation.general : '',
    logoJudgement: judged ? regulation.logoJudgement : '',
    judged: judged,
    isNg: judged ? regulation.isNg : false,
    // Tầng nào của cascade đã khớp — chỉ để đọc log, không tham gia phán định nào.
    regulationTier: judged ? regulation.tier : null,
  };
}

/** Điền các cột lấy thẳng từ lookup (không phải derive, không phải cms/regulation). */
function applyLookups(matches, loaded) {
  matches.forEach(function (match) {
    var work = match.record;
    work.titleCategory = lookupTitleCategory(work, loaded.values.commit || new Map());
    work.suspensionDate = lookupSuspensionDate(work, loaded.values.suspension || new Map());
    work.preEndExtended = lookupPreEndExtension(work, loaded.values.preEnd || new Map());
    var massFree = lookupMassFreePeriod(work, loaded.values.massFree || new Map());
    work.massFreeStart = massFree.start;
    work.massFreeEnd = massFree.end;
  });
}

// 5_media.js — 6 cot 掲出可能媒体 (AB~AG): cong ① roi loc ②.
//
// Rule ガワ bo sung 2026-09-16 — xem docs/3-master-cot-nguon-va-logic.md §4.13:
//   1. 媒体×ADFMTマスタ › F 横断配信ステータス  -> media nao dang 配信中 (tang CHUNG)
//   2. 媒体除外マスタ (ロゴ有無 × ジャンル)      -> loai theo TUNG tac pham
//   3. Qua ca 2 -> 〇, rot 1 trong 2 -> ×
//
// Day la file DUY NHAT biet 2 master do. 4_title_master.js chi khai bao 6 cot (kem
// `mediaSources`), 3_sources.js chi parse, 9_main.js chi noi day.
//
// TAT CA ham o day la THUAN — khong goi API Google nao.

// Mat chu GHI ra sheet. Phai dung y 見本: 〇 = U+3007 (KHONG phai ○ U+25CB), × = U+00D7.
var MEDIA_YES = '〇';
var MEDIA_NO = '×';

// Mat chu doc VAO tu cot 横断配信ステータス. Nguon that ghi '⚪︎' = U+26AA + U+FE0E
// (variation selector), con nguoi khac go '○'/'◯'/'〇'/'◎' — normalizeJapaneseText()
// la NFKC, ma NFKC KHONG gop ho ky tu vong tron nay. Nen phai liet ke thang.
var MEDIA_DISTRIBUTING_MARKS = '⚪◯○〇◎';

// 2 gia tri DUY NHAT duoc coi la "da phan dinh ロゴ". Khac 2 cai nay (rong, 未判定,
// mot cach viet moi) = CHUA BIET -> khong phan dinh, khong bia (§4.5 nhanh 4).
var MEDIA_LOGO_WITH = 'ロゴあり';
var MEDIA_LOGO_WITHOUT = 'ロゴなし';

/**
 * Khoá so khớp TÊN MEDIA giữa 2 master và tên cột của タイトルマスタ.
 *
 * NFKC lo phan ngoac full-width (`GDN（CM）` -> `GDN(CM)`), con toUpperCase() lo phan
 * hoa/thuong (`Tiktok` vs `TikTok` — NFKC KHONG gop hai cai nay).
 * @param {*} value
 * @returns {string}
 */
function mediaNameKey(value) {
  return normalizeJapaneseText(value).toUpperCase();
}

/**
 * Ô `横断配信ステータス` (hoặc bất kỳ ô nào dùng dấu tròn) có nghĩa "đang chạy" không.
 * @param {*} value
 * @returns {boolean}
 */
function isDistributingMark(value) {
  // Bỏ variation selector TRƯỚC khi so: '⚪︎' là 2 code point, còn danh sách trên là
  // các ký tự ĐƠN. So cả chuỗi 2 ký tự sẽ luôn trượt.
  var text = normalizeJapaneseText(value).replace(/[︎️]/g, '');
  if (text.length !== 1) return false;
  return MEDIA_DISTRIBUTING_MARKS.indexOf(text) >= 0;
}

/** `-` (mọi mặt chữ) hoặc ô trống ở 媒体除外マスタ = wildcard: trục đó không xét. */
function isMediaWildcard(value) {
  var text = normalizeJapaneseText(value);
  return text === '' || /^[-‐-―−ー]$/.test(text);
}

/** Khoá so khớp `ロゴ有無`: master viết kanji `ロゴ無し`, nguồn viết hiragana `ロゴなし`. */
function mediaLogoKey(value) {
  return normalizeJapaneseText(value).replace(/無し/g, 'なし').replace(/有り/g, 'あり');
}

/** Khoá so khớp `ジャンル` — so bằng TIỀN TỐ sau NFKC + toUpperCase, đúng §4.5. */
function mediaGenreKey(value) {
  return normalizeJapaneseText(value).toUpperCase();
}

/** 6 cột `掲出可能媒体` của bảng cột. Đọc lúc CHẠY, không phải lúc nạp file (thứ tự file). */
function mediaColumns() {
  return TITLE_COLUMNS.filter(function (column) { return column.from === 'media'; });
}

/**
 * Gộp 2 master thành thứ mà mediaValuesFor() cần, kèm mọi điều đáng cảnh báo.
 *
 * @param {{adfmtRecords: Array<{mediaName: *, crossStatus: *}>,
 *          exclusionRecords: Array<{logo: *, genre: *, excludedMedia: *}>}} options
 * @returns {{active: object, mixedMedia: Array<string>, unknownMedia: Array<string>,
 *   unknownExcluded: Array<string>, rules: Array<object>}}
 *   active: khoá media -> đang 配信中 hay không. mixedMedia/unknownMedia/unknownExcluded:
 *   nguyên liệu cho 3 dòng 設定注意.
 */
function buildMediaAvailability(options) {
  var columnByMediaKey = {};
  mediaColumns().forEach(function (column) {
    column.mediaSources.forEach(function (name) {
      columnByMediaKey[mediaNameKey(name)] = column.header;
    });
  });

  // 媒体×ADFMTマスタ là bảng media × ADFMT: 1 media có tới 7 dòng, và ステータス nằm
  // trên TỪNG DÒNG. Quy ước: có ít nhất 1 dòng 〇 là đang chạy — nhưng media có dòng
  // LẪN LỘN thì nêu tên ra, vì đó đúng là ca mà "ít nhất 1" khác "tất cả". §4.13
  var counts = {};
  var unknownMedia = [];
  (options.adfmtRecords || []).forEach(function (record) {
    var key = mediaNameKey(record.mediaName);
    if (key === '') return;
    if (columnByMediaKey[key] === undefined) {
      if (unknownMedia.indexOf(String(record.mediaName)) < 0) {
        unknownMedia.push(String(record.mediaName));
      }
      return;
    }
    if (!counts[key]) counts[key] = { on: 0, off: 0 };
    if (isDistributingMark(record.crossStatus)) counts[key].on += 1;
    else counts[key].off += 1;
  });

  var active = {};
  var mixedMedia = [];
  Object.keys(counts).forEach(function (key) {
    active[key] = counts[key].on > 0;
    if (counts[key].on > 0 && counts[key].off > 0) mixedMedia.push(key);
  });

  var rules = [];
  var unknownExcluded = [];
  (options.exclusionRecords || []).forEach(function (record) {
    var key = mediaNameKey(record.excludedMedia);
    if (key === '') return;
    if (columnByMediaKey[key] === undefined) {
      if (unknownExcluded.indexOf(String(record.excludedMedia)) < 0) {
        unknownExcluded.push(String(record.excludedMedia));
      }
      return;
    }
    rules.push({
      // null = wildcard. Hai trục độc lập, và một luật chỉ loại khi CẢ HAI khớp.
      logo: isMediaWildcard(record.logo) ? null : mediaLogoKey(record.logo),
      genre: isMediaWildcard(record.genre) ? null : mediaGenreKey(record.genre),
      mediaKey: key,
      mediaName: String(record.excludedMedia),
      header: columnByMediaKey[key],
    });
  });

  return {
    active: active,
    mixedMedia: mixedMedia,
    unknownMedia: unknownMedia,
    unknownExcluded: unknownExcluded,
    rules: rules,
  };
}

/**
 * Giá trị 6 cột `掲出可能媒体` của MỘT tác phẩm.
 *
 * `availability === null` (chưa cấu hình spreadsheetId, hoặc đọc nguồn lỗi) -> 6 cột
 * đều rỗng. Kiểu ghi của chúng là `条件`, nên rỗng = GIỮ NGUYÊN ô đang có.
 *
 * @param {{logoJudgement: *, genre: *}} record
 * @param {object|null} availability - Kết quả buildMediaAvailability()
 * @returns {{values: object, undecided: Array<string>, ydaSingleFaceExcluded: boolean}}
 */
function mediaValuesFor(record, availability) {
  var values = {};
  var undecided = [];
  var ydaSingleFaceExcluded = false;

  if (!availability) {
    mediaColumns().forEach(function (column) { values[column.field] = ''; });
    return { values: values, undecided: undecided, ydaSingleFaceExcluded: false };
  }

  var logo = mediaLogoKey(record ? record.logoJudgement : '');
  var genre = mediaGenreKey(record ? record.genre : '');
  var logoDecided = logo === MEDIA_LOGO_WITH || logo === MEDIA_LOGO_WITHOUT;

  mediaColumns().forEach(function (column) {
    var counted = { on: 0, excluded: 0, unknown: 0 };

    column.mediaSources.forEach(function (name) {
      var faceKey = mediaNameKey(name);
      // Tầng ①: media không 配信中 thì không cần xét tầng ② nữa.
      if (availability.active[faceKey] !== true) return;

      var excluded = false;
      var cannotDecide = false;
      availability.rules.forEach(function (rule) {
        if (rule.mediaKey !== faceKey) return;
        // Tiền tố, không phải khớp đúng: `TL` phải bắt cả `TLコミック`, `TL（R18）` (§4.5).
        if (rule.genre !== null && genre.indexOf(rule.genre) !== 0) return;
        if (rule.logo === null) { excluded = true; return; }
        // Luật cần ロゴ mà tác phẩm chưa có phán định -> KHÔNG BIẾT, không đoán.
        if (!logoDecided) { cannotDecide = true; return; }
        if (rule.logo === logo) excluded = true;
      });

      if (excluded) { counted.excluded += 1; return; }
      if (cannotDecide) { counted.unknown += 1; return; }
      counted.on += 1;
    });

    // Thứ tự 3 nhánh là phần của rule:
    //   1. Bị ② loại -> × (dứt khoát, kể cả khi mặt khác còn chạy: xem gộp YDA ở §4.13).
    //   2. Chưa phán định được -> rỗng, để 条件 giữ nguyên ô + 1 dòng cảnh báo.
    //   3. Còn ít nhất 1 mặt chạy được -> 〇; không mặt nào -> × (tầng ① tắt).
    if (counted.excluded > 0) {
      values[column.field] = MEDIA_NO;
      // Cột gộp nhiều mặt mà CHỈ một mặt bị loại: cái giá của việc 1 cột cõng 2 mặt.
      if (column.mediaSources.length > 1 && counted.on > 0) ydaSingleFaceExcluded = true;
      return;
    }
    if (counted.unknown > 0) {
      values[column.field] = '';
      undecided.push(column.header);
      return;
    }
    values[column.field] = counted.on > 0 ? MEDIA_YES : MEDIA_NO;
  });

  return {
    values: values,
    undecided: undecided,
    ydaSingleFaceExcluded: ydaSingleFaceExcluded,
  };
}

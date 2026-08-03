// tools/verify/liveCheck.gs — kiểm chứng trên SHEET LIVE, chỉ ĐỌC
//
// Mục đích: đo lại trên dữ liệu live những con số mà spec
// docs/superpowers/specs/2026-08-03-regulation-title-name-key-design.md
// đang lấy từ bản export .xlsx trong example/. Có 2 câu hỏi cần trả lời:
//
//   1. Chênh lệch ký tự (〜 vs ～, ！ vs !, space toàn rộng, NBSP) giữa CMS và
//      レギュレーション là có thật trên sheet, hay do bước export Excel sinh ra?
//   2. Số dòng thật sự vào 顧客作品マスタ trên dữ liệu live là bao nhiêu?
//      (bản export cho 1.730 / 5.649)
//
// AN TOÀN: file này KHÔNG có bất kỳ lệnh ghi nào — không setValue, không
// appendRow, không getRange().set*. Chỉ openById + getValues + Logger.log.
// File này cũng đã được loại khỏi clasp push (xem .claspignore) nên không
// bị đẩy lên project GAS❶ đang chạy trigger thật.
//
// CÁCH DÙNG
//   Cách A (nhanh nhất, không đụng gì tới project hiện tại):
//     1. Mở https://script.new  -> tạo project mới
//     2. Dán toàn bộ file này vào, Save
//     3. Chọn hàm runLiveCheck -> Run
//     4. Lần đầu Google hỏi cấp quyền -> Review permissions -> Allow
//     5. Xem kết quả ở tab "Execution log"
//
//   Cách B: dán vào project GAS❶ hiện tại rồi Run hàm runLiveCheck.
//     Chỉ nên làm nếu bạn chắc không bấm Deploy — code chỉ đọc nên không
//     ảnh hưởng gì, nhưng cách A sạch hơn.

var TARGET_SAMPLE = '落城の美姫'; // tác phẩm dùng làm ví dụ trong spec (mục 4.4)

var SHEETS = {
  REGULATION: {
    label: 'レギュレーション判定',
    spreadsheetId: '1T8CooSrzcbZi768KXT7zTUlzpgz4dap0zWUJCkE5jZg',
    sheetName: 'シート1',
  },
  CMS_LIVE: {
    label: 'CMS 先行タイトル情報 (bản chính)',
    spreadsheetId: '1vU82_heOwwcYlJr9kv9VEqJVKu3kUPz9gh9R5_ycR0k',
    sheetName: '★列追加の場合は増渕まで★',
  },
  CMS_DEBUG: {
    label: 'CMS 先行タイトル情報 (_DX_debug clone)',
    spreadsheetId: '1Kxb4YNV1dUFkoAbUEnMPFXnXg3AZCi7zdos3SFmBTQU',
    sheetName: '★列追加の場合は増渕まで★',
  },
};

// Chọn dùng bản CMS nào để so với レギュレーション.
// Đổi thành SHEETS.CMS_DEBUG nếu không có quyền vào bản chính.
var CMS_SOURCE = SHEETS.CMS_LIVE;

var NG_POLICY = ['問題あり'];
var NG_GENERAL = ['アダルト作品扱い', 'アダルトジャンル'];
var STATUS_OK = '判定済み';

// ---------------------------------------------------------------- tiện ích

/** Giống normalizeJapaneseText() ở src/logic/upsert.js */
function normalizeJp(value) {
  if (value === undefined || value === null) return '';
  // 〜 = WAVE DASH, ～ = FULLWIDTH TILDE — HIỂN THỊ Y HỆT NHAU nên
  // viết bằng escape, không viết ký tự trực tiếp (gõ lẫn là sai cả bài test
  // mà không ai nhìn ra). Giống hệt normalizeJapaneseText() ở upsert.js.
  return String(value)
    .trim()
    .replace(/[〜～]/g, '～') // WAVE DASH -> FULLWIDTH TILDE
    .normalize('NFKC');
}

/** Chuỗi thô, chỉ ép String — dùng để so "完全一致 tuyệt đối" */
function rawText(value) {
  return value === undefined || value === null ? '' : String(value);
}

function indexOfHeader(row, name) {
  for (var i = 0; i < row.length; i++) {
    if (normalizeJp(row[i]) === normalizeJp(name)) return i;
  }
  return -1;
}

/**
 * Đọc sheet và tự dò hàng header bằng cách tìm hàng đầu tiên có chứa
 * 'タイトル名' — レギュレーション có header ở hàng 4 (3 hàng đầu là ghi chú),
 * CMS có header ở hàng 1. Không hardcode số hàng.
 */
function readSheet(cfg) {
  var sheet = SpreadsheetApp.openById(cfg.spreadsheetId).getSheetByName(cfg.sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet "' + cfg.sheetName + '" trong ' + cfg.label);
  var rows = sheet.getDataRange().getValues();
  for (var i = 0; i < Math.min(rows.length, 20); i++) {
    if (indexOfHeader(rows[i], 'タイトル名') !== -1) {
      return { rows: rows, headerRowIndex: i, header: rows[i] };
    }
  }
  throw new Error('Không tìm được hàng header (có cột タイトル名) trong ' + cfg.label);
}

/** Đếm số ô có chứa từng ký tự cần điều tra */
function countVariants(values) {
  // Dùng \uXXXX chứ KHÔNG viết ký tự trực tiếp: 〜/～ trông y hệt nhau, và
  // space thường / NBSP / space toàn rộng thì không phân biệt được bằng mắt.
  // Gõ lẫn một cái là cả bài test sai âm thầm.
  var probes = [
    ['U+301C WAVE DASH', '\u301C'],
    ['U+FF5E FULLWIDTH TILDE', '\uFF5E'],
    ['U+FF01 fullwidth !', '\uFF01'],
    ['U+0021 ascii !', '!'],
    ['U+FF1F fullwidth ?', '\uFF1F'],
    ['U+003F ascii ?', '?'],
    ['U+3000 space toan rong', '\u3000'],
    ['U+00A0 NBSP', '\u00A0'],
    ['U+FF08 ngoac toan rong', '\uFF08'],
    ['U+0028 ngoac ascii', '('],
  ];
  var result = [];
  for (var p = 0; p < probes.length; p++) {
    var n = 0;
    for (var i = 0; i < values.length; i++) {
      if (values[i].indexOf(probes[p][1]) !== -1) n++;
    }
    result.push([probes[p][0], n]);
  }
  return result;
}

function codepointsOf(text) {
  var out = [];
  for (var i = 0; i < text.length; i++) {
    var hex = text.charCodeAt(i).toString(16).toUpperCase();
    while (hex.length < 4) hex = '0' + hex;
    out.push(text.charAt(i) + '=U+' + hex);
  }
  return out.join(' ');
}

function log(line) {
  Logger.log(line);
}

function section(title) {
  log('');
  log('======== ' + title + ' ========');
}

// ---------------------------------------------------------------- phần chính

function runLiveCheck() {
  log('Chạy lúc: ' + new Date());
  log('CHỈ ĐỌC — không có lệnh ghi nào trong file này.');

  // ---- 1. đọc レギュレーション ----
  var reg = readSheet(SHEETS.REGULATION);
  var rIdx = {
    status: indexOfHeader(reg.header, 'ステータス'),
    name: indexOfHeader(reg.header, 'タイトル名'),
    policy: -1,
    general: -1,
    logo: indexOfHeader(reg.header, '③シーモアロゴ判定'),
  };
  // 2 cột này có ký tự xuống dòng trong header nên phải khớp theo tiền tố
  for (var i = 0; i < reg.header.length; i++) {
    var h = normalizeJp(reg.header[i]);
    if (h.indexOf('①広告出稿ポリシー') === 0) rIdx.policy = i;
    if (h.indexOf('②一般面出稿NG') === 0) rIdx.general = i;
  }

  section('1. レギュレーション — cấu trúc');
  log('header ở hàng ' + (reg.headerRowIndex + 1) + ' (1-based), tổng ' + reg.rows.length + ' hàng');
  log('vị trí cột: ' + JSON.stringify(rIdx));
  if (rIdx.status < 0 || rIdx.name < 0 || rIdx.policy < 0 || rIdx.general < 0) {
    log('!! Thiếu cột bắt buộc — header thật: ' + JSON.stringify(reg.header));
    return;
  }

  var judged = [];
  var statusCount = {};
  for (var i = reg.headerRowIndex + 1; i < reg.rows.length; i++) {
    var row = reg.rows[i];
    var st = normalizeJp(row[rIdx.status]);
    if (rawText(row[rIdx.name]) === '' && st === '') continue;
    statusCount[st || '(trống)'] = (statusCount[st || '(trống)'] || 0) + 1;
    if (st !== STATUS_OK) continue;
    judged.push({
      name: row[rIdx.name],
      policy: row[rIdx.policy],
      general: row[rIdx.general],
      logo: rIdx.logo >= 0 ? row[rIdx.logo] : '',
    });
  }
  log('phân bố ステータス: ' + JSON.stringify(statusCount));
  log('số dòng ' + STATUS_OK + ': ' + judged.length);

  // ---- 2. đọc CMS ----
  var cms = readSheet(CMS_SOURCE);
  var cIdx = {
    cmsId: indexOfHeader(cms.header, 'CMSID'),
    titleId: indexOfHeader(cms.header, 'タイトルID'),
    name: indexOfHeader(cms.header, 'タイトル名'),
  };
  section('2. ' + CMS_SOURCE.label + ' — cấu trúc');
  log('header ở hàng ' + (cms.headerRowIndex + 1) + ', tổng ' + cms.rows.length + ' hàng');
  log('vị trí cột: ' + JSON.stringify(cIdx));

  var works = [];
  for (var i = cms.headerRowIndex + 1; i < cms.rows.length; i++) {
    var r = cms.rows[i];
    if (rawText(r[cIdx.name]).trim() === '') continue;
    works.push({
      cmsId: cIdx.cmsId >= 0 ? r[cIdx.cmsId] : '',
      titleId: cIdx.titleId >= 0 ? r[cIdx.titleId] : '',
      name: r[cIdx.name],
    });
  }
  log('số tác phẩm (có タイトル名): ' + works.length);

  // ---- 3. CÂU HỎI 1: ký tự có bị lệch trên sheet live không? ----
  section('3. Biến thể ký tự trong cột タイトル名 — TRÊN SHEET LIVE');
  var regNames = judged.map(function (r) { return rawText(r.name); });
  var cmsNames = works.map(function (w) { return rawText(w.name); });

  var a = countVariants(regNames);
  var b = countVariants(cmsNames);
  log('ký tự                          | レギュレーション | CMS');
  for (var i = 0; i < a.length; i++) {
    log(pad(a[i][0], 30) + ' | ' + pad(String(a[i][1]), 15) + ' | ' + b[i][1]);
  }
  log('');
  log('>> Nếu CẢ HAI cột đều > 0 ở cùng một dòng ký tự -> sheet live đã trộn');
  log('   sẵn 2 dạng, chênh lệch KHÔNG do export Excel sinh ra.');

  // ---- 4. ví dụ cụ thể ----
  section('4. Ví dụ "' + TARGET_SAMPLE + '" — mã ký tự thật trên live');
  logSample('レギュレーション', regNames);
  logSample(CMS_SOURCE.label, cmsNames);

  // ---- 5. CÂU HỎI 2: số dòng vào master trên dữ liệu live ----
  section('5. Áp quy tắc lọc trên dữ liệu live');
  var lookupRaw = {};
  var lookupNorm = {};
  var dupNormNgWins = 0;
  for (var i = 0; i < judged.length; i++) {
    var rec = judged[i];
    var kRaw = rawText(rec.name);
    var kNorm = normalizeJp(rec.name);
    if (kRaw !== '') lookupRaw[kRaw] = rec;
    if (kNorm !== '') {
      var cur = lookupNorm[kNorm];
      if (!cur) {
        lookupNorm[kNorm] = rec;
      } else if (isNg(rec) && !isNg(cur)) {
        lookupNorm[kNorm] = rec; // tên trùng -> dòng nghiêm ngặt hơn thắng
        dupNormNgWins++;
      }
    }
  }

  var stat = { matchRaw: 0, matchNorm: 0, ng: 0, unjudged: 0, intoMaster: 0 };
  for (var i = 0; i < works.length; i++) {
    var w = works[i];
    if (lookupRaw[rawText(w.name)]) stat.matchRaw++;
    var hit = lookupNorm[normalizeJp(w.name)];
    if (!hit) { stat.unjudged++; continue; }
    stat.matchNorm++;
    if (isNg(hit)) stat.ng++; else stat.intoMaster++;
  }

  var pct = function (n) { return works.length ? (n * 100 / works.length).toFixed(1) + '%' : '-'; };
  log('tổng tác phẩm CMS                 : ' + works.length);
  log('khớp bằng chuỗi THÔ (không xử lý) : ' + stat.matchRaw + '  (' + pct(stat.matchRaw) + ')');
  log('khớp sau trim + NFKC              : ' + stat.matchNorm + '  (' + pct(stat.matchNorm) + ')');
  log('  -> chênh lệch do chuẩn hoá      : ' + (stat.matchNorm - stat.matchRaw) + ' dòng');
  log('');
  log('=> VÀO 顧客作品マスタ              : ' + stat.intoMaster + '  (' + pct(stat.intoMaster) + ')');
  log('=> loại vì NG                     : ' + stat.ng + '  (' + pct(stat.ng) + ')');
  log('=> loại vì 未判定                  : ' + stat.unjudged + '  (' + pct(stat.unjudged) + ')');
  log('tên trùng, chọn dòng NG           : ' + dupNormNgWins);

  section('6. So với số trong spec (đo từ bản export .xlsx)');
  log('spec: CMS 5649 | khớp 2325 (41.2%) | vào master 1730 (30.6%) | NG 595 | 未判定 3324');
  log('live: xem mục 5 ở trên. Lệch nhiều nghĩa là bản export trong example/ đã cũ');
  log('      hoặc thiếu dữ liệu so với sheet thật.');
}

function pad(text, width) {
  var s = String(text);
  while (s.length < width) s += ' ';
  return s;
}

function isNg(rec) {
  var p = normalizeJp(rec.policy);
  var g = normalizeJp(rec.general);
  return NG_POLICY.indexOf(p) !== -1 || NG_GENERAL.indexOf(g) !== -1;
}

function logSample(label, names) {
  for (var i = 0; i < names.length; i++) {
    if (names[i].indexOf(TARGET_SAMPLE) !== -1) {
      log(label + ': ' + names[i]);
      log('  ' + codepointsOf(names[i].substring(0, 18)));
      return;
    }
  }
  log(label + ': không tìm thấy tác phẩm chứa "' + TARGET_SAMPLE + '"');
}

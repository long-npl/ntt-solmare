// tools/verify-phase1/tests.js — test cho gas_phase_1/.
//
// Engine đã có suite riêng (tools/verify-engine). Ở đây chỉ test phần NGHIỆP VỤ:
// đọc nguồn, quy tắc từng cột, khớp dòng, cảnh báo.

function test_loadSources(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  // Nguồn PHỤ hỏng: nuốt lỗi, ghi lại nguyên nhân, lần chạy tiếp tục.
  var loaded = src.loadSourcesFrom([
    { key: 'ok', required: false, read: function () { return 'DATA'; } },
    { key: 'broken', required: false, read: function () { throw new Error('mat quyen'); } },
  ]);
  check('nguon phu chay duoc -> co gia tri', loaded.values.ok, 'DATA');
  check('nguon phu hong -> value la null, KHONG phai rong', loaded.values.broken, null);
  check('nguon phu hong -> ghi lai nguyen nhan', loaded.errors.broken.indexOf('mat quyen') >= 0, true);
  check('nguon phu chay duoc -> khong co loi', loaded.errors.ok, null);

  // Nguồn BẮT BUỘC hỏng: lỗi phải lan ra ngoài và làm cả lần chạy thất bại.
  var threw = false;
  try {
    src.loadSourcesFrom([
      { key: 'cms', required: true, read: function () { throw new Error('sheet bi xoa'); } },
    ]);
  } catch (e) { threw = true; }
  check('nguon BAT BUOC hong -> throw ra ngoai', threw, true);

  // startedAt phải tới được nguồn cần nó (TSV chọn file theo ngày chạy).
  var seen = null;
  src.loadSourcesFrom([
    { key: 'susp', required: false, read: function (startedAt) { seen = startedAt; return null; } },
  ], 'NGAY_CHAY');
  check('startedAt duoc chuyen xuong nguon', seen, 'NGAY_CHAY');

  // Bảng SOURCES thật: đúng 8 nguồn, đúng 2 nguồn bắt buộc.
  check('dung 8 nguon', src.SOURCES.length, 8);
  check('dung 2 nguon bat buoc: regulation + cms',
    src.SOURCES.filter(function (s) { return s.required; }).map(function (s) { return s.key; }),
    ['regulation', 'cms']);
  check('moi nguon co key + read', src.SOURCES.filter(function (s) {
    return !s.key || typeof s.read !== 'function'; }).length, 0);
}

function test_cmsVolumes(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var HEADER = ['CMSID', 'タイトルID', 'タイトル名', '巻数', '作家名', 'ジャンル',
    'レーベル名', '出版社', '先行開始日', '先行終了日', 'コピーライト'];
  var rows = [HEADER,
    ['6761', '354296', 'A', '1~4', 'tac gia', '女性', 'label', 'nxb', '', '', '©x'],
    ['6762', '354297', 'B', '1', 'tac gia', 'TL', 'label', 'nxb', '', '', '©y'],
  ];
  var records = src.parseCms(rows);
  check('parseCms doc duoc cot 巻数', records.map(function (r) { return r.volumes; }), ['1~4', '1']);
  check('parseCms van giu nguyen cac field cu',
    [records[0].cmsId, records[0].titleName, records[0].genre], ['6761', 'A', '女性']);
}

module.exports = {
  unit: [test_loadSources, test_cmsVolumes],
  data: [],
};

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

function test_firstVolume(ctx) {
  var src = ctx.src;
  var check = ctx.check;
  function fv(v) { return src.ruleFirstVolume({ volumes: v }); }

  check('1 -> 1', fv('1'), '1');
  check('khoang 1~4 -> 4', fv('1~4'), '4');
  check('khoang 2 chu so 10~12 -> 12', fv('10~12'), '12');
  // normalizeJapaneseText gộp cả 3 biến thể dấu ngăn + số full-width về một dạng.
  check('3 bien the dau ngan + so full-width deu ra XX',
    [fv('1~5'), fv('1～5'), fv('1〜5'), fv('１～５')], ['5', '5', '5', '5']);

  check('so khac 1 -> 顧客確認',
    [fv('2'), fv('3'), fv('44563')], ['顧客確認', '顧客確認', '顧客確認']);
  check('co duoi -> 顧客確認 (dung mat chu rule)',
    [fv('1~5(全話一挙配信)'), fv('1~3巻'), fv('1(初回配信話数確認中)'), fv('12話目')],
    ['顧客確認', '顧客確認', '顧客確認', '顧客確認']);
  check('o trong -> 顧客確認',
    [fv(''), fv(null), fv(undefined)], ['顧客確認', '顧客確認', '顧客確認']);
  // 5 ô đã bị Sheets nuốt thành ngày vì người gõ 1-5 / 1-12 — dữ liệu gốc đã mất.
  check('o bi Sheets nuot thanh ngay -> 顧客確認',
    fv(new Date('2026-01-05T00:00:00+09:00')), '顧客確認');
}

function test_lpProduction(ctx) {
  var src = ctx.src;
  var check = ctx.check;
  function lp(genre, logo, existingLogo) {
    return src.ruleLpProduction({ genre: genre, logoJudgement: logo },
      existingLogo === undefined ? null : { logoJudgement: existingLogo });
  }

  check('ジャンル xet TRUOC ロゴ判定', lp('TL', 'ロゴあり'), '必要');
  check('tien to bat duoc bien the that',
    [lp('TLコミック', 'ロゴあり'), lp('BLコミック', 'ロゴあり'), lp('TL（R18）', 'ロゴあり')],
    ['必要', '必要', '必要']);
  check('ＴＬ full-width + tl thuong',
    [lp('ＴＬ', 'ロゴあり'), lp('tl', 'ロゴあり')], ['必要', '必要']);
  check('con lai moi xet ロゴ判定',
    [lp('女性', 'ロゴなし'), lp('女性', 'ロゴあり')], ['必要', '不要']);
  check('chua phan dinh -> rong, KHONG phai 不要', lp('女性', ''), '');

  // BUG 2026-09-01: ô ③ được GIỮ khi 未判定, nhưng quy tắc cũ đọc ③ của riêng lần
  // chạy này (rỗng) -> 13 dòng hien ③=ロゴあり ma cot J trong VINH VIEN.
  check('BUG: 未判定 hom nay nhung master dang giu ③=ロゴあり -> 不要',
    lp('女性', '', 'ロゴあり'), '不要');
  check('BUG: master dang giu ③=ロゴなし -> 必要', lp('女性', '', 'ロゴなし'), '必要');
  check('phan dinh MOI thang gia tri cu tren sheet', lp('女性', 'ロゴあり', 'ロゴなし'), '不要');
  check('dong MOI (existing null) van ra rong khi 未判定', lp('女性', '', undefined), '');
  check('ca 2 phia deu khong co ③ -> rong', lp('女性', '', ''), '');
  check('ジャンル TL van thang, khong dung toi ③ nao', lp('TL', '', 'ロゴあり'), '必要');
}

function test_preEndFinal(ctx) {
  var src = ctx.src;
  var check = ctx.check;
  var d1 = new Date('2026-06-25T00:00:00+09:00');
  var d2 = new Date('2026-09-30T00:00:00+09:00');
  check('co gia han -> lay gia han', src.rulePreEndFinal({ preEnd: d1, preEndExtended: d2 }), d2);
  check('khong gia han -> lay ngay goc', src.rulePreEndFinal({ preEnd: d1, preEndExtended: '' }), d1);
  check('khong co gi -> rong', src.rulePreEndFinal({ preEnd: '', preEndExtended: '' }), '');
}

function test_customerColumns(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  check('dung 21 cot', src.CUSTOMER_COLUMNS.length, 21);
  check('moi cot co du header + field + from + write',
    src.CUSTOMER_COLUMNS.filter(function (c) {
      return !c.header || !c.field || !c.from || !c.write; }).length, 0);
  // Bỏ được trường compare là toàn bộ điểm của engine — đừng để nó bò trở lại.
  check('khong cot nao khai bao compare (write da quyet dinh)',
    src.CUSTOMER_COLUMNS.filter(function (c) { return c.compare !== undefined; }).length, 0);
  check('khong cot nao dung skipCompare',
    src.CUSTOMER_COLUMNS.filter(function (c) { return c.skipCompare; }).length, 0);
  check('cot derive nao cung co rule',
    src.CUSTOMER_COLUMNS.filter(function (c) {
      return c.from === 'derive' && typeof c.rule !== 'function'; }).length, 0);
  check('6 cot ngay dung type date',
    src.CUSTOMER_COLUMNS.filter(function (c) { return c.type === 'date'; })
      .map(function (c) { return c.field; }),
    ['preStart', 'preEnd', 'preEndExtended', 'preEndFinal', 'massFreeStart', 'massFreeEnd']);
  check('requiredHeaders sinh dung 21 ten', src.requiredHeaders(src.CUSTOMER_COLUMNS).length, 21);
  check('khong header nao trung nhau',
    new Set(src.CUSTOMER_COLUMNS.map(function (c) { return c.header; })).size, 21);
  check('khong field nao trung nhau',
    new Set(src.CUSTOMER_COLUMNS.map(function (c) { return c.field; })).size, 21);
}

function test_buildCustomerRecord(ctx) {
  var src = ctx.src;
  var check = ctx.check;
  var index = src.buildRegulationIndex([
    { titleName: 'A', titleId: '100', policy: '問題なし', general: '一般面OK', logoJudgement: 'ロゴあり' },
    { titleName: 'B', titleId: '200', policy: '問題あり', general: '', logoJudgement: 'ロゴなし' },
  ]);
  var loaded = { values: { regulation: index }, errors: { regulation: null } };

  var ok = src.buildCustomerRecord({ titleName: 'A', titleId: '100', volumes: '1~4' }, loaded);
  check('tra ra -> judged true + 3 cot phan dinh nguyen van',
    [ok.judged, ok.isNg, ok.policy, ok.logoJudgement], [true, false, '問題なし', 'ロゴあり']);
  check('volumes duoc chuyen qua cho ruleFirstVolume', ok.volumes, '1~4');

  var ng = src.buildCustomerRecord({ titleName: 'B', titleId: '200', volumes: '1' }, loaded);
  check('①=問題あり -> isNg', ng.isNg, true);

  var unjudged = src.buildCustomerRecord({ titleName: 'Z', titleId: '999', volumes: '' }, loaded);
  check('未判定 -> judged false, 3 cot de RONG (khong phai undefined)',
    [unjudged.judged, unjudged.policy, unjudged.general, unjudged.logoJudgement],
    [false, '', '', '']);
}

module.exports = {
  unit: [test_loadSources, test_cmsVolumes, test_firstVolume, test_lpProduction,
    test_preEndFinal, test_customerColumns, test_buildCustomerRecord],
  data: [],
};

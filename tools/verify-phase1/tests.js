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

// ==============================================================================
function test_cascade(ctx) {

    var src = ctx.src;
    var check = ctx.check;

    /** 1 dòng master đang có trên sheet. sheetRow = số dòng thật (header ở hàng 15). */
    function existing(titleNo, titleId, titleName) {
      return { titleNo: titleNo, titleId: titleId, titleName: titleName, sheetRow: 15 + titleNo };
    }
    function work(titleId, titleName) {
      return { titleId: titleId, titleName: titleName };
    }

    // ---- isDigits ----
    check('isDigits', [src.isDigits(347590), src.isDigits('347590'), src.isDigits(''), src.isDigits('ー'),
      src.isDigits('4415行目と同一'), src.isDigits('※既に配信済みのためCMS削除'), src.isDigits(null), src.isDigits(' 12 ')],
      [true, true, false, false, false, false, false, true]);

    // ---- sameDateValue ----
    check('sameDateValue: cung ngay khac gio -> bang nhau',
      src.sameDateValue(new Date(2026, 2, 27, 0, 0), new Date(2026, 2, 27, 9, 0)), true);
    check('sameDateValue: khac ngay -> khac',
      src.sameDateValue(new Date(2026, 2, 27), new Date(2026, 2, 28)), false);
    check('sameDateValue: Date vs chuoi 未定 -> khac',
      src.sameDateValue(new Date(2026, 2, 27), '未定'), false);
    check('sameDateValue: chuoi ngay vs Date cung ngay -> bang nhau (Sheets tu doi chuoi thanh Date)',
      [src.sameDateValue(new Date(2026, 2, 27), '2026-03-27'), src.sameDateValue('2026/3/27', new Date(2026, 2, 27))],
      [true, true]);
    check('sameDateValue: 2 ve khong phai ngay -> roi ve sameValue',
      [src.sameDateValue('未定', '未定'), src.sameDateValue(undefined, ''), src.sameDateValue('a', 'b')],
      [true, true, false]);

    // ---- sameWriteOnceValue (cột I 掲載停止日付) ----
    check('sameWriteOnceValue: o da co gia tri -> khong bao gio ghi de',
      [src.sameWriteOnceValue('2025/2/8', '2099/12/31'),
        src.sameWriteOnceValue('2025/2/8', ''),
        src.sameWriteOnceValue(new Date(2025, 1, 8), '2026/01/31')],
      [true, true, true]);
    check('sameWriteOnceValue: o trong + co gia tri moi -> can ghi',
      src.sameWriteOnceValue('', '2026/01/31'), false);
    check('sameWriteOnceValue: o trong + khong co gia tri moi -> khong doi',
      [src.sameWriteOnceValue('', ''), src.sameWriteOnceValue(undefined, ''), src.sameWriteOnceValue('　', undefined)],
      [true, true, true]);

    // ---- Tầng 1: ID và tên đều khớp ----
    var rows1 = [existing(1, 347590, 'A作品'), existing(2, 347591, 'B作品')];
    var idx1 = src.buildMasterMatchIndex(rows1);
    var m1 = src.matchExistingRow(idx1, work(347590, 'A作品'));
    check('tang 1: ID + ten deu khop', [m1.tier, m1.rowOffset, m1.ambiguous], [1, 0, false]);

    // Tầng 1 vẫn bắt được khi CẢ HAI bên đều có titleId trống
    var mEmpty = src.matchExistingRow(src.buildMasterMatchIndex([existing(1, '', 'A作品')]), work('', 'A作品'));
    check('tang 1: ca 2 ben titleId trong van khop duoc', [mEmpty.tier, mEmpty.rowOffset], [1, 0]);

    // ---- Tầng 2: đổi tên (bỏ dấu 仮), ID số giữ nguyên ----
    var m2 = src.matchExistingRow(
      src.buildMasterMatchIndex([existing(1072, 266030, '恋人(仮)は妄想より奇なり')]),
      work(266030, '恋人は妄想より奇なり'));
    check('tang 2: doi ten, titleID so giu nguyen', [m2.tier, m2.rowOffset], [2, 0]);

    // Tầng 2 KHÔNG được khớp khi 1 trong 2 vế không phải số thật
    var idxNon = src.buildMasterMatchIndex([existing(1, 'ー', 'A作品'), existing(2, '4415行目と同一', 'B作品'), existing(3, '', 'C作品')]);
    check('tang 2 KHONG khop khi master ghi placeholder',
      src.matchExistingRow(idxNon, work('ー', 'ten hoan toan khac')), null);
    check('tang 2 KHONG gop 2 dong cung ghi 4415行目と同一',
      src.matchExistingRow(idxNon, work('4415行目と同一', 'ten khac')), null);

    // ---- Tầng 3: titleId từ trống/chữ thành số ----
    var idx3 = src.buildMasterMatchIndex([existing(870, 'ー', 'D作品'), existing(1116, '※既に配信済みのためCMS削除', 'E作品')]);
    var m3a = src.claimMatch(idx3, work('900001', 'D作品'));
    var m3b = src.claimMatch(idx3, work('900004', 'E作品'));
    check('tang 3: titleID tu ー thanh so', [m3a.tier, m3a.existing.titleNo], [3, 870]);
    check('tang 3: titleID tu ghi chu thanh so', [m3b.tier, m3b.existing.titleNo], [3, 1116]);
    check('sau khi claim het thi khong con dong mo coi', src.collectOrphanOffsets(idx3), []);

    // ---- Chiếm-một-lần: 2 tác phẩm dùng chung 1 titleID số (case 冬すぎて桜) ----
    var rowsShared = [existing(1, 266030, '冬すぎて桜'), existing(2, 266030, '冬すぎて桜【タテヨミ】')];
    var idxShared = src.buildMasterMatchIndex(rowsShared);
    var s1 = src.claimMatch(idxShared, work(266030, '冬すぎて桜'));
    var s2 = src.claimMatch(idxShared, work(266030, '冬すぎて桜【タテヨミ】'));
    check('2 record chung titleID nhung khac ten -> tang 1 tach ra 2 dong khac nhau',
      [s1.tier, s1.rowOffset, s2.tier, s2.rowOffset], [1, 0, 1, 1]);

    // Cùng titleID số, tên đổi cả 2 -> tầng 2, nhưng KHÔNG được chiếm cùng 1 dòng
    var idxShared2 = src.buildMasterMatchIndex(rowsShared);
    var t1 = src.claimMatch(idxShared2, work(266030, 'ten moi 1'));
    var t2 = src.claimMatch(idxShared2, work(266030, 'ten moi 2'));
    check('chiem-mot-lan: 2 record cung titleID so khong duoc chiem cung 1 dong',
      [t1.rowOffset, t2.rowOffset].sort(), [0, 1]);
    check('canh bao 照合曖昧: co >1 ung vien chua bi chiem o tang thang',
      [t1.ambiguous, t1.candidateTitleNos, t2.ambiguous], [true, [1, 2], false]);
    check('chon deterministic: dong co タイトルNo nho nhat', t1.existing.titleNo, 1);

    // ---- Orphan ----
    var idxOrphan = src.buildMasterMatchIndex([existing(1, 1, 'A'), existing(2, 2, 'B'), existing(3, 3, 'C')]);
    src.claimMatch(idxOrphan, work(2, 'B'));
    check('collectOrphanOffsets tra ve dong khong ai chiem', src.collectOrphanOffsets(idxOrphan), [0, 2]);

    // ---- resolveNumbersFromMatches ----
    var existingRows = [existing(5, 500, 'A'), existing(9, 900, 'B')];
    var idxNum = src.buildMasterMatchIndex(existingRows);
    var matches = [work(500, 'A'), work(700, 'C moi'), work(900, 'B')].map(function (w) {
      var m = src.claimMatch(idxNum, w);
      return { record: w, existing: m ? m.existing : null, rowOffset: m ? m.rowOffset : null, tier: m ? m.tier : 0 };
    });
    var numbered = src.resolveNumbersFromMatches(matches, existingRows, 'titleNo');
    check('resolveNumbersFromMatches: dung lai so cu, so moi tiep sau max',
      numbered.map(function (m) { return m.record.titleNo; }), [5, 10, 9]);
    check('resolveNumbersFromMatches KHONG sua record goc (tra ban copy)',
      matches[1].record.titleNo === undefined, true);

    // ---- diffUpsertFromMatches: nhận BẢNG CỘT, không phải isEqualFn rời ----
    var NAME_ONLY = [{ header: 'タイトル名', field: 'titleName', from: 'cms', write: '上書' }];
    var diff = src.diffUpsertFromMatches(numbered, NAME_ONLY);
    check('diffUpsertFromMatches: 1 them moi, 0 update, 2 khong doi',
      [diff.toAdd.length, diff.toUpdate.length, diff.unchangedKeys.length], [1, 0, 2]);
    check('toAdd la record da co titleNo', diff.toAdd[0].titleNo, 10);

    var diff2 = src.diffUpsertFromMatches(
      [{ record: { titleNo: 5, titleName: 'A doi ten' }, existing: existingRows[0], rowOffset: 0, tier: 2 }],
      NAME_ONLY);
    check('toUpdate mang san sheetRow + previous, khong can attachRowOffsets',
      [diff2.toUpdate[0].sheetRow, diff2.toUpdate[0].previous.titleName, diff2.toUpdate[0].rowOffset],
      [20, 'A', 0]);
}

// ==============================================================================
// BỘ LỌC — rule 1, rule 2, ưu tiên 2 phase, 孤立行
// ==============================================================================


// ==============================================================================
function test_filter(ctx) {

    var src = ctx.src;
    var check = ctx.check;

    function work(titleId, titleName, judged, isNg) {
      return { titleId: titleId, titleName: titleName, judged: judged, isNg: isNg };
    }
    function existing(titleNo, titleId, titleName) {
      return { titleNo: titleNo, titleId: titleId, titleName: titleName, sheetRow: 15 + titleNo };
    }

    check('isWorkEligible', [
      src.isWorkEligible(work(1, 'A', true, false)),
      src.isWorkEligible(work(1, 'A', true, true)),
      src.isWorkEligible(work(1, 'A', false, false)),
    ], [true, false, false]);

    // ---- Master rỗng (lần chạy đầu, spec §10b): rule 2 không bảo vệ ai ----
    var first = src.filterAndMatchWorks([
      work(100, 'OK作品', true, false),
      work(200, 'NG作品', true, true),
      work(300, '未判定作品', false, false),
    ], []);
    check('master rong: chi tac pham hop le duoc vao',
      first.matches.map(function (m) { return m.record.titleName; }), ['OK作品']);
    check('master rong: dong moi co existing=null, tier=0',
      [first.matches[0].existing, first.matches[0].tier], [null, 0]);
    check('master rong: NG bi loai', first.excludedNg.map(function (w) { return w.titleName; }), ['NG作品']);
    check('master rong: 未判定 bi loai', first.excludedUnjudged.map(function (w) { return w.titleName; }), ['未判定作品']);
    check('master rong: khong co dong mo coi', first.orphanOffsets, []);

    // ---- Rule 2 (spec §3.4): tác phẩm ĐÃ CÓ trên master thì giữ lại ----
    var second = src.filterAndMatchWorks([
      work(100, 'OK作品', true, false),
      work(200, 'NG作品', true, true),
      work(300, '未判定作品', false, false),
      work(400, 'NG作品 chua co', true, true),
    ], [existing(1, 100, 'OK作品'), existing(2, 200, 'NG作品'), existing(3, 300, '未判定作品')]);
    check('rule 2: NG + 未判定 da co tren master thi GIU LAI',
      second.matches.map(function (m) { return m.record.titleName; }),
      ['OK作品', 'NG作品', '未判定作品']);
    check('rule 2: NG chua co tren master thi van bi loai',
      second.excludedNg.map(function (w) { return w.titleName; }), ['NG作品 chua co']);
    check('rule 2: 3 dong deu khop tang 1',
      second.matches.map(function (m) { return m.tier; }), [1, 1, 1]);
    check('rule 2: khong con dong mo coi', second.orphanOffsets, []);

    // ---- Ưu tiên 2 phase: tác phẩm hợp lệ chiếm dòng TRƯỚC tác phẩm NG ----
    // NG作品 đứng TRƯỚC trong danh sách CMS và cũng khớp được dòng titleNo=1
    // (tầng 2: cùng titleID số 100). Nếu match theo đúng thứ tự CMS thì nó chiếm
    // mất dòng của tác phẩm hợp lệ, và tác phẩm hợp lệ bị append thành dòng MỚI
    // -> trùng dòng. Phase A phải chặn đúng ca này.
    var priority = src.filterAndMatchWorks([
      work(100, 'ten da doi', true, true),
      work(100, 'A作品', true, false),
    ], [existing(1, 100, 'A作品')]);
    check('phase A: tac pham hop le chiem dong truoc, NG bi day ra',
      [priority.matches.length, priority.matches[0].record.titleName, priority.matches[0].tier,
        priority.excludedNg.length],
      [1, 'A作品', 1, 1]);

    // ---- 孤立行: dòng master không ai chiếm ----
    var orphan = src.filterAndMatchWorks(
      [work(100, 'A作品', true, false)],
      [existing(1, 100, 'A作品'), existing(2, 200, 'Bi go khoi CMS')]);
    check('孤立行: dong master khong record nao chiem', orphan.orphanOffsets, [1]);
    check('孤立行 KHONG bi xoa (chi bao) — matches khong chua no', orphan.matches.length, 1);
}

// ==============================================================================
// CẢNH BÁO — 4 loại + audit từng field
// ==============================================================================


// ==============================================================================
function test_warnings(ctx) {

    var src = ctx.src;
    var check = ctx.check;
    var runAt = new Date(2026, 7, 3, 9, 0, 0);

    function match(tier, titleNo, titleId, titleName, prevTitleId, prevTitleName, ambiguous, candidates) {
      return {
        tier: tier,
        record: { titleNo: titleNo, titleId: titleId, titleName: titleName },
        existing: { titleNo: titleNo, titleId: prevTitleId, titleName: prevTitleName },
        ambiguous: !!ambiguous,
        candidateTitleNos: candidates || [],
      };
    }

    var matchRows = src.buildMatchWarningRows([
      match(1, 1, 100, 'A', 100, 'A'),
      match(2, 2, 200, 'ten moi', 200, 'ten cu(仮)'),
      match(3, 3, '900001', 'C', 'ー', 'C'),
      match(3, 4, '900002', 'D', '', 'D', true, [4, 9]),
      { tier: 0, record: { titleNo: 5, titleId: 500, titleName: 'E' }, existing: null, ambiguous: false, candidateTitleNos: [] },
    ], runAt);

    check('照合注意 chi sinh o tang 2 va 3 (tang 1 va dong moi thi khong)',
      matchRows.filter(function (r) { return r.kind === src.WARNING_KIND_MATCH; })
        .map(function (r) { return r.titleNo; }), [2, 3, 4]);
    check('照合注意 tang 2 noi ro ten da doi',
      matchRows[0].detail.indexOf('ten cu(仮)') !== -1 && matchRows[0].detail.indexOf('ten moi') !== -1, true);
    check('照合注意 tang 3 noi ro titleID da doi',
      matchRows[1].detail.indexOf('ー') !== -1 && matchRows[1].detail.indexOf('900001') !== -1, true);
    check('照合曖昧 sinh rieng 1 dong va liet ke ung vien',
      matchRows.filter(function (r) { return r.kind === src.WARNING_KIND_AMBIGUOUS; })
        .map(function (r) { return [r.titleNo, r.detail.indexOf('4, 9') !== -1]; }), [[4, true]]);
    check('moi dong canh bao deu co runAt', matchRows.every(function (r) { return r.runAt === runAt; }), true);

    var orphanRows = src.buildOrphanWarningRows([
      { titleNo: 1, titleId: 100, titleName: 'con dung' },
      { titleNo: 2, titleId: 200, titleName: 'mo coi' },
    ], [1], runAt);
    check('孤立行 chi bao dong khong ai chiem',
      orphanRows.map(function (r) { return [r.kind, r.titleNo, r.titleName]; }),
      [[src.WARNING_KIND_ORPHAN, 2, 'mo coi']]);

    var ngLookup = new Map([
      ['12345', '一般面での出稿ＮＧ（アダルト面での出稿はＯＫ）'],
      [src.normalizeJapaneseText('ヒグマグマ'), '熊被害が発生しているため出稿NG'],
      ['99999', ''],
    ]);
    var ngRows = src.buildNgTitleWarningRows([
      { titleNo: 1, titleId: 12345, titleName: 'MY SWEET BUNNY CAGE' },
      { titleNo: 2, titleId: 67890, titleName: 'ヒグマグマ' },
      { titleNo: 3, titleId: 99999, titleName: 'remark rong -> khong bao' },
      { titleNo: 4, titleId: 11111, titleName: 'khong co trong danh sach NG' },
    ], ngLookup, runAt);
    check('外部出稿NG注意: tra duoc ca theo titleId va theo ten, bo qua 備考 rong',
      ngRows.map(function (r) { return r.titleNo; }), [1, 2]);
    check('外部出稿NG注意 mang noi dung 備考 vao detail',
      ngRows[1].detail.indexOf('熊被害') !== -1, true);

    // ---- changeDetail: hàm so sánh suy từ chế độ ghi của chính cột ----
    // Trước đây fieldDefs khai báo `compare` riêng — chỗ THỨ BA phải giữ khớp tay.
    // Nay truyền thẳng bảng cột, nên cột ngày tự dùng sameDateValue.
    var DETAIL_COLUMNS = [
      { header: '先行開始日', field: 'preStart', from: 'cms', write: '上書', type: 'date' },
      { header: '作家名', field: 'author', from: 'cms', write: '上書' },
    ];
    var detailRows = src.buildChangeDetailRows('顧客作品マスタ', [{
      key: '1',
      previous: { titleName: 'A', preStart: new Date(2026, 2, 27, 0, 0), author: 'X' },
      record: { titleNo: 1, titleName: 'A', preStart: new Date(2026, 2, 27, 9, 0), author: 'Y' },
    }], DETAIL_COLUMNS, runAt);
    check('changeDetail: field ngay dung compare rieng -> cung ngay khac gio KHONG log',
      detailRows.map(function (r) { return r.field; }), ['作家名']);
}

// ==============================================================================
// BẢN QUYỀN — tra rule theo 出版社(+レーベル), sinh template, 3 lý do không sinh được
// ==============================================================================


// ==============================================================================
function test_suspension(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  // Layout thật của file (user xác nhận 2026-08-04): cột A = タイトルID,
  // cột D = 掲載停止日付. Cột B/C là gì thì không quan tâm.
  //                A            B         C          D
  var TSV = [
    ['TitleID', 'title', 'note', '掲載停止日付'],   // hàng header — phải bị bỏ tự nhiên
    ['266030', '冬すぎて桜', '', '2025/2/8'],
    ['300001', '別作品', '', '2026/01/31'],
    ['300002', '停止日なし', '', ''],
    ['ー', 'ID placeholder', '', '2026/03/01'],
    ['', 'ID trong', '', '2026/03/02'],
    ['266030', 'trung ID, dong sau', '', '2099/12/31'],
  ];

  // ---- columnLetterToIndex ----
  check('columnLetterToIndex',
    [src.columnLetterToIndex('A'), src.columnLetterToIndex('D'), src.columnLetterToIndex('d'),
      src.columnLetterToIndex(' Z '), src.columnLetterToIndex('AA')],
    [0, 3, 3, 25, 26]);
  var threwBadColumn = false;
  try { src.columnLetterToIndex('A1'); } catch (e) { threwBadColumn = true; }
  check('columnLetterToIndex throw khi chu cai cot khong hop le', threwBadColumn, true);
  check('columnIndexToLetter la chieu nguoc lai (dung cho log chan doan)',
    [src.columnIndexToLetter(0), src.columnIndexToLetter(3), src.columnIndexToLetter(20),
      src.columnIndexToLetter(26), src.columnIndexToLetter(-1)],
    ['A', 'D', 'U', 'AA', '?']);
  var threwEmptyColumn = false;
  try { src.parseSuspension(TSV, '', 'D'); } catch (e) { threwEmptyColumn = true; }
  check('parseSuspension throw khi CONFIG chua dien cot', threwEmptyColumn, true);

  // ---- parse: KHÔNG lọc gì, kể cả hàng header ----
  var records = src.parseSuspension(TSV, 'A', 'D');
  check('parseSuspension doc HET dong ke ca hang header (loc o buoc lookup)', records.length, 7);
  check('parseSuspension lay dung cot A va D',
    [records[1].titleId, records[1].suspensionDate], ['266030', '2025/2/8']);

  // ---- lookup: hàng header tự bị loại vì titleId không phải số ----
  var lookup = src.buildSuspensionLookup(records);
  check('lookup bo hang header + ー + rong, chi giu タイトルID la so that',
    Array.from(lookup.keys()).sort(), ['266030', '300001']);
  check('lookup bo qua dong khong co ngay dung', lookup.has('300002'), false);
  check('lookup: ID trung thi dong DAU TIEN thang', lookup.get('266030'), '2025/2/8');
  check('lookup giu NGUYEN VAN ngay tu TSV (khong parse, khong format)',
    lookup.get('300001'), '2026/01/31');

  // ---- file KHÔNG có hàng header: kết quả phải y hệt ----
  var noHeaderLookup = src.buildSuspensionLookup(src.parseSuspension(TSV.slice(1), 'A', 'D'));
  check('file khong co hang header cho ket qua y het',
    Array.from(noHeaderLookup.entries()).sort(), Array.from(lookup.entries()).sort());

  function work(titleId) { return { titleId: titleId }; }
  check('lookupSuspensionDate: tra duoc theo so, ke ca khi titleId la number',
    [src.lookupSuspensionDate(work(266030), lookup), src.lookupSuspensionDate(work('266030'), lookup)],
    ['2025/2/8', '2025/2/8']);
  check('lookupSuspensionDate tra "" khi titleId khong phai so hoac khong tra ra',
    [src.lookupSuspensionDate(work('ー'), lookup), src.lookupSuspensionDate(work(''), lookup),
      src.lookupSuspensionDate(work(999999), lookup)],
    ['', '', '']);

  // ---- Cảnh báo ----
  var noFileRows = src.buildSuspensionWarningRows([], new Map(), null, new Date(2026, 7, 3));
  check('canh bao khi khong tim thay file TSV',
    [noFileRows.length, noFileRows[0].kind], [1, src.WARNING_KIND_SUSPENSION]);

  var errorRows = src.buildSuspensionWarningRows([], new Map(), null, new Date(2026, 7, 3), 'Error: chua cap quyen Drive');
  check('canh bao khi buoc doc nguon THAT BAI (main.js chay tiep, khong nuot loi)',
    [errorRows.length, errorRows[0].detail.indexOf('chua cap quyen Drive') !== -1], [1, true]);

  var shared = [
    { titleNo: 1, titleId: 266030, titleName: '冬すぎて桜' },
    { titleNo: 2, titleId: 266030, titleName: '冬すぎて桜【タテヨミ】' },
    { titleNo: 3, titleId: 300001, titleName: '別作品' },
  ];
  var sharedRows = src.buildSuspensionWarningRows(shared, lookup, 'multi_title_20260803.tsv', new Date());
  check('canh bao khi nhieu tac pham dung chung 1 titleID co ngay dung',
    sharedRows.map(function (r) { return r.titleNo; }), [1, 2]);
  check('khong canh bao cho titleID chi 1 tac pham dung',
    sharedRows.filter(function (r) { return r.titleNo === 3; }).length, 0);
}

// ==============================================================================
// ĐỐI CHIẾU DỮ LIỆU THẬT — số liệu spec §12 + mô phỏng 4 lần chạy
// §12 và mô phỏng cascade §5.4 trên dữ liệu thật.
//
// Chạy: python tools/verify/exportFixtures.py && node tools/verify/run.js --data
//
// NẾU MỘT CON SỐ KHÔNG KHỚP: đừng sửa expected cho hết đỏ. Hai khả năng:
//   (a) logic sai -> sửa logic;
//   (b) file trong example/ đã được tải lại mới hơn 2026-08-03 -> ghi con số mới
//       + ngày đo vào spec §12 kèm 1 câu giải thích, RỒI mới sửa expected.
// Những con số này là bằng chứng duy nhất cho quyết định "loại 69% tác phẩm CMS
// khỏi master"; đánh mất chúng là đánh mất khả năng phát hiện hồi quy.
// ==============================================================================


// ==============================================================================
function test_preEndAndMassFree(ctx) {

    var src = ctx.src;
    var check = ctx.check;

    // ---- 3 HÀNG HEADER thật của 【先行作品】独占期間の延長, sheet Sheet1 ----
    // Hàng 1 là header thật, hàng 2 gộp nhóm 当初/延長, hàng 3 mới là 1回目〜7回目.
    // Dải 延長 bắt đầu ở cột G (index 6) — đúng "G∼M列" trong spec.
    var H1 = ['更新日', 'タイトル\nID', 'タイトル', '出版社', 'リリース日\n（先行開始）',
      '独占期間（1話目の先行）終了日', '', '', '', '', '', '', '', '備考'];
    var H2 = ['', '', '', '', '', '当初', '延長', '', '', '', '', '', '', ''];
    var H3 = ['', '', '', '', '', '', '1回目', '2回目', '3回目', '4回目', '5回目', '6回目', '7回目', ''];

    /** 1 dòng dữ liệu: rounds là mảng giá trị cho G→M (tối đa 7 phần tử). */
    function extRow(titleId, titleName, rounds) {
      var row = ['', titleId, titleName, '', '', '', '', '', '', '', '', '', '', ''];
      for (var i = 0; i < 7; i++) row[6 + i] = rounds[i] === undefined ? '' : rounds[i];
      return row;
    }

    var d = function (y, m, day) { return new Date(y, m - 1, day); };

    var extRows = [H1, H2, H3,
      // ❶ spec: G列1回目に期日記載あり＋H〜Mに記載なし
      extRow(232760, '❶1回目のみ', [d(2022, 4, 10)]),
      // ❷ spec: G列「1回目」に期日記載あり＋H列「2回目」に期日記載あり
      extRow(231402, '❷2回目まで', [d(2022, 4, 21), d(2022, 6, 30)]),
      // 「期日のみ」: ô 'NG' sau lần thắng KHÔNG được dùng, và cũng không chặn vòng quét
      extRow(300001, '❸NGのあと', [d(2023, 1, 31), 'NG']),
      // Cả dải không có ô nào là 期日 -> không vào cột R
      extRow(300002, '❹期日なし', ['NG', '一旦無期限先行']),
    ];

    var extRecords = src.parsePreEndExtension(extRows);
    check('R: bo qua ca 3 hang header, doc dung 4 dong du lieu', extRecords.length, 4);
    check('R: doc dung dai cot 1回目〜7回目',
      extRecords[0].rounds.map(function (r) { return r.roundName; }),
      ['1回目', '2回目', '3回目', '4回目', '5回目', '6回目', '7回目']);

    // ❶ và ❷ của spec nói cùng 1 quy tắc: LẦN GIA HẠN CUỐI CÙNG có 期日 thắng.
    check('R ❶: chi 1回目 co ngay -> lay 1回目',
      src.resolvePreEndExtension(extRecords[0]).roundName, '1回目');
    check('R ❷: 1回目 va 2回目 deu co ngay -> lay 2回目 (lan cuoi thang)',
      src.resolvePreEndExtension(extRecords[1]).roundName, '2回目');
    check('R ❷: gia tri tra ve la NGUYEN BAN cua o, khong parse lai',
      src.resolvePreEndExtension(extRecords[1]).value, d(2022, 6, 30));
    check('R ❸: o NG sau lan thang bi bo qua nhung duoc ghi lai de canh bao',
      [src.resolvePreEndExtension(extRecords[2]).roundName,
        src.resolvePreEndExtension(extRecords[2]).skipped.map(function (x) { return x.value; })],
      ['1回目', ['NG']]);
    check('R ❹: khong o nao la 期日 -> null (khong vao cot R)',
      src.resolvePreEndExtension(extRecords[3]), null);

    var extLookup = src.buildPreEndExtensionLookup(extRecords);
    check('R: chi 3/4 dong vao bang tra (dong ❹ bi loai)', extLookup.size, 3);
    check('R: tra theo タイトルID',
      src.lookupPreEndExtension({ titleId: 231402 }, extLookup), d(2022, 6, 30));
    check('R: タイトルID khong phai so -> rong (khong khop qua khoa rong)',
      [src.lookupPreEndExtension({ titleId: '' }, extLookup),
        src.lookupPreEndExtension({ titleId: 'メモ' }, extLookup)], ['', '']);
    check('R: tac pham khong co trong nguon -> rong',
      src.lookupPreEndExtension({ titleId: 999999 }, extLookup), '');

    // ---- S: bảng chân lý đầy đủ ----
    // Spec gốc có 2 gạch đầu dòng ĐIỀU KIỆN GIỐNG HỆT NHAU ('Q列に期日記載あり、
    // R列に期日あり') nhưng kết quả ngược nhau — user xác nhận gạch thứ nhất thiếu
    // chữ 'なし'. 4 ca dưới đây là cách đọc đã được chốt.
    check('S: Q co ngay + R trong -> S = Q',
      src.resolvePreEndFinal(d(2026, 6, 25), ''), d(2026, 6, 25));
    check('S: Q co ngay + R co ngay -> S = R (gia han thang)',
      src.resolvePreEndFinal(d(2026, 6, 25), d(2026, 9, 30)), d(2026, 9, 30));
    check('S: Q trong + R co ngay -> S = R',
      src.resolvePreEndFinal('', d(2026, 9, 30)), d(2026, 9, 30));
    check('S: ca hai trong -> S = rong', src.resolvePreEndFinal('', ''), '');

    // ---- T/U: 大量無料希望作品リスト_CA様, sheet ★出稿回答シート ----
    // Header thật ở HÀNG 2 (hàng 1 là ghi chú ※編集禁止※). H列 開始日 -> T, I列 終了日 -> U.
    var MF_NOTE = ['※編集可※', '', '※※編集禁止※※', '', '', '', '', '', '', '', '', ''];
    var MF_HEADER = ['出稿回答', 'CA\n選定', 'タイトルID', 'タイトル名', '出版社', 'ジャンル',
      '新規\n延長', 'キャンペーン\n開始日', 'キャンペーン\n終了日', '話巻\n区分', '単価\n（pt）',
      'キャンペーン種別'];

    function mfRow(answer, titleId, titleName, kind, start, end) {
      return [answer, '', titleId, titleName, '', '', kind, start, end, '巻', 150, '無料'];
    }

    var mfRows = [MF_NOTE, MF_HEADER,
      // 1 ID, 1 dòng: H -> T, I -> U, không có gì để gộp
      mfRow('', 111111, '単発キャンペーン', '新規', d(2025, 5, 1), d(2025, 5, 31)),
      // 1 ID, 4 dòng gia hạn liên tiếp -> T = 開始日 NHỎ NHẤT, U = 終了日 LỚN NHẤT
      mfRow('', 267846, '延長あり', '新規', d(2025, 5, 1), d(2025, 5, 31)),
      mfRow('', 267846, '延長あり', '延長', d(2025, 6, 1), d(2025, 6, 30)),
      mfRow('', 267846, '延長あり', '延長', d(2025, 8, 1), d(2025, 8, 31)),
      mfRow('', 267846, '延長あり', '延長', d(2025, 7, 1), d(2025, 7, 31)),
      // 出稿回答 = ✕ -> dòng bị loại hoàn toàn
      mfRow('✕', 222222, '出稿しない', '新規', d(2025, 5, 1), d(2025, 5, 31)),
    ];

    var mfRecords = src.parseMassFree(mfRows);
    check('T/U: parse bo hang ghi chu, doc du 6 dong', mfRecords.length, 6);
    check('T/U: nhan dien dong ✕',
      mfRecords.filter(function (r) { return r.rejected; }).length, 1);

    var mfLookup = src.buildMassFreeLookup(mfRecords);
    check('T/U: H列 -> T, I列 -> U',
      src.lookupMassFreePeriod({ titleId: 111111 }, mfLookup),
      { start: d(2025, 5, 1), end: d(2025, 5, 31) });
    // T và U lấy ĐỘC LẬP: U = 8/31 dù dòng cuối trong sheet là 7/1〜7/31.
    check('T/U: 4 dong chien dich -> T = 開始日 nho nhat, U = 終了日 lon nhat',
      src.lookupMassFreePeriod({ titleId: 267846 }, mfLookup),
      { start: d(2025, 5, 1), end: d(2025, 8, 31) });
    check('T/U: ID chi co dong ✕ -> khong vao bang tra',
      src.lookupMassFreePeriod({ titleId: 222222 }, mfLookup), { start: '', end: '' });
    check('T/U: tac pham khong co trong nguon -> ca 2 rong',
      src.lookupMassFreePeriod({ titleId: 999999 }, mfLookup), { start: '', end: '' });
}

// ==============================================================================
// ĐỐI CHIẾU DỮ LIỆU THẬT — R/S/T/U trên 532 dòng 独占期間の延長 và 372 dòng 大量無料
//
// ⚠️ Trước 2026-08-13 KHÔNG có test nào ở đây, và fixtures.load() trả ngày về dưới
// dạng chuỗi ISO có phần giờ nên toDateOrNull() coi MỌI ô ngày là "không phải 期日".
// Hậu quả: nguồn 延長 cho 1/532 dòng và nguồn 大量無料 cho 0/372 — không có gì đỏ,
// chỉ là những con số 0 im lặng. Các con số dưới đây là lưới chắn cho đúng lỗi đó.
// ==============================================================================


// ==============================================================================
function test_regulationCascadeAndHold(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  // Header thật của シート1 — cột ID viết ＩＤ FULL-WIDTH (đã đối chiếu sheet thật
  // 2026-09-01). normalizeHeaderText() KHÔNG làm NFKC nên 'タイトルID' half-width
  // KHÔNG khớp được ô này — đó là lý do phải dò cả 2 cách viết.
  var HEADER = ['No', 'ステータス', '更新日', 'ＣＭＳID', 'タイトルＩＤ', 'タイトル名', 'ジャンル',
    '出版社', '①広告出稿ポリシー\n（出稿NG）', '②一般面出稿NG\n（アダルト作品扱い）', '③シーモアロゴ判定'];
  function sheet(rows) { return [['ghi chú'], [''], [''], HEADER].concat(rows); }
  function row(status, titleId, titleName, policy, general, logo) {
    return ['1', status, '', '', titleId, titleName, 'TL', '', policy, general, logo];
  }
  function work(titleId, titleName) { return { titleId: titleId, titleName: titleName }; }

  var index = src.buildRegulationIndex(src.parseRegulation(sheet([
    row('判定済み', '111', 'かんぜん一致', '問題なし', '一般面OK', 'ロゴあり'),
    row('判定済み', '222', 'なまえだけ一致', '問題なし', '一般面OK', 'ロゴなし'),
    row('判定済み', '333', 'レギュ側の名前', '問題なし', 'アダルトジャンル', 'ロゴなし'),
    row('判定済み', 'ー',  'ID が数字でない', '問題なし', '一般面OK', 'ロゴあり'),
    row('削除',     '999', 'ステータスが削除', '問題なし', '一般面OK', 'ロゴあり'),
  ])));

  // ---- parse phải mang được タイトルID ra (trước đây bị bỏ hẳn) ----
  check('parseRegulation doc duoc cot タイトルＩＤ full-width',
    src.parseRegulation(sheet([row('判定済み', '111', 'x', '問題なし', '一般面OK', 'ロゴあり')]))[0].titleId,
    '111');

  // ---- T1: tên + ID cùng khớp ----
  check('T1 名+ID khop -> tang 1',
    [src.lookupRegulation(work('111', 'かんぜん一致'), index).tier,
     src.lookupRegulation(work('111', 'かんぜん一致'), index).logoJudgement],
    [1, 'ロゴあり']);

  // ---- T2: tên khớp, ID lệch ----
  check('T2 ten khop nhung ID lech -> tang 2',
    [src.lookupRegulation(work('999999', 'なまえだけ一致'), index).tier,
     src.lookupRegulation(work('999999', 'なまえだけ一致'), index).logoJudgement],
    [2, 'ロゴなし']);
  check('T2 van khop khi tac pham KHONG co ID',
    src.lookupRegulation(work('', 'なまえだけ一致'), index).tier, 2);

  // ---- T3: ID khớp, tên khác hẳn — 313 tác phẩm thật rơi vào đây ----
  check('T3 ID khop nhung ten KHAC -> tang 3, van lay duoc phan dinh',
    [src.lookupRegulation(work('333', 'CMS側の別名'), index).tier,
     src.lookupRegulation(work('333', 'CMS側の別名'), index).general,
     src.lookupRegulation(work('333', 'CMS側の別名'), index).isNg],
    [3, 'アダルトジャンル', true]);

  // ---- T3 chỉ chạy khi CẢ HAI vế là số thật ----
  // Cùng lý do đã ghi ở NGUỒN 4/5: ô ID của CMS có dòng trống và dòng ghi chú
  // ('ー', '4415行目と同一'), không chặn thì chúng khớp lẫn nhau qua khoá rác.
  check('T3 KHONG khop khi ID cua レギュレーション khong phai so',
    src.lookupRegulation(work('ー', 'CMS側の別名2'), index), null);
  check('T3 KHONG khop khi ID cua tac pham khong phai so',
    src.lookupRegulation(work('4415行目と同一', 'CMS側の別名3'), index), null);

  // ---- không tra ra ----
  check('khong tra ra -> null',
    src.lookupRegulation(work('888', 'どこにもない'), index), null);
  check('dong ステータス khac 判定済み van bi bo (ke ca khi ID khop)',
    src.lookupRegulation(work('999', 'ステータスが削除'), index), null);

  // ---- buildCustomerRecord dùng index mới ----
  var loadedReg = { values: { regulation: index }, errors: { regulation: null } };
  var built = src.buildCustomerRecord(
    { titleId: '333', titleName: 'CMS側の別名', genre: 'TL' }, loadedReg);
  check('buildCustomerRecord lay duoc phan dinh qua T3',
    [built.judged, built.isNg, built.general],
    [true, true, 'アダルトジャンル']);

  // Bảng cột là tham số của engine; shim này giữ nguyên hình dạng lời gọi cũ.
  function customerRecordToRow(record, headerIndex, width, previousRow) {
    return src.toSheetRow(record, headerIndex, width, src.CUSTOMER_COLUMNS, previousRow);
  }

  // ---- GIỮ NGUYÊN ①②③ khi không phán định được (spec §3.4) ----
  var headerRow = [''].concat(src.requiredHeaders(src.CUSTOMER_COLUMNS));
  var headerIndex = src.buildHeaderIndex(headerRow);
  function cell(rowArr, name) { return rowArr[src.col(headerIndex, name)]; }
  function prevRow() {
    var r = new Array(headerRow.length).fill('');
    r[src.col(headerIndex, '①広告出稿ポリシー')] = '問題なし';
    r[src.col(headerIndex, '②一般面出稿NG')] = '一般面OK';
    r[src.col(headerIndex, '③シーモアロゴ判定')] = 'ロゴあり';
    return r;
  }
  var base = { titleNo: 1, cmsId: '', titleId: '333', titleName: 'x', author: '', genre: '',
    publisher: '', label: '', preStart: '', preEnd: '', suspensionDate: '',
    preEndExtended: '', preEndFinal: '', massFreeStart: '', massFreeEnd: '',
    titleCategory: '独占', lpProduction: '' };

  var held = customerRecordToRow(
    Object.assign({}, base, { policy: '', general: '', logoJudgement: '' }),
    headerIndex, headerRow.length, prevRow());
  check('①②③ KHONG bi xoa khi khong phan dinh duoc (spec §3.4)',
    [cell(held, '①広告出稿ポリシー'), cell(held, '②一般面出稿NG'), cell(held, '③シーモアロゴ判定')],
    ['問題なし', '一般面OK', 'ロゴあり']);

  var updated = customerRecordToRow(
    Object.assign({}, base, { policy: '問題あり', general: 'アダルト作品扱い', logoJudgement: 'ロゴなし' }),
    headerIndex, headerRow.length, prevRow());
  check('①②③ VAN ghi de duoc khi co phan dinh moi',
    [cell(updated, '①広告出稿ポリシー'), cell(updated, '②一般面出稿NG'), cell(updated, '③シーモアロゴ判定')],
    ['問題あり', 'アダルト作品扱い', 'ロゴなし']);

  var fresh = customerRecordToRow(
    Object.assign({}, base, { policy: '', general: '', logoJudgement: '' }),
    headerIndex, headerRow.length, undefined);
  check('dong MOI khong phan dinh duoc -> 3 o de rong, khong ghi undefined',
    [cell(fresh, '①広告出稿ポリシー'), cell(fresh, '②一般面出稿NG'), cell(fresh, '③シーモアロゴ判定')],
    ['', '', '']);

  // ---- RÀNG BUỘC: đường GHI và đường DIFF phải nói cùng một điều ----
  // Đây là bất biến chống churn vĩnh viễn: nếu customerRecordToRow() GIỮ ô mà
  // customerIsEqualFn lại bảo "đã đổi", dòng bị đánh dấu update mỗi lần chạy rồi ghi
  // ra đúng giá trị cũ — mãi mãi. Lặp qua REGULATION_VERDICT_FIELDS nên thêm/bớt cột
  // phán định là test tự bám theo, không phải nhớ sửa ở đây.
  src.REGULATION_VERDICT_FIELDS.forEach(function (field) {
    var incoming = Object.assign({}, base, { policy: '', general: '', logoJudgement: '' });
    var written = customerRecordToRow(incoming, headerIndex, headerRow.length, prevRow());
    var existingValue = prevRow()[src.col(headerIndex, field.header)];
    check('ghi va diff khop nhau khi ' + field.header + ' khong phan dinh duoc',
      [cell(written, field.header), src.sameKeepWhenBlankValue(existingValue, incoming[field.key])],
      [existingValue, true]);
  });

  // ---- 判定消失注意: giữ nguyên thì PHẢI báo, nếu không việc giữ là vô hình ----
  var runAt = new Date(2026, 8, 1);
  var rows = src.buildRegulationLostWarningRows([
    { record: { titleNo: 1, titleId: '333', titleName: 'mất phán định', judged: false },
      existing: { policy: '問題なし', general: '一般面OK', logoJudgement: 'ロゴあり' } },
    { record: { titleNo: 2, titleId: '444', titleName: 'chưa từng có phán định', judged: false },
      existing: { policy: '', general: '', logoJudgement: '' } },
    { record: { titleNo: 3, titleId: '555', titleName: 'bình thường', judged: true },
      existing: { policy: '問題なし', general: '一般面OK', logoJudgement: 'ロゴあり' } },
    { record: { titleNo: 4, titleId: '666', titleName: 'dòng mới', judged: false }, existing: null },
  ], runAt);
  check('判定消失注意 CHI bao khi dang giu mot phan dinh cu that',
    rows.map(function (r) { return [r.kind, r.titleNo]; }),
    [['判定消失注意', 1]]);
}


// ==============================================================================
function test_preConfirmation(ctx) {

    var src = ctx.src;
    var check = ctx.check;

    // Header thật hàng 15 của 出版社別コピーライトマスタ (E→R), copy nguyên văn kể cả \n.
    // Cột L là '(出版社)\n事前確認'; cột M cũng bắt đầu bằng '(出版社)' — đó là lý do
    // parse phải dùng tên đầy đủ chứ không phải colByPrefix('(出版社)').
    var HEADER = ['', '', '', '', '出版社', '危険', '雑誌名/レーベル', '自動化フラグ', '要注意\n作品あり',
      '順番指定', '(CL)\nC表記の\n事前確認', '(出版社)\n事前確認',
      '(出版社)\n使用画像の報告\n※テキストファイルを入れる', '著者名\n区切り方',
      'テンプレート\n(タイトルマスタで参照)'];

    function rule(publisher, label, flag, preConfirmation, template) {
      return ['', '', '', '', publisher, '', label, flag, '', '', '01：なし', preConfirmation, '', '・',
        template];
    }

    var rows = [HEADER,
      rule('集英社', '', '01：自動化', '必要', '©.集英社/作家名/タイトル名'),
      rule('集英社', 'ブリンク', '01：自動化', '不要', '『タイトル名』©著者名／ホーム社'),
      rule('個別出版', '', '02：個別ルール', '必要', '個別に確認してください'),
      rule('空欄出版', '', '01：自動化', '', '『タイトル名』©著者名／空欄出版'),
    ];
    var rules = src.parsePublisherCopyrightRules(rows);
    var lookup = src.buildPublisherCopyrightLookup(rules);

    check('事前確認: doc dung cot L (khong nham sang cot M 使用画像の報告)',
      rules.map(function (r) { return r.preConfirmation; }), ['必要', '不要', '必要', '']);

    // Tra 2 tầng giống hệt bản quyền: dòng có レーベル phải thắng dòng chỉ có 出版社.
    check('事前確認: (出版社+レーベル) thang (出版社)',
      src.resolvePublisherPreConfirmation({ publisher: '集英社', label: 'ブリンク' }, lookup), '不要');
    check('事前確認: khong co レーベル -> dung dong 出版社',
      src.resolvePublisherPreConfirmation({ publisher: '集英社', label: '' }, lookup), '必要');
    check('事前確認: レーベル la khong biet -> lui ve dong 出版社',
      src.resolvePublisherPreConfirmation({ publisher: '集英社', label: '存在しないレーベル' }, lookup), '必要');

    // Điểm khác biệt cốt lõi so với cột K: 02：個別ルール vẫn phải trả ra 事前確認.
    var manual = { publisher: '個別出版', label: '', titleName: 'タイトル', author: '著者' };
    check('事前確認: 02：個別ルール -> cot K KHONG sinh duoc',
      src.resolvePublisherCopyright(manual, lookup).value, null);
    check('事前確認: 02：個別ルール -> cot Q VAN co gia tri (khac cot K)',
      src.resolvePublisherPreConfirmation(manual, lookup), '必要');

    check('事前確認: NXB khong co dong quy tac -> rong',
      src.resolvePublisherPreConfirmation({ publisher: 'どこにもない出版社', label: '' }, lookup), '');
    check('事前確認: o nguon de trong -> rong',
      src.resolvePublisherPreConfirmation({ publisher: '空欄出版', label: '' }, lookup), '');

    // Cột nguồn bị đổi tên -> tryCol() trả undefined, parse KHÔNG throw (cột K phải
    // tiếp tục sinh được), mọi rule nhận ''.
    var renamedHeader = HEADER.slice();
    renamedHeader[11] = '(出版社)\n事前チェック';
    var renamed = src.parsePublisherCopyrightRules([renamedHeader, rule('集英社', '', '01：自動化', '必要', '©集英社')]);
    check('事前確認: cot nguon doi ten -> parse van chay, gia tri rong',
      [renamed.length, renamed[0].preConfirmation, renamed[0].template], [1, '', '©集英社']);

    // ---- Cảnh báo ----
    var runAt = new Date('2026-08-13T00:00:00Z');
    check('canh bao: chua co cot Q -> 1 dong',
      src.buildPreConfirmationWarningRows(false, rules, runAt).map(function (r) { return r.kind; }),
      ['出版社事前確認注意']);
    check('canh bao: co cot Q va nguon binh thuong -> 0 dong',
      src.buildPreConfirmationWarningRows(true, rules, runAt).length, 0);
    check('canh bao: co cot Q nhung MOI rule deu rong -> 1 dong (cot nguon doi ten)',
      src.buildPreConfirmationWarningRows(true, renamed, runAt).length, 1);
    check('canh bao: nguon loi (0 rule) -> khong bao nham "doi ten"',
      src.buildPreConfirmationWarningRows(true, [], runAt).length, 0);
}

// ==============================================================================
// Ô 更新日 — đóng dấu thời điểm chạy vào ô bên phải nhãn 更新日 của 2 master
//
// stampUpdatedAt() nằm trong src/io.js nhưng KHÔNG đụng SpreadsheetApp: nó nhận sẵn
// sheet + values và chỉ gọi getRange().setValue(). Sheet giả bên dưới ghi lại lời gọi
// đó, nên test được đúng phần dễ sai nhất — DÒ ĐÚNG Ô.
// ==============================================================================



// ==============================================================================
// ĐỐI CHIẾU DỮ LIỆU THẬT — cột 初回配信巻数 trên 1.976 tác phẩm vào master.
// Số không khớp thì tìm hiểu nguyên nhân trước, đừng sửa expected cho hết đỏ.
// ==============================================================================
function test_firstVolumeDataset(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var index = src.buildRegulationIndex(src.parseRegulation(ctx.fixtures.load('regulation')));
  var loaded = { values: { regulation: index }, errors: { regulation: null } };
  var kept = src.parseCms(ctx.fixtures.load('cms'))
    .map(function (cms) { return src.buildCustomerRecord(cms, loaded); })
    .filter(function (w) { return src.isWorkEligible(w); });
  check('vao master: 1.976 tac pham', kept.length, 1976);

  var counts = { '1': 0, XX: 0, '顧客確認': 0 };
  kept.forEach(function (w) {
    var v = src.ruleFirstVolume(w);
    if (v === '1') counts['1'] += 1;
    else if (v === '顧客確認') counts['顧客確認'] += 1;
    else counts.XX += 1;
  });
  // 17 ca 顧客確認 gồm: 8 o 巻数 TRONG, 4 o bi Sheets nuot thanh NGAY (nguoi go 1-5,
  // 1-12, 1-6), 2 o so khac 1 ('5', '2'), va 3 o co duoi ('3巻目', '1~7(7話完結)',
  // '4(シーモア限定BOOK)').
  //
  // Con so nay do tren FIXTURES (tools/verify/fixtures), khong phai tren example/*.xlsx.
  // Hai ban chup khac ngay: xlsx cho 1.977 tac pham vao master va 1 o 巻数 trong,
  // fixtures cho 1.976 va 8 o trong. Fixtures moi la thu suite nay chay tren.
  check('phan bo 1 / XX / 顧客確認', [counts['1'], counts.XX, counts['顧客確認']], [175, 1784, 17]);
  // Cột này KHÔNG BAO GIỜ rỗng: nhánh cuối vét cạn mọi thứ còn lại.
  check('khong o nao rong', counts['1'] + counts.XX + counts['顧客確認'], kept.length);
}


// ==============================================================================
// 孤立行 cua コピーライトマスタ — dong co タイトルNo ma 顧客作品マスタ khong con nua.
// Truoc day diffUpsert() im lang ve chung, nen master do tich 268 dong rac ma khong
// dong canh bao nao (do duoc tren sheet that 2026-09-02).
// ==============================================================================
function test_copyrightOrphans(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var COLS = [{ header: 'タイトル名', field: 'titleName', from: 'customer', write: '上書' }];
  var keyFn = function (r) { return String(r.titleNo); };
  var eq = function (a, b) { return src.recordsEqual(a, b, COLS); };

  // 顧客作品マスタ bi xoa lam lai: タイトルNo cap lai tu 1, con コピーライトマスタ giu
  // nguyen so cu 1988/1990 -> 2 dong do thanh rac.
  var existing = [
    { titleNo: 1, titleName: 'A', sheetRow: 16 },
    { titleNo: 1988, titleName: 'cu 1', sheetRow: 17 },
    { titleNo: 1990, titleName: 'cu 2', sheetRow: 18 },
  ];
  var incoming = [{ titleNo: 1, titleName: 'A' }, { titleNo: 2, titleName: 'B' }];
  var diff = src.diffUpsert(existing, incoming, keyFn, eq);

  check('diffUpsert bao dung 2 dong rac',
    diff.orphans.map(function (r) { return r.titleNo; }), [1988, 1990]);
  check('dong khop khong bi tinh la rac',
    [diff.toAdd.length, diff.unchangedKeys.length], [1, 1]);

  var runAt = new Date(2026, 8, 2);
  var few = src.buildCopyrightOrphanWarningRows(diff.orphans, runAt);
  check('duoi nguong -> 1 dong moi tac pham',
    few.map(function (r) { return [r.kind, r.titleNo]; }),
    [['孤立行', 1988], ['孤立行', 1990]]);

  // 268 dong canh bao rieng le se chon mat moi canh bao khac cua lan chay do.
  var many = [];
  for (var i = 0; i < 268; i++) many.push({ titleNo: 1000 + i, titleName: 'x', titleId: '' });
  var summary = src.buildCopyrightOrphanWarningRows(many, runAt);
  check('vuot nguong -> gop thanh 1 dong tong', summary.length, 1);
  check('dong tong noi ro so luong va cach xu ly',
    [summary[0].detail.indexOf('268 行') >= 0,
      summary[0].detail.indexOf('コピーライトマスタ も消してください') >= 0], [true, true]);

  check('khong co rac -> khong dong nao', src.buildCopyrightOrphanWarningRows([], runAt).length, 0);
}

module.exports = {
  unit: [test_loadSources, test_cmsVolumes, test_firstVolume,
    test_lpProduction, test_preEndFinal, test_customerColumns, test_buildCustomerRecord, test_copyrightOrphans,
    test_cascade, test_filter, test_warnings, test_suspension, test_preEndAndMassFree, test_regulationCascadeAndHold, test_preConfirmation],
  data: [test_firstVolumeDataset],
};

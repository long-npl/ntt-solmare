// tools/verify/tests.js — toàn bộ test của tầng pure, gom theo VẤN ĐỀ.
//
// Mỗi hàm test_* là 1 vấn đề độc lập, nhận ctx = {src, check, fixtures}:
//   src      — global object của vm context đã nạp src/*.js (xem run.js)
//   check    — check(label, actual, expected)
//   fixtures — fixtures.load('cms') đọc tools/verify/fixtures/cms.json
//
// Chạy: node tools/verify/run.js [--data]
//
// test_dataset cần dữ liệu thật (fixtures export từ example/*.xlsx) nên nằm ở
// nhóm `data`, chỉ chạy khi có cờ --data.

// ==============================================================================
// HARNESS — chứng minh nạp được src/ vào vm context
// pure của src/. Chỉ dùng hàm đã tồn tại từ trước, nên file này phải PASS ngay.
// ==============================================================================
function test_harness(ctx) {

    var src = ctx.src;
    var check = ctx.check;

    // normalizeJapaneseText: gộp 〜/～ + NFKC (src/logic/upsert.js)
    check('normalizeJapaneseText gop wave dash va fullwidth tilde',
      src.normalizeJapaneseText('落城の美姫〜甘い執着〜') === src.normalizeJapaneseText('落城の美姫～甘い執着～'),
      true);
    check('normalizeJapaneseText coi null/undefined/rong nhu nhau',
      [src.normalizeJapaneseText(null), src.normalizeJapaneseText(undefined), src.normalizeJapaneseText('  ')],
      ['', '', '']);

    // headerMap: normalizeHeaderText bỏ khoảng trắng full-width + newline
    check('normalizeHeaderText bo newline trong header',
      src.normalizeHeaderText('①広告出稿ポリシー\n（出稿NG）'),
      '①広告出稿ポリシー（出稿NG）');

    // findHeaderRowIndex dò được hàng header không phải hàng 1
    var rows = [['ghi chú'], [''], ['タイトルNo', 'タイトル名'], [1, 'abc']];
    check('findHeaderRowIndex do dung hang header',
      src.findHeaderRowIndex(rows, ['タイトルNo', 'タイトル名']),
      2);
}

// ==============================================================================
// NGUỒN レギュレーション — colByPrefix, định nghĩa NG, lookup theo tên
// Header thật của sheet シート1 (hàng 4), copy nguyên văn kể cả \n trong header
// cột ① và ② — xem example/【池永社内】【社外用】作品レギュレーション判定.xlsx
// ==============================================================================
function test_regulation(ctx) {
  var HEADER = ['No', 'ステータス', '更新日', 'ＣＭＳID', 'タイトルＩＤ', 'タイトル名', 'ジャンル',
    '出版社', '①広告出稿ポリシー\n（出稿NG）', '②一般面出稿NG\n（アダルト作品扱い）', '③シーモアロゴ判定'];

  function sheet(rows) {
    return [['ghi chú 1'], ['ghi chú 2'], ['ghi chú 3'], HEADER].concat(rows);
  }

  /** 1 dòng data theo đúng thứ tự HEADER ở trên. */
  function row(status, titleName, policy, general, logo) {
    return ['1', status, '', '5948', '333581', titleName, 'TL', '', policy, general, logo];
  }


    var src = ctx.src;
    var check = ctx.check;

    // ---- colByPrefix ----
    var idx = src.buildHeaderIndex(HEADER);
    check('colByPrefix tim duoc cot ① du header co hau to ghi chu', src.colByPrefix(idx, '①広告出稿ポリシー'), 8);
    check('colByPrefix tim duoc cot ②', src.colByPrefix(idx, '②一般面出稿NG'), 9);
    check('colByPrefix van khop khi ten dung bang ca header', src.colByPrefix(idx, '③シーモアロゴ判定'), 10);
    var threwMissing = false;
    try { src.colByPrefix(idx, '④存在しない列'); } catch (e) { threwMissing = true; }
    check('colByPrefix throw khi khong cot nao khop', threwMissing, true);
    var threwAmbiguous = false;
    try { src.colByPrefix(src.buildHeaderIndex(['先行終了日', '先行終了日（延長）']), '先行終了日'); } catch (e) { threwAmbiguous = true; }
    check('colByPrefix throw khi >1 cot khop prefix', threwAmbiguous, true);

    // ---- parseRegulationRows: chỉ 判定済み ----
    var parsed = src.parseRegulationRows(sheet([
      row('判定済み', 'A作品', '問題なし', '一般面OK', 'ロゴなし'),
      row('判定中', 'B作品', '問題なし', '一般面OK', 'ロゴあり'),
      row('削除', 'C作品', '問題あり', 'アダルトジャンル', 'ロゴなし'),
      row('Wチェック待ち', 'D作品', '問題なし', '一般面OK', 'ロゴなし'),
      row('判定済み', 'E作品', '問題あり', 'アダルト作品扱い', 'ロゴあり'),
    ]));
    check('parseRegulationRows chi giu dong 判定済み', parsed.map(function (r) { return r.titleName; }), ['A作品', 'E作品']);
    check('parseRegulationRows giu nguyen van 3 cot', [parsed[1].policy, parsed[1].general, parsed[1].logoJudgement],
      ['問題あり', 'アダルト作品扱い', 'ロゴあり']);
    check('parseRegulationRows KHONG con tra cmsId/titleId',
      [parsed[0].cmsId === undefined, parsed[0].titleId === undefined], [true, true]);

    // ---- isRegulationNg: đúng theo spec §3.2 ----
    function ng(policy, general) { return src.isRegulationNg({ policy: policy, general: general }); }
    check('NG: ①=問題あり', ng('問題あり', '一般面OK'), true);
    check('NG: ②=アダルト作品扱い', ng('問題なし', 'アダルト作品扱い'), true);
    check('NG: ②=アダルトジャンル', ng('問題なし', 'アダルトジャンル'), true);
    // 4 giá trị spec §3.2 đã đo là KHÔNG tính NG — đừng "sửa cho hợp lý hơn"
    check('KHONG NG: ②=出稿NG (6 dong that, spec §3.2 chot la khong loai)', ng('問題なし', '出稿NG'), false);
    check('KHONG NG: ①=素材不足により判定不可', ng('素材不足により判定不可', '一般面OK'), false);
    check('KHONG NG: ②=素材不足により判定不可', ng('問題なし', '素材不足により判定不可'), false);
    check('KHONG NG: ② trong', ng('問題なし', ''), false);
    check('KHONG NG: ca 2 trong', ng('', ''), false);
    // chuẩn hoá chỉ để so khớp: khoảng trắng full-width vẫn phải nhận ra là NG
    check('NG nhan ra du co khoang trang full-width quanh gia tri', ng('　問題あり　', ''), true);

    // ---- buildRegulationLookup: khoá theo tên, NG thắng ----
    var lookup = src.buildRegulationLookup(src.parseRegulationRows(sheet([
      row('判定済み', '落城の美姫〜甘い執着〜', '問題なし', '一般面OK', 'ロゴなし'),
      row('判定済み', '同名作品', '問題なし', '一般面OK', 'ロゴなし'),
      row('判定済み', '同名作品', '問題なし', 'アダルトジャンル', 'ロゴあり'),
      row('判定済み', '同名作品', '問題なし', '一般面OK', 'ロゴなし'),
      row('判定済み', '', '問題なし', '一般面OK', 'ロゴなし'),
    ])));
    check('lookup tra duoc qua NFKC (〜 vs ～)',
      lookup.get(src.normalizeJapaneseText('落城の美姫～甘い執着～')).logoJudgement, 'ロゴなし');
    check('lookup: ten trung thi dong NG thang, ke ca khi dong NG khong o cuoi',
      [lookup.get('同名作品').isNg, lookup.get('同名作品').general], [true, 'アダルトジャンル']);
    check('lookup bo qua dong タイトル名 trong', lookup.has(''), false);
    check('lookup co dung 2 khoa', lookup.size, 2);
}

// ==============================================================================
// NGUỒN CMS — lọc dòng theo タイトル名, bản quyền tầng 1
// ==============================================================================
function test_cms(ctx) {
  var HEADER = ['CMSID', 'タイトルID', 'タイトル名', '作家名', 'ジャンル', 'レーベル名',
    '出版社', '先行開始日', '先行終了日', 'コピーライト'];

  function sheet(rows) { return [HEADER].concat(rows); }


    var src = ctx.src;
    var check = ctx.check;

    var parsed = src.parseCmsRows(sheet([
      [1611, 262237, '鬼の戀 単話版', '桜田霊子', '少女', 'レーベルA', 'スターツ出版', '2026-01-01', '未定', '©桜田霊子/スターツ出版'],
      ['', 262238, 'CMSID trong nhung co ten', '作家B', '女性', '', '出版社B', '', '', ''],
      [1612, '', '', '作家C', '女性', '', '出版社C', '', '', ''],
      [1613, 'ー', 'titleID la placeholder', '作家D', '女性', '', '出版社D', '', '', ''],
      [1614, 262240, '　', '作家E', '女性', '', '出版社E', '', '', ''],
    ]));

    check('parseCmsRows loc theo タイトル名 (giu ca dong CMSID trong, bo dong ten chi co khoang trang)',
      parsed.map(function (r) { return r.titleName; }),
      ['鬼の戀 単話版', 'CMSID trong nhung co ten', 'titleID la placeholder']);
    check('parseCmsRows giu nguyen van タイトルID ke ca placeholder', parsed[2].titleId, 'ー');
    check('parseCmsRows van parse レーベル名 va コピーライト',
      [parsed[0].label, parsed[0].copyrightU], ['レーベルA', '©桜田霊子/スターツ出版']);
    check('buildCmsCopyrightLookup da bi xoa', typeof src.buildCmsCopyrightLookup, 'undefined');

    // Tầng 1 cũ (CMS コピーライト) giờ là cột J của コピーライトマスタ, main.js copy
  // nguyên văn — logic sinh bản quyền chuyển hết sang test_copyright.
  check('parseCmsRows mang copyrightU sang de main.js copy vao cot J',
    parsed[0].copyrightU, '©桜田霊子/スターツ出版');
}

// ==============================================================================
// BUILD — gắn phán định + cờ judged/isNg cho work
// ==============================================================================
function test_workRows(ctx) {

    var src = ctx.src;
    var check = ctx.check;

    function reg(policy, general, logo) {
      return {
        policy: policy,
        general: general,
        logoJudgement: logo,
        isNg: src.isRegulationNg({ policy: policy, general: general }),
      };
    }
    // Khoá của lookup LUÔN là tên đã chuẩn hoá — mô phỏng đúng buildRegulationLookup()
    var lookup = new Map([
      [src.normalizeJapaneseText('落城の美姫～甘い執着～'), reg('問題なし', '一般面OK', 'ロゴなし')],
      [src.normalizeJapaneseText('アダルト作品'), reg('問題なし', 'アダルト作品扱い', 'ロゴあり')],
      [src.normalizeJapaneseText('政策NG作品'), reg('問題あり', '一般面OK', 'ロゴなし')],
    ]);

    var cmsRecords = [
      // CMS ghi bằng WAVE DASH U+301C, レギュレーション ghi FULLWIDTH TILDE U+FF5E
      { cmsId: 1, titleId: 100, titleName: '落城の美姫〜甘い執着〜', author: '作家1', genre: '女性',
        label: 'レーベル1', publisher: '出版社1', preStart: 's1', preEnd: 'e1', copyrightU: '©1' },
      { cmsId: 2, titleId: 200, titleName: 'アダルト作品', author: '作家2', genre: 'TL',
        label: '', publisher: '出版社2', preStart: '', preEnd: '', copyrightU: '' },
      { cmsId: 3, titleId: 300, titleName: '政策NG作品', author: '作家3', genre: 'BL',
        label: '', publisher: '出版社3', preStart: '', preEnd: '', copyrightU: '' },
      { cmsId: 4, titleId: 400, titleName: 'レギュレーションに無い作品', author: '作家4', genre: '女性',
        label: '', publisher: '出版社4', preStart: '', preEnd: '', copyrightU: '' },
    ];

    var works = src.buildCustomerWorkRows(cmsRecords, lookup);

    check('buildCustomerWorkRows giu nguyen so luong va thu tu CMS', works.length, 4);
    check('khop duoc qua NFKC va lay nguyen van 3 cot tu レギュレーション',
      [works[0].judged, works[0].isNg, works[0].policy, works[0].general, works[0].logoJudgement],
      [true, false, '問題なし', '一般面OK', 'ロゴなし']);
    check('cot タイトル名 giu nguyen cach viet cua CMS (U+301C), KHONG lay khoa da chuan hoa',
      works[0].titleName, '落城の美姫〜甘い執着〜');
    check('isNg=true khi ②=アダルト作品扱い', [works[1].judged, works[1].isNg], [true, true]);
    check('isNg=true khi ①=問題あり', [works[2].judged, works[2].isNg], [true, true]);
    check('未判定: judged=false, 3 cot rong, isNg=false',
      [works[3].judged, works[3].isNg, works[3].policy, works[3].general, works[3].logoJudgement],
      [false, false, '', '', '']);
    check('work mang label va copyrightU sang (cho cot O va cho tang 1 ban quyen)',
      [works[0].label, works[0].copyrightU], ['レーベル1', '©1']);
    check('work KHONG con field remark/distributionNgFlag',
      [works[0].remark === undefined, works[0].distributionNgFlag === undefined], [true, true]);
}

// ==============================================================================
// KHOÁ UPSERT — cascade 3 tầng, chiếm-một-lần, 4 hàm so sánh
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

    // ---- diffUpsertFromMatches ----
    var isEqualFn = function (a, b) { return src.sameValue(a.titleName, b.titleName); };
    var diff = src.diffUpsertFromMatches(numbered, isEqualFn);
    check('diffUpsertFromMatches: 1 them moi, 0 update, 2 khong doi',
      [diff.toAdd.length, diff.toUpdate.length, diff.unchangedKeys.length], [1, 0, 2]);
    check('toAdd la record da co titleNo', diff.toAdd[0].titleNo, 10);

    var diff2 = src.diffUpsertFromMatches(
      [{ record: { titleNo: 5, titleName: 'A doi ten' }, existing: existingRows[0], rowOffset: 0, tier: 2 }],
      isEqualFn);
    check('toUpdate mang san sheetRow + previous, khong can attachRowOffsets',
      [diff2.toUpdate[0].sheetRow, diff2.toUpdate[0].previous.titleName, diff2.toUpdate[0].rowOffset],
      [20, 'A', 0]);
}

// ==============================================================================
// BỘ LỌC — rule 1, rule 2, ưu tiên 2 phase, 孤立行
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

    // ---- changeDetail: fieldDef có compare tuỳ chọn ----
    var detailRows = src.buildChangeDetailRows('顧客作品マスタ', [{
      key: '1',
      previous: { titleName: 'A', preStart: new Date(2026, 2, 27, 0, 0), author: 'X' },
      record: { titleNo: 1, titleName: 'A', preStart: new Date(2026, 2, 27, 9, 0), author: 'Y' },
    }], [
      { key: 'preStart', label: '先行開始日', compare: src.sameDateValue },
      { key: 'author', label: '作家名' },
    ], runAt);
    check('changeDetail: field ngay dung compare rieng -> cung ngay khac gio KHONG log',
      detailRows.map(function (r) { return r.field; }), ['作家名']);
}

// ==============================================================================
// BẢN QUYỀN — tra rule theo 出版社(+レーベル), sinh template, 3 lý do không sinh được
// ==============================================================================
function test_copyright(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  // Header thật của 出版社別コピーライトマスタ (hàng 15), chỉ giữ các cột code đọc.
  var HEADER = ['出版社', '危険', '雑誌名/レーベル', '自動化フラグ', '要注意\n作品あり', '順番指定',
    '(CL)\nC表記の\n事前確認', '(出版社)\n事前確認', '(出版社)\n使用画像の報告', '著者名\n区切り方',
    'テンプレート\n(タイトルマスタで参照)'];

  /** 1 dòng rule theo đúng thứ tự HEADER. */
  function rule(publisher, label, flag, template) {
    return [publisher, '', label, flag, '', '', '', '', '', '・', template];
  }
  function sheet(rows) { return [['ghi chú'], HEADER].concat(rows); }

  var rules = src.parsePublisherCopyrightRules(sheet([
    rule('集英社', '', '01：自動化', '©.集英社/作家名/タイトル名'),
    rule('集英社', 'ブリンク', '01：自動化', '『タイトル名』©著者名／ホーム社'),
    rule('小学館', '', '01：自動化', '『タイトル名』©著者名 / 小学館'),
    rule('AZITO', '', '01：自動化', '©雑誌名'),
    rule('レジンコミックス', '', '01：自動化', '©レジンコミックス'),
    rule('ヒーローズ', '', '01：自動化', 'コピーライトルール参照して個別記載'),
    rule('アスタリスク文庫', '', '01：自動化', '都度問い合わせ要'),
    rule('サード・ライン', '', '01：自動化', '©著 ©原作 ©SANKYO'),
    rule('KADOKAWA', '', '02：個別ルール', '『タイトル名』©著者名（ローマ字）'),
    rule('オトナ恋', 'ライブコミックス', '02：個別ルール', '『タイトル名』©オトナ恋'),
    rule('オトナ恋', 'ライブコミックス', '01：自動化', 'dòng trùng khoá, phải bị bỏ ©X'),
    rule('', '', '01：自動化', 'dòng không có 出版社, phải bị bỏ'),
  ]));
  check('parsePublisherCopyrightRules bo dong khong co 出版社', rules.length, 11);

  var lookup = src.buildPublisherCopyrightLookup(rules);
  check('lookup: khoa trung thi dong DAU TIEN thang',
    lookup.get(src.publisherCopyrightKey('オトナ恋', 'ライブコミックス')).flag, '02：個別ルール');

  function work(publisher, label, titleName, author) {
    return { publisher: publisher, label: label, titleName: titleName, author: author };
  }

  // ---- Tầng レーベル phải thắng tầng 出版社 ----
  var shueishaNoLabel = src.resolvePublisherCopyright(work('集英社', '', 'テスト作品', 'テスト作家'), lookup);
  check('khong co レーベル -> dung rule cua 出版社',
    [shueishaNoLabel.reason, shueishaNoLabel.value],
    [src.COPYRIGHT_REASON_OK, '©.集英社/テスト作家/テスト作品']);
  var shueishaBlink = src.resolvePublisherCopyright(work('集英社', 'ブリンク', 'テスト作品', 'テスト作家'), lookup);
  check('co レーベル khop -> rule レーベル THANG (ghi ten cong ty khac!)',
    shueishaBlink.value, '『テスト作品』©テスト作家／ホーム社');
  var shueishaOtherLabel = src.resolvePublisherCopyright(work('集英社', 'レーベル lạ', 'テスト作品', 'テスト作家'), lookup);
  check('レーベル khong khop -> roi ve rule cua 出版社',
    shueishaOtherLabel.value, '©.集英社/テスト作家/テスト作品');

  // ---- placeholder レーベル/雑誌名 ----
  check('placeholder 雑誌名 duoc dien bang レーベル名 cua tac pham',
    src.resolvePublisherCopyright(work('AZITO', 'AZITOレーベル', 'X', 'Y'), lookup).value, '©AZITOレーベル');
  check('template doi レーベル ma tac pham khong co -> KHONG sinh (tranh ban quyen khuyet)',
    src.resolvePublisherCopyright(work('AZITO', '', 'X', 'Y'), lookup).reason,
    src.COPYRIGHT_REASON_BAD_TEMPLATE);

  // ---- template không có placeholder nhưng LÀ bản quyền hoàn chỉnh ----
  check('template ban quyen cung (khong placeholder) van hop le',
    src.resolvePublisherCopyright(work('レジンコミックス', '', 'X', 'Y'), lookup).value, '©レジンコミックス');

  // ---- CÁI BẪY: template là câu chỉ thị, không phải bản quyền ----
  check('template la cau chi thi (khong co ©) -> KHONG BAO GIO ghi ra sheet',
    [src.resolvePublisherCopyright(work('ヒーローズ', '', 'X', 'Y'), lookup).reason,
      src.resolvePublisherCopyright(work('ヒーローズ', '', 'X', 'Y'), lookup).value,
      src.resolvePublisherCopyright(work('アスタリスク文庫', '', 'X', 'Y'), lookup).reason],
    [src.COPYRIGHT_REASON_BAD_TEMPLATE, null, src.COPYRIGHT_REASON_BAD_TEMPLATE]);
  check('looksLikeCopyrightTemplate: chi thi vs ban quyen',
    [src.looksLikeCopyrightTemplate('都度問い合わせ要'), src.looksLikeCopyrightTemplate('©レジンコミックス'),
      src.looksLikeCopyrightTemplate('(C)ABC'), src.looksLikeCopyrightTemplate(''),
      src.looksLikeCopyrightTemplate(null)],
    [false, true, true, false, false]);

  // ---- placeholder không điền được từ CMS ----
  var sanko = src.resolvePublisherCopyright(work('サード・ライン', '', 'X', 'Y'), lookup);
  check('placeholder ©著/©原作 khong dien duoc -> BAD_TEMPLATE, khong doan',
    [sanko.reason, sanko.value], [src.COPYRIGHT_REASON_BAD_TEMPLATE, null]);

  // ---- cờ 02：個別ルール ----
  var kadokawa = src.resolvePublisherCopyright(work('KADOKAWA', '', 'X', 'Y'), lookup);
  check('co 02：個別ルール -> de trong + ly do 個別ルール',
    [kadokawa.reason, kadokawa.value], [src.COPYRIGHT_REASON_MANUAL_FLAG, null]);

  // ---- NXB không có rule ----
  var unknown = src.resolvePublisherCopyright(work('出版社 chưa có rule', '', 'X', 'Y'), lookup);
  check('NXB khong co rule -> ly do ルール無し',
    [unknown.reason, unknown.value], [src.COPYRIGHT_REASON_NO_RULE, null]);

  // ---- effectiveCopyright: J thắng K ----
  check('effectiveCopyright: J uu tien hon K',
    [src.effectiveCopyright({ individualCopyright: '©J', publisherCopyright: '©K' }),
      src.effectiveCopyright({ individualCopyright: '', publisherCopyright: '©K' }),
      src.effectiveCopyright({ individualCopyright: '  ', publisherCopyright: '' })],
    ['©J', '©K', '']);

  // ---- Lịch sử 5 slot ----
  var noChange = src.shiftCopyrightHistory({ copyrightHistory: ['©cũ1'] }, '©A', '©A', 5);
  check('lich su KHONG dich khi gia tri khong doi',
    [noChange.changed, noChange.copyrightHistory], [false, ['©cũ1']]);
  var variant = src.shiftCopyrightHistory({ copyrightHistory: [] }, '(C)A', 'ⒸA', 5);
  check('lich su KHONG dich khi chi khac bien the ky hieu ©', variant.changed, false);
  var changed = src.shiftCopyrightHistory({ copyrightHistory: ['©cũ1', '©cũ2'] }, '©A', '©B', 5);
  check('lich su dich khi gia tri that su doi',
    [changed.changed, changed.copyrightHistory], [true, ['©A', '©cũ1', '©cũ2']]);
  var full = src.shiftCopyrightHistory({ copyrightHistory: ['1', '2', '3', '4', '5'] }, '©A', '©B', 5);
  check('lich su cat con 5 slot (6 tro len bi xoa theo yeu cau nghiep vu)',
    full.copyrightHistory, ['©A', '1', '2', '3', '4']);
  var brandNew = src.shiftCopyrightHistory(null, '', '©A', 5);
  check('dong moi (khong co gia tri cu) -> lich su rong', brandNew.copyrightHistory, []);

  // ---- BUG TIỀM ẨN đã từng có: token là chuỗi con của TÊN NXB THẬT ----
  // 4 ca này không xuất hiện trong dữ liệu hôm nay (không tác phẩm nào thuộc mấy
  // NXB đó), nên chạy trên dữ liệu thật KHÔNG phát hiện được — chỉ test đơn vị bắt
  // được. Bản đầu có token '出版社' và 'レーベル' (không kèm 名) và sinh ra:
  //   英和出版社   -> '英和英和出版社'      (nhân đôi tên NXB)
  //   笠倉出版社   -> '笠倉笠倉出版社'      (nhân đôi)
  //   ダイヤモンド社 -> 'ダイヤモンド社名'    (dính chữ 名)
  //   サイゾー     -> 'サイゾーレーベル名'  (dính chữ 名)
  var literalRules = src.buildPublisherCopyrightLookup(src.parsePublisherCopyrightRules(sheet([
    rule('英和出版社', '', '01：自動化', '『タイトル名』©著者名/英和出版社'),
    rule('笠倉出版社', '', '01：自動化', '『タイトル名』©著者名/笠倉出版社'),
    rule('ダイヤモンド社', '', '01：自動化', '『タイトル名』©著者名/出版社名'),
    rule('サイゾー', '', '01：自動化', '『タイトル名』©著者名／レーベル名'),
    rule('MATA出版', '', '01：自動化', '『タイトル』©漫画家名/©原作者名/©レーベル名'),
    rule('TOブックス', '', '01：自動化', '『タイトル名』© 著者名 / 原作者名（英語）'),
    rule('画家出版', '', '01：自動化', '『タイトル名』©イラストレーター名/画家出版'),
  ])));
  function gen(publisher, label) {
    return src.resolvePublisherCopyright(
      { publisher: publisher, label: label, titleName: 'ある作品', author: '山田' }, literalRules).value;
  }
  check('ten NXB that chua chu 出版社 -> KHONG bi thay (khong nhan doi)',
    [gen('英和出版社', ''), gen('笠倉出版社', '')],
    ['『ある作品』©山田/英和出版社', '『ある作品』©山田/笠倉出版社']);
  check('placeholder 出版社名 duoc thay dung, khong de lai chu 名',
    gen('ダイヤモンド社', ''), '『ある作品』©山田/ダイヤモンド社');
  check('placeholder レーベル名 duoc thay dung, khong de lai chu 名',
    gen('サイゾー', 'サイゾーレーベル'), '『ある作品』©山田／サイゾーレーベル');

  // ---- Placeholder đòi thông tin CMS không có -> BAD_TEMPLATE, không đoán ----
  function reasonOf(publisher) {
    return src.resolvePublisherCopyright(
      { publisher: publisher, label: 'L', titleName: 'X', author: 'Y' }, literalRules).reason;
  }
  check('原作者名 / 漫画家名 / イラストレーター名 deu la placeholder KHONG dien duoc',
    [reasonOf('MATA出版'), reasonOf('TOブックス'), reasonOf('画家出版')],
    [src.COPYRIGHT_REASON_BAD_TEMPLATE, src.COPYRIGHT_REASON_BAD_TEMPLATE,
      src.COPYRIGHT_REASON_BAD_TEMPLATE]);

  // ---- Thay 1 lượt: giá trị vừa chèn KHÔNG được quét lại ----
  // Tác phẩm có tên chứa đúng chữ '著者名' — nếu thay theo từng token nhiều lượt,
  // lượt sau sẽ ăn vào tên tác phẩm vừa chèn.
  var trickyRules = src.buildPublisherCopyrightLookup(src.parsePublisherCopyrightRules(sheet([
    rule('T社', '', '01：自動化', '『タイトル名』©著者名/T社'),
  ])));
  check('gia tri vua chen khong bi quet lai (ten tac pham chua chu 著者名)',
    src.resolvePublisherCopyright(
      { publisher: 'T社', label: '', titleName: '著者名のひみつ', author: '山田' }, trickyRules).value,
    '『著者名のひみつ』©山田/T社');

  // ---- コピーライト注意: GOM theo NXB, không phải 1 dòng/1 tác phẩm ----
  function cwEntry(publisher, label, titleName, reason) {
    return {
      record: { titleNo: 1, titleId: 1, titleName: titleName, publisher: publisher, label: label },
      copyrightReason: reason,
      copyrightDetail: 'chi tiet',
    };
  }
  var cwRows = src.buildCopyrightWarningRows([
    cwEntry('ソルマーレ編集部', '', 'A', 'ルール無し'),
    cwEntry('ソルマーレ編集部', '', 'B', 'ルール無し'),
    cwEntry('ソルマーレ編集部', '', 'C', 'ルール無し'),
    cwEntry('ソルマーレ編集部', '', 'D', 'ルール無し'),
    cwEntry('ソルマーレ編集部', 'レーベルX', 'E', 'ルール無し'),
    cwEntry('TOブックス', '', 'F', 'テンプレート不備'),
    cwEntry('ソルマーレ編集部', '', 'G', '個別ルール'),
  ], new Date(2026, 7, 4));
  check('gom 7 tac pham thanh 4 dong (NXB + レーベル + ly do)', cwRows.length, 4);
  check('dong gom mang so luong + toi da 3 ten vi du',
    [cwRows[0].detail.indexOf('4 件') !== -1, cwRows[0].detail.indexOf('A / B / C') !== -1,
      cwRows[0].detail.indexOf(' / D') === -1],
    [true, true, true]);
  check('dong gom de trong titleNo/titleId (noi ve NXB, khong ve 1 dong master)',
    [cwRows[0].titleNo, cwRows[0].titleId], ['', '']);
  check('レーベル duoc ghi kem NXB de phan biet', cwRows[1].titleName, 'ソルマーレ編集部／レーベルX');
}

// ==============================================================================
// NGUỒN 掲載停止日付 — join theo タイトルID, ghi một lần
//
// Header dùng trong test là tên GIẢ ĐỊNH ('タイトルID' / '掲載停止日付') — mục đích
// là kiểm LOGIC parse/lookup/ghi-một-lần, không phải kiểm tên cột thật. Tên thật
// nằm ở CONFIG.SOURCES.SUSPENSION và được truyền vào như tham số (chính vì vậy
// parseSuspensionRows nhận tên cột qua tham số chứ không hardcode).
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
  try { src.parseSuspensionRows(TSV, '', 'D'); } catch (e) { threwEmptyColumn = true; }
  check('parseSuspensionRows throw khi CONFIG chua dien cot', threwEmptyColumn, true);

  // ---- parse: KHÔNG lọc gì, kể cả hàng header ----
  var records = src.parseSuspensionRows(TSV, 'A', 'D');
  check('parseSuspensionRows doc HET dong ke ca hang header (loc o buoc lookup)', records.length, 7);
  check('parseSuspensionRows lay dung cot A va D',
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
  var noHeaderLookup = src.buildSuspensionLookup(src.parseSuspensionRows(TSV.slice(1), 'A', 'D'));
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
function test_dataset(ctx) {

    var src = ctx.src;
    var check = ctx.check;

    var regulationRows = ctx.fixtures.load('regulation');
    var cmsRows = ctx.fixtures.load('cms');

    // ---- Nguồn レギュレーション (spec §12) ----
    var regulationRecords = src.parseRegulationRows(regulationRows);
    check('レギュレーション: so dong ステータス=判定済み', regulationRecords.length, 5158);
    var lookup = src.buildRegulationLookup(regulationRecords);
    check('レギュレーション: so ten duy nhat trong 判定済み (14 ten trung)', lookup.size, 5144);

    // ---- Nguồn CMS (spec §12) ----
    //
    // 5.678 chứ KHÔNG phải 5.649 như spec §12: spec đo khi bộ lọc còn theo CMSID,
    // còn bây giờ lọc theo タイトル名 (spec §5.5). Chênh lệch đúng 29 dòng, và 29
    // dòng đó KHÔNG phải tác phẩm thật — chúng là DÒNG LỆCH CỘT trong file nguồn:
    // ô タイトルID chứa chuỗi copyright ('©Kim.PD/Active Volcano/TOPTOON'), ô
    // タイトル名 chứa nội dung あらすじ. Đo lại 2026-08-04: cả 29 dòng đều 未判定
    // (không tra ra tên nào trong レギュレーション) nên KHÔNG dòng nào vào master —
    // đó là lý do 2 con số quan trọng nhất (判定済み 2.325 và vào master 1.730)
    // vẫn khớp spec chính xác.
    //
    // Bộ lọc CMSID cũ vô tình chặn được đám này. main.js log riêng số dòng "có tên
    // nhưng không có CMSID" để chúng không lẫn im lặng vào 除外_未判定件数.
    var cmsRecords = src.parseCmsRows(cmsRows);
    check('CMS: tong so dong co タイトル名 (do lai 2026-08-04)', cmsRecords.length, 5678);
    check('CMS: 0 dong タイトル名 trong (co so cua viec loc theo ten)',
      cmsRecords.filter(function (r) { return src.normalizeJapaneseText(r.titleName) === ''; }).length, 0);
    check('CMS: 29 dong lech cot (co ten, khong co CMSID) — dam nay deu 未判定',
      cmsRecords.filter(function (r) { return String(r.cmsId === null || r.cmsId === undefined ? '' : r.cmsId).trim() === ''; }).length,
      29);

    // ---- Join + phân loại (spec §12) ----
    var works = src.buildCustomerWorkRows(cmsRecords, lookup);
    var judged = works.filter(function (w) { return w.judged; });
    check('tra ra ten 完全一致', judged.length, 2325);
    check('trong so tra ra: NG', judged.filter(function (w) { return w.isNg; }).length, 595);
    check('trong so tra ra: khong NG -> vao master', judged.filter(function (w) { return !w.isNg; }).length, 1730);
    // 3.353 = 3.324 (spec §12) + 29 dòng lệch cột nói ở trên.
    check('未判定 (do lai 2026-08-04)', works.length - judged.length, 3353);
    // Phân tích NG theo giá trị (spec §12): アダルト作品扱い 374, アダルトジャンル 221, 問題あり 0
    var ngByGeneral = { adultWork: 0, adultGenre: 0, policyOnly: 0 };
    judged.filter(function (w) { return w.isNg; }).forEach(function (w) {
      var general = src.normalizeJapaneseText(w.general);
      if (general === 'アダルト作品扱い') ngByGeneral.adultWork += 1;
      else if (general === 'アダルトジャンル') ngByGeneral.adultGenre += 1;
      else ngByGeneral.policyOnly += 1;
    });
    check('NG chia theo gia tri (quy tac ① chua loai duoc dong nao)',
      [ngByGeneral.adultWork, ngByGeneral.adultGenre, ngByGeneral.policyOnly], [374, 221, 0]);

    // ---- Mô phỏng 4 lần chạy liên tiếp (spec §5.4) ----
    // isEqual chỉ so 2 field mà mô phỏng này theo dõi — đủ để phát hiện đúng 110
    // dòng đổi định danh ở lần 3.
    function isEqualFn(a, b) {
      return src.sameValue(a.titleId, b.titleId) && src.sameValue(a.titleName, b.titleName);
    }
    /** Giả lập việc ghi sheet: update ghi đè đúng dòng, thêm mới append vào cuối. */
    function applyToMaster(numbered, existingRows) {
      var rows = existingRows.map(function (r) { return Object.assign({}, r); });
      numbered.forEach(function (m) {
        var row = { titleNo: m.record.titleNo, titleId: m.record.titleId, titleName: m.record.titleName };
        if (m.existing) rows[m.rowOffset] = row;
        else rows.push(row);
      });
      rows.forEach(function (r, i) { r.sheetRow = 16 + i; });
      return rows;
    }
    function runOnce(worksInput, master) {
      var filtered = src.filterAndMatchWorks(worksInput, master);
      var numbered = src.resolveNumbersFromMatches(filtered.matches, master, 'titleNo');
      var diff = src.diffUpsertFromMatches(numbered, isEqualFn);
      var tiers = { t0: 0, t1: 0, t2: 0, t3: 0 };
      filtered.matches.forEach(function (m) { tiers['t' + m.tier] += 1; });
      return {
        filtered: filtered,
        diff: diff,
        tiers: tiers,
        master: applyToMaster(numbered, master),
      };
    }

    // Lần 1 — nạp lần đầu, master rỗng
    var run1 = runOnce(works, []);
    check('lan 1: them moi 1.730, update 0, master 1.730',
      [run1.diff.toAdd.length, run1.diff.toUpdate.length, run1.master.length], [1730, 0, 1730]);
    check('lan 1: 595 NG + 3.353 未判定 bi loai',
      [run1.filtered.excludedNg.length, run1.filtered.excludedUnjudged.length], [595, 3353]);

    // Lần 2 — dữ liệu y nguyên: phải 0 thêm, 0 update, tất cả khớp tầng 1
    var run2 = runOnce(works, run1.master);
    check('lan 2: 0 them moi, 0 update, 1.730 dong khop tang 1',
      [run2.diff.toAdd.length, run2.diff.toUpdate.length, run2.tiers.t1], [0, 0, 1730]);
    check('lan 2: khong co dong mo coi', run2.filtered.orphanOffsets.length, 0);
    check('lan 2: NG van khong len duoc master (rule 2 khong bao ve tac pham chua co)',
      run2.filtered.excludedNg.length, 595);

    // Lần 3 — biến động thật: 108 dòng được cấp タイトルID số, 2 dòng bỏ dấu 仮
    var keptWorks = run1.filtered.matches.map(function (m) { return m.record; });
    var keptSet = new Set(keptWorks);
    var nonNumericCount = keptWorks.filter(function (w) { return !src.isDigits(w.titleId); }).length;
    var kariPattern = /[(（]仮[)）]/;
    var kariCount = keptWorks.filter(function (w) { return kariPattern.test(String(w.titleName)); }).length;
    check('so dong se doi gia tri titleID (spec §5.1: 108)', nonNumericCount, 108);
    check('so dong se doi titleName vi bo dau 仮 (spec §5.1: 2)', kariCount, 2);

    var nextFakeId = 900000;
    var worksRun3 = works.map(function (w) {
      if (!keptSet.has(w)) return w;
      var copy = Object.assign({}, w);
      if (!src.isDigits(w.titleId)) {
        nextFakeId += 1;
        copy.titleId = String(nextFakeId);
      }
      copy.titleName = String(w.titleName).replace(/[(（]仮[)）]/g, '');
      return copy;
    });

    var run3 = runOnce(worksRun3, run1.master);
    check('lan 3: 0 them moi (KHONG sinh dong trung), 110 update, master van 1.730',
      [run3.diff.toAdd.length, run3.diff.toUpdate.length, run3.master.length], [0, 110, 1730]);
    check('lan 3: tang 1 = 1.620, tang 2 = 2 (doi ten), tang 3 = 108 (ID trong -> so)',
      [run3.tiers.t1, run3.tiers.t2, run3.tiers.t3], [1620, 2, 108]);
    check('lan 3: khong co dong mo coi', run3.filtered.orphanOffsets.length, 0);

    // Lần 4 — chạy lại sau biến động: phải im lặng hoàn toàn
    var run4 = runOnce(worksRun3, run3.master);
    check('lan 4: 0 them moi, 0 update, 1.730 khop tang 1',
      [run4.diff.toAdd.length, run4.diff.toUpdate.length, run4.tiers.t1], [0, 0, 1730]);


    // ---- Bản quyền trên dữ liệu thật (đo 2026-08-04) ----
    var publisherCopyrightRows = ctx.fixtures.load('publisherCopyright');
    var rules = src.parsePublisherCopyrightRules(publisherCopyrightRows);
    var rulesLookup = src.buildPublisherCopyrightLookup(rules);
    check('出版社別コピーライトマスタ: so dong rule', rules.length, 381);
    check('so khoa tra (出版社 + 出版社|レーベル)', rulesLookup.size, 373);

    // Chỉ tính cho 1.730 tác phẩm THẬT SỰ vào master — tính cho tác phẩm bị loại
    // là vô nghĩa (chúng không có dòng nào trên master).
    var keptForCopyright = run1.filtered.matches.map(function (m) { return m.record; });
    var copyrightStats = {};
    var withIndividual = 0;
    var noEffective = 0;
    keptForCopyright.forEach(function (work) {
      var resolved = src.resolvePublisherCopyright(work, rulesLookup);
      copyrightStats[resolved.reason] = (copyrightStats[resolved.reason] || 0) + 1;
      if (src.normalizeJapaneseText(work.copyrightU) !== '') withIndividual += 1;
      var effective = src.effectiveCopyright({
        individualCopyright: work.copyrightU,
        publisherCopyright: resolved.value === null ? '' : resolved.value,
      });
      if (src.normalizeJapaneseText(effective) === '') noEffective += 1;
    });

    // Số ĐO ĐƯỢC trên dữ liệu thật 2026-08-04, tổng = 1.730 dòng vào master.
    // Đây là mốc phát hiện hồi quy: nếu 'ok' tụt mạnh nghĩa là việc tra rule hoặc
    // điền template vừa bị hỏng — loại lỗi âm thầm nhất, vì sheet vẫn ghi được,
    // chỉ là cột 出版社コピーライト trống hàng loạt (đã xảy ra 1 lần khi token '©著'
    // khớp luôn '©著者名', xem COPYRIGHT_TEMPLATE_UNSUPPORTED_PATTERNS).
    check('sinh duoc 出版社コピーライト (reason=ok)', copyrightStats[src.COPYRIGHT_REASON_OK], 1303);
    // 241: chủ yếu là imprint của chính ソルマーレ — シーモアコミックス（トレモア） 99
    // và ソルマーレ編集部 60 tác phẩm, chưa có dòng nào trong 出版社別コピーライトマスタ.
    check('khong sinh duoc: NXB chua co rule', copyrightStats[src.COPYRIGHT_REASON_NO_RULE], 241);
    check('khong sinh duoc: co 02：個別ルール', copyrightStats[src.COPYRIGHT_REASON_MANUAL_FLAG], 83);
    // 103: 3 nhóm, tất cả đều KHÔNG dùng được thật (không phải lỗi code) —
    //   ~29 template là '『タイトル名』' (không © / không tác giả / không NXB)
    //   ~32 ô テンプレート trống dù dòng rule tồn tại
    //    18 cần '原作者名（英語）' mà CMS không có tên tác giả dạng chữ Latin
    check('khong sinh duoc: template khong dung duoc', copyrightStats[src.COPYRIGHT_REASON_BAD_TEMPLATE], 103);
    check('4 nhom cong lai = so tac pham vao master',
      copyrightStats[src.COPYRIGHT_REASON_OK] + copyrightStats[src.COPYRIGHT_REASON_NO_RULE]
        + copyrightStats[src.COPYRIGHT_REASON_MANUAL_FLAG] + copyrightStats[src.COPYRIGHT_REASON_BAD_TEMPLATE],
      1730);
    // 1.711/1.730 = 98,9% tác phẩm đã có bản quyền sẵn ở cột コピーライト của CMS,
    // nên cột J gánh gần hết — cột K chủ yếu có giá trị cho tác phẩm MỚI của NXB
    // đã có quy tắc.
    check('tac pham co san タイトル個別コピーライト tu CMS', withIndividual, 1711);
    check('tac pham KHONG co ban quyen nao (ca 2 cot trong) -> 個別対応', noEffective, 14);

    // Không bao giờ có タイトルNo trùng nhau qua cả 4 lần chạy
    [['lan 1', run1], ['lan 3', run3], ['lan 4', run4]].forEach(function (pair) {
      var numbers = pair[1].master.map(function (r) { return String(r.titleNo); });
      check(pair[0] + ': 0 タイトルNo trung nhau', numbers.length - new Set(numbers).size, 0);
    });
}

// ==============================================================================
// CỘT E タイトル区分 (nguồn 出稿コミット管理表) + CỘT J LP制作 (suy ra tại chỗ)
// Quy tắc user chốt 2026-08-13 — xem NGUỒN 7 trong src/sources.js và
// resolveLpProduction() trong src/master.js.
// ==============================================================================
function test_titleCategoryAndLp(ctx) {

    var src = ctx.src;
    var check = ctx.check;

    // Header thật của sheet 広告出稿必須タイトル (hàng 1), copy nguyên văn kể cả \n.
    var HEADER = ['記入日', '出稿開始\n希望日', 'タイトル区分', 'タイトル\nID', 'CMS\nID', 'タイトル名',
      '作家名', 'ジャンル', '出版社', 'レーベル', '先行開始日', '先行終了日'];
    var COMMIT = '2.先行配信（出稿コミット）';

    function row(category, titleName, titleId) {
      return ['', '', category, titleId === undefined ? '' : titleId, '', titleName, '', '', '', '', '', ''];
    }

    // ---- parse: bỏ dòng thiếu タイトル名, đọc được cả タイトルID/CMS ID ----
    var rows = [HEADER,
      row(COMMIT, 'アルファ'),
      row('1.協業レーベル', 'ベータ', 209381),
      row(COMMIT, ''),                       // thiếu tên -> bỏ
      row('', 'ガンマ'),                      // không có cờ -> vẫn parse ra
    ];
    var records = src.parseCommitManagementRows(rows);
    check('commit: bo dong thieu タイトル名', records.length, 3);
    check('commit: doc dung 区分 + ten', [records[0].titleCategory, records[0].titleName],
      [COMMIT, 'アルファ']);
    check('commit: doc duoc タイトルID khi co', records[1].titleId, 209381);

    // Thiếu 1 trong 2 cột bắt buộc -> throw ngay, không im lặng bỏ qua cả nguồn.
    var threw = false;
    try { src.parseCommitManagementRows([['記入日', 'タイトル名'], ['', 'アルファ']]); }
    catch (e) { threw = true; }
    check('commit: thieu cot タイトル区分 -> throw', threw, true);

    // ---- lookup: chỉ 「2.先行配信（出稿コミット）」 là cờ コミット ----
    var lookup = src.buildCommitFlagLookup(records);
    check('commit: 1.協業レーベル KHONG phai co コミット',
      lookup.get(src.normalizeJapaneseText('ベータ')).committed, false);
    check('commit: 「4.既存作品（出稿コミット）」 KHONG duoc tinh (32 dong tren du lieu that)',
      src.isCommitFlagValue(src.normalizeJapaneseText('4.既存作品（出稿コミット）')), false);
    // Cái bẫy NFKC: ô thật chứa ngoặc full-width, giá trị đã chuẩn hoá thì không.
    // Cả 2 cách viết đều phải nhận ra là cờ コミット.
    check('commit: nhan co du ngoac full-width hay nua-rong',
      [src.isCommitFlagValue(src.normalizeJapaneseText('2.先行配信（出稿コミット）')),
        src.isCommitFlagValue('2.先行配信(出稿コミット)')],
      [true, true]);

    // ---- tên trùng: MỘT dòng mang cờ là đủ ----
    var dupeLookup = src.buildCommitFlagLookup(src.parseCommitManagementRows([HEADER,
      row('1.協業レーベル', 'デルタ'),
      row(COMMIT, 'デルタ'),
      row('8.大量無料', 'デルタ'),
    ]));
    var delta = dupeLookup.get(src.normalizeJapaneseText('デルタ'));
    check('commit: ten trung 3 dong, 1 dong co co -> committed', delta.committed, true);
    check('commit: dem dung so dong / so dong mang co', [delta.rowCount, delta.commitRowCount], [3, 1]);
    check('commit: giu du danh sach 区分 de dung canh bao', delta.categories.length, 3);

    // ---- khoá join chuẩn hoá NFKC + 〜/～ (cùng cách với tầng 3 của cascade) ----
    var waveLookup = src.buildCommitFlagLookup(src.parseCommitManagementRows([HEADER,
      row(COMMIT, '落城の美姫〜甘い執着〜'),
    ]));
    check('commit: join theo ten da chuan hoa (〜 vs ～)',
      src.lookupTitleCategory({ titleName: '落城の美姫～甘い執着～' }, waveLookup), 'コミット');

    // ---- E không bao giờ trống ----
    check('commit: tra ra co -> コミット',
      src.lookupTitleCategory({ titleName: 'アルファ' }, lookup), 'コミット');
    check('commit: khong tra ra -> 独占 (KHONG phai rong)',
      src.lookupTitleCategory({ titleName: 'この作品は存在しない' }, lookup), '独占');
    check('commit: nguon rong -> moi tac pham deu 独占',
      src.lookupTitleCategory({ titleName: 'アルファ' }, new Map()), '独占');

    // ---- LP制作: ジャンル thắng ロゴ判定 (thứ tự user chốt) ----
    check('LP: TL + ロゴあり -> 必要 (ジャンル xet TRUOC)',
      src.resolveLpProduction({ genre: 'TL', logoJudgement: 'ロゴあり' }), '必要');
    check('LP: BLマンガ + ロゴあり -> 必要',
      src.resolveLpProduction({ genre: 'BLマンガ', logoJudgement: 'ロゴあり' }), '必要');
    check('LP: tien to bat duoc bien the thuc te (TLコミック / BLコミック / TL（R18）)',
      ['TLコミック', 'BLコミック', 'TL（R18）'].map(function (g) {
        return src.resolveLpProduction({ genre: g, logoJudgement: 'ロゴあり' });
      }), ['必要', '必要', '必要']);
    check('LP: ＴＬ full-width + tl thuong deu bat duoc',
      [src.resolveLpProduction({ genre: 'ＴＬ', logoJudgement: 'ロゴあり' }),
        src.resolveLpProduction({ genre: 'tl', logoJudgement: 'ロゴあり' })], ['必要', '必要']);

    // ---- LP制作: phần còn lại mới xét ロゴ判定 ----
    check('LP: 女性 + ロゴなし -> 必要',
      src.resolveLpProduction({ genre: '女性', logoJudgement: 'ロゴなし' }), '必要');
    check('LP: 女性 + ロゴあり -> 不要',
      src.resolveLpProduction({ genre: '女性', logoJudgement: 'ロゴあり' }), '不要');
    check('LP: 女性 + ロゴ判定 trong (未判定) -> rong, KHONG phai 不要',
      src.resolveLpProduction({ genre: '女性', logoJudgement: '' }), '');
    check('LP: ca 2 truong trong -> rong',
      src.resolveLpProduction({ genre: '', logoJudgement: undefined }), '');

    // ---- sameKeepWhenBlankValue: incoming rỗng = không đổi, nhưng có giá trị thì ghi đè ----
    check('LP diff: incoming rong -> coi la khong doi (giu nguyen o)',
      src.sameKeepWhenBlankValue('必要', ''), true);
    check('LP diff: 必要 -> 不要 PHAI duoc coi la doi (khac sameWriteOnceValue)',
      [src.sameKeepWhenBlankValue('必要', '不要'), src.sameWriteOnceValue('必要', '不要')],
      [false, true]);
    check('LP diff: o dang trong + incoming co gia tri -> doi',
      src.sameKeepWhenBlankValue('', '必要'), false);

    // ---- Cảnh báo ----
    var runAt = new Date('2026-08-13T00:00:00Z');
    check('canh bao: nguon loi -> dung 1 dong, E列 giu nguyen',
      src.buildTitleCategoryWarningRows([{ titleNo: 1, titleName: 'アルファ' }], new Map(), runAt, 'ID chưa cấu hình')
        .map(function (r) { return r.kind; }),
      ['タイトル区分注意']);
    check('canh bao: ten trung cung 1 区分 -> KHONG canh bao',
      src.buildTitleCategoryWarningRows([{ titleNo: 1, titleName: 'イプシロン' }],
        src.buildCommitFlagLookup(src.parseCommitManagementRows([HEADER,
          row(COMMIT, 'イプシロン'), row(COMMIT, 'イプシロン')])), runAt, null).length,
      0);
    check('canh bao: ten trung nhieu 区分 -> 1 dong',
      src.buildTitleCategoryWarningRows([{ titleNo: 1, titleName: 'デルタ' }], dupeLookup, runAt, null).length,
      1);
    check('canh bao: 独占 binh thuong (khong co tren nguon) -> KHONG canh bao',
      src.buildTitleCategoryWarningRows([{ titleNo: 1, titleName: 'この作品は存在しない' }], lookup, runAt, null).length,
      0);
    check('canh bao LP: chi bao tac pham chua phan dinh duoc',
      src.buildLpProductionWarningRows([
        { titleNo: 1, titleName: 'A', genre: '女性', lpProduction: '' },
        { titleNo: 2, titleName: 'B', genre: 'TL', lpProduction: '必要' },
      ], runAt).map(function (r) { return r.titleNo; }),
      [1]);
}

// ==============================================================================
// ĐỐI CHIẾU DỮ LIỆU THẬT — cột E/J trên 4.217 dòng 出稿コミット管理表 (2026-08-12)
// và 5.678 dòng CMS. Cùng nguyên tắc với test_dataset: số không khớp thì tìm hiểu
// nguyên nhân trước, đừng sửa expected cho hết đỏ.
// ==============================================================================
function test_titleCategoryDataset(ctx) {

    var src = ctx.src;
    var check = ctx.check;

    var commitRows = ctx.fixtures.load('commitManagement');
    var records = src.parseCommitManagementRows(commitRows);
    // 4.217 dòng có dữ liệu, 1 dòng thiếu タイトル名 -> 4.216.
    check('出稿コミット管理表: so dong co タイトル名 (do 2026-08-12)', records.length, 4216);

    var byCategory = {};
    records.forEach(function (r) {
      var key = src.normalizeJapaneseText(r.titleCategory) || '(空欄)';
      byCategory[key] = (byCategory[key] || 0) + 1;
    });
    // 「4.既存作品（出稿コミット）」 CŨNG chứa chữ 出稿コミット nhưng KHÔNG được tính —
    // con số 32 ở đây là để lần sau đổi ý thì thấy ngay ảnh hưởng bao nhiêu dòng.
    // Tra bằng khoá ĐÃ chuẩn hoá (ngoặc nửa-rộng), không phải chuỗi nguyên văn.
    //
    // 3.098 chứ không phải 3.099: sheet thật có ĐÚNG 1 dòng mang cờ コミット nhưng bỏ
    // trống タイトル名 (dòng 「ダヨオ」/ソルマーレ編集部, ô CMS ID bị gõ nhầm tên tác giả).
    // Không có khoá join thì dòng đó không ứng được với tác phẩm nào -> bị bỏ ở
    // parseCommitManagementRows(). Đây là dòng DUY NHẤT bị bỏ trên cả 4.217 dòng.
    check('出稿コミット管理表: so dong mang co 2.先行配信（出稿コミット）',
      byCategory[src.normalizeJapaneseText('2.先行配信（出稿コミット）')], 3098);
    check('出稿コミット管理表: so dong 4.既存作品（出稿コミット） bi loai khoi co コミット',
      byCategory[src.normalizeJapaneseText('4.既存作品（出稿コミット）')], 32);

    var lookup = src.buildCommitFlagLookup(records);
    // 4.118 tên duy nhất + 98 dòng thừa (66 tên bị trùng) = 4.216 dòng đã parse.
    check('出稿コミット管理表: so タイトル名 duy nhat', lookup.size, 4118);
    var dupExtraRows = 0;
    var multiCategory = 0;
    lookup.forEach(function (entry) {
      if (entry.rowCount > 1) dupExtraRows += entry.rowCount - 1;
      if (entry.rowCount >= 2 && entry.categories.length >= 2) multiCategory += 1;
    });
    check('出稿コミット管理表: ten duy nhat + dong thua = tong dong da parse',
      lookup.size + dupExtraRows, records.length);
    // 28/66 tên trùng có nhiều hơn 1 区分 -> đúng 28 dòng タイトル区分注意 (chỉ cho tác
    // phẩm thật sự vào master, nên con số trên tab cảnh báo sẽ <= 28).
    check('出稿コミット管理表: ten trung co nhieu 区分 -> nguon canh bao タイトル区分注意',
      multiCategory, 28);

    // ---- Áp lên đúng 1.730 tác phẩm thật sự vào master ----
    var regulationLookup = src.buildRegulationLookup(src.parseRegulationRows(ctx.fixtures.load('regulation')));
    var works = src.buildCustomerWorkRows(src.parseCmsRows(ctx.fixtures.load('cms')), regulationLookup);
    var kept = works.filter(function (w) { return src.isWorkEligible(w); });
    check('vao master: 1.730 tac pham (khop test_dataset)', kept.length, 1730);

    var categoryCounts = { コミット: 0, 独占: 0 };
    var lpCounts = { 必要: 0, 不要: 0, '': 0 };
    var lpInputs = { tlbl: 0, otherNoLogo: 0, otherWithLogo: 0, otherNoJudgement: 0 };
    kept.forEach(function (w) {
      categoryCounts[src.lookupTitleCategory(w, lookup)] += 1;
      lpCounts[src.resolveLpProduction(w)] += 1;

      var genre = src.normalizeJapaneseText(w.genre).toUpperCase();
      if (genre.indexOf('TL') === 0 || genre.indexOf('BL') === 0) { lpInputs.tlbl += 1; return; }
      var logo = src.normalizeJapaneseText(w.logoJudgement);
      if (logo === 'ロゴなし') lpInputs.otherNoLogo += 1;
      else if (logo === 'ロゴあり') lpInputs.otherWithLogo += 1;
      else lpInputs.otherNoJudgement += 1;
    });

    check('E列: コミット + 独占 = 1.730, khong dong nao trong',
      categoryCounts['コミット'] + categoryCounts['独占'], 1730);
    check('E列: phan bo コミット / 独占',
      [categoryCounts['コミット'], categoryCounts['独占']], [635, 1095]);

    // 2 check dưới đây đi cùng nhau: check thứ 2 chốt CON SỐ, check thứ nhất chốt
    // NGUỒN GỐC của con số đó. Nếu ai đó đảo thứ tự xét (ロゴ判定 trước ジャンル) thì
    // 62 tác phẩm TL/BL đang mang ロゴあり sẽ chạy từ 必要 sang 不要 — tổng vẫn là
    // 1.730 nên chỉ check tổng sẽ không bắt được, nhưng phép cộng dưới đây thì có.
    check('J列: 必要 = (TL/BL) + (khac × ロゴなし), 不要 = (khac × ロゴあり)',
      [lpInputs.tlbl + lpInputs.otherNoLogo, lpInputs.otherWithLogo],
      [lpCounts['必要'], lpCounts['不要']]);
    check('J列: phan bo 必要 / 不要 / chua phan dinh',
      [lpCounts['必要'], lpCounts['不要'], lpCounts['']], [578, 1152, 0]);
    // 281 TL/BL, trong đó 62 mang ロゴあり — chính là số tác phẩm mà thứ tự xét
    // (ジャンル trước ロゴ判定) làm thay đổi kết quả.
    check('J列: 62 tac pham TL/BL mang ロゴあり — 必要 nho thu tu xet',
      [lpInputs.tlbl, lpInputs.tlbl - 219], [281, 62]);
    // 0 tác phẩm chưa phán định được: mọi dòng vào master đều là 判定済み và
    // レギュレーション thật không có dòng 判定済み nào bỏ trống ③シーモアロゴ判定. Nghĩa là
    // tab GAS1警告 hôm nay có 0 dòng LP制作注意 — nhánh đó là phòng xa, không phải
    // nhánh đang chạy.
    check('J列: khong tac pham nao roi vao nhanh chua phan dinh (hom nay)',
      lpInputs.otherNoJudgement, 0);
}

// ==============================================================================
// CỘT Q 出版社事前確認 của コピーライトマスタ (nguồn: cột L của 出版社別コピーライトマスタ)
// User bổ sung 2026-08-13 — cột này trước đó bị bỏ sót.
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
// ĐỐI CHIẾU DỮ LIỆU THẬT — cột Q trên 381 quy tắc NXB × 1.730 tác phẩm vào master
// ==============================================================================
function test_preConfirmationDataset(ctx) {

    var src = ctx.src;
    var check = ctx.check;

    var rules = src.parsePublisherCopyrightRules(ctx.fixtures.load('publisherCopyright'));
    var lookup = src.buildPublisherCopyrightLookup(rules);

    var ruleCounts = { 必要: 0, 不要: 0, '': 0 };
    rules.forEach(function (r) { ruleCounts[src.normalizeJapaneseText(r.preConfirmation)] += 1; });
    check('出版社別コピーライトマスタ: 381 quy tac', rules.length, 381);
    check('出版社別コピーライトマスタ: phan bo (出版社)事前確認 必要 / 不要 / trong',
      [ruleCounts['必要'], ruleCounts['不要'], ruleCounts['']], [268, 105, 8]);

    var regulationLookup = src.buildRegulationLookup(src.parseRegulationRows(ctx.fixtures.load('regulation')));
    var works = src.buildCustomerWorkRows(src.parseCmsRows(ctx.fixtures.load('cms')), regulationLookup)
      .filter(function (w) { return src.isWorkEligible(w); });
    check('vao master: 1.730 tac pham (khop test_dataset)', works.length, 1730);

    var qCounts = { 必要: 0, 不要: 0, '': 0 };
    var noCopyrightButHasQ = 0;
    works.forEach(function (w) {
      var q = src.normalizeJapaneseText(src.resolvePublisherPreConfirmation(w, lookup));
      qCounts[q] += 1;
      if (src.resolvePublisherCopyright(w, lookup).value === null && q !== '') noCopyrightButHasQ += 1;
    });
    check('Q列: phan bo 必要 / 不要 / trong', [qCounts['必要'], qCounts['不要'], qCounts['']],
      [1013, 472, 245]);

    // Ô Q trống đến từ HAI nguyên nhân khác nhau, và phép cộng dưới đây chốt tỉ lệ
    // giữa chúng:
    //   241 — NXB không có dòng quy tắc nào (cùng tập với lý do ルール無し của cột K)
    //     4 — CÓ dòng quy tắc nhưng ô (出版社)事前確認 của dòng đó bỏ trống
    //         (8/381 quy tắc như vậy, chỉ 4 trong số đó có tác phẩm vào master)
    // Gộp 2 thứ này lại thành "Q trống = không có quy tắc" là sai: nhóm thứ hai là
    // ô 営業 quên điền ở NGUỒN, sửa được; nhóm thứ nhất thì phải thêm cả dòng quy tắc.
    var noRule = works.filter(function (w) {
      return src.resolvePublisherCopyright(w, lookup).reason === src.COPYRIGHT_REASON_NO_RULE;
    }).length;
    var ruleFoundButBlank = works.filter(function (w) {
      if (src.normalizeJapaneseText(src.resolvePublisherPreConfirmation(w, lookup)) !== '') return false;
      return src.resolvePublisherCopyright(w, lookup).reason !== src.COPYRIGHT_REASON_NO_RULE;
    }).length;
    check('Q列: o trong = (NXB khong co quy tac) + (quy tac co nhung o nguon trong)',
      [noRule, ruleFoundButBlank, noRule + ruleFoundButBlank], [241, 4, qCounts['']]);

    // Con số quan trọng nhất của thiết kế: 186 tác phẩm KHÔNG sinh được cột K
    // (02：個別ルール hoặc template hỏng) nhưng VẪN có 事前確認. Nếu ai đó "đơn giản
    // hoá" bằng cách chỉ lấy Q khi cột K sinh được, 186 tác phẩm này sẽ mất giá trị
    // kiểm duyệt trước — sai theo hướng nguy hiểm.
    check('Q列: 186 tac pham cot K khong sinh duoc nhung Q van co gia tri',
      noCopyrightButHasQ, 186);
}

// ==============================================================================
// CỘT R 先行終了日（延長）/ S （最終確定）/ T・U 大量無料
// 3 cột này được cài đặt 2026-08-07 nhưng KHÔNG có test nào — fixture đã export mà
// không hàm nào dùng tới. Bổ sung 2026-08-13 khi user gửi lại nguyên văn 3 quy tắc.
//
// Ô ngày ở đây là Date object, ĐÚNG như SpreadsheetApp.getValues() trả về (và đúng
// như fixtures.load() dựng lại) — viết chuỗi '2022-04-10T00:00:00' sẽ không phải là
// mô phỏng trung thực, xem comment reviveCell() trong run.js.
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

    var extRecords = src.parsePreEndExtensionRows(extRows);
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

    var mfRecords = src.parseMassFreeRows(mfRows);
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
function test_preEndAndMassFreeDataset(ctx) {

    var src = ctx.src;
    var check = ctx.check;

    // ---- Nguồn R ----
    var extRecords = src.parsePreEndExtensionRows(ctx.fixtures.load('preEndExtension'));
    check('独占期間の延長: 532 dong co タイトルID', extRecords.length, 532);
    check('独占期間の延長: dai cot gia han hien co 7 lan',
      extRecords[0].rounds.length, 7);

    var extLookup = src.buildPreEndExtensionLookup(extRecords);
    // 444/532 dòng có ít nhất 1 期日. 88 dòng còn lại chỉ chứa 'NG'/ghi chú -> không
    // vào cột R, đúng theo 「期日のみを記載」.
    check('独占期間の延長: 444 dong co 期日 -> doi tuong cua cot R', extLookup.size, 444);
    var noDateRows = extRecords.filter(function (r) {
      return src.resolvePreEndExtension(r) === null;
    }).length;
    check('独占期間の延長: 88 dong khong co 期日 nao (chi NG / ghi chu)', noDateRows, 88);

    // Phân bố lần thắng — bằng chứng cho quy tắc ❶❷ ("lần cuối thắng") chạy thật:
    // nếu ai đó đổi thành "lần đầu thắng" thì 129 dòng sẽ chuyển hết về 1回目.
    var byRound = {};
    extLookup.forEach(function (e) { byRound[e.roundName] = (byRound[e.roundName] || 0) + 1; });
    check('独占期間の延長: phan bo lan gia han THANG (1回目〜6回目)',
      [byRound['1回目'], byRound['2回目'], byRound['3回目'], byRound['4回目'],
        byRound['5回目'], byRound['6回目'], byRound['7回目']],
      [315, 75, 25, 13, 13, 3, undefined]);
    check('独占期間の延長: tong phan bo = so dong vao cot R',
      315 + 75 + 25 + 13 + 13 + 3, extLookup.size);

    // 71 dòng có ô CÓ NỘI DUNG nằm SAU lần thắng (vd 1回目=期日, 2回目='NG'). Chúng là
    // nguồn của cảnh báo 先行延長注意 — thông tin mới hơn nhưng không dùng được.
    var withSkipped = 0;
    extLookup.forEach(function (e) { if (e.skipped.length > 0) withSkipped += 1; });
    check('独占期間の延長: 71 dong co o khong-phai-期日 sau lan thang', withSkipped, 71);

    // ---- Nguồn T/U ----
    var mfRecords = src.parseMassFreeRows(ctx.fixtures.load('massFree'));
    check('大量無料: 372 dong', mfRecords.length, 372);
    check('大量無料: 2 dong 出稿回答 = ✕',
      mfRecords.filter(function (r) { return r.rejected; }).length, 2);

    var mfLookup = src.buildMassFreeLookup(mfRecords);
    check('大量無料: 185 タイトルID -> doi tuong cua cot T/U', mfLookup.size, 185);
    var multiRow = 0;
    mfLookup.forEach(function (e) { if (e.rowCount >= 2) multiRow += 1; });
    check('大量無料: 65 ID duoc gop tu >= 2 dong chien dich', multiRow, 65);

    // ---- Áp lên đúng 1.730 tác phẩm vào master ----
    var regulationLookup = src.buildRegulationLookup(src.parseRegulationRows(ctx.fixtures.load('regulation')));
    var works = src.buildCustomerWorkRows(src.parseCmsRows(ctx.fixtures.load('cms')), regulationLookup)
      .filter(function (w) { return src.isWorkEligible(w); });
    check('vao master: 1.730 tac pham (khop test_dataset)', works.length, 1730);

    var counts = { r: 0, sFromR: 0, sFromQ: 0, sEmpty: 0, tu: 0 };
    works.forEach(function (w) {
      var r = src.lookupPreEndExtension(w, extLookup);
      var hasR = src.normalizeJapaneseText(r) !== '';
      if (hasR) counts.r += 1;
      var sValue = src.resolvePreEndFinal(w.preEnd, r);
      if (src.normalizeJapaneseText(sValue) === '') counts.sEmpty += 1;
      else if (hasR) counts.sFromR += 1;
      else counts.sFromQ += 1;

      var period = src.lookupMassFreePeriod(w, mfLookup);
      if (src.normalizeJapaneseText(period.start) !== ''
        || src.normalizeJapaneseText(period.end) !== '') counts.tu += 1;
    });

    check('R列: 199/1.730 tac pham co ngay gia han', counts.r, 199);
    // S = R đúng 199 lần và không lần nào khác: mọi tác phẩm có R đều phải lấy R.
    check('S列: so dong lay tu R = so dong co R', counts.sFromR, counts.r);
    check('S列: 1.519 lay tu Q, 12 de trong (ca Q lan R deu trong)',
      [counts.sFromQ, counts.sEmpty], [1519, 12]);
    check('S列: tong 3 nhanh = 1.730',
      counts.sFromR + counts.sFromQ + counts.sEmpty, 1730);
    check('T/U列: 27/1.730 tac pham co ky 大量無料', counts.tu, 27);
}

module.exports = {
  unit: [test_harness, test_regulation, test_cms, test_workRows, test_cascade, test_filter,
    test_copyright, test_warnings, test_suspension, test_titleCategoryAndLp, test_preConfirmation,
    test_preEndAndMassFree],
  data: [test_dataset, test_titleCategoryDataset, test_preConfirmationDataset,
    test_preEndAndMassFreeDataset],
};

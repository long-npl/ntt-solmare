// tools/verify-engine/tests.js — test cho shared/engine.js.
//
// Engine không biết cột nào là cột gì; nó chỉ biết đọc bảng cột. Nên test ở đây dùng
// bảng cột GIẢ, không dùng bảng thật của master nào — nếu phải sửa test này khi thêm
// một cột vào master thì engine đã rò rỉ kiến thức nghiệp vụ.

function test_compareFor(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  check('上書 + text -> sameValue',
    src.compareFor({ write: '上書', type: 'text' })('a', 'a'), true);
  check('上書 + text: undefined vs rong la nhu nhau',
    src.compareFor({ write: '上書', type: 'text' })(undefined, ''), true);
  check('上書 + date -> sameDateValue (bo qua gio/timezone)',
    src.compareFor({ write: '上書', type: 'date' })(
      new Date('2026-03-27T00:00:00+09:00'), new Date('2026-03-27T15:00:00+09:00')), true);
  check('上書 khong khai bao type -> mac dinh text',
    src.compareFor({ write: '上書' })('1', 1), true);

  // Bốn check dưới đây là toàn bộ lý do engine tồn tại: write quyết định luôn compare,
  // nên không còn hai chỗ để lệch nhau.
  check('条件 -> incoming rong = khong doi (giu o)',
    src.compareFor({ write: '条件' })('必要', ''), true);
  check('条件 -> incoming co gia tri = ghi de duoc',
    src.compareFor({ write: '条件' })('必要', '不要'), false);
  check('1回 -> o da co chu = khong bao gio doi',
    src.compareFor({ write: '1回' })('2026-01-05', '2026-02-09'), true);
  check('1回 -> o trong + incoming co gia tri = doi',
    src.compareFor({ write: '1回' })('', '2026-02-09'), false);

  check('— -> khong so sanh', src.compareFor({ write: '—' }), null);
}

function test_requiredHeaders(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var COLUMNS = [
    { header: 'A', field: 'a', write: '上書' },
    { header: 'B', field: 'b', write: '条件' },
    { header: 'C', field: 'c', write: '上書', optional: true },
  ];
  check('requiredHeaders bo cot tuy chon', src.requiredHeaders(COLUMNS), ['A', 'B']);
}

function test_readAndCompare(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var COLUMNS = [
    { header: 'タイトルNo', field: 'titleNo', from: 'self', write: '上書' },
    { header: 'LP制作', field: 'lpProduction', from: 'derive', write: '条件' },
    { header: '先行開始日', field: 'preStart', from: 'cms', write: '上書', type: 'date' },
    { header: 'メモ', field: 'memo', from: 'self', write: '—' },
  ];
  var headerIndex = new Map([['タイトルNo', 1], ['LP制作', 2], ['先行開始日', 3], ['メモ', 4]]);

  var record = src.readRecord(['', 7, '必要', new Date('2026-03-27T00:00:00+09:00'), 'ghi chu'],
    headerIndex, COLUMNS, 16);
  check('readRecord lay dung field theo header',
    [record.titleNo, record.lpProduction, record.memo], [7, '必要', 'ghi chu']);
  check('readRecord gan sheetRow that (khong tinh tu offset)', record.sheetRow, 16);
  check('readRecord giu rawRow de bao toan cot GAS khong so huu', record.rawRow.length, 5);

  check('recordsEqual: giong het -> true', src.recordsEqual(record, record, COLUMNS), true);
  check('recordsEqual: cot — khong tham gia so sanh',
    src.recordsEqual(record, { titleNo: 7, lpProduction: '必要',
      preStart: record.preStart, memo: 'KHAC HAN' }, COLUMNS), true);
  check('recordsEqual: 条件 + incoming rong -> van coi la khong doi',
    src.recordsEqual(record, { titleNo: 7, lpProduction: '',
      preStart: record.preStart, memo: '' }, COLUMNS), true);
  check('recordsEqual: 条件 + incoming khac -> doi',
    src.recordsEqual(record, { titleNo: 7, lpProduction: '不要',
      preStart: record.preStart, memo: '' }, COLUMNS), false);

  check('skipCompare: cot khong tham gia quyet dinh co ghi hay khong',
    src.recordsEqual({ a: 1, h: 'cu' }, { a: 1, h: 'moi' },
      [{ header: 'A', field: 'a', write: '上書' },
        { header: 'H', field: 'h', write: '上書', skipCompare: true }]), true);
}

function test_toSheetRow(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var COLUMNS = [
    { header: 'タイトル区分', field: 'titleCategory', from: 'lookup:commit', write: '上書' },
    { header: 'LP制作', field: 'lpProduction', from: 'derive', write: '条件' },
    { header: '掲載停止日付', field: 'suspensionDate', from: 'lookup:susp', write: '1回' },
    { header: '手入力メモ', field: 'memo', from: 'self', write: '—' },
  ];
  var headerIndex = new Map([['タイトル区分', 1], ['LP制作', 2], ['掲載停止日付', 3], ['手入力メモ', 4]]);
  var previous = ['', '独占', '営業', '2026-01-05', 'nguoi go tay'];

  var row = src.toSheetRow(
    { titleCategory: 'コミット', lpProduction: '', suspensionDate: '2026-09-01', memo: '' },
    headerIndex, 5, COLUMNS, previous);
  check('上書: ghi de vo dieu kien', row[1], 'コミット');
  check('条件: incoming rong -> GIU o cu, khong xoa chu nguoi go tay', row[2], '営業');
  check('1回: o da co chu -> khong dung toi', row[3], '2026-01-05');
  check('—: cot GAS khong so huu duoc bao toan', row[4], 'nguoi go tay');

  var rowFilled = src.toSheetRow(
    { titleCategory: 'コミット', lpProduction: '必要', suspensionDate: '2026-09-01', memo: '' },
    headerIndex, 5, COLUMNS, ['', '独占', '', '', 'nguoi go tay']);
  check('条件: incoming co gia tri -> ghi de', rowFilled[2], '必要');
  check('1回: o dang trong -> duoc dien', rowFilled[3], '2026-09-01');

  var rowNew = src.toSheetRow(
    { titleCategory: 'コミット', lpProduction: '', suspensionDate: '', memo: '' },
    headerIndex, 5, COLUMNS, undefined);
  check('dong MOI: cot khong so huu ra rong, khong ra "undefined"', rowNew[4], '');
  check('dong MOI: 上書 van ghi', rowNew[1], 'コミット');

  // 上書 phải ghi được cả giá trị rỗng — tác phẩm bị rút khỏi nguồn thì ô PHẢI được xoá,
  // giữ mãi một hạn độc quyền đã hết hiệu lực nguy hiểm hơn là để trống.
  var rowCleared = src.toSheetRow(
    { titleCategory: '', lpProduction: '', suspensionDate: '', memo: '' },
    headerIndex, 5, COLUMNS, previous);
  check('上書: ghi rong DE XOA duoc', rowCleared[1], '');

  // Cột không có trên sheet (header thiếu) phải bị bỏ qua chứ không throw — đó là cách
  // cột tuỳ chọn như 出版社事前確認 sống được trên ガワ chưa có nó.
  var rowMissing = src.toSheetRow(
    { titleCategory: 'コミット', extra: 'x' }, headerIndex, 5,
    COLUMNS.concat([{ header: 'CHUA_CO', field: 'extra', write: '上書' }]), previous);
  check('cot khong co tren sheet -> bo qua, khong throw', rowMissing[1], 'コミット');
}

function test_applyRules(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var COLUMNS = [
    { header: '大量無料開始日', field: 'massFreeStart', from: 'lookup:massFree', write: '上書', keep: true },
    { header: 'タイトル名', field: 'titleName', from: 'cms', write: '上書' },
    { header: 'LP制作', field: 'lpProduction', from: 'derive', write: '条件',
      rule: function (record) { return record.titleName === 'TL' ? '必要' : ''; } },
  ];

  // Nguồn CHẠY ĐƯỢC: cột keep lấy giá trị đã tra, rule vẫn chạy.
  var okMatches = [{ record: { titleName: 'TL', massFreeStart: '2026-01-01' },
    existing: { massFreeStart: 'CU' } }];
  src.applyRules(okMatches, COLUMNS, { errors: { massFree: null } });
  check('nguon chay duoc -> giu gia tri vua tra', okMatches[0].record.massFreeStart, '2026-01-01');
  check('rule van chay', okMatches[0].record.lpProduction, '必要');

  // Nguồn LỖI: cột keep phải lấy lại giá trị đang có trên sheet, KHÔNG coi là rỗng —
  // coi là rỗng sẽ xoá ngày độc quyền của hàng trăm dòng chỉ vì một lần mất quyền.
  var brokenMatches = [{ record: { titleName: 'TL', massFreeStart: '' },
    existing: { massFreeStart: 'GIU_NGUYEN' } }];
  src.applyRules(brokenMatches, COLUMNS, { errors: { massFree: 'mat quyen' } });
  check('nguon loi -> lay lai gia tri dang co tren sheet',
    brokenMatches[0].record.massFreeStart, 'GIU_NGUYEN');
  check('nguon loi van khong chan rule cua cot khac',
    brokenMatches[0].record.lpProduction, '必要');

  // Dòng MỚI khi nguồn lỗi: không có gì để giữ -> rỗng, không phải undefined.
  var newMatches = [{ record: { titleName: 'x', massFreeStart: '' }, existing: null }];
  src.applyRules(newMatches, COLUMNS, { errors: { massFree: 'mat quyen' } });
  check('dong moi + nguon loi -> rong', newMatches[0].record.massFreeStart, '');
  check('rule tra rong -> giu rong (engine se giu o)', newMatches[0].record.lpProduction, '');
}


// Lap hang trong truoc khi append. Truoc day duong ghi luon append tai getLastRow()+1,
// nen hang trong trong vung du lieu ton tai VINH VIEN — sheet mo ra thay 77 hang dau
// trong va nguoi dung ket luan "chua duoc ghi", du du lieu nam ngay phia duoi.
// Da xay ra o CA BA master.
function test_placeNewRows(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var KEY_COLS = [{ header: 'タイトル名', field: 'titleName', write: '上書', rowKey: true },
    { header: 'x', field: 'x', write: '上書' }];
  function resolvedWith(dataRows) {
    var headerIndex = new Map([['タイトル名', 1], ['x', 2]]);
    // hang 1..2 ghi chu, hang 3 header, du lieu tu hang 4
    var values = [['ghi chu'], ['ghi chu'], ['', 'タイトル名', 'x']].concat(dataRows);
    return { headerIndex: headerIndex, headerRowIndex: 2, values: values, columnCount: 3 };
  }
  function fake(lastRow) {
    var writes = [];
    return { writes: writes, getLastRow: function () { return lastRow; },
      getRange: function (row, c, n, w) {
        return { setValues: function (v) { writes.push({ row: row, n: v.length }); } }; } };
  }

  // 3 hang trong lien tiep (4,5,6) + du lieu o 7 -> 2 record moi phai vao 4 va 5.
  var r = resolvedWith([['', '', ''], ['', '', ''], ['', '', ''], ['', 'co', '']]);
  var sheet = fake(7);
  src.placeNewRows(sheet, r, KEY_COLS, ['A', 'B'], function (x) { return ['', x, '']; });
  check('lap hang trong dau tien, KHONG append xuong duoi',
    sheet.writes.map(function (w) { return [w.row, w.n]; }), [[4, 2]]);

  // Nhieu record hon so hang trong -> lap het roi append phan con lai sau getLastRow.
  var r2 = resolvedWith([['', '', ''], ['', 'co', '']]);
  var sheet2 = fake(5);
  src.placeNewRows(sheet2, r2, KEY_COLS, ['A', 'B', 'C'], function (x) { return ['', x, '']; });
  check('lap 1 hang trong roi append 2 record con lai tai getLastRow+1',
    sheet2.writes.map(function (w) { return [w.row, w.n]; }), [[4, 1], [6, 2]]);

  // Hang trong RAI RAC -> moi dai 1 lenh setValues, khong phai 1 lenh moi hang.
  var r3 = resolvedWith([['', '', ''], ['', 'co', ''], ['', '', ''], ['', '', '']]);
  var sheet3 = fake(7);
  src.placeNewRows(sheet3, r3, KEY_COLS, ['A', 'B', 'C'], function (x) { return ['', x, '']; });
  check('2 dai roi rac -> 2 lenh ghi, gom hang lien tiep lai',
    sheet3.writes.map(function (w) { return [w.row, w.n]; }), [[4, 1], [6, 2]]);

  // Khong co hang trong -> append thuan.
  var r4 = resolvedWith([['', 'co', '']]);
  var sheet4 = fake(4);
  src.placeNewRows(sheet4, r4, KEY_COLS, ['A'], function (x) { return ['', x, '']; });
  check('khong co hang trong -> append tai getLastRow+1',
    sheet4.writes.map(function (w) { return [w.row, w.n]; }), [[5, 1]]);

  check('blankDataRows tra dung so hang THAT (1-based)',
    src.blankDataRows(resolvedWith([['', '', ''], ['', 'co', ''], ['', '', '']]), KEY_COLS), [4, 6]);
  check('contiguousRuns gom dung dai', src.contiguousRuns([4, 5, 6, 9, 11, 12]),
    [[4, 5, 6], [9], [11, 12]]);
}


// rowKey PHAI khai bao, khong duoc mac dinh. Gop 2 ham doc thanh mot ma mac dinh ve
// タイトル名 da lam dong co タイトルNo nhung khong co ten bien thanh VO HINH: chung roi
// vao toAdd roi duoc append xuong duoi, de lai dong goc trong mai mai.
function test_rowKey(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var byName = [{ header: 'タイトル名', field: 'titleName', write: '上書', rowKey: true }];
  var byNo = [{ header: 'タイトルNo', field: 'titleNo', write: '上書', rowKey: true },
    { header: 'タイトル名', field: 'titleName', write: '上書' }];

  check('rowKeyColumn tra ve dung cot da danh dau',
    [src.rowKeyColumn(byName).header, src.rowKeyColumn(byNo).header],
    ['タイトル名', 'タイトルNo']);

  // Thieu rowKey -> throw ngay, khong am tham mac dinh ve mot cot nao.
  var threw = false;
  try { src.rowKeyColumn([{ header: 'A', field: 'a', write: '上書' }]); } catch (e) { threw = true; }
  check('bang cot thieu rowKey -> throw, khong mac dinh', threw, true);

  // CUNG mot sheet, HAI cot rowKey khac nhau -> ket qua khac nhau. Day la ca that:
  // dong co No ma khong co ten.
  var headerIndex = new Map([['タイトルNo', 1], ['タイトル名', 2]]);
  var resolved = { headerIndex: headerIndex, headerRowIndex: 0, columnCount: 3,
    values: [['', 'タイトルNo', 'タイトル名'], ['', 7, ''], ['', 8, 'co ten']] };
  check('rowKey=タイトルNo -> dong co No ma trong ten KHONG bi coi la trong',
    src.blankDataRows(resolved, byNo), []);
  check('rowKey=タイトル名 -> chinh dong do bi coi la trong (hanh vi cu bi sai)',
    src.blankDataRows(resolved, byName), [2]);
}

module.exports = {
  unit: [test_compareFor, test_requiredHeaders, test_readAndCompare, test_toSheetRow,
    test_applyRules, test_placeNewRows, test_rowKey],
  data: [],
};

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

module.exports = {
  unit: [test_compareFor, test_requiredHeaders, test_readAndCompare, test_toSheetRow,
    test_applyRules],
  data: [],
};

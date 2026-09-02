// tools/verify-phase2/tests.js — test cho gas_phase_2/.
//
// GAS❷ không tính gì từ nguồn ngoài: nó chép từ 2 master của GAS❶ và đóng dấu
// マスタ追加日 cho dòng mới. Nên test ở đây tập trung vào BẢNG CỘT và đường ghi.

function test_titleColumns(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  check('25 cot (24 cu + 初回配信巻数)', src.TITLE_COLUMNS.length, 25);
  check('moi cot co du header + field + from + write',
    src.TITLE_COLUMNS.filter(function (c) {
      return !c.header || !c.field || !c.from || !c.write; }).length, 0);
  // Bỏ được trường compare là toàn bộ điểm của engine — đừng để nó bò trở lại.
  check('khong cot nao con khai bao compare',
    src.TITLE_COLUMNS.filter(function (c) { return c.compare !== undefined; }).length, 0);

  var byField = {};
  src.TITLE_COLUMNS.forEach(function (c) { byField[c.field] = c; });

  check('初回配信巻数 chep tu 顧客作品マスタ, khong tu CMS',
    [byField.firstVolume.from, byField.firstVolume.write], ['customer', '上書']);
  check('初回配信巻数 dung ngay sau タイトル名',
    src.TITLE_COLUMNS.map(function (c) { return c.field; })
      .slice(src.TITLE_COLUMNS.map(function (c) { return c.field; }).indexOf('titleName'), 12 + 1)
      .slice(0, 2), ['titleName', 'firstVolume']);

  // マスタ追加日 là cột ghi MỘT LẦN: chỉ đóng dấu lúc append, dòng đã có không đụng.
  check('マスタ追加日 la cot 1回', byField.masterAddedAt.write, '1回');
  check('マスタ追加日 do GAS❷ tu sinh', byField.masterAddedAt.from, 'stamp');

  // Cột này có thể chưa tồn tại bên nguồn -> phải là optional, nếu không sheet thiếu
  // nó sẽ làm cả lần chạy throw.
  check('出版社事前確認 la cot tuy chon', byField.preConfirmation.optional, true);
  check('requiredHeaders bo cot tuy chon', src.requiredHeaders(src.TITLE_COLUMNS).length, 24);

  check('khong header nao trung nhau',
    new Set(src.TITLE_COLUMNS.map(function (c) { return c.header; })).size, 25);
  check('khong field nao trung nhau',
    new Set(src.TITLE_COLUMNS.map(function (c) { return c.field; })).size, 25);

  // 3 cột lấy từ コピーライトマスタ — nguồn PHỤ, đọc lỗi thì giữ nguyên.
  check('dung 3 cot tu コピーライトマスタ',
    src.TITLE_COLUMNS.filter(function (c) { return c.from === 'copyright'; })
      .map(function (c) { return c.field; }),
    ['publisherCopyright', 'individualCopyright', 'preConfirmation']);
}

function test_titleWriteModes(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var byField = {};
  src.TITLE_COLUMNS.forEach(function (c) { byField[c.field] = c; });

  // 7 cột ngày phải dùng type date, nếu không String(Date) mang cả giờ + timezone
  // và 2 spreadsheet khác timezone sẽ churn vĩnh viễn.
  check('7 cot ngay dung type date',
    src.TITLE_COLUMNS.filter(function (c) { return c.type === 'date'; })
      .map(function (c) { return c.field; }),
    ['suspensionDate', 'preStart', 'preEnd', 'preEndExtended', 'preEndFinal',
      'massFreeStart', 'massFreeEnd']);

  check('cot ngay -> compareFor tra sameDateValue (bo qua gio)',
    src.compareFor(byField.preStart)(
      new Date('2026-03-27T00:00:00+09:00'), new Date('2026-03-27T15:00:00+09:00')), true);
  check('マスタ追加日 -> o da co ngay thi khong bao gio doi',
    src.compareFor(byField.masterAddedAt)('2026-08-19', '2026-09-02'), true);
  check('マスタ追加日 -> o trong thi duoc dong dau',
    src.compareFor(byField.masterAddedAt)('', '2026-09-02'), false);
}

function test_customerSourceHeaders(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  // Danh sách này là HÌNH DẠNG của 顧客作品マスタ bên GAS❶ — thiếu một tên là GAS❷
  // đọc không ra cột đó.
  check('21 cot bat buoc tren 顧客作品マスタ', src.CUSTOMER_SOURCE_HEADERS.length, 21);
  check('co 初回配信巻数', src.CUSTOMER_SOURCE_HEADERS.indexOf('初回配信巻数') >= 0, true);
  check('khong ten nao trung', new Set(src.CUSTOMER_SOURCE_HEADERS).size, 21);
}

function test_readsFirstVolume(ctx) {
  var src = ctx.src;
  var check = ctx.check;

  var HEADER = ['', 'タイトルNo', 'CMS ID', 'タイトルID', 'タイトル区分',
    '①広告出稿ポリシー', '②一般面出稿NG', '③シーモアロゴ判定', '掲載停止日付', 'LP制作',
    'タイトル名', '初回配信巻数', '作家名', 'ジャンル', '出版社', 'レーベル名',
    '先行開始日', '先行終了日', '先行終了日（延長）', '先行終了日（最終確定）',
    '大量無料開始日', '大量無料終了日'];
  var row = ['', 1, '6761', '354296', '独占', '問題なし', '一般面OK', 'ロゴあり', '', '不要',
    'A', '4', 'tac gia', '女性', 'nxb', 'label', '', '', '', '', '', ''];
  var records = src.parseCustomerMasterRows([['ghi chu'], HEADER, row]);
  check('doc duoc 初回配信巻数 tu 顧客作品マスタ', records[0].firstVolume, '4');
  check('van doc dung cac cot cu',
    [records[0].titleNo, records[0].titleName, records[0].lpProduction], [1, 'A', '不要']);
}

module.exports = {
  unit: [test_titleColumns, test_titleWriteModes, test_customerSourceHeaders,
    test_readsFirstVolume],
  data: [],
};

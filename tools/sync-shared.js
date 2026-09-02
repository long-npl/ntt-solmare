// tools/sync-shared.js — chép shared/*.js sang src/ và gas2/, hoặc kiểm chúng đã lệch chưa.
//
//   node tools/sync-shared.js           chép đi (ghi đè các file đích)
//   node tools/sync-shared.js --check    KHÔNG ghi gì, exit 1 nếu có file đích lệch
//
// VÌ SAO CHÉP CHỨ KHÔNG DÙNG CHUNG THẬT: Apps Script không cho project này import
// project kia. Cách "đúng" là đóng shared/ thành Apps Script Library, nhưng khi đó mỗi
// lần sửa một hàm chuẩn hoá chuỗi phải deploy version mới của library rồi nâng version
// ở CẢ 2 project, và mọi lời gọi phải mang tiền tố tên library. Quá nhiều nghi thức cho
// 18 hàm thuần.
//
// Cái giá của bản chép là nó có thể trôi khỏi bản gốc. --check là thứ trả cái giá đó:
// nó được gọi ở đầu CẢ 2 harness test (tools/verify/run.js, tools/verify-gas2/run.js),
// nên một bản chép bị sửa tay sẽ làm test đỏ ngay lần chạy kế tiếp — không phải nhớ gì.
//
// Trước đây việc đồng bộ dựa vào một dòng comment "đồng bộ ngày 2026-08-19" trong
// gas2/common.js. Nó ghi lại được việc đã đồng bộ, nhưng không ngăn được việc quên.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Mỗi file trong shared/ được chép tới những đích nào. Thêm file dùng chung = thêm 1
// dòng ở đây, không phải sửa logic bên dưới.
const TARGETS = [
  { source: 'shared/common.js', copies: ['src/common.js', 'gas2/common.js',
      'gas_phase_1/1_common.js', 'gas_phase_2/1_common.js'] },
  { source: 'shared/masterHeaders.js', copies: ['src/masterHeaders.js', 'gas2/masterHeaders.js'] },
  { source: 'shared/sheet.js', copies: ['gas_phase_1/2_sheet.js', 'gas_phase_2/2_sheet.js'] },
  { source: 'shared/engine.js', copies: ['gas_phase_1/8_engine.js', 'gas_phase_2/8_engine.js'] },
];
// masterHeaders.js cố tình KHÔNG có đích ở 2 project mới: bản mới suy danh sách cột
// bắt buộc từ chính bảng cột (requiredHeaders trong engine), không còn danh sách rời
// phải giữ khớp tay.

/**
 * Banner dán lên đầu mỗi file được sinh ra.
 *
 * KHÔNG chứa ngày/giờ: banner có timestamp làm mọi file đích lệch nhau ở mỗi lần chạy
 * sync, nên --check không phân biệt được "nội dung đã trôi" với "vừa chạy lại sync".
 * Nội dung file đích khi đó là hàm thuần của nội dung shared/ — đúng thứ --check cần.
 */
function banner(sourceRel) {
  return [
    '// ⚠️  FILE NÀY ĐƯỢC SINH RA TỰ ĐỘNG — MỌI THAY ĐỔI SẼ BỊ GHI ĐÈ.',
    '//',
    '// Nguồn gốc : ' + sourceRel,
    '// Sinh bởi  : node tools/sync-shared.js',
    '//',
    '// Sửa ' + sourceRel + ' rồi chạy lại lệnh trên. Hai harness test đều gọi',
    '// `node tools/sync-shared.js --check` trước khi chạy, nên nếu bạn sửa tay ở đây,',
    '// test sẽ đỏ chứ không âm thầm chấp nhận.',
    '',
    '',
  ].join('\n');
}

function render(sourceRel) {
  const body = fs.readFileSync(path.join(ROOT, sourceRel), 'utf8');
  return banner(sourceRel) + body;
}

const check = process.argv.indexOf('--check') !== -1;
const drifted = [];
let written = 0;

TARGETS.forEach(function (target) {
  const expected = render(target.source);
  target.copies.forEach(function (copyRel) {
    const abs = path.join(ROOT, copyRel);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    // So sánh sau khi bỏ \r: repo này checkout trên Windows với core.autocrlf, nên file
    // trên đĩa có CRLF trong khi chuỗi vừa render có LF. Không bỏ \r thì --check báo
    // lệch ở mọi máy Windows và trở thành thứ người ta học cách phớt lờ.
    const same = current !== null && current.replace(/\r/g, '') === expected.replace(/\r/g, '');
    if (same) return;
    if (check) {
      drifted.push(copyRel + (current === null ? '  (chưa tồn tại)' : '  (lệch khỏi ' + target.source + ')'));
      return;
    }
    fs.writeFileSync(abs, expected);
    written += 1;
    console.log('ghi  ' + copyRel + '  <- ' + target.source);
  });
});

if (check) {
  if (drifted.length === 0) {
    console.log('sync-shared: OK — mọi bản chép khớp shared/');
    process.exit(0);
  }
  console.log('sync-shared: LỆCH');
  drifted.forEach(function (line) { console.log('  ' + line); });
  console.log('');
  console.log('Sửa nội dung trong shared/ rồi chạy: node tools/sync-shared.js');
  process.exit(1);
}

console.log('sync-shared: xong (' + written + ' file được ghi)');

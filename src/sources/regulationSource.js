// sources/regulationSource.js — parse 【社外用】作品レギュレーション判定
//
// Vai trò trong toàn bộ luồng: đây là 1 trong 3 nguồn dùng để build
// 顧客作品マスタ (xem buildCustomerWorkRows() ở logic/customerWorkMaster.js).
// Cụ thể, nguồn này cung cấp cột ③シーモアロゴ判定 (đã/chưa được phép gắn logo
// シーモア lên creative) cho từng tác phẩm, tra theo 3 TẦNG ưu tiên CMS ID +
// タイトルID (xem lý do ở buildRegulationLookup()/lookupRegulation() bên dưới
// — đây KHÔNG phải tối ưu thừa, mà là bắt buộc để không bỏ sót phần lớn dữ
// liệu thật).
//
// Đặc điểm riêng của sheet シート1: 3 hàng đầu là ghi chú giải thích, hàng 4
// mới là header thật — findHeaderRowIndex() (trong headerMap.js) tự dò ra
// đúng hàng này, không cần hardcode số 4.

var REGULATION_REQUIRED_HEADERS = ['ステータス', 'ＣＭＳID', 'タイトルＩＤ', 'タイトル名', '③シーモアロゴ判定'];
var REGULATION_STATUS_OK = '判定済み';

/**
 * Đọc + lọc dữ liệu thô của sheet 作品レギュレーション判定.
 *
 * CHỈ lấy những dòng có cột ステータス = "判定済み" (đã có kết luận). Dòng có
 * ステータス khác (vd "判定中" - đang chờ xử lý) bị bỏ qua hoàn toàn, vì theo
 * ghi chú gốc trên sheet: "B列（ステータス）が「判定済み」のもののみ進行可" —
 * dòng chưa判定済み nghĩa là con người chưa xác nhận xong, GAS không được tự
 * ý dùng dữ liệu đó.
 *
 * @param {Array<Array<*>>} rawRows - Kết quả sheet.getDataRange().getValues() của sheet シート1
 * @returns {Array<{cmsId: *, titleId: *, titleName: string, logoJudgement: string}>}
 *   Mảng bản ghi đã lọc, mỗi phần tử ứng với 1 dòng判定済み trên sheet gốc.
 *   logoJudgement là giá trị thô của cột ③シーモアロゴ判定 (vd "ロゴなし"/"ロゴあり").
 */
function parseRegulationRows(rawRows) {
  var resolved = resolveHeaderIndex(rawRows, REGULATION_REQUIRED_HEADERS);
  var idx = resolved.headerIndex;
  var colStatus = col(idx, 'ステータス');
  var colCmsId = col(idx, 'ＣＭＳID');
  var colTitleId = col(idx, 'タイトルＩＤ');
  var colTitleName = col(idx, 'タイトル名');
  var colLogo = col(idx, '③シーモアロゴ判定');

  var records = [];
  for (var i = resolved.headerRowIndex + 1; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || row[colStatus] !== REGULATION_STATUS_OK) continue;
    records.push({
      cmsId: row[colCmsId],
      titleId: row[colTitleId],
      titleName: row[colTitleName],
      logoJudgement: row[colLogo],
    });
  }
  return records;
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function compositeKey(cmsId, titleId) {
  return String(cmsId) + '|' + String(titleId);
}

/**
 * Build bảng tra 3 TẦNG ưu tiên, để lookupRegulation() bên dưới thử theo
 * đúng thứ tự: (1) khớp CẢ CMS ID lẫn タイトルID cùng lúc — chắc chắn nhất,
 * (2) chỉ khớp CMS ID, (3) chỉ khớp タイトルID.
 *
 * TẠI SAO CẦN NHIỀU TẦNG (không chỉ CMS ID như buildCmsCopyrightLookup() ở
 * cmsSource.js): đã kiểm chứng trên dữ liệu thật — sheet này có tới
 * **53.6%** dòng 判定済み KHÔNG CÓ CMSID (2765/5158 dòng), trong khi chỉ
 * 15.7% dòng thiếu タイトルID. Đây là NGƯỢC LẠI so với 先行タイトル情報(CMS)
 * (nơi CMSID luôn có, タイトルID mới hay thiếu) — lý do: quy trình phán定
 * regulation nhiều khi được thực hiện dựa trên タイトルID TRƯỚC KHI tác phẩm
 * đó được đăng ký CMS và có CMSID (CMSID "đến sau" タイトルID). Nếu chỉ tra
 * theo CMS ID như code phiên bản đầu, sẽ bỏ sót phần lớn kết quả ③シーモア
 * ロゴ判定 một cách âm thầm (không lỗi, chỉ đơn giản là logoJudgement bị
 * undefined cho hơn nửa số tác phẩm).
 *
 * Tầng (1) — khớp cả 2 ID cùng lúc — được ưu tiên cao nhất vì đây là bằng
 * chứng mạnh nhất rằng đúng tác phẩm (không phải trùng ngẫu nhiên 1 trong 2
 * ID với tác phẩm khác). Tầng (2)/(3) chỉ dùng khi tầng trước không tra ra
 * kết quả.
 *
 * Cả 3 map được build ĐỘC LẬP — nếu 2 record khác nhau vô tình trùng CMS ID
 * hoặc タイトルID (hiếm, xem số liệu ở comment lookupRegulation()), record
 * ghi SAU sẽ ghi đè record ghi TRƯỚC trong map tương ứng — chấp nhận rủi ro
 * nhỏ này vì tầng (2)/(3) chỉ là fallback, không phải khoá chính của toàn hệ
 * thống (khoá chính của 顧客作品マスタ là CMSID từ nguồn CMS, xem main.js).
 *
 * @param {Array<object>} records - Kết quả từ parseRegulationRows()
 * @returns {{
 *   byCmsIdAndTitleId: Map<string,string>,
 *   byCmsId: Map<string,string>,
 *   byTitleId: Map<string,string>
 * }} Cả 3 map đều là "khoá đã ép String() -> logoJudgement"
 */
function buildRegulationLookup(records) {
  var byCmsIdAndTitleId = new Map();
  var byCmsId = new Map();
  var byTitleId = new Map();

  records.forEach(function (record) {
    var hasCmsId = hasValue(record.cmsId);
    var hasTitleId = hasValue(record.titleId);

    if (hasCmsId && hasTitleId) {
      byCmsIdAndTitleId.set(compositeKey(record.cmsId, record.titleId), record.logoJudgement);
    }
    if (hasCmsId) {
      byCmsId.set(String(record.cmsId), record.logoJudgement);
    }
    if (hasTitleId) {
      byTitleId.set(String(record.titleId), record.logoJudgement);
    }
  });

  return { byCmsIdAndTitleId: byCmsIdAndTitleId, byCmsId: byCmsId, byTitleId: byTitleId };
}

/**
 * Tra ③シーモアロゴ判定 cho 1 tác phẩm theo đúng 3 tầng ưu tiên mô tả ở
 * buildRegulationLookup(): thử khớp cả 2 ID trước, rồi CMS ID, rồi タイトルID
 * — DỪNG NGAY khi tầng đầu tiên có kết quả (không cộng dồn/ưu tiên theo cách
 * khác).
 *
 * @param {{cmsId: *, titleId: *}} work - Tác phẩm cần tra (1 phần tử từ buildCustomerWorkRows())
 * @param {{byCmsIdAndTitleId: Map, byCmsId: Map, byTitleId: Map}} regulationLookup
 *   Kết quả buildRegulationLookup()
 * @returns {string|undefined} logoJudgement nếu tra được ở 1 trong 3 tầng, undefined nếu không tầng nào khớp
 */
function lookupRegulation(work, regulationLookup) {
  var byBothValue = regulationLookup.byCmsIdAndTitleId.get(compositeKey(work.cmsId, work.titleId));
  if (byBothValue !== undefined) return byBothValue;

  var byCmsIdValue = regulationLookup.byCmsId.get(String(work.cmsId));
  if (byCmsIdValue !== undefined) return byCmsIdValue;

  return regulationLookup.byTitleId.get(String(work.titleId));
}

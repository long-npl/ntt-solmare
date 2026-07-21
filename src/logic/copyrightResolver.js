// logic/copyrightResolver.js — logic ưu tiên 4 tầng xác định bản quyền
// (spec §6). Đây là "trái tim" nghiệp vụ của việc build コピーライトマスタ.
//
// Thứ tự ưu tiên (dừng ở tầng ĐẦU TIÊN có giá trị, không cộng dồn nhiều tầng):
//   Tầng 1: CMS cột コピーライト (đã xác nhận sẵn trong 先行タイトル情報)
//   Tầng 2: sheet quy tắc riêng theo NXB (LINE/スクエニ/リブレ/オーバーラップ/ヒーローズ)
//   Tầng 3: 基本のC表記 — GAS tự sinh theo công thức chung của NXB đó
//   Tầng 4: không tầng nào khớp -> "cá biệt", để trống, KHÔNG tự bịa dữ liệu,
//           con người phải xử lý tay (main.js sẽ ghi các tác phẩm tầng 4 này
//           vào log + Slack, xem runGas1() trong main.js).
//
// Đây là hàm PURE — không đụng SpreadsheetApp, chỉ nhận vào các Map đã build
// sẵn (từ sources/*.js) và trả về kết quả tính toán.

var COPYRIGHT_TITLE_TOKENS = ['作品名', 'タイトル名'];
var COPYRIGHT_AUTHOR_TOKENS = ['漫画家名・原作者名', '著者名', '作家名'];

/**
 * Thay các placeholder text trong công thức 基本のC表記 (vd "著者名", "作品名")
 * bằng giá trị thật của tác phẩm — dùng ở TẦNG 3.
 *
 * Cách hoạt động: quét COPYRIGHT_TITLE_TOKENS theo thứ tự, thay TOKEN ĐẦU
 * TIÊN tìm thấy trong template bằng work.titleName (chỉ thay 1 lần, dùng
 * String.replace không có cờ /g); tương tự với COPYRIGHT_AUTHOR_TOKENS và
 * work.author. Đây là xử lý HEURISTIC đơn giản — các công thức trong sheet
 *基本のC表記 là text tự do do con người viết (có thể nhiều dòng, có điều kiện
 * "nếu... thì..."), nên hàm này KHÔNG bao phủ được mọi trường hợp phức tạp,
 * chỉ xử lý được các mẫu placeholder đơn giản, phổ biến nhất.
 *
 * @param {string} template - Chuỗi công thức thô từ parseBasicNotation() (vd "©著者名/A-KAGURA")
 * @param {{titleName: string, author: string}} work - Tác phẩm cần điền giá trị thật vào
 * @returns {string} Chuỗi bản quyền đã thay placeholder (vd "©Nguyễn Văn A/A-KAGURA")
 */
function applyBasicNotationTemplate(template, work) {
  var text = template;
  COPYRIGHT_TITLE_TOKENS.some(function (token) {
    if (text.indexOf(token) === -1) return false;
    text = text.replace(token, work.titleName);
    return true;
  });
  COPYRIGHT_AUTHOR_TOKENS.some(function (token) {
    if (text.indexOf(token) === -1) return false;
    text = text.replace(token, work.author);
    return true;
  });
  return text;
}

/**
 * Xác định bản quyền chính thức (正規コピーライト) cho 1 tác phẩm, theo đúng 4
 * tầng ưu tiên mô tả ở đầu file. Đây là hàm được main.js gọi cho TỪNG tác
 * phẩm trong builtCustomerRows, trước khi build コピーライトマスタ.
 *
 * @param {{cmsId: *, titleId: *, titleName: string, author: string, publisher: string}} work
 *   Tác phẩm cần xác định bản quyền (1 phần tử từ buildCustomerWorkRows())
 * @param {Map<string, string>} cmsCopyrightLookup - Tầng 1, từ cmsSource.buildCmsCopyrightLookup()
 * @param {Array<object>} publisherRegistry - Danh sách NXB có sheet riêng, truyền
 *   PUBLISHER_SHEET_PARSERS (sources/copyrightRules.js) vào đây
 * @param {Object<string, Map<string,string>>} publisherMaps - Kết quả parse của
 *   từng sheet riêng NXB, key = registry entry.key (vd publisherMaps['LINE'])
 * @param {Map<string, string>} basicNotationMap - Tầng 3, từ copyrightRules.parseBasicNotation()
 * @returns {{value: string|null, tier: 1|2|3|4}}
 *   value: chuỗi bản quyền đã xác định, hoặc null nếu rơi vào tầng 4 (cá biệt)
 *   tier: tầng nào đã cho ra kết quả — dùng để ghi vào đúng cột
 *   CopyRight(個別ルールの場合)/CopyRight自動生成 khi ghi コピーライトマスタ
 *   (xem sheetIO.copyrightRecordToRow())
 */
function resolveCopyright(work, cmsCopyrightLookup, publisherRegistry, publisherMaps, basicNotationMap) {
  // Tầng 1: CMS cột コピーライト — ưu tiên cao nhất vì đây là giá trị con người
  // đã trực tiếp xác nhận trong hệ thống CMS cho chính tác phẩm này.
  var cmsValue = cmsCopyrightLookup.get(String(work.cmsId));
  if (cmsValue) return { value: cmsValue, tier: 1 };

  // Tầng 2: sheet riêng theo NXB — dùng resolvePublisherAliasMatch()
  // (sources/copyrightRules.js) để tìm xem NXB của tác phẩm này có sheet
  // bản quyền riêng hay không, rồi tra map tương ứng theo titleId (ưu tiên)
  // hoặc titleName (dự phòng nếu sheet đó không có cột ID).
  var registryEntry = resolvePublisherAliasMatch(work.publisher, publisherRegistry);
  if (registryEntry) {
    var map = publisherMaps[registryEntry.key];
    if (map) {
      var byId = work.titleId !== undefined ? map.get(String(work.titleId)) : undefined;
      var byName = work.titleName ? map.get(normalizeJapaneseText(work.titleName)) : undefined;
      var tier2Value = byId || byName;
      if (tier2Value) return { value: tier2Value, tier: 2 };
    }
  }

  // Tầng 3: 基本のC表記 tự sinh — tra công thức chung theo NXB, điền giá trị
  // thật của tác phẩm vào chỗ placeholder.
  var template = work.publisher ? basicNotationMap.get(normalizeJapaneseText(work.publisher)) : undefined;
  if (template) return { value: applyBasicNotationTemplate(template, work), tier: 3 };

  // Tầng 4: cá biệt — không tầng nào khớp. CỐ TÌNH trả về null thay vì tự bịa
  // 1 giá trị nào đó — main.js sẽ đưa tác phẩm này vào danh sách irregularTitles
  // để ghi log + báo Slack, chờ con người xử lý tay.
  return { value: null, tier: 4 };
}

// logic/copyrightResolver.js — logic ưu tiên 4 tầng xác định bản quyền (spec §6)
// tầng 1: CMS cột U > tầng 2: sheet riêng theo NXB > tầng 3: 基本のC表記 tự sinh > tầng 4: cá biệt

var COPYRIGHT_TITLE_TOKENS = ['作品名', 'タイトル名'];
var COPYRIGHT_AUTHOR_TOKENS = ['漫画家名・原作者名', '著者名', '作家名'];

// Thay placeholder text (vd "著者名", "作品名") trong rule 基本のC表記 bằng giá trị thật.
// Chỉ thay token đầu tiên khớp mỗi loại — rule có định dạng tự do nên đây là xử lý
// heuristic đơn giản, không bao phủ mọi rule nhiều dòng/điều kiện phức tạp.
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

function resolveCopyright(work, cmsCopyrightLookup, publisherRegistry, publisherMaps, basicNotationMap) {
  // Tầng 1: CMS cột U
  var cmsValue = cmsCopyrightLookup.get(String(work.cmsId));
  if (cmsValue) return { value: cmsValue, tier: 1 };

  // Tầng 2: sheet riêng theo NXB
  var registryEntry = null;
  for (var i = 0; i < publisherRegistry.length; i++) {
    var entry = publisherRegistry[i];
    var matched = entry.publisherAliases.some(function (alias) {
      return work.publisher && work.publisher.indexOf(alias) !== -1;
    });
    if (matched) { registryEntry = entry; break; }
  }
  if (registryEntry) {
    var map = publisherMaps[registryEntry.key];
    if (map) {
      var byId = work.titleId !== undefined ? map.get(String(work.titleId)) : undefined;
      var byName = work.titleName ? map.get(String(work.titleName).trim()) : undefined;
      var tier2Value = byId || byName;
      if (tier2Value) return { value: tier2Value, tier: 2 };
    }
  }

  // Tầng 3: 基本のC表記 tự sinh
  var template = work.publisher ? basicNotationMap.get(String(work.publisher).trim()) : undefined;
  if (template) return { value: applyBasicNotationTemplate(template, work), tier: 3 };

  // Tầng 4: cá biệt — không rule nào khớp, không tự bịa dữ liệu
  return { value: null, tier: 4 };
}

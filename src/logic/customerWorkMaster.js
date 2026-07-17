// logic/customerWorkMaster.js — build dòng dữ liệu cho 顧客作品マスタ
// từ 3 nguồn đã parse (CMS = nền tảng, join thêm regulation + NG title)

function buildCustomerWorkRows(cmsRecords, regulationLookup, ngTitleLookup) {
  return cmsRecords.map(function (cms) {
    var titleIdKey = String(cms.titleId);
    return {
      cmsId: cms.cmsId,
      titleId: cms.titleId,
      titleName: cms.titleName,
      author: cms.author,
      genre: cms.genre,
      publisher: cms.publisher,
      preStart: cms.preStart,
      preEnd: cms.preEnd,
      logoJudgement: regulationLookup.get(String(cms.cmsId)),
      remark: ngTitleLookup.get(titleIdKey) || null,
      distributionNgFlag: '', // ngoài phạm vi GAS❶ (spec §3.4) — luôn để trống
    };
  });
}

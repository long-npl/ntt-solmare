// 7_warnings.js — 15 loại cảnh báo ghi vào tab GAS1警告.
//
// Mỗi loại một hàm nhỏ. buildAllWarnings() ở cuối gom cả 14 lại để 9_main.js chỉ
// gọi một dòng và ghi một lần — mỗi lần chạy là một khối dòng liền nhau trên sheet.

// ==============================================================================

var WARNING_KIND_MATCH = '照合注意';
var WARNING_KIND_AMBIGUOUS = '照合曖昧';
var WARNING_KIND_ORPHAN = '孤立行';
var WARNING_KIND_NG_TITLE = '外部出稿NG注意';
var WARNING_KIND_SUSPENSION = '掲載停止注意';
var WARNING_KIND_COPYRIGHT = 'コピーライト注意';
var WARNING_KIND_PRE_END_EXTENSION = '先行延長注意';
var WARNING_KIND_MASS_FREE = '大量無料注意';
var WARNING_KIND_TITLE_CATEGORY = 'タイトル区分注意';
var WARNING_KIND_LP_PRODUCTION = 'LP制作注意';
var WARNING_KIND_PRE_CONFIRMATION = '出版社事前確認注意';
var WARNING_KIND_UPDATED_AT = '更新日注意';
var WARNING_KIND_REGULATION_LOST = '判定消失注意';
var WARNING_KIND_RULE_APPENDED = 'ルール自動追記';
var WARNING_KIND_VOLUME_RECOVERED = '巻数復元注意';

// Vượt ngưỡng này thì gộp thành 1 dòng tổng: 268 dòng cảnh báo riêng lẻ sẽ chôn
// mất mọi cảnh báo khác của lần chạy đó.
var COPYRIGHT_ORPHAN_SUMMARY_THRESHOLD = 20;

// Cùng lý do, cùng ngưỡng: lần ĐẦU bổ sung rule vào sheet 手動入力 (④) có thể ghi
// hàng trăm cặp (出版社, レーベル) một lúc — 1 dòng cảnh báo / cặp sẽ chôn vùi mọi
// cảnh báo khác của lần chạy đó, đúng kiểu buildCopyrightOrphanWarningRows() ở trên.
var RULE_APPENDED_SUMMARY_THRESHOLD = 20;

/** Dựng 1 dòng cảnh báo theo đúng thứ tự cột của tab GAS1警告. */
function warningRow(runAt, kind, titleNo, titleId, titleName, detail) {
  return {
    runAt: runAt,
    kind: kind,
    titleNo: titleNo === undefined || titleNo === null ? '' : titleNo,
    titleId: titleId === undefined || titleId === null ? '' : titleId,
    titleName: titleName === undefined || titleName === null ? '' : titleName,
    detail: detail,
  };
}

/**
 * 照合注意 + 照合曖昧 — 2 cảnh báo phát sinh từ chính cơ chế cascade.
 * @param {Array<object>} matches - filterAndMatchWorks().matches, ĐÃ qua
 * @param {Date} runAt - Dùng chung 1 giá trị cho cả lần chạy
 * @returns {Array<object>} Dòng cảnh báo
 */
function buildMatchWarningRows(matches, runAt) {
  var rows = [];
  matches.forEach(function (match) {
    if (!match.existing) return;
    if (match.tier === 2) {
      rows.push(warningRow(runAt, WARNING_KIND_MATCH, match.record.titleNo, match.record.titleId, match.record.titleName,
        'タイトルID 一致・タイトル名 変更: 「' + match.existing.titleName + '」→「' + match.record.titleName + '」'));
    } else if (match.tier === 3) {
      rows.push(warningRow(runAt, WARNING_KIND_MATCH, match.record.titleNo, match.record.titleId, match.record.titleName,
        'タイトル名 一致・タイトルID 変更: 「' + match.existing.titleId + '」→「' + match.record.titleId + '」'));
    }
    if (match.ambiguous) {
      rows.push(warningRow(runAt, WARNING_KIND_AMBIGUOUS, match.record.titleNo, match.record.titleId, match.record.titleName,
        '第' + match.tier + '層で候補が複数（タイトルNo: ' + match.candidateTitleNos.join(', ')
        + '）→ 最小のタイトルNoを採用。要確認'));
    }
  });
  return rows;
}

/**
 * 判定消失注意 — tác phẩm ĐANG có phán định trên master, nay tra không ra nữa.
 * @param {Array<{record: object, existing: object|null}>} matches - filterAndMatchWorks().matches,
 * @param {Date} runAt
 * @returns {Array<object>}
 */
function buildRegulationLostWarningRows(matches, runAt) {
  var rows = [];
  matches.forEach(function (match) {
    if (match.record.judged === true) return;
    var existing = match.existing;
    if (!existing) return;
    var held = [existing.policy, existing.general, existing.logoJudgement]
      .filter(function (value) { return normalizeJapaneseText(value) !== ''; });
    if (held.length === 0) return;
    rows.push(warningRow(runAt, WARNING_KIND_REGULATION_LOST, match.record.titleNo,
      match.record.titleId, match.record.titleName,
      'レギュレーションで 判定済み の行が見つかりません（削除/未判定/名前変更）。'
      + '①②③ は据え置き: [' + held.join(' / ') + ']'));
  });
  return rows;
}

/**
 * 孤立行 — dòng master mà KHÔNG record nào chiếm trong lần chạy này.
 * @param {Array<object>} existingRecords - readCustomerWorkMaster()
 * @param {Array<number>} orphanOffsets - filterAndMatchWorks().orphanOffsets
 * @param {Date} runAt
 * @returns {Array<object>}
 */
function buildOrphanWarningRows(existingRecords, orphanOffsets, runAt) {
  return orphanOffsets.map(function (offset) {
    var record = existingRecords[offset];
    return warningRow(runAt, WARNING_KIND_ORPHAN, record.titleNo, record.titleId, record.titleName,
      'この行に対応する CMS 先行タイトルが今回の実行で見つかりませんでした（改名/取り下げの可能性）。行は削除していません');
  });
}

/**
 * 外部出稿NG注意 — thay cho cột 備考 đã bị bỏ khỏi ガワ (spec §10a).
 * @param {Array<object>} records - Tác phẩm ĐƯỢC vào master (đã có titleNo)
 * @param {Map<string, string>} ngTitleLookup - sources.js: buildNgTitleLookup()
 * @param {Date} runAt
 * @returns {Array<object>}
 */
function buildNgTitleWarningRows(records, ngTitleLookup, runAt) {
  var rows = [];
  records.forEach(function (record) {
    var remark = ngTitleLookup.get(String(record.titleId));
    if (!remark) remark = ngTitleLookup.get(normalizeJapaneseText(record.titleName));
    if (!remark) return;
    rows.push(warningRow(runAt, WARNING_KIND_NG_TITLE, record.titleNo, record.titleId, record.titleName,
      '外部出稿用NGタイトルの備考: ' + remark));
  });
  return rows;
}

/**
 * コピーライト注意 — GOM THEO 出版社(+レーベル)+lý do, không phải 1 dòng/1 tác phẩm.
 * @param {Array<{record: object, copyrightReason: string, copyrightDetail: string}>} entries
 * @param {Date} runAt
 * @param {string|null} [errorMessage] - Nội dung lỗi nếu KHÔNG đọc được
 * @returns {Array<object>}
 */
function buildCopyrightWarningRows(entries, runAt, errorMessage) {
  var groups = new Map();
  var rowsFromError = [];
  if (errorMessage) {
    rowsFromError.push(warningRow(runAt, WARNING_KIND_COPYRIGHT, '', '', '',
      '出版社別コピーライトマスタ を読めませんでした → 出版社コピーライト(K列)は今回据え置き（処理は継続）: '
      + errorMessage));
  }
  entries.forEach(function (entry) {
    var key = normalizeJapaneseText(entry.record.publisher) + '\u0000'
      + normalizeJapaneseText(entry.record.label) + '\u0000' + entry.copyrightReason;
    if (!groups.has(key)) {
      groups.set(key, {
        publisher: entry.record.publisher,
        label: entry.record.label,
        reason: entry.copyrightReason,
        detail: entry.copyrightDetail,
        titleNames: [],
        count: 0,
      });
    }
    var group = groups.get(key);
    group.count += 1;
    if (group.titleNames.length < 3) group.titleNames.push(entry.record.titleName);
  });

  var rows = rowsFromError;
  groups.forEach(function (group) {
    var labelPart = normalizeJapaneseText(group.label) === '' ? '' : '／' + String(group.label);
    rows.push(warningRow(runAt, WARNING_KIND_COPYRIGHT, '', '',
      String(group.publisher) + labelPart,
      '出版社コピーライト未生成 ' + group.count + ' 件 [' + group.reason + '] ' + group.detail
      + ' 例: ' + group.titleNames.join(' / ')));
  });
  return rows;
}

/**
 * 掲載停止注意 — 2 tình huống của nguồn TSV cột (multi_title_yyyyMMdd.tsv).
 * @param {Array<object>} records - Tác phẩm được vào master (đã có titleNo)
 * @param {Map<string, string>} suspensionLookup - buildSuspensionLookup(), Map rỗng nếu không có file
 * @param {string|null} suspensionFileName - Tên file đã dùng, null nếu không tìm thấy file nào
 * @param {Date} runAt
 * @param {string|null} [errorMessage] - Nội dung lỗi nếu bước đọc nguồn này THẤT BẠI
 * @returns {Array<object>}
 */
function buildSuspensionWarningRows(records, suspensionLookup, suspensionFileName, runAt, errorMessage) {
  var rows = [];
  if (errorMessage) {
    rows.push(warningRow(runAt, WARNING_KIND_SUSPENSION, '', '', '',
      '掲載停止日付の取得に失敗 → I列は今回据え置き（処理は継続）: ' + errorMessage));
  } else if (!suspensionFileName) {
    rows.push(warningRow(runAt, WARNING_KIND_SUSPENSION, '', '', '',
      'multi_title_yyyyMMdd.tsv が見つかりませんでした → 掲載停止日付(I列)は今回据え置き'));
  }

  var byTitleId = new Map();
  records.forEach(function (record) {
    if (!isDigits(record.titleId)) return;
    var key = normalizeJapaneseText(record.titleId);
    if (!suspensionLookup.has(key)) return;
    if (!byTitleId.has(key)) byTitleId.set(key, []);
    byTitleId.get(key).push(record);
  });
  byTitleId.forEach(function (group, key) {
    if (group.length < 2) return;
    var names = group.map(function (record) { return record.titleName; }).join(' / ');
    group.forEach(function (record) {
      rows.push(warningRow(runAt, WARNING_KIND_SUSPENSION, record.titleNo, record.titleId, record.titleName,
        'タイトルID ' + key + ' を ' + group.length + ' 作品が共有 → 同じ掲載停止日付「'
        + suspensionLookup.get(key) + '」が入ります: ' + names));
    });
  });
  return rows;
}

/**
 * 先行延長注意 — cảnh báo của nguồn 【先行作品】独占期間の延長.
 * @param {Array<object>} records - Tác phẩm được vào master (đã có titleNo)
 * @param {Map<string, object>} extensionLookup - buildPreEndExtensionLookup(), Map rỗng nếu nguồn lỗi
 * @param {Date} runAt
 * @param {string|null} [errorMessage] - Nội dung lỗi nếu bước đọc nguồn này THẤT BẠI
 * @returns {Array<object>}
 */
function buildPreEndExtensionWarningRows(records, extensionLookup, runAt, errorMessage) {
  var rows = [];
  if (errorMessage) {
    rows.push(warningRow(runAt, WARNING_KIND_PRE_END_EXTENSION, '', '', '',
      '【先行作品】独占期間の延長 を読めませんでした → 先行終了日（延長）R列・（最終確定）S列は今回据え置き'
      + '（処理は継続）: ' + errorMessage));
    return rows;
  }

  // --- (2) ô không phải 期日 ở lần 回目 SAU lần thắng, gộp theo nội dung ---
  var skippedGroups = new Map();
  // --- (3) nhóm tác phẩm dùng chung 1 タイトルID ---
  var byTitleId = new Map();

  records.forEach(function (record) {
    if (!isDigits(record.titleId)) return;
    var key = normalizeJapaneseText(record.titleId);
    var found = extensionLookup.get(key);
    if (found === undefined) return;

    if (!byTitleId.has(key)) byTitleId.set(key, []);
    byTitleId.get(key).push(record);

    (found.skipped || []).forEach(function (skipped) {
      var text = normalizeJapaneseText(skipped.value);
      var groupKey = skipped.roundName + '\u0000' + text;
      if (!skippedGroups.has(groupKey)) {
        skippedGroups.set(groupKey, {
          roundName: skipped.roundName, value: skipped.value,
          usedRoundName: found.roundName, titleNames: [], count: 0,
        });
      }
      var group = skippedGroups.get(groupKey);
      group.count += 1;
      if (group.titleNames.length < 3) group.titleNames.push(record.titleName);
    });
  });

  skippedGroups.forEach(function (group) {
    rows.push(warningRow(runAt, WARNING_KIND_PRE_END_EXTENSION, '', '', '',
      group.roundName + 'が期日ではないため R列に反映していません（' + group.count + ' 件）: 「'
      + String(group.value).replace(/\n/g, ' / ') + '」→ R列は ' + group.usedRoundName
      + ' の期日のまま。例: ' + group.titleNames.join(' / ')));
  });

  byTitleId.forEach(function (group, key) {
    if (group.length < 2) return;
    var names = group.map(function (record) { return record.titleName; }).join(' / ');
    group.forEach(function (record) {
      rows.push(warningRow(runAt, WARNING_KIND_PRE_END_EXTENSION, record.titleNo, record.titleId, record.titleName,
        'タイトルID ' + key + ' を ' + group.length + ' 作品が共有 → 同じ先行終了日（延長）「'
        + extensionLookup.get(key).value + '」が入ります: ' + names));
    });
  });
  return rows;
}

/**
 * 大量無料注意 — cảnh báo của nguồn 大量無料希望作品リスト_CA様.
 * @param {Array<object>} records - Tác phẩm được vào master (đã có titleNo)
 * @param {Map<string, object>} massFreeLookup - buildMassFreeLookup(), Map rỗng nếu nguồn lỗi
 * @param {Date} runAt
 * @param {string|null} [errorMessage] - Lỗi đọc nguồn, hoặc thông báo "chưa cấu hình ID"
 * @returns {Array<object>}
 */
function buildMassFreeWarningRows(records, massFreeLookup, runAt, errorMessage) {
  var rows = [];
  if (errorMessage) {
    rows.push(warningRow(runAt, WARNING_KIND_MASS_FREE, '', '', '',
      '大量無料希望作品リスト_CA様 を読めませんでした → 大量無料開始日 T列・終了日 U列は今回据え置き'
      + '（処理は継続）: ' + errorMessage));
    return rows;
  }

  records.forEach(function (record) {
    if (!isDigits(record.titleId)) return;
    var found = massFreeLookup.get(normalizeJapaneseText(record.titleId));
    if (found === undefined) return;
    var notes = [];
    if (found.rowCount >= 2) {
      notes.push(found.rowCount + ' 件のキャンペーン行を1つの期間に集約（最小の開始日〜最大の終了日）');
    }
    if (found.rejectedCount > 0) {
      notes.push('出稿回答が✕の ' + found.rejectedCount + ' 行を除外');
    }
    if (notes.length === 0) return;
    rows.push(warningRow(runAt, WARNING_KIND_MASS_FREE, record.titleNo, record.titleId, record.titleName,
      notes.join(' / ') + ' → T列「' + found.start + '」U列「' + found.end + '」'));
  });
  return rows;
}

/**
 * タイトル区分注意 — 2 tình huống của nguồn 出稿コミット管理表.
 * @param {Array<object>} records - Tác phẩm được vào master (đã có titleNo)
 * @param {Map<string, object>} commitFlagLookup - buildCommitFlagLookup(), Map rỗng nếu nguồn lỗi
 * @param {Date} runAt
 * @param {string|null} [errorMessage] - Lỗi đọc nguồn, hoặc thông báo "chưa cấu hình ID"
 * @returns {Array<object>}
 */
function buildTitleCategoryWarningRows(records, commitFlagLookup, runAt, errorMessage) {
  var rows = [];
  if (errorMessage) {
    rows.push(warningRow(runAt, WARNING_KIND_TITLE_CATEGORY, '', '', '',
      '出稿コミット管理表（新作・既存・キャン強化）を読めませんでした → タイトル区分 E列は今回据え置き'
      + '（処理は継続）: ' + errorMessage));
    return rows;
  }

  records.forEach(function (record) {
    var found = commitFlagLookup.get(normalizeJapaneseText(record.titleName));
    if (found === undefined) return;
    if (found.rowCount < 2 || found.categories.length < 2) return;
    rows.push(warningRow(runAt, WARNING_KIND_TITLE_CATEGORY, record.titleNo, record.titleId, record.titleName,
      '出稿コミット管理表に同名 ' + found.rowCount + ' 行（区分: ' + found.categories.join('・') + '）'
      + ' → うち ' + found.commitRowCount + ' 行がコミットフラグのため E列「'
      + (found.committed ? TITLE_CATEGORY_COMMIT : TITLE_CATEGORY_EXCLUSIVE) + '」'));
  });
  return rows;
}

/**
 * 更新日注意 — master nào không đóng dấu được thời điểm chạy vào ô 更新日.
 * @param {Array<{label: string, cell: string|null}>} stamps - Mỗi master 1 phần tử
 * @param {Date} runAt
 * @returns {Array<object>}
 */
function buildUpdatedAtWarningRows(stamps, runAt) {
  var rows = [];
  stamps.forEach(function (stamp) {
    if (stamp.cell !== null && stamp.cell !== undefined) return;
    rows.push(warningRow(runAt, WARNING_KIND_UPDATED_AT, '', '', '',
      stamp.label + ': 「更新日」ラベルが見つからず、実行日時を書き込めませんでした'
      + '（データ自体は更新済み）。ラベルの位置・文字列を確認してください'));
  });
  return rows;
}

/**
 * 出版社事前確認注意 — 2 tình huống làm cột của コピーライトマスタ không được điền.
 * @param {boolean} hasColumn - readCopyrightMaster().hasPreConfirmationColumn
 * @param {Array<object>} rules - parsePublisherCopyrightRules(), mảng rỗng nếu nguồn lỗi
 * @param {Date} runAt
 * @returns {Array<object>}
 */
function buildPreConfirmationWarningRows(hasColumn, rules, runAt) {
  var rows = [];
  if (!hasColumn) {
    rows.push(warningRow(runAt, WARNING_KIND_PRE_CONFIRMATION, '', '', '',
      'コピーライトマスタに「出版社事前確認」列がありません → Q列は書き込まず、差分比較からも除外'
      + '（処理は継続）。ガワに列を追加すれば自動で有効化されます'));
  }

  if (rules.length > 0) {
    var withValue = rules.filter(function (rule) {
      return normalizeJapaneseText(rule.preConfirmation) !== '';
    }).length;
    if (withValue === 0) {
      rows.push(warningRow(runAt, WARNING_KIND_PRE_CONFIRMATION, '', '', '',
        '出版社別コピーライトマスタ ' + rules.length + ' ルールすべてで「(出版社)事前確認」が空です'
        + ' → 列名が変わった可能性があります（Q列は全行空欄になります）'));
    }
  }
  return rows;
}

/**
 * LP制作注意 — tác phẩm mà resolveLpProductionForMatch() trả về '' (nhánh 4).
 * @param {Array<{record: object, existing: object|null}>} matches - Tác phẩm được vào
 * @param {Date} runAt
 * @returns {Array<object>}
 */
function buildLpProductionWarningRows(matches, runAt) {
  var rows = [];
  matches.forEach(function (match) {
    var record = match.record;
    if (normalizeJapaneseText(record.lpProduction) !== '') return;
    var logo = normalizeJapaneseText(record.logoJudgement) !== ''
      ? record.logoJudgement
      : (match.existing ? match.existing.logoJudgement : '');
    var cause = normalizeJapaneseText(logo) === ''
      ? '③シーモアロゴ判定が未判定（マスタ上の既存値もなし）'
      : '③シーモアロゴ判定「' + normalizeJapaneseText(logo) + '」が ロゴあり/ロゴなし のいずれでもない';
    rows.push(warningRow(runAt, WARNING_KIND_LP_PRODUCTION, record.titleNo, record.titleId, record.titleName,
      'ジャンル「' + normalizeJapaneseText(record.genre) + '」が TL/BL 以外 かつ ' + cause
      + ' → LP制作 J列は判定できず据え置き'));
  });
  return rows;
}

/**
 * Với mỗi item trong toUpdateItems, so sánh previous[field.key] và
 * record[field.key] cho TỪNG field trong fieldDefs — chỉ tạo 1 dòng log cho
 * field THỰC SỰ thay đổi (previous/record giống hệt nhau thì bỏ qua field
 * đó, không phải cả item). 1 tác phẩm đổi 2 field sẽ tạo ra 2 dòng log riêng
 * (không gộp chung 1 dòng nhiều field), để mỗi dòng log là 1 sự kiện đơn giản,
 * dễ lọc/tìm kiếm sau này trên sheet.
 * NHẬN BẢNG CỘT chứ không phải một danh sách fieldDefs rời. Trước đây fieldDefs
 * khai báo `compare` riêng, tức là chỗ THỨ BA phải giữ khớp tay với chế độ ghi và
 * với phép so diff — và khi nó lệch, log ghi '必要 -> (trống)' cho những ô mà đường
 * ghi không hề đụng tới. Xem docs/decisions.md #engine-01
 *
 * @param {string} masterLabel - Tên master, để 2 master ghi chung 1 tab vẫn phân biệt được
 * @param {Array<{record: object, previous: object}>} toUpdateItems
 * @param {Array<object>} columns - Bảng cột của master đang xử lý
 * @param {Date} runAt - Dùng chung 1 giá trị cho cả lần chạy
 * @returns {Array<object>} 1 field đổi = 1 dòng, để mỗi dòng log là 1 sự kiện đơn giản
 */
function buildChangeDetailRows(masterLabel, toUpdateItems, columns, runAt) {
  var rows = [];
  toUpdateItems.forEach(function (item) {
    columns.forEach(function (column) {
      if (column.skipCompare === true) return;
      var compare = compareFor(column);
      if (compare === null) return;
      var oldValue = item.previous[column.field];
      var newValue = item.record[column.field];
      if (compare(oldValue, newValue)) return;
      rows.push({
        runAt: runAt,
        master: masterLabel,
        titleNo: item.record.titleNo,
        titleName: item.record.titleName,
        field: column.header,
        oldValue: oldValue,
        newValue: newValue,
      });
    });
  });
  return rows;
}


/**
 * 孤立行 của コピーライトマスタ — dòng có タイトルNo mà 顧客作品マスタ không còn nữa.
 *
 * 顧客作品マスタ vốn đã có cảnh báo này; コピーライトマスタ thì không, nên khi
 * 顧客作品マスタ bị xoá làm lại (タイトルNo cấp lại từ 1) mà コピーライトマスタ không xoá
 * theo, nó tích dòng rác hoàn toàn im lặng. Xem docs/decisions.md #orphan-01
 */
function buildCopyrightOrphanWarningRows(orphans, runAt) {
  if (!orphans || orphans.length === 0) return [];
  if (orphans.length > COPYRIGHT_ORPHAN_SUMMARY_THRESHOLD) {
    var nos = orphans.slice(0, 10).map(function (record) { return record.titleNo; });
    return [warningRow(runAt, WARNING_KIND_ORPHAN, '', '', 'コピーライトマスタ',
      'コピーライトマスタ の ' + orphans.length + ' 行に対応する タイトルNo が 顧客作品マスタ に'
      + 'ありません。顧客作品マスタ を作り直した場合は コピーライトマスタ も消してください'
      + '（タイトルNo が 1 から振り直され、古い番号は別の作品を指します）。例: ' + nos.join(', '))];
  }
  return orphans.map(function (record) {
    return warningRow(runAt, WARNING_KIND_ORPHAN, record.titleNo, record.titleId, record.titleName,
      'コピーライトマスタ のこの行に対応する タイトルNo が 顧客作品マスタ にありません。行は削除していません');
  });
}

/**
 * ルール自動追記 — các cặp (出版社/レーベル) GAS vừa ghi bổ sung vào ④, hoặc lý do ghi lỗi.
 *
 * Vượt ngưỡng RULE_APPENDED_SUMMARY_THRESHOLD thì gộp thành 1 dòng tổng (nêu số lượng +
 * ~10 cặp đầu) thay vì 1 dòng/cặp — lần ĐẦU bổ sung có thể ra hàng trăm dòng cùng lúc,
 * và ngần ấy dòng cảnh báo sẽ chôn vùi mọi cảnh báo khác của lần chạy đó. Cùng tinh thần
 * buildCopyrightOrphanWarningRows() ở trên.
 */
function buildRuleAppendedWarningRows(appended, runAt) {
  var rows = [];
  if (!appended) return rows;
  if (appended.error) {
    rows.push(warningRow(runAt, WARNING_KIND_RULE_APPENDED, '', '', '',
      '出版社別コピーライトマスタ への自動追記に失敗しました（処理は継続、コピーライトは据え置き）: '
      + appended.error));
    return rows;
  }
  var added = appended.added || [];
  if (added.length === 0) return rows;

  function pairLabel(pair) {
    var label = normalizeJapaneseText(pair.label) === '' ? '' : '／' + String(pair.label);
    return String(pair.publisher) + label;
  }

  if (added.length > RULE_APPENDED_SUMMARY_THRESHOLD) {
    var examples = added.slice(0, 10).map(pairLabel);
    rows.push(warningRow(runAt, WARNING_KIND_RULE_APPENDED, '', '', '',
      'ルール未登録のため 出版社別コピーライトマスタ の最下部に ' + added.length + ' 行を追加しました。'
      + 'テンプレート列を記入してください（記入までは 出版社コピーライト は空欄のままです）。例: '
      + examples.join(', ')));
    return rows;
  }

  added.forEach(function (pair) {
    rows.push(warningRow(runAt, WARNING_KIND_RULE_APPENDED, '', '', pairLabel(pair),
      'ルール未登録のため 出版社別コピーライトマスタ の最下部に行を追加しました。'
      + 'テンプレート列を記入してください（記入までは 出版社コピーライト は空欄のままです）'));
  });
  return rows;
}

/**
 * 巻数復元注意 — ô 巻数 bị Sheets nuốt thành NGÀY, số tập được SUY RA từ thành phần ngày.
 *
 * Bắt buộc phải có dòng này: giá trị đó là một phép đoán (xem docs/decisions.md
 * #volume-05), và một ngày THẬT ai đó gõ vào cột 巻数 cũng sẽ cho ra số y như vậy. Ghi im
 * lặng thì không ai biết để sửa nguồn.
 */
function buildVolumeRecoveredWarningRows(records, runAt) {
  var rows = [];
  records.forEach(function (record) {
    if (!isRecoveredFromDate(record)) return;
    rows.push(warningRow(runAt, WARNING_KIND_VOLUME_RECOVERED, record.titleNo,
      record.titleId, record.titleName,
      'CMS の 巻数 が日付になっています（Sheets が「1-N」を日付に変換）。'
      + '初回配信巻数 は日付の「日」から復元した ' + String(record.firstVolume)
      + ' です。本当の日付が入力されている場合はこの値が誤りなので、CMS 側で'
      + ' 巻数 列の表示形式をテキストにして入力し直してください'));
  });
  return rows;
}

/**
 * Gom cả 14 loại cảnh báo thành 1 mảng.
 *
 * Nhận nguyên ctx thay vì 13 tham số rời: thêm một loại cảnh báo về sau chỉ phải
 * sửa ở đây và ở 9_main.js chỗ dựng ctx, không phải đổi chữ ký.
 */
function buildAllWarnings(ctx) {
  return buildMatchWarningRows(ctx.matches, ctx.runAt)
    .concat(buildOrphanWarningRows(ctx.existingCustomerRows, ctx.orphanOffsets, ctx.runAt))
    .concat(buildNgTitleWarningRows(ctx.records, ctx.ngTitleLookup, ctx.runAt))
    .concat(buildSuspensionWarningRows(ctx.records, ctx.suspensionLookup,
      ctx.suspensionFileName, ctx.runAt, ctx.errors.suspension))
    .concat(buildCopyrightWarningRows(ctx.copyrightWarnings, ctx.runAt,
      ctx.errors.publisherCopyright))
    .concat(buildPreEndExtensionWarningRows(ctx.records, ctx.preEndLookup, ctx.runAt,
      ctx.errors.preEnd))
    .concat(buildMassFreeWarningRows(ctx.records, ctx.massFreeLookup, ctx.runAt,
      ctx.errors.massFree))
    .concat(buildTitleCategoryWarningRows(ctx.records, ctx.commitLookup, ctx.runAt,
      ctx.errors.commit))
    .concat(buildLpProductionWarningRows(ctx.matches, ctx.runAt))
    .concat(buildRegulationLostWarningRows(ctx.matches, ctx.runAt))
    .concat(buildPreConfirmationWarningRows(ctx.hasPreConfirmationColumn,
      ctx.publisherCopyrightRules || [], ctx.runAt))
    .concat(buildCopyrightOrphanWarningRows(ctx.copyrightOrphans, ctx.runAt))
    .concat(buildRuleAppendedWarningRows(ctx.ruleAppended, ctx.runAt))
    .concat(buildVolumeRecoveredWarningRows(ctx.records, ctx.runAt))
    .concat(buildUpdatedAtWarningRows(ctx.stamps, ctx.runAt));
}

/** Đếm số dòng theo từng loại, để ghi vào các cột số đếm của GAS1ログ. */
function countWarningsByKind(rows) {
  var counts = {};
  rows.forEach(function (row) {
    counts[row.kind] = (counts[row.kind] || 0) + 1;
  });
  return counts;
}

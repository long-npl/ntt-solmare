# tools/verify/exportFixtures.py — export các sheet nguồn từ example/*.xlsx ra
# JSON mảng 2 chiều, để harness Node (tools/verify/run.js --data) đối chiếu lại
# đúng những con số trong spec §12.
#
# CHỈ ĐỌC. Không ghi gì vào Google Sheets, không sửa file .xlsx nào.
#
# Fidelity quan trọng nhất: ô trống phải ra '' (đúng như SpreadsheetApp trả về
# cho ô trống), KHÔNG phải None/null — vì logic thật phân biệt '' với undefined
# (xem JSDoc normalizeForCompare trong src/logic/upsert.js).
#
# Dùng: python tools/verify/exportFixtures.py

import datetime
import json
import os

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, 'tools', 'verify', 'fixtures')

PUBLISHER_RULES = 'example/【池永社内】出版社からの追記ルールと外部出稿NGタイトル (1).xlsx'

TARGETS = [
    ('regulation', 'example/【池永社内】【社外用】作品レギュレーション判定.xlsx', 'シート1'),
    ('cms', 'example/【池永社内】【マスタ】先行タイトル情報（CMS）_代理店共通_DX_debug.xlsx',
     '★列追加の場合は増渕まで★'),
    ('ngTitles', PUBLISHER_RULES, '外部出稿用NGタイトル'),
    ('customerMasterGawa', 'example/【池永社内】顧客作品マスタ0803.xlsx', '顧客作品マスタ'),
    # Nguồn quy tắc sinh 出版社コピーライト. Hiện chỉ là 1 sheet trong file thiết kế
    # của ソル — khi nó được chuyển sang spreadsheet thật thì đổi đường dẫn ở đây.
    ('publisherCopyright', 'example/【ソル】タイトルマスタ　ガワ作成 0803 .xlsx', '出版社別コピーライトマスタ'),
    ('copyrightMasterGawa', 'example/【池永社内】コピーライトマスタ0804.xlsx', 'コピーライトマスタ'),
    # Nguồn cột R 先行終了日（延長）. Sheet có 3 hàng header (hàng 3 mới là 1回目〜7回目).
    ('preEndExtension', 'example/【安蒜社内】【先行作品】独占期間の延長（代理店共有）.xlsx', 'Sheet1'),
    # Nguồn cột T/U 大量無料開始日・終了日. File có 8 sheet — sheet ĐÚNG là ★出稿回答シート
    # (H列 キャンペーン開始日 / I列 キャンペーン終了日 theo spec). 2 sheet khác cũng có cặp cột
    # cùng tên nhưng lệch vị trí, xem CONFIG.SOURCES.MASS_FREE trong src/config.js.
    ('massFree', 'example/【安蒜社内】大量無料希望作品リスト_CA様.xlsx', '★出稿回答シート'),
    # Nguồn cột E タイトル区分. File chỉ có đúng 1 sheet.
    ('commitManagement', 'example/【安蒜社内】出稿コミット管理表（新作・既存・キャン強化）.xlsx',
     '広告出稿必須タイトル'),
]


def cell(value):
    """Chuyển 1 ô openpyxl sang giá trị JSON, giữ đúng ngữ nghĩa của Sheets.

    Phải xử lý CẢ datetime.time và datetime.timedelta, không chỉ date/datetime:
    file CMS thật có ô được định dạng là giờ (và 1 ô có serial ngày sai — openpyxl
    cảnh báo 'outside the limits for dates' rồi trả về error value). Không xử lý
    thì json.dump throw giữa lúc ghi và để lại file JSON dở dang.
    """
    if value is None:
        return ''
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        return value.isoformat()
    if isinstance(value, datetime.timedelta):
        return str(value)
    return value


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, rel_path, sheet_name in TARGETS:
        path = os.path.join(ROOT, rel_path)
        # data_only=True BẮT BUỘC: các sheet này dùng IMPORTRANGE, không có nó
        # openpyxl trả về chuỗi công thức '=IFERROR(__xludf.DUMMYFUNCTION(...))'
        # thay vì giá trị thật.
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb[sheet_name]
        rows = [[cell(c) for c in row] for row in ws.iter_rows(values_only=True)]
        # Bỏ các dòng trống ở cuối: openpyxl hay trả thêm vài dòng rỗng, còn
        # getDataRange() của Sheets thì không.
        while rows and not any(str(c).strip() for c in rows[-1]):
            rows.pop()
        # Serialize TRƯỚC rồi mới ghi 1 lần: json.dump ghi theo dòng chảy, nên nếu
        # gặp kiểu không serialize được ở giữa file thì để lại 1 file JSON dở dang
        # mà harness sẽ đọc như JSON hỏng (báo lỗi rất khó hiểu).
        payload = json.dumps(rows, ensure_ascii=False)
        out = os.path.join(OUT_DIR, name + '.json')
        with open(out, 'w', encoding='utf-8') as f:
            f.write(payload)
        # Thông báo cố tình dùng ASCII: console mặc định của Windows (cp932 khi
        # locale là Nhật) không in được dấu tiếng Việt và sẽ throw UnicodeEncodeError.
        print('%-20s %5d rows -> %s' % (name, len(rows), out))
        wb.close()


if __name__ == '__main__':
    main()

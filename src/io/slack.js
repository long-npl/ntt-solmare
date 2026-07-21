// io/slack.js — gửi cảnh báo qua Slack Web API (chat.postMessage), KHÔNG dùng
// Incoming Webhook (quyết định thiết kế cụ thể — xem spec §8).
//
// Cách điền token thật: mở project trong Apps Script editor > biểu tượng
// bánh răng (Project Settings) > mục Script Properties > Add script property:
//   SLACK_BOT_TOKEN  = xoxb-...   (Bot User OAuth Token, scope chat:write)
//   SLACK_CHANNEL_ID = C0XXXXXXX  (ID kênh, không phải tên #kênh)
// Trước đó cần tạo 1 Slack App nội bộ, cấp scope chat:write, và INVITE bot đó
// vào channel muốn nhận cảnh báo (nếu không invite, gọi API sẽ báo lỗi
// "not_in_channel" dù token đúng).

/**
 * Gửi 1 tin nhắn text tới kênh Slack đã cấu hình.
 *
 * AN TOÀN KHI CHƯA CẤU HÌNH: nếu SLACK_BOT_TOKEN hoặc SLACK_CHANNEL_ID chưa
 * được điền trong Script Properties, hàm này KHÔNG throw lỗi — chỉ ghi vào
 * Logger.log() rồi return, để không làm gián đoạn luồng chính (runGas1() ở
 * main.js gọi notifySlack() cả trong trường hợp tác phẩm cá biệt LẪN khi có
 * lỗi runtime — nếu Slack tự nó lỗi/chưa cấu hình, không được vì thế mà khiến
 * cả script fail theo).
 *
 * muteHttpExceptions: true — để lỗi HTTP (vd token sai, bot chưa được invite
 * vào channel) không tự động throw exception làm dừng script; nếu cần debug
 * lỗi gửi Slack thất bại, có thể sửa tạm thành false hoặc log response ra.
 *
 * @param {string} message - Nội dung tin nhắn (text thường, không cần format Slack markdown)
 * @returns {void}
 */
function notifySlack(message) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty(CONFIG.SLACK_PROPERTY_KEYS.BOT_TOKEN);
  var channel = props.getProperty(CONFIG.SLACK_PROPERTY_KEYS.CHANNEL_ID);

  if (!token || !channel) {
    Logger.log('notifySlack: chưa cấu hình SLACK_BOT_TOKEN/SLACK_CHANNEL_ID, bỏ qua Slack. Nội dung: ' + message);
    return;
  }

  UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ channel: channel, text: message }),
    muteHttpExceptions: true,
  });
}

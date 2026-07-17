// io/slack.js — gửi cảnh báo qua Slack Web API (chat.postMessage), KHÔNG dùng
// Incoming Webhook. Token/channel đọc từ Script Properties — nếu chưa cấu hình
// thì chỉ ghi log, không throw lỗi (không chặn luồng chính).
//
// Cách điền token thật: Apps Script editor > Project Settings (biểu tượng
// bánh răng) > Script Properties > Add property:
//   SLACK_BOT_TOKEN  = xoxb-...
//   SLACK_CHANNEL_ID = C0XXXXXXX

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

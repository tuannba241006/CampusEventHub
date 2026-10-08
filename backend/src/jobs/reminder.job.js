const {
  sendTomorrowEventReminders,
} = require('../services/reminder.service');

async function runReminderJobOnce() {
  console.log(
    '[Reminder Job] Bắt đầu kiểm tra sự kiện ngày mai...'
  );

  try {
    const result =
      await sendTomorrowEventReminders();

    console.log(
      '[Reminder Job] Hoàn tất:',
      result
    );

    return result;
  } catch (error) {
    console.error(
      '[Reminder Job] Lỗi:',
      error.message
    );

    throw error;
  }
}

module.exports = {
  runReminderJobOnce,
};
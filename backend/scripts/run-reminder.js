require('dotenv').config();

const {
  runReminderJobOnce,
} = require('../src/jobs/reminder.job');

async function main() {
  console.log(
    '================================'
  );

  console.log(
    'Campus Event Hub Reminder Runner'
  );

  console.log(
    '================================'
  );

  try {
    const result =
      await runReminderJobOnce();

    console.log(
      '[Reminder Runner] Kết quả:',
      result
    );

    process.exitCode = 0;
  } catch (error) {
    console.error(
      '[Reminder Runner] Thất bại:',
      error
    );

    process.exitCode = 1;
  }
}

main();
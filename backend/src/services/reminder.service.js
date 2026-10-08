const supabase = require('../config/supabase');
const {
  sendEventReminder,
} = require('./mail.service');

// ============================================================
// LẤY NGÀY MAI THEO MÚI GIỜ VIỆT NAM
// ============================================================

function getTomorrowDateVietnam() {
  const now = new Date();

  const vietnamNow = new Date(
    now.toLocaleString('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
    })
  );

  vietnamNow.setDate(
    vietnamNow.getDate() + 1
  );

  const year =
    vietnamNow.getFullYear();

  const month = String(
    vietnamNow.getMonth() + 1
  ).padStart(2, '0');

  const day = String(
    vietnamNow.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

// ============================================================
// GỬI REMINDER CHO MỘT NGÀY CỤ THỂ
// Hàm này giúp mình test bằng event có sẵn trong DB
// ============================================================

async function sendEventRemindersForDate(
  targetDate
) {
  console.log(
    `Đang tìm sự kiện ngày ${targetDate}...`
  );

  // 1. Tìm sự kiện diễn ra ngày targetDate
  const {
    data: events,
    error: eventError,
  } = await supabase
    .from('su_kien')
    .select(`
      ma_su_kien,
      ten_su_kien,
      ngay_dien_ra,
      thoi_gian_bat_dau,
      thoi_gian_ket_thuc,
      dia_diem,
      phong,
      trang_thai_su_kien
    `)
    .eq(
      'ngay_dien_ra',
      targetDate
    )
    .eq(
      'da_xoa',
      false
    )
    .in(
      'trang_thai_su_kien',
      ['SapToChuc', 'DangDienRa']
    );

  if (eventError) {
    throw eventError;
  }

  if (!events?.length) {
    console.log(
      `Không có sự kiện nào ngày ${targetDate}`
    );

    return {
      events: 0,
      recipients: 0,
      sent: 0,
      failed: 0,
    };
  }

  let recipientCount = 0;
  let sentCount = 0;
  let failedCount = 0;

  // 2. Duyệt từng sự kiện
  for (const event of events) {
    console.log(
      `\nSự kiện: ${event.ten_su_kien}`
    );

    // 3. Lấy các vé vẫn đang active
    const {
      data: tickets,
      error: ticketError,
    } = await supabase
      .from('dang_ky')
      .select(`
        ma_dang_ky,
        ma_qr_code,
        trang_thai_ve,
        tai_khoan (
          email,
          ho_ten,
          da_xoa
        )
      `)
      .eq(
        'ma_su_kien',
        event.ma_su_kien
      )
      .eq(
        'trang_thai_ve',
        'DaDangKy'
      )
      .eq(
        'da_xoa',
        false
      );

    if (ticketError) {
      console.error(
        `Lỗi lấy vé event ${event.ma_su_kien}:`,
        ticketError.message
      );

      continue;
    }

    const validTickets =
      (tickets || []).filter(
        (ticket) =>
          ticket.tai_khoan &&
          ticket.tai_khoan.email &&
          ticket.tai_khoan.da_xoa !== true
      );

    recipientCount +=
      validTickets.length;

    // 4. Gửi reminder cho từng người
    for (const ticket of validTickets) {
      try {
        await sendEventReminder(
          ticket.tai_khoan.email,
          event,
          {
            ticketId:
              ticket.ma_dang_ky,

            qrCode:
              ticket.ma_qr_code,
          }
        );

        sentCount++;

        console.log(
          `✓ Đã gửi: ${ticket.tai_khoan.email}`
        );
      } catch (error) {
        failedCount++;

        console.error(
          `✗ Gửi thất bại ${ticket.tai_khoan.email}:`,
          error.message
        );
      }
    }
  }

  return {
    events: events.length,
    recipients: recipientCount,
    sent: sentCount,
    failed: failedCount,
  };
}

// ============================================================
// ĐÚNG YÊU CẦU GÓI 6:
// GỬI NHẮC NHỞ TRƯỚC SỰ KIỆN 1 NGÀY
// ============================================================

async function sendTomorrowEventReminders() {
  const tomorrow =
    getTomorrowDateVietnam();

  return sendEventRemindersForDate(
    tomorrow
  );
}

module.exports = {
  getTomorrowDateVietnam,
  sendEventRemindersForDate,
  sendTomorrowEventReminders,
};
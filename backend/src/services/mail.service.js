const QRCode = require('qrcode');
const supabase = require('../config/supabase');

// ============================================================
// BREVO EMAIL API CONFIG
// ============================================================

function getBrevoConfig() {
  const {
    BREVO_API_KEY,
    EMAIL_FROM,
    EMAIL_FROM_NAME,
  } = process.env;

  if (!BREVO_API_KEY || !EMAIL_FROM) {
    throw new Error(
      'Thiếu BREVO_API_KEY hoặc EMAIL_FROM trong environment variables'
    );
  }

  return {
    apiKey: BREVO_API_KEY,
    senderEmail: EMAIL_FROM,
    senderName:
      EMAIL_FROM_NAME || 'Campus Event Hub',
  };
}

// ============================================================
// SEND EMAIL VIA BREVO HTTP API
// ============================================================

async function sendBrevoEmail({
  to,
  subject,
  textContent,
  htmlContent,
  attachments = [],
}) {
  if (!to) {
    throw new Error(
      'Không có email người nhận'
    );
  }

  const {
    apiKey,
    senderEmail,
    senderName,
  } = getBrevoConfig();

  const controller =
    new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 10000);

  try {
    const payload = {
      sender: {
        name: senderName,
        email: senderEmail,
      },

      to: [
        {
          email: to,
        },
      ],

      subject,
      textContent,
      htmlContent,
    };

    // Brevo dùng "attachment" (số ít)
    // Mỗi file có name + content Base64.
    if (attachments.length > 0) {
      payload.attachment =
        attachments.map(
          (attachment) => ({
            name: attachment.filename,
            content: attachment.content,
          })
        );
    }

    console.log(
      '[EMAIL API] Sending email:',
      {
        to,
        subject,
        attachments:
          attachments.length,
      }
    );

    const response = await fetch(
      'https://api.brevo.com/v3/smtp/email',
      {
        method: 'POST',

        headers: {
          accept: 'application/json',
          'content-type':
            'application/json',
          'api-key': apiKey,
        },

        body: JSON.stringify(payload),

        signal: controller.signal,
      }
    );

    const rawBody =
      await response.text();

    let responseData = {};

    if (rawBody) {
      try {
        responseData =
          JSON.parse(rawBody);
      } catch {
        responseData = {
          raw: rawBody,
        };
      }
    }

    if (!response.ok) {
      throw new Error(
        `Brevo Email API ${response.status}: ${rawBody}`
      );
    }

    console.log(
      '[EMAIL API] Email sent successfully:',
      responseData.messageId ||
        'No messageId returned'
    );

    return responseData;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(
        '[EMAIL API] Request timeout'
      );

      throw new Error(
        'Email API timeout'
      );
    }

    console.error(
      '[EMAIL API] SEND ERROR:',
      {
        name: error.name,
        message: error.message,
      }
    );

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// FORMAT DATE / TIME
// ============================================================

function formatEventDate(date) {
  if (!date) {
    return 'Chưa cập nhật';
  }

  return new Intl.DateTimeFormat(
    'vi-VN',
    {
      dateStyle: 'long',
    }
  ).format(
    new Date(`${date}T00:00:00`)
  );
}

function formatEventTime(time) {
  if (!time) {
    return 'Chưa cập nhật';
  }

  return String(time).slice(0, 5);
}

// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// ============================================================
// BOOKING CONFIRMATION
// ============================================================

async function sendBookingConfirmation(
  email,
  eventInfo,
  ticketInfo
) {
  if (!email) {
    throw new Error(
      'Không có email người nhận'
    );
  }

  if (!eventInfo) {
    throw new Error(
      'Không có thông tin sự kiện'
    );
  }

  if (!ticketInfo?.qrCode) {
    throw new Error(
      'Không có mã QR của vé'
    );
  }

  // Tạo QR PNG.
  const qrBuffer =
    await QRCode.toBuffer(
      ticketInfo.qrCode,
      {
        type: 'png',
        width: 320,
        margin: 2,
      }
    );

  // Brevo attachment nhận nội dung Base64.
  const qrBase64 =
    qrBuffer.toString('base64');

  const eventName =
    eventInfo.ten_su_kien ||
    'Sự kiện Campus Event Hub';

  const eventDate =
    formatEventDate(
      eventInfo.ngay_dien_ra
    );

  const startTime =
    formatEventTime(
      eventInfo.thoi_gian_bat_dau
    );

  const endTime =
    formatEventTime(
      eventInfo.thoi_gian_ket_thuc
    );

  const location =
    [
      eventInfo.dia_diem,
      eventInfo.phong,
    ]
      .filter(Boolean)
      .join(' - ') ||
    'Chưa cập nhật';

  const ticketId =
    ticketInfo.ticketId || 'N/A';

  const textContent = `
Bạn đã đăng ký sự kiện thành công.

Sự kiện: ${eventName}
Ngày: ${eventDate}
Thời gian: ${startTime} - ${endTime}
Địa điểm: ${location}

Mã vé: ${ticketId}
QR Code: ${ticketInfo.qrCode}

Ảnh QR vé được đính kèm trong email này.

Vui lòng mang theo mã QR để check-in.
  `.trim();

  const htmlContent = `
    <div
      style="
        font-family: Arial, sans-serif;
        max-width: 600px;
        margin: 0 auto;
        color: #1e293b;
      "
    >
      <h2
        style="
          color: #4f46e5;
          margin-bottom: 8px;
        "
      >
        Đăng ký sự kiện thành công
      </h2>

      <p>
        Bạn đã đăng ký thành công sự kiện:
      </p>

      <h3>
        ${escapeHtml(eventName)}
      </h3>

      <table
        style="
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        "
      >
        <tr>
          <td
            style="
              padding: 8px;
              font-weight: bold;
            "
          >
            Ngày
          </td>

          <td style="padding: 8px;">
            ${escapeHtml(eventDate)}
          </td>
        </tr>

        <tr>
          <td
            style="
              padding: 8px;
              font-weight: bold;
            "
          >
            Thời gian
          </td>

          <td style="padding: 8px;">
            ${escapeHtml(startTime)}
            -
            ${escapeHtml(endTime)}
          </td>
        </tr>

        <tr>
          <td
            style="
              padding: 8px;
              font-weight: bold;
            "
          >
            Địa điểm
          </td>

          <td style="padding: 8px;">
            ${escapeHtml(location)}
          </td>
        </tr>

        <tr>
          <td
            style="
              padding: 8px;
              font-weight: bold;
            "
          >
            Mã vé
          </td>

          <td style="padding: 8px;">
            ${escapeHtml(ticketId)}
          </td>
        </tr>
      </table>

      <div
        style="
          padding: 16px;
          background: #f8fafc;
          border-radius: 8px;
          margin-top: 20px;
        "
      >
        <p
          style="
            margin: 0 0 8px 0;
            font-weight: bold;
          "
        >
          Mã QR check-in
        </p>

        <p style="margin: 0;">
          Ảnh QR vé
          <strong>ticket-qr.png</strong>
          được đính kèm trong email này.
        </p>
      </div>

      <p
        style="
          margin-top: 24px;
          color: #64748b;
          font-size: 13px;
        "
      >
        Vui lòng không chia sẻ mã QR này
        với người khác.
      </p>

      <p
        style="
          color: #64748b;
          font-size: 13px;
        "
      >
        Campus Event Hub
      </p>
    </div>
  `;

  const info =
    await sendBrevoEmail({
      to: email,

      subject:
        `Xác nhận đăng ký - ${eventName}`,

      textContent,
      htmlContent,

      attachments: [
        {
          filename:
            'ticket-qr.png',

          content:
            qrBase64,
        },
      ],
    });

  console.log(
    'Booking confirmation email sent:',
    info.messageId ||
      'No messageId returned'
  );

  return info;
}

// ============================================================
// SEND TICKET EMAIL
// ============================================================

async function sendTicketEmail(
  userId,
  eventId,
  qrCode
) {
  const {
    data: user,
    error: userError,
  } = await supabase
    .from('tai_khoan')
    .select('email')
    .eq(
      'ma_tai_khoan',
      userId
    )
    .eq('da_xoa', false)
    .single();

  if (userError) {
    throw userError;
  }

  if (!user?.email) {
    throw new Error(
      'Tài khoản không có email'
    );
  }

  const {
    data: event,
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
      phong
    `)
    .eq(
      'ma_su_kien',
      eventId
    )
    .eq('da_xoa', false)
    .single();

  if (eventError) {
    throw eventError;
  }

  const {
    data: ticket,
    error: ticketError,
  } = await supabase
    .from('dang_ky')
    .select('ma_dang_ky')
    .eq(
      'ma_tai_khoan',
      userId
    )
    .eq(
      'ma_su_kien',
      eventId
    )
    .eq(
      'ma_qr_code',
      qrCode
    )
    .eq('da_xoa', false)
    .single();

  if (ticketError) {
    throw ticketError;
  }

  return sendBookingConfirmation(
    user.email,
    event,
    {
      ticketId:
        ticket.ma_dang_ky,

      qrCode,
    }
  );
}

// ============================================================
// EVENT REMINDER
// ============================================================

async function sendEventReminder(
  email,
  eventInfo,
  ticketInfo = {}
) {
  if (!email) {
    throw new Error(
      'Không có email người nhận'
    );
  }

  if (!eventInfo) {
    throw new Error(
      'Không có thông tin sự kiện'
    );
  }

  const eventName =
    eventInfo.ten_su_kien ||
    'Sự kiện Campus Event Hub';

  const eventDate =
    formatEventDate(
      eventInfo.ngay_dien_ra
    );

  const startTime =
    formatEventTime(
      eventInfo.thoi_gian_bat_dau
    );

  const endTime =
    formatEventTime(
      eventInfo.thoi_gian_ket_thuc
    );

  const location =
    [
      eventInfo.dia_diem,
      eventInfo.phong,
    ]
      .filter(Boolean)
      .join(' - ') ||
    'Chưa cập nhật';

  const attachments = [];

  // Reminder hiện được reminder.service truyền qrCode.
  // Nếu có thì gửi lại QR vé kèm email.
  if (ticketInfo.qrCode) {
    const qrBuffer =
      await QRCode.toBuffer(
        ticketInfo.qrCode,
        {
          type: 'png',
          width: 320,
          margin: 2,
        }
      );

    attachments.push({
      filename:
        'ticket-qr.png',

      content:
        qrBuffer.toString(
          'base64'
        ),
    });
  }

  const textContent = `
Nhắc lịch sự kiện

Sự kiện bạn đã đăng ký sẽ diễn ra vào ngày mai.

Sự kiện: ${eventName}
Ngày: ${eventDate}
Thời gian: ${startTime}${endTime !== 'Chưa cập nhật' ? ` - ${endTime}` : ''}
Địa điểm: ${location}
${ticketInfo.ticketId ? `Mã vé: ${ticketInfo.ticketId}` : ''}

${
  ticketInfo.qrCode
    ? 'Ảnh QR vé được đính kèm trong email này.'
    : ''
}

Campus Event Hub
  `.trim();

  const htmlContent = `
    <div
      style="
        font-family: Arial, sans-serif;
        max-width: 600px;
        margin: 0 auto;
        color: #1e293b;
      "
    >
      <h2
        style="
          color: #4f46e5;
        "
      >
        Nhắc lịch sự kiện
      </h2>

      <p>
        Sự kiện bạn đã đăng ký
        sẽ diễn ra vào ngày mai.
      </p>

      <h3>
        ${escapeHtml(eventName)}
      </h3>

      <p>
        <strong>Ngày:</strong>
        ${escapeHtml(eventDate)}
      </p>

      <p>
        <strong>Thời gian:</strong>
        ${escapeHtml(startTime)}
        ${
          endTime !==
          'Chưa cập nhật'
            ? ` - ${escapeHtml(
                endTime
              )}`
            : ''
        }
      </p>

      <p>
        <strong>Địa điểm:</strong>
        ${escapeHtml(location)}
      </p>

      ${
        ticketInfo.ticketId
          ? `
            <p>
              <strong>Mã vé:</strong>
              ${escapeHtml(
                ticketInfo.ticketId
              )}
            </p>
          `
          : ''
      }

      ${
        ticketInfo.qrCode
          ? `
            <div
              style="
                padding: 16px;
                background: #f8fafc;
                border-radius: 8px;
                margin-top: 20px;
              "
            >
              <strong>
                Chuẩn bị mã QR để check-in
              </strong>

              <p
                style="
                  margin-bottom: 0;
                "
              >
                Ảnh QR vé
                <strong>
                  ticket-qr.png
                </strong>
                được đính kèm trong
                email này.
              </p>
            </div>
          `
          : ''
      }

      <p
        style="
          margin-top: 24px;
          color: #64748b;
          font-size: 13px;
        "
      >
        Campus Event Hub
      </p>
    </div>
  `;

  const info =
    await sendBrevoEmail({
      to: email,

      subject:
        `Nhắc lịch sự kiện - ${eventName}`,

      textContent,
      htmlContent,
      attachments,
    });

  console.log(
    'Event reminder email sent:',
    info.messageId ||
      'No messageId returned'
  );

  return info;
}

module.exports = {
  sendBrevoEmail,
  sendBookingConfirmation,
  sendTicketEmail,
  sendEventReminder,
};
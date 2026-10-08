async function sendPasswordResetOtp(email, otp) {
  const deliveryMode = (
    process.env.OTP_DELIVERY_MODE || "console"
  )
    .trim()
    .toLowerCase();

  console.log("[OTP] Delivery mode:", deliveryMode);

  // Development / demo mode
  if (deliveryMode === "console") {
    console.log(
      `[DEV OTP] Password reset OTP for ${email}: ${otp}`
    );
    return;
  }

  if (deliveryMode !== "api") {
    throw new Error(
      `OTP_DELIVERY_MODE không hợp lệ: ${deliveryMode}`
    );
  }

  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.EMAIL_FROM;
  const senderName =
    process.env.EMAIL_FROM_NAME || "Campus Event Hub";

  if (!apiKey || !senderEmail) {
    throw new Error(
      "Thiếu BREVO_API_KEY hoặc EMAIL_FROM"
    );
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 10000);

  try {
    console.log(
      "[EMAIL API] Sending OTP to:",
      email
    );

    const response = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",

        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": apiKey,
        },

        body: JSON.stringify({
          sender: {
            name: senderName,
            email: senderEmail,
          },

          to: [
            {
              email,
            },
          ],

          subject:
            "Campus Event Hub - Mã OTP đặt lại mật khẩu",

          htmlContent: `
            <div
              style="
                font-family: Arial, sans-serif;
                max-width: 520px;
                margin: 0 auto;
              "
            >
              <h2 style="color: #4f46e5;">
                Campus Event Hub
              </h2>

              <p>
                Mã OTP đặt lại mật khẩu của bạn là:
              </p>

              <div
                style="
                  font-size: 32px;
                  font-weight: bold;
                  letter-spacing: 8px;
                  margin: 24px 0;
                "
              >
                ${otp}
              </div>

              <p>
                Mã có hiệu lực trong 10 phút.
              </p>

              <p>
                Nếu bạn không yêu cầu đặt lại mật khẩu,
                hãy bỏ qua email này.
              </p>
            </div>
          `,
        }),

        signal: controller.signal,
      }
    );

    const body = await response.text();

    if (!response.ok) {
      throw new Error(
        `Email API ${response.status}: ${body}`
      );
    }

    console.log(
      "[EMAIL API] OTP sent successfully"
    );
  } catch (error) {
    console.error("[EMAIL API] SEND ERROR:", {
      name: error.name,
      message: error.message,
    });

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  sendPasswordResetOtp,
};
/**
 * API tests cho Forgot Password / OTP endpoints.
 *
 * Scope:
 * - Express route
 * - Zod validation
 * - Controller
 * - HTTP contract
 *
 * Không test business logic bên trong otp.service
 * vì phần đó đã được test trong otp.service.test.js.
 *
 * Rate limiter được mock pass-through để các test
 * API không phụ thuộc state IP giữa nhiều test case.
 */

// =====================================================
// MOCK SUPABASE
// app.js import supabase trực tiếp.
// =====================================================

jest.mock(
  "../../src/config/supabase.js",
  () => ({
    from: jest.fn(),
  })
);

// =====================================================
// MOCK OTP SERVICE
// =====================================================

jest.mock(
  "../../src/services/otp.service.js",
  () => ({
    requestPasswordResetOtp:
      jest.fn(),

    verifyPasswordResetOtp:
      jest.fn(),

    resetPassword:
      jest.fn(),
  })
);

// =====================================================
// MOCK RATE LIMITERS
// =====================================================

jest.mock(
  "../../src/middlewares/rateLimit.middleware.js",
  () => {
    const passThrough = (
      req,
      res,
      next
    ) => next();

    return {
      loginLimiter:
        passThrough,

      otpLimiter:
        passThrough,

      verifyOtpLimiter:
        passThrough,

      resetPasswordLimiter:
        passThrough,
    };
  }
);

// =====================================================
// IMPORTS AFTER MOCKS
// =====================================================

const request = require("supertest");

const app = require(
  "../../src/app.js"
);

const otpService = require(
  "../../src/services/otp.service.js"
);

// =====================================================
// CONSTANTS
// =====================================================

const EMAIL =
  "student@test.com";

const OTP = "123456";

const RESET_TOKEN =
  "reset-token-test";

const NEW_PASSWORD =
  "NewPassword123";

// =====================================================
// ERROR HELPER
// =====================================================

function serviceError(
  message,
  statusCode,
  code
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  error.code =
    code;

  return error;
}

// =====================================================
// SETUP
// =====================================================

let consoleErrorSpy;

beforeAll(() => {
  /**
   * Controller có console.error()
   * cho các error case.
   *
   * Tắt output để test log sạch.
   */
  consoleErrorSpy =
    jest
      .spyOn(
        console,
        "error"
      )
      .mockImplementation(
        () => {}
      );
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();

  otpService
    .requestPasswordResetOtp
    .mockResolvedValue(
      undefined
    );

  otpService
    .verifyPasswordResetOtp
    .mockResolvedValue({
      resetToken:
        RESET_TOKEN,
    });

  otpService
    .resetPassword
    .mockResolvedValue(
      undefined
    );
});

// =====================================================
// REQUEST OTP
// =====================================================

describe(
  "POST /api/auth/forgot-password/request-otp",
  () => {
    test(
      "OTP-A01 - email hợp lệ -> 200",
      async () => {
        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/request-otp"
            )
            .send({
              email:
                "STUDENT@TEST.COM",
            });

        expect(
          response.status
        ).toBe(200);

        expect(
          response.body.success
        ).toBe(true);

        expect(
          response.body.message
        ).toContain(
          "Nếu email tồn tại"
        );

        /**
         * Zod schema có:
         * trim().toLowerCase()
         */
        expect(
          otpService
            .requestPasswordResetOtp
        ).toHaveBeenCalledWith({
          email: EMAIL,
        });
      }
    );

    test(
      "OTP-A02 - email không hợp lệ -> 400",
      async () => {
        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/request-otp"
            )
            .send({
              email:
                "not-an-email",
            });

        expect(
          response.status
        ).toBe(400);

        expect(
          response.body.success
        ).toBe(false);

        expect(
          response.body.message
        ).toBe(
          "Dữ liệu không hợp lệ"
        );

        expect(
          otpService
            .requestPasswordResetOtp
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "OTP-A03 - thiếu email -> 400",
      async () => {
        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/request-otp"
            )
            .send({});

        expect(
          response.status
        ).toBe(400);

        expect(
          otpService
            .requestPasswordResetOtp
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "OTP-A04 - request chứa field dư -> 400 do schema strict",
      async () => {
        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/request-otp"
            )
            .send({
              email: EMAIL,
              role: "ToChuc",
            });

        expect(
          response.status
        ).toBe(400);

        expect(
          otpService
            .requestPasswordResetOtp
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "OTP-A05 - service lỗi -> controller trả đúng status và error.code",
      async () => {
        otpService
          .requestPasswordResetOtp
          .mockRejectedValue(
            serviceError(
              "Không thể gửi mã OTP",
              500,
              "OTP_SEND_ERROR"
            )
          );

        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/request-otp"
            )
            .send({
              email: EMAIL,
            });

        expect(
          response.status
        ).toBe(500);

        expect(
          response.body.success
        ).toBe(false);

        expect(
          response.body.error
        ).toEqual({
          code:
            "OTP_SEND_ERROR",
        });
      }
    );

    test(
      "OTP-A06 - account không tồn tại vẫn trả generic 200",
      async () => {
        /**
         * Service cố ý resolve undefined
         * khi account không tồn tại.
         */
        otpService
          .requestPasswordResetOtp
          .mockResolvedValue(
            undefined
          );

        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/request-otp"
            )
            .send({
              email:
                "unknown@test.com",
            });

        expect(
          response.status
        ).toBe(200);

        expect(
          response.body.message
        ).toBe(
          "Nếu email tồn tại trong hệ thống, mã OTP đã được gửi"
        );
      }
    );
  }
);

// =====================================================
// VERIFY OTP
// =====================================================

describe(
  "POST /api/auth/forgot-password/verify-otp",
  () => {
    test(
      "OTP-A07 - OTP hợp lệ -> 200 + resetToken",
      async () => {
        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/verify-otp"
            )
            .send({
              email: EMAIL,
              otp: OTP,
            });

        expect(
          response.status
        ).toBe(200);

        expect(
          response.body.success
        ).toBe(true);

        expect(
          response.body.data
        ).toEqual({
          resetToken:
            RESET_TOKEN,
        });

        expect(
          otpService
            .verifyPasswordResetOtp
        ).toHaveBeenCalledWith({
          email: EMAIL,
          otp: OTP,
        });
      }
    );

    test(
      "OTP-A08 - OTP không đủ 6 chữ số -> 400",
      async () => {
        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/verify-otp"
            )
            .send({
              email: EMAIL,
              otp: "12345",
            });

        expect(
          response.status
        ).toBe(400);

        expect(
          otpService
            .verifyPasswordResetOtp
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "OTP-A09 - OTP chứa chữ -> 400",
      async () => {
        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/verify-otp"
            )
            .send({
              email: EMAIL,
              otp: "12AB56",
            });

        expect(
          response.status
        ).toBe(400);

        expect(
          otpService
            .verifyPasswordResetOtp
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "OTP-A10 - OTP sai -> 400 INVALID_OTP",
      async () => {
        otpService
          .verifyPasswordResetOtp
          .mockRejectedValue(
            serviceError(
              "OTP không chính xác",
              400,
              "INVALID_OTP"
            )
          );

        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/verify-otp"
            )
            .send({
              email: EMAIL,
              otp: "999999",
            });

        expect(
          response.status
        ).toBe(400);

        expect(
          response.body.error
        ).toEqual({
          code: "INVALID_OTP",
        });
      }
    );

    test(
      "OTP-A11 - OTP hết hạn -> 400 OTP_EXPIRED",
      async () => {
        otpService
          .verifyPasswordResetOtp
          .mockRejectedValue(
            serviceError(
              "OTP đã hết hạn",
              400,
              "OTP_EXPIRED"
            )
          );

        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/verify-otp"
            )
            .send({
              email: EMAIL,
              otp: OTP,
            });

        expect(
          response.status
        ).toBe(400);

        expect(
          response.body.error
        ).toEqual({
          code:
            "OTP_EXPIRED",
        });
      }
    );
  }
);

// =====================================================
// RESET PASSWORD
// =====================================================

describe(
  "POST /api/auth/forgot-password/reset",
  () => {
    test(
      "OTP-A12 - reset hợp lệ -> 200",
      async () => {
        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/reset"
            )
            .send({
              resetToken:
                RESET_TOKEN,

              newPassword:
                NEW_PASSWORD,
            });

        expect(
          response.status
        ).toBe(200);

        expect(
          response.body.success
        ).toBe(true);

        expect(
          response.body.message
        ).toContain(
          "Đặt lại mật khẩu thành công"
        );

        expect(
          otpService.resetPassword
        ).toHaveBeenCalledWith({
          resetToken:
            RESET_TOKEN,

          newPassword:
            NEW_PASSWORD,
        });
      }
    );

    test(
      "OTP-A13 - password dưới 8 ký tự -> 400",
      async () => {
        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/reset"
            )
            .send({
              resetToken:
                RESET_TOKEN,

              newPassword:
                "1234567",
            });

        expect(
          response.status
        ).toBe(400);

        expect(
          otpService.resetPassword
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "OTP-A14 - thiếu resetToken -> 400",
      async () => {
        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/reset"
            )
            .send({
              newPassword:
                NEW_PASSWORD,
            });

        expect(
          response.status
        ).toBe(400);

        expect(
          otpService.resetPassword
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "OTP-A15 - reset token hết hạn -> 401 RESET_TOKEN_EXPIRED",
      async () => {
        otpService
          .resetPassword
          .mockRejectedValue(
            serviceError(
              "Reset token đã hết hạn",
              401,
              "RESET_TOKEN_EXPIRED"
            )
          );

        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/reset"
            )
            .send({
              resetToken:
                RESET_TOKEN,

              newPassword:
                NEW_PASSWORD,
            });

        expect(
          response.status
        ).toBe(401);

        expect(
          response.body.error
        ).toEqual({
          code:
            "RESET_TOKEN_EXPIRED",
        });
      }
    );

    test(
      "OTP-A16 - reset token không hợp lệ -> 401 INVALID_RESET_TOKEN",
      async () => {
        otpService
          .resetPassword
          .mockRejectedValue(
            serviceError(
              "Reset token không hợp lệ",
              401,
              "INVALID_RESET_TOKEN"
            )
          );

        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/reset"
            )
            .send({
              resetToken:
                "bad-token",

              newPassword:
                NEW_PASSWORD,
            });

        expect(
          response.status
        ).toBe(401);

        expect(
          response.body.error
        ).toEqual({
          code:
            "INVALID_RESET_TOKEN",
        });
      }
    );

    test(
      "OTP-A17 - reuse OTP/reset token -> 401 OTP_ALREADY_USED",
      async () => {
        otpService
          .resetPassword
          .mockRejectedValue(
            serviceError(
              "OTP đã được sử dụng",
              401,
              "OTP_ALREADY_USED"
            )
          );

        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/reset"
            )
            .send({
              resetToken:
                RESET_TOKEN,

              newPassword:
                NEW_PASSWORD,
            });

        expect(
          response.status
        ).toBe(401);

        expect(
          response.body.error
        ).toEqual({
          code:
            "OTP_ALREADY_USED",
        });
      }
    );

    test(
      "OTP-A18 - DB update password lỗi -> 500 PASSWORD_UPDATE_ERROR",
      async () => {
        otpService
          .resetPassword
          .mockRejectedValue(
            serviceError(
              "Không thể cập nhật mật khẩu",
              500,
              "PASSWORD_UPDATE_ERROR"
            )
          );

        const response =
          await request(app)
            .post(
              "/api/auth/forgot-password/reset"
            )
            .send({
              resetToken:
                RESET_TOKEN,

              newPassword:
                NEW_PASSWORD,
            });

        expect(
          response.status
        ).toBe(500);

        expect(
          response.body.success
        ).toBe(false);

        expect(
          response.body.error
        ).toEqual({
          code:
            "PASSWORD_UPDATE_ERROR",
        });
      }
    );
  }
);
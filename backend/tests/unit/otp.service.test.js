/**
 * Unit tests cho otp.service.js
 *
 * Mục tiêu:
 * - Test business logic OTP mà không dùng Supabase thật.
 * - Không gửi SMTP thật.
 * - Không tạo JWT thật.
 * - Kiểm tra hashing OTP/password.
 * - Kiểm tra expiry, replay, conditional consume.
 * - Có regression test tái hiện lỗi atomicity hiện tại.
 *
 * Baseline:
 * feature/auth-forgot-password-otp
 * commit 4700ab1
 */

// =====================================================
// MOCK DEPENDENCIES
// =====================================================

jest.mock("../../src/config/supabase.js", () => ({
  from: jest.fn(),
  rpc: jest.fn(),
}));

jest.mock("argon2", () => ({
  hash: jest.fn(),
  verify: jest.fn(),
}));

jest.mock("../../src/utils/otp.js", () => ({
  generateOtp: jest.fn(),
}));

jest.mock("../../src/utils/jwt.js", () => ({
  generatePasswordResetToken: jest.fn(),
  verifyPasswordResetToken: jest.fn(),
}));

jest.mock("../../src/services/email.service.js", () => ({
  sendPasswordResetOtp: jest.fn(),
}));

// =====================================================
// IMPORTS AFTER MOCKS
// =====================================================

const supabase = require("../../src/config/supabase.js");
const argon2 = require("argon2");

const {
  generateOtp,
} = require("../../src/utils/otp.js");

const {
  generatePasswordResetToken,
  verifyPasswordResetToken,
} = require("../../src/utils/jwt.js");

const {
  sendPasswordResetOtp,
} = require("../../src/services/email.service.js");

const {
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPassword,
} = require("../../src/services/otp.service.js");

// =====================================================
// CONSTANTS / FIXTURES
// =====================================================

const USER_ID = 1;
const OTP_ID = 77;

const EMAIL = "student@test.com";
const OTP = "123456";

const OTP_HASH = "$argon2id$otp-test-hash";
const PASSWORD_HASH =
  "$argon2id$password-test-hash";

const RESET_TOKEN = "reset-token-test";

const ACTIVE_USER = {
  ma_tai_khoan: USER_ID,
  email: EMAIL,
  trang_thai_tai_khoan: "HoatDong",
  da_xoa: false,
};

function futureIso(minutes = 10) {
  return new Date(
    Date.now() + minutes * 60 * 1000
  ).toISOString();
}

function pastIso(minutes = 1) {
  return new Date(
    Date.now() - minutes * 60 * 1000
  ).toISOString();
}

function makeOtpRecord(overrides = {}) {
  return {
    ma_otp: OTP_ID,
    email: EMAIL,
    ma_code: OTP_HASH,
    thoi_gian_het_han: futureIso(),
    da_su_dung: false,
    thoi_gian_tao:
      new Date().toISOString(),
    ...overrides,
  };
}

// =====================================================
// GENERIC SUPABASE MOCK CHAIN
// =====================================================

/**
 * Tạo Supabase query chain.
 *
 * Hỗ trợ:
 * - await query trực tiếp
 * - maybeSingle()
 * - single()
 * - limit()
 *
 * Ví dụ:
 * supabase
 *   .from(...)
 *   .update(...)
 *   .eq(...)
 *
 * hoặc:
 *
 * supabase
 *   .from(...)
 *   .select(...)
 *   .eq(...)
 *   .maybeSingle()
 */
function makeChain({
  data = null,
  error = null,
  count = null,
} = {}) {
  const resolved = {
    data,
    error,
    count,
  };

  const chain = {
    select: jest.fn(),
    eq: jest.fn(),
    neq: jest.fn(),
    or: jest.fn(),
    order: jest.fn(),

    update: jest.fn(),
    insert: jest.fn(),

    maybeSingle: jest.fn(),
    single: jest.fn(),
    limit: jest.fn(),
  };

  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.neq.mockReturnValue(chain);
  chain.or.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);

  chain.update.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);

  chain.maybeSingle.mockResolvedValue(
    resolved
  );

  chain.single.mockResolvedValue(
    resolved
  );

  chain.limit.mockResolvedValue(
    resolved
  );

  /**
   * Làm chain trở thành thenable.
   *
   * Nhờ vậy đoạn:
   *
   * await supabase
   *   .from(...)
   *   .update(...)
   *   .eq(...)
   *
   * vẫn hoạt động đúng trong mock.
   */
  chain.then = (
    onFulfilled,
    onRejected
  ) =>
    Promise.resolve(resolved).then(
      onFulfilled,
      onRejected
    );

  return chain;
}

/**
 * Thiết lập Supabase trả các chain theo thứ tự
 * gọi supabase.from().
 */
function queueDb(...responses) {
  const chains =
    responses.map((response) =>
      makeChain(response)
    );

  supabase.from.mockReset();

  for (const chain of chains) {
    supabase.from.mockReturnValueOnce(
      chain
    );
  }

  return chains;
}

// =====================================================
// COMMON SETUP
// =====================================================

beforeEach(() => {
  jest.clearAllMocks();

  process.env.OTP_EXPIRES_MINUTES =
    "10";

  generateOtp.mockReturnValue(OTP);

  argon2.hash.mockImplementation(
    async (value) => {
      if (value === OTP) {
        return OTP_HASH;
      }

      return PASSWORD_HASH;
    }
  );

  argon2.verify.mockResolvedValue(
    true
  );

  generatePasswordResetToken.mockReturnValue(
    RESET_TOKEN
  );

  verifyPasswordResetToken.mockReturnValue(
    {
      sub: String(USER_ID),
      type: "password_reset",
      otpId: OTP_ID,
    }
  );

  sendPasswordResetOtp.mockResolvedValue(
    undefined
  );

  supabase.rpc.mockReset();
});

// =====================================================
// REQUEST OTP
// =====================================================

describe(
  "otp.service - requestPasswordResetOtp",
  () => {
    test(
      "OTP-U01 - account hợp lệ -> hash OTP, lưu DB và gửi OTP",
      async () => {
        const [
          accountChain,
          invalidateChain,
          insertChain,
        ] = queueDb(
          {
            data: ACTIVE_USER,
            error: null,
          },

          {
            data: null,
            error: null,
          },

          {
            data: {
              ma_otp: OTP_ID,
            },
            error: null,
          }
        );

        await requestPasswordResetOtp({
          email:
            "  STUDENT@TEST.COM  ",
        });

        expect(
          supabase.from
        ).toHaveBeenNthCalledWith(
          1,
          "tai_khoan"
        );

        expect(
          accountChain.eq
        ).toHaveBeenCalledWith(
          "email",
          EMAIL
        );

        expect(
          invalidateChain.update
        ).toHaveBeenCalledWith({
          da_su_dung: true,
        });

        expect(
          generateOtp
        ).toHaveBeenCalledTimes(1);

        expect(
          argon2.hash
        ).toHaveBeenCalledWith(OTP);

        expect(
          insertChain.insert
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            email: EMAIL,
            ma_code: OTP_HASH,
            da_su_dung: false,
            thoi_gian_het_han:
              expect.any(String),
          })
        );

        expect(
          sendPasswordResetOtp
        ).toHaveBeenCalledWith(
          EMAIL,
          OTP
        );
      }
    );

    test(
      "OTP-U02 - email không tồn tại -> không tiết lộ và không tạo OTP",
      async () => {
        queueDb({
          data: null,
          error: null,
        });

        const result =
          await requestPasswordResetOtp(
            {
              email: EMAIL,
            }
          );

        expect(result).toBeUndefined();

        expect(
          generateOtp
        ).not.toHaveBeenCalled();

        expect(
          argon2.hash
        ).not.toHaveBeenCalled();

        expect(
          sendPasswordResetOtp
        ).not.toHaveBeenCalled();

        expect(
          supabase.from
        ).toHaveBeenCalledTimes(1);
      }
    );

    test(
      "OTP-U03 - account bị khóa -> không tạo OTP",
      async () => {
        queueDb({
          data: {
            ...ACTIVE_USER,

            trang_thai_tai_khoan:
              "Khoa",
          },

          error: null,
        });

        await requestPasswordResetOtp({
          email: EMAIL,
        });

        expect(
          generateOtp
        ).not.toHaveBeenCalled();

        expect(
          sendPasswordResetOtp
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "OTP-U04 - lỗi lookup account -> ACCOUNT_LOOKUP_ERROR",
      async () => {
        queueDb({
          data: null,

          error: {
            message:
              "database unavailable",
          },
        });

        await expect(
          requestPasswordResetOtp({
            email: EMAIL,
          })
        ).rejects.toMatchObject({
          statusCode: 500,
          code: "ACCOUNT_LOOKUP_ERROR",
        });
      }
    );

    test(
      "OTP-U05 - SMTP lỗi -> OTP vừa tạo phải bị vô hiệu",
      async () => {
        const [
          ,
          ,
          ,
          cleanupChain,
        ] = queueDb(
          {
            data: ACTIVE_USER,
            error: null,
          },

          {
            data: null,
            error: null,
          },

          {
            data: {
              ma_otp: OTP_ID,
            },
            error: null,
          },

          {
            data: null,
            error: null,
          }
        );

        sendPasswordResetOtp.mockRejectedValue(
          new Error("SMTP down")
        );

        await expect(
          requestPasswordResetOtp({
            email: EMAIL,
          })
        ).rejects.toMatchObject({
          statusCode: 500,
          code: "OTP_SEND_ERROR",
        });

        expect(
          cleanupChain.update
        ).toHaveBeenCalledWith({
          da_su_dung: true,
        });

        expect(
          cleanupChain.eq
        ).toHaveBeenCalledWith(
          "ma_otp",
          OTP_ID
        );
      }
    );
  }
);

// =====================================================
// VERIFY OTP
// =====================================================

describe(
  "otp.service - verifyPasswordResetOtp",
  () => {
    test(
      "OTP-U06 - OTP đúng -> trả resetToken",
      async () => {
        queueDb(
          {
            data: ACTIVE_USER,
            error: null,
          },

          {
            data: [
              makeOtpRecord(),
            ],
            error: null,
          }
        );

        const result =
          await verifyPasswordResetOtp(
            {
              email: EMAIL,
              otp: OTP,
            }
          );

        expect(
          argon2.verify
        ).toHaveBeenCalledWith(
          OTP_HASH,
          OTP
        );

        expect(
          generatePasswordResetToken
        ).toHaveBeenCalledWith(
          USER_ID,
          OTP_ID
        );

        expect(result).toEqual({
          resetToken: RESET_TOKEN,
        });
      }
    );

    test(
      "OTP-U07 - OTP sai -> INVALID_OTP",
      async () => {
        queueDb(
          {
            data: ACTIVE_USER,
            error: null,
          },

          {
            data: [
              makeOtpRecord(),
            ],
            error: null,
          }
        );

        argon2.verify.mockResolvedValue(
          false
        );

        await expect(
          verifyPasswordResetOtp({
            email: EMAIL,
            otp: "999999",
          })
        ).rejects.toMatchObject({
          statusCode: 400,
          code: "INVALID_OTP",
        });

        expect(
          generatePasswordResetToken
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "OTP-U08 - OTP không tồn tại -> INVALID_OTP",
      async () => {
        queueDb(
          {
            data: ACTIVE_USER,
            error: null,
          },

          {
            data: [],
            error: null,
          }
        );

        await expect(
          verifyPasswordResetOtp({
            email: EMAIL,
            otp: OTP,
          })
        ).rejects.toMatchObject({
          statusCode: 400,
          code: "INVALID_OTP",
        });
      }
    );

    test(
      "OTP-U09 - OTP hết hạn -> OTP_EXPIRED và đánh dấu đã dùng",
      async () => {
        const [
          ,
          ,
          expireChain,
        ] = queueDb(
          {
            data: ACTIVE_USER,
            error: null,
          },

          {
            data: [
              makeOtpRecord({
                thoi_gian_het_han:
                  pastIso(),
              }),
            ],

            error: null,
          },

          {
            data: null,
            error: null,
          }
        );

        await expect(
          verifyPasswordResetOtp({
            email: EMAIL,
            otp: OTP,
          })
        ).rejects.toMatchObject({
          statusCode: 400,
          code: "OTP_EXPIRED",
        });

        expect(
          expireChain.update
        ).toHaveBeenCalledWith({
          da_su_dung: true,
        });

        expect(
          expireChain.eq
        ).toHaveBeenCalledWith(
          "ma_otp",
          OTP_ID
        );
      }
    );
  }
);

// =====================================================
// RESET PASSWORD
// =====================================================

describe(
  "otp.service - resetPassword",
  () => {
    test(
      "OTP-U10 - resetToken không hợp lệ -> INVALID_RESET_TOKEN",
      async () => {
        const error =
          new Error(
            "invalid signature"
          );

        error.name =
          "JsonWebTokenError";

        verifyPasswordResetToken.mockImplementation(
          () => {
            throw error;
          }
        );

        await expect(
          resetPassword({
            resetToken:
              "invalid-token",

            newPassword:
              "NewPassword123",
          })
        ).rejects.toMatchObject({
          statusCode: 401,
          code: "INVALID_RESET_TOKEN",
        });

        expect(
          supabase.from
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "OTP-U11 - resetToken hết hạn -> RESET_TOKEN_EXPIRED",
      async () => {
        const error =
          new Error("jwt expired");

        error.name =
          "TokenExpiredError";

        verifyPasswordResetToken.mockImplementation(
          () => {
            throw error;
          }
        );

        await expect(
          resetPassword({
            resetToken:
              RESET_TOKEN,

            newPassword:
              "NewPassword123",
          })
        ).rejects.toMatchObject({
          statusCode: 401,

          code:
            "RESET_TOKEN_EXPIRED",
        });
      }
    );

    test(
      "OTP-U12 - OTP đã được sử dụng -> OTP_ALREADY_USED",
      async () => {
        queueDb(
          {
            data: ACTIVE_USER,
            error: null,
          },

          {
            data: null,
            error: null,
          }
        );

        await expect(
          resetPassword({
            resetToken:
              RESET_TOKEN,

            newPassword:
              "NewPassword123",
          })
        ).rejects.toMatchObject({
          statusCode: 401,
          code: "OTP_ALREADY_USED",
        });

        expect(
          argon2.hash
        ).not.toHaveBeenCalled();
      }
    );

    test(
      "OTP-U13 - reset password thành công -> consume OTP và update password hash",
      async () => {
        const [
          ,
          ,
          consumeChain,
          passwordChain,
          invalidateRemainingChain,
        ] = queueDb(
          {
            data: ACTIVE_USER,
            error: null,
          },

          {
            data: makeOtpRecord(),
            error: null,
          },

          {
            data: {
              ma_otp: OTP_ID,
            },
            error: null,
          },

          {
            data: null,
            error: null,
          },

          {
            data: null,
            error: null,
          }
        );

        await expect(
          resetPassword({
            resetToken:
              RESET_TOKEN,

            newPassword:
              "NewPassword123",
          })
        ).resolves.toBeUndefined();

        expect(
          argon2.hash
        ).toHaveBeenCalledWith(
          "NewPassword123"
        );

        expect(
          consumeChain.update
        ).toHaveBeenCalledWith({
          da_su_dung: true,
        });

        expect(
          consumeChain.eq
        ).toHaveBeenCalledWith(
          "da_su_dung",
          false
        );

        expect(
          passwordChain.update
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            mat_khau:
              PASSWORD_HASH,

            thoi_gian_cap_nhat:
              expect.any(String),
          })
        );

        expect(
          invalidateRemainingChain.update
        ).toHaveBeenCalledWith({
          da_su_dung: true,
        });
      }
    );

    test(
      "OTP-U14 - consume OTP phải có điều kiện da_su_dung=false để chống replay",
      async () => {
        const [
          ,
          ,
          consumeChain,
        ] = queueDb(
          {
            data: ACTIVE_USER,
            error: null,
          },

          {
            data: makeOtpRecord(),
            error: null,
          },

          {
            data: null,
            error: null,
          }
        );

        await expect(
          resetPassword({
            resetToken:
              RESET_TOKEN,

            newPassword:
              "NewPassword123",
          })
        ).rejects.toMatchObject({
          code: "OTP_ALREADY_USED",
        });

        expect(
          consumeChain.eq
        ).toHaveBeenCalledWith(
          "da_su_dung",
          false
        );
      }
    );

    test(
      "OTP-U15 - OTP hết hạn khi reset -> OTP_EXPIRED",
      async () => {
        const [
          ,
          ,
          expireChain,
        ] = queueDb(
          {
            data: ACTIVE_USER,
            error: null,
          },

          {
            data: makeOtpRecord({
              thoi_gian_het_han:
                pastIso(),
            }),

            error: null,
          },

          {
            data: null,
            error: null,
          }
        );

        await expect(
          resetPassword({
            resetToken:
              RESET_TOKEN,

            newPassword:
              "NewPassword123",
          })
        ).rejects.toMatchObject({
          statusCode: 401,
          code: "OTP_EXPIRED",
        });

        expect(
          expireChain.update
        ).toHaveBeenCalledWith({
          da_su_dung: true,
        });
      }
    );

    /**
     * =====================================================
     * REGRESSION TEST QUAN TRỌNG
     * =====================================================
     *
     * Baseline 4700ab1 hiện:
     *
     * 1. consume OTP
     * 2. update password
     *
     * Nếu bước 2 lỗi:
     *
     * OTP = đã dùng
     * password = chưa đổi
     *
     * Test này CỐ Ý FAIL trên baseline.
     *
     * Agent A và Agent B phải làm test này PASS.
     */
    test(
      "OTP-U16 REGRESSION - password update lỗi thì OTP không được bị consume vĩnh viễn",
      async () => {
        const state = {
          otpUsed: false,
        };

        /**
         * Supabase mock có state thật để mô phỏng
         * side effect của database.
         */
        supabase.from.mockReset();

        supabase.from.mockImplementation(
          (table) => {
            let updatePayload = null;

            const chain = {};

            chain.select =
              jest.fn(() => chain);

            chain.eq =
              jest.fn(() => chain);

            chain.order =
              jest.fn(() => chain);

            chain.update =
              jest.fn((payload) => {
                updatePayload =
                  payload;

                return chain;
              });

            const resolveQuery =
              () => {
                // -----------------------
                // ACCOUNT
                // -----------------------
                if (
                  table ===
                  "tai_khoan"
                ) {
                  if (
                    updatePayload &&
                    Object.prototype.hasOwnProperty.call(
                      updatePayload,
                      "mat_khau"
                    )
                  ) {
                    // Giả lập DB update
                    // password thất bại
                    return {
                      data: null,

                      error: {
                        message:
                          "forced password update failure",
                      },
                    };
                  }

                  return {
                    data:
                      ACTIVE_USER,

                    error: null,
                  };
                }

                // -----------------------
                // OTP
                // -----------------------
                if (
                  table ===
                  "otp_quen_mat_khau"
                ) {
                  if (
                    updatePayload &&
                    Object.prototype.hasOwnProperty.call(
                      updatePayload,
                      "da_su_dung"
                    )
                  ) {
                    state.otpUsed =
                      updatePayload.da_su_dung;

                    return {
                      data:
                        updatePayload.da_su_dung
                          ? {
                              ma_otp:
                                OTP_ID,
                            }
                          : null,

                      error: null,
                    };
                  }

                  if (
                    state.otpUsed
                  ) {
                    return {
                      data: null,
                      error: null,
                    };
                  }

                  return {
                    data:
                      makeOtpRecord(),

                    error: null,
                  };
                }

                return {
                  data: null,
                  error: null,
                };
              };

            chain.maybeSingle =
              jest.fn(async () =>
                resolveQuery()
              );

            chain.single =
              jest.fn(async () =>
                resolveQuery()
              );

            chain.then = (
              onFulfilled,
              onRejected
            ) =>
              Promise.resolve(
                resolveQuery()
              ).then(
                onFulfilled,
                onRejected
              );

            return chain;
          }
        );

        /**
         * Nếu Agent dùng RPC/transaction
         * thay cho nhiều UPDATE riêng lẻ,
         * giả lập transaction thất bại.
         */
        supabase.rpc.mockResolvedValue({
          data: null,

          error: {
            message:
              "forced password update failure",
          },
        });

        await expect(
          resetPassword({
            resetToken:
              RESET_TOKEN,

            newPassword:
              "NewPassword123",
          })
        ).rejects.toBeDefined();

        /**
         * Invariant cần đảm bảo:
         *
         * Password update thất bại
         * => OTP vẫn phải dùng lại được.
         */
        expect(
          state.otpUsed
        ).toBe(false);
      }
    );
  }
);
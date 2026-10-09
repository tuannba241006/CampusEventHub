const argon2 = require("argon2");
const supabase = require("../config/supabase");
const { generateAccessToken } = require("../utils/jwt");

async function registerUser(userData) {
  const {
    ho_ten,
    mssv,
    email,
    sdt,
    khoa,
    mat_khau,
  } = userData;

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedMssv = mssv.trim();

  // 1. Kiểm tra email đã tồn tại chưa
  const { data: existingEmail, error: emailCheckError } =
    await supabase
      .from("tai_khoan")
      .select("ma_tai_khoan")
      .eq("email", normalizedEmail)
      .maybeSingle();

  if (emailCheckError) {
    throw new Error(
      `Không thể kiểm tra email: ${emailCheckError.message}`
    );
  }

  if (existingEmail) {
    const error = new Error("Email đã được sử dụng");
    error.statusCode = 409;
    error.code = "EMAIL_ALREADY_EXISTS";
    throw error;
  }

  // 2. Kiểm tra MSSV đã tồn tại chưa
  const { data: existingMssv, error: mssvCheckError } =
    await supabase
      .from("tai_khoan")
      .select("ma_tai_khoan")
      .eq("mssv", normalizedMssv)
      .maybeSingle();

  if (mssvCheckError) {
    throw new Error(
      `Không thể kiểm tra MSSV: ${mssvCheckError.message}`
    );
  }

  if (existingMssv) {
    const error = new Error("MSSV đã được sử dụng");
    error.statusCode = 409;
    error.code = "MSSV_ALREADY_EXISTS";
    throw error;
  }

  // 3. Hash mật khẩu
  const passwordHash = await argon2.hash(mat_khau);

  // 4. Thêm tài khoản mới
  const { data, error } = await supabase
    .from("tai_khoan")
    .insert({
      mssv: normalizedMssv,
      email: normalizedEmail,
      ho_ten,
      sdt: sdt || null,
      khoa: khoa || null,
      mat_khau: passwordHash,

      // User tự đăng ký chỉ được là SinhVien
      loai_tai_khoan: "SinhVien",
    })
    .select(`
      ma_tai_khoan,
      mssv,
      email,
      ho_ten,
      sdt,
      khoa,
      avatar_url,
      loai_tai_khoan,
      trang_thai_tai_khoan,
      thoi_gian_tao
    `)
    .single();

  if (error) {
    // PostgreSQL unique violation
    if (error.code === "23505") {
      const duplicateError = new Error(
        "Email hoặc MSSV đã tồn tại"
      );

      duplicateError.statusCode = 409;
      duplicateError.code = "DUPLICATE_ACCOUNT";

      throw duplicateError;
    }

    throw new Error(
      `Không thể tạo tài khoản: ${error.message}`
    );
  }

  return data;
}

// ========================================
// LOGIN
// ========================================

async function loginUser(loginData) {
  const { identifier, mat_khau } = loginData;

  const normalizedIdentifier = identifier.trim();

  // 1. Tạo query lấy tài khoản
  let query = supabase
    .from("tai_khoan")
    .select(`
      ma_tai_khoan,
      mssv,
      email,
      ho_ten,
      sdt,
      khoa,
      avatar_url,
      loai_tai_khoan,
      mat_khau,
      trang_thai_tai_khoan,
      da_xoa
    `);

  // 2. Xác định đăng nhập bằng Email hay MSSV
  if (normalizedIdentifier.includes("@")) {
    query = query.eq(
      "email",
      normalizedIdentifier.toLowerCase()
    );
  } else {
    query = query.eq(
      "mssv",
      normalizedIdentifier
    );
  }

  const { data: user, error } = await query.maybeSingle();

  // 3. Lỗi database
  if (error) {
    throw new Error(
      `Không thể truy vấn tài khoản: ${error.message}`
    );
  }

  // 4. Không tìm thấy tài khoản
  if (!user) {
    const error = new Error(
      "Email/MSSV hoặc mật khẩu không chính xác"
    );

    error.statusCode = 401;
    error.code = "INVALID_CREDENTIALS";

    throw error;
  }

  // 5. Tài khoản đã bị xóa
  if (user.da_xoa === true) {
    const error = new Error(
      "Email/MSSV hoặc mật khẩu không chính xác"
    );

    error.statusCode = 401;
    error.code = "INVALID_CREDENTIALS";

    throw error;
  }

  // 6. Tài khoản bị khóa
  if (user.trang_thai_tai_khoan === "Khoa") {
    const error = new Error(
      "Tài khoản đã bị khóa"
    );

    error.statusCode = 403;
    error.code = "ACCOUNT_LOCKED";

    throw error;
  }

  // 7. Kiểm tra mật khẩu
  let validPassword = false;

  try {
    validPassword = await argon2.verify(
      user.mat_khau,
      mat_khau
    );
  } catch (error) {
    console.error("Argon2 verify error:", error);

    const verifyError = new Error(
      "Không thể xác thực mật khẩu"
    );

    verifyError.statusCode = 500;
    verifyError.code = "PASSWORD_VERIFY_ERROR";

    throw verifyError;
  }

  // 8. Sai mật khẩu
  if (!validPassword) {
    const error = new Error(
      "Email/MSSV hoặc mật khẩu không chính xác"
    );

    error.statusCode = 401;
    error.code = "INVALID_CREDENTIALS";

    throw error;
  }

  // 9. Kiểm tra nếu SinhVien được phân công check-in thì đổi role tạm thời
  if (user.loai_tai_khoan === "SinhVien") {
    const { count } = await supabase
      .from("nhan_vien_check_in")
      .select("*", { count: "exact", head: true })
      .eq("ma_tai_khoan", user.ma_tai_khoan)
      .eq("da_xoa", false);
    
    if (count > 0) {
      user.loai_tai_khoan = "NhanVienCheckIn";
    }
  }

  // 10. Tạo JWT
  const accessToken = generateAccessToken(user);

  // 11. Không trả password về frontend
  const safeUser = {
    ma_tai_khoan: user.ma_tai_khoan,
    mssv: user.mssv,
    email: user.email,
    ho_ten: user.ho_ten,
    sdt: user.sdt,
    khoa: user.khoa,
    avatar_url: user.avatar_url,
    loai_tai_khoan: user.loai_tai_khoan,
    trang_thai_tai_khoan:
      user.trang_thai_tai_khoan,
  };

  return {
    accessToken,
    user: safeUser,
  };
}

// ========================================
// DEMO LOGIN (cho quick login trên giao diện)
// ========================================

module.exports = {
  registerUser,
  loginUser,
};
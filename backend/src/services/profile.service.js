const supabase = require("../config/supabase");

const PROFILE_FIELDS = `
  ma_tai_khoan,
  mssv,
  email,
  ho_ten,
  sdt,
  khoa,
  avatar_url,
  loai_tai_khoan,
  trang_thai_tai_khoan,
  thoi_gian_tao,
  thoi_gian_cap_nhat
`;

async function getProfileById(accountId) {
  const { data, error } = await supabase
    .from("tai_khoan")
    .select(PROFILE_FIELDS)
    .eq("ma_tai_khoan", accountId)
    .eq("da_xoa", false)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const error = new Error("Không tìm thấy tài khoản");
    error.status = 404;
    throw error;
  }

  // Cập nhật lại role nếu được phân công check-in
  if (data.loai_tai_khoan === "SinhVien") {
    const { count } = await supabase
      .from("nhan_vien_check_in")
      .select("*", { count: "exact", head: true })
      .eq("ma_tai_khoan", accountId)
      .eq("da_xoa", false);
    if (count > 0) {
      data.loai_tai_khoan = "NhanVienCheckIn";
    }
  }

  return data;
}

async function updateProfile(accountId, updateData) {
  const { data, error } = await supabase
    .from("tai_khoan")
    .update({
      ...updateData,
      thoi_gian_cap_nhat: new Date().toISOString(),
    })
    .eq("ma_tai_khoan", accountId)
    .eq("da_xoa", false)
    .select(PROFILE_FIELDS)
    .single();

  if (error) {
    throw error;
  }

  if (data.loai_tai_khoan === "SinhVien") {
    const { count } = await supabase
      .from("nhan_vien_check_in")
      .select("*", { count: "exact", head: true })
      .eq("ma_tai_khoan", accountId)
      .eq("da_xoa", false);
    if (count > 0) {
      data.loai_tai_khoan = "NhanVienCheckIn";
    }
  }

  return data;
}

module.exports = {
  getProfileById,
  updateProfile,
};
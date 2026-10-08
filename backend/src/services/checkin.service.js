const supabasePkg = require("../config/supabase.js");
const supabase = supabasePkg.supabase || supabasePkg;

const SCANNABLE_EVENT_STATUSES = new Set(["SapToChuc", "DangDienRa"]);

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return null;
}

function normalizeTime(value) {
  if (!value || typeof value !== "string") return null;
  return value.length === 5 ? `${value}:00` : value.slice(0, 8);
}

function buildVietnamDateTime(dateValue, timeValue) {
  const date = normalizeDate(dateValue);
  const time = normalizeTime(timeValue);

  if (!date || !time) return null;

  const parsed = new Date(`${date}T${time}+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getEventWindow(event) {
  return {
    startsAt: buildVietnamDateTime(event.ngay_dien_ra, event.thoi_gian_bat_dau),
    endsAt: buildVietnamDateTime(event.ngay_dien_ra, event.thoi_gian_ket_thuc),
  };
}

function isCheckInWindowOpen(event, now = new Date()) {
  const { startsAt, endsAt } = getEventWindow(event);

  if (!startsAt || !endsAt) return false;
  if (!SCANNABLE_EVENT_STATUSES.has(event.trang_thai_su_kien)) return false;

  return now >= startsAt && now < endsAt;
}

function mapAssignedEvent(event, now = new Date()) {
  const checkInWindowOpen = isCheckInWindowOpen(event, now);

  return {
    ma_su_kien: event.ma_su_kien,
    ten_su_kien: event.ten_su_kien,
    dia_diem: event.dia_diem,
    phong: event.phong,
    ngay_dien_ra: normalizeDate(event.ngay_dien_ra),
    thoi_gian_bat_dau: normalizeTime(event.thoi_gian_bat_dau),
    thoi_gian_ket_thuc: normalizeTime(event.thoi_gian_ket_thuc),
    trang_thai_su_kien: event.trang_thai_su_kien,
    checkInWindowOpen,
    canScan: checkInWindowOpen,
  };
}

function sortAssignedEvents(events) {
  return [...events].sort((a, b) => {
    const aStart = buildVietnamDateTime(a.ngay_dien_ra, a.thoi_gian_bat_dau);
    const bStart = buildVietnamDateTime(b.ngay_dien_ra, b.thoi_gian_bat_dau);

    if (!aStart && !bStart) return a.ma_su_kien - b.ma_su_kien;
    if (!aStart) return 1;
    if (!bStart) return -1;

    return aStart.getTime() - bStart.getTime();
  });
}

async function listAssignedEventsForStaff(accountId, now = new Date()) {
  const { data, error } = await supabase
    .from("nhan_vien_check_in")
    .select(
      `
      ma_nhan_vien,
      su_kien (
        ma_su_kien,
        ten_su_kien,
        dia_diem,
        phong,
        ngay_dien_ra,
        thoi_gian_bat_dau,
        thoi_gian_ket_thuc,
        trang_thai_su_kien,
        da_xoa
      )
    `
    )
    .eq("ma_tai_khoan", accountId)
    .eq("da_xoa", false)
    .range(0, 999);

  if (error) throw error;

  const byEventId = new Map();

  for (const assignment of data || []) {
    const event = assignment.su_kien;

    if (!event || event.da_xoa || event.trang_thai_su_kien === "BanNhap") {
      continue;
    }

    byEventId.set(event.ma_su_kien, event);
  }

  return sortAssignedEvents([...byEventId.values()]).map((event) =>
    mapAssignedEvent(event, now)
  );
}

async function listAssignedEventsForOrganizer(accountId, now = new Date()) {
  const { data, error } = await supabase
    .from("su_kien")
    .select(
      `
      ma_su_kien,
      ten_su_kien,
      dia_diem,
      phong,
      ngay_dien_ra,
      thoi_gian_bat_dau,
      thoi_gian_ket_thuc,
      trang_thai_su_kien,
      da_xoa
    `
    )
    .eq("ma_tai_khoan_to_chuc", accountId)
    .eq("da_xoa", false)
    .neq("trang_thai_su_kien", "BanNhap")
    .range(0, 999);

  if (error) throw error;

  return sortAssignedEvents(data || []).map((event) => mapAssignedEvent(event, now));
}

async function getAssignedEvents(
  user,
  options = {}
) {
  if (!user?.id) {
    const error = new Error(
      "Bạn chưa đăng nhập"
    );
    error.code = "UNAUTHORIZED";
    throw error;
  }

  const actorId =
    toPositiveInteger(user.id);

  if (!actorId) {
    const error = new Error(
      "Tài khoản không hợp lệ"
    );
    error.code = "UNAUTHORIZED";
    throw error;
  }

  // Nhân viên check-in:
  // chỉ xem các sự kiện được phân công.
  if (user.role === "NhanVienCheckIn") {
    return listAssignedEventsForStaff(
      actorId,
      options.now
    );
  }

  // Ban tổ chức:
  // chỉ xem các sự kiện do mình tổ chức.
  if (user.role === "ToChuc") {
    return listAssignedEventsForOrganizer(
      actorId,
      options.now
    );
  }

  // SinhVien và mọi role khác không có quyền.
  const error = new Error(
    "Bạn không có quyền soát vé"
  );
  error.code = "FORBIDDEN";
  throw error;
}

const SCAN_ERROR_MESSAGES = {
  UNAUTHORIZED: "Bạn chưa đăng nhập hoặc tài khoản không hợp lệ",
  FORBIDDEN: "Bạn không có quyền soát vé sự kiện này",
  INVALID_TICKET: "Vé không tồn tại hoặc không hợp lệ",
  WRONG_EVENT: "Vé không thuộc sự kiện đang chọn",
  TICKET_CANCELLED: "Vé đã bị hủy",
  CHECK_IN_CLOSED: "Sự kiện chưa mở hoặc đã đóng check-in",
  ALREADY_CHECKED_IN: "Vé đã được check-in trước đó",
};

function normalizeRpcPayload(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

function createScanError(code, payload = null) {
  const error = new Error(SCAN_ERROR_MESSAGES[code] || "Check-in thất bại");
  error.code = code || "INTERNAL_ERROR";
  error.payload = payload;
  throw error;
}

async function scanTicket({ actorId, eventId, qrCode }) {
  const parsedActorId = toPositiveInteger(actorId);
  const parsedEventId = toPositiveInteger(eventId);
  const normalizedQr = typeof qrCode === "string" ? qrCode.trim() : "";

  if (!parsedActorId || !parsedEventId || !normalizedQr || normalizedQr.length > 255) {
    const error = new Error("Dữ liệu check-in không hợp lệ");
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  const { data, error } = await supabase.rpc("check_in_ticket", {
    p_actor_id: parsedActorId,
    p_ma_su_kien: parsedEventId,
    p_ma_qr_code: normalizedQr,
  });

  if (error) throw error;

  const payload = normalizeRpcPayload(data);

  if (!payload || !payload.code) {
    createScanError("INTERNAL_ERROR");
  }

  if (!payload.success) {
    createScanError(payload.code, payload);
  }

  return {
    code: "CHECK_IN_SUCCESS",
    ma_dang_ky: payload.ma_dang_ky,
    ma_su_kien: payload.ma_su_kien,
    student: payload.student,
    checkedInAt: payload.checkedInAt,
  };
}

async function getHistory({ actorId, role, eventId, limit = 20, cursor = null }) {
  const parsedActorId = toPositiveInteger(actorId);
  const parsedEventId = toPositiveInteger(eventId);
  const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 20));

  if (!parsedActorId || !parsedEventId) {
    const error = new Error("Tham số lịch sử không hợp lệ");
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  const assignedEvents = await getAssignedEvents({ id: parsedActorId, role });
  const hasAccess = assignedEvents.some((event) => event.ma_su_kien === parsedEventId);

  if (!hasAccess) {
    const error = new Error("Bạn không có quyền xem lịch sử sự kiện này");
    error.code = "FORBIDDEN";
    throw error;
  }

  let query = supabase
    .from("dang_ky")
    .select(
      `
      ma_dang_ky,
      thoi_gian_check_in,
      tai_khoan (
        ma_tai_khoan,
        mssv,
        ho_ten,
        khoa
      )
    `
    )
    .eq("ma_su_kien", parsedEventId)
    .eq("trang_thai_ve", "DaCheckIn")
    .eq("da_xoa", false)
    .order("thoi_gian_check_in", { ascending: false })
    .order("ma_dang_ky", { ascending: false });

  if (cursor) {
    const [checkedInAt, id] = String(cursor).split("|");
    const cursorId = toPositiveInteger(id);
    if (checkedInAt && cursorId) {
      query = query.or(
        `thoi_gian_check_in.lt.${checkedInAt},and(thoi_gian_check_in.eq.${checkedInAt},ma_dang_ky.lt.${cursorId})`
      );
    }
  }

  const { data, error } = await query.range(0, parsedLimit);

  if (error) throw error;

  const rows = data || [];
  const pageRows = rows.slice(0, parsedLimit);
  const last = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map((item) => ({
      ma_dang_ky: item.ma_dang_ky,
      student: {
        ma_tai_khoan: item.tai_khoan?.ma_tai_khoan,
        mssv: item.tai_khoan?.mssv,
        ho_ten: item.tai_khoan?.ho_ten,
        khoa: item.tai_khoan?.khoa,
      },
      checkedInAt: item.thoi_gian_check_in,
    })),
    nextCursor:
      rows.length > parsedLimit && last
        ? `${last.thoi_gian_check_in}|${last.ma_dang_ky}`
        : null,
  };
}

module.exports = {
  getAssignedEvents,
  getHistory,
  isCheckInWindowOpen,
  mapAssignedEvent,
  scanTicket,
  toPositiveInteger,
};

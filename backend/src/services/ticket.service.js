const crypto = require('crypto');
const supabase = require('../config/supabase');
const { sendTicketEmail } = require('./mail.service'); // Đã bật cho Gói 4 & 6

function toPositiveInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function normalizeDate(value) {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return null;
}

function normalizeTime(value) {
    if (!value || typeof value !== 'string') return null;
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
        startsAt: buildVietnamDateTime(event?.ngay_dien_ra, event?.thoi_gian_bat_dau),
        endsAt: buildVietnamDateTime(event?.ngay_dien_ra, event?.thoi_gian_ket_thuc)
    };
}

function normalizeRpcPayload(data) {
    if (Array.isArray(data)) return data[0] || null;
    return data || null;
}

/**
 * Service sinh mã QR Code bảo mật bằng HMAC SHA-256
 */
const generateSecureQRCode = (userId, eventId) => {
    const rawData = `${userId}-${eventId}-${Date.now()}-${crypto.randomUUID()}`;
    const secretKey = process.env.JWT_SECRET || 'campus-event-hub-secret-key-default';
    
    // Hash thông tin vé để tạo chuỗi bảo mật chống làm giả
    const qrCodeHash = crypto.createHmac('sha256', secretKey)
                            .update(rawData)
                            .digest('hex');
    
    return qrCodeHash;
};

/**
 * Gọi Stored Function dat_ve_su_kien trên Supabase
 */
const bookTicket = async (userId, eventId) => {
    // 1. Sinh mã QR bảo mật
    const qrCode = generateSecureQRCode(userId, eventId);

    // 2. Gọi RPC trên Supabase để thực hiện khóa bi quan (Pessimistic Lock)
    const { data, error } = await supabase.rpc('dat_ve_su_kien', {
        p_ma_tai_khoan: userId,
        p_ma_su_kien: eventId,
        p_ma_qr_code: qrCode
    });

    // 3. Xử lý kết quả trả về từ RPC
    if (error) {
        throw new Error(error.message || 'Lỗi hệ thống khi đặt vé');
    }

    if (data && !data.success) {
        throw new Error(data.message || 'Đặt vé thất bại');
    }

    // 4. Gửi email bất đồng bộ - Tích hợp cho Gói 4
    sendTicketEmail(userId, eventId, qrCode).catch(err => console.error("Lỗi gửi email:", err));

    return {
        qrCode,
        message: data?.message || 'Đặt vé thành công'
    };
};

function mapTicket(ticket, now = new Date()) {
    const event = ticket.su_kien || null;
    const { startsAt, endsAt } = getEventWindow(event);
    const status = ticket.trang_thai_ve;
    const eventStatus = event?.trang_thai_su_kien;
    const hasNotStarted = startsAt ? now < startsAt : false;
    const inCheckInWindow = startsAt && endsAt ? now >= startsAt && now < endsAt : false;
    const canCancel =
        status === 'DaDangKy' &&
        hasNotStarted &&
        eventStatus !== 'DangDienRa' &&
        eventStatus !== 'DaKetThuc';
    const canShowQr =
        status === 'DaDangKy' &&
        (hasNotStarted || inCheckInWindow) &&
        eventStatus !== 'BanNhap' &&
        eventStatus !== 'DaKetThuc';
    const isExpired = endsAt ? now >= endsAt : eventStatus === 'DaKetThuc';
    const group =
        status === 'DaDangKy' && hasNotStarted ? 'upcoming' : 'history';

    return {
        ma_dang_ky: ticket.ma_dang_ky,
        ma_qr_code: ticket.ma_qr_code,
        trang_thai_ve: status,
        thoi_gian_tao: ticket.thoi_gian_tao,
        thoi_gian_check_in: ticket.thoi_gian_check_in,
        thoi_gian_huy: ticket.thoi_gian_huy,
        canCancel,
        canShowQr,
        isExpired,
        group,
        su_kien: event
            ? {
                ma_su_kien: event.ma_su_kien,
                ten_su_kien: event.ten_su_kien,
                dia_diem: event.dia_diem,
                phong: event.phong,
                ngay_dien_ra: normalizeDate(event.ngay_dien_ra),
                thoi_gian_bat_dau: normalizeTime(event.thoi_gian_bat_dau),
                thoi_gian_ket_thuc: normalizeTime(event.thoi_gian_ket_thuc),
                trang_thai_su_kien: event.trang_thai_su_kien
            }
            : null
    };
}

const getMyTickets = async (userId, options = {}) => {
    const parsedUserId = toPositiveInteger(userId);
    if (!parsedUserId) {
        const error = new Error('Bạn chưa đăng nhập');
        error.code = 'UNAUTHORIZED';
        throw error;
    }

    const { data, error } = await supabase
        .from('dang_ky')
        .select(`
            ma_dang_ky,
            ma_qr_code,
            trang_thai_ve,
            thoi_gian_tao,
            thoi_gian_check_in,
            thoi_gian_huy,
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
        `)
        .eq('ma_tai_khoan', parsedUserId)
        .eq('da_xoa', false)
        .order('thoi_gian_tao', { ascending: false });

    if (error) throw error;

    const tickets = (data || [])
        .filter((ticket) => !ticket.su_kien || ticket.su_kien.da_xoa !== true)
        .map((ticket) => mapTicket(ticket, options.now));

    return {
        upcoming: tickets.filter((ticket) => ticket.group === 'upcoming'),
        history: tickets.filter((ticket) => ticket.group === 'history'),
        nextCursor: null
    };
};

const cancelTicket = async (userId, ticketId) => {
    const parsedUserId = toPositiveInteger(userId);
    const parsedTicketId = toPositiveInteger(ticketId);

    if (!parsedUserId || !parsedTicketId) {
        const error = new Error('ID vé không hợp lệ');
        error.code = 'VALIDATION_ERROR';
        throw error;
    }

    const { data, error } = await supabase.rpc('cancel_ticket', {
        p_actor_id: parsedUserId,
        p_ma_dang_ky: parsedTicketId
    });

    if (error) throw error;

    const payload = normalizeRpcPayload(data);
    if (!payload || !payload.code) {
        const internalError = new Error('Không thể hủy vé');
        internalError.code = 'INTERNAL_ERROR';
        throw internalError;
    }

    if (!payload.success) {
        const cancelError = new Error(
            payload.code === 'TICKET_ALREADY_CANCELLED'
                ? 'Vé đã được hủy trước đó'
                : payload.code === 'INVALID_TICKET'
                    ? 'Vé không tồn tại'
                    : 'Không thể hủy vé ở thời điểm hiện tại'
        );
        cancelError.code = payload.code;
        throw cancelError;
    }

    return {
        ma_dang_ky: payload.ma_dang_ky,
        trang_thai_ve: payload.trang_thai_ve,
        canceledAt: payload.canceledAt
    };
};

module.exports = {
    bookTicket,
    generateSecureQRCode,
    getMyTickets,
    mapTicket,
    cancelTicket
};

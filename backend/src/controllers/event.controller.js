const eventService = require('../services/event.service.js');
const { createEventSchema, updateEventSchema } = require('../validators/eventValidation.js');

const getCategories = async (req, res, next) => {
  try {
    const categories = await eventService.getCategoriesService();
    return res.status(200).json({
      success: true,
      data: categories,
      message: 'Lấy danh mục chuyên đề thành công',
    });
  } catch (error) {
    next(error);
  }
};

const getOrganizerEvents = async (req, res, next) => {
  try {
    const maTaiKhoan = req.user?.id;
    if (!maTaiKhoan) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Yêu cầu đăng nhập tài khoản ban tổ chức',
      });
    }

    const events = await eventService.getOrganizerEventsService(maTaiKhoan);
    return res.status(200).json({
      success: true,
      data: events,
      message: 'Lấy danh sách sự kiện ban tổ chức thành công',
    });
  } catch (error) {
    // In chi tiết lỗi JSON đầy đủ ra Terminal
    console.error('Lỗi chi tiết Supabase:', JSON.stringify(error, null, 2));
    
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      details: error,
      message: error.message || error.details || 'Lỗi truy vấn cơ sở dữ liệu',
    });
  }
};

const getPublicEvents = async (req, res, next) => {
  try {
    const { keyword, ma_chuyen_de, trang_thai_su_kien, ticketStatus, ngay_dien_ra, dia_diem, page, limit, sortBy } = req.query;

    let maTaiKhoan = null;
    if (req.user?.id) {
      maTaiKhoan = req.user.id;
    } else {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          maTaiKhoan = decoded.sub || decoded.id || decoded.ma_tai_khoan;
        } catch (e) {}
      }
    }

    const result = await eventService.getPublicEventsService({
      keyword,
      ma_chuyen_de: ma_chuyen_de ? Number(ma_chuyen_de) : undefined,
      trang_thai_su_kien,
      ticketStatus,
      ngay_dien_ra,
      dia_diem,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 9,
      sortBy,
      maTaiKhoan
    });

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Lấy danh sách sự kiện public thành công',
    });
  } catch (error) {
    console.error('Lỗi getPublicEvents:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || 'Không thể lấy danh sách sự kiện',
    });
  }
};

const getEventById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'ID không hợp lệ' });
    }
    // req.user might be present if they send a token and we have an optional auth middleware
    // We will get maTaiKhoan if available
    let maTaiKhoan = null;
    
    // Attempt to extract token manually if middleware wasn't strictly applied
    // Or we assume the route can use optional auth middleware
    if (req.user?.id) {
      maTaiKhoan = req.user.id;
    } else {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          maTaiKhoan = decoded.sub || decoded.id || decoded.ma_tai_khoan;
        } catch (e) {}
      }
    }

    const event = await eventService.getEventByIdService(id, maTaiKhoan);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sự kiện',
      });
    }

    return res.status(200).json({
      success: true,
      data: event,
      message: 'Lấy chi tiết sự kiện thành công',
    });
  } catch (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sự kiện',
      });
    }
    console.error('Lỗi getEventById:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || 'Không thể lấy thông tin sự kiện',
    });
  }
};

const createEvent = async (req, res, next) => {
  try {
    const body = req.body || {};

    const rawData = {
      ...body,
      ma_chuyen_de: body.ma_chuyen_de ? Number(body.ma_chuyen_de) : undefined,
      so_luong_toi_da: body.so_luong_toi_da ? Number(body.so_luong_toi_da) : undefined,
    };

    const validatedData = createEventSchema.parse(rawData);
    const maTaiKhoan = req.user?.id;
    if (!maTaiKhoan) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Yêu cầu đăng nhập tài khoản ban tổ chức',
      });
    }

    const newEvent = await eventService.createEventService(validatedData, maTaiKhoan);

    return res.status(201).json({
      success: true,
      data: newEvent,
      message:
        validatedData.trang_thai_su_kien === 'BanNhap'
          ? 'Lưu nháp sự kiện thành công'
          : 'Xuất bản sự kiện thành công',
    });
  } catch (error) {
    if (error.name === 'ZodError' || error.issues || error.errors) {
      const issueList = error.issues || error.errors || [];
      const firstMsg = issueList.length > 0 ? issueList[0].message : 'Dữ liệu không hợp lệ';

      console.warn('Chi tiết lỗi Zod createEvent:', issueList);

      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: firstMsg,
        details: issueList,
      });
    }

    console.error('Lỗi createEvent:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || 'Lỗi xử lý máy chủ',
    });
  }
};

const updateEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const rawData = {
      ...body,
      ...(body.ma_chuyen_de !== undefined && { ma_chuyen_de: Number(body.ma_chuyen_de) }),
      ...(body.so_luong_toi_da !== undefined && { so_luong_toi_da: Number(body.so_luong_toi_da) }),
    };

    const validatedData = updateEventSchema.parse(rawData);
    const maTaiKhoan = req.user?.id;
    if (!maTaiKhoan) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Yêu cầu đăng nhập tài khoản ban tổ chức',
      });
    }

    const updated = await eventService.updateEventService(id, validatedData, maTaiKhoan);

    return res.status(200).json({
      success: true,
      data: updated,
      message: 'Cập nhật sự kiện thành công',
    });
  } catch (error) {
    if (error.name === 'ZodError' || error.issues || error.errors) {
      const issueList = error.issues || error.errors || [];
      const firstMsg = issueList.length > 0 ? issueList[0].message : 'Dữ liệu không hợp lệ';

      console.warn('Chi tiết lỗi Zod updateEvent:', issueList);

      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: firstMsg,
        details: issueList,
      });
    }

    if (error.message) {
      return res.status(400).json({
        success: false,
        error: 'BUSINESS_ERROR',
        message: error.message,
      });
    }

    console.error('Lỗi updateEvent:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || 'Lỗi xử lý máy chủ',
    });
  }
};

const deleteEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const maTaiKhoan = req.user?.id;
    if (!maTaiKhoan) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Yêu cầu đăng nhập tài khoản ban tổ chức',
      });
    }

    await eventService.deleteEventService(id, maTaiKhoan);

    return res.status(200).json({
      success: true,
      data: null,
      message: 'Hủy/Xóa sự kiện thành công',
    });
  } catch (error) {
    next(error);
  }
};

const getNotifications = async (req, res) => {
  try {
    const data = await eventService.getNotificationsService();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const uploadBanner = async (req, res) => {
  try {
    const { fileData, fileName, mimeType } = req.body || {};
    if (!fileData) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn hoặc cung cấp dữ liệu hình ảnh',
      });
    }

    const publicUrl = await eventService.uploadEventBannerService(fileData, fileName, mimeType);

    return res.status(200).json({
      success: true,
      data: { url: publicUrl },
      message: 'Tải ảnh bìa thành công',
    });
  } catch (error) {
    console.error('Lỗi uploadBanner:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || 'Không thể tải ảnh lên',
    });
  }
};

module.exports = {
  getPublicEvents,
  getCategories,
  getOrganizerEvents,
  getEventById,
  createEvent,
  updateEvent,
  uploadBanner,
  deleteEvent,
  getNotifications,
};
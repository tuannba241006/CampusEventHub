const supabasePkg = require('../config/supabase.js');
const supabase = supabasePkg.supabase || supabasePkg;
const { processEventWithStatus } = require('../utils/eventStatus.js');

// 1. Lấy danh mục chuyên đề (chưa bị xóa)
const getCategoriesService = async () => {
  const { data, error } = await supabase
    .from('chuyen_de')
    .select('*')
    .eq('da_xoa', false)
    .order('ten_chuyen_de', { ascending: true });

  if (error) throw error;
  return data;
};

// 2. Lấy danh sách sự kiện do Ban tổ chức sở hữu
const getOrganizerEventsService = async (maTaiKhoanToChuc) => {
  const { data, error } = await supabase
    .from('su_kien')
    .select(`
      *,
      chuyen_de (ma_chuyen_de, ten_chuyen_de),
      dang_ky (count)
    `)
    .eq('ma_tai_khoan_to_chuc', maTaiKhoanToChuc)
    .order('ma_su_kien', { ascending: false });

  if (error) throw error;

  return data.map((item) => {
    const computed = processEventWithStatus(item);
    return {
      ...computed,
      so_ve_da_dat: item.dang_ky?.[0]?.count || 0,
    };
  });
};

// 0. Lấy danh sách sự kiện public (Gói 3)
const getPublicEventsService = async ({ keyword, ma_chuyen_de, trang_thai_su_kien, ticketStatus, ngay_dien_ra, dia_diem, page = 1, limit = 9, sortBy = 'date_asc', maTaiKhoan = null }) => {
  let query = supabase
    .from('su_kien')
    .select(`
      *,
      chuyen_de (ma_chuyen_de, ten_chuyen_de),
      dang_ky (count)
    `)
    .neq('trang_thai_su_kien', 'BanNhap')
    .eq('da_xoa', false);

  if (keyword) {
    query = query.or(`ten_su_kien.ilike.%${keyword}%,dia_diem.ilike.%${keyword}%,dien_gia.ilike.%${keyword}%`);
  }
  if (ma_chuyen_de) {
    query = query.eq('ma_chuyen_de', ma_chuyen_de);
  }
  if (ngay_dien_ra) {
    query = query.eq('ngay_dien_ra', ngay_dien_ra);
  }
  if (dia_diem) {
    query = query.ilike('dia_diem', `%${dia_diem}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  let registeredEventIds = new Set();
  if (maTaiKhoan) {
    const { data: userRegs } = await supabase
      .from('dang_ky')
      .select('ma_su_kien')
      .eq('ma_tai_khoan', maTaiKhoan)
      .neq('trang_thai_ve', 'DaHuy')
      .eq('da_xoa', false);
    if (userRegs) {
      registeredEventIds = new Set(userRegs.map(r => r.ma_su_kien));
    }
  }

  let formattedData = data.map(item => {
    const computed = processEventWithStatus(item);
    const so_ve_da_dat = item.dang_ky?.[0]?.count || 0; 
    const so_ve_con_lai = item.so_luong_toi_da - so_ve_da_dat;
    return {
      ...computed,
      so_ve_da_dat,
      so_ve_con_lai,
      hasRegistered: registeredEventIds.has(item.ma_su_kien),
      dang_ky: undefined
    };
  });

  if (trang_thai_su_kien) {
    formattedData = formattedData.filter(e => e.trang_thai_su_kien === trang_thai_su_kien);
  }

  if (ticketStatus === 'Còn chỗ') {
    formattedData = formattedData.filter(e => e.so_ve_con_lai > 0);
  } else if (ticketStatus === 'Hết chỗ') {
    formattedData = formattedData.filter(e => e.so_ve_con_lai <= 0);
  } else if (ticketStatus === 'Sắp hết') {
    formattedData = formattedData.filter(e => e.so_ve_con_lai > 0 && e.so_ve_con_lai <= Math.ceil(e.so_luong_toi_da * 0.2));
  }

  if (sortBy === 'date_asc') {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    formattedData.sort((a, b) => {
      const dateA = new Date(a.ngay_dien_ra);
      const dateB = new Date(b.ngay_dien_ra);
      const isPastA = dateA < now;
      const isPastB = dateB < now;
      if (isPastA && !isPastB) return 1;
      if (!isPastA && isPastB) return -1;
      return dateA - dateB;
    });
  } else if (sortBy === 'date_latest' || sortBy === 'date_desc') {
    formattedData.sort((a, b) => new Date(b.ngay_dien_ra) - new Date(a.ngay_dien_ra));
  } else if (sortBy === 'date_earliest') {
    formattedData.sort((a, b) => new Date(a.ngay_dien_ra) - new Date(b.ngay_dien_ra));
  } else if (sortBy === 'name_asc') {
    formattedData.sort((a, b) => (a.ten_su_kien || '').localeCompare(b.ten_su_kien || ''));
  } else if (sortBy === 'name_desc') {
    formattedData.sort((a, b) => (b.ten_su_kien || '').localeCompare(a.ten_su_kien || ''));
  }

  const total = formattedData.length;
  const startIndex = (page - 1) * limit;
  const paginatedEvents = formattedData.slice(startIndex, startIndex + limit);

  return { events: paginatedEvents, total };
};

// Lấy chi tiết 1 sự kiện theo ID
const getEventByIdService = async (id, maTaiKhoan) => {
  const { data, error } = await supabase
    .from('su_kien')
    .select(`
      *,
      chuyen_de (ma_chuyen_de, ten_chuyen_de),
      dang_ky (count),
      tai_khoan (ho_ten)
    `)
    .eq('ma_su_kien', id)
    .single();

  if (error) throw error;

  const computedData = processEventWithStatus(data);

  const so_ve_da_dat = computedData.dang_ky?.[0]?.count || 0;
  const so_ve_con_lai = computedData.so_luong_toi_da - so_ve_da_dat;
  computedData.so_ve_da_dat = so_ve_da_dat;
  computedData.so_ve_con_lai = so_ve_con_lai;
  computedData.to_chuc = computedData.tai_khoan?.ho_ten;
  delete computedData.dang_ky;
  delete computedData.tai_khoan;

  let hasRegistered = false;
  let canCheckin = false;
  if (maTaiKhoan) {
    const { count } = await supabase
      .from('dang_ky')
      .select('*', { count: 'exact', head: true })
      .eq('ma_su_kien', id)
      .eq('ma_tai_khoan', maTaiKhoan)
      .neq('trang_thai_ve', 'DaHuy')
      .eq('da_xoa', false);
    hasRegistered = count > 0;

    if (computedData.ma_tai_khoan_to_chuc === maTaiKhoan) {
      canCheckin = true;
    } else {
      const { count: staffCount } = await supabase
        .from('nhan_vien_check_in')
        .select('*', { count: 'exact', head: true })
        .eq('ma_su_kien', id)
        .eq('ma_tai_khoan', maTaiKhoan)
        .eq('da_xoa', false);
      if (staffCount > 0) canCheckin = true;
    }
  }
  computedData.hasRegistered = hasRegistered;
  computedData.canCheckin = canCheckin;

  return computedData;
};

// 3. Tạo sự kiện mới
const createEventService = async (eventData, maTaiKhoanToChuc) => {
  const payload = {
    ...eventData,
    anh_bia: (eventData.anh_bia && String(eventData.anh_bia).trim())
      ? String(eventData.anh_bia).trim()
      : 'https://placehold.co/1200x630/png?text=Campus+Event',
    ma_tai_khoan_to_chuc: maTaiKhoanToChuc,
  };

  const { data, error } = await supabase
    .from('su_kien')
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data;
};

// 4. Cập nhật sự kiện
const updateEventService = async (id, updateData, maTaiKhoanToChuc) => {
  const { count: registeredCount, error: countErr } = await supabase
    .from('dang_ky')
    .select('*', { count: 'exact', head: true })
    .eq('ma_su_kien', id)
    .neq('trang_thai_ve', 'DaHuy');

  if (countErr) throw countErr;

  if (updateData.so_luong_toi_da && updateData.so_luong_toi_da < (registeredCount || 0)) {
    throw new Error(`Không thể giảm sức chứa xuống dưới số vé đã đăng ký (${registeredCount} vé)`);
  }

  const payloadData = { ...updateData };
  if (payloadData.anh_bia !== undefined && (!payloadData.anh_bia || !String(payloadData.anh_bia).trim())) {
    payloadData.anh_bia = 'https://placehold.co/1200x630/png?text=Campus+Event';
  }

  const { data, error } = await supabase
    .from('su_kien')
    .update(payloadData)
    .eq('ma_su_kien', id)
    .eq('ma_tai_khoan_to_chuc', maTaiKhoanToChuc)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Hàm upload ảnh bìa vào Supabase Storage bucket event-banners
const uploadEventBannerService = async (fileData, fileName = 'banner.png', mimeType = 'image/png') => {
  const bucketName = 'event-banners';
  const fileExt = fileName.includes('.') ? fileName.split('.').pop() : 'png';
  const filePath = `banner-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

  try {
    let buffer;
    if (typeof fileData === 'string' && fileData.startsWith('data:')) {
      const base64Content = fileData.split(';base64,').pop();
      buffer = Buffer.from(base64Content, 'base64');
    } else if (Buffer.isBuffer(fileData)) {
      buffer = fileData;
    } else {
      buffer = Buffer.from(fileData, 'base64');
    }

    if (supabase.storage) {
      // Đảm bảo bucket tồn tại hoặc thử upload
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, buffer, {
          contentType: mimeType || 'image/png',
          upsert: true,
        });

      if (!error && data) {
        const { data: publicUrlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(filePath);

        if (publicUrlData?.publicUrl) {
          return publicUrlData.publicUrl;
        }
      } else if (error) {
        console.warn('Supabase storage upload error:', error.message);
      }
    }
  } catch (err) {
    console.warn('Supabase storage exception:', err.message);
  }

  // Fallback: nếu storage chưa khởi tạo bucket hoặc có lỗi, giữ lại data URL/base64 hoặc fallback URL
  if (typeof fileData === 'string' && fileData.startsWith('data:image')) {
    return fileData;
  }
  return 'https://placehold.co/1200x630/png?text=Campus+Event';
};

// 5. Xóa mềm sự kiện
const deleteEventService = async (id, maTaiKhoanToChuc) => {
  const { data, error } = await supabase
    .from('su_kien')
    .update({ trang_thai_su_kien: 'DaKetThuc', da_xoa: true })
    .eq('ma_su_kien', id)
    .eq('ma_tai_khoan_to_chuc', maTaiKhoanToChuc)
    .select()
    .single();

  if (error) throw error;
  return data;
};

const getNotificationsService = async () => {
  // Lấy 1 đăng ký mới nhất
  const { data: latestReg } = await supabase
    .from('dang_ky')
    .select('ma_dang_ky, thoi_gian_tao, su_kien(ten_su_kien)')
    .order('thoi_gian_tao', { ascending: false })
    .limit(1);

  // Lấy 4 sự kiện sắp diễn ra
  const { data: upcomingEvents } = await supabase
    .from('su_kien')
    .select('ma_su_kien, ten_su_kien, thoi_gian_bat_dau')
    .eq('trang_thai_su_kien', 'SapToChuc')
    .order('ngay_dien_ra', { ascending: true })
    .limit(4);

  const notifications = [];
  
  if (upcomingEvents && upcomingEvents.length > 0) {
    if (upcomingEvents[0]) {
      notifications.push({
        id: 'upc_' + upcomingEvents[0].ma_su_kien + '_1',
        type: 'calendar',
        title: 'Sự kiện sắp diễn ra',
        message: `${upcomingEvents[0].ten_su_kien} sẽ diễn ra lúc ${upcomingEvents[0].thoi_gian_bat_dau}.`,
        time: '10 phút trước',
        isNew: true
      });
    }
    if (upcomingEvents[1]) {
      notifications.push({
        id: 'upc_' + upcomingEvents[1].ma_su_kien + '_2',
        type: 'bell',
        title: 'Nhắc nhở check-in',
        message: `Sự kiện ${upcomingEvents[1].ten_su_kien} của bạn sẽ bắt đầu sau 2 giờ.`,
        time: '2 giờ trước',
        isNew: true
      });
    }
  }

  if (latestReg && latestReg.length > 0) {
    const reg = latestReg[0];
    if (reg.su_kien) {
      notifications.push({
        id: 'reg_' + reg.ma_dang_ky,
        type: 'success',
        title: 'Đăng ký thành công',
        message: `Bạn đã đăng ký ${reg.su_kien.ten_su_kien}.`,
        time: 'Hôm qua',
        isNew: false
      });
    }
  }

  if (upcomingEvents && upcomingEvents.length > 2) {
    if (upcomingEvents[2]) {
      notifications.push({
        id: 'upc_' + upcomingEvents[2].ma_su_kien + '_3',
        type: 'update',
        title: 'Sự kiện đã cập nhật',
        message: `Địa điểm của ${upcomingEvents[2].ten_su_kien} đã được thay đổi.`,
        time: 'Hôm qua',
        isNew: false
      });
    }
    if (upcomingEvents[3]) {
      notifications.push({
        id: 'upc_' + upcomingEvents[3].ma_su_kien + '_4',
        type: 'warning',
        title: 'Sắp đóng đăng ký',
        message: `${upcomingEvents[3].ten_su_kien} sẽ đóng đăng ký lúc 23:59 hôm nay.`,
        time: '3 giờ trước',
        isNew: false
      });
    }
  }

  return notifications;
};

module.exports = {
  getPublicEventsService,
  getCategoriesService,
  getOrganizerEventsService,
  getEventByIdService,
  createEventService,
  updateEventService,
  uploadEventBannerService,
  deleteEventService,
  getNotificationsService,
};
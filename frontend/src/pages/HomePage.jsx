import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Calendar, MapPin, Ticket, QrCode, User, Bell, X, Check, CalendarDays, RefreshCw, Clock, Home } from 'lucide-react';
import { getPublicEvents, getNotifications } from '../services/eventService';
import { fetchCategories } from '../services/api';
import { BottomNav } from '../layouts/MainLayout';

export default function HomePage() {
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState('all');
  const [ticketStatus, setTicketStatus] = useState('all');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [sortBy, setSortBy] = useState('date_asc');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [categories, setCategories] = useState([]);
  
  // Modal states
  const [modalTopic, setModalTopic] = useState('all');
  const [modalTicket, setModalTicket] = useState('all');
  const [modalDate, setModalDate] = useState('');
  const [modalLocation, setModalLocation] = useState('');
  
  const navigate = useNavigate();
  const searchTimeout = useRef(null);

  const storedUser = localStorage.getItem('user');
  const displayUser = storedUser ? JSON.parse(storedUser) : null;
  const userName = displayUser?.ho_ten || displayUser?.name || 'Khách';
  const userInitials = userName.split(' ').map(n => n[0]).join('').slice(-2).toUpperCase();

  const fetchEvents = async (querySearch, queryTopic, queryTicket, queryDate, queryLocation, querySort, queryPage) => {
    setLoading(true);
    try {
      const params = { page: queryPage, limit: 9 };
      if (querySearch) params.keyword = querySearch;
      if (queryTopic !== 'all') params.ma_chuyen_de = queryTopic;
      if (queryTicket !== 'all') params.ticketStatus = queryTicket;
      if (queryDate) params.ngay_dien_ra = queryDate;
      if (queryLocation) params.dia_diem = queryLocation;
      if (querySort) params.sortBy = querySort;

      const res = await getPublicEvents(params);
      if (res.success) {
        if (queryPage === 1) {
          setEvents(res.data.events);
        } else {
          setEvents(prev => [...prev, ...res.data.events]);
        }
        setTotal(res.data.total);
      }
    } catch (error) {
      console.error('Lỗi tải sự kiện:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearch(value);
    setPage(1);
    
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchEvents(value, topic, ticketStatus, date, location, sortBy, 1);
    }, 500);
  };

  const handleTopicChange = (t) => {
    const newTopic = topic === t ? 'all' : t;
    setTopic(newTopic);
    setPage(1);
    fetchEvents(search, newTopic, ticketStatus, date, location, sortBy, 1);
  };

  const handleTicketStatusChange = (st) => {
    const newSt = ticketStatus === st ? 'all' : st;
    setTicketStatus(newSt);
    setPage(1);
    fetchEvents(search, topic, newSt, date, location, sortBy, 1);
  };

  const applyModalFilters = () => {
    setTopic(modalTopic);
    setTicketStatus(modalTicket);
    setDate(modalDate);
    setLocation(modalLocation);
    setShowFilterModal(false);
    setPage(1);
    fetchEvents(search, modalTopic, modalTicket, modalDate, modalLocation, sortBy, 1);
  };

  const clearModalFilters = () => {
    setModalTopic('all');
    setModalTicket('all');
    setModalDate('');
    setModalLocation('');
    
    setTopic('all');
    setTicketStatus('all');
    setDate('');
    setLocation('');
    setShowFilterModal(false);
    setPage(1);
    fetchEvents(search, 'all', 'all', '', '', sortBy, 1);
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchEvents(search, topic, ticketStatus, date, location, sortBy, nextPage);
  };

  const fetchNotifs = async () => {
    try {
      const res = await getNotifications();
      if (res.success && res.data) {
        setNotifications(res.data);
        setUnreadCount(res.data.length);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchEvents(search, topic, ticketStatus, date, location, sortBy, 1);
    fetchNotifs();
    fetchCategories().then(res => {
      if(res.success) setCategories(res.data);
    }).catch(console.error);
    // eslint-disable-next-line
  }, []);
  
  // Helper to get status pill styling
  const getTicketStatusBadge = (event) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(event.ngay_dien_ra);
    const isPast = eventDate < today || event.trang_thai_su_kien === 'DaKetThuc';

    if (isPast) return { label: 'Đã kết thúc', bg: 'bg-slate-200', text: 'text-slate-600' };
    if (event.so_ve_con_lai <= 0) return { label: 'Hết chỗ', bg: 'bg-rose-100', text: 'text-rose-600' };
    if (event.so_ve_con_lai <= event.so_luong_toi_da * 0.2) return { label: 'Sắp hết', bg: 'bg-amber-100', text: 'text-amber-700' };
    return { label: 'Còn chỗ', bg: 'bg-emerald-100', text: 'text-emerald-700' };
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans relative pb-20">
      
      {/* HEADER */}
      <div className="bg-white sticky top-0 z-10 shadow-sm border-b">
        <div className="max-w-screen-xl mx-auto">
          {/* Top Bar */}
          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-0.5">Xin chào, {userName} 👋</p>
              <h1 className="font-extrabold text-xl text-slate-900 tracking-tight">
                Khám phá sự kiện
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative cursor-pointer" onClick={() => setShowNotifications(true)}>
                <Bell size={22} className="text-slate-600" />
                {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>}
              </div>
              <div onClick={() => navigate('/profile')} className="w-9 h-9 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm cursor-pointer">
                {userInitials || '👤'}
              </div>
            </div>
          </div>
          
          {/* Search, Sort & Filter */}
          <div className="px-4 pb-3 flex flex-wrap md:flex-nowrap gap-2">
            <div className="flex-1 relative min-w-[200px]">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                value={search} 
                onChange={handleSearchChange}
                placeholder="Tìm kiếm sự kiện, diễn giả..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white shadow-sm outline-none text-sm transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" 
              />
            </div>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => {
                  const val = e.target.value;
                  setSortBy(val);
                  setPage(1);
                  fetchEvents(search, topic, ticketStatus, date, location, val, 1);
                }}
                className="px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 transition-colors outline-none cursor-pointer"
              >
                <option value="date_asc">Sắp diễn ra</option>
                <option value="date_latest">Thời gian diễn ra trễ nhất</option>
                <option value="date_earliest">Thời gian diễn ra sớm nhất</option>
                <option value="name_asc">Tên (A-Z)</option>
                <option value="name_desc">Tên (Z-A)</option>
              </select>
              <button 
                onClick={() => {
                  setModalTopic(topic);
                  setModalTicket(ticketStatus);
                  setShowFilterModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 transition-colors shrink-0"
              >
                <Filter size={16} /> Bộ lọc
              </button>
            </div>
          </div>

          {/* Quick Filter Row 1: Topics */}
          <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
            <button onClick={() => handleTopicChange('all')}
              className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${topic === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              Tất cả
            </button>
            {categories.map(c => (
              <button key={c.ma_chuyen_de} onClick={() => handleTopicChange(c.ma_chuyen_de)}
                className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors whitespace-nowrap ${topic === c.ma_chuyen_de ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {c.ten_chuyen_de}
              </button>
            ))}
          </div>

          {/* Quick Filter Row 2: Ticket Status */}
          <div className="px-4 pb-4 flex gap-2 overflow-x-auto no-scrollbar">
             {['Còn chỗ', 'Sắp hết', 'Hết chỗ'].map(st => (
               <button 
                 key={st}
                 onClick={() => handleTicketStatusChange(st)}
                 className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors border ${ticketStatus === st ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                 {st}
               </button>
             ))}
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="flex-1 max-w-screen-xl mx-auto w-full">
        
        <div className="px-4 py-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">{total} sự kiện</p>
          
          {loading && page === 1 ? (
            <div className="text-center py-10 text-slate-500">Đang tải dữ liệu...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-10 text-slate-500">Không tìm thấy sự kiện nào.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[...events].sort((a, b) => {
                if (sortBy === 'date_asc') {
                  const now = new Date();
                  now.setHours(0, 0, 0, 0);
                  const dateA = new Date(a.ngay_dien_ra);
                  const dateB = new Date(b.ngay_dien_ra);
                  const isPastA = dateA < now;
                  const isPastB = dateB < now;
                  
                  if (isPastA && !isPastB) return 1; // Sự kiện A đã qua, B chưa qua -> B lên trước
                  if (!isPastA && isPastB) return -1; // Sự kiện A chưa qua, B đã qua -> A lên trước
                  return dateA - dateB; // Nếu cùng qua hoặc cùng chưa qua thì xếp tăng dần
                }
                if (sortBy === 'date_latest' || sortBy === 'date_desc') return new Date(b.ngay_dien_ra) - new Date(a.ngay_dien_ra);
                if (sortBy === 'date_earliest') return new Date(a.ngay_dien_ra) - new Date(b.ngay_dien_ra);
                if (sortBy === 'name_asc') return (a.ten_su_kien || '').localeCompare(b.ten_su_kien || '');
                if (sortBy === 'name_desc') return (b.ten_su_kien || '').localeCompare(a.ten_su_kien || '');
                return 0;
              }).map(event => {
                const colors = ['#4f46e5', '#0891b2', '#7c3aed', '#059669', '#d97706'];
                const bgHeaderColor = colors[(event.ma_chuyen_de - 1) % colors.length] || '#4f46e5';
                const topicName = event.chuyen_de?.ten_chuyen_de || 'Chuyên đề';
                const statusBadge = getTicketStatusBadge(event);
                const isFull = event.so_ve_con_lai <= 0;

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const eventDate = new Date(event.ngay_dien_ra);
                const isPast = eventDate < today || event.trang_thai_su_kien === 'DaKetThuc';
                
                const pct = event.so_luong_toi_da > 0 
                  ? Math.round((event.so_ve_da_dat / event.so_luong_toi_da) * 100) 
                  : 100;

                return (
                  <div key={event.ma_su_kien} 
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
                    
                    {/* Image Banner */}
                    <div className="relative h-44 bg-slate-200"
                      style={{ 
                        backgroundImage: event.anh_bia ? `url('${event.anh_bia}')` : `linear-gradient(135deg, ${bgHeaderColor}dd, ${bgHeaderColor}99)`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat'
                      }}>
                      <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                        <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full shadow-sm">
                          {topicName}
                        </span>
                        <span className={`px-3 py-1 text-xs font-bold rounded-full shadow-sm ${statusBadge.bg} ${statusBadge.text}`}>
                          {statusBadge.label}
                        </span>
                        {(event.hasRegistered && !isPast) && (
                          <span className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-full shadow-sm flex items-center gap-1">
                            <Check size={12} strokeWidth={3} /> Đã đăng ký
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Content */}
                    <div className="p-4 flex-1 flex flex-col">
                      <h3 className="font-bold text-base mb-1 line-clamp-2 text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {event.ten_su_kien}
                      </h3>
                      <p className="text-xs text-slate-500 mb-3">{event.dien_gia || 'Đang cập nhật diễn giả'}</p>
                      
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
                        <Calendar size={14} className="text-slate-400" />
                        <span>{new Date(event.ngay_dien_ra).toLocaleDateString('vi-VN')} - {event.thoi_gian_bat_dau}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-4">
                        <MapPin size={14} className="text-slate-400" />
                        <span className="line-clamp-1">{event.dia_diem}{event.phong ? ` - ${event.phong}` : ''}</span>
                      </div>
                      
                      <div className="mt-auto">
                        <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                          <span>{event.so_ve_da_dat} / {event.so_luong_toi_da} chỗ đã đăng ký</span>
                          <span className={statusBadge.text}>{isPast ? 'Đã kết thúc' : (isFull ? '0 còn lại' : `${event.so_ve_con_lai} còn lại`)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
                          <div className="h-full rounded-full transition-all" 
                            style={{ 
                              width: `${Math.min(pct, 100)}%`, 
                              background: isPast ? '#94a3b8' : (isFull ? '#ef4444' : pct > 80 ? '#f59e0b' : '#4f46e5') 
                            }} 
                          />
                        </div>
                        
                        <button 
                          onClick={() => navigate(`/events/${event.ma_su_kien}`)}
                          className={`w-full py-2.5 rounded-xl text-sm font-bold transition-colors ${
                            isPast
                              ? 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'
                              : event.hasRegistered
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                : isFull 
                                  ? 'bg-slate-50 text-slate-400 cursor-not-allowed' 
                                  : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                          }`}>
                          {isPast ? 'Đã kết thúc' : (event.hasRegistered ? 'Đã đăng ký · Xem chi tiết' : (isFull ? 'Hết chỗ' : 'Xem chi tiết'))}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {events.length > 0 && events.length < total && (
            <div className="mt-8 mb-4 text-center">
              <button 
                onClick={loadMore}
                disabled={loading}
                className="px-6 py-2.5 bg-white border border-slate-200 rounded-full text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 shadow-sm transition-colors">
                {loading ? 'Đang tải thêm...' : 'Xem thêm'}
              </button>
            </div>
          )}
        </div>
      </div>



      {/* FILTER MODAL */}
      {showFilterModal && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/40 backdrop-blur-sm" onClick={() => setShowFilterModal(false)}>
          <div className="bg-white w-full rounded-t-3xl p-5 pb-8 animate-in slide-in-from-bottom" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center mb-4">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full"></div>
            </div>
            
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-extrabold text-slate-900">Bộ lọc sự kiện</h2>
              <button onClick={() => setShowFilterModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Chủ đề</h3>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setModalTopic('all')}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${modalTopic === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  Tất cả
                </button>
                {categories.map(c => (
                  <button key={c.ma_chuyen_de} onClick={() => setModalTopic(c.ma_chuyen_de)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${modalTopic === c.ma_chuyen_de ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {c.ten_chuyen_de}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Trạng thái</h3>
              <div className="flex flex-wrap gap-2">
                {['Còn chỗ', 'Sắp hết', 'Hết chỗ'].map(st => (
                  <button key={st} onClick={() => setModalTicket(st)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors border ${modalTicket === st ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                    {st}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="mb-6">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Ngày tổ chức</h3>
              <div className="relative">
                <Calendar size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type="date" value={modalDate} onChange={(e) => setModalDate(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none text-sm font-medium text-slate-600 bg-white focus:border-indigo-500" />
              </div>
            </div>
            
            <div className="mb-8">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Địa điểm</h3>
              <input type="text" value={modalLocation} onChange={(e) => setModalLocation(e.target.value)} placeholder="Nhập địa điểm..." className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none text-sm font-medium text-slate-600 bg-white focus:border-indigo-500" />
            </div>

            <div className="flex gap-3">
              <button onClick={clearModalFilters} className="px-6 py-3.5 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                Xóa bộ lọc
              </button>
              <button onClick={applyModalFilters} className="flex-1 px-6 py-3.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-sm">
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATION MODAL */}
      {showNotifications && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setShowNotifications(false)}>
          <div 
            className="absolute top-[70px] right-4 w-[380px] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-extrabold text-slate-900">Thông báo</h2>
              <div className="flex items-center gap-3">
                <button onClick={() => setUnreadCount(0)} className="text-[13px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
                  Đánh dấu tất cả đã đọc
                </button>
                <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-1.5 transition-colors">
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-5 pt-4 pb-6">
              
              {notifications.filter(n => n.isNew).length > 0 && (
                <>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4">Mới</p>
                  <div className="flex flex-col gap-5 mb-6">
                    {notifications.filter(n => n.isNew).map(notif => (
                      <div key={notif.id} className="flex gap-4 relative group cursor-pointer">
                        {notif.type === 'calendar' && (
                          <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-100 transition-colors">
                            <CalendarDays size={18} strokeWidth={2} />
                          </div>
                        )}
                        {notif.type === 'bell' && (
                          <div className="w-10 h-10 rounded-full bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0 group-hover:bg-cyan-100 transition-colors">
                            <Bell size={18} strokeWidth={2} />
                          </div>
                        )}
                        {notif.type === 'success' && (
                          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors">
                            <Check size={18} strokeWidth={2.5} />
                          </div>
                        )}

                        <div className="flex-1">
                          <h4 className="text-[13px] font-bold text-slate-800 mb-0.5">{notif.title}</h4>
                          <p className="text-[13px] font-medium text-slate-500 leading-snug mb-1.5">{notif.message}</p>
                          <p className="text-[11px] font-semibold text-slate-400">{notif.time}</p>
                        </div>
                        {unreadCount > 0 && <div className="absolute top-1.5 right-0 w-2 h-2 rounded-full bg-indigo-600"></div>}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {notifications.filter(n => !n.isNew).length > 0 && (
                <>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4">Trước đó</p>
                  <div className="flex flex-col gap-5">
                    {notifications.filter(n => !n.isNew).map(notif => (
                      <div key={notif.id} className="flex gap-4 group cursor-pointer">
                        {notif.type === 'success' && (
                          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors">
                            <Check size={18} strokeWidth={2.5} />
                          </div>
                        )}
                        {notif.type === 'update' && (
                          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors">
                            <RefreshCw size={18} strokeWidth={2} />
                          </div>
                        )}
                        {notif.type === 'warning' && (
                          <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center shrink-0 group-hover:bg-amber-100 transition-colors">
                            <Clock size={18} strokeWidth={2} />
                          </div>
                        )}

                        <div className="flex-1">
                          <h4 className="text-[13px] font-bold text-slate-800 mb-0.5">{notif.title}</h4>
                          <p className="text-[13px] font-medium text-slate-500 leading-snug mb-1.5">{notif.message}</p>
                          <p className="text-[11px] font-semibold text-slate-400">{notif.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* 5. BOTTOM NAVIGATION */}
      <BottomNav />
    </div>
  );
}
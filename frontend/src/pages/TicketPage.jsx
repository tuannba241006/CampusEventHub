import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import MainLayout from "../layouts/MainLayout";
import {
  cancelTicket,
  fetchMyTickets,
} from "../services/tickets.api";

function formatDate(event) {
  if (!event?.ngay_dien_ra) return "Chưa có thời gian";

  const date = new Date(`${event.ngay_dien_ra}T00:00:00+07:00`);
  return date.toLocaleDateString("vi-VN");
}

function isEventEnded(event) {
  if (!event) return false;
  if (event.trang_thai_su_kien === "DaKetThuc") return true;

  if (event.ngay_dien_ra) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const parts = String(event.ngay_dien_ra).split("-");
    if (parts.length === 3) {
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      const eventDate = new Date(year, month, day);

      if (eventDate < today) return true;

      if (eventDate.getTime() === today.getTime() && event.thoi_gian_ket_thuc) {
        const timeParts = String(event.thoi_gian_ket_thuc).split(":");
        if (timeParts.length >= 2) {
          const endHour = Number(timeParts[0]);
          const endMinute = Number(timeParts[1]);
          const endTime = new Date(year, month, day, endHour, endMinute, 0);
          if (now > endTime) return true;
        }
      }
    }
  }

  return false;
}

function getStatus(ticket) {
  if (ticket.trang_thai_ve === "DaCheckIn") {
    return {
      label: "Đã tham dự",
      className: "bg-green-50 text-green-600",
    };
  }

  if (ticket.trang_thai_ve === "DaHuy") {
    return {
      label: "Đã hủy",
      className: "bg-red-50 text-red-600",
    };
  }

  if (isEventEnded(ticket.su_kien)) {
    return {
      label: "Đã kết thúc",
      className: "bg-slate-100 text-slate-500",
    };
  }

  return {
    label: ticket.canShowQr ? "Còn hiệu lực" : "Chưa check-in",
    className: "bg-indigo-50 text-indigo-600",
  };
}

export default function TicketPage() {
  const [tab, setTab] = useState("upcoming");
  const [tickets, setTickets] = useState({
    upcoming: [],
    history: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showQR, setShowQR] = useState(null);
  const [ticketToCancel, setTicketToCancel] = useState(null);
  const [cancelingId, setCancelingId] = useState(null);

  async function loadTickets() {
    setLoading(true);
    setError("");

    try {
      const response = await fetchMyTickets();
      setTickets({
        upcoming: response.data?.upcoming || [],
        history: response.data?.history || [],
      });
    } catch (err) {
      setError(err.message || "Không tải được danh sách vé");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadTickets();
    });
  }, []);

  const list = useMemo(
    () => (tab === "upcoming" ? tickets.upcoming : tickets.history),
    [tab, tickets]
  );

  async function confirmCancel() {
    if (!ticketToCancel) return;

    setCancelingId(ticketToCancel.ma_dang_ky);

    try {
      await cancelTicket(ticketToCancel.ma_dang_ky);
      setTicketToCancel(null);
      await loadTickets();
    } catch (err) {
      setError(
        err.message ||
          "Không thể hủy vé. Danh sách đã được làm mới."
      );
      await loadTickets();
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <MainLayout>
      <div className="bg-white px-4 pt-6 pb-0 shadow-sm">
        <h1 className="font-bold text-xl mb-4 text-slate-900">
          Vé của tôi
        </h1>

        <div className="flex border-b border-slate-100">
          <button
            type="button"
            onClick={() => setTab("upcoming")}
            className={`flex-1 pb-3 text-sm font-semibold border-b-2 ${
              tab === "upcoming"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-400"
            }`}
          >
            Sắp diễn ra
          </button>

          <button
            type="button"
            onClick={() => setTab("history")}
            className={`flex-1 pb-3 text-sm font-semibold border-b-2 ${
              tab === "history"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-400"
            }`}
          >
            Lịch sử
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-sm text-gray-500 mt-4">
            Đang tải danh sách vé...
          </p>
        ) : list.length === 0 ? (
          <p className="text-center text-sm text-gray-500 mt-4">
            Không có vé nào trong mục này.
          </p>
        ) : (
          list.map((ticket) => {
            const status = getStatus(ticket);

            return (
              <div
                key={ticket.ma_dang_ky}
                className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100"
              >
                <div className="flex justify-between items-start gap-3 mb-2">
                  <h3 className="font-bold text-slate-900">
                    {ticket.su_kien?.ten_su_kien ||
                      "Sự kiện không còn khả dụng"}
                  </h3>

                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${status.className}`}
                  >
                    {status.label}
                  </span>
                </div>

                <p className="text-xs text-slate-500 mb-3">
                  {formatDate(ticket.su_kien)} ·{" "}
                  {ticket.su_kien?.phong
                    ? `${ticket.su_kien.phong} - `
                    : ""}
                  {ticket.su_kien?.dia_diem || "Chưa có địa điểm"}
                </p>

                <div className="flex gap-2">
                  {ticket.canShowQr && (
                    <button
                      type="button"
                      onClick={() => setShowQR(ticket)}
                      className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700"
                    >
                      Hiện mã QR
                    </button>
                  )}

                  {ticket.canCancel && (
                    <button
                      type="button"
                      onClick={() => setTicketToCancel(ticket)}
                      disabled={cancelingId === ticket.ma_dang_ky}
                      className="px-4 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-100 disabled:opacity-50"
                    >
                      {cancelingId === ticket.ma_dang_ky
                        ? "Đang hủy..."
                        : "Hủy vé"}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {showQR && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowQR(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-sm p-6 text-center"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="font-bold text-lg mb-1 text-slate-900">
              Mã QR của bạn
            </h2>

            <p className="text-xs text-slate-500 mb-6">
              {showQR.su_kien?.ten_su_kien}
            </p>

            <div className="p-4 mx-auto bg-white rounded-2xl border-2 border-slate-200 inline-block mb-4">
              <QRCodeSVG value={showQR.ma_qr_code} size={200} />
            </div>

            <p className="font-mono text-xs text-gray-400 mt-2 mb-6 break-all px-4">
              {showQR.ma_qr_code}
            </p>

            <button
              type="button"
              onClick={() => setShowQR(null)}
              className="w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-semibold hover:bg-slate-200"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {ticketToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-5">
            <h2 className="font-bold text-lg text-slate-900 mb-2">
              Hủy vé?
            </h2>

            <p className="text-sm text-slate-500 mb-5">
              Bạn đang hủy vé của sự kiện{" "}
              <span className="font-semibold text-slate-700">
                {ticketToCancel.su_kien?.ten_su_kien}
              </span>
              .
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTicketToCancel(null)}
                disabled={Boolean(cancelingId)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-semibold hover:bg-slate-200 disabled:opacity-50"
              >
                Quay lại
              </button>

              <button
                type="button"
                onClick={confirmCancel}
                disabled={Boolean(cancelingId)}
                className="flex-1 py-3 bg-red-600 text-white rounded-2xl font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {cancelingId ? "Đang hủy..." : "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}

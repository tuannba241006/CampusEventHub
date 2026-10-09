import { Html5Qrcode } from "html5-qrcode";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, CheckCircle, AlertCircle, XCircle } from "lucide-react";

import { BottomNav } from "../layouts/MainLayout";
import {
  fetchAssignedEvents,
  fetchCheckInHistory,
  scanTicket,
} from "../services/checkin.api";
import { clearAuthSession } from "../utils/authStorage";

const CAMERA_REGION_ID = "checkin-camera-reader";

function formatTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getResultStyle(result) {
  if (!result) return "border-white/10 bg-white/5 text-slate-300";
  if (result.type === "success") return "border-emerald-400/30 bg-emerald-500/15 text-emerald-100";
  if (result.type === "warning") return "border-amber-400/30 bg-amber-500/15 text-amber-100";
  return "border-red-400/30 bg-red-500/15 text-red-100";
}

function getResponsiveQrbox(viewfinderWidth, viewfinderHeight) {
  const shortestSide = Math.min(viewfinderWidth, viewfinderHeight);
  const ratio = viewfinderWidth >= 1024 ? 0.5 : viewfinderWidth >= 640 ? 0.58 : 0.72;
  const size = Math.round(Math.max(180, Math.min(shortestSide * ratio, 380)));

  return {
    width: size,
    height: size,
  };
}

export default function CheckInPage() {
  const navigate = useNavigate();
  const cameraRef = useRef(null);
  const inFlightRef = useRef(false);
  const selectedEventIdRef = useRef("");
  const lastQrRef = useRef({
    value: "",
    time: 0,
  });

  const [tab, setTab] = useState("scan");
  const [manualCode, setManualCode] = useState("");
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [history, setHistory] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scanSubmitting, setScanSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    selectedEventIdRef.current = selectedEventId;
  }, [selectedEventId]);

  function handleLogout() {
    clearAuthSession();
    navigate("/login", { replace: true });
  }

  async function loadEvents() {
    setLoadingEvents(true);
    setError("");

    try {
      const response = await fetchAssignedEvents();
      const assignedEvents = response.data || [];
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      console.log("All assigned events:", assignedEvents, "Today:", todayStr);
      const todayEvents = assignedEvents.filter(e => e.ngay_dien_ra === todayStr);
      console.log("Filtered events:", todayEvents);

      setEvents(todayEvents);
      setSelectedEventId((current) => {
        if (todayEvents.some((event) => String(event.ma_su_kien) === String(current))) {
          return current;
        }
        return todayEvents[0]?.ma_su_kien ? String(todayEvents[0].ma_su_kien) : "";
      });
    } catch (err) {
      setError(err.message || "Không tải được danh sách sự kiện");
    } finally {
      setLoadingEvents(false);
    }
  }

  async function loadHistory(eventId) {
    if (!eventId) {
      setHistory([]);
      return;
    }

    const requestEventId = String(eventId);
    setLoadingHistory(true);

    try {
      const response = await fetchCheckInHistory({
        eventId: requestEventId,
        limit: 20,
      });

      if (selectedEventIdRef.current === requestEventId) {
        setHistory(response.data?.items || []);
      }
    } catch (err) {
      if (selectedEventIdRef.current === requestEventId) {
        setError(err.message || "Không tải được lịch sử check-in");
      }
    } finally {
      if (selectedEventIdRef.current === requestEventId) {
        setLoadingHistory(false);
      }
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadEvents();
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      loadHistory(selectedEventId);
    });
  }, [selectedEventId]);

  async function stopCamera() {
    const instance = cameraRef.current;
    cameraRef.current = null;
    setCameraActive(false);
    setCameraStarting(false);

    if (!instance) return;

    try {
      const state = instance.getState?.();
      if (state === 2) {
        await instance.stop();
      }
      await instance.clear();
    } catch {
      // Camera cleanup can throw if the browser already released the stream.
    }
  }

  async function startCamera() {
    setCameraError("");

    if (!selectedEventId) {
      setCameraError("Vui lòng chọn sự kiện trước khi mở camera.");
      return;
    }

    await stopCamera();

    try {
      setCameraStarting(true);
      const cameras = await Html5Qrcode.getCameras();
      const preferredCamera =
        cameras.find((camera) => /back|rear|environment/i.test(camera.label)) ||
        cameras[0];

      if (!preferredCamera) {
        throw new Error("Không tìm thấy camera trên thiết bị.");
      }

      const instance = new Html5Qrcode(CAMERA_REGION_ID);
      cameraRef.current = instance;

      await instance.start(
        preferredCamera.id,
        {
          fps: 10,
          disableFlip: false,
          qrbox: {
            width: 320,
            height: 320,
          },
        },
        (decodedText) => {
          handleScan(decodedText, {
            source: "camera",
          });
        }
      );

      setCameraActive(true);
    } catch (err) {
      setCameraActive(false);
      setCameraError(
        err.message ||
          "Không mở được camera. Bạn vẫn có thể nhập mã thủ công."
      );
    } finally {
      setCameraStarting(false);
    }
  }

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (tab !== "scan") {
      queueMicrotask(() => {
        stopCamera();
      });
    }
  }, [tab]);

  async function handleScan(code, options = {}) {
    const qrCode = (code || manualCode).trim();
    const eventIdAtScan = selectedEventIdRef.current;

    if (!qrCode || !eventIdAtScan || inFlightRef.current) return;

    const now = Date.now();
    if (
      options.source === "camera" &&
      lastQrRef.current.value === qrCode &&
      now - lastQrRef.current.time < 2500
    ) {
      return;
    }

    lastQrRef.current = {
      value: qrCode,
      time: now,
    };
    inFlightRef.current = true;
    setScanSubmitting(true);
    setManualCode("");
    setResult(null);

    try {
      const response = await scanTicket({
        eventId: eventIdAtScan,
        qrCode,
      });

      if (selectedEventIdRef.current !== eventIdAtScan) return;

      setResult({
        type: "success",
        title: "Check-in thành công",
        message: response.data?.student?.ho_ten || "Vé hợp lệ",
        detail: response.data?.student?.mssv || "",
        time: formatTime(response.data?.checkedInAt),
      });

      await loadHistory(eventIdAtScan);
    } catch (err) {
      if (selectedEventIdRef.current !== eventIdAtScan) return;

      setResult({
        type: err.code === "ALREADY_CHECKED_IN" ? "warning" : "error",
        title:
          err.code === "ALREADY_CHECKED_IN"
            ? "Vé đã check-in"
            : "Không thể check-in",
        message:
          err.message ||
          "Chưa xác nhận được kết quả. Vui lòng thử lại.",
        detail: err.code || "",
        time: formatTime(err.details?.checkedInAt || err.data?.checkedInAt),
      });
    } finally {
      inFlightRef.current = false;
      setScanSubmitting(false);
    }
  }

  const selectedEvent = events.find(
    (event) => String(event.ma_su_kien) === String(selectedEventId)
  );

  return (
    <div className="flex flex-col min-h-screen pb-20 bg-[#0f0f1a]">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg text-white">
              Điểm danh
            </h1>
            <p className="text-xs text-slate-500">
              Campus Event Hub
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 border border-white/10 bg-white/10 hover:bg-white/15"
          >
            Thoát
          </button>
        </div>
      </div>

      <div className="flex mx-4 mb-3 p-1 rounded-xl bg-white/10">
        {["scan", "history"].map((currentTab) => (
          <button
            key={currentTab}
            type="button"
            onClick={() => setTab(currentTab)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === currentTab
                ? "bg-indigo-600 text-white"
                : "text-slate-500"
            }`}
          >
            {currentTab === "scan"
              ? "Quét mã QR"
              : `Lịch sử (${history.length})`}
          </button>
        ))}
      </div>

      <div className="px-4 mb-3">
        <p className="text-xs font-medium mb-1.5 text-slate-500">
          Sự kiện hiện tại
        </p>

        <select
          value={selectedEventId}
          onChange={(event) => {
            setSelectedEventId(event.target.value);
            setResult(null);
          }}
          disabled={loadingEvents || events.length === 0}
          className="w-full px-4 py-3 rounded-2xl text-sm font-medium outline-none bg-white/10 text-white border border-white/10"
        >
          {events.length === 0 ? (
            <option value="">
              {loadingEvents ? "Đang tải..." : "Không có sự kiện"}
            </option>
          ) : (
            events.map((event) => (
              <option
                key={event.ma_su_kien}
                value={event.ma_su_kien}
                className="bg-[#1a1a2e] text-white"
              >
                {event.ten_su_kien}
              </option>
            ))
          )}
        </select>

        {selectedEvent && (
          <p className="text-xs mt-2 text-slate-500">
            {selectedEvent.canScan
              ? "Đang trong cửa sổ check-in"
              : "Chỉ xem được lịch sử hoặc chưa đến giờ check-in"}
          </p>
        )}
      </div>

      {error && (
        <div className="mx-4 mb-3 rounded-2xl border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {tab === "scan" ? (
        <div className="px-4 space-y-4">
          <div className="mx-auto w-full max-w-2xl rounded-3xl overflow-hidden relative bg-[#090912] border border-white/10">
            <div
              id={CAMERA_REGION_ID}
              className="w-full aspect-square md:aspect-video [&_video]:!w-full [&_video]:!h-full [&_video]:!object-cover [&_canvas]:!hidden"
            />
            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-400">
                  <Camera size={24} strokeWidth={1.8} aria-hidden="true" />
                </div>
                <button
                  type="button"
                  onClick={startCamera}
                  className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090912] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!selectedEventId || cameraStarting || !selectedEvent?.canScan}
                >
                  {cameraStarting ? "Đang mở camera..." : "Mở camera"}
                </button>
                <p className="text-xs text-slate-500">
                  {cameraError ||
                    (selectedEventId
                      ? selectedEvent?.canScan
                        ? "Sử dụng camera sau để quét mã QR"
                        : "Sự kiện hiện chưa mở check-in hoặc đã kết thúc"
                      : "Vui lòng chọn sự kiện để mở camera")}
                </p>
              </div>
            )}
            {cameraActive && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-[320px] w-[320px] max-w-[80vw] rounded-3xl border-2 border-white/70 shadow-[0_0_0_999px_rgba(2,6,23,0.35)]" />
              </div>
            )}
          </div>

          {cameraActive && (
            <button
              type="button"
              onClick={stopCamera}
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
            >
              Tắt camera
            </button>
          )}

          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              handleScan();
            }}
          >
            <label
              htmlFor="manual-ticket-code"
              className="block text-xs font-medium text-slate-400"
            >
              Nhập mã vé thủ công
            </label>
            <div className="flex gap-2">
              <input
                id="manual-ticket-code"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="VD: TKT-2026-003412"
                autoComplete="off"
                disabled={!selectedEvent?.canScan}
                className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 disabled:opacity-50 disabled:cursor-not-allowed"
              />

              <button
                type="submit"
                disabled={!manualCode.trim() || !selectedEventId || scanSubmitting || !selectedEvent?.canScan}
                className="shrink-0 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0f1a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {scanSubmitting ? "Đang xác nhận..." : "Xác nhận"}
              </button>
            </div>


          </form>

          {result && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div 
                className={`w-full max-w-sm rounded-3xl border-2 p-6 text-center shadow-2xl flex flex-col items-center bg-[#151522] animate-in zoom-in-95 duration-200 ${
                  result.type === 'success' ? 'border-emerald-500/50 text-emerald-400' :
                  result.type === 'warning' ? 'border-amber-500/50 text-amber-400' :
                  'border-red-500/50 text-red-400'
                }`}
              >
                {result.type === 'success' && <CheckCircle className="w-16 h-16 mb-4 text-emerald-500 drop-shadow-md" />}
                {result.type === 'warning' && <AlertCircle className="w-16 h-16 mb-4 text-amber-500 drop-shadow-md" />}
                {result.type === 'error' && <XCircle className="w-16 h-16 mb-4 text-red-500 drop-shadow-md" />}
                
                <h3 className="text-xl font-bold mb-2 text-white">{result.title}</h3>
                <p className="text-base font-medium mb-1 opacity-90">{result.message}</p>
                
                {(result.detail || result.time) && (
                  <p className="text-sm opacity-70 mb-6">
                    {[result.detail, result.time].filter(Boolean).join(" · ")}
                  </p>
                )}
                
                <button 
                  onClick={() => setResult(null)}
                  className="mt-2 w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors font-semibold"
                >
                  Đóng
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 space-y-2">
          {loadingHistory ? (
            <p className="text-center text-sm text-slate-500 py-8">
              Đang tải lịch sử...
            </p>
          ) : history.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">
              Chưa có lượt check-in thành công.
            </p>
          ) : (
            history.map((item) => (
              <div
                key={item.ma_dang_ky}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {item.student?.ho_ten || "Không rõ sinh viên"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.student?.mssv || "—"}
                    </p>
                  </div>
                  <p className="text-xs text-slate-400 whitespace-nowrap">
                    {formatTime(item.checkedInAt)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <BottomNav dark showCheckin />
    </div>
  );
}

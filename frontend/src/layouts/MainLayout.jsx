import { NavLink } from "react-router-dom";
import {
  Home,
  Ticket,
  QrCode,
  User,
} from "lucide-react";

import {
  getStoredRole,
  setStoredRole,
  clearStoredRole,
} from "../utils/authStorage";

// Giữ các export này để tương thích với các file cũ,
// nhưng nguồn dữ liệu thật nằm tập trung trong authStorage.js.
export {
  getStoredRole,
  setStoredRole,
  clearStoredRole,
};

/**
 * Bottom navigation dùng chung cho SinhVien / NhanVienCheckIn.
 *
 * - showCheckin: nếu truyền vào thì ưu tiên giá trị prop.
 * - nếu không truyền, tự đọc app_role từ authStorage.
 * - dark: giao diện nền tối, dùng cho CheckInPage.
 */
export function BottomNav({
  showCheckin,
  dark = false,
}) {
  const isStaff =
    showCheckin !== undefined
      ? Boolean(showCheckin)
      : getStoredRole() === "NhanVienCheckIn";
  const isStudent = getStoredRole() === "SinhVien" || getStoredRole() === "NhanVienCheckIn";

  const activeCls = dark
    ? "text-indigo-400"
    : "text-indigo-600";

  const inactiveCls = dark
    ? "text-slate-500 hover:text-slate-300"
    : "text-slate-400 hover:text-slate-600";

  const cls = (isActive) =>
    `flex flex-col items-center gap-1 w-16 transition-colors ${isActive
      ? activeCls
      : inactiveCls
    }`;

  const navStyle = dark
    ? {
      background: "#0f0f1a",
      borderColor:
        "rgba(255,255,255,0.08)",
    }
    : undefined;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 border-t z-50 pb-safe ${dark
          ? ""
          : "bg-white border-slate-100 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]"
        }`}
      style={navStyle}
    >
      <div className="flex justify-around items-center h-[60px] max-w-screen-xl mx-auto px-2">
        <NavLink
          to="/home"
          end
          className={({ isActive }) =>
            cls(isActive)
          }
        >
          <Home
            size={22}
            strokeWidth={2.5}
          />
          <span className="text-[10px] font-semibold">
            Trang chủ
          </span>
        </NavLink>

        {isStudent && (
          <NavLink
            to="/tickets"
            className={({ isActive }) =>
              cls(isActive)
            }
          >
            <Ticket
              size={22}
              strokeWidth={2.5}
            />
            <span className="text-[10px] font-semibold">
              Vé của tôi
            </span>
          </NavLink>
        )}

        {isStaff && (
          <NavLink
            to="/check-in"
            className={({ isActive }) =>
              cls(isActive)
            }
          >
            <QrCode
              size={22}
              strokeWidth={2.5}
            />
            <span className="text-[10px] font-semibold">
              Điểm danh
            </span>
          </NavLink>
        )}

        <NavLink
          to="/profile"
          className={({ isActive }) =>
            cls(isActive)
          }
        >
          <User
            size={22}
            strokeWidth={2.5}
          />
          <span className="text-[10px] font-semibold">
            Hồ sơ
          </span>
        </NavLink>
      </div>
    </div>
  );
}

export default function MainLayout({
  children,
}) {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans animate-fade-in pb-20">
      <main className="flex-1 w-full max-w-screen-xl mx-auto">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}

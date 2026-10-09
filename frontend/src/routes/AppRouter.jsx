import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import ProtectedRoute from "./ProtectedRoute";

import HomePage from "../pages/HomePage";
import EventDetailPage from "../pages/EventDetailPage";
import TicketPage from "../pages/TicketPage";
import ProfilePage from "../pages/ProfilePage";
import CheckInPage from "../pages/CheckInPage";

import DashboardPage from "../pages/DashboardPage";
import EventManagementPage from "../pages/EventManagementPage";
import EventFormPage from "../pages/EventFormPage";
import ParticipantsPage from "../pages/ParticipantsPage";
import StaffPage from "../pages/StaffPage";

import LoginPage from "../pages/LoginPage";
import ForgotPasswordPage from "../pages/ForgotPasswordPage";

import TicketConfirmPage from "../pages/TicketConfirmPage";

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ==========================================
            PUBLIC AUTH ROUTES
        ========================================== */}

        <Route
          path="/login"
          element={<LoginPage />}
        />

        <Route
          path="/forgot-password"
          element={
            <ForgotPasswordPage />
          }
        />

        {/* Root */}
        <Route
          path="/"
          element={
            <Navigate
              to="/login"
              replace
            />
          }
        />

        {/* ==========================================
            STUDENT / CHECK-IN STAFF ROUTES
        ========================================== */}

        <Route
          path="/home"
          element={
            <ProtectedRoute
              allowedRoles={[
                "SinhVien",
                "NhanVienCheckIn",
              ]}
            >
              <HomePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/events/:eventId"
          element={
            <ProtectedRoute
              allowedRoles={[
                "SinhVien",
                "NhanVienCheckIn",
              ]}
            >
              <EventDetailPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/tickets"
          element={
            <ProtectedRoute
              allowedRoles={[
                "SinhVien",
                "NhanVienCheckIn",
              ]}
            >
              <TicketPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/ticket-confirm"
          element={
            <ProtectedRoute
              allowedRoles={[
                "SinhVien",
                "NhanVienCheckIn",
              ]}
            >
              <TicketConfirmPage />
            </ProtectedRoute>
          }
        />

        {/* ==========================================
            PROFILE
            Tất cả account đã login đều được xem
        ========================================== */}

        <Route
          path="/profile"
          element={
            <ProtectedRoute
              allowedRoles={[
                "SinhVien",
                "NhanVienCheckIn",
                "ToChuc",
              ]}
            >
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        {/* ==========================================
            CHECK-IN
        ========================================== */}

        <Route
          path="/check-in"
          element={
            <ProtectedRoute
              allowedRoles={[
                "NhanVienCheckIn",
                "ToChuc",
              ]}
            >
              <CheckInPage />
            </ProtectedRoute>
          }
        />

        {/* ==========================================
            ORGANIZER ROUTES
        ========================================== */}

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute
              allowedRoles={[
                "ToChuc",
              ]}
            >
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/events"
          element={
            <ProtectedRoute
              allowedRoles={[
                "ToChuc",
              ]}
            >
              <EventManagementPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/events/new"
          element={
            <ProtectedRoute
              allowedRoles={[
                "ToChuc",
              ]}
            >
              <EventFormPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/events/edit/:id"
          element={
            <ProtectedRoute
              allowedRoles={[
                "ToChuc",
              ]}
            >
              <EventFormPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/participants"
          element={
            <ProtectedRoute
              allowedRoles={[
                "ToChuc",
              ]}
            >
              <ParticipantsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/staff"
          element={
            <ProtectedRoute
              allowedRoles={[
                "ToChuc",
              ]}
            >
              <StaffPage />
            </ProtectedRoute>
          }
        />

        {/* ==========================================
            FALLBACK
        ========================================== */}

        <Route
          path="*"
          element={
            <Navigate
              to="/login"
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;

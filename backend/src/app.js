require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const supabase = require("./config/supabase");

// ==============================
// Routes
// ==============================
const eventRoutes = require("./routes/event.routes.js");
const authRoutes = require("./routes/auth.routes");
const profileRoutes = require("./routes/profile.routes");
const participantRoutes = require("./routes/participants.routes.js");
const staffRoutes = require("./routes/staff.routes.js");
const ticketRoutes = require("./routes/ticket.routes.js");
const dashboardRoutes = require("./routes/dashboard.routes.js");
const checkinRoutes = require("./routes/checkin.routes.js");

// ==============================
// Error handlers
// ==============================
const {
  notFoundHandler,
  errorHandler,
} = require("./middlewares/error.middleware");

const app = express();

// Render chạy Express phía sau reverse proxy.
// Cần trust proxy để req.ip và express-rate-limit
// đọc X-Forwarded-For chính xác.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// ==============================
// Global Middleware
// ==============================

// Security HTTP headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174", process.env.FRONTEND_URL],
    credentials: true,
  })
);

// Parse JSON body & URL-encoded body
// Hỗ trợ tải dữ liệu ảnh banner sự kiện (tối đa 10MB)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// ==============================
// Health Check
// ==============================
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Campus Event Hub API is running",
  });
});

// ==============================
// Database Health Check
// ==============================
app.get("/api/health/db", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("chuyen_de")
      .select("ma_chuyen_de, ten_chuyen_de")
      .limit(1);

    if (error) {
      throw error;
    }

    res.json({
      status: "ok",
      message: "Database connection successful",
      data,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Database connection failed",
      error: error.message,
    });
  }
});

// ==============================
// Routes
// ==============================

// Event module từ main
app.use("/api", eventRoutes);

// Auth module
app.use("/api/auth", authRoutes);

// Profile module
app.use("/api/profile", profileRoutes);

// Participants & Ticket management (Gói 7 - Phase 1)
app.use("/api", participantRoutes);

// Staff management (Gói 7 - Phase 2)
app.use("/api", staffRoutes);

// Ticket Booking (Gói 4)
app.use("/api/tickets", ticketRoutes);

// Dashboard (Thống kê)
app.use("/api", dashboardRoutes);

// Check-in Engine (Gói 5)
app.use("/api/check-in", checkinRoutes);

// ==============================
// Error Handling
// PHẢI LUÔN ĐẶT CUỐI CÙNG
// ==============================
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

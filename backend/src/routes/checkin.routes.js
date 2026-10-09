const express = require("express");
const checkinController = require("../controllers/checkin.controller.js");
const authenticate = require("../middlewares/auth.middleware.js");
const authorizeRoles = require("../middlewares/role.middleware.js");

const router = express.Router();

router.get(
  "/assigned-events",
  authenticate,
  authorizeRoles("SinhVien", "NhanVienCheckIn", "ToChuc"),
  checkinController.getAssignedEvents
);

router.post(
  "/scan",
  authenticate,
  authorizeRoles("SinhVien", "NhanVienCheckIn", "ToChuc"),
  checkinController.scan
);

router.get(
  "/history",
  authenticate,
  authorizeRoles("SinhVien", "NhanVienCheckIn", "ToChuc"),
  checkinController.getHistory
);

module.exports = router;

const express = require('express');
const router = express.Router();
const {
  sendOTP,
  verifyOTP,
  getMyProfile,
  updateProfile,
  updateSettings,
  updateOnlineStatus,
  findUsersByPhones,
  logout
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

// Public routes
router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);

// Protected routes
router.get('/me', protect, getMyProfile);
router.put('/me', protect, updateProfile);
router.patch('/me/settings', protect, updateSettings);
router.patch('/me/status', protect, updateOnlineStatus);
router.post('/find-by-phones', protect, findUsersByPhones);
router.post('/logout', protect, logout);

module.exports = router;
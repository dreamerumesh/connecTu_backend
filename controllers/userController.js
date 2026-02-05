const User = require('../models/User');
const crypto = require('crypto');
const { generateToken } = require('../middleware/authMiddleware');

// In-memory OTP storage (use Redis in production)
const otpStore = new Map();

// Send OTP via SMS using 2factor.in API
const sendOTPViaSMS = async (phone) => {
  const apiKey = process.env.TWOFACTOR_API_KEY;
  if (!apiKey) throw new Error("2Factor API key missing");

  const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;

  // ✅ USE AUTOGEN ONLY
  const url = `https://2factor.in/API/V1/${apiKey}/SMS/${formattedPhone}/AUTOGEN2`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.Status !== "Success") {
    throw new Error(data.Details || "Failed to send OTP");
  }
  console.log("OTP sent via 2factor.in:", data);

  // ✅ RETURN sessionId
  return data.Details;
};


// Verify OTP via 2factor.in API
const verifyOTPVia2Factor = async (sessionId, otp) => {
  const apiKey = process.env.TWOFACTOR_API_KEY;
  if (!apiKey) throw new Error("2Factor API key missing");

  const url = `https://2factor.in/API/V1/${apiKey}/SMS/VERIFY/${sessionId}/${otp}`;

  const response = await fetch(url);
  const data = await response.json();

  return data.Status === "Success" && data.Details === "OTP Matched";
};


/**
 * @desc    Send OTP to phone number using 2factor.in
 * @route   POST /api/users/send-otp
 * @access  Public
 */
exports.sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || !/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number"
      });
    }

    const sessionId = await sendOTPViaSMS(phone);

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      sessionId // frontend MUST store this
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/**
 * @desc    Verify OTP and login/register user using 2factor.in
 * @route   POST /api/users/verify-otp
 * @access  Public
 */
exports.verifyOTP = async (req, res) => {
  try {
    const { phone, otp, sessionId, name } = req.body;

    if (!phone || !otp || !sessionId) {
      return res.status(400).json({
        success: false,
        message: "Phone, OTP and sessionId are required"
      });
    }

    const isValid = await verifyOTPVia2Factor(sessionId, otp);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP"
      });
    }

    // ✅ OTP verified — login or register
    let user = await User.findOne({ phone });
    let isNewUser = false;

    if (!user) {
      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Name required for new users"
        });
      }

      user = await User.create({
        phone,
        name,
        status: "active"
      });

      isNewUser = true;
    } else {
      user.status = "active";
      await user.save();
    }

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: isNewUser ? "Registration successful" : "Login successful",
      isNewUser,
      token,
      user
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/**
 * @desc    Get current user profile
 * @route   GET /api/users/me
 * @access  Private
 */
exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-__v');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
};

/**
 * @desc    Update user profile (except phone number)
 * @route   PUT /api/users/me
 * @access  Private
 */
exports.updateProfile = async (req, res) => {
  try {
    const { name, profilePic, about } = req.body;

    // Prevent phone number update
    if (req.body.phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number cannot be updated'
      });
    }

    // Validate input
    const updateData = {};
    if (name !== undefined) {
      if (name.trim().length === 0 || name.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Name must be between 1 and 50 characters'
        });
      }
      updateData.name = name;
    }
    
    if (profilePic !== undefined) updateData.profilePic = profilePic;
    
    if (about !== undefined) {
      if (about.length > 139) {
        return res.status(400).json({
          success: false,
          message: 'About must be 139 characters or less'
        });
      }
      updateData.about = about;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    ).select('-__v');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

/**
 * @desc    Update user settings
 * @route   PATCH /api/users/me/settings
 * @access  Private
 */
exports.updateSettings = async (req, res) => {
  try {
    const { readReceipts } = req.body;
    if (readReceipts === undefined) {
      return res.status(400).json({
        success: false,
        message: 'At least one setting must be provided'
      });
    }

    if (typeof readReceipts !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'readReceipts must be a boolean value'
      });
    }

    const updateData = {
      'settings.readReceipts': readReceipts
    };

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    ).select('-__v');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      settings: user.settings
    });
  } catch (error) {
    console.error('Update Settings Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings'
    });
  }
};


/**
 * @desc    Logout user
 * @route   POST /api/users/logout
 * @access  Private
 */
exports.logout = async (req, res) => {
  try {
    const userId = req.user._id;

    await User.findByIdAndUpdate(userId, {
      status: "inactive"
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Logout failed"
    });
  }
};

/**
 * @desc    Update online status
 * @route   PATCH /api/users/me/status
 * @access  Private
 */
exports.updateOnlineStatus = async (req, res) => {
  try {
    const { isOnline } = req.body;

    if (isOnline === undefined) {
      return res.status(400).json({
        success: false,
        message: 'isOnline field is required'
      });
    }

    if (typeof isOnline !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isOnline must be a boolean value'
      });
    }

    const updateData = {
      isOnline,
      lastSeen: new Date()
    };

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    ).select('isOnline lastSeen');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Status updated successfully',
      isOnline: user.isOnline,
      lastSeen: user.lastSeen
    });
  } catch (error) {
    console.error('Update Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update status'
    });
  }
};

/**
 * @desc    Find users by phone numbers
 * @route   POST /api/users/find-by-phones
 * @access  Private
 */
exports.findUsersByPhones = async (req, res) => {
  try {
    const { phones } = req.body;

    if (!Array.isArray(phones)) {
      return res.status(400).json({
        success: false,
        message: 'phones must be an array'
      });
    }

    if (phones.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'phones array cannot be empty'
      });
    }

    // Limit to prevent abuse
    if (phones.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 100 phone numbers allowed per request'
      });
    }

    // Validate and filter phone numbers
    const validPhones = phones.filter(phone => 
      typeof phone === 'string' && /^[0-9]{10,15}$/.test(phone)
    );

    if (validPhones.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid phone numbers provided'
      });
    }

    const users = await User.find({
      phone: { $in: validPhones }
    }).select('phone name profilePic about isOnline lastSeen createdAt');

    res.status(200).json({
      success: true,
      count: users.length,
      requestedCount: validPhones.length,
      users
    });
  } catch (error) {
    console.error('Find Users Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to find users'
    });
  }
};

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    match: /^[0-9]{10,15}$/
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  profilePic: {
    type: String,
    default: ''
  },
  about: {
    type: String,
    default: 'Hey there!',
    maxlength: 139
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  settings: {
    readReceipts: {
      type: Boolean,
      default: true
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'banned'],
    default: 'active'
  },
  contacts: [
    {
      phone: String,
      name: String
    }
  ],
}, {
  timestamps: true
});

// Index for faster queries
userSchema.index({ isOnline: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;

const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  lastMessage: {
    text: {
      type: String,
      default: ''
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    time: {
      type: Date,
      default: Date.now
    }
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure exactly 2 participants for private chat
// chatSchema.pre('save', function(next) {
//   if (this.participants.length !== 2) {
//     return next(new Error('A private chat must have exactly 2 participants'));
//   }
//   next();
// });

// Index for faster queries
//chatSchema.index({ participants: 1 });
chatSchema.index({ updatedAt: -1 });

// Compound index to find chat between two users
//chatSchema.index({ participants: 1 }, { unique: true });

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;

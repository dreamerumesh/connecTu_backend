const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const mongoose = require('mongoose');

exports.getMyChats = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1️⃣ Fetch logged-in user's contacts
    const me = await User.findById(userId).select('contacts');

    const chats = await Chat.find({
      participants: userId
    })
      .populate('participants', 'phone profilePic isOnline lastSeen')
      .populate('lastMessage', 'text createdAt')
      .sort({ updatedAt: -1 })
      .limit(5);

    const chatList = chats.map(chat => {
      const otherUser = chat.participants.find(
        u => u._id.toString() !== userId
      );

      // 2️⃣ Find contact name if exists
      const savedContact = me.contacts.find(
        c => c.phone === otherUser.phone
      );

      return {
        chatId: chat._id,
        user: {
          _id: otherUser._id,
          phone: otherUser.phone,
          name: savedContact ? savedContact.name : otherUser.phone,
          profilePic: otherUser.profilePic,
          isOnline: otherUser.isOnline,
          lastSeen: otherUser.lastSeen
        },
        lastMessage: chat.lastMessage?.text || null,
        lastMessageTime: chat.lastMessage?.createdAt || null
      };
    });

    res.status(200).json({
      success: true,
      chats: chatList
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};


exports.getChatMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;

    // Check chat exists & user is participant
    const chat = await Chat.findOne({
      _id: chatId,
      participants: userId
    });

    if (!chat) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const messages = await Message.find({ chatId })
      .sort({ 'timestamps.sentAt': 1 });

    res.status(200).json({
      success: true,
      messages
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.sendMessage = async (req, res, next) => {
  try {
    const senderId = req.user.id;
    const { receiverPhone, content, type = 'text' } = req.body;

    if (!receiverPhone || !content) {
      return res.status(400).json({
        success: false,
        message: 'receiverPhone and content required'
      });
    }

    // 1️⃣ Find receiver by phone number
    const receiverUser = await User.findOne({ phone: receiverPhone });

    if (!receiverUser) {
      return res.status(404).json({
        success: false,
        message: 'No connecTu user found with this phone number'
      });
    }

    const receiverId = receiverUser._id;

    // Prevent sending message to self
    if (senderId.toString() === receiverId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot message yourself'
      });
    }

    // 2️⃣ Find or create chat
    let chat = await Chat.findOne({
      participants: { $all: [senderId, receiverId] }
    });

    if (!chat) {
      chat = await Chat.create({
        participants: [senderId, receiverId].sort()
      });
    }

    // 3️⃣ Create message
    const message = await Message.create({
      chatId: chat._id,
      sender: senderId,
      receiver: receiverId,
      content,
      type
    });

    // 4️⃣ Update last message
    chat.lastMessage = {
      text: content,
      sender: senderId,
      time: new Date()
    };
    chat.updatedAt = new Date();
    await chat.save();

    const io = req.app.get("io"); // socket.io emit
    if (io) { // socket.io emit
      io.to(chat._id.toString()).emit("receive-message", message); // socket.io emit
      console.log("Emitted to chat:", chat._id.toString()); // socket.io emit
    } // socket.io emit

    res.status(201).json({
      success: true,
      message
    });
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.editMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId, newContent } = req.body;

    if (!messageId || !newContent) {
      return res.status(400).json({
        success: false,
        message: 'messageId and newContent are required'
      });
    }

    // 1️⃣ Find message
    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // 2️⃣ Check sender permission
    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to edit this message'
      });
    }

    // 3️⃣ Update message
    message.content = newContent;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    // 4️⃣ Update chat lastMessage if needed
    const chat = await Chat.findById(message.chatId);

    if (
      chat &&
      chat.lastMessage &&
      chat.lastMessage.time.getTime() === message.createdAt.getTime()
    ) {
      chat.lastMessage.text = newContent;
      chat.lastMessage.time = new Date();
      await chat.save();
    }

    res.status(200).json({
      success: true,
      message
    });
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.createChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'name and phone are required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const receiver = await User.findOne({ phone });
    // 4️⃣ Check if chat already exists
    const existingChat = await Chat.findOne({
      participants: { $all: [userId, receiver._id] }
    });

    if (existingChat) {
      return res.status(200).json({
        success: true,
        chat: existingChat
      });
    }

    // 1️⃣ Check if contact already exists
    const existingContact = user.contacts.find(
      c => c.phone === phone
    );

    if (existingContact) {
      return res.status(400).json({
        success: false,
        message: `This contact is already saved as "${existingContact.name}"`
      });
    }

    // 2️⃣ Check receiver exists in app
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: 'This phone number is not registered on ConnecTu'
      });
    }

    // 3️⃣ Save contact to user
    user.contacts.push({ name, phone });
    await user.save();


    // 5️⃣ Create empty chat
    const chat = await Chat.create({
      participants: [userId, receiver._id]
    });

    res.status(201).json({
      success: true,
      chat
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Failed to create chat'
    });
  }
};

exports.getContacts = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('contacts');

    res.status(200).json({
      success: true,
      contacts: user.contacts
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contacts'
    });
  }
};





const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const mongoose = require('mongoose');

exports.getMyChats = async (req, res) => {
  try {
    const userId = req.user.id;

    const me = await User.findById(userId).select('contacts');

    const chats = await Chat.find({
      participants: userId
    })
      .populate('participants', 'phone profilePic isOnline lastSeen')
      .sort({ updatedAt: -1 });

    const chatList = await Promise.all(
      chats.map(async (chat) => {

        const otherUser = chat.participants.find(
          u => u._id.toString() !== userId
        );

        const savedContact = me.contacts.find(
          c => c.phone === otherUser.phone
        );

        // 🔥 Get clear timestamp
        const clearInfo = chat.clearedBy?.find(
          c => c.user.toString() === userId
        );

        let messageFilter = {
          chatId: chat._id,
          $and: [
            { isDeletedForEveryone: { $ne: true } },
            { deletedFor: { $nin: [userId] } }
          ]
        };

        if (clearInfo) {
          messageFilter.createdAt = { $gt: clearInfo.clearedAt };
        }

        const lastMessage = await Message.findOne(messageFilter)
          .sort({ createdAt: -1 });

        // 🔥 Count unread messages
        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          receiver: userId,
          status: { $ne: "read" },
          createdAt: messageFilter.createdAt || { $exists: true }, // Respect clear chat filter
          $and: [
            { isDeletedForEveryone: { $ne: true } },
            { deletedFor: { $nin: [userId] } }
          ]
        });

        // console.log("Last message for chat", chat._id, ":", lastMessage);
        return {
          chatId: chat._id,
          user: {
            _id: otherUser._id,
            phone: otherUser.phone,
            name: savedContact
              ? savedContact.name
              : otherUser.phone,
            profilePic: otherUser.profilePic,
            isOnline: otherUser.isOnline,
            lastSeen: otherUser.lastSeen
          },
          lastMessage: lastMessage?.content || null,
          lastMessageTime: lastMessage?.createdAt || null,
          unreadCount: unreadCount || 0
        };
      })
    );

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

    // 1️⃣ Check chat exists & user is participant
    const chat = await Chat.findOne({
      _id: chatId,
      participants: userId
    });

    if (!chat) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    // 2️⃣ Find if user cleared this chat
    const clearEntry = chat.clearedBy.find(
      c => c.user.toString() === userId
    );

    let filter = {
      chatId,
      isDeletedForEveryone: false,
      deletedFor: { $ne: userId }
    };

    // 3️⃣ If chat was cleared → show only new messages
    if (clearEntry) {
      filter.createdAt = { $gt: clearEntry.clearedAt };
    }

    const messages = await Message.find(filter)
      .sort({ createdAt: 1 });

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

    // Check if it is the most recent message
    const lastMsg = await Message.findOne({ chatId: message.chatId, isDeletedForEveryone: false }).sort({ createdAt: -1 });

    const isLastMessage = lastMsg && lastMsg._id.toString() === messageId;

    if (isLastMessage) {
      chat.lastMessage = {
        text: newContent,
        sender: userId,
        time: message.createdAt // keep original time
      };
      await chat.save();
    }

    // 5️⃣ Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.to(message.chatId.toString()).emit("message-updated", {
        messageId: message._id,
        chatId: message.chatId,
        newContent: newContent,
        isEdited: true,
        isLastMessage: isLastMessage // 🆕 Flag for frontend to update chat list
      });
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
    const { name, phone, isNewContact } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone is required'
      });
    }

    // 1️⃣ Logged-in user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // 2️⃣ Find receiver
    const receiver = await User.findOne({ phone });
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: 'This phone number is not registered on ConnecTu'
      });
    }

    // 3️⃣ Check existing chat
    let chat = await Chat.findOne({
      participants: { $all: [userId, receiver._id] }
    });

    // 4️⃣ Contact handling
    const existingContact = user.contacts.find(c => c.phone === phone);

    if (isNewContact) {
      if (existingContact) {
        return res.status(400).json({
          success: false,
          message: `This contact is already saved as "${existingContact.name}"`
        });
      }

      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'Name is required for new contact'
        });
      }

      user.contacts.push({ name, phone });
      await user.save();
    }

    // ===============================
    // CHAT HANDLING
    // ===============================

    // Create if not exists
    if (!chat) {
      chat = await Chat.create({
        participants: [userId, receiver._id]
      });
    }

    // Populate participants (same as getMyChats)
    chat = await Chat.findById(chat._id)
      .populate('participants', 'phone profilePic isOnline lastSeen');

    const me = await User.findById(userId).select('contacts');

    const otherUser = chat.participants.find(
      u => u._id.toString() !== userId
    );

    const savedContact = me.contacts.find(
      c => c.phone === otherUser.phone
    );

    // Get last message (same filter logic as getMyChats)
    const clearInfo = chat.clearedBy?.find(
      c => c.user.toString() === userId
    );

    let messageFilter = {
      chatId: chat._id,
      $and: [
        { isDeletedForEveryone: { $ne: true } },
        { deletedFor: { $nin: [userId] } }
      ]
    };

    if (clearInfo) {
      messageFilter.createdAt = { $gt: clearInfo.clearedAt };
    }

    const lastMessage = await Message.findOne(messageFilter)
      .sort({ createdAt: -1 });

    // Final response (same structure as getMyChats)
    const chatData = {
      chatId: chat._id,
      user: {
        _id: otherUser._id,
        phone: otherUser.phone,
        name: savedContact
          ? savedContact.name
          : otherUser.phone,
        profilePic: otherUser.profilePic,
        isOnline: otherUser.isOnline,
        lastSeen: otherUser.lastSeen
      },
      lastMessage: lastMessage?.content || null,
      lastMessageTime: lastMessage?.createdAt || null
    };

    return res.status(200).json({
      success: true,
      chat: chatData
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Failed to create or fetch chat'
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

exports.deleteMessageForMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.body;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found"
      });
    }

    // Add userId to deletedFor array
    await Message.findByIdAndUpdate(
      messageId,
      { $addToSet: { deletedFor: userId } }
    );

    res.status(200).json({
      success: true,
      message: "Message deleted for you"
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.deleteMessageForEveryone = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.body;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found"
      });
    }

    // Allow only sender to delete for everyone
    if (message.sender.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized"
      });
    }

    message.isDeletedForEveryone = true;
    message.content = "This message was deleted";
    await message.save();

    const io = req.app.get("io"); // socket.io emit
    if (io) { // socket.io emit
      io.to(message.chatId.toString()).emit("message-deleted-for-everyone", {
        messageId: message._id,
        chatId: message.chatId
      });
    }

    res.status(200).json({
      success: true,
      message: "Message deleted for everyone"
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.clearChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.body;
    //console.log("body in clearChat:", req.body);
    //console.log("chatId in clearChat:", chatId);

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found"
      });
    }

    // Remove old clear entry if exists
    chat.clearedBy = chat.clearedBy.filter(
      c => c.user.toString() !== userId
    );

    // Add new clear timestamp
    chat.clearedBy.push({
      user: userId,
      clearedAt: new Date()
    });

    await chat.save();

    res.status(200).json({
      success: true,
      message: "Chat cleared successfully"
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};





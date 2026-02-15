const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Chat = require("./models/Chat");
const Message = require("./models/Message");

dotenv.config();

const app = require("./app");
const connectDB = require("./models/db");
const http = require("http"); // socket.io server
const { Server } = require("socket.io"); // socket.io server

connectDB();

const PORT = process.env.PORT || 5000;

const server = http.createServer(app); // socket.io server
// const io = new Server(server, { // socket.io server
//   cors: { origin: "*", methods: ["GET", "POST"] }, // socket.io server
// }); // socket.io server
// app.set("io", io); // socket.io server

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true
  },
});

app.set("io", io);


async function getUserChatIds(userId) {
  const chats = await Chat.find(
    { participants: userId },
    { _id: 1 } // only fetch _id
  ).lean();

  return chats.map(chat => chat._id.toString());
}

io.on("connection", async (socket) => {
  console.log("New client connected:", socket.id);

  const token = socket.handshake.auth?.token;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id || decoded._id;

      console.log("Socket User ID:", socket.userId);

      if (socket.userId) {
        // 🟢 mark user online
        await User.findByIdAndUpdate(socket.userId, {
          isOnline: true,
        });

        // 🔔 notify ALL clients (frontend listens to this)
        io.emit("user-status", {
          userId: socket.userId,
          isOnline: true,
        });
      }
    } catch (err) {
      console.error("Socket auth error:", err.message);
    }
  }

  try {
    const userId = socket.userId;

    const chatIds = await getUserChatIds(userId);

    chatIds.forEach((chatId) => {
      socket.join(chatId);
    });

    //console.log("🟢 User", userId, "joined chats:", chatIds);
  } catch (err) {
    console.error("❌ Error joining chat rooms:", err);
  }

  // 🤝 JOIN CHAT - Handled when frontend explicitly joins
  socket.on("join-chat", (chatId) => {
    if (chatId && socket.userId) {
      socket.join(chatId);
      // console.log("User", socket.userId, "joined chat", chatId);
    }
  });


  // ⌨️ TYPING START - broadcast to chat room
  socket.on("typing-start", (chatId) => {
    if (chatId && socket.userId) {
      socket.to(chatId).emit("user-typing", {
        userId: socket.userId,
        chatId: chatId,
      });
      console.log("User", socket.userId, "is typing in chat", chatId);
    }
  });

  // ⌨️ TYPING STOP - broadcast to chat room
  socket.on("typing-stop", (chatId) => {
    if (chatId && socket.userId) {
      socket.to(chatId).emit("user-typing-stop", {
        userId: socket.userId,
        chatId: chatId,
      });
      console.log("User", socket.userId, "stopped typing in chat", chatId);
    }
  });

  // 📨 MESSAGE DELIVERED - update status & notify sender
  socket.on("message_delivered", async ({ messageId, chatId }) => {
    try {
      if (!messageId || !chatId) return;

      const message = await Message.findByIdAndUpdate(
        messageId,
        {
          status: "delivered",
          "timestamps.deliveredAt": new Date(),
        },
        { new: true }
      );

      if (message) {
        // Find the sender socket to notify them
        socket.to(chatId).emit("message_delivered", {
          messageId: message._id,
          chatId: message.chatId,
          status: "delivered",
        });
        console.log("Message", messageId, "marked as delivered");
      }
    } catch (err) {
      console.error("Error updating message delivery status:", err);
    }
  });

  // 📖 MESSAGES READ - update status & notify sender
  socket.on("mark_messages_read", async ({ chatId }) => {
    try {
      if (!chatId || !socket.userId) return;

      // Update all messages in this chat where:
      // 1. Receiver is current user
      // 2. Status is NOT read
      await Message.updateMany(
        {
          chatId: chatId,
          receiver: socket.userId,
          status: { $ne: "read" },
        },
        {
          $set: {
            status: "read",
            "timestamps.readAt": new Date(),
          },
        }
      );

      // Notify the sender(s) in the chat that messages were read
      socket.to(chatId).emit("messages_read", {
        chatId,
        readBy: socket.userId,
      });
      console.log("Messages in chat", chatId, "marked as read by", socket.userId);
    } catch (err) {
      console.error("Error marking messages as read:", err);
    }
  });

  // 🔴 mark offline + update lastSeen
  socket.on("disconnect", async () => {
    console.log("User disconnected:", socket.userId);

    if (socket.userId) {
      const lastSeen = new Date();

      await User.findByIdAndUpdate(socket.userId, {
        isOnline: false,
        lastSeen,
      });

      // 🔔 notify ALL clients (frontend updates instantly)
      io.emit("user-status", {
        userId: socket.userId,
        isOnline: false,
        lastSeen,
      });
    }
  });
});


// 🔥 attach io here (NOT in app.js)
app.use((req, res, next) => {
  req.io = io;
  next();
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

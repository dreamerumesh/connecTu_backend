const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Chat = require("./models/Chat");

dotenv.config();

const app = require("./app");
const connectDB = require("./models/db");
const http = require("http"); // socket.io server
const { Server } = require("socket.io"); // socket.io server

connectDB();

const PORT = process.env.PORT || 5000;

const server = http.createServer(app); // socket.io server
const io = new Server(server, { // socket.io server
  cors: { origin: "*", methods: ["GET", "POST"] }, // socket.io server
}); // socket.io server
app.set("io", io); // socket.io server

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

  // 🏠 join chat room
  // socket.on("join-chat", (chatId) => {
  //   if (chatId) {
  //     socket.join(chatId);
  //     console.log("Socket", socket.id, "joined room", chatId);
  //   }
  // });

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

const dotenv = require("dotenv");
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

io.on("connection", (socket) => { // socket.io server
  console.log("New client connected:", socket.id); // socket.io server
  socket.on("join-chat", (chatId) => { // socket.io server
     console.log("Socket", socket.id, "joined room", chatId);
    if (chatId) socket.join(chatId); // socket.io server
  }); // socket.io server
  console.log("socket",socket.handshake.auth.token); // socket.io server
}); // socket.io server

// 🔥 attach io here (NOT in app.js)
app.use((req, res, next) => {
  req.io = io;
  next();
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const express = require("express");
const cors = require("cors");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

// Routes
app.use("/api/users", require("./routes/user.routes"));
app.use("/api/chats", require("./routes/chat.routes"));
// Default route
app.get("/", (req, res) => {
  res.send("API is running...");
});

module.exports = app;

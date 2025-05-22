const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 1212;
let players = {};

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Serve files from the public folder
app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Initialize new player
  players[socket.id] = {
    id: socket.id,
    x: 10,
    y: 10,
    width: 20,
    height: 20,
    color: "red",
    speed: 10,
    bullets: [],
    alive: true,
  };

  // Send player move
  socket.on("playerMove", (playerData) => {
    if (players[socket.id]) {
      players[socket.id] = { ...players[socket.id], ...playerData };
      socket.broadcast.emit("playerMove", players[socket.id]);
    }
  });

  // Receive and broadcast bullet
  socket.on("bulletFired", (bulletData) => {
    if (players[socket.id]) {
      const bullet = {
        ...bulletData,
        playerId: socket.id,
      };
      players[socket.id].bullets.push(bullet);
      socket.broadcast.emit("bulletFired", bullet);
    }
  });

  // New: Player killed event
  socket.on("playerKilled", (killedId) => {
    if (players[killedId]) {
      players[killedId].alive = false;
      io.emit("playerKilled", killedId); // Notify all clients
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    socket.broadcast.emit("playerDisconnected", socket.id);
  });
});

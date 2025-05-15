const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let hostSocketId = null;
let currentVolume = 1;
let currentStation = "https://naxidigital-house128ssl.streaming.rs:8002/;stream.nsv";
let users = {};

function broadcastUserList() {
  io.emit("user-list", {
    users: Object.values(users),
    hostId: hostSocketId
  });
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Track users with random names for now
  users[socket.id] = { id: socket.id, name: `User-${socket.id.slice(0, 4)}` };

  // Auto-assign host if none
  if (!hostSocketId) {
    hostSocketId = socket.id;
    socket.emit("set-as-host");
  }

  // Initial state sync
  socket.emit("volume-sync", currentVolume);
  socket.emit("station-sync", currentStation);

  broadcastUserList();

  // Manual host transfer request
  socket.on("request-host", () => {
    if (!hostSocketId) {
      hostSocketId = socket.id;
      socket.emit("set-as-host");
      broadcastUserList();
    } else {
      io.to(hostSocketId).emit("host-request", socket.id);
    }
  });

  socket.on("add-custom-station", (station) => {
    socket.broadcast.emit("add-custom-station", station);
  });
  

  socket.on("approve-host-transfer", (newHostId) => {
    if (socket.id === hostSocketId && users[newHostId] && newHostId !== hostSocketId) {
      hostSocketId = newHostId;
      io.to(newHostId).emit("set-as-host");
      io.to(newHostId).emit("volume-sync", currentVolume);
      io.to(newHostId).emit("station-sync", currentStation);
      broadcastUserList();
    }
  });  

  socket.on("radio-control", ({ action, value }) => {
    if (action === "volume") currentVolume = value;
    if (action === "station") currentStation = value;

    socket.broadcast.emit("radio-control", { action, value });
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    delete users[socket.id];

    // If host disconnected, reassign automatically
    if (socket.id === hostSocketId) {
      hostSocketId = null;
      const next = Object.keys(users)[0];
      if (next) {
        hostSocketId = next;
        io.to(next).emit("set-as-host");
      }
    }

    broadcastUserList();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

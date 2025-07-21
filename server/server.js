const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// In-memory logs: { userId: [log, log, log] }
const userLogs = {};

// Store live websocket clients
const clients = new Map(); // ws => userId

// Receive logs from clients (via POST)
app.post("/api/log", (req, res) => {
  const { userId, message, timestamp } = req.body;
  if (!userId || !message) return res.status(400).send("Missing data");

  const log = { userId, message, timestamp: timestamp || new Date().toISOString() };

  if (!userLogs[userId]) userLogs[userId] = [];
  userLogs[userId].push(log);

  // Push live log to WebSocket clients subscribed to this user
  for (const [ws, id] of clients.entries()) {
    if (id === userId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(log));
    }
  }

  res.sendStatus(200);
});

// Polling (GET) — return all logs for user
app.get("/api/logs/:userId", (req, res) => {
  const logs = userLogs[req.params.userId] || [];
  res.json(logs);
});

// WebSocket: clients send { type: 'subscribe', userId }
wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    try {
      const { type, userId } = JSON.parse(msg);
      if (type === "subscribe" && userId) {
        clients.set(ws, userId);
      }
    } catch (err) {
      console.error("Invalid message:", msg);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
  });
});

server.listen(3001, () => {
  console.log("Log server running on http://localhost:3001");
});

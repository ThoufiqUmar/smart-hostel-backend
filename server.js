// ============================================================
//  Smart Hostel Microgrid Control System
//  Cloud Backend — Node.js + Express + Socket.io
//  GCE Erode — Final Year Project 2026
// ============================================================

const express    = require("express");
const cors       = require("cors");
const bodyParser = require("body-parser");
const http       = require("http");
const { Server } = require("socket.io");

// ── APP SETUP ────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(bodyParser.json());

// ── CONSTANTS ────────────────────────────────────────────────
const TOTAL_ROOMS    = 30;
const LOAD_HISTORY   = 20;   // rolling window for prediction

// ── SYSTEM STATE ─────────────────────────────────────────────
// Single source of truth — broadcast to all dashboards on change

// Store latest admin control commands _________________________
let adminCommands = {};

const systemState = {
  solar:      3.0,
  battery:    50,
  grid:       1,
  hostelLoad: 0,
  prediction: 0,
  rooms: Array.from({ length: TOTAL_ROOMS }, (_, i) => ({
    id:     i + 1,
    irms:   0,
    pf:     1,
    thd:    0,
    supply: true,
    device: "Normal",
    floor:  Math.floor(i / 10) + 1,
  })),
};

// Circular buffer for AI load prediction
const loadHistory = new Array(LOAD_HISTORY).fill(0);
let   historyHead = 0;

// ── HELPERS ──────────────────────────────────────────────────

// O(1) — update rolling load history and return average
function updatePrediction(currentLoad) {
  loadHistory[historyHead] = currentLoad;
  historyHead = (historyHead + 1) % LOAD_HISTORY;
  const avg = loadHistory.reduce((a, b) => a + b, 0) / LOAD_HISTORY;
  return parseFloat(avg.toFixed(2));
}

// O(TOTAL_ROOMS) — recalculate total hostel load
function recalcLoad() {
  const total = systemState.rooms.reduce((sum, r) => {
    return r.supply ? sum + (230 * r.irms * r.pf) / 1000 : sum;
  }, 0);
  return parseFloat(total.toFixed(2));
}

// Validate room index
function validRoom(id) {
  return Number.isInteger(id) && id >= 1 && id <= TOTAL_ROOMS;
}

// ── ROUTES ───────────────────────────────────────────────────

// POST /update — ESP32 sends full system snapshot
// Accepts: { rooms: [...], solar, battery, grid, load, prediction }
app.post("/update", (req, res) => {
  const data = req.body;

  // Update all 30 rooms if array provided (full snapshot from ESP32)
  if (Array.isArray(data.rooms)) {
    data.rooms.forEach((r) => {
      if (!validRoom(r.id)) return;
      const idx = r.id - 1;
      Object.assign(systemState.rooms[idx], {
        irms:   r.irms   ?? systemState.rooms[idx].irms,
        pf:     r.pf     ?? systemState.rooms[idx].pf,
        thd:    r.thd    ?? systemState.rooms[idx].thd,
        supply: r.supply ?? systemState.rooms[idx].supply,
        device: r.device ?? systemState.rooms[idx].device,
      });
    });
  }

  // Update energy values
  if (data.solar      !== undefined) systemState.solar      = data.solar;
  if (data.battery    !== undefined) systemState.battery    = data.battery;
  if (data.grid       !== undefined) systemState.grid       = data.grid;
  if (data.prediction !== undefined) systemState.prediction = data.prediction;

  systemState.hostelLoad = recalcLoad();
  systemState.prediction = updatePrediction(systemState.hostelLoad);

  io.emit("roomUpdate", systemState);
  return res.json({ status: "ok" });
});

// GET /status — dashboard initial fetch
app.get("/status", (req, res) => res.json(systemState));

// POST /admin/room/:id — manual override (cut or restore)
// Body: { supply: true | false }
app.post("/admin/room/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!validRoom(id)) {
    return res.status(400).json({ error: "Invalid room ID" });
  }

  const { supply } = req.body;
  if (typeof supply !== "boolean") {
    return res.status(400).json({ error: "supply must be boolean" });
  }

  systemState.rooms[id - 1].supply = supply;
  adminCommands[id] = supply;
  systemState.hostelLoad = recalcLoad();

  io.emit("roomUpdate", systemState);
  console.log(`[ADMIN] Room ${id} → ${supply ? "RESTORED" : "CUT"}`);
  return res.json({ status: "ok", room: id, supply });
});

// COMMANDS from Dashboard

app.get("/commands", (req, res) => {
  const commands = {};

  systemState.rooms.forEach((room) => {
    commands[room.id] = room.supply;
  });

  res.json(commands);
});

// POST /admin/grid — toggle grid availability
app.post("/admin/grid", (req, res) => {
  const { grid } = req.body;
  if (typeof grid !== "boolean") {
    return res.status(400).json({ error: "grid must be boolean" });
  }
  systemState.grid = grid ? 1 : 0;
  io.emit("roomUpdate", systemState);
  return res.json({ status: "ok", grid: systemState.grid });
});

// ── WEBSOCKET ────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[WS] Dashboard connected — ${socket.id}`);

  // Send current state immediately on connect
  socket.emit("roomUpdate", systemState);

  socket.on("disconnect", () => {
    console.log(`[WS] Dashboard disconnected — ${socket.id}`);
  });
});

// ── START ────────────────────────────────────────────────────
const PORT = 5000;
server.listen(PORT,  "0.0.0.0",() => {
  console.log(`[SERVER] SHMC Backend running on port ${PORT}`);
});


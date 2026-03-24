import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "dayboard.json");
const CONFIG_DIR = path.join(__dirname, "config");
const PUSHOVER_CONFIG_FILE = path.join(CONFIG_DIR, "pushover.local.json");
const REMINDER_CHECK_MS = 30 * 1000;

let reminderLoopRunning = false;
let lastPushoverWarning = "";

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Something went wrong on the server." });
  }
}).listen(PORT, HOST, () => {
  console.log(`akist running on http://localhost:${PORT}`);

  const lanAddress = getLanAddress();
  if (lanAddress) {
    console.log(`Available on your network at http://${lanAddress}:${PORT}`);
  }

  void processDueReminders();
  setInterval(() => {
    void processDueReminders();
  }, REMINDER_CHECK_MS);
});

async function handleApi(req, res, url) {
  const db = await readDatabase();

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    sendJson(res, 200, {
      appName: "akist",
      version: "0.1.0",
      lanAddress: getLanAddress(),
      todayKey: getTodayKey(),
      notificationsReady: await isPushoverReady(),
      data: db,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    const body = await readBody(req);
    const task = normalizeTask(body);
    db.tasks.unshift(task);
    await writeDatabase(db);
    sendJson(res, 201, { task });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/tasks/bulk") {
    const body = await readBody(req);
    db.tasks = Array.isArray(body.tasks) ? body.tasks.map(normalizeTask) : db.tasks;
    await writeDatabase(db);
    sendJson(res, 200, { tasks: db.tasks });
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/tasks/")) {
    const taskId = url.pathname.split("/").pop();
    const body = await readBody(req);
    const task = db.tasks.find((item) => item.id === taskId);

    if (!task) {
      sendJson(res, 404, { error: "Task not found." });
      return;
    }

    Object.assign(task, sanitizeTaskPatch(body));
    applyReminderState(task);
    if (body.done === true) {
      task.completedAt = new Date().toISOString();
    }
    if (body.done === false) {
      task.completedAt = null;
    }

    await writeDatabase(db);
    sendJson(res, 200, { task });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/tasks/")) {
    const taskId = url.pathname.split("/").pop();
    db.tasks = db.tasks.filter((item) => item.id !== taskId);
    await writeDatabase(db);
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/notes/")) {
    const dayKey = url.pathname.split("/").pop();
    const body = await readBody(req);
    db.dailyNotes[dayKey] = {
      intention: String(body.intention || ""),
      reflection: String(body.reflection || ""),
    };
    await writeDatabase(db);
    sendJson(res, 200, { notes: db.dailyNotes[dayKey] });
    return;
  }

  sendJson(res, 404, { error: "Route not found." });
}

async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(file);
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function readDatabase() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.map(normalizeTask) : starterTasks(),
      dailyNotes: isPlainObject(parsed.dailyNotes) ? parsed.dailyNotes : {},
    };
  } catch {
    const fresh = {
      tasks: starterTasks(),
      dailyNotes: {},
    };
    await writeDatabase(fresh);
    return fresh;
  }
}

async function writeDatabase(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2));
}

function starterTasks() {
  return [];
}

function normalizeTask(input) {
  const reminderFields = normalizeReminderFields(input);
  const task = {
    id: String(input.id || randomUUID()),
    title: String(input.title || "").trim(),
    dueDate: sanitizeDueDate(input.dueDate),
    pinned: Boolean(input.pinned),
    reminderType: reminderFields.reminderType,
    reminderDaysBefore: reminderFields.reminderDaysBefore,
    reminderDate: reminderFields.reminderDate,
    reminderTime: reminderFields.reminderTime,
    reminderAt: input.reminderAt || null,
    reminderSentAt: input.reminderSentAt || null,
    done: Boolean(input.done),
    createdAt: input.createdAt || new Date().toISOString(),
    completedAt: input.completedAt || null,
    dayKey: input.dayKey || getTodayKey(),
  };
  return applyReminderState(task);
}

function sanitizeTaskPatch(input) {
  return {
    ...(input.title !== undefined ? { title: String(input.title).trim() } : {}),
    ...(input.dueDate !== undefined ? { dueDate: sanitizeDueDate(input.dueDate) } : {}),
    ...(input.pinned !== undefined ? { pinned: Boolean(input.pinned) } : {}),
    ...sanitizeReminderPatch(input),
    ...(input.done !== undefined ? { done: Boolean(input.done) } : {}),
    ...(input.dayKey !== undefined ? { dayKey: String(input.dayKey) } : {}),
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });

  if (statusCode === 204) {
    res.end();
    return;
  }

  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLanAddress() {
  const networks = networkInterfaces();
  const candidates = [];

  for (const [name, entries] of Object.entries(networks)) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal) {
        continue;
      }

      candidates.push({
        address: entry.address,
        score: scoreLanCandidate(name, entry.address),
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].address;
}

function scoreLanCandidate(interfaceName, address) {
  const name = String(interfaceName || "").toLowerCase();
  let score = 0;

  if (name.includes("wi-fi") || name.includes("wifi") || name.includes("wlan") || name.includes("wireless")) {
    score += 60;
  }

  if (name.includes("ethernet") || /^eth\d+$/i.test(name)) {
    score += 30;
  }

  if (
    name.includes("wsl") ||
    name.includes("hyper-v") ||
    name.includes("vethernet") ||
    name.includes("virtual") ||
    name.includes("vmware") ||
    name.includes("docker")
  ) {
    score -= 80;
  }

  if (address.startsWith("192.168.")) {
    score += 20;
  } else if (address.startsWith("10.")) {
    score += 15;
  } else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) {
    score += 5;
  } else if (address.startsWith("169.254.")) {
    score -= 40;
  }

  return score;
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeDueDate(value) {
  if (!value) {
    return null;
  }

  const stringValue = String(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(stringValue) ? stringValue : null;
}

function normalizeReminderFields(input) {
  if (
    input.reminderType !== undefined ||
    input.reminderDaysBefore !== undefined ||
    input.reminderDate !== undefined ||
    input.reminderTime !== undefined
  ) {
    return {
      reminderType: sanitizeReminderType(input.reminderType),
      reminderDaysBefore: sanitizeReminderDaysBefore(input.reminderDaysBefore),
      reminderDate: sanitizeDueDate(input.reminderDate),
      reminderTime: sanitizeReminderTime(input.reminderTime),
    };
  }

  if (input.reminderPreset === "day-before-1800") {
    return {
      reminderType: "days-before",
      reminderDaysBefore: 1,
      reminderDate: null,
      reminderTime: "18:00",
    };
  }

  if (input.reminderPreset === "day-of-0900") {
    return {
      reminderType: "day-of",
      reminderDaysBefore: 1,
      reminderDate: null,
      reminderTime: "09:00",
    };
  }

  return {
    reminderType: "none",
    reminderDaysBefore: 1,
    reminderDate: null,
    reminderTime: "09:00",
  };
}

function sanitizeReminderPatch(input) {
  if (
    input.reminderType === undefined &&
    input.reminderDaysBefore === undefined &&
    input.reminderDate === undefined &&
    input.reminderTime === undefined &&
    input.reminderPreset === undefined
  ) {
    return {};
  }

  const normalized = normalizeReminderFields(input);
  return {
    reminderType: normalized.reminderType,
    reminderDaysBefore: normalized.reminderDaysBefore,
    reminderDate: normalized.reminderDate,
    reminderTime: normalized.reminderTime,
  };
}

function sanitizeReminderType(value) {
  return oneOf(value, ["none", "day-of", "days-before", "specific-date"], "none");
}

function sanitizeReminderDaysBefore(value) {
  const numberValue = Number(value || 1);
  return Number.isFinite(numberValue) ? Math.min(30, Math.max(1, Math.round(numberValue))) : 1;
}

function sanitizeReminderTime(value) {
  const stringValue = String(value || "09:00");
  return /^\d{2}:\d{2}$/.test(stringValue) ? stringValue : "09:00";
}

function applyReminderState(task) {
  const nextReminderAt = computeReminderAt(task);
  const reminderChanged = nextReminderAt !== task.reminderAt;

  task.reminderAt = nextReminderAt;
  if (!task.reminderAt) {
    task.reminderType = "none";
    task.reminderDaysBefore = 1;
    task.reminderDate = null;
    task.reminderTime = "09:00";
    task.reminderSentAt = null;
    return task;
  }

  if (reminderChanged) {
    task.reminderSentAt = null;
  }

  return task;
}

function computeReminderAt(task) {
  if (!task.dueDate || task.reminderType === "none") {
    return null;
  }

  const targetDate =
    task.reminderType === "specific-date" ? sanitizeDueDate(task.reminderDate) : task.dueDate;
  if (!targetDate) {
    return null;
  }

  const [year, month, day] = targetDate.split("-").map(Number);
  const reminderDate = new Date(year, month - 1, day, 0, 0, 0, 0);

  if (task.reminderType === "days-before") {
    reminderDate.setDate(reminderDate.getDate() - Math.max(1, Number(task.reminderDaysBefore || 1)));
  }

  const [hours, minutes] = sanitizeReminderTime(task.reminderTime).split(":").map(Number);
  reminderDate.setHours(hours, minutes, 0, 0);
  return reminderDate.toISOString();
}

async function processDueReminders() {
  if (reminderLoopRunning) {
    return;
  }

  reminderLoopRunning = true;

  try {
    const config = await loadPushoverConfig();
    if (!config.appToken || !config.userKey) {
      const nextWarning = "Pushover reminders are configured locally, but appToken or userKey is missing.";
      if (lastPushoverWarning !== nextWarning) {
        console.warn(nextWarning);
        lastPushoverWarning = nextWarning;
      }
      return;
    }

    const db = await readDatabase();
    const now = Date.now();
    let changed = false;

    for (const task of db.tasks) {
      if (
        task.done ||
        !task.reminderAt ||
        task.reminderSentAt ||
        new Date(task.reminderAt).getTime() > now
      ) {
        continue;
      }

      await sendPushoverReminder(task, config);
      task.reminderSentAt = new Date().toISOString();
      changed = true;
    }

    if (changed) {
      await writeDatabase(db);
    }
  } catch (error) {
    console.error("Failed to process reminders.", error);
  } finally {
    reminderLoopRunning = false;
  }
}

async function loadPushoverConfig() {
  const envConfig = {
    appToken: process.env.PUSHOVER_APP_TOKEN || "",
    userKey: process.env.PUSHOVER_USER_KEY || "",
    device: process.env.PUSHOVER_DEVICE || "",
    emailAlias: process.env.PUSHOVER_EMAIL_ALIAS || "",
  };

  try {
    const raw = await fs.readFile(PUSHOVER_CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      appToken: envConfig.appToken || String(parsed.appToken || ""),
      userKey: envConfig.userKey || String(parsed.userKey || ""),
      device: envConfig.device || String(parsed.device || ""),
      emailAlias: envConfig.emailAlias || String(parsed.emailAlias || ""),
    };
  } catch {
    return envConfig;
  }
}

async function isPushoverReady() {
  const config = await loadPushoverConfig();
  return Boolean(config.appToken && config.userKey);
}

async function sendPushoverReminder(task, config) {
  const body = new URLSearchParams({
    token: config.appToken,
    user: config.userKey,
    message: buildReminderMessage(task),
    title: "akist",
    priority: task.pinned ? "1" : "0",
    ...(config.device ? { device: config.device } : {}),
  });

  const response = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pushover request failed: ${text}`);
  }
}

function buildReminderMessage(task) {
  const dueLabel = task.dueDate ? formatDueDate(task.dueDate) : "no due date";
  if (task.pinned) {
    return `important: ${task.title} - due ${dueLabel}`;
  }

  return `${task.title} - due ${dueLabel}`;
}

function formatDueDate(dueDate) {
  const [year, month, day] = dueDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}


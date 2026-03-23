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
});

async function handleApi(req, res, url) {
  const db = await readDatabase();

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    sendJson(res, 200, {
      appName: "akist",
      version: "0.1.0",
      lanAddress: getLanAddress(),
      todayKey: getTodayKey(),
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
  return {
    id: String(input.id || randomUUID()),
    title: String(input.title || "").trim(),
    dueDate: sanitizeDueDate(input.dueDate),
    pinned: Boolean(input.pinned),
    done: Boolean(input.done),
    createdAt: input.createdAt || new Date().toISOString(),
    completedAt: input.completedAt || null,
    dayKey: input.dayKey || getTodayKey(),
  };
}

function sanitizeTaskPatch(input) {
  return {
    ...(input.title !== undefined ? { title: String(input.title).trim() } : {}),
    ...(input.dueDate !== undefined ? { dueDate: sanitizeDueDate(input.dueDate) } : {}),
    ...(input.pinned !== undefined ? { pinned: Boolean(input.pinned) } : {}),
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
  for (const entries of Object.values(networks)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }
  return null;
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

// Electron launcher for the Windows desktop build.
//
// It runs the Next.js standalone server (built to .next/standalone) as a child
// process on a local port, then opens a window pointed at it. The database and
// a persisted encryption secret live in the per-user app-data folder so they
// survive updates and stay writable.
const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const http = require("node:http");
const crypto = require("node:crypto");
const { fork } = require("node:child_process");

const appRoot = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..");
const serverJs = path.join(appRoot, ".next", "standalone", "server.js");
const standaloneDir = path.dirname(serverJs);

const userDataDir = app.getPath("userData");
const dbPath = path.join(userDataDir, "data.db");
const configPath = path.join(userDataDir, "config.json");
const logPath = path.join(userDataDir, "launcher.log");

let serverProcess = null;
let mainWindow = null;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(logPath, line);
  } catch {
    /* ignore */
  }
  // eslint-disable-next-line no-console
  console.log(msg);
}

function fatal(title, detail) {
  log(`FATAL: ${title} — ${detail}`);
  dialog.showErrorBox(title, `${detail}\n\nA log was written to:\n${logPath}`);
  app.quit();
}

/** Read (or create + persist) a stable AUTH_SECRET used for at-rest encryption. */
function getOrCreateSecret() {
  try {
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (cfg.authSecret && cfg.authSecret.length >= 16) return cfg.authSecret;
    }
  } catch {
    /* fall through and regenerate */
  }
  const authSecret = crypto.randomBytes(32).toString("base64");
  fs.writeFileSync(configPath, JSON.stringify({ authSecret }, null, 2));
  return authSecret;
}

/** Copy the template (empty, schema-ready) database into userData on first run. */
function ensureDatabase() {
  if (fs.existsSync(dbPath)) return;
  const template = app.isPackaged
    ? path.join(process.resourcesPath, "template.db")
    : path.join(appRoot, "resources", "template.db");
  if (!fs.existsSync(template)) {
    throw new Error(`Template database missing at ${template}`);
  }
  fs.copyFileSync(template, dbPath);
  log(`Initialized database at ${dbPath}`);
}

/** Find a free TCP port, starting from a preferred one. */
function findPort(preferred) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(findPort(0))); // 0 = any free port
    srv.listen(preferred, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Poll the server until it responds, or time out. */
function waitForServer(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/" }, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error("Server did not start in time"));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

async function startServer() {
  ensureDatabase();
  const authSecret = getOrCreateSecret();
  const port = await findPort(39427);

  if (!fs.existsSync(serverJs)) {
    throw new Error(`Server bundle missing at ${serverJs}`);
  }

  log(`Starting server on 127.0.0.1:${port}`);
  serverProcess = fork(serverJs, [], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      // Run the forked file as plain Node, not a second Electron app window.
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      DATABASE_URL: `file:${dbPath.replace(/\\/g, "/")}`,
      AUTH_SECRET: authSecret,
      AUTH_URL: `http://127.0.0.1:${port}`,
      DESKTOP_LOCAL_AUTH: "1",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });

  serverProcess.stdout.on("data", (d) => log(`[server] ${d.toString().trim()}`));
  serverProcess.stderr.on("data", (d) => log(`[server:err] ${d.toString().trim()}`));
  serverProcess.on("exit", (code) => {
    log(`Server exited with code ${code}`);
    if (code && code !== 0 && !app.isQuitting) {
      fatal("Case Manager stopped", `The background server exited unexpectedly (code ${code}).`);
    }
  });

  await waitForServer(port);
  return port;
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Case Manager",
    backgroundColor: "#f8fafc",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  // Open external links (e.g. "Verify live on Sunbiz") in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1")) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    const port = await startServer();
    createWindow(port);
  } catch (err) {
    fatal("Case Manager could not start", String(err && err.message ? err.message : err));
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && mainWindow === null) {
      // server already running; just reopen a window on the same port is non-trivial,
      // so a restart is simplest if all windows were closed on macOS.
    }
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (serverProcess) serverProcess.kill();
});

app.on("window-all-closed", () => {
  app.quit();
});

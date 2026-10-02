"use strict";

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SETTINGS_FILE = () => path.join(app.getPath("userData"), "settings.json");
const DEFAULT_LOGO = path.join(__dirname, "assets", "logo-default.png");

/** Firm defaults — editable in the app's Letterhead settings. */
const DEFAULT_SETTINGS = {
  logoDataUrl: "", // empty → use the bundled default logo
  firmName: "Rudolph & Associates LLC",
  footerAddress: "315 FIFTH STREET, WEST PALM BEACH, FLORIDA 33401",
  phone: "561-655-1901",
  fax: "561-655-3870",
  email: "",
  accentColor: "#2F5496",
  signName: "Daniel L. Martin, Esq.",
  closing: "Very truly yours,",
  lastExportDir: "", // remembered folder for the Save dialog
};

function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE(), "utf8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

function fileToDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace(".", "");
  const mime =
    ext === "png" ? "image/png" :
    ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
    ext === "gif" ? "image/gif" :
    ext === "svg" ? "image/svg+xml" :
    ext === "webp" ? "image/webp" : "application/octet-stream";
  const b64 = fs.readFileSync(filePath).toString("base64");
  return `data:${mime};base64,${b64}`;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    title: "Letterhead",
    backgroundColor: "#f1f5f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  return win;
}

// ---- IPC ----

ipcMain.handle("settings:load", () => {
  let defaultLogoDataUrl = "";
  try {
    defaultLogoDataUrl = fileToDataUrl(DEFAULT_LOGO);
  } catch {
    /* no bundled logo — renderer falls back to the firm name text */
  }
  return { settings: readSettings(), defaultLogoDataUrl };
});

ipcMain.handle("settings:save", (_e, settings) => writeSettings(settings));

ipcMain.handle("logo:pick", async () => {
  const res = await dialog.showOpenDialog({
    title: "Choose a logo image",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "svg", "webp"] }],
  });
  if (res.canceled || res.filePaths.length === 0) return { canceled: true };
  try {
    return { canceled: false, dataUrl: fileToDataUrl(res.filePaths[0]) };
  } catch (err) {
    return { canceled: true, error: String(err) };
  }
});

/**
 * Render the supplied standalone HTML to a PDF in an offscreen window, after
 * asking the user where to save it.
 */
ipcMain.handle("letter:export", async (_e, { html, defaultFileName }) => {
  const settings = readSettings();
  const startDir =
    settings.lastExportDir && fs.existsSync(settings.lastExportDir)
      ? settings.lastExportDir
      : app.getPath("documents");

  const save = await dialog.showSaveDialog({
    title: "Save letter as PDF",
    defaultPath: path.join(startDir, defaultFileName || "Letter.pdf"),
    filters: [{ name: "PDF Document", extensions: ["pdf"] }],
  });
  if (save.canceled || !save.filePath) return { canceled: true };

  // Render the letter HTML in a hidden window and print it to PDF.
  const pdfWin = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: false, sandbox: true },
  });

  const tmpFile = path.join(
    os.tmpdir(),
    `letterhead-${Date.now()}-${Math.random().toString(36).slice(2)}.html`,
  );

  try {
    fs.writeFileSync(tmpFile, html, "utf8");
    await pdfWin.loadFile(tmpFile);
    // Give images (logo data URL) a tick to lay out.
    await new Promise((r) => setTimeout(r, 150));

    const pdf = await pdfWin.webContents.printToPDF({
      pageSize: "Letter",
      printBackground: true,
      margins: { top: 0.5, bottom: 0.4, left: 1, right: 1 }, // inches
    });

    fs.writeFileSync(save.filePath, pdf);
    writeSettings({ ...settings, lastExportDir: path.dirname(save.filePath) });
    shell.showItemInFolder(save.filePath);
    return { saved: true, path: save.filePath };
  } catch (err) {
    return { saved: false, error: String(err) };
  } finally {
    pdfWin.destroy();
    fs.unlink(tmpFile, () => {});
  }
});

// ---- lifecycle ----

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

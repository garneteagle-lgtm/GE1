"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("letterhead", {
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  pickLogo: () => ipcRenderer.invoke("logo:pick"),
  exportPdf: (payload) => ipcRenderer.invoke("letter:export", payload),
  exportDocx: (payload) => ipcRenderer.invoke("letter:exportDocx", payload),
});

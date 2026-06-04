/**
 * Electron 主进程
 *
 * 启动 Agent WebSocket Server + Electron 窗口
 */

import { app, BrowserWindow, shell } from "electron";
import { startServer, type AgentServer } from "./server.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let server: AgentServer | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "agentFamily",
    backgroundColor: "#1a1a2e",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#00000000",
      symbolColor: "#8b8fa3",
      height: 38,
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // 外部链接用默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    // 等 Vite 就绪后加载
    const loadDev = () => {
      mainWindow
        ?.loadURL("http://localhost:5173")
        .catch(() => setTimeout(loadDev, 1000));
    };
    loadDev();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist-renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // 启动 Agent Server
  server = startServer(3457);
  console.log("🚀 Agent Server: ws://localhost:3457");

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  server?.stop();
  if (process.platform !== "darwin") app.quit();
});

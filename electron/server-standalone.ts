/**
 * Agent Server 独立启动入口（开发用）
 *
 * 不依赖 Electron，直接启动 WebSocket 服务。
 * 配合 Vite dev server 使用：
 *   终端1: npm run dev:server     (启动 WS :3457)
 *   终端2: npm run dev:renderer   (启动 Vite :5173)
 *   浏览器打开 http://localhost:5173
 */

import { startServer } from "./server.js";

const server = startServer(3457);

// 优雅退出
process.on("SIGINT", () => {
  console.log("\n[Server] 正在关闭...");
  server.stop();
  process.exit(0);
});

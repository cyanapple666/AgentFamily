/**
 * Electron Preload 脚本
 * 
 * 在渲染进程中暴露安全的 API 接口
 */

import { ipcRenderer, contextBridge } from "electron";

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld("electronAPI", {
  /**
   * 选择文件夹对话框
   * @returns 选中的文件夹路径，取消则返回 null
   */
  selectFolder: async (): Promise<string | null> => {
    return ipcRenderer.invoke("select-folder");
  },
});
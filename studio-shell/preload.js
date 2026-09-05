const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("shell", {
  send: (cmd, args = {}) => ipcRenderer.invoke("shell", { cmd, ...args }),
  onTabs: (cb) => ipcRenderer.on("tabs", (_e, d) => cb(d)),
  onToast: (cb) => ipcRenderer.on("toast", (_e, d) => cb(d)),
});

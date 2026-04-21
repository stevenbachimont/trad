const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tradDesktop", {
  popupOpenOrFocus: () => ipcRenderer.invoke("popup:openOrFocus"),
  popupClose: () => ipcRenderer.invoke("popup:close"),
  popupSetAlwaysOnTop: (enabled) => ipcRenderer.invoke("popup:setAlwaysOnTop", Boolean(enabled)),
  popupSetResizable: (enabled) => ipcRenderer.invoke("popup:setResizable", Boolean(enabled)),
  popupSendState: (payload) => ipcRenderer.send("popup:state", payload),
  translateChunk: (payload) => ipcRenderer.invoke("translate:chunk", payload),
  onPopupState: (handler) => {
    ipcRenderer.removeAllListeners("popup:state");
    ipcRenderer.on("popup:state", (_ev, payload) => handler(payload));
  },
  onPopupClosed: (handler) => {
    ipcRenderer.removeAllListeners("popup:closed");
    ipcRenderer.on("popup:closed", () => handler());
  },
  onLocalStatus: (handler) => {
    ipcRenderer.removeAllListeners("local:status");
    ipcRenderer.on("local:status", (_ev, payload) => handler(payload));
  },
});


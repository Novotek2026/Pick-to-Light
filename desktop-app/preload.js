const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ptlHardware', {
  getStatus: () => ipcRenderer.invoke('hardware:get-status'),
  listPorts: () => ipcRenderer.invoke('hardware:list-ports'),
  connect: (config) => ipcRenderer.invoke('hardware:connect', config),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('hardware:status', listener);
    return () => ipcRenderer.removeListener('hardware:status', listener);
  },
  onData: (callback) => {
    const listener = (_event, frame) => callback(frame);
    ipcRenderer.on('hardware:data', listener);
    return () => ipcRenderer.removeListener('hardware:data', listener);
  }
});
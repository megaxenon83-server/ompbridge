const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  run: (action, data) => ipcRenderer.invoke('desktop', action, data),
  onEvent: callback => { ipcRenderer.on('omp-event', (_event, payload) => callback(payload)); }
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize:        () => ipcRenderer.send('win-minimize'),
  maximize:        () => ipcRenderer.send('win-maximize'),
  close:           () => ipcRenderer.send('win-close'),
  openExcel:       () => ipcRenderer.invoke('open-excel'),
  saveExcel:       (opts) => ipcRenderer.invoke('save-excel', opts),
  openImage:       () => ipcRenderer.invoke('open-image'),
  exportPdf:       (opts) => ipcRenderer.invoke('export-pdf', opts),
  persistData:     (data) => ipcRenderer.invoke('persist-data', data),
  getPersistedData:() => ipcRenderer.invoke('get-persisted-data'),
  on: (channel, fn) => {
    const allowed = ['prepare-print','print-done','app-version','load-persisted-data'];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_, ...args) => fn(...args));
  }
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window
  minimize: () => ipcRenderer.send('win-minimize'),
  maximize: () => ipcRenderer.send('win-maximize'),
  close:    () => ipcRenderer.send('win-close'),

  // Files
  openExcel:  () => ipcRenderer.invoke('open-excel'),
  saveExcel:  (opts) => ipcRenderer.invoke('save-excel', opts),
  openImage:  () => ipcRenderer.invoke('open-image'),
  exportPdf:  (opts) => ipcRenderer.invoke('export-pdf', opts),

  // Events from main
  on: (channel, fn) => {
    const allowed = ['prepare-print', 'print-done', 'app-version'];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_, ...args) => fn(...args));
  }
});

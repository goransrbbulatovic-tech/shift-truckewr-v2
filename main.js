const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs   = require('fs');

let mainWindow;

// ── Data file path (persists in user's AppData/Application Support) ──────────
const DATA_DIR  = app.getPath('userData');
const DATA_FILE = path.join(DATA_DIR, 'raspored-data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) { console.error('Load data error:', e); }
  return { shifts: [], people: [], lastFile: null };
}

function saveData(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) { console.error('Save data error:', e); return false; }
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 700,
    frame: false, titleBarStyle: 'hidden', backgroundColor: '#080d1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, spellcheck: false
    },
    show: false
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('app-version', app.getVersion());
    // Send persisted data immediately after load
    const data = loadData();
    mainWindow.webContents.send('load-persisted-data', data);
  });
  Menu.setApplicationMenu(null);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── Window controls ───────────────────────────────────────────────────────────
ipcMain.on('win-minimize', () => mainWindow.minimize());
ipcMain.on('win-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('win-close',    () => mainWindow.close());

// ── Persist data (called from renderer on every change) ───────────────────────
ipcMain.handle('persist-data', async (event, data) => saveData(data));

// ── Load data ─────────────────────────────────────────────────────────────────
ipcMain.handle('get-persisted-data', async () => loadData());

// ── Open Excel ────────────────────────────────────────────────────────────────
ipcMain.handle('open-excel', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Učitaj Excel raspored',
    properties: ['openFile'],
    filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'xlsm', 'csv'] }]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  return { path: filePath, name: path.basename(filePath), data: fs.readFileSync(filePath).toString('base64') };
});

// ── Save Excel ────────────────────────────────────────────────────────────────
ipcMain.handle('save-excel', async (event, { defaultName, base64 }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Sačuvaj Excel izvještaj',
    defaultPath: defaultName || 'raspored_smjena.xlsx',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
  shell.openPath(path.dirname(result.filePath));
  return true;
});

// ── Open image ────────────────────────────────────────────────────────────────
ipcMain.handle('open-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Odaberi sliku pozadine', properties: ['openFile'],
    filters: [{ name: 'Slike', extensions: ['jpg','jpeg','png','webp','gif'] }]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const fp  = result.filePaths[0];
  const ext = path.extname(fp).toLowerCase().slice(1);
  const mime = ext==='png'?'image/png':ext==='webp'?'image/webp':ext==='gif'?'image/gif':'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(fp).toString('base64')}`;
});

// ── Export PDF ────────────────────────────────────────────────────────────────
ipcMain.handle('export-pdf', async (event, { defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Sačuvaj PDF', defaultPath: defaultName || 'raspored_smjena.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (result.canceled || !result.filePath) return false;
  mainWindow.webContents.send('prepare-print');
  await new Promise(r => setTimeout(r, 400));
  const pdfData = await mainWindow.webContents.printToPDF({
    printBackground: true, pageSize: 'A4', landscape: true,
    marginsType: 0, margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
  });
  fs.writeFileSync(result.filePath, pdfData);
  mainWindow.webContents.send('print-done');
  shell.openPath(result.filePath);
  return true;
});

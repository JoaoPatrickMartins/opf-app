// Processo principal do Electron: sobe o backend Node/Express embutido em uma porta
// livre e abre a janela apontando para ele. Um app, um processo, uma janela.
const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let serverInfo = null;

// Raiz da aplicação: repo (dev) ou resources/app (empacotado, asar desligado).
function appRoot() {
  return app.isPackaged ? app.getAppPath() : path.join(__dirname, '..');
}

async function boot() {
  const root = appRoot();
  // .env editável: ao lado do app quando empacotado (extraResources → resources/.env), raiz em dev.
  const envPath = app.isPackaged
    ? path.join(process.resourcesPath, '.env')
    : path.join(root, '.env');

  // Carrega as variáveis ANTES de importar o backend (o dotenv do backend não sobrescreve o que já existe).
  try { require('dotenv').config({ path: envPath }); } catch { /* dotenv sempre presente */ }
  process.env.OPF_ENV_PATH = envPath;
  process.env.OPF_STATIC_DIR = path.join(root, 'frontend', 'dist');
  process.env.BACKEND_PORT = '0'; // porta livre efêmera — a janela usa a porta real retornada

  const backendIndex = path.join(root, 'backend', 'src', 'index.js');
  const { startServer } = await import(pathToFileURL(backendIndex).href);
  serverInfo = await startServer();
  return serverInfo.port;
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'OPF',
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true }
  });
  win.loadURL(`http://localhost:${port}/`);
  // Links externos abrem no navegador padrão, não dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  try {
    const port = await boot();
    createWindow(port);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
    });
  } catch (err) {
    dialog.showErrorBox('OPF — erro ao iniciar', String(err?.stack || err?.message || err));
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  try { serverInfo?.server?.close(); } catch { /* noop */ }
});

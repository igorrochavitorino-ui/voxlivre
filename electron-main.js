const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let mainWindow = null;
let serverProcess = null;
const SERVER_PORT = 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Verifica se o servidor Express já está rodando
function isServerRunning(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.abort();
      resolve(false);
    });
  });
}

// Inicia o servidor Express se necessário
async function ensureServerRunning() {
  const running = await isServerRunning(SERVER_PORT);
  if (running) {
    console.log('Servidor Express já está ativo na porta', SERVER_PORT);
    return;
  }

  console.log('Iniciando servidor Express integrado...');
  serverProcess = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, PORT: SERVER_PORT }
  });

  // Aguarda até o servidor responder
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isServerRunning(SERVER_PORT)) {
      console.log('Servidor Express iniciado com sucesso!');
      return;
    }
  }
}

async function createWindow() {
  await ensureServerRunning();

  const iconPath = path.join(__dirname, 'public', 'icons', 'icon-512.png');

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 650,
    title: 'VoxLivre - Leitor Neural de PDF & Audiolivro',
    icon: iconPath,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL(SERVER_URL);

  // Links externos abrem no navegador padrão do sistema operacional
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes(`localhost:${SERVER_PORT}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (serverProcess) {
    console.log('Encerrando servidor Express...');
    serverProcess.kill();
    serverProcess = null;
  }
});

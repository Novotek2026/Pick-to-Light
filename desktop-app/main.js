const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SerialPort } = require('serialport');

let serialPort = null;
let reconnectTimer = null;
let connectionGeneration = 0;
let hardwareStatus = { state: 'offline', port: '', baudRate: 9600, message: 'Select a COM port' };

function publishStatus(nextStatus) {
  hardwareStatus = { ...hardwareStatus, ...nextStatus };
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('hardware:status', hardwareStatus);
  }
}

function publishData(frame) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('hardware:data', frame);
  }
}

function scheduleReconnect(config, generation) {
  if (reconnectTimer || generation !== connectionGeneration) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (generation === connectionGeneration) openHardwarePort(config, generation);
  }, 2000);
}

function openHardwarePort(config, generation) {
  const portName = String(config.port || '').trim();
  const baudRate = Number(config.baudRate) || 9600;
  if (!portName) {
    publishStatus({ state: 'offline', port: '', baudRate, message: 'Select a COM port' });
    return;
  }
  publishStatus({ state: 'connecting', port: portName, baudRate, message: 'Opening USB-RS485 serial port' });

  let port;
  try {
    port = new SerialPort({ path: portName, baudRate, autoOpen: false });
  } catch (error) {
    publishStatus({ state: 'offline', port: portName, baudRate, message: error.message });
    scheduleReconnect(config, generation);
    return;
  }

  serialPort = port;
  port.on('open', () => {
    if (generation !== connectionGeneration || serialPort !== port) return;
    publishStatus({ state: 'online', port: portName, baudRate, message: 'Serial adapter port open; PCB handshake not confirmed' });
  });
  port.on('data', (buffer) => {
    if (generation !== connectionGeneration || serialPort !== port || !buffer.length) return;
    const bytes = buffer.subarray(0, 256);
    const ascii = Array.from(bytes, (byte) => {
      if (byte >= 32 && byte <= 126) return String.fromCharCode(byte);
      if (byte === 9) return '\\t';
      if (byte === 10) return '\\n';
      if (byte === 13) return '\\r';
      return '.';
    }).join('');
    publishData({
      time: new Date().toLocaleTimeString(),
      hex: bytes.toString('hex').match(/.{1,2}/g)?.join(' ') || '',
      ascii,
      truncated: buffer.length > bytes.length
    });
  });
  port.on('close', () => {
    if (generation !== connectionGeneration || serialPort !== port) return;
    serialPort = null;
    publishStatus({ state: 'offline', port: portName, baudRate, message: 'Serial port closed' });
    scheduleReconnect(config, generation);
  });
  port.on('error', (error) => {
    if (generation !== connectionGeneration || serialPort !== port) return;
    publishStatus({ state: 'offline', port: portName, baudRate, message: error.message });
    scheduleReconnect(config, generation);
  });

  port.open((error) => {
    if (!error || generation !== connectionGeneration || serialPort !== port) return;
    publishStatus({ state: 'offline', port: portName, baudRate, message: error.message });
    serialPort = null;
    scheduleReconnect(config, generation);
  });
}

ipcMain.handle('hardware:get-status', () => hardwareStatus);
ipcMain.handle('hardware:list-ports', () => SerialPort.list());
ipcMain.handle('hardware:connect', (_event, config) => {
  const generation = ++connectionGeneration;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const previousPort = serialPort;
  serialPort = null;
  if (previousPort && previousPort.isOpen) previousPort.close();
  const nextConfig = {
    port: String(config?.port || '').trim(),
    baudRate: Number(config?.baudRate) || 9600
  };
  if (!nextConfig.port) {
    publishStatus({ state: 'offline', ...nextConfig, message: 'Select a COM port' });
    return hardwareStatus;
  }
  publishStatus({ state: 'connecting', ...nextConfig, message: 'Opening USB-RS485 serial port' });
  openHardwarePort(nextConfig, generation);
  return hardwareStatus;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1800,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#eef4f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const websiteDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'website')
    : path.join(__dirname, '..', 'website');
  win.loadFile(path.join(websiteDirectory, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  connectionGeneration += 1;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (serialPort && serialPort.isOpen) serialPort.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
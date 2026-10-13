const http = require('http');
const fs = require('fs');
const path = require('path');
const { SerialPort } = require('serialport');

const host = '127.0.0.1';
const portNumber = Number(process.env.PTL_PORT) || 3000;
const websiteRoot = path.resolve(__dirname, '..', 'website');
const clients = new Set();
let serialPort = null;
let reconnectTimer = null;
let connectionGeneration = 0;
let activeConfig = null;
let hardwareStatus = { state: 'offline', port: '', baudRate: 9600, message: 'Select a COM port' };

function sendEvent(response, name, value) {
  if (!response.writable) return;
  response.write(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`);
}

function publishStatus(nextStatus) {
  hardwareStatus = { ...hardwareStatus, ...nextStatus };
  for (const response of clients) sendEvent(response, 'status', hardwareStatus);
}

function publishData(frame) {
  for (const response of clients) sendEvent(response, 'data', frame);
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
  let devicePort;
  try {
    devicePort = new SerialPort({ path: portName, baudRate, autoOpen: false });
  } catch (error) {
    publishStatus({ state: 'offline', port: portName, baudRate, message: error.message });
    scheduleReconnect(config, generation);
    return;
  }

  serialPort = devicePort;
  devicePort.on('open', () => {
    if (generation !== connectionGeneration || serialPort !== devicePort) return;
    publishStatus({ state: 'online', port: portName, baudRate, message: 'Adapter port open; PCB handshake not confirmed' });
  });
  devicePort.on('data', (buffer) => {
    if (generation !== connectionGeneration || serialPort !== devicePort || !buffer.length) return;
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
  devicePort.on('close', () => {
    if (generation !== connectionGeneration || serialPort !== devicePort) return;
    serialPort = null;
    publishStatus({ state: 'offline', port: portName, baudRate, message: 'Serial port closed' });
    if (activeConfig) scheduleReconnect(activeConfig, generation);
  });
  devicePort.on('error', (error) => {
    if (generation !== connectionGeneration || serialPort !== devicePort) return;
    serialPort = null;
    publishStatus({ state: 'offline', port: portName, baudRate, message: error.message });
    if (devicePort.isOpen) devicePort.close();
    if (activeConfig) scheduleReconnect(activeConfig, generation);
  });
  devicePort.open((error) => {
    if (!error || generation !== connectionGeneration || serialPort !== devicePort) return;
    serialPort = null;
    publishStatus({ state: 'offline', port: portName, baudRate, message: error.message });
    if (activeConfig) scheduleReconnect(activeConfig, generation);
  });
}

function json(response, statusCode, value) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function handleConnect(request, response) {
  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > 4096) {
      json(response, 413, { error: 'Request too large' });
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', async () => {
    let config;
    try {
      config = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      json(response, 400, { error: 'Invalid JSON configuration' });
      return;
    }

    const nextConfig = {
      port: String(config?.port || '').trim(),
      baudRate: Number(config?.baudRate) || 9600
    };
    const validBaudRates = [9600, 19200, 38400, 115200];
    if (!validBaudRates.includes(nextConfig.baudRate)) {
      json(response, 400, { error: 'Unsupported baud rate' });
      return;
    }
    const generation = ++connectionGeneration;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    const previousPort = serialPort;
    serialPort = null;
    activeConfig = nextConfig.port ? nextConfig : null;
    if (previousPort?.isOpen) previousPort.close();

    if (!nextConfig.port) {
      publishStatus({ state: 'offline', ...nextConfig, message: 'Select a COM port' });
      json(response, 200, { status: hardwareStatus });
      return;
    }

    try {
      const availablePorts = await SerialPort.list();
      if (!availablePorts.some((item) => item.path.toUpperCase() === nextConfig.port.toUpperCase())) {
        activeConfig = null;
        publishStatus({ state: 'offline', ...nextConfig, message: 'Port not found; refresh the port list' });
        json(response, 404, { status: hardwareStatus });
        return;
      }
    } catch (error) {
      activeConfig = null;
      publishStatus({ state: 'offline', ...nextConfig, message: error.message });
      json(response, 500, { error: error.message });
      return;
    }

    publishStatus({ state: 'connecting', ...nextConfig, message: 'Opening USB-RS485 serial port' });
    openHardwarePort(nextConfig, generation);
    json(response, 200, { status: hardwareStatus });
  });
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((request, response) => {
  const requestHost = String(request.headers.host || '').split(':')[0];
  if (!['127.0.0.1', 'localhost'].includes(requestHost)) {
    response.writeHead(403);
    response.end('Local access only');
    return;
  }

  const requestUrl = new URL(request.url, `http://${host}:${portNumber}`);
  if (request.method === 'GET' && requestUrl.pathname === '/api/status') {
    json(response, 200, hardwareStatus);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/ports') {
    SerialPort.list().then((ports) => json(response, 200, ports)).catch((error) => json(response, 500, { error: error.message }));
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/connect') {
    handleConnect(request, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/events') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    });
    response.write('retry: 2000\n\n');
    clients.add(response);
    sendEvent(response, 'status', hardwareStatus);
    response.on('close', () => clients.delete(response));
    return;
  }
  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET, POST' });
    response.end('Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400);
    response.end('Invalid path');
    return;
  }
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(websiteRoot, relativePath);
  if (!filePath.startsWith(websiteRoot + path.sep)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store'
    });
    response.end(content);
  });
});

server.listen(portNumber, host, () => {
  console.log(`PTL local server: http://${host}:${portNumber}`);
  console.log('Hardware bridge is receive-only until the PCB protocol is confirmed.');
});

function shutdown() {
  connectionGeneration += 1;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (serialPort?.isOpen) serialPort.close();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
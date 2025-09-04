const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mqtt = require('mqtt');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: ["https://zeptac-iot-platform-vp3h-kljhebkdt-haru65s-projects.vercel.app", "http://localhost:5175"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// MQTT Broker configs
const originalBroker = {
  url: 'mqtt://broker.zeptac.com:1883',
  topic: 'devices/123/data',
  options: {
    clientId: 'original-client-' + Math.random().toString(16).substr(2, 8),
    username: 'zeptac_iot',
    password: 'ZepIOT@123',
    keepalive: 45,
    reconnectPeriod: 10000,
    connectTimeout: 15000,
    clean: true
  }
};

const simulatedBroker = {
  url: 'mqtt://test.mosquitto.org',
  topic: 'devices/234/data',
  options: {
    clientId: 'simulated-client-' + Math.random().toString(16).substr(2, 8),
    keepalive: 45,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    clean: true
  }
};

const originalClient = mqtt.connect(originalBroker.url, originalBroker.options);
const simulatedClient = mqtt.connect(simulatedBroker.url, simulatedBroker.options);

// Device data and state
let deviceData = {
  main: null,
  sim: null,
  original: null,
  mainSource: 'aaa' // default to simulation device first
};

let lastOriginalTimestamp = 0;
const ORIGINAL_TIMEOUT = 30000; // 30 seconds without data triggers failover
let timeoutTimer = null;
let connectionStatus = {
  original: false,
  simulated: false
};

// Basic data transform helper
function transformDeviceData(payload, source, topic) {
  return {
    id: payload.SPN?.toString() ?? payload.SN?.toString() ?? "N/A",
    name: payload.API ?? (source === 'original' ? 'Original-Device' : 'AAA'),
    icon: 'bi-device',
    type: 'sensor',
    location: payload.LATITUDE && payload.LONGITUDE && (payload.LATITUDE !== 0 || payload.LONGITUDE !== 0)
      ? `${payload.LATITUDE}, ${payload.LONGITUDE}` : "",
    status: payload.EVENT ?? "NORMAL",
    lastSeen: payload.TimeStamp ?? new Date().toISOString(),
    timestamp: Date.now(),
    source: source,
    metrics: Object.keys(payload)
      .filter(k => !['API', 'EVENT', 'TimeStamp', 'LATITUDE', 'LONGITUDE', 'SN', 'SPN', 'LOG'].includes(k))
      .map(k => ({
        type: k,
        value: parseFloat(payload[k]) || payload[k],
        icon: k === 'DCV' || k === 'ACV' ? 'bi-battery' : k === 'DCI' || k === 'ACI' ? 'bi-lightning-charge' : 'bi-graph-up'
      }))
  };
}

// Emit to frontend with throttling
const UPDATE_THROTTLE = 1000; // ms
let lastUpdateTimes = { main: 0, sim: 0 };

function throttledEmit(updateType, data) {
  const now = Date.now();
  if (now - (lastUpdateTimes[updateType] || 0) >= UPDATE_THROTTLE) {
    io.emit('deviceUpdate', { type: updateType, data });
    lastUpdateTimes[updateType] = now;
  }
}

// Set main device and notify frontend
function setMainDevice(deviceInfo, source) {
  if (deviceData.mainSource === source) {
    deviceData.main = deviceInfo;
    throttledEmit('main', deviceInfo);
    return;
  }
  deviceData.main = deviceInfo;
  deviceData.mainSource = source;
  throttledEmit('main', deviceInfo);
  io.emit('deviceStatus', {
    activeDevice: source,
    originalActive: source === 'original',
    message: `Switched to ${source === 'original' ? 'original' : 'AAA'} device`
  });
  console.log(`Switched main device to: ${source}`);
}

// Failover logic: revert to simulated device if original not sending for timeout
function setOriginalTimeout() {
  if (timeoutTimer) clearTimeout(timeoutTimer);
  timeoutTimer = setTimeout(() => {
    if (deviceData.mainSource === 'original') {
      if (deviceData.sim) {
        setMainDevice(deviceData.sim, 'aaa');
        console.log('Original timeout, failover to simulated device');
      }
    }
  }, ORIGINAL_TIMEOUT);
}

// MQTT event handlers for original device
originalClient.on('connect', () => {
  connectionStatus.original = true;
  console.log('Connected to original device broker');
  originalClient.subscribe(originalBroker.topic, { qos: 0 }, err => {
    if (!err) console.log(`Subscribed to original topic: ${originalBroker.topic}`);
  });
});

originalClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const deviceInfo = transformDeviceData(payload, 'original', topic);
    deviceData.original = deviceInfo;
    lastOriginalTimestamp = Date.now();
    setMainDevice(deviceInfo, 'original');
    setOriginalTimeout();
  } catch (err) {
    console.error('Error parsing original device message:', err);
  }
});

originalClient.on('close', () => {
  connectionStatus.original = false;
  console.log('Original device broker disconnected');
});

originalClient.on('error', err => {
  connectionStatus.original = false;
  console.error('Original device client error:', err);
});

// MQTT event handlers for AAA device (simulated)
simulatedClient.on('connect', () => {
  connectionStatus.simulated = true;
  console.log('Connected to AAA device broker');
  simulatedClient.subscribe(simulatedBroker.topic, { qos: 0 }, err => {
    if (!err) console.log(`Subscribed to simulated topic: ${simulatedBroker.topic}`);
  });
});

simulatedClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const deviceInfo = transformDeviceData(payload, 'aaa', topic);
    deviceData.sim = deviceInfo;
    throttledEmit('sim', deviceInfo);
    if (deviceData.mainSource !== 'original') {
      setMainDevice(deviceInfo, 'aaa');
    }
  } catch (err) {
    console.error('Error parsing simulated device message:', err);
  }
});

simulatedClient.on('close', () => {
  connectionStatus.simulated = false;
  console.log('Simulated device broker disconnected');
});

simulatedClient.on('error', err => {
  connectionStatus.simulated = false;
  console.error('Simulated device client error:', err);
});

// Socket.io connection handler
io.on('connection', socket => {
  console.log(`Client connected: ${socket.id}`);
  socket.emit('initialData', {
    main: deviceData.main,
    sim: deviceData.sim,
    mainSource: deviceData.mainSource,
    connectionStatus
  });
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

app.get('/api/devices', (req, res) => {
  res.json({
    success: true,
    data: { ...deviceData, connectionStatus }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeDevice: deviceData.mainSource,
    connectionStatus
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on('SIGINT', () => {
  if (timeoutTimer) clearTimeout(timeoutTimer);
  originalClient.end(true);
  simulatedClient.end(true);
  server.close();
  process.exit(0);
});

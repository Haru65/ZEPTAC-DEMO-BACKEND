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

// Broker Configurations
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

// Device data with sticky switching
let deviceData = {
  main: null,
  sim: null,
  original: null,
  mainSource: 'aaa', // default to AAA device
};

// State tracking for original device messages
let lastOriginalTimestamp = 0;
const ORIGINAL_TIMEOUT = 30000; // 30 seconds
let timeoutTimer = null;
let connectionStatus = {
  original: false,
  simulated: false
};

// Rate limiting for frontend updates
const UPDATE_THROTTLE = 1000; // 1 second
let lastUpdateTimes = {
  main: 0,
  sim: 0
};

// Transform MQTT payload to frontend format
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

// Throttled emit function to avoid flooding frontend
function throttledEmit(updateType, data) {
  const now = Date.now();
  const lastUpdate = lastUpdateTimes[updateType] || 0;

  if (now - lastUpdate >= UPDATE_THROTTLE) {
    io.emit('deviceUpdate', { type: updateType, data: data });
    lastUpdateTimes[updateType] = now;
    console.log(`📤 Sent ${updateType} update: ${data.name}`);
  }
}

// Set the main device ONLY upon receiving its data
function setMainDevice(deviceInfo, source) {
  if (deviceData.mainSource === source) {
    // Already main device, just update data
    deviceData.main = deviceInfo;
    throttledEmit('main', deviceInfo);
    return;
  }

  console.log(`🎯 Switching main device to: ${source}`);

  deviceData.main = deviceInfo;
  deviceData.mainSource = source;

  throttledEmit('main', deviceInfo);

  io.emit('deviceStatus', {
    activeDevice: source,
    originalActive: source === 'original',
    message: source === 'original' ? 'Switched to original device' : 'Switched to AAA device'
  });
}

// Reset timer for reverting to AAA device on original timeout
function setOriginalTimeout() {
  if (timeoutTimer) clearTimeout(timeoutTimer);

  timeoutTimer = setTimeout(() => {
    console.log('⏰ Original device timed out; reverting to AAA device');

    if (deviceData.sim) {
      setMainDevice(deviceData.sim, 'aaa');
    }

  }, ORIGINAL_TIMEOUT);
}

// Handle messages from original device broker
originalClient.on('connect', () => {
  connectionStatus.original = true;
  console.log('✅ Connected to original device broker');

  originalClient.subscribe(originalBroker.topic, { qos: 0 }, (err) => {
    if (!err) console.log(`✅ Subscribed to original device topic: ${originalBroker.topic}`);
  });
});

originalClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`📨 Received original device message`);

    const deviceInfo = transformDeviceData(payload, 'original', topic);
    deviceData.original = deviceInfo;
    lastOriginalTimestamp = Date.now();

    setMainDevice(deviceInfo, 'original');
    setOriginalTimeout();

  } catch (error) {
    console.error('❌ Failed to parse original device message:', error);
  }
});

originalClient.on('error', (error) => {
  connectionStatus.original = false;
  console.error('❌ Original device broker error:', error.message);
});

originalClient.on('close', () => {
  connectionStatus.original = false;
  console.log('🔌 Original device broker disconnected');
});

// Handle messages from AAA device broker (simulated device)
simulatedClient.on('connect', () => {
  connectionStatus.simulated = true;
  console.log('✅ Connected to AAA device broker');

  simulatedClient.subscribe(simulatedBroker.topic, { qos: 0 }, (err) => {
    if (!err) console.log(`✅ Subscribed to AAA device topic: ${simulatedBroker.topic}`);
  });
});

simulatedClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`📨 Received AAA device message`);

    const deviceInfo = transformDeviceData(payload, 'aaa', topic);
    deviceData.sim = deviceInfo;

    // Always emit sim update for monitoring
    throttledEmit('sim', deviceInfo);

    // Only set AAA as main if original not active
    if (deviceData.mainSource !== 'original') {
      setMainDevice(deviceInfo, 'aaa');
    }

  } catch (error) {
    console.error('❌ Failed to parse AAA device message:', error);
  }
});

simulatedClient.on('error', (error) => {
  connectionStatus.simulated = false;
  console.error('❌ AAA device broker error:', error.message);
});

simulatedClient.on('close', () => {
  connectionStatus.simulated = false;
  console.log('🔌 AAA device broker disconnected');
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`🔗 Client connected: ${socket.id}`);

  socket.emit('initialData', {
    main: deviceData.main,
    sim: deviceData.sim,
    mainSource: deviceData.mainSource,
    connectionStatus
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// REST API endpoints
app.get('/api/devices', (req, res) => {
  res.json({
    success: true,
    data: {
      main: deviceData.main,
      sim: deviceData.sim,
      mainSource: deviceData.mainSource,
      connectionStatus
    }
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
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`🎯 Default main device: AAA (devices/234/data)`);
  console.log(`🎯 Priority device: Original (devices/123/data)`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('⏹️ Shutting down...');
  if (timeoutTimer) clearTimeout(timeoutTimer);
  originalClient.end(true);
  simulatedClient.end(true);
  server.close();
  process.exit(0);
});

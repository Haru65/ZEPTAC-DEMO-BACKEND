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

// BROKER CONFIGURATIONS
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

// Device data - NO main device until message received
let deviceData = {
  main: null,        // Only set when message received
  sim: null,         // Always store simulated device
  original: null,    // Store original device separately
  activeSource: null // Track which source is active: 'original' or 'simulated'
};

// Timing controls
let lastOriginalMessage = null;
const ORIGINAL_TIMEOUT = 30000; // 30 seconds
let timeoutTimer = null;
let connectionStatus = {
  original: false,
  simulated: false
};

// Rate limiting
const UPDATE_THROTTLE = 1000; // 1 second
let lastUpdateTimes = {
  main: 0,
  sim: 0
};

function transformDeviceData(payload, source, topic) {
  return {
    id: payload.SPN?.toString() ?? payload.SN?.toString() ?? "N/A",
    name: payload.API ?? `${source}-device`,
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

// Throttled emit function
function throttledEmit(updateType, data) {
  const now = Date.now();
  const lastUpdate = lastUpdateTimes[updateType] || 0;
  
  if (now - lastUpdate >= UPDATE_THROTTLE) {
    io.emit('deviceUpdate', { type: updateType, data: data });
    lastUpdateTimes[updateType] = now;
    console.log(`📤 Sent ${updateType} update`);
  }
}

// Set main device ONLY when message is received
function setMainDevice(deviceInfo, source) {
  deviceData.main = deviceInfo;
  deviceData.activeSource = source;
  
  // Immediately send to frontend - no delay
  throttledEmit('main', deviceInfo);
  
  console.log(`🎯 Main device set to: ${source}`);
  
  // Emit status
  io.emit('deviceStatus', {
    activeSource: source,
    originalActive: source === 'original'
  });
}

// Handle original device timeout
function handleOriginalTimeout() {
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
  }
  
  timeoutTimer = setTimeout(() => {
    console.log('⏰ Original device timeout');
    
    // If we have simulated data and original was active, switch to simulated
    if (deviceData.sim && deviceData.activeSource === 'original') {
      console.log('🔄 Switching to simulated device');
      setMainDevice(deviceData.sim, 'simulated');
    }
  }, ORIGINAL_TIMEOUT);
}

// ORIGINAL DEVICE CLIENT
originalClient.on('connect', () => {
  connectionStatus.original = true;
  console.log('✅ Original broker connected');
  
  originalClient.subscribe(originalBroker.topic, { qos: 0 }, (err) => {
    if (!err) {
      console.log(`✅ Subscribed to: ${originalBroker.topic}`);
    }
  });
});

originalClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`📨 ORIGINAL message received: ${payload.API || 'Unknown'}`);
    
    const deviceInfo = transformDeviceData(payload, 'original', topic);
    
    // Store original device data
    deviceData.original = deviceInfo;
    lastOriginalMessage = Date.now();
    
    // IMMEDIATELY set as main device (priority)
    setMainDevice(deviceInfo, 'original');
    
    // Reset timeout
    handleOriginalTimeout();
    
  } catch (error) {
    console.error('❌ Original parsing error:', error.message);
  }
});

originalClient.on('error', (error) => {
  connectionStatus.original = false;
  console.error('❌ Original broker error');
});

originalClient.on('close', () => {
  connectionStatus.original = false;
  console.log('🔌 Original broker disconnected');
});

// SIMULATED DEVICE CLIENT
simulatedClient.on('connect', () => {
  connectionStatus.simulated = true;
  console.log('✅ Simulated broker connected');
  
  simulatedClient.subscribe(simulatedBroker.topic, { qos: 0 }, (err) => {
    if (!err) {
      console.log(`✅ Subscribed to: ${simulatedBroker.topic}`);
    }
  });
});

simulatedClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`📨 SIMULATED message received: ${payload.API || 'Unknown'}`);
    
    const deviceInfo = transformDeviceData(payload, 'simulated', topic);
    
    // Always store simulated device data
    deviceData.sim = deviceInfo;
    
    // Always send as "sim" for monitoring
    throttledEmit('sim', deviceInfo);
    
    // ONLY set as main if no original device is currently active
    if (deviceData.activeSource !== 'original') {
      setMainDevice(deviceInfo, 'simulated');
    }
    
  } catch (error) {
    console.error('❌ Simulated parsing error:', error.message);
  }
});

simulatedClient.on('error', (error) => {
  connectionStatus.simulated = false;
  console.error('❌ Simulated broker error');
});

simulatedClient.on('close', () => {
  connectionStatus.simulated = false;
  console.log('🔌 Simulated broker disconnected');
});

// Socket.io handling
io.on('connection', (socket) => {
  console.log(`🔗 Client connected: ${socket.id}`);
  
  // Send current data (main might be null if no messages received yet)
  socket.emit('initialData', {
    main: deviceData.main,           // Could be null initially
    sim: deviceData.sim,             // Could be null initially
    activeSource: deviceData.activeSource,
    connectionStatus
  });
  
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// API endpoints
app.get('/api/devices', (req, res) => {
  res.json({
    success: true,
    data: {
      main: deviceData.main,
      sim: deviceData.sim,
      activeSource: deviceData.activeSource,
      connectionStatus,
      hasReceivedMessages: {
        original: !!deviceData.original,
        simulated: !!deviceData.sim
      }
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeSource: deviceData.activeSource,
    connections: connectionStatus,
    mainDeviceSet: !!deviceData.main
  });
});

// Test endpoints
app.post('/api/test/original', (req, res) => {
  if (!connectionStatus.original) {
    return res.status(503).json({ success: false, message: 'Original broker not connected' });
  }
  
  const testMessage = {
    "ACI": "1.5",
    "DCI": "2.3",
    "EVENT": "NORMAL",
    "TimeStamp": new Date().toISOString(),
    "ACV": "230.5",
    "API": "TEST-ORIGINAL",
    "SPN": Date.now()
  };
  
  originalClient.publish(originalBroker.topic, JSON.stringify(testMessage));
  res.json({ success: true, message: 'Published to original broker' });
});

app.post('/api/test/simulated', (req, res) => {
  if (!connectionStatus.simulated) {
    return res.status(503).json({ success: false, message: 'Simulated broker not connected' });
  }
  
  const testMessage = {
    "ACI": "2.1",
    "DCI": "1.8",
    "EVENT": "NORMAL",
    "TimeStamp": new Date().toISOString(),
    "ACV": "220.0",
    "API": "TEST-SIM",
    "SN": Date.now()
  };
  
  simulatedClient.publish(simulatedBroker.topic, JSON.stringify(testMessage));
  res.json({ success: true, message: 'Published to simulated broker' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('📋 Message-driven device switching enabled');
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

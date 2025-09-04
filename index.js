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
  topic: 'devices/123/data',  // ORIGINAL DEVICE (priority when active)
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
  topic: 'devices/234/data',  // AAA DEVICE (default main device)
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

// Device data management
let deviceData = {
  main: null,        // The active main device shown in frontend
  sim: null,         // Always the AAA device for reference
  original: null,    // Original device data when available
  defaultDevice: 'aaa'  // Default is AAA device
};

// State tracking
let lastOriginalMessage = null;
const ORIGINAL_TIMEOUT = 30000; // 30 seconds before reverting to AAA
let timeoutTimer = null;
let connectionStatus = {
  original: false,
  simulated: false
};

// Rate limiting
const UPDATE_THROTTLE = 1500;
let lastUpdateTimes = { main: 0, sim: 0 };

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

function throttledEmit(updateType, data) {
  const now = Date.now();
  const lastUpdate = lastUpdateTimes[updateType] || 0;
  
  if (now - lastUpdate >= UPDATE_THROTTLE) {
    io.emit('deviceUpdate', { type: updateType, data: data });
    lastUpdateTimes[updateType] = now;
    console.log(`📤 ${updateType} update sent: ${data.name}`);
  }
}

// Handle original device timeout - revert to AAA
function handleOriginalTimeout() {
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
  }
  
  timeoutTimer = setTimeout(() => {
    console.log('⏰ Original device timeout - reverting to AAA device');
    
    if (deviceData.sim) {
      deviceData.main = deviceData.sim;
      deviceData.defaultDevice = 'aaa';
      throttledEmit('main', deviceData.sim);
      
      io.emit('deviceStatus', {
        activeDevice: 'aaa',
        originalActive: false,
        message: 'Reverted to AAA device (original timeout)'
      });
    }
  }, ORIGINAL_TIMEOUT);
}

// ORIGINAL DEVICE CLIENT (devices/123/data)
originalClient.on('connect', () => {
  connectionStatus.original = true;
  console.log('✅ Original device broker connected');
  
  originalClient.subscribe(originalBroker.topic, { qos: 0 }, (err) => {
    if (!err) {
      console.log(`✅ Subscribed to original: ${originalBroker.topic}`);
    }
  });
});

originalClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`📨 ORIGINAL DEVICE MESSAGE: ${payload.API || 'Original'}`);
    
    const deviceInfo = transformDeviceData(payload, 'original', topic);
    deviceData.original = deviceInfo;
    lastOriginalMessage = Date.now();
    
    // SWITCH TO ORIGINAL (priority)
    deviceData.main = deviceInfo;
    deviceData.defaultDevice = 'original';
    throttledEmit('main', deviceInfo);
    
    io.emit('deviceStatus', {
      activeDevice: 'original',
      originalActive: true,
      message: 'Switched to original device'
    });
    
    // Set timeout to revert back to AAA
    handleOriginalTimeout();
    
  } catch (error) {
    console.error('❌ Original device parsing error:', error.message);
  }
});

originalClient.on('error', (error) => {
  connectionStatus.original = false;
  console.error('❌ Original device broker error');
});

originalClient.on('close', () => {
  connectionStatus.original = false;
  console.log('🔌 Original device broker disconnected');
});

// AAA DEVICE CLIENT (devices/234/data) - DEFAULT MAIN DEVICE
simulatedClient.on('connect', () => {
  connectionStatus.simulated = true;
  console.log('✅ AAA device broker connected');
  
  simulatedClient.subscribe(simulatedBroker.topic, { qos: 0 }, (err) => {
    if (!err) {
      console.log(`✅ Subscribed to AAA device: ${simulatedBroker.topic}`);
    }
  });
});

simulatedClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`📨 AAA DEVICE MESSAGE: ${payload.API || 'AAA'}`);
    
    const deviceInfo = transformDeviceData(payload, 'aaa', topic);
    deviceData.sim = deviceInfo;
    
    // Always emit as "sim" for monitoring
    throttledEmit('sim', deviceInfo);
    
    // ONLY set as main if original device is not currently active
    if (deviceData.defaultDevice !== 'original') {
      deviceData.main = deviceInfo;
      throttledEmit('main', deviceInfo);
    }
    
  } catch (error) {
    console.error('❌ AAA device parsing error:', error.message);
  }
});

simulatedClient.on('error', (error) => {
  connectionStatus.simulated = false;
  console.error('❌ AAA device broker error');
});

simulatedClient.on('close', () => {
  connectionStatus.simulated = false;
  console.log('🔌 AAA device broker disconnected');
});

// Socket.io handling
io.on('connection', (socket) => {
  console.log(`🔗 Client connected: ${socket.id}`);
  
  // Send current data - main will be AAA by default
  socket.emit('initialData', {
    main: deviceData.main,
    sim: deviceData.sim,
    defaultDevice: deviceData.defaultDevice,
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
      defaultDevice: deviceData.defaultDevice,
      connectionStatus,
      originalActive: deviceData.defaultDevice === 'original'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeDevice: deviceData.defaultDevice,
    connections: connectionStatus
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
  res.json({ success: true, message: 'Test message sent to original device' });
});

app.post('/api/test/aaa', (req, res) => {
  if (!connectionStatus.simulated) {
    return res.status(503).json({ success: false, message: 'AAA broker not connected' });
  }
  
  const testMessage = {
    "ACI": "2.1",
    "DCI": "1.8",
    "EVENT": "NORMAL",
    "TimeStamp": new Date().toISOString(),
    "ACV": "220.0",
    "API": "AAA",
    "SN": Date.now()
  };
  
  simulatedClient.publish(simulatedBroker.topic, JSON.stringify(testMessage));
  res.json({ success: true, message: 'Test message sent to AAA device' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('🎯 Default: AAA device (devices/234/data)');
  console.log('🎯 Priority: Original device (devices/123/data)');
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

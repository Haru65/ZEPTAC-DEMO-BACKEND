const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mqtt = require('mqtt');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Enable CORS for your frontend
const io = socketIo(server, {
  cors: {
    origin: ["https://zeptac-iot-platform-vp3h-git-main-haru65s-projects.vercel.app", "http://localhost:5175","*","https://zeptac-iot-platform-vp3h.vercel.app","https://zeptac-iot-platform-vp3h-git-main-haru65s-projects.vercel.app?_vercel_share=MMl5C8aRkEJUjSTYG6PgldTRKiDl8a79"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// BROKER 1: Original Device (Zeptac Broker)
const originalBroker = {
  url: 'mqtt://broker.zeptac.com:1883',
  topic: 'devices/123/data',
  options: {
    clientId: 'original-client-' + Math.random().toString(16).substr(2, 8),
    username: 'zeptac_iot',
    password: 'ZepIOT@123',
    keepalive: 60,
    reconnectPeriod: 1000
  }
};

// BROKER 2: Simulated Device (Test Mosquitto)
const simulatedBroker = {
  url: 'mqtt://test.mosquitto.org',
  topic: 'devices/234/data',
  options: {
    clientId: 'simulated-client-' + Math.random().toString(16).substr(2, 8),
    keepalive: 60,
    reconnectPeriod: 1000
  }
};

// Create two separate MQTT clients
const originalClient = mqtt.connect(originalBroker.url, originalBroker.options);
const simulatedClient = mqtt.connect(simulatedBroker.url, simulatedBroker.options);

// Store device data (keeping old structure for frontend compatibility)
let deviceData = {
  main: null,    // This will be the ACTIVE device
  sim: null,     // This will store the simulated device
  original: null, // Internal storage for original device
  active: null   // Track which is active: 'original' or 'simulated'
};

// Priority management
let lastOriginalMessage = null;
const ORIGINAL_TIMEOUT = 30000; // 30 seconds
let timeoutTimer = null;

// Connection status
let connectionStatus = {
  original: false,
  simulated: false
};

// Helper function to transform device data
function transformDeviceData(payload, source, topic) {
  return {
    id: payload.SPN?.toString() ?? payload.SN?.toString() ?? "N/A",
    name: payload.API ?? `${source}-device`,
    icon: 'bi-device',
    type: 'sensor',
    location: payload.LATITUDE && payload.LONGITUDE && (payload.LATITUDE !== 0 || payload.LONGITUDE !== 0)
      ? `${payload.LATITUDE}, ${payload.LONGITUDE}` : "Location not available",
    status: payload.EVENT ?? "UNKNOWN",
    lastSeen: payload.TimeStamp ?? new Date().toISOString(),
    timestamp: Date.now(),
    source: source,
    topic: topic,
    metrics: Object.keys(payload)
      .filter(k => !['API', 'EVENT', 'TimeStamp', 'LATITUDE', 'LONGITUDE', 'SN', 'SPN', 'LOG'].includes(k))
      .map(k => ({
        type: k,
        value: parseFloat(payload[k]) || payload[k],
        unit: getUnitForMetric(k),
        icon: k === 'DCV' || k === 'ACV' ? 'bi-battery' : k === 'DCI' || k === 'ACI' ? 'bi-lightning-charge' : 'bi-graph-up'
      }))
  };
}

function getUnitForMetric(metric) {
  const units = {
    'ACV': 'V', 'DCV': 'V', 'ACI': 'A', 'DCI': 'A',
    'REF1': 'V', 'REF2': 'V', 'OCV': 'V'
  };
  return units[metric] || '';
}

// Function to set active device (compatible with frontend)
function setActiveDevice(deviceType, deviceInfo) {
  deviceData.active = deviceType;
  
  console.log(`🎯 Active device set to: ${deviceType}`);
  
  if (deviceType === 'original') {
    // Original device becomes the "main" device for frontend
    deviceData.main = deviceInfo;
    deviceData.original = deviceInfo;
    
    // Send as "main" type for frontend compatibility
    io.emit('deviceUpdate', { type: 'main', data: deviceInfo });
  } else if (deviceType === 'simulated') {
    // Simulated device becomes the "main" device for frontend
    deviceData.main = deviceInfo;
    
    // Send as "main" type for frontend compatibility
    io.emit('deviceUpdate', { type: 'main', data: deviceInfo });
  }
  
  // Also send status update
  io.emit('deviceStatus', { 
    originalDeviceActive: deviceType === 'original',
    activeDevice: deviceType,
    message: `Active: ${deviceType} device`
  });
}

// Timeout function for original device
function resetOriginalTimeout() {
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
  }
  
  timeoutTimer = setTimeout(() => {
    console.log('⏰ Original device timeout - switching to simulated');
    
    if (deviceData.sim && deviceData.active === 'original') {
      setActiveDevice('simulated', deviceData.sim);
    }
  }, ORIGINAL_TIMEOUT);
}

// ORIGINAL DEVICE CLIENT (Zeptac Broker)
originalClient.on('connect', () => {
  connectionStatus.original = true;
  console.log('✅ Connected to Original Device Broker (Zeptac)');
  
  originalClient.subscribe(originalBroker.topic, { qos: 1 }, (err) => {
    if (!err) {
      console.log(`✅ Subscribed to original topic: ${originalBroker.topic}`);
      io.emit('connectionStatus', { 
        type: 'original', 
        connected: true,
        message: 'Original broker connected'
      });
    } else {
      console.error('❌ Original subscription error:', err);
    }
  });
});

originalClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`📨 ORIGINAL device message:`, payload);
    
    const deviceInfo = transformDeviceData(payload, 'original', topic);
    lastOriginalMessage = Date.now();
    
    // Original device ALWAYS takes priority
    setActiveDevice('original', deviceInfo);
    resetOriginalTimeout();
    
  } catch (error) {
    console.error('❌ Error parsing original device message:', error);
  }
});

originalClient.on('error', (error) => {
  connectionStatus.original = false;
  console.error('❌ Original client error:', error);
  io.emit('connectionStatus', { 
    type: 'original', 
    connected: false,
    error: error.message
  });
});

originalClient.on('close', () => {
  connectionStatus.original = false;
  console.log('🔌 Original client disconnected');
});

// SIMULATED DEVICE CLIENT (Test Mosquitto)
simulatedClient.on('connect', () => {
  connectionStatus.simulated = true;
  console.log('✅ Connected to Simulated Device Broker (Mosquitto)');
  
  simulatedClient.subscribe(simulatedBroker.topic, { qos: 1 }, (err) => {
    if (!err) {
      console.log(`✅ Subscribed to simulated topic: ${simulatedBroker.topic}`);
      io.emit('connectionStatus', { 
        type: 'simulated', 
        connected: true,
        message: 'Simulated broker connected'
      });
    } else {
      console.error('❌ Simulated subscription error:', err);
    }
  });
});

simulatedClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`📨 SIMULATED device message:`, payload);
    
    const deviceInfo = transformDeviceData(payload, 'simulated', topic);
    deviceData.sim = deviceInfo; // Always store simulated device
    
    // Always emit simulated device as "sim" type for monitoring
    io.emit('deviceUpdate', { type: 'sim', data: deviceInfo });
    
    // Only use simulated as main if original is not active
    if (deviceData.active !== 'original') {
      setActiveDevice('simulated', deviceInfo);
    }
    
  } catch (error) {
    console.error('❌ Error parsing simulated device message:', error);
  }
});

simulatedClient.on('error', (error) => {
  connectionStatus.simulated = false;
  console.error('❌ Simulated client error:', error);
});

simulatedClient.on('close', () => {
  connectionStatus.simulated = false;
  console.log('🔌 Simulated client disconnected');
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔗 Client connected:', socket.id);
  
  // Send current state to new client (old format for compatibility)
  socket.emit('initialData', {
    main: deviceData.main,
    sim: deviceData.sim,
    originalDeviceActive: deviceData.active === 'original',
    lastOriginalMessage: lastOriginalMessage,
    connectionStatus: connectionStatus
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// REST API endpoints
app.get('/api/devices', (req, res) => {
  res.json({
    success: true,
    data: {
      main: deviceData.main,
      sim: deviceData.sim,
      originalDeviceActive: deviceData.active === 'original',
      lastOriginalMessage: lastOriginalMessage,
      connectionStatus: connectionStatus
    }
  });
});

app.get('/api/brokers/status', (req, res) => {
  res.json({
    success: true,
    brokers: {
      original: {
        url: originalBroker.url,
        topic: originalBroker.topic,
        connected: connectionStatus.original
      },
      simulated: {
        url: simulatedBroker.url,
        topic: simulatedBroker.topic,
        connected: connectionStatus.simulated
      }
    }
  });
});

// Test endpoints
app.post('/api/test/original', (req, res) => {
  if (!connectionStatus.original) {
    return res.status(503).json({ success: false, message: 'Original broker not connected' });
  }
  
  const testMessage = {
    "LOG": 33,
    "ACI": "1.5",
    "LONGITUDE": 77.5946,
    "DCI": "2.3",
    "EVENT": "NORMAL",
    "TimeStamp": new Date().toISOString(),
    "ACV": "230.5",
    "OCV": "12.6",
    "REF1": "5.00",
    "REF2": "5.00",
    "API": "ORIGINAL-DEVICE",
    "SPN": Date.now(),
    "LATITUDE": 12.9716
  };
  
  originalClient.publish(originalBroker.topic, JSON.stringify(testMessage), (err) => {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
    } else {
      res.json({ success: true, message: 'Published to original broker' });
    }
  });
});

app.post('/api/test/simulated', (req, res) => {
  if (!connectionStatus.simulated) {
    return res.status(503).json({ success: false, message: 'Simulated broker not connected' });
  }
  
  const testMessage = {
    "LOG": 33,
    "ACI": "2.1",
    "LONGITUDE": 0,
    "DCI": "1.8",
    "EVENT": "NORMAL",
    "TimeStamp": new Date().toISOString(),
    "ACV": "220.0",
    "OCV": "11.8",
    "REF1": "5.00",
    "REF2": "5.00",
    "API": "SIM-DEVICE",
    "SN": Date.now(),
    "LATITUDE": 0
  };
  
  simulatedClient.publish(simulatedBroker.topic, JSON.stringify(testMessage), (err) => {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
    } else {
      res.json({ success: true, message: 'Published to simulated broker' });
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeDevice: deviceData.active,
    brokers: {
      original: connectionStatus.original,
      simulated: connectionStatus.simulated
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📡 Dual Broker Setup:`);
  console.log(`   - Original: ${originalBroker.url} (${originalBroker.topic})`);
  console.log(`   - Simulated: ${simulatedBroker.url} (${simulatedBroker.topic})`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('⏹️ Shutting down gracefully...');
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
  }
  originalClient.end();
  simulatedClient.end();
  server.close();
  process.exit(0);
});

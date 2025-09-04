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
    origin: ["https://zeptac-iot-platform-vp3h.vercel.app", "http://localhost:5175","https://zeptac-iot-platform-vp3h-haru65s-projects.vercel.app","*"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// MQTT Configuration for TWO BROKERS
const ORIGINAL_BROKER = {
  url: 'mqtt://broker.zeptac.com:1883',
  topic: 'devices/123/data',
  clientId: 'original-client-' + Math.random().toString(16).substr(2, 8),
  options: {
    username: 'zeptac_iot',
    password: 'ZepIOT@123',
    keepalive: 60,
    reconnectPeriod: 1000,
    connectTimeout: 30 * 1000,
    clean: true
  }
};

const SIMULATED_BROKER = {
  url: 'mqtt://test.mosquitto.org',
  topic: 'devices/234/data',
  clientId: 'sim-client-' + Math.random().toString(16).substr(2, 8),
  options: {
    keepalive: 60,
    reconnectPeriod: 1000,
    connectTimeout: 30 * 1000,
    clean: true
  }
};

// Create two separate MQTT clients
const originalClient = mqtt.connect(ORIGINAL_BROKER.url, {
  ...ORIGINAL_BROKER.options,
  clientId: ORIGINAL_BROKER.clientId
});

const simulatedClient = mqtt.connect(SIMULATED_BROKER.url, {
  ...SIMULATED_BROKER.options,
  clientId: SIMULATED_BROKER.clientId
});

// Store device data and connection status
let deviceData = {
  original: null,
  simulated: null,
  active: null,
  lastOriginalMessage: null
};

let connectionStatus = {
  original: { connected: false, subscribed: false },
  simulated: { connected: false, subscribed: false }
};

// Priority settings
const ORIGINAL_DEVICE_TIMEOUT = 30000; // 30 seconds
let originalDeviceTimer = null;

// Helper function to transform MQTT data
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
    rawData: payload,
    metrics: Object.keys(payload)
      .filter(k => !['API', 'EVENT', 'TimeStamp', 'LATITUDE', 'LONGITUDE', 'SN', 'SPN', 'LOG'].includes(k))
      .map(k => ({
        type: k,
        value: parseFloat(payload[k]) || payload[k],
        unit: getUnitForMetric(k),
        icon: getIconForMetric(k)
      }))
  };
}

// Helper functions for metrics
function getUnitForMetric(metric) {
  const units = {
    'ACV': 'V', 'DCV': 'V', 'ACI': 'A', 'DCI': 'A',
    'REF1': 'V', 'REF2': 'V', 'OCV': 'V'
  };
  return units[metric] || '';
}

function getIconForMetric(metric) {
  const icons = {
    'ACV': 'bi-lightning', 'DCV': 'bi-battery', 'ACI': 'bi-lightning-charge',
    'DCI': 'bi-power', 'REF1': 'bi-speedometer', 'REF2': 'bi-speedometer',
    'OCV': 'bi-battery-half'
  };
  return icons[metric] || 'bi-graph-up';
}

// Function to switch back to simulated device after timeout
function scheduleSimulatedDeviceFallback() {
  if (originalDeviceTimer) {
    clearTimeout(originalDeviceTimer);
  }
  
  originalDeviceTimer = setTimeout(() => {
    console.log('⏰ Original device timeout - switching to simulated device');
    if (deviceData.simulated && deviceData.active === 'original') {
      deviceData.active = 'simulated';
      io.emit('deviceUpdate', { 
        type: 'active', 
        data: deviceData.simulated,
        source: 'simulated'
      });
      io.emit('deviceStatus', { 
        originalDeviceActive: false,
        message: 'Switched to simulated device due to original device timeout'
      });
    }
  }, ORIGINAL_DEVICE_TIMEOUT);
}

// ORIGINAL DEVICE CLIENT (Zeptac Broker)
originalClient.on('connect', () => {
  connectionStatus.original.connected = true;
  console.log('✅ Original device client connected to Zeptac broker');
  
  originalClient.subscribe(ORIGINAL_BROKER.topic, { qos: 1 }, (err, granted) => {
    if (!err) {
      connectionStatus.original.subscribed = true;
      console.log(`✅ Subscribed to original device topic: ${ORIGINAL_BROKER.topic}`);
      io.emit('brokerStatus', { 
        type: 'original', 
        connected: true, 
        subscribed: true,
        message: 'Original device broker connected'
      });
    } else {
      console.error('❌ Original device subscription error:', err);
    }
  });
});

originalClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`📨 Original device message from ${topic}:`, payload);
    
    const deviceInfo = transformDeviceData(payload, 'original', topic);
    
    // Original device has priority
    deviceData.original = deviceInfo;
    deviceData.active = 'original';
    deviceData.lastOriginalMessage = Date.now();
    
    // Reset timeout timer
    scheduleSimulatedDeviceFallback();
    
    // Emit to frontend
    io.emit('deviceUpdate', { 
      type: 'original', 
      data: deviceInfo,
      source: 'original'
    });
    io.emit('deviceUpdate', { 
      type: 'active', 
      data: deviceInfo,
      source: 'original'
    });
    io.emit('deviceStatus', { 
      originalDeviceActive: true,
      message: 'Switched to original device'
    });
    
  } catch (error) {
    console.error('❌ Error parsing original device message:', error);
  }
});

originalClient.on('error', (error) => {
  connectionStatus.original.connected = false;
  console.error('❌ Original device client error:', error);
  io.emit('brokerStatus', { 
    type: 'original', 
    connected: false, 
    error: error.message,
    message: 'Original device broker error'
  });
});

originalClient.on('close', () => {
  connectionStatus.original.connected = false;
  connectionStatus.original.subscribed = false;
  console.log('🔌 Original device client disconnected');
  io.emit('brokerStatus', { 
    type: 'original', 
    connected: false,
    message: 'Original device broker disconnected'
  });
});

// SIMULATED DEVICE CLIENT (Test Mosquitto Broker)
simulatedClient.on('connect', () => {
  connectionStatus.simulated.connected = true;
  console.log('✅ Simulated device client connected to test.mosquitto.org');
  
  simulatedClient.subscribe(SIMULATED_BROKER.topic, { qos: 1 }, (err, granted) => {
    if (!err) {
      connectionStatus.simulated.subscribed = true;
      console.log(`✅ Subscribed to simulated device topic: ${SIMULATED_BROKER.topic}`);
      io.emit('brokerStatus', { 
        type: 'simulated', 
        connected: true, 
        subscribed: true,
        message: 'Simulated device broker connected'
      });
    } else {
      console.error('❌ Simulated device subscription error:', err);
    }
  });
});

simulatedClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`📨 Simulated device message from ${topic}:`, payload);
    
    const deviceInfo = transformDeviceData(payload, 'simulated', topic);
    deviceData.simulated = deviceInfo;
    
    // Only make simulated device active if original device is not active
    if (deviceData.active !== 'original') {
      deviceData.active = 'simulated';
      io.emit('deviceUpdate', { 
        type: 'active', 
        data: deviceInfo,
        source: 'simulated'
      });
      io.emit('deviceStatus', { 
        originalDeviceActive: false,
        message: 'Using simulated device'
      });
    }
    
    // Always emit simulated device data for monitoring
    io.emit('deviceUpdate', { 
      type: 'simulated', 
      data: deviceInfo,
      source: 'simulated'
    });
    
  } catch (error) {
    console.error('❌ Error parsing simulated device message:', error);
  }
});

simulatedClient.on('error', (error) => {
  connectionStatus.simulated.connected = false;
  console.error('❌ Simulated device client error:', error);
  io.emit('brokerStatus', { 
    type: 'simulated', 
    connected: false, 
    error: error.message,
    message: 'Simulated device broker error'
  });
});

simulatedClient.on('close', () => {
  connectionStatus.simulated.connected = false;
  connectionStatus.simulated.subscribed = false;
  console.log('🔌 Simulated device client disconnected');
  io.emit('brokerStatus', { 
    type: 'simulated', 
    connected: false,
    message: 'Simulated device broker disconnected'
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔗 Client connected:', socket.id);
  
  // Send current device data and connection status to newly connected client
  socket.emit('initialData', {
    ...deviceData,
    originalDeviceActive: deviceData.active === 'original',
    lastOriginalMessage: deviceData.lastOriginalMessage,
    connectionStatus
  });
  
  // Send broker status
  socket.emit('brokerStatus', { 
    type: 'original', 
    connected: connectionStatus.original.connected,
    subscribed: connectionStatus.original.subscribed,
    message: connectionStatus.original.connected ? 'Connected' : 'Disconnected'
  });
  
  socket.emit('brokerStatus', { 
    type: 'simulated', 
    connected: connectionStatus.simulated.connected,
    subscribed: connectionStatus.simulated.subscribed,
    message: connectionStatus.simulated.connected ? 'Connected' : 'Disconnected'
  });
  
  // Handle manual device switching
  socket.on('switchToOriginal', () => {
    if (deviceData.original) {
      deviceData.active = 'original';
      scheduleSimulatedDeviceFallback();
      io.emit('deviceUpdate', { 
        type: 'active', 
        data: deviceData.original,
        source: 'original'
      });
      io.emit('deviceStatus', { 
        originalDeviceActive: true,
        message: 'Manually switched to original device'
      });
    }
  });
  
  socket.on('switchToSimulated', () => {
    if (deviceData.simulated) {
      deviceData.active = 'simulated';
      if (originalDeviceTimer) {
        clearTimeout(originalDeviceTimer);
      }
      io.emit('deviceUpdate', { 
        type: 'active', 
        data: deviceData.simulated,
        source: 'simulated'
      });
      io.emit('deviceStatus', { 
        originalDeviceActive: false,
        message: 'Manually switched to simulated device'
      });
    }
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
      ...deviceData,
      originalDeviceActive: deviceData.active === 'original',
      lastOriginalMessage: deviceData.lastOriginalMessage,
      connectionStatus
    }
  });
});

app.get('/api/brokers/status', (req, res) => {
  res.json({
    success: true,
    brokers: {
      original: {
        url: ORIGINAL_BROKER.url,
        topic: ORIGINAL_BROKER.topic,
        connected: connectionStatus.original.connected,
        subscribed: connectionStatus.original.subscribed
      },
      simulated: {
        url: SIMULATED_BROKER.url,
        topic: SIMULATED_BROKER.topic,
        connected: connectionStatus.simulated.connected,
        subscribed: connectionStatus.simulated.subscribed
      }
    }
  });
});

app.get('/api/device/status', (req, res) => {
  res.json({
    success: true,
    active: deviceData.active,
    originalDeviceActive: deviceData.active === 'original',
    lastOriginalMessage: deviceData.lastOriginalMessage,
    hasOriginalDevice: !!deviceData.original,
    hasSimulatedDevice: !!deviceData.simulated,
    connectionStatus
  });
});

// Test endpoints for both brokers
app.post('/api/test/publish/original', (req, res) => {
  const { message } = req.body;
  
  if (!connectionStatus.original.connected) {
    return res.status(503).json({ 
      success: false, 
      message: 'Original broker not connected' 
    });
  }
  
  const testMessage = message || {
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
  
  originalClient.publish(ORIGINAL_BROKER.topic, JSON.stringify(testMessage), (err) => {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
    } else {
      res.json({ success: true, message: 'Test message published to original broker' });
    }
  });
});

app.post('/api/test/publish/simulated', (req, res) => {
  const { message } = req.body;
  
  if (!connectionStatus.simulated.connected) {
    return res.status(503).json({ 
      success: false, 
      message: 'Simulated broker not connected' 
    });
  }
  
  const testMessage = message || {
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
  
  simulatedClient.publish(SIMULATED_BROKER.topic, JSON.stringify(testMessage), (err) => {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
    } else {
      res.json({ success: true, message: 'Test message published to simulated broker' });
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeDevice: deviceData.active,
    originalDeviceActive: deviceData.active === 'original',
    brokers: {
      original: connectionStatus.original.connected,
      simulated: connectionStatus.simulated.connected
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log('📡 MQTT Brokers:');
  console.log(`   - Original: ${ORIGINAL_BROKER.url} (${ORIGINAL_BROKER.topic})`);
  console.log(`   - Simulated: ${SIMULATED_BROKER.url} (${SIMULATED_BROKER.topic})`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('⏹️ Shutting down gracefully...');
  if (originalDeviceTimer) {
    clearTimeout(originalDeviceTimer);
  }
  originalClient.end();
  simulatedClient.end();
  server.close();
  process.exit(0);
});



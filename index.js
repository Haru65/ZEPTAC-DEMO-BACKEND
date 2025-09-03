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
    origin: ["https://zeptac-iot-platform-vp3h-git-main-haru65s-projects.vercel.app", "http://localhost:5175"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// MQTT Configuration
const brokerUrl = 'mqtt://broker.zeptac.com:1883'; // Your actual broker
const ORIGINAL_DEVICE_TOPIC = 'devices/123/data';
const SIMULATED_DEVICE_TOPIC = 'devices/234/data';

// Connect to MQTT broker with credentials
const client = mqtt.connect(brokerUrl, {
  clientId: '123',
  username: 'zeptac_iot',
  password: 'ZepIOT@123'
});

// Store latest device data and priority settings
let deviceData = {
  original: null,
  simulated: null,
  active: null, // Tracks which device is currently active
  lastOriginalMessage: null // Timestamp of last original device message
};

// Priority settings
const ORIGINAL_DEVICE_TIMEOUT = 30000; // 30 seconds - adjust as needed
let originalDeviceTimer = null;

client.on('connect', () => {
  console.log('Backend connected to MQTT broker');
  
  // Subscribe to both topics
  client.subscribe([ORIGINAL_DEVICE_TOPIC, SIMULATED_DEVICE_TOPIC], (err) => {
    if (!err) {
      console.log('Subscribed to device topics');
    } else {
      console.error('Subscription error:', err);
    }
  });
});

// Function to switch back to simulated device after timeout
function scheduleSimulatedDeviceFallback() {
  if (originalDeviceTimer) {
    clearTimeout(originalDeviceTimer);
  }
  
  originalDeviceTimer = setTimeout(() => {
    console.log('Original device timeout - switching to simulated device');
    if (deviceData.simulated) {
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

// Handle incoming MQTT messages
client.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`Received from ${topic}:`, payload);
    
    // Transform MQTT data to frontend format
    const deviceInfo = {
      id: payload.SPN?.toString() ?? payload.SN?.toString() ?? "N/A",
      name: payload.API ?? "",
      icon: 'bi-device',
      type: 'sensor',
      location: payload.LATITUDE && payload.LONGITUDE && (payload.LATITUDE !== 0 || payload.LONGITUDE !== 0)
        ? `${payload.LATITUDE}, ${payload.LONGITUDE}` : "Location not available",
      status: payload.EVENT ?? "UNKNOWN",
      lastSeen: payload.TimeStamp ?? new Date().toISOString(),
      timestamp: Date.now(),
      rawData: payload, // Store original payload for debugging
      metrics: Object.keys(payload)
        .filter(k => !['API', 'EVENT', 'TimeStamp', 'LATITUDE', 'LONGITUDE', 'SN', 'SPN', 'LOG'].includes(k))
        .map(k => ({
          type: k,
          value: parseFloat(payload[k]) || payload[k],
          unit: getUnitForMetric(k),
          icon: getIconForMetric(k)
        }))
    };

    // Handle original device messages (priority)
    if (topic === ORIGINAL_DEVICE_TOPIC) {
      console.log('📡 Original device message received - switching to original device');
      
      deviceData.original = deviceInfo;
      deviceData.active = 'original';
      deviceData.lastOriginalMessage = Date.now();
      
      // Clear any existing timer and set new one
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
    }
    // Handle simulated device messages (fallback)
    else if (topic === SIMULATED_DEVICE_TOPIC) {
      deviceData.simulated = deviceInfo;
      
      // Only make simulated device active if original device is not active
      if (deviceData.active !== 'original') {
        deviceData.active = 'simulated';
        io.emit('deviceUpdate', { 
          type: 'active', 
          data: deviceInfo,
          source: 'simulated'
        });
      }
      
      // Always emit simulated device data for logging/monitoring
      io.emit('deviceUpdate', { 
        type: 'simulated', 
        data: deviceInfo,
        source: 'simulated'
      });
    }

  } catch (error) {
    console.error('Error parsing MQTT message:', error);
  }
});

// Helper functions
function getUnitForMetric(metric) {
  const units = {
    'ACV': 'V',
    'DCV': 'V',
    'ACI': 'A',
    'DCI': 'A',
    'REF1': 'V',
    'REF2': 'V',
    'OCV': 'V'
  };
  return units[metric] || '';
}

function getIconForMetric(metric) {
  const icons = {
    'ACV': 'bi-lightning',
    'DCV': 'bi-battery',
    'ACI': 'bi-lightning-charge',
    'DCI': 'bi-power',
    'REF1': 'bi-speedometer',
    'REF2': 'bi-speedometer',
    'OCV': 'bi-battery-half'
  };
  return icons[metric] || 'bi-graph-up';
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current device data to newly connected client
  socket.emit('initialData', {
    ...deviceData,
    originalDeviceActive: deviceData.active === 'original',
    lastOriginalMessage: deviceData.lastOriginalMessage
  });
  
  // Handle manual device switching from frontend
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
    console.log('Client disconnected:', socket.id);
  });
});

// REST API endpoints
app.get('/api/devices', (req, res) => {
  res.json({
    success: true,
    data: {
      ...deviceData,
      originalDeviceActive: deviceData.active === 'original',
      lastOriginalMessage: deviceData.lastOriginalMessage
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
    hasSimulatedDevice: !!deviceData.simulated
  });
});

app.post('/api/device/switch', (req, res) => {
  const { target } = req.body;
  
  if (target === 'original' && deviceData.original) {
    deviceData.active = 'original';
    scheduleSimulatedDeviceFallback();
    io.emit('deviceUpdate', { 
      type: 'active', 
      data: deviceData.original,
      source: 'original'
    });
    res.json({ success: true, message: 'Switched to original device' });
  } else if (target === 'simulated' && deviceData.simulated) {
    deviceData.active = 'simulated';
    if (originalDeviceTimer) {
      clearTimeout(originalDeviceTimer);
    }
    io.emit('deviceUpdate', { 
      type: 'active', 
      data: deviceData.simulated,
      source: 'simulated'
    });
    res.json({ success: true, message: 'Switched to simulated device' });
  } else {
    res.status(400).json({ success: false, message: 'Invalid target or device not available' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeDevice: deviceData.active,
    originalDeviceActive: deviceData.active === 'original'
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`Monitoring topics:`);
  console.log(`- Original device: ${ORIGINAL_DEVICE_TOPIC}`);
  console.log(`- Simulated device: ${SIMULATED_DEVICE_TOPIC}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  if (originalDeviceTimer) {
    clearTimeout(originalDeviceTimer);
  }
  client.end();
  server.close();
  process.exit(0);
});

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mqtt = require('mqtt');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: ["https://zeptac-iot-platform-vp3h-kljhebkdt-haru65s-projects.vercel.app", "http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// MQTT Broker configuration for device 123
const deviceBroker = {
  url: 'mqtt://broker.zeptac.com:1883',
  dataTopic: 'devices/123/data',
  commandTopic: 'devices/123/commands',
  options: {
    clientId: '123',
    username: 'zeptac_iot',
    password: 'ZepIOT@123',
    keepalive: 45,
    reconnectPeriod: 10000,
    connectTimeout: 15000,
    clean: true
  }
};

const deviceClient = mqtt.connect(deviceBroker.url, deviceBroker.options);

// Device data state
let deviceData = {
  device: null
};

let lastDeviceTimestamp = 0;
let connectionStatus = {
  device: false
};

// Basic data transform helper
function transformDeviceData(payload, topic) {
  return {
    id: payload.SPN?.toString() ?? payload.SN?.toString() ?? "123",
    name: payload.API ?? 'Device-123',
    icon: 'bi-device',
    type: 'IoT Sensor',
    location: payload.LATITUDE && payload.LONGITUDE && (payload.LATITUDE !== 0 || payload.LONGITUDE !== 0)
      ? `${payload.LATITUDE}, ${payload.LONGITUDE}` : "Mumbai, India",
    status: payload.EVENT ?? "NORMAL",
    lastSeen: payload.TimeStamp ?? new Date().toISOString(),
    timestamp: Date.now(),
    source: "device-123",
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
let lastUpdateTime = 0;

function throttledEmit(data) {
  const now = Date.now();
  if (now - lastUpdateTime >= UPDATE_THROTTLE) {
    io.emit('deviceUpdate', { type: 'device', data });
    lastUpdateTime = now;
  }
}

// MQTT event handlers for device 123
deviceClient.on('connect', () => {
  connectionStatus.device = true;
  console.log('✅ Connected to device 123 broker (broker.zeptac.com)');
  console.log('📡 Device Configuration:', {
    broker: deviceBroker.url,
    dataTopic: deviceBroker.dataTopic,
    commandTopic: deviceBroker.commandTopic,
    clientId: deviceBroker.options.clientId,
    username: deviceBroker.options.username
  });
  
  deviceClient.subscribe(deviceBroker.dataTopic, { qos: 0 }, err => {
    if (!err) {
      console.log(`📥 Subscribed to device topic: ${deviceBroker.dataTopic}`);
      console.log('🔔 Waiting for MQTT messages from device 123...');
    } else {
      console.error('❌ Subscription error:', err);
    }
  });
});

deviceClient.on('message', (topic, message) => {
  console.log('\n� DEVICE 123 MESSAGE RECEIVED:');
  console.log('📍 Topic:', topic);
  console.log('📄 Raw Message:', message.toString());
  console.log('📏 Message Length:', message.length);
  console.log('⏰ Timestamp:', new Date().toISOString());
  
  try {
    const payload = JSON.parse(message.toString());
    console.log('✅ Parsed JSON Payload:', JSON.stringify(payload, null, 2));
    
    const deviceInfo = transformDeviceData(payload, topic);
    console.log('🔄 Transformed Device Info:', JSON.stringify(deviceInfo, null, 2));
    
    deviceData.device = deviceInfo;
    lastDeviceTimestamp = Date.now();
    throttledEmit(deviceInfo);
    
    console.log('💾 Updated device data and notified frontend\n');
  } catch (err) {
    console.error('❌ Error parsing device message:', err);
    console.error('📄 Original message:', message.toString());
    console.error('🔍 Error details:', err.message);
  }
});

deviceClient.on('close', () => {
  connectionStatus.device = false;
  console.log('❌ Device 123 broker disconnected');
});

deviceClient.on('error', err => {
  connectionStatus.device = false;
  console.error('❌ Device 123 client error:', err);
});

deviceClient.on('offline', () => {
  console.log('📱 Device 123 client is offline');
});

deviceClient.on('reconnect', () => {
  console.log('🔄 Device 123 client reconnecting...');
});

// Socket.io connection handler
io.on('connection', socket => {
  console.log(`🔗 Client connected: ${socket.id}`);
  
  // Send only real device data
  const initialData = {
    main: deviceData.device, // Send device data as main
    sim: null, // No simulated device
    mainSource: 'device',
    connectionStatus
  };
  
  socket.emit('initialData', initialData);
  
  console.log('📤 Sent initial data to client:', {
    device: initialData.main ? initialData.main.name : 'No data',
    connectionStatus: connectionStatus.device ? 'Connected' : 'Disconnected'
  });

  // Handle message sending from frontend
  socket.on('sendMessage', (messageData, callback) => {
    console.log('\n📨 MESSAGE SEND REQUEST RECEIVED:');
    console.log('🔗 Socket ID:', socket.id);
    console.log('📄 Message Data:', JSON.stringify(messageData, null, 2));
    console.log('⏰ Request Time:', new Date().toISOString());
    
    try {
      const { text, type, targetDevice, timestamp } = messageData;
      
      if (!text || !text.trim()) {
        console.log('❌ Message validation failed: Empty text');
        callback({ success: false, error: 'Message text is required' });
        return;
      }

      console.log('✅ Message validation passed');
      console.log('📝 Message text:', text);
      console.log('🎯 Target type:', type);
      console.log('🔧 Target device:', targetDevice);

      const messagePayload = {
        message: text.trim(),
        timestamp: timestamp || new Date().toISOString(),
        sender: 'frontend',
        type: type || 'individual'
      };

      console.log('� Publishing message to device 123...');
      console.log('   Topic:', deviceBroker.commandTopic);
      console.log('   Payload:', JSON.stringify(messagePayload, null, 2));

      if (!connectionStatus.device) {
        console.log('❌ Device 123 not connected');
        callback({ 
          success: false, 
          error: 'Device 123 is not connected' 
        });
        return;
      }

      deviceClient.publish(deviceBroker.commandTopic, JSON.stringify(messagePayload), { qos: 1 }, (err) => {
        if (err) {
          console.error('❌ Error publishing to device 123:', err);
          callback({ 
            success: false, 
            error: `Failed to send message: ${err.message}` 
          });
        } else {
          console.log('✅ Message published to device 123 successfully');
          const response = { 
            success: true, 
            messageId: `msg_${Date.now()}`,
            details: `Message sent to device 123`
          };
          console.log('✅ Message sending successful:', response);
          callback(response);
          
          // Notify all connected clients about the message
          io.emit('messageNotification', {
            type: 'sent',
            message: messagePayload,
            targets: 'device-123'
          });
        }
      });
    } catch (error) {
      console.error('❌ Error processing message:', error);
      callback({ 
        success: false, 
        error: 'Internal server error while processing message' 
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

app.get('/api/devices', (req, res) => {
  res.json({
    success: true,
    data: { 
      device: deviceData.device,
      connectionStatus: connectionStatus.device,
      lastUpdate: lastDeviceTimestamp
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    device: deviceData.device ? 'connected' : 'no-data',
    connectionStatus: connectionStatus.device
  });
});

// API endpoint for sending messages to device 123
app.post('/api/send-message', (req, res) => {
  const { text, type = 'individual' } = req.body;
  
  if (!text || !text.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Message text is required'
    });
  }

  if (!connectionStatus.device) {
    return res.status(503).json({
      success: false,
      error: 'Device 123 is not connected'
    });
  }

  const messagePayload = {
    message: text.trim(),
    timestamp: new Date().toISOString(),
    sender: 'api',
    type: type
  };

  deviceClient.publish(deviceBroker.commandTopic, JSON.stringify(messagePayload), { qos: 1 }, (err) => {
    if (err) {
      console.error('❌ API: Error publishing to device 123:', err);
      res.status(500).json({
        success: false,
        error: `Failed to send message: ${err.message}`
      });
    } else {
      console.log('✅ API: Message published to device 123 successfully');
      res.json({
        success: true,
        messageId: `msg_${Date.now()}`,
        details: `Message sent to device 123 via API`
      });
      
      // Notify all connected Socket.io clients about the message
      io.emit('messageNotification', {
        type: 'sent',
        message: messagePayload,
        targets: 'device-123'
      });
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('📊 Device Configuration:');
  console.log('   Device 123:', {
    broker: deviceBroker.url,
    dataTopic: deviceBroker.dataTopic,
    commandTopic: deviceBroker.commandTopic,
    username: deviceBroker.options.username
  });
  console.log('⏳ Waiting for real MQTT data from device 123...');
});

// Periodic status logging
setInterval(() => {
  console.log('\n📊 === STATUS REPORT ===');
  console.log('⏰ Time:', new Date().toISOString());
  console.log('🔗 Device 123 Status:', connectionStatus.device ? '✅ Connected' : '❌ Disconnected');
  console.log('📱 Device Data:', deviceData.device ? `✅ Available (${deviceData.device.name})` : '❌ No data');
  console.log('🔄 Last update:', lastDeviceTimestamp ? new Date(lastDeviceTimestamp).toISOString() : 'Never');
  console.log('========================\n');
}, 30000); // Report every 30 seconds

process.on('SIGINT', () => {
  deviceClient.end(true);
  server.close();
  process.exit(0);
});

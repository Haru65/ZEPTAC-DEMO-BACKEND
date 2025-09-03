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
    origin: ["https://zeptac-iot-platform-vp3h-git-main-haru65s-projects.vercel.app", "http://localhost:5175"], // Your Vue.js dev server
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// MQTT Configuration
const brokerUrl = 'mqtt://test.mosquitto.org';
const MAIN_TOPIC = 'devices/234/data';
const SIM_TOPIC = 'devices/123/data';

// Connect to MQTT broker
const client = mqtt.connect(brokerUrl);

// Store latest device data
let deviceData = {
  main: null,
  sim: null
};

client.on('connect', () => {
  console.log('Backend connected to MQTT broker');
  
  // Subscribe to both topics
  client.subscribe([MAIN_TOPIC, SIM_TOPIC], (err) => {
    if (!err) {
      console.log('Subscribed to device topics');
    } else {
      console.error('Subscription error:', err);
    }
  });
});

// Handle incoming MQTT messages
client.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`Received from ${topic}:`, payload);
    
    // Transform MQTT data to frontend format
    const deviceInfo = {
      id: payload.SN?.toString() ?? "N/A",
      name: payload.API ?? "",
      icon: 'bi-device',
      type: 'sensor',
      location: payload.LATITUDE && payload.LONGITUDE
        ? `${payload.LATITUDE}, ${payload.LONGITUDE}` : "",
      status: payload.EVENT ?? "",
      lastSeen: payload.TimeStamp ?? "",
      timestamp: Date.now(),
      metrics: Object.keys(payload)
        .filter(k => !['API', 'EVENT', 'TimeStamp', 'LATITUDE', 'LONGITUDE', 'SN', 'LOG'].includes(k))
        .map(k => ({
          type: k,
          value: parseFloat(payload[k]),
          icon: k === 'DCV' || k === 'ACV'
            ? 'bi-battery'
            : k === 'DCI' || k === 'ACI'
            ? 'bi-lightning-charge'
            : 'bi-graph-up'
        }))
    };

    // Store data and determine device type
    if (topic === MAIN_TOPIC) {
      deviceData.main = deviceInfo;
      io.emit('deviceUpdate', { type: 'main', data: deviceInfo });
    } else if (topic === SIM_TOPIC) {
      deviceData.sim = deviceInfo;
      io.emit('deviceUpdate', { type: 'sim', data: deviceInfo });
    }

  } catch (error) {
    console.error('Error parsing MQTT message:', error);
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current device data to newly connected client
  socket.emit('initialData', deviceData);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// REST API endpoints
app.get('/api/devices', (req, res) => {
  res.json({
    success: true,
    data: deviceData
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  client.end();
  server.close();
  process.exit(0);
});

const express = require('express');
const http = require('http');
const cors = require('cors');
require('dotenv').config();

// Import configurations
const { connectDB } = require('./config/database');
const { initializeSocket } = require('./config/socket');

// Import services
const mqttService = require('./services/mqttService');
const socketService = require('./services/socketService');

// Import routes
const routes = require('./routes');
const deviceConfigRoutes = require('./routes/deviceConfig');
const telemetryRoutes = require('./routes/telemetry');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = initializeSocket(server);

// Connect to database
connectDB();

// Middleware
app.use(cors({
  origin: [
    "https://zeptac-iot-platform-vp3h-an8ipta4q-haru65s-projects.vercel.app",
    "https://zeptac-iot-platform-vp3h-kljhebkdt-haru65s-projects.vercel.app", 
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:5174"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
app.use(express.json());

// Initialize services
mqttService.initialize(io);
socketService.initialize(io);

// Routes
app.use('/', routes);
app.use('/api', deviceConfigRoutes);
app.use('/api/telemetry', telemetryRoutes);

// Periodic status logging
const startStatusReporting = () => {
  setInterval(() => {
    console.log('\n📊 === STATUS REPORT ===');
    console.log('⏰ Time:', new Date().toISOString());
    console.log('🔗 Device 123 Status:', mqttService.isDeviceConnected() ? '✅ Connected' : '❌ Disconnected');
    
    const deviceData = mqttService.getDeviceData();
    console.log('📱 Device Data:', deviceData.device ? `✅ Available (${deviceData.device.name})` : '❌ No data');
    
    const lastUpdate = mqttService.getLastTimestamp();
    console.log('🔄 Last update:', lastUpdate ? new Date(lastUpdate).toISOString() : 'Never');
    console.log('========================\n');
  }, 30000); // Report every 30 seconds
};

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('📊 Device Configuration initialized');
  console.log('⏳ Waiting for real MQTT data from device 123...');
  
  // Start periodic status reporting
  startStatusReporting();
});

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('\n🔄 Shutting down gracefully...');
  mqttService.disconnect();
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

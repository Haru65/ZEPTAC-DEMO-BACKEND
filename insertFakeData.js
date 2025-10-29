const mongoose = require('mongoose');
const Telemetry = require('./models/telemetry');
const Device = require('./models/Device');
require('dotenv').config();

// Sample device configurations
const devices = [
  {
    deviceId: '123',
    name: 'Temperature Sensor 1',
    type: 'sensor',
    location: { latitude: 19.0760, longitude: 72.8777 } // Mumbai
  },
  {
    deviceId: '124',
    name: 'Humidity Sensor 1',
    type: 'sensor',
    location: { latitude: 28.7041, longitude: 77.1025 } // Delhi
  },
  {
    deviceId: '125',
    name: 'Power Meter 1',
    type: 'sensor',
    location: { latitude: 12.9716, longitude: 77.5946 } // Bangalore
  }
];

// Generate random values for different sensor types
const generateSensorData = (deviceId) => {
  const baseData = {
    API: `Device-${deviceId}`,
    TimeStamp: new Date().toISOString(),
    EVENT: Math.random() > 0.1 ? 'NORMAL' : 'ALERT', // 90% normal, 10% alerts
    SPN: deviceId,
    LATITUDE: devices.find(d => d.deviceId === deviceId)?.location.latitude || 0,
    LONGITUDE: devices.find(d => d.deviceId === deviceId)?.location.longitude || 0
  };

  // Device-specific data based on device ID
  switch (deviceId) {
    case '123': // Temperature sensor
      return {
        ...baseData,
        TEMPERATURE: (20 + Math.random() * 15).toFixed(2), // 20-35°C
        HUMIDITY: (40 + Math.random() * 40).toFixed(1), // 40-80%
        PRESSURE: (980 + Math.random() * 40).toFixed(1), // 980-1020 hPa
        BATTERY: (75 + Math.random() * 25).toFixed(1), // 75-100%
        SIGNAL_STRENGTH: (-40 - Math.random() * 40).toFixed(0) // -40 to -80 dBm
      };
    
    case '124': // Humidity sensor
      return {
        ...baseData,
        HUMIDITY: (30 + Math.random() * 50).toFixed(1), // 30-80%
        TEMPERATURE: (18 + Math.random() * 20).toFixed(2), // 18-38°C
        DEW_POINT: (10 + Math.random() * 15).toFixed(1), // 10-25°C
        BATTERY: (60 + Math.random() * 40).toFixed(1), // 60-100%
        MOISTURE_LEVEL: (20 + Math.random() * 60).toFixed(1) // 20-80%
      };
    
    case '125': // Power meter
      return {
        ...baseData,
        DCV: (220 + Math.random() * 20).toFixed(2), // 220-240V DC
        ACV: (230 + Math.random() * 10).toFixed(2), // 230-240V AC
        DCI: (5 + Math.random() * 10).toFixed(2), // 5-15A DC
        ACI: (8 + Math.random() * 12).toFixed(2), // 8-20A AC
        POWER: (1000 + Math.random() * 2000).toFixed(0), // 1-3kW
        ENERGY: (Math.random() * 100).toFixed(2), // 0-100 kWh
        FREQUENCY: (49.5 + Math.random() * 1).toFixed(2), // 49.5-50.5 Hz
        POWER_FACTOR: (0.8 + Math.random() * 0.2).toFixed(3) // 0.8-1.0
      };
    
    default:
      return {
        ...baseData,
        VALUE: (Math.random() * 100).toFixed(2),
        STATUS: Math.random() > 0.2 ? 'ONLINE' : 'OFFLINE'
      };
  }
};

// Insert fake telemetry data
async function insertFakeTelemetryData(deviceId, count = 100, hoursBack = 24) {
  const records = [];
  const now = new Date();
  
  for (let i = 0; i < count; i++) {
    // Generate timestamps spread over the last hoursBack hours
    const timestamp = new Date(now.getTime() - (Math.random() * hoursBack * 60 * 60 * 1000));
    
    const sensorData = generateSensorData(deviceId);
    const dataMap = new Map();
    
    // Convert object to Map for telemetry schema
    Object.entries(sensorData).forEach(([key, value]) => {
      if (!['API', 'TimeStamp', 'EVENT', 'SPN'].includes(key)) {
        dataMap.set(key, value);
      }
    });
    
    const record = {
      deviceId: deviceId,
      timestamp: timestamp,
      event: sensorData.EVENT,
      data: dataMap
    };
    
    records.push(record);
  }
  
  // Sort by timestamp
  records.sort((a, b) => a.timestamp - b.timestamp);
  
  try {
    await Telemetry.insertMany(records);
    console.log(`✅ Inserted ${records.length} fake telemetry records for device ${deviceId}`);
    return records.length;
  } catch (error) {
    console.error(`❌ Error inserting telemetry data for device ${deviceId}:`, error);
    return 0;
  }
}

// Create or update device records
async function createDeviceRecords() {
  for (const deviceConfig of devices) {
    try {
      await Device.findOneAndUpdate(
        { deviceId: deviceConfig.deviceId },
        {
          deviceId: deviceConfig.deviceId,
          name: deviceConfig.name,
          type: deviceConfig.type,
          status: 'active',
          lastSeen: new Date(),
          mqtt: {
            brokerUrl: 'mqtt://test.mosquitto.org',
            topics: [`devices/${deviceConfig.deviceId}/data`],
            options: {
              qos: 1,
              keepalive: 60,
              clean: true
            }
          },
          location: deviceConfig.location
        },
        { upsert: true, new: true }
      );
      console.log(`✅ Device ${deviceConfig.deviceId} created/updated`);
    } catch (error) {
      console.error(`❌ Error creating device ${deviceConfig.deviceId}:`, error);
    }
  }
}

// Main function to insert all fake data
async function insertAllFakeData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zeptac_iot');
    console.log('✅ MongoDB connected');

    // Create device records
    await createDeviceRecords();

    // Insert telemetry data for each device
    let totalRecords = 0;
    for (const device of devices) {
      const count = await insertFakeTelemetryData(device.deviceId, 150, 48); // 150 records over last 48 hours
      totalRecords += count;
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total devices: ${devices.length}`);
    console.log(`   Total telemetry records: ${totalRecords}`);
    console.log(`   Time range: Last 48 hours`);

  } catch (error) {
    console.error('❌ Error inserting fake data:', error);
  } finally {
    await mongoose.connection.close();
    console.log('✅ MongoDB disconnected');
    process.exit(0);
  }
}

// Clear existing data (optional)
async function clearExistingData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zeptac_iot');
    console.log('✅ MongoDB connected');

    await Telemetry.deleteMany({});
    console.log('🗑️ Cleared existing telemetry data');

    await Device.deleteMany({});
    console.log('🗑️ Cleared existing device data');

  } catch (error) {
    console.error('❌ Error clearing data:', error);
  } finally {
    await mongoose.connection.close();
    console.log('✅ MongoDB disconnected');
    process.exit(0);
  }
}

// Command line arguments
const args = process.argv.slice(2);
if (args.includes('--clear')) {
  clearExistingData();
} else {
  insertAllFakeData();
}

module.exports = {
  insertFakeTelemetryData,
  createDeviceRecords,
  generateSensorData
};
const mongoose = require('mongoose');
const Telemetry = require('./models/telemetry');
require('dotenv').config();

async function insertSampleTelemetryData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zeptac_iot');
    console.log('✅ MongoDB connected');

    // Clear existing telemetry data
    await Telemetry.deleteMany({});
    console.log('🗑️  Cleared existing telemetry data');

    // Generate sample data for multiple devices
    const devices = ['123', '124', '125'];
    const events = ['NORMAL', 'WARNING', 'ALERT', 'INFO'];
    const statuses = ['active', 'warning', 'error', 'offline'];
    
    const sampleData = [];
    
    // Generate data for the last 7 days
    const now = new Date();
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour += 2) { // Every 2 hours
        for (const deviceId of devices) {
          const timestamp = new Date(now.getTime() - (day * 24 * 60 * 60 * 1000) - (hour * 60 * 60 * 1000));
          
          sampleData.push({
            deviceId: deviceId,
            timestamp: timestamp,
            event: events[Math.floor(Math.random() * events.length)],
            data: new Map([
              ['voltage', (Math.random() * 2 + 3).toFixed(2)], // 3-5V
              ['current', (Math.random() * 1.5 + 0.5).toFixed(3)], // 0.5-2A
              ['temperature', (Math.random() * 25 + 20).toFixed(1)], // 20-45°C
              ['humidity', (Math.random() * 40 + 40).toFixed(1)], // 40-80%
              ['status', statuses[Math.floor(Math.random() * statuses.length)]],
              ['battery', (Math.random() * 20 + 80).toFixed(0)], // 80-100%
              ['signal_strength', (-Math.random() * 30 - 40).toFixed(0)] // -40 to -70 dBm
            ])
          });
        }
      }
    }

    // Insert sample data
    await Telemetry.insertMany(sampleData);
    console.log(`✅ Inserted ${sampleData.length} sample telemetry records`);
    
    // Show summary
    const summary = await Telemetry.aggregate([
      {
        $group: {
          _id: '$deviceId',
          count: { $sum: 1 },
          latestTimestamp: { $max: '$timestamp' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    console.log('\n📊 Sample Data Summary:');
    summary.forEach(item => {
      console.log(`   Device ${item._id}: ${item.count} records (latest: ${item.latestTimestamp.toISOString()})`);
    });

  } catch (error) {
    console.error('❌ Error inserting sample telemetry data:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

insertSampleTelemetryData();
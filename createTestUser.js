const mongoose = require('mongoose');
const User = require('./models/user');
require('dotenv').config();

async function createTestUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zeptac_iot');
    console.log('✅ MongoDB connected');

    // Check if test user already exists
    const existingUser = await User.findOne({ email: 'admin@zeptac.com' });
    if (existingUser) {
      console.log('👤 Test user already exists:', existingUser.email);
      process.exit(0);
    }

    // Create test user
    const testUser = new User({
      username: 'admin',
      email: 'admin@zeptac.com',
      password: 'admin123', // This will be hashed automatically
      role: 'admin',
      permissions: ['read_devices', 'write_devices', 'send_commands', 'manage_users', 'view_logs']
    });

    await testUser.save();
    console.log('✅ Test user created successfully:');
    console.log('   Email: admin@zeptac.com');
    console.log('   Password: admin123');
    console.log('   Role: admin');

  } catch (error) {
    console.error('❌ Error creating test user:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

createTestUser();
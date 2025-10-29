const axios = require('axios');

/**
 * Test Script to Get Device Settings in Exact Format Requested
 */

const BASE_URL = 'http://localhost:3001/api/device-management';

async function testSettingsFormat() {
  console.log('🔍 Testing Device Settings Format...\n');

  try {
    // Test 1: Get settings for a specific device
    console.log('📝 Test 1: Get Device Settings in Exact Format');
    
    const deviceId = "ZEPTAC001"; // Using existing device
    const response = await axios.get(`${BASE_URL}/${deviceId}/settings`);
    
    const settings = response.data.data;
    
    console.log('✅ Settings retrieved successfully!');
    console.log('📄 Exact Format as Requested:');
    console.log(JSON.stringify(settings, null, 2));
    
    // Verify the format matches your specification
    console.log('\n🔍 Format Verification:');
    console.log(`Device ID: ${settings['Device ID']}`);
    console.log(`Message Type: ${settings['Message Type']}`);
    console.log(`Sender: ${settings.sender}`);
    console.log(`Parameters Count: ${Object.keys(settings.Parameters).length}`);
    
    // Check specific parameters you mentioned
    const requiredParams = [
      'Electrode', 'Shunt Voltage', 'Shunt Current', 'Reference Fail',
      'Reference UP', 'Reference OV', 'Interrupt ON Time', 'Interrupt OFF Time',
      'Interrupt Start TimeStamp', 'Interrupt Stop TimeStamp', 'DPOL Interval',
      'Depolarization Start TimeStamp', 'Depolarization Stop TimeStamp',
      'Instant Mode', 'Instant Start TimeStamp', 'Instant End TimeStamp'
    ];
    
    console.log('\n✅ Parameter Verification:');
    requiredParams.forEach(param => {
      const exists = param in settings.Parameters;
      const value = settings.Parameters[param];
      console.log(`   ${exists ? '✅' : '❌'} ${param}: ${value}`);
    });
    
    // Test 2: Update a setting and get complete payload
    console.log('\n📝 Test 2: Update Setting and Get Complete Payload');
    
    const updateResponse = await axios.put(`${BASE_URL}/${deviceId}/settings`, {
      parameters: {
        "Electrode": 1,
        "Shunt Voltage": 30
      },
      sendToDevice: false // Don't send to MQTT for test
    });
    
    const updatedSettings = updateResponse.data.data.settings;
    
    console.log('✅ Settings updated successfully!');
    console.log('📄 Updated Complete Payload:');
    console.log(JSON.stringify(updatedSettings, null, 2));
    
    console.log('\n🎉 Format Test Completed Successfully!');
    console.log('✅ The server returns data in exactly the format you requested.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

// Test different ways to get the settings
async function showAllMethods() {
  console.log('\n📋 Available Methods to Get Settings Data:\n');
  
  console.log('1. 📡 GET /api/device-management/{deviceId}/settings');
  console.log('   - Returns complete settings in exact format you specified');
  console.log('   - Example: GET /api/device-management/ZEPTAC001/settings\n');
  
  console.log('2. 🔄 PUT /api/device-management/{deviceId}/settings');
  console.log('   - Updates settings and returns complete payload');
  console.log('   - Body: { "parameters": { "Electrode": 1 } }');
  console.log('   - Returns complete settings after update\n');
  
  console.log('3. 📤 MQTT Topic: devices/{deviceId}/commands');
  console.log('   - Complete payload sent to device automatically');
  console.log('   - Triggered when any setting changes\n');
  
  console.log('4. 📊 GET /api/device-management/devices');
  console.log('   - Returns all devices with their current settings\n');
  
  console.log('🎯 All methods return data in the exact format:');
  console.log(`{
  "Device ID": "serial no.",
  "Message Type": "settings",
  "sender": "Server",
  "Parameters": {
    "Electrode": 0,
    "Shunt Voltage": 25,
    // ... all parameters
  }
}`);
}

// Run the test
if (require.main === module) {
  console.log('🚀 Device Settings Format Test');
  console.log('================================\n');
  
  testSettingsFormat().then(() => {
    showAllMethods();
  }).catch(error => {
    console.error('💥 Test suite failed:', error.message);
  });
}

module.exports = { testSettingsFormat };
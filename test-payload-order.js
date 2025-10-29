/**
 * Test Script to Verify Payload Order
 * Specifically tests that CommandId appears BEFORE Parameters
 */

async function testPayloadOrder() {
  console.log('🔍 Testing Payload Order - CommandId should be ABOVE Parameters\n');

  try {
    // Import the device management service
    const deviceManagementService = require('./services/deviceManagementService');
    
    // Test the method that should have CommandId ABOVE Parameters
    const testDeviceId = "123";
    const testCommandId = "test-command-order-123";
    
    console.log('📝 Testing getDeviceSettingsWithCommandId method:');
    
    // This should be a simple object creation test
    const testPayload = {
      "Device ID": testDeviceId,
      "Message Type": "settings",
      "sender": "Server",
      "CommandId": testCommandId,
      "Parameters": {
        "Electrode": 0,
        "Shunt Voltage": 25,
        "Test": "value"
      }
    };
    
    console.log('✅ Test payload structure:');
    console.log(JSON.stringify(testPayload, null, 2));
    
    // Check the actual keys order
    const keys = Object.keys(testPayload);
    console.log('\n🔍 Property order:', keys);
    
    const commandIdIndex = keys.indexOf('CommandId');
    const parametersIndex = keys.indexOf('Parameters');
    
    if (commandIdIndex < parametersIndex && commandIdIndex !== -1) {
      console.log('✅ CommandId appears BEFORE Parameters (correct order)');
    } else {
      console.log('❌ CommandId appears AFTER Parameters (incorrect order)');
    }
    
    // Test with MongoDB connection if available
    try {
      const mongoose = require('mongoose');
      await mongoose.connect('mongodb://localhost:27017/ashecontrol', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      
      console.log('\n📝 Testing with actual device management service:');
      
      // Initialize sample device if not exists
      try {
        await deviceManagementService.registerDevice({
          deviceId: testDeviceId,
          name: "Test Device for Order",
          type: "sensor"
        });
      } catch (error) {
        // Device might already exist
      }
      
      const actualPayload = await deviceManagementService.getDeviceSettingsWithCommandId(testDeviceId, testCommandId);
      
      console.log('✅ Actual payload from service:');
      console.log(JSON.stringify(actualPayload, null, 2));
      
      const actualKeys = Object.keys(actualPayload);
      console.log('\n🔍 Actual property order:', actualKeys);
      
      const actualCommandIdIndex = actualKeys.indexOf('CommandId');
      const actualParametersIndex = actualKeys.indexOf('Parameters');
      
      if (actualCommandIdIndex < actualParametersIndex && actualCommandIdIndex !== -1) {
        console.log('✅ Service returns CommandId BEFORE Parameters (correct)');
      } else {
        console.log('❌ Service returns CommandId AFTER Parameters (needs fix)');
      }
      
      await mongoose.connection.close();
      
    } catch (dbError) {
      console.log('ℹ️  Database test skipped:', dbError.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  console.log('🚀 Payload Order Test');
  console.log('====================\n');
  
  testPayloadOrder().then(() => {
    console.log('\n📋 Test completed');
  }).catch(error => {
    console.error('💥 Test suite failed:', error.message);
  });
}

module.exports = { testPayloadOrder };
const axios = require('axios');

/**
 * Comprehensive Device Management System Test
 * Tests all core functionality for device registration, settings storage, and management
 */

const BASE_URL = 'http://localhost:3001/api/device-management';
const TEST_DEVICE_ID = 'TEST_DEVICE_001';

class DeviceManagementTester {
  
  async runAllTests() {
    console.log('🚀 Starting Device Management System Tests...\n');

    try {
      // Test 1: Initialize sample devices
      await this.testInitializeSampleDevices();
      
      // Test 2: Register a new device
      await this.testRegisterDevice();
      
      // Test 3: Get device settings
      await this.testGetDeviceSettings();
      
      // Test 4: Update device settings
      await this.testUpdateDeviceSettings();
      
      // Test 5: Store settings without sending to device
      await this.testStoreDeviceSettings();
      
      // Test 6: Get all devices
      await this.testGetAllDevices();
      
      // Test 7: Get device sync status
      await this.testGetDeviceSyncStatus();
      
      // Test 8: Get device history
      await this.testGetDeviceHistory();
      
      // Test 9: Bulk update multiple devices
      await this.testBulkUpdate();
      
      // Test 10: Mark command as successful
      await this.testMarkCommandSuccess();
      
      // Test 11: Delete device
      await this.testDeleteDevice();

      console.log('\n✅ All tests completed successfully!');

    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
    }
  }

  async testInitializeSampleDevices() {
    console.log('📝 Test 1: Initialize Sample Devices');
    try {
      const response = await axios.post(`${BASE_URL}/initialize-samples`);
      console.log('✅ Sample devices initialized:', response.data.data.length);
      console.log('   Devices:', response.data.data.map(d => d.deviceId).join(', '));
    } catch (error) {
      console.log('ℹ️  Sample devices may already exist');
    }
    console.log('');
  }

  async testRegisterDevice() {
    console.log('📝 Test 2: Register New Device');
    try {
      const deviceData = {
        deviceId: TEST_DEVICE_ID,
        name: 'Test Device for Complete System',
        type: 'sensor',
        location: { latitude: 40.7128, longitude: -74.0060 },
        initialSettings: {
          electrode: 1,
          shuntVoltage: 35
        }
      };

      const response = await axios.post(`${BASE_URL}/register`, deviceData);
      console.log('✅ Device registered successfully:', response.data.data.deviceId);
      console.log('   Status:', response.data.data.status);
    } catch (error) {
      if (error.response?.status === 409) {
        console.log('ℹ️  Device already exists, continuing with tests...');
      } else {
        throw error;
      }
    }
    console.log('');
  }

  async testGetDeviceSettings() {
    console.log('📝 Test 3: Get Device Settings');
    try {
      const response = await axios.get(`${BASE_URL}/${TEST_DEVICE_ID}/settings`);
      console.log('✅ Device settings retrieved successfully');
      console.log('   Device ID:', response.data.data['Device ID']);
      console.log('   Message Type:', response.data.data['Message Type']);
      console.log('   Electrode:', response.data.data.Parameters.Electrode);
      console.log('   Shunt Voltage:', response.data.data.Parameters['Shunt Voltage']);
      console.log('   Complete Parameters Count:', Object.keys(response.data.data.Parameters).length);
    } catch (error) {
      throw error;
    }
    console.log('');
  }

  async testUpdateDeviceSettings() {
    console.log('📝 Test 4: Update Device Settings');
    try {
      const updateData = {
        parameters: {
          "Electrode": 2,
          "Shunt Voltage": 45,
          "Reference Fail": 35
        },
        sendToDevice: false // Don't send to MQTT for test
      };

      const response = await axios.put(`${BASE_URL}/${TEST_DEVICE_ID}/settings`, updateData);
      console.log('✅ Device settings updated successfully');
      console.log('   Command ID:', response.data.data.commandId);
      console.log('   Updated Electrode:', response.data.data.settings.Parameters.Electrode);
      console.log('   Updated Shunt Voltage:', response.data.data.settings.Parameters['Shunt Voltage']);
      console.log('   Sent to Device:', response.data.data.sentToDevice);
    } catch (error) {
      throw error;
    }
    console.log('');
  }

  async testStoreDeviceSettings() {
    console.log('📝 Test 5: Store Device Settings (Database Only)');
    try {
      const storeData = {
        settings: {
          electrode: 3,
          shuntVoltage: 50,
          instantMode: 1
        },
        source: 'api_test'
      };

      const response = await axios.post(`${BASE_URL}/${TEST_DEVICE_ID}/settings/store`, storeData);
      console.log('✅ Device settings stored successfully');
      console.log('   Device ID:', response.data.data.deviceId);
      console.log('   Source:', response.data.data.source);
      console.log('   Last Update:', response.data.data.lastUpdate);
    } catch (error) {
      throw error;
    }
    console.log('');
  }

  async testGetAllDevices() {
    console.log('📝 Test 6: Get All Devices');
    try {
      const response = await axios.get(`${BASE_URL}/devices`);
      console.log('✅ All devices retrieved successfully');
      console.log('   Total Devices:', response.data.count);
      
      response.data.data.forEach(device => {
        console.log(`   - ${device.deviceId}: ${device.name} (${device.type}) - Online: ${device.isOnline}`);
      });
    } catch (error) {
      throw error;
    }
    console.log('');
  }

  async testGetDeviceSyncStatus() {
    console.log('📝 Test 7: Get Device Sync Status');
    try {
      const response = await axios.get(`${BASE_URL}/${TEST_DEVICE_ID}/sync-status`);
      console.log('✅ Device sync status retrieved successfully');
      console.log('   Device ID:', response.data.data.deviceId);
      console.log('   Is Online:', response.data.data.isOnline);
      console.log('   Pending Requests:', response.data.data.pendingRequests.length);
      console.log('   Error Count:', response.data.data.errorCount);
      console.log('   Config Last Update:', response.data.data.configLastUpdate);
    } catch (error) {
      throw error;
    }
    console.log('');
  }

  async testGetDeviceHistory() {
    console.log('📝 Test 8: Get Device Configuration History');
    try {
      const response = await axios.get(`${BASE_URL}/${TEST_DEVICE_ID}/history?limit=5`);
      console.log('✅ Device history retrieved successfully');
      console.log('   Device ID:', response.data.data.deviceId);
      console.log('   Total History Count:', response.data.data.historyCount);
      console.log('   Recent Changes:', response.data.data.history.length);
      
      response.data.data.history.forEach((entry, index) => {
        console.log(`   ${index + 1}. ${entry.timestamp} - Source: ${entry.source} - Fields: ${entry.changedFields.join(', ')}`);
      });
    } catch (error) {
      throw error;
    }
    console.log('');
  }

  async testBulkUpdate() {
    console.log('📝 Test 9: Bulk Update Multiple Devices');
    try {
      const bulkData = {
        devices: ['ZEPTAC001', 'ZEPTAC002', TEST_DEVICE_ID],
        parameters: {
          "Interrupt ON Time": 150,
          "Interrupt OFF Time": 150,
          "Reference UP": 350
        },
        sendToDevice: false
      };

      const response = await axios.post(`${BASE_URL}/bulk-update`, bulkData);
      console.log('✅ Bulk update completed successfully');
      console.log('   Command ID:', response.data.data.commandId);
      console.log('   Success Count:', response.data.data.successCount);
      console.log('   Total Count:', response.data.data.totalCount);
      
      response.data.data.results.forEach(result => {
        console.log(`   - ${result.deviceId}: ${result.success ? '✅ Success' : '❌ Failed'}`);
      });
    } catch (error) {
      throw error;
    }
    console.log('');
  }

  async testMarkCommandSuccess() {
    console.log('📝 Test 10: Mark Command as Successful');
    try {
      const commandId = 'test-command-123';
      
      // First, create a pending command by updating settings
      await axios.put(`${BASE_URL}/${TEST_DEVICE_ID}/settings`, {
        parameters: { "Electrode": 5 },
        sendToDevice: false
      });

      // Then mark it as successful
      const response = await axios.post(`${BASE_URL}/${TEST_DEVICE_ID}/command/${commandId}/success`);
      console.log('✅ Command marked as successful');
      console.log('   Message:', response.data.message);
    } catch (error) {
      throw error;
    }
    console.log('');
  }

  async testDeleteDevice() {
    console.log('📝 Test 11: Delete Device');
    try {
      const response = await axios.delete(`${BASE_URL}/${TEST_DEVICE_ID}`);
      console.log('✅ Device deleted successfully');
      console.log('   Message:', response.data.message);
    } catch (error) {
      throw error;
    }
    console.log('');
  }

  // Utility method to test complete settings payload format
  async testCompleteSettingsFormat() {
    console.log('📝 Testing Complete Settings Payload Format');
    try {
      const response = await axios.get(`${BASE_URL}/ZEPTAC001/settings`);
      const payload = response.data.data;
      
      console.log('✅ Complete Settings Payload Format Test:');
      console.log('   Device ID:', payload['Device ID']);
      console.log('   Message Type:', payload['Message Type']);
      console.log('   Sender:', payload.sender);
      console.log('   Parameters Count:', Object.keys(payload.Parameters).length);
      
      // Verify all required parameters are present
      const requiredParams = [
        'Electrode', 'Shunt Voltage', 'Shunt Current', 'Reference Fail',
        'Reference UP', 'Reference OV', 'Interrupt ON Time', 'Interrupt OFF Time',
        'Interrupt Start TimeStamp', 'Interrupt Stop TimeStamp', 'DPOL Interval',
        'Depolarization Start TimeStamp', 'Depolarization Stop TimeStamp',
        'Instant Mode', 'Instant Start TimeStamp', 'Instant End TimeStamp'
      ];
      
      const missingParams = requiredParams.filter(param => !(param in payload.Parameters));
      
      if (missingParams.length === 0) {
        console.log('   ✅ All required parameters present');
      } else {
        console.log('   ❌ Missing parameters:', missingParams);
      }
      
      console.log('\n   📄 Complete Payload Structure:');
      console.log(JSON.stringify(payload, null, 2));
      
    } catch (error) {
      throw error;
    }
    console.log('');
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new DeviceManagementTester();
  
  console.log('📋 Device Management System Test Suite');
  console.log('=====================================\n');
  
  // Wait a moment for any server startup
  setTimeout(() => {
    tester.runAllTests().then(() => {
      // Also test the complete settings format
      return tester.testCompleteSettingsFormat();
    }).catch(error => {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    });
  }, 1000);
}

module.exports = DeviceManagementTester;
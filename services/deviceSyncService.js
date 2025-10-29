const mqtt = require('mqtt');
const { deviceBroker } = require('../config/mqtt');
const { transformDeviceData, createThrottledEmit } = require('../utils/dataTransform');

class DeviceSyncService {
  constructor() {
    this.client = null;
    this.throttledEmit = null;
    this.deviceData = { device: null };
    this.lastDeviceTimestamp = 0;
    this.connectionStatus = { device: false };
    this.deviceConfigurations = new Map(); // Store current device configs
    this.pendingConfigRequests = new Map(); // Track config requests
    this.configRequestTimeout = 30000; // 30 seconds timeout
  }

  initialize(io) {
    this.throttledEmit = createThrottledEmit(io);
    this.client = mqtt.connect(deviceBroker.url, deviceBroker.options);
    this.setupEventHandlers(io);
  }

  setupEventHandlers(io) {
    this.client.on('connect', () => {
      this.connectionStatus.device = true;
      console.log('✅ Connected to device 123 broker (broker.zeptac.com)');
      console.log('📡 Device Configuration:', {
        broker: deviceBroker.url,
        dataTopic: deviceBroker.dataTopic,
        commandTopic: deviceBroker.commandTopic,
        configResponseTopic: 'devices/123/config/response',
        clientId: deviceBroker.options.clientId,
        username: deviceBroker.options.username
      });
      
      // Subscribe to data topic
      this.client.subscribe(deviceBroker.dataTopic, { qos: 0 }, err => {
        if (!err) {
          console.log(`📥 Subscribed to device data topic: ${deviceBroker.dataTopic}`);
        } else {
          console.error('❌ Data topic subscription error:', err);
        }
      });

      // Subscribe to configuration response topic
      const configResponseTopic = 'devices/123/config/response';
      this.client.subscribe(configResponseTopic, { qos: 1 }, err => {
        if (!err) {
          console.log(`📥 Subscribed to config response topic: ${configResponseTopic}`);
        } else {
          console.error('❌ Config response topic subscription error:', err);
        }
      });

      // Subscribe to status topic
      const statusTopic = 'devices/123/status';
      this.client.subscribe(statusTopic, { qos: 1 }, err => {
        if (!err) {
          console.log(`📥 Subscribed to device status topic: ${statusTopic}`);
          console.log('🔔 Waiting for MQTT messages from device 123...');
          
          // Request current device configuration after successful connection
          this.requestCurrentDeviceConfiguration('123');
        } else {
          console.error('❌ Status topic subscription error:', err);
        }
      });
    });

    this.client.on('message', (topic, message) => {
      console.log('\n🔥 DEVICE MESSAGE RECEIVED:');
      console.log('📍 Topic:', topic);
      console.log('📄 Raw Message:', message.toString());
      console.log('⏰ Timestamp:', new Date().toISOString());
      
      try {
        const payload = JSON.parse(message.toString());
        console.log('✅ Parsed JSON Payload:', JSON.stringify(payload, null, 2));
        
        // Handle different topic types
        if (topic === 'devices/123/status') {
          this.handleStatusMessage(payload);
        } else if (topic === 'devices/123/config/response') {
          this.handleConfigurationResponse(payload);
        } else if (topic === deviceBroker.dataTopic) {
          this.handleDataMessage(payload, topic);
        }
        
        console.log(''); // Add spacing
      } catch (err) {
        console.error('❌ Error parsing device message:', err);
        console.error('📄 Original message:', message.toString());
      }
    });

    this.client.on('close', () => {
      this.connectionStatus.device = false;
      console.log('❌ Device 123 broker disconnected');
    });

    this.client.on('error', err => {
      this.connectionStatus.device = false;
      console.error('❌ Device 123 client error:', err);
    });
  }

  // **NEW: Request current device configuration when server starts**
  async requestCurrentDeviceConfiguration(deviceId) {
    console.log(`🔍 Requesting current configuration from device ${deviceId}...`);
    
    const requestId = this.generateRequestId();
    const configRequest = {
      "Unit Id": deviceId,
      "Command": "GET_CONFIG",
      "Request ID": requestId,
      "timestamp": new Date().toISOString(),
      "sender": "webserver",
      "config_types": [
        "current_mode",      // Normal, Manual, Interrupt, DPOL, INST
        "timer_settings",    // TON, TOFF values
        "electrode_config",  // Electrode type
        "alarm_config",      // Alarm settings
        "device_status",     // Current operational status
        "last_command"       // Last executed command
      ]
    };

    // Store pending request
    this.pendingConfigRequests.set(requestId, {
      deviceId,
      timestamp: Date.now(),
      resolved: false
    });

    // Set timeout for config request
    setTimeout(() => {
      if (this.pendingConfigRequests.has(requestId)) {
        console.log(`⏰ Configuration request ${requestId} timed out`);
        this.pendingConfigRequests.delete(requestId);
        // Try alternative method - send status inquiry
        this.sendStatusInquiry(deviceId);
      }
    }, this.configRequestTimeout);

    // Publish configuration request
    this.client.publish(deviceBroker.commandTopic, JSON.stringify(configRequest), { qos: 1 }, (error) => {
      if (error) {
        console.error('❌ Failed to send config request:', error);
        this.pendingConfigRequests.delete(requestId);
      } else {
        console.log(`✅ Configuration request sent with ID: ${requestId}`);
      }
    });

    return requestId;
  }

  // **NEW: Handle configuration response from device**
  handleConfigurationResponse(payload) {
    console.log('📋 Processing configuration response...');
    
    const requestId = payload["Request ID"];
    if (!requestId || !this.pendingConfigRequests.has(requestId)) {
      console.log('⚠️ Received unexpected config response or expired request');
      return;
    }

    // Mark request as resolved
    const request = this.pendingConfigRequests.get(requestId);
    request.resolved = true;
    this.pendingConfigRequests.delete(requestId);

    // Store device configuration
    const deviceId = payload["Unit Id"] || request.deviceId;
    const deviceConfig = {
      deviceId: deviceId,
      currentMode: payload.current_mode || 'Unknown',
      timerSettings: payload.timer_settings || {},
      electrodeConfig: payload.electrode_config || {},
      alarmConfig: payload.alarm_config || {},
      deviceStatus: payload.device_status || 'Unknown',
      lastCommand: payload.last_command || null,
      lastUpdated: new Date().toISOString(),
      source: 'device_response'
    };

    this.deviceConfigurations.set(deviceId, deviceConfig);
    
    console.log('💾 Device configuration stored:', JSON.stringify(deviceConfig, null, 2));
    
    // Emit configuration to frontend
    if (this.throttledEmit) {
      this.throttledEmit({
        type: 'device_config',
        deviceId: deviceId,
        config: deviceConfig
      });
    }

    // Save to database if needed
    this.saveDeviceConfigToDatabase(deviceConfig);
  }

  // **NEW: Alternative method if device doesn't respond to GET_CONFIG**
  async sendStatusInquiry(deviceId) {
    console.log(`🔍 Sending status inquiry to device ${deviceId} (fallback method)...`);
    
    const statusInquiry = {
      "Unit Id": deviceId,
      "Command": "STATUS",
      "timestamp": new Date().toISOString(),
      "sender": "webserver"
    };

    this.client.publish(deviceBroker.commandTopic, JSON.stringify(statusInquiry), { qos: 1 }, (error) => {
      if (error) {
        console.error('❌ Failed to send status inquiry:', error);
      } else {
        console.log(`✅ Status inquiry sent to device ${deviceId}`);
      }
    });
  }

  // **NEW: Request specific configuration type**
  async requestSpecificConfig(deviceId, configType) {
    console.log(`🔍 Requesting ${configType} configuration from device ${deviceId}...`);
    
    const requestId = this.generateRequestId();
    const configRequest = {
      "Unit Id": deviceId,
      "Command": "GET_SPECIFIC_CONFIG",
      "Request ID": requestId,
      "Config Type": configType, // e.g., "timer", "electrode", "alarm"
      "timestamp": new Date().toISOString(),
      "sender": "webserver"
    };

    return new Promise((resolve, reject) => {
      // Store pending request with callback
      this.pendingConfigRequests.set(requestId, {
        deviceId,
        configType,
        timestamp: Date.now(),
        resolve,
        reject
      });

      // Set timeout
      setTimeout(() => {
        if (this.pendingConfigRequests.has(requestId)) {
          this.pendingConfigRequests.delete(requestId);
          reject(new Error(`Configuration request for ${configType} timed out`));
        }
      }, this.configRequestTimeout);

      // Send request
      this.client.publish(deviceBroker.commandTopic, JSON.stringify(configRequest), { qos: 1 }, (error) => {
        if (error) {
          this.pendingConfigRequests.delete(requestId);
          reject(error);
        } else {
          console.log(`✅ Specific config request sent: ${configType}`);
        }
      });
    });
  }

  // Handle regular data messages
  handleDataMessage(payload, topic) {
    console.log('📈 Data message received - processing telemetry');
    const deviceInfo = transformDeviceData(payload, topic);
    console.log('🔄 Transformed Device Info:', JSON.stringify(deviceInfo, null, 2));
    
    this.deviceData.device = deviceInfo;
    this.lastDeviceTimestamp = Date.now();
    this.throttledEmit(deviceInfo);
    
    console.log('💾 Updated device data and notified frontend');
  }

  // Handle status messages
  handleStatusMessage(payload) {
    console.log('📊 Processing status message...');
    
    if (payload.status === 'offline') {
      console.log('⚠️ Device 123 went offline');
    } else if (payload.status === 'online') {
      console.log('✅ Device 123 came online');
      // Device came online - request current configuration
      setTimeout(() => {
        this.requestCurrentDeviceConfiguration('123');
      }, 2000); // Wait 2 seconds for device to stabilize
    }
    
    // Emit status update to frontend
    if (this.throttledEmit) {
      this.throttledEmit({ type: 'status', data: payload });
    }
  }

  // **NEW: Save device configuration to database**
  async saveDeviceConfigToDatabase(deviceConfig) {
    try {
      const Device = require('../models/Device');
      
      await Device.findOneAndUpdate(
        { deviceId: deviceConfig.deviceId },
        {
          $set: {
            'configuration': deviceConfig,
            'lastConfigUpdate': new Date(),
            'updatedAt': new Date()
          }
        },
        { upsert: true, new: true }
      );
      
      console.log(`💾 Device configuration saved to database for device ${deviceConfig.deviceId}`);
    } catch (error) {
      console.error('❌ Error saving device configuration to database:', error);
    }
  }

  // **NEW: Get stored device configuration**
  getDeviceConfiguration(deviceId) {
    return this.deviceConfigurations.get(deviceId) || null;
  }

  // **NEW: Get all device configurations**
  getAllDeviceConfigurations() {
    return Object.fromEntries(this.deviceConfigurations);
  }

  // Generate unique request ID
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // **NEW: Sync device on demand**
  async syncDeviceConfiguration(deviceId) {
    console.log(`🔄 Manual sync requested for device ${deviceId}`);
    return this.requestCurrentDeviceConfiguration(deviceId);
  }

  // Existing methods remain the same...
  publishMessage(messagePayload, callback) {
    this.client.publish(deviceBroker.commandTopic, JSON.stringify(messagePayload), { qos: 1 }, callback);
  }

  sendDeviceConfiguration(deviceId, configType, configData) {
    const payload = {
      "Unit Id": deviceId,
      "Command": configType,
      ...configData,
      "timestamp": new Date().toISOString(),
      "sender": "webserver"
    };

    console.log(`📤 Sending ${configType} command to device ${deviceId}:`, JSON.stringify(payload, null, 2));
    
    this.client.publish(deviceBroker.commandTopic, JSON.stringify(payload), { qos: 1 }, (error) => {
      if (error) {
        console.error('❌ Failed to send command:', error);
      } else {
        console.log(`✅ Command sent successfully: ${configType}`);
        // Update local configuration cache
        this.updateLocalConfig(deviceId, configType, configData);
      }
    });

    return Promise.resolve({ success: true, command: configType });
  }

  // **NEW: Update local configuration cache when we send commands**
  updateLocalConfig(deviceId, configType, configData) {
    const existingConfig = this.deviceConfigurations.get(deviceId) || {
      deviceId: deviceId,
      lastUpdated: new Date().toISOString(),
      source: 'command_sent'
    };

    // Update specific configuration based on command type
    switch (configType.toLowerCase()) {
      case 'timer':
        existingConfig.timerSettings = configData;
        break;
      case 'electrode':
        existingConfig.electrodeConfig = configData;
        break;
      case 'alarm':
        existingConfig.alarmConfig = configData;
        break;
      case 'normal':
      case 'manual':
      case 'interrupt':
      case 'dpol':
      case 'inst':
        existingConfig.currentMode = configType;
        existingConfig.modeConfig = configData;
        break;
    }

    existingConfig.lastCommand = {
      type: configType,
      data: configData,
      timestamp: new Date().toISOString()
    };
    existingConfig.lastUpdated = new Date().toISOString();

    this.deviceConfigurations.set(deviceId, existingConfig);
    console.log(`📝 Local configuration updated for device ${deviceId}`);
  }

  // Existing getters...
  getDeviceData() {
    return this.deviceData;
  }

  getConnectionStatus() {
    return this.connectionStatus;
  }

  isDeviceConnected() {
    return this.connectionStatus.device;
  }

  disconnect() {
    if (this.client) {
      this.client.end(true);
    }
  }
}

// Export singleton instance
const deviceSyncService = new DeviceSyncService();
module.exports = deviceSyncService;
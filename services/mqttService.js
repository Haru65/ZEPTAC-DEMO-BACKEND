const mqtt = require('mqtt');
const { deviceBroker } = require('../config/mqtt');
const { transformDeviceData, createThrottledEmit } = require('../utils/dataTransform');
const { v4: uuidv4 } = require('uuid');

class MQTTService {
  constructor() {
    this.client = null;
    this.throttledEmit = null;
    this.socketIO = null;
    this.deviceData = { device: null };
    this.lastDeviceTimestamp = 0;
    this.connectionStatus = { device: false };
    
    // Memory-based acknowledgment tracking
    this.pendingCommands = new Map(); // commandId -> command details
    this.acknowledgmentTimeouts = new Map(); // commandId -> timeout handler
    this.commandHistory = []; // Array of completed commands (limited size)
    this.maxHistorySize = 100; // Keep last 100 commands
    
    // Store current device settings per deviceId
    this.deviceSettings = new Map(); // deviceId -> settings object
    
    // Device Management Service Integration
    this.deviceManagementService = null;
  }

  initialize(io) {
    this.throttledEmit = createThrottledEmit(io);
    this.socketIO = io;
    this.client = mqtt.connect(deviceBroker.url, deviceBroker.options);
    this.setupEventHandlers(io);
    
    // Initialize device management service
    try {
      this.deviceManagementService = require('./deviceManagementService');
      console.log('✅ Device Management Service integrated with MQTT');
    } catch (error) {
      console.warn('⚠️ Device Management Service not available:', error.message);
    }
  }

  setupEventHandlers(io) {
    this.client.on('connect', () => {
      this.connectionStatus.device = true;
      console.log('✅ Connected to device 123 broker (broker.zeptac.com)');
      console.log('📡 Device Configuration:', {
        broker: deviceBroker.url,
        dataTopic: 'devices/123/data',
        commandTopic: 'devices/123/commands',
        clientId: deviceBroker.options.clientId,
        username: deviceBroker.options.username
      });
      
      // Subscribe to data topic
      this.client.subscribe('devices/123/data', { qos: 0 }, err => {
        if (!err) {
          console.log(`📥 Subscribed to device data topic: devices/123/data`);
        } else {
          console.error('❌ Data topic subscription error:', err);
        }
      });

      // Subscribe to commands topic (for acknowledgments)
      this.client.subscribe('devices/123/commands', { qos: 1 }, err => {
        if (!err) {
          console.log(`📥 Subscribed to device commands topic: devices/123/commands`);
          console.log('🔔 Waiting for MQTT messages from device 123...');
        } else {
          console.error('❌ Commands topic subscription error:', err);
        }
      });
    });

    this.client.on('message', (topic, message) => {
      console.log('\n🔥 DEVICE 123 MESSAGE RECEIVED:');
      console.log('📍 Topic:', topic);
      console.log('📄 Raw Message:', message.toString());
      console.log('📏 Message Length:', message.length);
      console.log('⏰ Timestamp:', new Date().toISOString());
      
      try {
        const payload = JSON.parse(message.toString());
        console.log('✅ Parsed JSON Payload:', JSON.stringify(payload, null, 2));
        
        // Handle different topic types
        if (topic === 'devices/123/data') {
          console.log('📈 Data message received - processing telemetry');
          const deviceInfo = transformDeviceData(payload, topic);
          console.log('🔄 Transformed Device Info:', JSON.stringify(deviceInfo, null, 2));
          
          this.deviceData.device = deviceInfo;
          this.lastDeviceTimestamp = Date.now();
          this.throttledEmit(deviceInfo);
          
          console.log('💾 Updated device data and notified frontend');
        } else if (topic === 'devices/123/commands') {
          console.log('📋 Commands message received - checking for acknowledgments');
          this.handleCommandMessage(payload);
        }
        
        console.log(''); // Add spacing
      } catch (err) {
        console.error('❌ Error parsing device message:', err);
        console.error('📄 Original message:', message.toString());
        console.error('🔍 Error details:', err.message);
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

    this.client.on('offline', () => {
      console.log('📱 Device 123 client is offline');
    });

    this.client.on('reconnect', () => {
      console.log('🔄 Device 123 client reconnecting...');
    });
  }

  publishMessage(messagePayload, callback) {
    this.client.publish(deviceBroker.commandTopic, JSON.stringify(messagePayload), { qos: 1 }, callback);
  }

  // Send device configuration WITH memory-based acknowledgment tracking
  async sendDeviceConfigurationWithAck(deviceId, configType, configData, timeout = 30000) {
    const commandId = uuidv4();
    
    // Use the complete payload format requested by user
    const payload = {
      "Device ID": deviceId,
      "Message Type": configType.toLowerCase(),
      "sender": "Server",
      "CommandId": commandId,  // Keep for tracking
      "Parameters": configData
    };

    console.log(`📤 Sending ${configType} command to device ${deviceId} with ACK tracking:`, JSON.stringify(payload, null, 2));
    
    // Store command in memory
    const commandRecord = {
      commandId,
      deviceId,
      originalCommand: configType,
      commandPayload: configData,
      status: 'PENDING',
      sentAt: new Date(),
      timeout,
      acknowledgedAt: null,
      deviceResponse: null,
      responseTime: null
    };
    
    this.pendingCommands.set(commandId, commandRecord);

    // Set up timeout handler
    const timeoutHandler = setTimeout(() => {
      const pendingCommand = this.pendingCommands.get(commandId);
      
      if (pendingCommand && pendingCommand.status === 'PENDING') {
        pendingCommand.status = 'TIMEOUT';
        pendingCommand.acknowledgedAt = new Date();
        
        // Move to history
        this.addToHistory(pendingCommand);
        this.pendingCommands.delete(commandId);
        
        console.log(`⏰ Command ${commandId} timed out after ${timeout}ms`);
        
        // Notify frontend of timeout
        this.socketIO?.emit('deviceCommandTimeout', {
          commandId,
          deviceId,
          command: configType,
          message: 'Device did not respond within timeout period'
        });
      }
      
      this.acknowledgmentTimeouts.delete(commandId);
    }, timeout);

    this.acknowledgmentTimeouts.set(commandId, timeoutHandler);

    // Publish the command
    return new Promise((resolve, reject) => {
      this.client.publish('devices/123/commands', JSON.stringify(payload), { qos: 1 }, (error) => {
        if (error) {
          console.error('❌ Failed to send command:', error);
          // Clean up on send failure
          this.acknowledgmentTimeouts.delete(commandId);
          clearTimeout(timeoutHandler);
          this.pendingCommands.delete(commandId);
          reject(error);
        } else {
          console.log(`✅ Command sent successfully: ${configType}, waiting for ACK...`);
          
          // Notify frontend that command was sent
          this.socketIO?.emit('deviceCommandSent', {
            commandId,
            deviceId,
            command: configType,
            sentAt: new Date(),
            status: 'PENDING'
          });
          
          resolve({ 
            success: true, 
            command: configType, 
            commandId,
            status: 'PENDING',
            message: 'Command sent, waiting for device acknowledgment'
          });
        }
      });
    });
  }

  // Handle command messages from devices (including acknowledgments)
  handleCommandMessage(payload) {
    try {
      const { CommandId, status, message, error, response } = payload;

      console.log(`🔔 Processing command message:`, JSON.stringify(payload, null, 2));

      // Check if this is an acknowledgment (has CommandId)
      if (CommandId) {
        this.handleAcknowledgment(CommandId, payload);
      } else {
        console.log('📋 Regular command message (not an acknowledgment)');
      }
    } catch (error) {
      console.error('Error handling command message:', error);
    }
  }

  // Handle acknowledgment responses
  handleAcknowledgment(commandId, payload) {
    const { status, message, error, response } = payload;

    console.log(`🔔 Processing ACK for command ${commandId}`);

    // Find the pending command
    const pendingCommand = this.pendingCommands.get(commandId);

    if (!pendingCommand) {
      console.warn(`⚠️ No pending command found for CommandId ${commandId}`);
      return;
    }

    // Clear timeout
    const timeoutHandler = this.acknowledgmentTimeouts.get(commandId);
    if (timeoutHandler) {
      clearTimeout(timeoutHandler);
      this.acknowledgmentTimeouts.delete(commandId);
    }

    // Update command record
    pendingCommand.status = status === 'SUCCESS' || status === 'OK' ? 'SUCCESS' : 'FAILED';
    pendingCommand.acknowledgedAt = new Date();
    pendingCommand.responseTime = pendingCommand.acknowledgedAt.getTime() - pendingCommand.sentAt.getTime();
    pendingCommand.deviceResponse = {
      status,
      message: message || 'No message provided',
      error: error || null,
      response: response || null,
      fullPayload: payload
    };

    console.log(`✅ Command ${commandId} acknowledged with status: ${pendingCommand.status}`);
    console.log(`⏱️ Response time: ${pendingCommand.responseTime}ms`);

    // Move to history and remove from pending
    this.addToHistory(pendingCommand);
    this.pendingCommands.delete(commandId);

    // Notify frontend
    this.socketIO?.emit('deviceCommandAcknowledged', {
      commandId,
      deviceId: pendingCommand.deviceId,
      command: pendingCommand.originalCommand,
      status: pendingCommand.status,
      responseTime: pendingCommand.responseTime,
      deviceResponse: pendingCommand.deviceResponse,
      acknowledgedAt: pendingCommand.acknowledgedAt
    });
  }

  // Add command to history (with size limit)
  addToHistory(commandRecord) {
    this.commandHistory.unshift(commandRecord);
    
    // Keep only the last maxHistorySize commands
    if (this.commandHistory.length > this.maxHistorySize) {
      this.commandHistory = this.commandHistory.slice(0, this.maxHistorySize);
    }
  }

  // Get command status (pending or from history)
  getCommandStatus(commandId) {
    // Check pending commands first
    const pendingCommand = this.pendingCommands.get(commandId);
    if (pendingCommand) {
      return pendingCommand;
    }

    // Check history
    return this.commandHistory.find(cmd => cmd.commandId === commandId) || null;
  }

  // Get all commands for a device
  getDeviceCommands(deviceId, status = null) {
    const allCommands = [
      ...Array.from(this.pendingCommands.values()),
      ...this.commandHistory
    ];

    let deviceCommands = allCommands.filter(cmd => cmd.deviceId === deviceId);

    if (status) {
      deviceCommands = deviceCommands.filter(cmd => cmd.status === status);
    }

    // Sort by sentAt descending (newest first)
    return deviceCommands.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  }

  // Get pending commands for a device
  getPendingCommands(deviceId) {
    return Array.from(this.pendingCommands.values())
      .filter(cmd => cmd.deviceId === deviceId);
  }

  // Get command statistics
  getCommandStatistics(deviceId, fromDate = null) {
    const allCommands = [
      ...Array.from(this.pendingCommands.values()),
      ...this.commandHistory
    ];

    let deviceCommands = allCommands.filter(cmd => cmd.deviceId === deviceId);

    if (fromDate) {
      deviceCommands = deviceCommands.filter(cmd => cmd.sentAt >= fromDate);
    }

    const stats = {
      total: deviceCommands.length,
      pending: deviceCommands.filter(cmd => cmd.status === 'PENDING').length,
      success: deviceCommands.filter(cmd => cmd.status === 'SUCCESS').length,
      failed: deviceCommands.filter(cmd => cmd.status === 'FAILED').length,
      timeout: deviceCommands.filter(cmd => cmd.status === 'TIMEOUT').length,
      avgResponseTime: 0,
      successRate: 0
    };

    // Calculate average response time for completed commands
    const completedCommands = deviceCommands.filter(cmd => 
      cmd.responseTime && cmd.responseTime > 0
    );

    if (completedCommands.length > 0) {
      stats.avgResponseTime = Math.round(
        completedCommands.reduce((sum, cmd) => sum + cmd.responseTime, 0) / completedCommands.length
      );
    }

    // Calculate success rate
    if (stats.total > 0) {
      stats.successRate = Math.round((stats.success / stats.total) * 100);
    }

    return stats;
  }

  // Start cleanup process for expired acknowledgments
  startAcknowledgmentCleanup() {
    setInterval(async () => {
      try {
        const expiredAcks = await DeviceAcknowledgment.find({
          status: 'PENDING',
          sentAt: { $lt: new Date(Date.now() - 60000) } // 1 minute old
        });

        for (const ack of expiredAcks) {
          if (ack.isTimedOut()) {
            await ack.markAsTimeout();
            console.log(`🧹 Marked command ${ack.commandId} as timed out during cleanup`);
          }
        }
      } catch (error) {
        console.error('Error during acknowledgment cleanup:', error);
      }
    }, 30000); // Run every 30 seconds
  }

  // Get acknowledgment status for a command
  async getAcknowledgmentStatus(commandId) {
    return await DeviceAcknowledgment.findOne({ commandId });
  }

  // Get device acknowledgment statistics
  async getDeviceAckStats(deviceId, fromDate) {
    return await DeviceAcknowledgment.getStats(deviceId, fromDate);
  }

  // Handle status messages
  handleStatusMessage(payload) {
    if (payload.status === 'offline') {
      console.log('⚠️ Device 123 went offline');
    } else if (payload.status === 'online') {
      console.log('✅ Device 123 came online');
    }
    
    // Emit status update to frontend
    if (this.throttledEmit) {
      this.throttledEmit({ type: 'status', data: payload });
    }
  }

  // Get default device settings
  getDefaultDeviceSettings() {
    return {
      "Electrode": 0,
      "Shunt Voltage": 25,
      "Shunt Current": 999,
      "Reference Fail": 30,
      "Reference UP": 300,
      "Reference OV": 60,
      "Interrupt ON Time": 100,
      "Interrupt OFF Time": 100,
      "Interrupt Start TimeStamp": "2025-02-20 19:04:00",
      "Interrupt Stop TimeStamp": "2025-02-20 19:05:00",
      "DPOL Interval": "00:00:00",
      "Depolarization Start TimeStamp": "2025-02-20 19:04:00",
      "Depolarization Stop TimeStamp": "2025-02-20 19:05:00",
      "Instant Mode": 0,
      "Instant Start TimeStamp": "19:04:00",
      "Instant End TimeStamp": "00:00:00"
    };
  }

  // Initialize device settings if not exists
  ensureDeviceSettings(deviceId) {
    if (!this.deviceSettings.has(deviceId)) {
      this.deviceSettings.set(deviceId, this.getDefaultDeviceSettings());
    }
    return this.deviceSettings.get(deviceId);
  }

  // Specific configuration methods - ALL now send complete settings payload
  async setInterruptMode(deviceId, config) {
    console.log('🔧 Setting interrupt mode configuration - will send complete settings...');
    
    // Get current settings and update interrupt-related fields
    const currentSettings = this.ensureDeviceSettings(deviceId);
    const updatedSettings = {
      ...currentSettings,
      "Interrupt Start TimeStamp": `${config.startDate} ${config.startTime}`,
      "Interrupt Stop TimeStamp": `${config.stopDate} ${config.stopTime}`,
      "Interrupt ON Time": parseInt(config.onTime),
      "Interrupt OFF Time": parseInt(config.offTime)
    };
    
    // Store updated settings
    this.deviceSettings.set(deviceId, updatedSettings);

    // Create commandId and track then send complete payload
    const commandId = uuidv4();
    const changed = {
      "Interrupt Start TimeStamp": updatedSettings["Interrupt Start TimeStamp"],
      "Interrupt Stop TimeStamp": updatedSettings["Interrupt Stop TimeStamp"],
      "Interrupt ON Time": updatedSettings["Interrupt ON Time"],
      "Interrupt OFF Time": updatedSettings["Interrupt OFF Time"]
    };
    if (this.deviceManagementService) {
      try { await this.deviceManagementService.trackCommand(deviceId, commandId, 'complete_settings', changed); } catch (e) { /* ignore */ }
    }
    return await this.sendCompleteSettingsPayload(deviceId, commandId);
  }

  async setManualMode(deviceId, action) {
    console.log(`🔧 Setting manual mode action: ${action} - will send complete settings...`);
    
    // Get current settings and update manual mode related fields
    const currentSettings = this.ensureDeviceSettings(deviceId);
    const updatedSettings = {
      ...currentSettings,
      "Manual Mode Action": action, // Add this field to track manual mode
      "Instant Mode": action === 'start' ? 1 : 0 // Update instant mode based on action
    };
    
    // Store updated settings
    this.deviceSettings.set(deviceId, updatedSettings);

    // Create commandId and track then send complete payload
    const commandId = uuidv4();
    const changedManual = {
      "Manual Mode Action": action,
      "Instant Mode": updatedSettings["Instant Mode"]
    };
    if (this.deviceManagementService) {
      try { await this.deviceManagementService.trackCommand(deviceId, commandId, 'complete_settings', changedManual); } catch (e) { /* ignore */ }
    }
    return await this.sendCompleteSettingsPayload(deviceId, commandId);
  }

  async setNormalMode(deviceId, config = {}) {
    console.log('🔧 Setting normal mode configuration - will send complete settings...');
    
    // Get current settings and update normal mode fields
    const currentSettings = this.ensureDeviceSettings(deviceId);
    const updatedSettings = {
      ...currentSettings,
      ...config, // Merge any normal mode specific config
      "Instant Mode": 0 // Normal mode means instant mode is off
    };
    
    // Store updated settings
    this.deviceSettings.set(deviceId, updatedSettings);

    // Create commandId and track then send complete payload
    const commandId = uuidv4();
    const changedNormal = {
      "Instant Mode": 0,
      ...config
    };
    if (this.deviceManagementService) {
      try { await this.deviceManagementService.trackCommand(deviceId, commandId, 'complete_settings', changedNormal); } catch (e) { /* ignore */ }
    }
    return await this.sendCompleteSettingsPayload(deviceId, commandId);
  }

  async setDpolMode(deviceId, config) {
    console.log('🔧 Setting DPOL mode configuration - will send complete settings...');
    
    // Get current settings and update DPOL-related fields
    const currentSettings = this.ensureDeviceSettings(deviceId);
    const updatedSettings = {
      ...currentSettings,
      "Depolarization Start TimeStamp": `${config.startDate} ${config.startTime}`,
      "Depolarization Stop TimeStamp": `${config.endDate} ${config.endTime}`,
      "DPOL Interval": config.interval || "00:00:00"
    };
    
    // Store updated settings
    this.deviceSettings.set(deviceId, updatedSettings);

    // Create commandId and track then send complete payload
    const commandId = uuidv4();
    const changedDpol = {
      "Depolarization Start TimeStamp": updatedSettings["Depolarization Start TimeStamp"],
      "Depolarization Stop TimeStamp": updatedSettings["Depolarization Stop TimeStamp"],
      "DPOL Interval": updatedSettings["DPOL Interval"]
    };
    if (this.deviceManagementService) {
      try { await this.deviceManagementService.trackCommand(deviceId, commandId, 'complete_settings', changedDpol); } catch (e) { /* ignore */ }
    }
    return await this.sendCompleteSettingsPayload(deviceId, commandId);
  }

  async setInstMode(deviceId, config) {
    console.log('🔧 Setting INST mode configuration - will send complete settings...');
    
    // Get current settings and update instant mode fields
    const currentSettings = this.ensureDeviceSettings(deviceId);
    const updatedSettings = {
      ...currentSettings,
      "Instant Mode": 1,
      "Instant Start TimeStamp": `${config.startTime}`,
      "Instant End TimeStamp": config.duration || "00:00:00"
    };
    
    // Store updated settings
    this.deviceSettings.set(deviceId, updatedSettings);

    // Create commandId and track then send complete payload
    const commandId = uuidv4();
    const changedInst = {
      "Instant Mode": 1,
      "Instant Start TimeStamp": updatedSettings["Instant Start TimeStamp"],
      "Instant End TimeStamp": updatedSettings["Instant End TimeStamp"]
    };
    if (this.deviceManagementService) {
      try { await this.deviceManagementService.trackCommand(deviceId, commandId, 'complete_settings', changedInst); } catch (e) { /* ignore */ }
    }
    return await this.sendCompleteSettingsPayload(deviceId, commandId);
  }

  async setTimerConfiguration(deviceId, timerConfig) {
    console.log('🔧 Setting timer configuration - will send complete settings...');
    
    // Get current settings and update timer fields
    const currentSettings = this.ensureDeviceSettings(deviceId);
    const updatedSettings = {
      ...currentSettings,
      "Interrupt ON Time": timerConfig.ton || currentSettings["Interrupt ON Time"],
      "Interrupt OFF Time": timerConfig.toff || currentSettings["Interrupt OFF Time"]
    };
    
    // Store updated settings
    this.deviceSettings.set(deviceId, updatedSettings);

    // Create commandId and track then send complete payload
    const commandId = uuidv4();
    const changedTimer = {
      "Interrupt ON Time": updatedSettings["Interrupt ON Time"],
      "Interrupt OFF Time": updatedSettings["Interrupt OFF Time"]
    };
    if (this.deviceManagementService) {
      try { await this.deviceManagementService.trackCommand(deviceId, commandId, 'complete_settings', changedTimer); } catch (e) { /* ignore */ }
    }
    return await this.sendCompleteSettingsPayload(deviceId, commandId);
  }

  async setElectrodeConfiguration(deviceId, electrodeType) {
    console.log('🔧 Setting electrode configuration - will send complete settings...');
    
    // Get current settings and update electrode field
    const currentSettings = this.ensureDeviceSettings(deviceId);
    const updatedSettings = {
      ...currentSettings,
      "Electrode": electrodeType
    };
    
    // Store updated settings
    this.deviceSettings.set(deviceId, updatedSettings);

    // Create commandId and track then send complete payload
    const commandId = uuidv4();
    const changedElectrode = { "Electrode": electrodeType };
    if (this.deviceManagementService) {
      try { await this.deviceManagementService.trackCommand(deviceId, commandId, 'complete_settings', changedElectrode); } catch (e) { /* ignore */ }
    }
    return await this.sendCompleteSettingsPayload(deviceId, commandId);
  }

  async setAlarmConfiguration(deviceId, alarmConfig) {
    console.log('🔧 Setting alarm configuration - will send complete settings...');
    
    // Get current settings and update alarm fields
    const currentSettings = this.ensureDeviceSettings(deviceId);
    const updatedSettings = {
      ...currentSettings,
      "Reference Fail": alarmConfig.referenceFail || alarmConfig["Reference Fail"] || currentSettings["Reference Fail"],
      "Reference UP": alarmConfig.referenceUP || alarmConfig["Reference UP"] || currentSettings["Reference UP"],
      "Reference OV": alarmConfig.referenceOV || alarmConfig["Reference OV"] || currentSettings["Reference OV"],
      "Shunt Voltage": alarmConfig.shuntVoltage || alarmConfig["Shunt Voltage"] || currentSettings["Shunt Voltage"],
      "Shunt Current": alarmConfig.shuntCurrent || alarmConfig["Shunt Current"] || currentSettings["Shunt Current"]
    };
    
    // Store updated settings
    this.deviceSettings.set(deviceId, updatedSettings);

    // Send complete settings payload with tracking
    const changedFields = {};
    Object.keys(alarmConfig).forEach(key => {
      const mappedKey = key === 'referenceFail' ? 'Reference Fail' : 
                       key === 'referenceUP' ? 'Reference UP' :
                       key === 'referenceOV' ? 'Reference OV' :
                       key === 'shuntVoltage' ? 'Shunt Voltage' :
                       key === 'shuntCurrent' ? 'Shunt Current' : key;
      changedFields[mappedKey] = updatedSettings[mappedKey];
    });

    const commandId = uuidv4();
    if (this.deviceManagementService) {
      try { await this.deviceManagementService.trackCommand(deviceId, commandId, 'complete_settings', changedFields); } catch (e) { /* ignore */ }
    }
    return await this.sendCompleteSettingsPayload(deviceId, commandId);
  }

  // Send complete settings payload - this is the main method used by all configuration changes
  async sendCompleteSettingsPayload(deviceId, commandId = null, timeout = 30000) {
    try {
      // Use device management service to get complete settings if available
      let payload;
      
      if (this.deviceManagementService) {
        try {
          // Get complete settings from database via device management service WITH CommandId
          payload = await this.deviceManagementService.getDeviceSettingsWithCommandId(deviceId, commandId);
          
          console.log(`📤 Sending COMPLETE settings payload from database to device ${deviceId}`);
        } catch (error) {
          console.warn(`⚠️ Could not get settings from device management service: ${error.message}`);
          // Fallback to memory-based settings
          payload = this.createSettingsPayloadFromMemory(deviceId, commandId);
        }
      } else {
        // Fallback to memory-based settings
        payload = this.createSettingsPayloadFromMemory(deviceId, commandId);
      }

      console.log(`� Complete settings payload:`, JSON.stringify(payload, null, 2));

      // Store command in memory for acknowledgment tracking
      const commandRecord = {
        commandId,
        deviceId,
        originalCommand: 'settings',
        commandPayload: payload,
        status: 'PENDING',
        sentAt: new Date(),
        timeout,
        acknowledgedAt: null,
        deviceResponse: null,
        responseTime: null
      };

      this.pendingCommands.set(commandId, commandRecord);

      // Set up timeout handler
      const timeoutHandler = setTimeout(() => {
        const pendingCommand = this.pendingCommands.get(commandId);

        if (pendingCommand && pendingCommand.status === 'PENDING') {
          pendingCommand.status = 'TIMEOUT';
          pendingCommand.acknowledgedAt = new Date();

          // Move to history
          this.addToHistory(pendingCommand);
          this.pendingCommands.delete(commandId);

          console.log(`⏰ Command ${commandId} timed out after ${timeout}ms`);

          // Notify frontend of timeout
          this.socketIO?.emit('deviceCommandTimeout', {
            commandId,
            deviceId,
            command: 'settings',
            message: 'Device did not respond within timeout period'
          });
        }

        this.acknowledgmentTimeouts.delete(commandId);
      }, timeout);

      this.acknowledgmentTimeouts.set(commandId, timeoutHandler);

      // Publish the complete settings payload
      return new Promise((resolve, reject) => {
  const topic = `devices/${deviceId}/commands`;
        this.client.publish(topic, JSON.stringify(payload), { qos: 1 }, async (error) => {
          if (error) {
            console.error('❌ Failed to send complete settings command:', error);
            // Clean up on send failure
            this.acknowledgmentTimeouts.delete(commandId);
            clearTimeout(timeoutHandler);
            this.pendingCommands.delete(commandId);
            reject(error);
          } else {
            console.log(`✅ Complete settings command sent successfully to topic: ${topic}`);

            // Track command in device management service if available
            if (this.deviceManagementService) {
              try {
                await this.deviceManagementService.trackCommand(
                  deviceId, 
                  commandId, 
                  'complete_settings', 
                  payload.Parameters
                );
              } catch (error) {
                console.warn('⚠️ Could not track command in device management service:', error.message);
              }
            }

            // Notify frontend that command was sent
            this.socketIO?.emit('deviceCommandSent', {
              commandId,
              deviceId,
              command: 'settings',
              sentAt: new Date(),
              status: 'PENDING',
              topic
            });

            resolve({
              success: true,
              command: 'settings',
              commandId,
              status: 'PENDING',
              message: 'Complete settings sent, waiting for device acknowledgment',
              topic
            });
          }
        });
      });

    } catch (error) {
      console.error('❌ Error in sendCompleteSettingsPayload:', error);
      throw error;
    }
  }

  // Helper method to create settings payload from memory (fallback)
  createSettingsPayloadFromMemory(deviceId, commandId) {
    const currentSettings = this.ensureDeviceSettings(deviceId);
    
    if (!commandId) {
      commandId = uuidv4();
    }

    return {
      "Device ID": deviceId,
      "Message Type": "settings",
      "sender": "Server", 
      "CommandId": commandId,
      "Parameters": currentSettings
    };
  }

  async setSettingsConfiguration(deviceId, settingsConfig, commandId = null) {
    try {
      console.log('🔧 Setting device settings configuration - will send complete settings...');
      
      // Use device management service to update settings if available
      if (this.deviceManagementService) {
        try {
          // Update device parameters in database
          await this.deviceManagementService.updateDeviceParameters(
            deviceId, 
            settingsConfig, 
            commandId
          );
          
          // Send complete settings payload from database
          return await this.sendCompleteSettingsPayload(deviceId, commandId);
          
        } catch (error) {
          console.warn(`⚠️ Device management service error: ${error.message}, falling back to memory`);
          // Fall back to memory-based approach
        }
      }
      
      // Fallback: Update memory-based settings and send
      const currentSettings = this.ensureDeviceSettings(deviceId);
      
      // Convert input settings to the proper parameter format
      const newSettings = {
        "Electrode": settingsConfig.Electrode !== undefined ? settingsConfig.Electrode : (settingsConfig.electrode !== undefined ? settingsConfig.electrode : currentSettings["Electrode"]),
        "Shunt Voltage": settingsConfig["Shunt Voltage"] !== undefined ? settingsConfig["Shunt Voltage"] : (settingsConfig.shuntVoltage !== undefined ? settingsConfig.shuntVoltage : currentSettings["Shunt Voltage"]),
        "Shunt Current": settingsConfig["Shunt Current"] !== undefined ? settingsConfig["Shunt Current"] : (settingsConfig.shuntCurrent !== undefined ? settingsConfig.shuntCurrent : currentSettings["Shunt Current"]),
        "Reference Fail": settingsConfig["Reference Fail"] !== undefined ? settingsConfig["Reference Fail"] : (settingsConfig.referenceFail !== undefined ? settingsConfig.referenceFail : currentSettings["Reference Fail"]),
        "Reference UP": settingsConfig["Reference UP"] !== undefined ? settingsConfig["Reference UP"] : (settingsConfig.referenceUP !== undefined ? settingsConfig.referenceUP : currentSettings["Reference UP"]),
        "Reference OV": settingsConfig["Reference OV"] !== undefined ? settingsConfig["Reference OV"] : (settingsConfig.referenceOV !== undefined ? settingsConfig.referenceOV : currentSettings["Reference OV"]),
        "Interrupt ON Time": settingsConfig["Interrupt ON Time"] !== undefined ? settingsConfig["Interrupt ON Time"] : (settingsConfig.interruptOnTime !== undefined ? settingsConfig.interruptOnTime : currentSettings["Interrupt ON Time"]),
        "Interrupt OFF Time": settingsConfig["Interrupt OFF Time"] !== undefined ? settingsConfig["Interrupt OFF Time"] : (settingsConfig.interruptOffTime !== undefined ? settingsConfig.interruptOffTime : currentSettings["Interrupt OFF Time"]),
        "Interrupt Start TimeStamp": settingsConfig["Interrupt Start TimeStamp"] !== undefined ? settingsConfig["Interrupt Start TimeStamp"] : (settingsConfig.interruptStartTimestamp !== undefined ? settingsConfig.interruptStartTimestamp : currentSettings["Interrupt Start TimeStamp"]),
        "Interrupt Stop TimeStamp": settingsConfig["Interrupt Stop TimeStamp"] !== undefined ? settingsConfig["Interrupt Stop TimeStamp"] : (settingsConfig.interruptStopTimestamp !== undefined ? settingsConfig.interruptStopTimestamp : currentSettings["Interrupt Stop TimeStamp"]),
        "DPOL Interval": settingsConfig["DPOL Interval"] !== undefined ? settingsConfig["DPOL Interval"] : (settingsConfig.dpolInterval !== undefined ? settingsConfig.dpolInterval : currentSettings["DPOL Interval"]),
        "Depolarization Start TimeStamp": settingsConfig["Depolarization Start TimeStamp"] !== undefined ? settingsConfig["Depolarization Start TimeStamp"] : (settingsConfig.depolarizationStartTimestamp !== undefined ? settingsConfig.depolarizationStartTimestamp : currentSettings["Depolarization Start TimeStamp"]),
        "Depolarization Stop TimeStamp": settingsConfig["Depolarization Stop TimeStamp"] !== undefined ? settingsConfig["Depolarization Stop TimeStamp"] : (settingsConfig.depolarizationStopTimestamp !== undefined ? settingsConfig.depolarizationStopTimestamp : currentSettings["Depolarization Stop TimeStamp"]),
        "Instant Mode": settingsConfig["Instant Mode"] !== undefined ? settingsConfig["Instant Mode"] : (settingsConfig.instantMode !== undefined ? settingsConfig.instantMode : currentSettings["Instant Mode"]),
        "Instant Start TimeStamp": settingsConfig["Instant Start TimeStamp"] !== undefined ? settingsConfig["Instant Start TimeStamp"] : (settingsConfig.instantStartTimestamp !== undefined ? settingsConfig.instantStartTimestamp : currentSettings["Instant Start TimeStamp"]),
        "Instant End TimeStamp": settingsConfig["Instant End TimeStamp"] !== undefined ? settingsConfig["Instant End TimeStamp"] : (settingsConfig.instantEndTimestamp !== undefined ? settingsConfig.instantEndTimestamp : currentSettings["Instant End TimeStamp"])
      };

      // Update memory-based settings storage
      this.deviceSettings.set(deviceId, newSettings);

      console.log(`✅ Updated settings for device ${deviceId} in memory:`, newSettings);

      // Send complete settings to device
      return await this.sendCompleteSettingsPayload(deviceId, commandId);
      
    } catch (error) {
      console.error('❌ Error in setSettingsConfiguration:', error);
      throw error;
    }
  }

  // Helper method to ensure device settings exist
  ensureDeviceSettings(deviceId) {
    if (!this.deviceSettings.has(deviceId)) {
      this.deviceSettings.set(deviceId, {
        "Electrode": 0,
        "Shunt Voltage": 25,
        "Shunt Current": 999,
        "Reference Fail": 30,
        "Reference UP": 300,
        "Reference OV": 60,
        "Interrupt ON Time": 100,
        "Interrupt OFF Time": 100,
        "Interrupt Start TimeStamp": new Date().toISOString().replace('T', ' ').substring(0, 19),
        "Interrupt Stop TimeStamp": new Date().toISOString().replace('T', ' ').substring(0, 19),
        "DPOL Interval": "00:00:00",
        "Depolarization Start TimeStamp": new Date().toISOString().replace('T', ' ').substring(0, 19),
        "Depolarization Stop TimeStamp": new Date().toISOString().replace('T', ' ').substring(0, 19),
        "Instant Mode": 0,
        "Instant Start TimeStamp": "19:04:00",
        "Instant End TimeStamp": "00:00:00"
      });
    }
    return this.deviceSettings.get(deviceId);
  }

  // Helper method to add command to history
  addToHistory(command) {
    this.commandHistory.push(command);
    if (this.commandHistory.length > this.maxHistorySize) {
      this.commandHistory.shift();
    }
  }

  getDeviceData() {
    return this.deviceData;
  }

  // Get current device settings from memory
  getDeviceSettings(deviceId) {
    return this.deviceSettings.get(deviceId) || null;
  }

  // Get all device settings (for debugging/admin purposes)
  getAllDeviceSettings() {
    const allSettings = {};
    this.deviceSettings.forEach((settings, deviceId) => {
      allSettings[deviceId] = settings;
    });
    return allSettings;
  }

  getConnectionStatus() {
    return this.connectionStatus;
  }

  getLastTimestamp() {
    return this.lastDeviceTimestamp;
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
const mqttService = new MQTTService();
module.exports = mqttService;
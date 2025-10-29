const Device = require('../models/Device');
const { v4: uuidv4 } = require('uuid');

/**
 * Core Device Management Service
 * Handles device creation, configuration storage, and settings management
 */
class DeviceManagementService {
  
  /**
   * Register a new device in the database
   * @param {Object} deviceData - Device information
   * @returns {Object} Created device object
   */
  async registerDevice(deviceData) {
    try {
      const {
        deviceId,
        name,
        type = 'sensor',
        brokerUrl = 'mqtt://localhost:1883',
        topics = [],
        location = {},
        initialSettings = {}
      } = deviceData;

      // Check if device already exists
      const existingDevice = await Device.findByDeviceId(deviceId);
      if (existingDevice) {
        throw new Error(`Device with ID ${deviceId} already exists`);
      }

      // Create new device with default settings
      const newDevice = new Device({
        deviceId,
        name,
        type,
        mqtt: {
          brokerUrl,
          topics: topics.length > 0 ? topics : [`devices/${deviceId}/telemetry`, `devices/${deviceId}/settings`],
          options: {
            qos: 1,
            keepalive: 60,
            clientId: `server_${deviceId}`,
            clean: true
          }
        },
        location,
        status: 'inactive',
        configuration: {
          currentMode: 'Unknown',
          deviceSettings: this.getDefaultDeviceSettings(),
          ...initialSettings,
          lastConfigUpdate: new Date(),
          source: 'manual_entry'
        },
        syncStatus: {
          isOnline: false,
          pendingRequests: [],
          syncErrors: []
        }
      });

      const savedDevice = await newDevice.save();
      console.log(`✅ Device registered successfully: ${deviceId}`);
      
      return savedDevice;
    } catch (error) {
      console.error('❌ Error registering device:', error);
      throw error;
    }
  }

  /**
   * Store complete device settings in database
   * @param {String} deviceId - Device identifier
   * @param {Object} settings - Complete device settings
   * @param {String} source - Source of the settings update
   * @returns {Object} Updated device object
   */
  async storeDeviceSettings(deviceId, settings, source = 'command_sent') {
    try {
      const device = await Device.findByDeviceId(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }

      // Merge new settings with existing ones
      const updatedSettings = {
        ...device.configuration.deviceSettings,
        ...settings
      };

      // Update device configuration
      device.configuration.deviceSettings = updatedSettings;
      device.configuration.lastConfigUpdate = new Date();
      device.configuration.source = source;

      // Log the configuration change
      if (!device.configuration.configHistory) {
        device.configuration.configHistory = [];
      }

      device.configuration.configHistory.push({
        timestamp: new Date(),
        settings: { ...updatedSettings },
        source,
        changedFields: Object.keys(settings)
      });

      // Keep only last 50 configuration history entries
      if (device.configuration.configHistory.length > 50) {
        device.configuration.configHistory = device.configuration.configHistory.slice(-50);
      }

      const savedDevice = await device.save();
      console.log(`✅ Device settings stored for ${deviceId}`);
      
      return savedDevice;
    } catch (error) {
      console.error('❌ Error storing device settings:', error);
      throw error;
    }
  }

  /**
   * Get complete device settings
   * @param {String} deviceId - Device identifier
   * @returns {Object} Device settings in standardized format (without CommandId)
   */
  async getDeviceSettings(deviceId) {
    try {
      const device = await Device.findByDeviceId(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }

      const settings = device.configuration.deviceSettings || this.getDefaultDeviceSettings();
      
      return {
        "Device ID": deviceId,
        "Message Type": "settings",
        "sender": "Server",
        "Parameters": {
          "Electrode": settings.electrode || 0,
          "Shunt Voltage": settings.shuntVoltage || 25,
          "Shunt Current": settings.shuntCurrent || 999,
          "Reference Fail": settings.referenceFail || 30,
          "Reference UP": settings.referenceUP || 300,
          "Reference OV": settings.referenceOV || 60,
          "Interrupt ON Time": settings.interruptOnTime || 100,
          "Interrupt OFF Time": settings.interruptOffTime || 100,
          "Interrupt Start TimeStamp": settings.interruptStartTimeStamp || new Date().toISOString().replace('T', ' ').substring(0, 19),
          "Interrupt Stop TimeStamp": settings.interruptStopTimeStamp || new Date().toISOString().replace('T', ' ').substring(0, 19),
          "DPOL Interval": settings.dpolInterval || "00:00:00",
          "Depolarization Start TimeStamp": settings.depolarizationStartTimeStamp || new Date().toISOString().replace('T', ' ').substring(0, 19),
          "Depolarization Stop TimeStamp": settings.depolarizationStopTimeStamp || new Date().toISOString().replace('T', ' ').substring(0, 19),
          "Instant Mode": settings.instantMode || 0,
          "Instant Start TimeStamp": settings.instantStartTimeStamp || "19:04:00",
          "Instant End TimeStamp": settings.instantEndTimeStamp || "00:00:00"
        }
      };
    } catch (error) {
      console.error('❌ Error getting device settings:', error);
      throw error;
    }
  }

  /**
   * Get complete device settings WITH CommandId (for MQTT commands)
   * @param {String} deviceId - Device identifier
   * @param {String} commandId - Command tracking ID
   * @returns {Object} Device settings with CommandId for MQTT
   */
  async getDeviceSettingsWithCommandId(deviceId, commandId) {
    try {
      const device = await Device.findByDeviceId(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }

      const settings = device.configuration.deviceSettings || this.getDefaultDeviceSettings();
      
      // Return with CommandId ABOVE Parameters
      return {
        "Device ID": deviceId,
        "Message Type": "settings",
        "sender": "Server",
        "CommandId": commandId,
        "Parameters": {
          "Electrode": settings.electrode || 0,
          "Shunt Voltage": settings.shuntVoltage || 25,
          "Shunt Current": settings.shuntCurrent || 999,
          "Reference Fail": settings.referenceFail || 30,
          "Reference UP": settings.referenceUP || 300,
          "Reference OV": settings.referenceOV || 60,
          "Interrupt ON Time": settings.interruptOnTime || 100,
          "Interrupt OFF Time": settings.interruptOffTime || 100,
          "Interrupt Start TimeStamp": settings.interruptStartTimeStamp || new Date().toISOString().replace('T', ' ').substring(0, 19),
          "Interrupt Stop TimeStamp": settings.interruptStopTimeStamp || new Date().toISOString().replace('T', ' ').substring(0, 19),
          "DPOL Interval": settings.dpolInterval || "00:00:00",
          "Depolarization Start TimeStamp": settings.depolarizationStartTimeStamp || new Date().toISOString().replace('T', ' ').substring(0, 19),
          "Depolarization Stop TimeStamp": settings.depolarizationStopTimeStamp || new Date().toISOString().replace('T', ' ').substring(0, 19),
          "Instant Mode": settings.instantMode || 0,
          "Instant Start TimeStamp": settings.instantStartTimeStamp || "19:04:00",
          "Instant End TimeStamp": settings.instantEndTimeStamp || "00:00:00"
        }
      };
    } catch (error) {
      console.error('❌ Error getting device settings with CommandId:', error);
      throw error;
    }
  }

  /**
   * Update specific device parameters and store complete settings
   * @param {String} deviceId - Device identifier
   * @param {Object} parameters - Parameters to update
   * @param {String} commandId - Optional command tracking ID
   * @returns {Object} Complete updated settings
   */
  async updateDeviceParameters(deviceId, parameters, commandId = null) {
    try {
      const device = await Device.findByDeviceId(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }

      // Get current settings
      const currentSettings = device.configuration.deviceSettings || this.getDefaultDeviceSettings();
      
      // Map incoming parameters to internal field names
      const mappedParameters = this.mapParametersToInternalFields(parameters);
      
      // Update specific parameters
      const updatedSettings = {
        ...currentSettings,
        ...mappedParameters
      };

      // Store complete updated settings
      await this.storeDeviceSettings(deviceId, updatedSettings, 'command_sent');

      // Track command if provided
      if (commandId) {
        await this.trackCommand(deviceId, commandId, 'parameter_update', parameters);
      }

      // Return complete settings in standardized format
      return await this.getDeviceSettings(deviceId);
    } catch (error) {
      console.error('❌ Error updating device parameters:', error);
      throw error;
    }
  }

  /**
   * Get all devices with their current settings
   * @returns {Array} Array of devices with settings
   */
  async getAllDevicesWithSettings() {
    try {
      const devices = await Device.find({})
        .select('deviceId name type status configuration.deviceSettings configuration.lastConfigUpdate syncStatus.isOnline')
        .lean();

      return devices.map(device => ({
        deviceId: device.deviceId,
        name: device.name,
        type: device.type,
        status: device.status,
        isOnline: device.syncStatus?.isOnline || false,
        settings: device.configuration?.deviceSettings || this.getDefaultDeviceSettings(),
        lastUpdate: device.configuration?.lastConfigUpdate
      }));
    } catch (error) {
      console.error('❌ Error getting all devices:', error);
      throw error;
    }
  }

  /**
   * Delete device and all its settings
   * @param {String} deviceId - Device identifier
   * @returns {Boolean} Success status
   */
  async deleteDevice(deviceId) {
    try {
      const result = await Device.deleteOne({ deviceId });
      if (result.deletedCount === 0) {
        throw new Error(`Device ${deviceId} not found`);
      }

      console.log(`✅ Device ${deviceId} deleted successfully`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting device:', error);
      throw error;
    }
  }

  /**
   * Track command execution
   * @param {String} deviceId - Device identifier
   * @param {String} commandId - Command tracking ID
   * @param {String} commandType - Type of command
   * @param {Object} commandData - Command data
   */
  async trackCommand(deviceId, commandId, commandType, commandData) {
    try {
      const device = await Device.findByDeviceId(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }

      device.configuration.lastCommand = {
        type: commandType,
        data: commandData,
        timestamp: new Date()
      };

      await device.addConfigRequest(commandId, commandType);
      console.log(`✅ Command tracked for device ${deviceId}: ${commandId}`);
    } catch (error) {
      console.error('❌ Error tracking command:', error);
      throw error;
    }
  }

  /**
   * Mark command as successful
   * @param {String} deviceId - Device identifier
   * @param {String} commandId - Command tracking ID
   */
  async markCommandSuccess(deviceId, commandId) {
    try {
      const device = await Device.findByDeviceId(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }

      await device.markConfigRequestSuccess(commandId);
      console.log(`✅ Command marked as successful: ${commandId}`);
    } catch (error) {
      console.error('❌ Error marking command success:', error);
      throw error;
    }
  }

  /**
   * Get device synchronization status
   * @param {String} deviceId - Device identifier
   * @returns {Object} Sync status information
   */
  async getDeviceSyncStatus(deviceId) {
    try {
      const device = await Device.findByDeviceId(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }

      return {
        deviceId,
        isOnline: device.syncStatus.isOnline,
        lastSyncAttempt: device.syncStatus.lastSyncAttempt,
        lastSuccessfulSync: device.syncStatus.lastSuccessfulSync,
        pendingRequests: device.syncStatus.pendingRequests,
        errorCount: device.syncStatus.syncErrors.length,
        lastError: device.syncStatus.syncErrors.slice(-1)[0],
        configLastUpdate: device.configuration.lastConfigUpdate
      };
    } catch (error) {
      console.error('❌ Error getting sync status:', error);
      throw error;
    }
  }

  /**
   * Get default device settings structure
   * @returns {Object} Default settings object
   */
  getDefaultDeviceSettings() {
    return {
      electrode: 0,
      shuntVoltage: 25,
      shuntCurrent: 999,
      referenceFail: 30,
      referenceUP: 300,
      referenceOV: 60,
      interruptOnTime: 100,
      interruptOffTime: 100,
      interruptStartTimeStamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      interruptStopTimeStamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      dpolInterval: "00:00:00",
      depolarizationStartTimeStamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      depolarizationStopTimeStamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      instantMode: 0,
      instantStartTimeStamp: "19:04:00",
      instantEndTimeStamp: "00:00:00",
      manualModeAction: "stop"
    };
  }

  /**
   * Map external parameter names to internal field names
   * @param {Object} parameters - External parameters
   * @returns {Object} Mapped internal parameters
   */
  mapParametersToInternalFields(parameters) {
    const mapping = {
      "Electrode": "electrode",
      "Shunt Voltage": "shuntVoltage",
      "Shunt Current": "shuntCurrent",
      "Reference Fail": "referenceFail",
      "Reference UP": "referenceUP",
      "Reference OV": "referenceOV",
      "Interrupt ON Time": "interruptOnTime",
      "Interrupt OFF Time": "interruptOffTime",
      "Interrupt Start TimeStamp": "interruptStartTimeStamp",
      "Interrupt Stop TimeStamp": "interruptStopTimeStamp",
      "DPOL Interval": "dpolInterval",
      "Depolarization Start TimeStamp": "depolarizationStartTimeStamp",
      "Depolarization Stop TimeStamp": "depolarizationStopTimeStamp",
      "Instant Mode": "instantMode",
      "Instant Start TimeStamp": "instantStartTimeStamp",
      "Instant End TimeStamp": "instantEndTimeStamp",
      "Manual Mode Action": "manualModeAction"
    };

    const mapped = {};
    for (const [key, value] of Object.entries(parameters)) {
      const internalKey = mapping[key] || key;
      mapped[internalKey] = value;
    }

    return mapped;
  }

  /**
   * Initialize database with sample devices (for testing)
   * @returns {Array} Created sample devices
   */
  async initializeSampleDevices() {
    try {
      const sampleDevices = [
        {
          deviceId: "ZEPTAC001",
          name: "Primary Sensor Unit",
          type: "sensor",
          location: { latitude: 40.7128, longitude: -74.0060 }
        },
        {
          deviceId: "ZEPTAC002", 
          name: "Secondary Sensor Unit",
          type: "sensor",
          location: { latitude: 40.7589, longitude: -73.9851 }
        },
        {
          deviceId: "GATEWAY001",
          name: "Main Gateway",
          type: "gateway",
          location: { latitude: 40.7505, longitude: -73.9934 }
        }
      ];

      const createdDevices = [];
      for (const deviceData of sampleDevices) {
        try {
          const device = await this.registerDevice(deviceData);
          createdDevices.push(device);
        } catch (error) {
          if (error.message.includes('already exists')) {
            console.log(`ℹ️ Device ${deviceData.deviceId} already exists, skipping...`);
          } else {
            throw error;
          }
        }
      }

      console.log(`✅ Sample devices initialized: ${createdDevices.length} devices`);
      return createdDevices;
    } catch (error) {
      console.error('❌ Error initializing sample devices:', error);
      throw error;
    }
  }
}

module.exports = new DeviceManagementService();
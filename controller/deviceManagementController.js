const deviceManagementService = require('../services/deviceManagementService');
const mqttService = require('../services/mqttService');
const { v4: uuidv4 } = require('uuid');

/**
 * Device Management Controller
 * Handles API endpoints for device registration, settings storage, and management
 */
class DeviceManagementController {

  /**
   * Register a new device
   * POST /api/device-management/register
   */
  async registerDevice(req, res) {
    try {
      const { deviceId, name, type, brokerUrl, topics, location, initialSettings } = req.body;

      // Validate required fields
      if (!deviceId || !name) {
        return res.status(400).json({
          success: false,
          message: 'Device ID and name are required'
        });
      }

      const deviceData = {
        deviceId,
        name,
        type,
        brokerUrl,
        topics,
        location,
        initialSettings
      };

      const device = await deviceManagementService.registerDevice(deviceData);

      res.status(201).json({
        success: true,
        message: 'Device registered successfully',
        data: {
          deviceId: device.deviceId,
          name: device.name,
          type: device.type,
          status: device.status,
          createdAt: device.createdAt
        }
      });

    } catch (error) {
      console.error('Error registering device:', error);
      res.status(error.message.includes('already exists') ? 409 : 500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get device settings
   * GET /api/device-management/:deviceId/settings
   */
  async getDeviceSettings(req, res) {
    try {
      const { deviceId } = req.params;

      const settings = await deviceManagementService.getDeviceSettings(deviceId);

      res.json({
        success: true,
        data: settings
      });

    } catch (error) {
      console.error('Error getting device settings:', error);
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Update device settings and send complete payload via MQTT
   * PUT /api/device-management/:deviceId/settings
   */
  async updateDeviceSettings(req, res) {
    try {
      const { deviceId } = req.params;
      const { parameters, sendToDevice = true } = req.body;

      if (!parameters || typeof parameters !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Parameters object is required'
        });
      }

      const commandId = uuidv4();

      // Update device parameters in database
      const updatedSettings = await deviceManagementService.updateDeviceParameters(
        deviceId, 
        parameters, 
        commandId
      );

      // Send complete settings to device via MQTT if requested
      if (sendToDevice) {
        try {
          await mqttService.sendCompleteSettingsPayload(deviceId, commandId);
        } catch (mqttError) {
          console.warn('MQTT send failed, but database was updated:', mqttError.message);
        }
      }

      res.json({
        success: true,
        message: 'Device settings updated successfully',
        data: {
          commandId,
          settings: updatedSettings,
          sentToDevice: sendToDevice
        }
      });

    } catch (error) {
      console.error('Error updating device settings:', error);
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Store device settings (without sending to device)
   * POST /api/device-management/:deviceId/settings/store
   */
  async storeDeviceSettings(req, res) {
    try {
      const { deviceId } = req.params;
      const { settings, source = 'api_request' } = req.body;

      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Settings object is required'
        });
      }

      const device = await deviceManagementService.storeDeviceSettings(deviceId, settings, source);

      res.json({
        success: true,
        message: 'Device settings stored successfully',
        data: {
          deviceId,
          lastUpdate: device.configuration.lastConfigUpdate,
          source: device.configuration.source
        }
      });

    } catch (error) {
      console.error('Error storing device settings:', error);
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get all devices with their settings
   * GET /api/device-management/devices
   */
  async getAllDevices(req, res) {
    try {
      const devices = await deviceManagementService.getAllDevicesWithSettings();

      res.json({
        success: true,
        data: devices,
        count: devices.length
      });

    } catch (error) {
      console.error('Error getting all devices:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Delete a device
   * DELETE /api/device-management/:deviceId
   */
  async deleteDevice(req, res) {
    try {
      const { deviceId } = req.params;

      await deviceManagementService.deleteDevice(deviceId);

      res.json({
        success: true,
        message: `Device ${deviceId} deleted successfully`
      });

    } catch (error) {
      console.error('Error deleting device:', error);
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get device synchronization status
   * GET /api/device-management/:deviceId/sync-status
   */
  async getDeviceSyncStatus(req, res) {
    try {
      const { deviceId } = req.params;

      const syncStatus = await deviceManagementService.getDeviceSyncStatus(deviceId);

      res.json({
        success: true,
        data: syncStatus
      });

    } catch (error) {
      console.error('Error getting sync status:', error);
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Mark command as successful (called when device acknowledges)
   * POST /api/device-management/:deviceId/command/:commandId/success
   */
  async markCommandSuccess(req, res) {
    try {
      const { deviceId, commandId } = req.params;

      await deviceManagementService.markCommandSuccess(deviceId, commandId);

      res.json({
        success: true,
        message: 'Command marked as successful'
      });

    } catch (error) {
      console.error('Error marking command success:', error);
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Initialize sample devices for testing
   * POST /api/device-management/initialize-samples
   */
  async initializeSampleDevices(req, res) {
    try {
      const devices = await deviceManagementService.initializeSampleDevices();

      res.json({
        success: true,
        message: 'Sample devices initialized successfully',
        data: devices.map(d => ({
          deviceId: d.deviceId,
          name: d.name,
          type: d.type
        }))
      });

    } catch (error) {
      console.error('Error initializing sample devices:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Bulk update settings for multiple devices
   * POST /api/device-management/bulk-update
   */
  async bulkUpdateSettings(req, res) {
    try {
      const { devices, parameters, sendToDevice = true } = req.body;

      if (!Array.isArray(devices) || !parameters) {
        return res.status(400).json({
          success: false,
          message: 'Devices array and parameters are required'
        });
      }

      const results = [];
      const commandId = uuidv4();

      for (const deviceId of devices) {
        try {
          // Update device settings
          const updatedSettings = await deviceManagementService.updateDeviceParameters(
            deviceId, 
            parameters, 
            commandId
          );

          // Send to device if requested
          if (sendToDevice) {
            try {
              await mqttService.sendCompleteSettingsPayload(deviceId, commandId);
            } catch (mqttError) {
              console.warn(`MQTT send failed for ${deviceId}:`, mqttError.message);
            }
          }

          results.push({
            deviceId,
            success: true,
            settings: updatedSettings
          });

        } catch (error) {
          results.push({
            deviceId,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;

      res.json({
        success: successCount > 0,
        message: `Bulk update completed. ${successCount}/${devices.length} devices updated successfully`,
        data: {
          commandId,
          results,
          successCount,
          totalCount: devices.length
        }
      });

    } catch (error) {
      console.error('Error in bulk update:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get device configuration history
   * GET /api/device-management/:deviceId/history
   */
  async getDeviceHistory(req, res) {
    try {
      const { deviceId } = req.params;
      const { limit = 20 } = req.query;

      const Device = require('../models/Device');
      const device = await Device.findByDeviceId(deviceId);
      
      if (!device) {
        return res.status(404).json({
          success: false,
          message: 'Device not found'
        });
      }

      const history = device.configuration.configHistory || [];
      const limitedHistory = history.slice(-parseInt(limit));

      res.json({
        success: true,
        data: {
          deviceId,
          historyCount: history.length,
          history: limitedHistory.reverse() // Most recent first
        }
      });

    } catch (error) {
      console.error('Error getting device history:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new DeviceManagementController();
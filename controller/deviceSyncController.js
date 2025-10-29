const deviceSyncService = require('../services/deviceSyncService');

class DeviceSyncController {
  /**
   * Get current device configuration
   */
  async getDeviceConfiguration(req, res) {
    try {
      const { deviceId } = req.params;
      
      const config = deviceSyncService.getDeviceConfiguration(deviceId);
      
      if (!config) {
        // Try to request configuration from device
        console.log(`🔍 No cached config for device ${deviceId}, requesting from device...`);
        
        try {
          const requestId = await deviceSyncService.syncDeviceConfiguration(deviceId);
          
          // Wait a moment for response
          setTimeout(() => {
            const freshConfig = deviceSyncService.getDeviceConfiguration(deviceId);
            if (freshConfig) {
              res.json({
                success: true,
                data: freshConfig,
                message: 'Configuration retrieved from device'
              });
            } else {
              res.json({
                success: false,
                message: 'Device configuration not available. Device may be offline or not responding.',
                requestId: requestId
              });
            }
          }, 5000); // Wait 5 seconds for device response
          
          return; // Exit early, response will be sent in timeout
          
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Failed to request device configuration',
            error: error.message
          });
        }
      }
      
      res.json({
        success: true,
        data: config,
        message: 'Configuration retrieved from cache'
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error retrieving device configuration',
        error: error.message
      });
    }
  }

  /**
   * Get all device configurations
   */
  async getAllDeviceConfigurations(req, res) {
    try {
      const configs = deviceSyncService.getAllDeviceConfigurations();
      
      res.json({
        success: true,
        data: configs,
        count: Object.keys(configs).length
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error retrieving device configurations',
        error: error.message
      });
    }
  }

  /**
   * Force sync device configuration
   */
  async syncDeviceConfiguration(req, res) {
    try {
      const { deviceId } = req.params;
      
      if (!deviceSyncService.isDeviceConnected()) {
        return res.status(503).json({
          success: false,
          message: 'MQTT broker not connected. Cannot sync device configuration.'
        });
      }
      
      const requestId = await deviceSyncService.syncDeviceConfiguration(deviceId);
      
      res.json({
        success: true,
        message: `Configuration sync requested for device ${deviceId}`,
        requestId: requestId,
        note: 'Check device configuration endpoint in a few seconds for updated data'
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error syncing device configuration',
        error: error.message
      });
    }
  }

  /**
   * Request specific configuration type
   */
  async requestSpecificConfig(req, res) {
    try {
      const { deviceId } = req.params;
      const { configType } = req.body;
      
      if (!configType) {
        return res.status(400).json({
          success: false,
          message: 'configType is required in request body'
        });
      }
      
      const config = await deviceSyncService.requestSpecificConfig(deviceId, configType);
      
      res.json({
        success: true,
        data: config,
        message: `${configType} configuration retrieved from device`
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: `Error requesting ${req.body.configType || 'specific'} configuration`,
        error: error.message
      });
    }
  }

  /**
   * Get device connection status and sync statistics
   */
  async getDeviceSyncStatus(req, res) {
    try {
      const connectionStatus = deviceSyncService.getConnectionStatus();
      const allConfigs = deviceSyncService.getAllDeviceConfigurations();
      
      const syncStatus = {
        mqttConnected: connectionStatus.device,
        lastSyncTimestamp: deviceSyncService.getLastTimestamp(),
        cachedDevices: Object.keys(allConfigs).length,
        deviceStatuses: {}
      };
      
      // Add individual device status
      Object.entries(allConfigs).forEach(([deviceId, config]) => {
        syncStatus.deviceStatuses[deviceId] = {
          lastUpdated: config.lastUpdated,
          currentMode: config.currentMode,
          source: config.source,
          hasTimerConfig: !!config.timerSettings,
          hasElectrodeConfig: !!config.electrodeConfig,
          hasAlarmConfig: !!config.alarmConfig
        };
      });
      
      res.json({
        success: true,
        data: syncStatus
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error retrieving sync status',
        error: error.message
      });
    }
  }

  /**
   * Reset device configuration cache
   */
  async resetDeviceConfigCache(req, res) {
    try {
      const { deviceId } = req.params;
      
      if (deviceId) {
        // Reset specific device
        deviceSyncService.deviceConfigurations.delete(deviceId);
        res.json({
          success: true,
          message: `Configuration cache cleared for device ${deviceId}`
        });
      } else {
        // Reset all devices
        deviceSyncService.deviceConfigurations.clear();
        res.json({
          success: true,
          message: 'All device configuration caches cleared'
        });
      }
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error resetting configuration cache',
        error: error.message
      });
    }
  }

  /**
   * Bulk sync all known devices
   */
  async bulkSyncDevices(req, res) {
    try {
      const { deviceIds } = req.body;
      
      if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'deviceIds array is required in request body'
        });
      }
      
      if (!deviceSyncService.isDeviceConnected()) {
        return res.status(503).json({
          success: false,
          message: 'MQTT broker not connected. Cannot sync devices.'
        });
      }
      
      const results = [];
      
      for (const deviceId of deviceIds) {
        try {
          const requestId = await deviceSyncService.syncDeviceConfiguration(deviceId);
          results.push({
            deviceId,
            status: 'requested',
            requestId
          });
          
          // Add small delay between requests to avoid overwhelming the device
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          results.push({
            deviceId,
            status: 'failed',
            error: error.message
          });
        }
      }
      
      res.json({
        success: true,
        message: `Bulk sync requested for ${deviceIds.length} devices`,
        results: results,
        note: 'Check individual device configurations in a few seconds for updated data'
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error performing bulk device sync',
        error: error.message
      });
    }
  }
}

module.exports = new DeviceSyncController();
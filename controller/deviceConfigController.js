const mqttService = require('../services/mqttService');

class DeviceConfigController {
  // Configure interrupt mode
  async configureInterruptMode(req, res) {
    try {
      const { deviceId } = req.params;
      const {
        startDate,
        startTime,
        stopDate,
        stopTime,
        onTime,
        offTime,
        dateFormat
      } = req.body;

      console.log(`🔧 Configuring interrupt mode for device ${deviceId}:`, req.body);

      // Validate required fields
      if (!startDate || !startTime || !stopDate || !stopTime || !onTime || !offTime) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields for interrupt mode configuration'
        });
      }

      const config = {
        startDate,
        startTime,
        stopDate,
        stopTime,
        onTime: parseInt(onTime),
        offTime: parseInt(offTime),
        dateFormat: dateFormat || {}
      };

      // Publish command and respond immediately (don't wait for device ack)
      mqttService.setInterruptMode(deviceId, config).catch(err => {
        console.error('Background interrupt mode command failed:', err);
      });
      
      res.json({
        success: true,
        message: 'Interrupt mode configuration sent to device'
      });

    } catch (error) {
      console.error('Error configuring interrupt mode:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to configure interrupt mode'
      });
    }
  }

  // Configure manual mode
  async configureManualMode(req, res) {
    try {
      const { deviceId } = req.params;
      const { action } = req.body; // 'start' or 'stop'

      console.log(`🔧 Configuring manual mode for device ${deviceId}: ${action}`);

      if (!action || !['start', 'stop'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid action. Must be "start" or "stop"'
        });
      }

      // Publish command and respond immediately (don't wait for device ack)
      mqttService.setManualMode(deviceId, action).catch(err => {
        console.error('Background manual mode command failed:', err);
      });
      
      res.json({
        success: true,
        message: `Manual mode ${action} command sent to device`
      });

    } catch (error) {
      console.error('Error configuring manual mode:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to configure manual mode'
      });
    }
  }

  // Configure normal mode
  async configureNormalMode(req, res) {
    try {
      const { deviceId } = req.params;
      const config = req.body || {};

      console.log(`🔧 Configuring normal mode for device ${deviceId}:`, config);

      // Publish command and respond immediately (don't wait for device ack)
      mqttService.setNormalMode(deviceId, config).catch(err => {
        console.error('Background normal mode command failed:', err);
      });
      
      res.json({
        success: true,
        message: 'Normal mode configuration sent to device'
      });

    } catch (error) {
      console.error('Error configuring normal mode:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to configure normal mode'
      });
    }
  }

  // Configure DPOL mode
  async configureDpolMode(req, res) {
    try {
      const { deviceId } = req.params;
      const { startDate, startTime, endDate, endTime, dateFormat } = req.body;

      console.log(`🔧 Configuring DPOL mode for device ${deviceId}:`, req.body);

      const config = {
        startDate,
        startTime,
        endDate,
        endTime,
        dateFormat: dateFormat || {}
      };

      // Publish command and respond immediately (don't wait for device ack)
      mqttService.setDpolMode(deviceId, config).catch(err => {
        console.error('Background DPOL mode command failed:', err);
      });
      
      res.json({
        success: true,
        message: 'DPOL mode configuration sent to device'
      });

    } catch (error) {
      console.error('Error configuring DPOL mode:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to configure DPOL mode'
      });
    }
  }

  // Configure INST mode
  async configureInstMode(req, res) {
    try {
      const { deviceId } = req.params;
      const { startDate, startTime, duration, dateFormat } = req.body;

      console.log(`🔧 Configuring INST mode for device ${deviceId}:`, req.body);

      const config = {
        startDate,
        startTime,
        duration,
        dateFormat: dateFormat || {}
      };

      // Publish command and respond immediately (don't wait for device ack)
      mqttService.setInstMode(deviceId, config).catch(err => {
        console.error('Background INST mode command failed:', err);
      });
      
      res.json({
        success: true,
        message: 'INST mode configuration sent to device'
      });

    } catch (error) {
      console.error('Error configuring INST mode:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to configure INST mode'
      });
    }
  }

  // Configure timer settings
  async configureTimer(req, res) {
    try {
      const { deviceId } = req.params;
      const { ton, toff } = req.body;

      console.log(`🔧 Configuring timer for device ${deviceId}:`, req.body);

      const timerConfig = { ton, toff };
      // Publish command and respond immediately (don't wait for device ack)
      mqttService.setTimerConfiguration(deviceId, timerConfig).catch(err => {
        console.error('Background timer configuration command failed:', err);
      });
      
      res.json({
        success: true,
        message: 'Timer configuration sent to device'
      });

    } catch (error) {
      console.error('Error configuring timer:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to configure timer'
      });
    }
  }

  // Configure electrode
  async configureElectrode(req, res) {
    try {
      const { deviceId } = req.params;
      const { electrodeType } = req.body;

      console.log(`🔧 Configuring electrode for device ${deviceId}: ${electrodeType}`);

      if (!electrodeType) {
        return res.status(400).json({
          success: false,
          message: 'Electrode type is required'
        });
      }

      // Publish command and respond immediately (don't wait for device ack)
      mqttService.setElectrodeConfiguration(deviceId, electrodeType).catch(err => {
        console.error('Background electrode configuration command failed:', err);
      });
      
      res.json({
        success: true,
        message: 'Electrode configuration sent to device'
      });

    } catch (error) {
      console.error('Error configuring electrode:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to configure electrode'
      });
    }
  }

  // Configure alarms
  async configureAlarm(req, res) {
    try {
      const { deviceId } = req.params;
      const alarmConfig = req.body;

      console.log(`🔧 Configuring alarm for device ${deviceId}:`, alarmConfig);

      // Publish command and respond immediately (don't wait for device ack)
      mqttService.setAlarmConfiguration(deviceId, alarmConfig).catch(err => {
        console.error('Background alarm configuration command failed:', err);
      });
      
      res.json({
        success: true,
        message: 'Alarm configuration sent to device'
      });

    } catch (error) {
      console.error('Error configuring alarm:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to configure alarm'
      });
    }
  }

  // Get device status
  async getDeviceStatus(req, res) {
    try {
      const { deviceId } = req.params;
      
      const status = {
        connected: mqttService.isDeviceConnected(),
        lastTimestamp: mqttService.getLastTimestamp(),
        deviceData: mqttService.getDeviceData()
      };

      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      console.error('Error getting device status:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get device status'
      });
    }
  }

  // Get current device settings in the requested format
  async getDeviceSettings(req, res) {
    try {
      const { deviceId } = req.params;
      
      // Get current settings from MQTT service memory store
      const currentSettings = mqttService.getDeviceSettings(deviceId);
      
      if (!currentSettings) {
        // Return default settings if none exist
        const defaultSettings = {
          "Device ID": deviceId,
          "Message Type": "settings",
          "sender": "Server",
          "Parameters": {
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
          }
        };

        return res.json({
          success: true,
          data: defaultSettings
        });
      }

      // Format current settings in the requested format
      const formattedSettings = {
        "Device ID": deviceId,
        "Message Type": "settings",
        "sender": "Server",
        "Parameters": currentSettings
      };

      res.json({
        success: true,
        data: formattedSettings
      });

    } catch (error) {
      console.error('Error getting device settings:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get device settings'
      });
    }
  }

  // Update complete device settings (sends entire payload)
  async updateDeviceSettings(req, res) {
    try {
      const { deviceId } = req.params;
      const settingsData = req.body;

      console.log(`🔧 Updating complete device settings for device ${deviceId}:`, settingsData);

      if (!settingsData || !settingsData.Parameters) {
        return res.status(400).json({
          success: false,
          message: 'Settings Parameters are required'
        });
      }

      // Send complete settings via MQTT service
      const result = await mqttService.setSettingsConfiguration(deviceId, settingsData.Parameters);
      
      res.json({
        success: true,
        message: 'Complete device settings sent to device',
        commandId: result.commandId,
        status: result.status
      });

    } catch (error) {
      console.error('Error updating device settings:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update device settings'
      });
    }
  }

  // Update single setting (sends entire payload with changed setting)
  async updateSingleSetting(req, res) {
    try {
      const { deviceId } = req.params;
      const { setting, value } = req.body;

      console.log(`🔧 Updating single setting for device ${deviceId}: ${setting} = ${value}`);

      if (!setting || value === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Setting name and value are required'
        });
      }

      // Get current settings from MQTT service
      const currentSettings = mqttService.getDeviceSettings(deviceId) || {};
      
      // Update the single setting
      const updatedSettings = {
        ...currentSettings,
        [setting]: value
      };

      // Send complete settings with the changed setting highlighted
      const result = await mqttService.setSettingsConfiguration(deviceId, updatedSettings);
      
      res.json({
        success: true,
        message: `Setting '${setting}' updated and complete settings sent to device`,
        commandId: result.commandId,
        status: result.status,
        updatedSetting: { [setting]: value }
      });

    } catch (error) {
      console.error('Error updating single setting:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update single setting'
      });
    }
  }
}

module.exports = new DeviceConfigController();
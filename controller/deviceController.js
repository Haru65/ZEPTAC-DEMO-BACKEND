const mqttService = require('../services/mqttService');
const socketService = require('../services/socketService');

class DeviceController {
  // Get all devices data
  static async getDevices(req, res) {
    try {
      const deviceData = mqttService.getDeviceData();
      const connectionStatus = mqttService.getConnectionStatus();
      const lastUpdate = mqttService.getLastTimestamp();

      res.json({
        success: true,
        data: { 
          device: deviceData.device,
          connectionStatus: connectionStatus.device,
          lastUpdate
        }
      });
    } catch (error) {
      console.error('Error getting devices:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Send message to device
  static async sendMessage(req, res) {
    try {
      const { text, type = 'individual' } = req.body;
      
      if (!text || !text.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Message text is required'
        });
      }

      if (!mqttService.isDeviceConnected()) {
        return res.status(503).json({
          success: false,
          error: 'Device 123 is not connected'
        });
      }

      const messagePayload = {
        message: text.trim(),
        timestamp: new Date().toISOString(),
        sender: req.user ? req.user.username : 'api',
        senderId: req.user ? req.user.userId : 'anonymous',
        type: type
      };

      mqttService.publishMessage(messagePayload, (err) => {
        if (err) {
          console.error('❌ API: Error publishing to device 123:', err);
          res.status(500).json({
            success: false,
            error: `Failed to send message: ${err.message}`
          });
        } else {
          console.log('✅ API: Message published to device 123 successfully');
          res.json({
            success: true,
            messageId: `msg_${Date.now()}`,
            details: `Message sent to device 123 via API`
          });
          
          // Notify all connected Socket.io clients about the message
          socketService.emitToAll('messageNotification', {
            type: 'sent',
            message: messagePayload,
            targets: 'device-123',
            sender: messagePayload.sender
          });
        }
      });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // Set device to Interrupt mode
  static async setInterruptMode(req, res) {
    try {
      const { deviceId } = req.params;
      const config = req.body;

      if (!mqttService.isDeviceConnected()) {
        return res.status(503).json({
          success: false,
          error: `Device ${deviceId} is not connected`
        });
      }

      const result = await mqttService.setInterruptMode(deviceId, config);

      res.json({
        success: true,
        message: 'Interrupt mode configuration sent with acknowledgment tracking',
        commandId: result.commandId,
        data: result
      });

      // Notify clients about the configuration change
      socketService.emitToAll('deviceConfigurationSent', {
        deviceId,
        configType: 'Interrupt',
        commandId: result.commandId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error setting interrupt mode:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  // Set device to Manual mode
  static async setManualMode(req, res) {
    try {
      const { deviceId } = req.params;
      const { action } = req.body;

      if (!action) {
        return res.status(400).json({
          success: false,
          error: 'Action is required for manual mode'
        });
      }

      if (!mqttService.isDeviceConnected()) {
        return res.status(503).json({
          success: false,
          error: `Device ${deviceId} is not connected`
        });
      }

      const result = await mqttService.setManualMode(deviceId, action);

      res.json({
        success: true,
        message: 'Manual mode configuration sent with acknowledgment tracking',
        commandId: result.commandId,
        data: result
      });

      // Notify clients about the configuration change
      socketService.emitToAll('deviceConfigurationSent', {
        deviceId,
        configType: 'Manual',
        commandId: result.commandId,
        action,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error setting manual mode:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  // Set device to Normal mode
  static async setNormalMode(req, res) {
    try {
      const { deviceId } = req.params;
      const config = req.body;

      if (!mqttService.isDeviceConnected()) {
        return res.status(503).json({
          success: false,
          error: `Device ${deviceId} is not connected`
        });
      }

      const result = await mqttService.setNormalMode(deviceId, config);

      res.json({
        success: true,
        message: 'Normal mode configuration sent with acknowledgment tracking',
        commandId: result.commandId,
        data: result
      });

      // Notify clients about the configuration change
      socketService.emitToAll('deviceConfigurationSent', {
        deviceId,
        configType: 'Normal',
        commandId: result.commandId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error setting normal mode:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  // Set device to DPOL mode
  static async setDpolMode(req, res) {
    try {
      const { deviceId } = req.params;
      const config = req.body;

      if (!mqttService.isDeviceConnected()) {
        return res.status(503).json({
          success: false,
          error: `Device ${deviceId} is not connected`
        });
      }

      const result = await mqttService.setDpolMode(deviceId, config);

      res.json({
        success: true,
        message: 'DPOL mode configuration sent with acknowledgment tracking',
        commandId: result.commandId,
        data: result
      });

      // Notify clients about the configuration change
      socketService.emitToAll('deviceConfigurationSent', {
        deviceId,
        configType: 'DPOL',
        commandId: result.commandId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error setting DPOL mode:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  // Set device to INST mode
  static async setInstMode(req, res) {
    try {
      const { deviceId } = req.params;
      const config = req.body;

      if (!mqttService.isDeviceConnected()) {
        return res.status(503).json({
          success: false,
          error: `Device ${deviceId} is not connected`
        });
      }

      const result = await mqttService.setInstMode(deviceId, config);

      res.json({
        success: true,
        message: 'INST mode configuration sent with acknowledgment tracking',
        commandId: result.commandId,
        data: result
      });

      // Notify clients about the configuration change
      socketService.emitToAll('deviceConfigurationSent', {
        deviceId,
        configType: 'INST',
        commandId: result.commandId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error setting INST mode:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  // Set device settings configuration
  static async setSettingsMode(req, res) {
    try {
      const { deviceId } = req.params;
      const config = req.body;

      if (!mqttService.isDeviceConnected()) {
        return res.status(503).json({
          success: false,
          error: `Device ${deviceId} is not connected`
        });
      }

      const result = await mqttService.setSettingsConfiguration(deviceId, config);

      res.json({
        success: true,
        message: 'Settings configuration sent with acknowledgment tracking',
        commandId: result.commandId,
        data: result
      });

      // Notify clients about the configuration change
      socketService.emitToAll('deviceConfigurationSent', {
        deviceId,
        configType: 'settings',
        commandId: result.commandId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error setting device settings:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  // Health check endpoint
  static async getHealth(req, res) {
    try {
      const deviceData = mqttService.getDeviceData();
      const connectionStatus = mqttService.getConnectionStatus();

      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        device: deviceData.device ? 'connected' : 'no-data',
        connectionStatus: connectionStatus.device,
        user: req.user ? req.user.username : 'anonymous'
      });
    } catch (error) {
      console.error('Error getting health:', error);
      res.status(500).json({
        status: 'error',
        error: 'Internal server error'
      });
    }
  }
}

module.exports = DeviceController;
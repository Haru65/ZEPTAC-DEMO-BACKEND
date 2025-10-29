const mqttService = require('../services/mqttService');

class DeviceAcknowledgmentController {

  /**
   * Get acknowledgment status for a specific command
   */
  async getCommandStatus(req, res) {
    try {
      const { commandId } = req.params;

      const command = mqttService.getCommandStatus(commandId);

      if (!command) {
        return res.status(404).json({
          success: false,
          message: 'Command not found'
        });
      }

      res.json({
        success: true,
        data: {
          commandId: command.commandId,
          deviceId: command.deviceId,
          command: command.originalCommand,
          status: command.status,
          sentAt: command.sentAt,
          acknowledgedAt: command.acknowledgedAt,
          responseTime: command.responseTime,
          deviceResponse: command.deviceResponse,
          timeout: command.timeout
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error retrieving command status',
        error: error.message
      });
    }
  }

  /**
   * Get all acknowledgments for a device
   */
  async getDeviceAcknowledgments(req, res) {
    try {
      const { deviceId } = req.params;
      const { status, limit = 50, offset = 0 } = req.query;

      const allCommands = mqttService.getDeviceCommands(deviceId, status);
      
      // Apply pagination
      const limitNum = parseInt(limit);
      const offsetNum = parseInt(offset);
      const commands = allCommands.slice(offsetNum, offsetNum + limitNum);
      const total = allCommands.length;

      res.json({
        success: true,
        data: commands.map(cmd => ({
          commandId: cmd.commandId,
          command: cmd.originalCommand,
          status: cmd.status,
          sentAt: cmd.sentAt,
          acknowledgedAt: cmd.acknowledgedAt,
          responseTime: cmd.responseTime,
          deviceResponse: cmd.deviceResponse
        })),
        meta: {
          total,
          limit: limitNum,
          offset: offsetNum,
          hasMore: total > offsetNum + limitNum
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error retrieving device acknowledgments',
        error: error.message
      });
    }
  }

  /**
   * Get acknowledgment statistics for a device
   */
  async getDeviceAckStats(req, res) {
    try {
      const { deviceId } = req.params;
      const { fromDate } = req.query;

      const fromDateObj = fromDate ? new Date(fromDate) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default to last 24 hours

      const stats = mqttService.getCommandStatistics(deviceId, fromDateObj);

      res.json({
        success: true,
        data: {
          deviceId,
          period: {
            from: fromDateObj,
            to: new Date()
          },
          summary: stats
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error retrieving acknowledgment statistics',
        error: error.message
      });
    }
  }

  /**
   * Get pending acknowledgments for a device
   */
  async getPendingAcknowledgments(req, res) {
    try {
      const { deviceId } = req.params;

      const pendingCommands = mqttService.getPendingCommands(deviceId);

      res.json({
        success: true,
        data: pendingCommands.map(cmd => ({
          commandId: cmd.commandId,
          command: cmd.originalCommand,
          sentAt: cmd.sentAt,
          timeoutAt: new Date(cmd.sentAt.getTime() + cmd.timeout),
          remainingTime: Math.max(0, cmd.timeout - (Date.now() - cmd.sentAt.getTime()))
        }))
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error retrieving pending acknowledgments',
        error: error.message
      });
    }
  }

  /**
   * Retry a failed or timed out command
   */
  async retryCommand(req, res) {
    try {
      const { commandId } = req.params;

      const originalCommand = mqttService.getCommandStatus(commandId);

      if (!originalCommand) {
        return res.status(404).json({
          success: false,
          message: 'Original command not found'
        });
      }

      if (originalCommand.status === 'PENDING') {
        return res.status(400).json({
          success: false,
          message: 'Command is still pending, cannot retry'
        });
      }

      // Send the command again with acknowledgment
      const result = await mqttService.sendDeviceConfigurationWithAck(
        originalCommand.deviceId,
        originalCommand.originalCommand,
        originalCommand.commandPayload
      );

      res.json({
        success: true,
        message: 'Command retry initiated',
        data: {
          originalCommandId: commandId,
          newCommandId: result.commandId
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error retrying command',
        error: error.message
      });
    }
  }

  /**
   * Get system-wide acknowledgment overview
   */
  async getSystemAckOverview(req, res) {
    try {
      const { fromDate } = req.query;
      const fromDateObj = fromDate ? new Date(fromDate) : new Date(Date.now() - 24 * 60 * 60 * 1000);

      // For now, just return device 123 stats as system overview
      // In a multi-device system, you would aggregate across all devices
      const deviceStats = mqttService.getCommandStatistics('123', fromDateObj);

      res.json({
        success: true,
        data: {
          period: {
            from: fromDateObj,
            to: new Date()
          },
          systemTotal: deviceStats,
          deviceBreakdown: [
            {
              _id: '123',
              ...deviceStats
            }
          ]
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error retrieving system acknowledgment overview',
        error: error.message
      });
    }
  }
}

module.exports = new DeviceAcknowledgmentController();
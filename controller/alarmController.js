const NotificationService = require('../services/notificationService');

class AlarmController {
  constructor() {
    this.notificationService = new NotificationService();
    // Simulated in-memory alarm storage (replace with real database)
    this.alarms = [
      {
        id: 1,
        name: "High Temp Alert",
        device_name: "Sensor A",
        unit_no: "U001",
        location: "Room 101",
        parameter: "Temperature",
        alarm_type: "Critical Temperature",
        status: "Active",
        severity: "critical",
        pv_values: { pv1: 85.2, pv2: 34.1, pv3: 12.5, pv4: 67.8, pv5: 23.4, pv6: 45.6 },
        notification_config: { 
          sms_numbers: ["+1234567890", "+0987654321"], 
          email_ids: ["admin@company.com", "tech@company.com"] 
        },
        link: "/device-details/1",
        created_at: "2025-06-20 10:00:00",
        last_modified: "2025-06-20 10:00:00"
      }
    ];
  }

  /**
   * Get all alarms
   */
  async getAllAlarms(req, res) {
    try {
      res.json({
        success: true,
        data: this.alarms,
        total: this.alarms.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching alarms',
        error: error.message
      });
    }
  }

  /**
   * Get alarm by ID
   */
  async getAlarmById(req, res) {
    try {
      const { id } = req.params;
      const alarm = this.alarms.find(a => a.id == id);
      
      if (!alarm) {
        return res.status(404).json({
          success: false,
          message: 'Alarm not found'
        });
      }

      res.json({
        success: true,
        data: alarm
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching alarm',
        error: error.message
      });
    }
  }

  /**
   * Create new alarm
   */
  async createAlarm(req, res) {
    try {
      const alarmData = {
        id: Math.floor(Math.random() * 10000) + 100,
        ...req.body,
        created_at: new Date().toISOString(),
        last_modified: new Date().toISOString()
      };

      this.alarms.push(alarmData);

      // Send notifications if alarm is active and critical/warning
      if (alarmData.status === 'Active' && 
          ['critical', 'warning'].includes(alarmData.severity)) {
        await this.notificationService.sendAlarmNotifications(alarmData);
      }

      res.status(201).json({
        success: true,
        message: 'Alarm created successfully',
        data: alarmData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error creating alarm',
        error: error.message
      });
    }
  }

  /**
   * Update alarm
   */
  async updateAlarm(req, res) {
    try {
      const { id } = req.params;
      const alarmIndex = this.alarms.findIndex(a => a.id == id);
      
      if (alarmIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Alarm not found'
        });
      }

      const updatedAlarm = {
        ...this.alarms[alarmIndex],
        ...req.body,
        last_modified: new Date().toISOString()
      };

      this.alarms[alarmIndex] = updatedAlarm;

      res.json({
        success: true,
        message: 'Alarm updated successfully',
        data: updatedAlarm
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating alarm',
        error: error.message
      });
    }
  }

  /**
   * Delete alarm
   */
  async deleteAlarm(req, res) {
    try {
      const { id } = req.params;
      const alarmIndex = this.alarms.findIndex(a => a.id == id);
      
      if (alarmIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Alarm not found'
        });
      }

      this.alarms.splice(alarmIndex, 1);

      res.json({
        success: true,
        message: 'Alarm deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error deleting alarm',
        error: error.message
      });
    }
  }

  /**
   * Send SMS notification for specific alarm
   */
  async sendSMSNotification(req, res) {
    try {
      const { id } = req.params;
      const alarm = this.alarms.find(a => a.id == id);
      
      if (!alarm) {
        return res.status(404).json({
          success: false,
          message: 'Alarm not found'
        });
      }

      if (alarm.notification_config.sms_numbers.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No SMS numbers configured for this alarm'
        });
      }

      const results = await this.notificationService.sendSMSNotification(
        alarm, 
        alarm.notification_config.sms_numbers
      );

      res.json({
        success: true,
        message: 'SMS notifications sent',
        data: results
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error sending SMS notification',
        error: error.message
      });
    }
  }

  /**
   * Send email notification for specific alarm
   */
  async sendEmailNotification(req, res) {
    try {
      const { id } = req.params;
      const alarm = this.alarms.find(a => a.id == id);
      
      if (!alarm) {
        return res.status(404).json({
          success: false,
          message: 'Alarm not found'
        });
      }

      if (alarm.notification_config.email_ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No email addresses configured for this alarm'
        });
      }

      const results = await this.notificationService.sendEmailNotification(
        alarm, 
        alarm.notification_config.email_ids
      );

      res.json({
        success: true,
        message: 'Email notifications sent',
        data: results
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error sending email notification',
        error: error.message
      });
    }
  }

  /**
   * Get device status summary for dashboard
   */
  async getDeviceStatusSummary(req, res) {
    try {
      // Group alarms by device to calculate alarm counts
      const deviceAlarmCounts = {};
      
      this.alarms.forEach(alarm => {
        if (!deviceAlarmCounts[alarm.device_name]) {
          deviceAlarmCounts[alarm.device_name] = 0;
        }
        if (alarm.status === 'Active') {
          deviceAlarmCounts[alarm.device_name]++;
        }
      });

      // Mock device status data (replace with real device data)
      const devices = [
        {
          id: "DEV001",
          name: "Temperature Sensor A",
          unit_no: "U001",
          location: "Room 101",
          alarm_count: deviceAlarmCounts["Sensor A"] || 0,
          status: this.getDeviceStatus(deviceAlarmCounts["Sensor A"] || 0),
          device_type: "sensor",
          last_update: new Date().toISOString(),
          pv_preview: [85.2, 34.1, 12.5]
        },
        {
          id: "DEV002",
          name: "Pressure Sensor B",
          unit_no: "U002",
          location: "Room 102",
          alarm_count: deviceAlarmCounts["Sensor B"] || 0,
          status: this.getDeviceStatus(deviceAlarmCounts["Sensor B"] || 0),
          device_type: "sensor",
          last_update: new Date().toISOString(),
          pv_preview: [45.1, 67.2, 23.8]
        }
      ];

      res.json({
        success: true,
        data: devices
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching device status',
        error: error.message
      });
    }
  }

  /**
   * Get device status based on alarm count
   */
  getDeviceStatus(alarmCount) {
    if (alarmCount >= 3) return 'critical';
    if (alarmCount === 2) return 'warning';
    if (alarmCount === 1) return 'info';
    return 'ok';
  }

  /**
   * Trigger alarm notification (for testing purposes)
   */
  async triggerAlarmNotification(req, res) {
    try {
      const { id } = req.params;
      const alarm = this.alarms.find(a => a.id == id);
      
      if (!alarm) {
        return res.status(404).json({
          success: false,
          message: 'Alarm not found'
        });
      }

      const results = await this.notificationService.sendAlarmNotifications(alarm);

      res.json({
        success: true,
        message: 'Alarm notifications triggered',
        data: results
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error triggering alarm notification',
        error: error.message
      });
    }
  }
}

module.exports = new AlarmController();
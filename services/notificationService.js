const nodemailer = require('nodemailer');
const twilio = require('twilio');

class NotificationService {
  constructor() {
    // Initialize Twilio for SMS
    this.twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    // Initialize nodemailer for email
    this.emailTransporter = nodemailer.createTransport({
      service: 'gmail', // or your email service
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  /**
   * Send SMS notification for alarm
   * @param {Object} alarm - Alarm object with details
   * @param {Array} phoneNumbers - Array of phone numbers to notify
   */
  async sendSMSNotification(alarm, phoneNumbers) {
    const message = this.formatSMSMessage(alarm);
    const results = [];

    for (const phoneNumber of phoneNumbers) {
      try {
        const result = await this.twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: phoneNumber
        });
        results.push({ phoneNumber, status: 'sent', messageId: result.sid });
      } catch (error) {
        results.push({ phoneNumber, status: 'failed', error: error.message });
      }
    }

    return results;
  }

  /**
   * Send email notification for alarm
   * @param {Object} alarm - Alarm object with details
   * @param {Array} emailAddresses - Array of email addresses to notify
   */
  async sendEmailNotification(alarm, emailAddresses) {
    const { subject, html } = this.formatEmailMessage(alarm);
    const results = [];

    for (const email of emailAddresses) {
      try {
        const result = await this.emailTransporter.sendMail({
          from: process.env.EMAIL_FROM || 'noreply@zeptac.com',
          to: email,
          subject: subject,
          html: html
        });
        results.push({ email, status: 'sent', messageId: result.messageId });
      } catch (error) {
        results.push({ email, status: 'failed', error: error.message });
      }
    }

    return results;
  }

  /**
   * Format SMS message for alarm notification
   * @param {Object} alarm - Alarm object
   * @returns {string} Formatted SMS message
   */
  formatSMSMessage(alarm) {
    const timestamp = new Date().toLocaleString();
    return `🚨 ALARM ALERT 🚨
Unit: ${alarm.unit_no}
Location: ${alarm.location}
Time: ${timestamp}
Type: ${alarm.alarm_type}
Device: ${alarm.device_name}
PV1-PV6: ${alarm.pv_values.pv1}, ${alarm.pv_values.pv2}, ${alarm.pv_values.pv3}, ${alarm.pv_values.pv4}, ${alarm.pv_values.pv5}, ${alarm.pv_values.pv6}
Link: ${process.env.FRONTEND_URL}${alarm.link}
Severity: ${alarm.severity.toUpperCase()}`;
  }

  /**
   * Format email message for alarm notification
   * @param {Object} alarm - Alarm object
   * @returns {Object} Email subject and HTML body
   */
  formatEmailMessage(alarm) {
    const timestamp = new Date().toLocaleString();
    const severityColor = this.getSeverityColor(alarm.severity);
    
    const subject = `🚨 ${alarm.severity.toUpperCase()} ALARM: ${alarm.name} - ${alarm.unit_no}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background-color: ${severityColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { padding: 20px; }
          .alarm-details { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .pv-values { display: flex; flex-wrap: wrap; gap: 10px; margin: 15px 0; }
          .pv-badge { background-color: #007bff; color: white; padding: 5px 10px; border-radius: 15px; font-size: 12px; }
          .footer { background-color: #f8f9fa; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; }
          .btn { background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚨 ALARM NOTIFICATION</h1>
            <h2>${alarm.name}</h2>
          </div>
          <div class="content">
            <div class="alarm-details">
              <h3>Alarm Details</h3>
              <p><strong>Unit Number:</strong> ${alarm.unit_no}</p>
              <p><strong>Location:</strong> ${alarm.location}</p>
              <p><strong>Date & Time:</strong> ${timestamp}</p>
              <p><strong>Alarm Type:</strong> ${alarm.alarm_type}</p>
              <p><strong>Device:</strong> ${alarm.device_name}</p>
              <p><strong>Parameter:</strong> ${alarm.parameter}</p>
              <p><strong>Severity:</strong> <span style="color: ${severityColor}; font-weight: bold;">${alarm.severity.toUpperCase()}</span></p>
            </div>
            
            <h3>Process Variable Values (PV1-PV6):</h3>
            <div class="pv-values">
              <span class="pv-badge">PV1: ${alarm.pv_values.pv1}</span>
              <span class="pv-badge">PV2: ${alarm.pv_values.pv2}</span>
              <span class="pv-badge">PV3: ${alarm.pv_values.pv3}</span>
              <span class="pv-badge">PV4: ${alarm.pv_values.pv4}</span>
              <span class="pv-badge">PV5: ${alarm.pv_values.pv5}</span>
              <span class="pv-badge">PV6: ${alarm.pv_values.pv6}</span>
            </div>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}${alarm.link}" class="btn">View Device Details</a>
            </div>
          </div>
          <div class="footer">
            <p><small>This is an automated message from ZEPTAC IoT Platform</small></p>
            <p><small>Please do not reply to this email</small></p>
          </div>
        </div>
      </body>
      </html>
    `;

    return { subject, html };
  }

  /**
   * Get color code based on alarm severity
   * @param {string} severity - Alarm severity level
   * @returns {string} Color code
   */
  getSeverityColor(severity) {
    const colors = {
      critical: '#dc3545',
      warning: '#ffc107',
      info: '#17a2b8',
      ok: '#28a745',
      battery: '#007bff'
    };
    return colors[severity] || '#6c757d';
  }

  /**
   * Send bulk notifications for alarm
   * @param {Object} alarm - Alarm object
   * @returns {Object} Results of SMS and email notifications
   */
  async sendAlarmNotifications(alarm) {
    const results = {
      sms: [],
      email: [],
      timestamp: new Date().toISOString()
    };

    // Send SMS notifications
    if (alarm.notification_config.sms_numbers.length > 0) {
      results.sms = await this.sendSMSNotification(
        alarm, 
        alarm.notification_config.sms_numbers
      );
    }

    // Send email notifications
    if (alarm.notification_config.email_ids.length > 0) {
      results.email = await this.sendEmailNotification(
        alarm, 
        alarm.notification_config.email_ids
      );
    }

    return results;
  }
}

module.exports = NotificationService;
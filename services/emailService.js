const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

class EmailService {
  constructor() {
    // Initialize nodemailer transporters for different email providers
    this.transporters = {
      gmail: null,
      outlook: null,
      smtp: null
    };
    
    this.initializeTransporters();
    
    // Email templates storage
    this.templates = {
      alarm: this.loadTemplate('alarm'),
      maintenance: this.loadTemplate('maintenance'),
      report: this.loadTemplate('report'),
      custom: this.loadTemplate('custom')
    };
  }

  /**
   * Initialize email transporters for different providers
   */
  initializeTransporters() {
    // Gmail transporter
    if (process.env.GMAIL_USER && process.env.GMAIL_PASSWORD) {
      this.transporters.gmail = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASSWORD
        }
      });
    }

    // Outlook transporter
    if (process.env.OUTLOOK_USER && process.env.OUTLOOK_PASSWORD) {
      this.transporters.outlook = nodemailer.createTransporter({
        service: 'hotmail',
        auth: {
          user: process.env.OUTLOOK_USER,
          pass: process.env.OUTLOOK_PASSWORD
        }
      });
    }

    // Generic SMTP transporter
    if (process.env.SMTP_HOST) {
      this.transporters.smtp = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      });
    }
  }

  /**
   * Load email templates
   */
  loadTemplate(templateName) {
    try {
      const templatePath = path.join(__dirname, '..', 'templates', 'email', `${templateName}.html`);
      if (fs.existsSync(templatePath)) {
        return fs.readFileSync(templatePath, 'utf8');
      }
    } catch (error) {
      console.warn(`Template ${templateName} not found, using default`);
    }
    return this.getDefaultTemplate(templateName);
  }

  /**
   * Get default email template
   */
  getDefaultTemplate(templateName) {
    const templates = {
      alarm: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background-color: {{severityColor}}; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { padding: 20px; }
            .alarm-details { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .footer { background-color: #f8f9fa; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; }
            .btn { background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 ALARM NOTIFICATION</h1>
              <h2>{{alarmName}}</h2>
            </div>
            <div class="content">
              {{content}}
            </div>
            <div class="footer">
              <p><small>This is an automated message from ZEPTAC IoT Platform</small></p>
            </div>
          </div>
        </body>
        </html>
      `,
      custom: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background-color: #007bff; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { padding: 20px; }
            .footer { background-color: #f8f9fa; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>{{subject}}</h1>
            </div>
            <div class="content">
              {{content}}
            </div>
            <div class="footer">
              <p><small>ZEPTAC IoT Platform</small></p>
            </div>
          </div>
        </body>
        </html>
      `
    };
    return templates[templateName] || templates.custom;
  }

  /**
   * Send alarm email notification
   */
  async sendAlarmEmail(alarm, recipients, provider = 'gmail') {
    const transporter = this.transporters[provider];
    if (!transporter) {
      throw new Error(`Email provider ${provider} not configured`);
    }

    const { subject, html } = this.formatAlarmEmail(alarm);
    const results = [];

    for (const recipient of recipients) {
      try {
        const result = await transporter.sendMail({
          from: this.getFromAddress(provider),
          to: recipient,
          subject: subject,
          html: html
        });
        results.push({
          recipient,
          status: 'sent',
          messageId: result.messageId,
          provider
        });
      } catch (error) {
        results.push({
          recipient,
          status: 'failed',
          error: error.message,
          provider
        });
      }
    }

    return results;
  }

  /**
   * Send custom email
   */
  async sendCustomEmail(emailData, provider = 'gmail') {
    const transporter = this.transporters[provider];
    if (!transporter) {
      throw new Error(`Email provider ${provider} not configured`);
    }

    const {
      recipients,
      subject,
      content,
      template = 'custom',
      attachments = []
    } = emailData;

    const html = this.processTemplate(template, {
      subject,
      content
    });

    const results = [];

    for (const recipient of recipients) {
      try {
        const mailOptions = {
          from: this.getFromAddress(provider),
          to: recipient,
          subject: subject,
          html: html
        };

        if (attachments.length > 0) {
          mailOptions.attachments = attachments;
        }

        const result = await transporter.sendMail(mailOptions);
        results.push({
          recipient,
          status: 'sent',
          messageId: result.messageId,
          provider
        });
      } catch (error) {
        results.push({
          recipient,
          status: 'failed',
          error: error.message,
          provider
        });
      }
    }

    return results;
  }

  /**
   * Send bulk email campaign
   */
  async sendBulkEmail(campaignData) {
    const {
      recipients,
      subject,
      content,
      template = 'custom',
      provider = 'gmail',
      batchSize = 50,
      delay = 1000
    } = campaignData;

    const results = [];
    const batches = this.chunkArray(recipients, batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Sending batch ${i + 1} of ${batches.length}...`);

      const batchResults = await this.sendCustomEmail({
        recipients: batch,
        subject,
        content,
        template
      }, provider);

      results.push(...batchResults);

      // Add delay between batches to avoid rate limiting
      if (i < batches.length - 1) {
        await this.sleep(delay);
      }
    }

    return {
      totalSent: results.filter(r => r.status === 'sent').length,
      totalFailed: results.filter(r => r.status === 'failed').length,
      results
    };
  }

  /**
   * Format alarm email
   */
  formatAlarmEmail(alarm) {
    const timestamp = new Date().toLocaleString();
    const severityColor = this.getSeverityColor(alarm.severity);
    
    const subject = `🚨 ${alarm.severity.toUpperCase()} ALARM: ${alarm.name} - ${alarm.unit_no}`;
    
    const content = `
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
      <div style="display: flex; flex-wrap: wrap; gap: 10px; margin: 15px 0;">
        <span style="background-color: #007bff; color: white; padding: 5px 10px; border-radius: 15px; font-size: 12px;">PV1: ${alarm.pv_values.pv1}</span>
        <span style="background-color: #007bff; color: white; padding: 5px 10px; border-radius: 15px; font-size: 12px;">PV2: ${alarm.pv_values.pv2}</span>
        <span style="background-color: #007bff; color: white; padding: 5px 10px; border-radius: 15px; font-size: 12px;">PV3: ${alarm.pv_values.pv3}</span>
        <span style="background-color: #007bff; color: white; padding: 5px 10px; border-radius: 15px; font-size: 12px;">PV4: ${alarm.pv_values.pv4}</span>
        <span style="background-color: #007bff; color: white; padding: 5px 10px; border-radius: 15px; font-size: 12px;">PV5: ${alarm.pv_values.pv5}</span>
        <span style="background-color: #007bff; color: white; padding: 5px 10px; border-radius: 15px; font-size: 12px;">PV6: ${alarm.pv_values.pv6}</span>
      </div>
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL}${alarm.link}" class="btn">View Device Details</a>
      </div>
    `;

    const html = this.processTemplate('alarm', {
      alarmName: alarm.name,
      severityColor,
      content
    });

    return { subject, html };
  }

  /**
   * Process template with variables
   */
  processTemplate(templateName, variables) {
    let template = this.templates[templateName];
    
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      template = template.replace(regex, value);
    }
    
    return template;
  }

  /**
   * Get from address based on provider
   */
  getFromAddress(provider) {
    const addresses = {
      gmail: process.env.GMAIL_USER || 'noreply@zeptac.com',
      outlook: process.env.OUTLOOK_USER || 'noreply@zeptac.com',
      smtp: process.env.SMTP_FROM || 'noreply@zeptac.com'
    };
    return addresses[provider] || 'noreply@zeptac.com';
  }

  /**
   * Get severity color
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
   * Chunk array into smaller arrays
   */
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test email configuration
   */
  async testEmailConfig(provider = 'gmail') {
    const transporter = this.transporters[provider];
    if (!transporter) {
      throw new Error(`Email provider ${provider} not configured`);
    }

    try {
      await transporter.verify();
      return { success: true, message: `${provider} configuration is valid` };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Get email provider status
   */
  getProviderStatus() {
    const status = {};
    
    for (const [provider, transporter] of Object.entries(this.transporters)) {
      status[provider] = {
        configured: transporter !== null,
        ready: false
      };
    }
    
    return status;
  }
}

module.exports = EmailService;
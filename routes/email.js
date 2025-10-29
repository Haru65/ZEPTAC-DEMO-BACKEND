const express = require('express');
const router = express.Router();
const emailController = require('../controller/emailController');
const { authenticateToken } = require('../middleware/auth');

// Apply authentication middleware to all email routes
router.use(authenticateToken);

// Send alarm email notification
router.post('/alarm', emailController.sendAlarmEmail);

// Send custom email
router.post('/custom', emailController.sendCustomEmail);

// Send bulk email campaign
router.post('/bulk', emailController.sendBulkEmail);

// Send test email
router.post('/test', emailController.sendTestEmail);

// Get email templates
router.get('/templates', emailController.getEmailTemplates);

// Test email configuration
router.post('/test-config', emailController.testEmailConfig);

// Get email provider status
router.get('/provider-status', emailController.getProviderStatus);

// Get email statistics
router.get('/stats', emailController.getEmailStats);

module.exports = router;
const express = require('express');
const router = express.Router();
const deviceAcknowledgmentController = require('../controller/deviceAcknowledgmentController');
const { authenticateToken, requirePermission } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get command status by commandId
router.get('/command/:commandId', deviceAcknowledgmentController.getCommandStatus);

// Get all acknowledgments for a device
router.get('/device/:deviceId', deviceAcknowledgmentController.getDeviceAcknowledgments);

// Get acknowledgment statistics for a device
router.get('/device/:deviceId/stats', deviceAcknowledgmentController.getDeviceAckStats);

// Get pending acknowledgments for a device
router.get('/device/:deviceId/pending', deviceAcknowledgmentController.getPendingAcknowledgments);

// Retry a failed or timed out command
router.post('/command/:commandId/retry', deviceAcknowledgmentController.retryCommand);

// Get system-wide acknowledgment overview
router.get('/system/overview', deviceAcknowledgmentController.getSystemAckOverview);

module.exports = router;
const express = require('express');
const router = express.Router();
const deviceSyncController = require('../controller/deviceSyncController');
const { authenticateToken } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get device configuration
router.get('/config/:deviceId', deviceSyncController.getDeviceConfiguration);

// Get all device configurations  
router.get('/config', deviceSyncController.getAllDeviceConfigurations);

// Force sync specific device configuration
router.post('/sync/:deviceId', deviceSyncController.syncDeviceConfiguration);

// Request specific configuration type from device
router.post('/config/:deviceId/request', deviceSyncController.requestSpecificConfig);

// Get device sync status and statistics
router.get('/sync/status', deviceSyncController.getDeviceSyncStatus);

// Reset device configuration cache
router.delete('/config/:deviceId/cache', deviceSyncController.resetDeviceConfigCache);

// Reset all device configuration caches
router.delete('/config/cache', deviceSyncController.resetDeviceConfigCache);

// Bulk sync multiple devices
router.post('/sync/bulk', deviceSyncController.bulkSyncDevices);

module.exports = router;
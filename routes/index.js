const express = require('express');
const authRoutes = require('./auth');
const deviceRoutes = require('./device');
const exportRoutes = require('./export');
const alarmRoutes = require('./alarm');
const telemetryRoutes = require('./telemetry');
const emailRoutes = require('./email');
const deviceSyncRoutes = require('./deviceSync');
const deviceAcknowledgmentRoutes = require('./deviceAcknowledgment');
const deviceManagementRoutes = require('./deviceManagement');

const router = express.Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/api', deviceRoutes);
router.use('/api/telemetry', telemetryRoutes);
router.use('/api/email', emailRoutes);
router.use('/api/device-sync', deviceSyncRoutes);
router.use('/api/device-acknowledgment', deviceAcknowledgmentRoutes);
router.use('/api/device-management', deviceManagementRoutes);
router.use('/export', exportRoutes);
router.use('/api/alarms', alarmRoutes);

module.exports = router;
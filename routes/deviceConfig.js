const express = require('express');
const router = express.Router();
const deviceConfigController = require('../controller/deviceConfigController');

// Device configuration routes
router.post('/devices/:deviceId/configure/interrupt-mode', deviceConfigController.configureInterruptMode);
router.post('/devices/:deviceId/configure/manual-mode', deviceConfigController.configureManualMode);
router.post('/devices/:deviceId/configure/normal-mode', deviceConfigController.configureNormalMode);
router.post('/devices/:deviceId/configure/dpol-mode', deviceConfigController.configureDpolMode);
router.post('/devices/:deviceId/configure/inst-mode', deviceConfigController.configureInstMode);
router.post('/devices/:deviceId/configure/timer', deviceConfigController.configureTimer);
router.post('/devices/:deviceId/configure/electrode', deviceConfigController.configureElectrode);
router.post('/devices/:deviceId/configure/alarm', deviceConfigController.configureAlarm);

// Device status route
router.get('/devices/:deviceId/status', deviceConfigController.getDeviceStatus);

// Device settings routes - NEW
router.get('/devices/:deviceId/settings', deviceConfigController.getDeviceSettings);
router.post('/devices/:deviceId/settings', deviceConfigController.updateDeviceSettings);
router.post('/devices/:deviceId/settings/single', deviceConfigController.updateSingleSetting);

module.exports = router;
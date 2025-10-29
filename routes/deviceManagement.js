const express = require('express');
const router = express.Router();
const deviceManagementController = require('../controller/deviceManagementController');

/**
 * Device Management Routes
 * Core functionality for device registration, settings storage, and management
 */

// Device Registration
router.post('/register', deviceManagementController.registerDevice);

// Device Settings Management
router.get('/:deviceId/settings', deviceManagementController.getDeviceSettings);
router.put('/:deviceId/settings', deviceManagementController.updateDeviceSettings);
router.post('/:deviceId/settings/store', deviceManagementController.storeDeviceSettings);

// Device Management
router.get('/devices', deviceManagementController.getAllDevices);
router.delete('/:deviceId', deviceManagementController.deleteDevice);

// Device Synchronization
router.get('/:deviceId/sync-status', deviceManagementController.getDeviceSyncStatus);
router.post('/:deviceId/command/:commandId/success', deviceManagementController.markCommandSuccess);

// Configuration History
router.get('/:deviceId/history', deviceManagementController.getDeviceHistory);

// Bulk Operations
router.post('/bulk-update', deviceManagementController.bulkUpdateSettings);

// Development/Testing Utilities
router.post('/initialize-samples', deviceManagementController.initializeSampleDevices);

/**
 * API Documentation for Device Management Routes
 * 
 * POST /api/device-management/register
 * - Register a new device in the system
 * - Body: { deviceId, name, type?, brokerUrl?, topics?, location?, initialSettings? }
 * 
 * GET /api/device-management/:deviceId/settings
 * - Get complete current settings for a device
 * - Returns: Standardized settings payload
 * 
 * PUT /api/device-management/:deviceId/settings
 * - Update device settings and optionally send to device via MQTT
 * - Body: { parameters: {...}, sendToDevice?: true }
 * - Returns: Complete updated settings
 * 
 * POST /api/device-management/:deviceId/settings/store
 * - Store settings in database without sending to device
 * - Body: { settings: {...}, source?: "string" }
 * 
 * GET /api/device-management/devices
 * - Get all devices with their current settings
 * - Returns: Array of devices with settings
 * 
 * DELETE /api/device-management/:deviceId
 * - Delete a device and all its settings
 * 
 * GET /api/device-management/:deviceId/sync-status
 * - Get device synchronization status and connection info
 * 
 * POST /api/device-management/:deviceId/command/:commandId/success
 * - Mark a command as successfully executed (device acknowledgment)
 * 
 * GET /api/device-management/:deviceId/history
 * - Get device configuration change history
 * - Query: ?limit=20 (default)
 * 
 * POST /api/device-management/bulk-update
 * - Update settings for multiple devices at once
 * - Body: { devices: [...], parameters: {...}, sendToDevice?: true }
 * 
 * POST /api/device-management/initialize-samples
 * - Initialize sample devices for testing (development only)
 */

module.exports = router;
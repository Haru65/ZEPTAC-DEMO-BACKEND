const express = require('express');
const ExportController = require('../controller/exportController');
const { authenticateToken, requirePermission } = require('../middleware/auth');

const router = express.Router();

// Export telemetry data to Excel
router.get('/telemetry/excel', 
  authenticateToken, 
  requirePermission('read_devices'), 
  ExportController.exportTelemetryExcel
);

// Get export statistics
router.get('/telemetry/stats', 
  authenticateToken, 
  requirePermission('read_devices'), 
  ExportController.getExportStats
);

// Preview export data
router.get('/telemetry/preview', 
  authenticateToken, 
  requirePermission('read_devices'), 
  ExportController.previewExportData
);

module.exports = router;
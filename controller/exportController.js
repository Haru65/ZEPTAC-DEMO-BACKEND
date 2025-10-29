const ExcelExportService = require('../services/excelExportService');
const Telemetry = require('../models/telemetry');

class ExportController {
  // Export telemetry data to Excel and download
  static async exportTelemetryExcel(req, res) {
    try {
      const {
        deviceId,
        startDate,
        endDate,
        format = 'download' // 'download' or 'save'
      } = req.query;

      console.log('📊 Export request:', { deviceId, startDate, endDate, format });

      // Validate date range
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use YYYY-MM-DD format.'
        });
      }

      if (start > end) {
        return res.status(400).json({
          success: false,
          error: 'Start date cannot be after end date.'
        });
      }

      // Generate Excel file
      const exportResult = await ExcelExportService.exportTelemetryToExcel({
        deviceId,
        startDate: start,
        endDate: end
      });

      if (format === 'save') {
        // Save to server file system
        const filePath = await ExcelExportService.saveExcelFile(
          exportResult.workbook,
          exportResult.filename
        );

        res.json({
          success: true,
          data: {
            message: 'Excel file generated successfully',
            filename: exportResult.filename,
            filePath: filePath,
            recordCount: exportResult.recordCount,
            devices: exportResult.devices
          }
        });
      } else {
        // Send as download
        const buffer = await ExcelExportService.getExcelBuffer(exportResult.workbook);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
        res.setHeader('Content-Length', buffer.length);

        res.send(buffer);
      }

    } catch (error) {
      console.error('❌ Export error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to export data'
      });
    }
  }

  // Get export statistics
  static async getExportStats(req, res) {
    try {
      const { deviceId, startDate, endDate } = req.query;

      // Build query
      const query = {};
      if (deviceId) query.deviceId = deviceId;
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      // Get statistics
      const [totalRecords, uniqueDevices, dateRange] = await Promise.all([
        Telemetry.countDocuments(query),
        Telemetry.distinct('deviceId', query),
        Telemetry.aggregate([
          { $match: query },
          {
            $group: {
              _id: null,
              minDate: { $min: '$timestamp' },
              maxDate: { $max: '$timestamp' }
            }
          }
        ])
      ]);

      // Get records per device
      const recordsPerDevice = await Telemetry.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$deviceId',
            count: { $sum: 1 },
            lastRecord: { $max: '$timestamp' },
            firstRecord: { $min: '$timestamp' }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          totalRecords,
          uniqueDevices: uniqueDevices.length,
          devicesList: uniqueDevices,
          dateRange: dateRange[0] || { minDate: null, maxDate: null },
          recordsPerDevice: recordsPerDevice.reduce((acc, item) => {
            acc[item._id] = {
              count: item.count,
              firstRecord: item.firstRecord,
              lastRecord: item.lastRecord
            };
            return acc;
          }, {}),
          query: query
        }
      });

    } catch (error) {
      console.error('❌ Export stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get export statistics'
      });
    }
  }

  // Preview export data (first 10 records)
  static async previewExportData(req, res) {
    try {
      const { deviceId, startDate, endDate } = req.query;

      // Build query
      const query = {};
      if (deviceId) query.deviceId = deviceId;
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      // Get preview data
      const previewData = await Telemetry.find(query)
        .sort({ timestamp: -1 })
        .limit(10)
        .lean();

      // Transform data for preview
      const transformedData = previewData.map(record => {
        const result = {
          deviceId: record.deviceId,
          timestamp: record.timestamp,
          event: record.event
        };

        // Extract data fields
        if (record.data) {
          const dataObj = record.data instanceof Map ? 
            Object.fromEntries(record.data) : record.data;
          
          Object.entries(dataObj).forEach(([key, value]) => {
            result[key] = value;
          });
        }

        return result;
      });

      res.json({
        success: true,
        data: {
          preview: transformedData,
          totalCount: previewData.length,
          query: query
        }
      });

    } catch (error) {
      console.error('❌ Preview error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to preview export data'
      });
    }
  }
}

module.exports = ExportController;
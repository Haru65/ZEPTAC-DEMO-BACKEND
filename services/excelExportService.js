const ExcelJS = require('exceljs');
const Telemetry = require('../models/telemetry');
const Device = require('../models/Device');

class ExcelExportService {
  /**
   * Export telemetry data to Excel
   * @param {Object} options - Export options
   * @param {String} options.deviceId - Device ID to export (optional, exports all if not provided)
   * @param {Date} options.startDate - Start date for data range
   * @param {Date} options.endDate - End date for data range
   * @param {String} options.filename - Custom filename (optional)
   */
  static async exportTelemetryToExcel(options = {}) {
    try {
      const {
        deviceId,
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default: last 30 days
        endDate = new Date(),
        filename = `telemetry_export_${new Date().toISOString().split('T')[0]}.xlsx`
      } = options;

      // Build query
      const query = {
        timestamp: {
          $gte: startDate,
          $lte: endDate
        }
      };

      if (deviceId) {
        query.deviceId = deviceId;
      }

      console.log('📊 Exporting telemetry data with query:', query);

      // Fetch telemetry data
      const telemetryData = await Telemetry.find(query)
        .sort({ timestamp: -1 })
        .lean();

      console.log(`📈 Found ${telemetryData.length} telemetry records`);

      if (telemetryData.length === 0) {
        throw new Error('No telemetry data found for the specified criteria');
      }

      // Create workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'ZEPTAC IoT Platform';
      workbook.lastModifiedBy = 'System';
      workbook.created = new Date();
      workbook.modified = new Date();

      // Create main telemetry worksheet
      const worksheet = workbook.addWorksheet('Telemetry Data', {
        pageSetup: { paperSize: 9, orientation: 'landscape' }
      });

      // Get all unique data keys for dynamic columns
      const allDataKeys = new Set();
      telemetryData.forEach(record => {
        if (record.data && typeof record.data === 'object') {
          if (record.data instanceof Map) {
            // Handle Map data type
            record.data.forEach((value, key) => {
              allDataKeys.add(key);
            });
          } else {
            // Handle regular object
            Object.keys(record.data).forEach(key => {
              allDataKeys.add(key);
            });
          }
        }
      });

      // Define columns
      const baseColumns = [
        { header: 'Device ID', key: 'deviceId', width: 15 },
        { header: 'Timestamp', key: 'timestamp', width: 20 },
        { header: 'Event', key: 'event', width: 15 },
      ];

      // Add dynamic data columns
      const dataColumns = Array.from(allDataKeys).map(key => ({
        header: key.toUpperCase().replace(/_/g, ' '),
        key: `data_${key}`,
        width: 15
      }));

      worksheet.columns = [...baseColumns, ...dataColumns];

      // Style the header row
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '366092' }
      };

      // Add data rows
      telemetryData.forEach((record, index) => {
        const row = {
          deviceId: record.deviceId,
          timestamp: record.timestamp,
          event: record.event || 'NORMAL'
        };

        // Extract data fields
        if (record.data) {
          const dataObj = record.data instanceof Map ? 
            Object.fromEntries(record.data) : record.data;
          
          Object.keys(dataObj).forEach(key => {
            row[`data_${key}`] = dataObj[key];
          });
        }

        worksheet.addRow(row);

        // Add conditional formatting for alternate rows
        if (index % 2 === 1) {
          const rowNum = index + 2; // +2 because Excel is 1-indexed and we have header
          worksheet.getRow(rowNum).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'F8F9FA' }
          };
        }
      });

      // Auto-fit columns
      worksheet.columns.forEach(column => {
        if (column.header === 'Timestamp') {
          column.numFmt = 'yyyy-mm-dd hh:mm:ss';
        }
      });

      // Add summary worksheet
      const summarySheet = workbook.addWorksheet('Summary');
      
      // Summary data
      const deviceCounts = {};
      telemetryData.forEach(record => {
        deviceCounts[record.deviceId] = (deviceCounts[record.deviceId] || 0) + 1;
      });

      summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 25 },
        { header: 'Value', key: 'value', width: 20 }
      ];

      summarySheet.getRow(1).font = { bold: true };

      summarySheet.addRows([
        { metric: 'Export Date', value: new Date().toISOString() },
        { metric: 'Date Range', value: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}` },
        { metric: 'Total Records', value: telemetryData.length },
        { metric: 'Unique Devices', value: Object.keys(deviceCounts).length },
        { metric: 'Data Fields', value: allDataKeys.size }
      ]);

      // Add device breakdown
      summarySheet.addRow({ metric: '', value: '' }); // Empty row
      summarySheet.addRow({ metric: 'Records per Device:', value: '' });
      
      Object.entries(deviceCounts).forEach(([deviceId, count]) => {
        summarySheet.addRow({ metric: `  ${deviceId}`, value: count });
      });

      return {
        workbook,
        filename,
        recordCount: telemetryData.length,
        devices: Object.keys(deviceCounts).length
      };

    } catch (error) {
      console.error('❌ Excel export error:', error);
      throw error;
    }
  }

  /**
   * Save Excel workbook to file
   */
  static async saveExcelFile(workbook, filename, outputPath = './exports') {
    try {
      const fs = require('fs');
      const path = require('path');

      // Ensure exports directory exists
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }

      const fullPath = path.join(outputPath, filename);
      await workbook.xlsx.writeFile(fullPath);
      
      console.log(`✅ Excel file saved: ${fullPath}`);
      return fullPath;
    } catch (error) {
      console.error('❌ Error saving Excel file:', error);
      throw error;
    }
  }

  /**
   * Generate Excel buffer for download
   */
  static async getExcelBuffer(workbook) {
    try {
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer;
    } catch (error) {
      console.error('❌ Error generating Excel buffer:', error);
      throw error;
    }
  }
}

module.exports = ExcelExportService;
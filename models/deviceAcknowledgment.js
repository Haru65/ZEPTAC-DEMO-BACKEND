const mongoose = require('mongoose');

const deviceAcknowledgmentSchema = new mongoose.Schema({
  commandId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  originalCommand: {
    type: String,
    required: true
  },
  commandPayload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT'],
    default: 'PENDING',
    index: true
  },
  sentAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  acknowledgedAt: {
    type: Date,
    index: true
  },
  deviceResponse: {
    message: String,
    errorCode: String,
    additionalData: mongoose.Schema.Types.Mixed
  },
  timeout: {
    type: Number,
    default: 30000 // 30 seconds default timeout
  },
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 3
  }
}, {
  timestamps: true
});

// Index for efficient querying
deviceAcknowledgmentSchema.index({ deviceId: 1, sentAt: -1 });
deviceAcknowledgmentSchema.index({ status: 1, sentAt: -1 });

// Method to check if acknowledgment has timed out
deviceAcknowledgmentSchema.methods.isTimedOut = function() {
  if (this.status !== 'PENDING') return false;
  return Date.now() - this.sentAt.getTime() > this.timeout;
};

// Method to mark as timeout
deviceAcknowledgmentSchema.methods.markAsTimeout = function() {
  this.status = 'TIMEOUT';
  this.acknowledgedAt = new Date();
  return this.save();
};

// Static method to get pending acknowledgments for a device
deviceAcknowledgmentSchema.statics.getPendingForDevice = function(deviceId) {
  return this.find({
    deviceId: deviceId,
    status: 'PENDING'
  }).sort({ sentAt: -1 });
};

// Static method to get acknowledgment statistics
deviceAcknowledgmentSchema.statics.getStats = function(deviceId, fromDate) {
  const match = { deviceId };
  if (fromDate) {
    match.sentAt = { $gte: fromDate };
  }

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgResponseTime: {
          $avg: {
            $cond: [
              { $in: ['$status', ['SUCCESS', 'FAILED']] },
              { $subtract: ['$acknowledgedAt', '$sentAt'] },
              null
            ]
          }
        }
      }
    }
  ]);
};

const DeviceAcknowledgment = mongoose.model('DeviceAcknowledgment', deviceAcknowledgmentSchema);

module.exports = DeviceAcknowledgment;
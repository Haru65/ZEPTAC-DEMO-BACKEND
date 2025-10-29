const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['sensor', 'actuator', 'gateway'], required: true },
  mqtt: {
    brokerUrl: { type: String, required: true },
    topics: [{ type: String, required: true }],
    username: { type: String },
    password: { type: String },
    options: {
      qos: { type: Number, default: 0 },
      keepalive: { type: Number, default: 60 },
      clientId: { type: String },
      clean: { type: Boolean, default: true }
    }
  },
  location: {
    latitude: { type: Number },
    longitude: { type: Number }
  },
  status: { type: String, enum: ['active', 'inactive', 'error'], default: 'inactive' },
  lastSeen: { type: Date },
  metrics: { type: mongoose.Schema.Types.Mixed },
  
  // **NEW: Device Configuration Storage**
  configuration: {
    currentMode: { type: String, enum: ['Normal', 'Manual', 'Interrupt', 'DPOL', 'INST', 'Unknown'], default: 'Unknown' },
    
    // Complete device settings storage
    deviceSettings: {
      electrode: { type: Number, default: 0 },
      shuntVoltage: { type: Number, default: 25 },
      shuntCurrent: { type: Number, default: 999 },
      referenceFail: { type: Number, default: 30 },
      referenceUP: { type: Number, default: 300 },
      referenceOV: { type: Number, default: 60 },
      interruptOnTime: { type: Number, default: 100 },
      interruptOffTime: { type: Number, default: 100 },
      interruptStartTimeStamp: { type: String, default: () => new Date().toISOString().replace('T', ' ').substring(0, 19) },
      interruptStopTimeStamp: { type: String, default: () => new Date().toISOString().replace('T', ' ').substring(0, 19) },
      dpolInterval: { type: String, default: "00:00:00" },
      depolarizationStartTimeStamp: { type: String, default: () => new Date().toISOString().replace('T', ' ').substring(0, 19) },
      depolarizationStopTimeStamp: { type: String, default: () => new Date().toISOString().replace('T', ' ').substring(0, 19) },
      instantMode: { type: Number, default: 0 },
      instantStartTimeStamp: { type: String, default: "19:04:00" },
      instantEndTimeStamp: { type: String, default: "00:00:00" },
      manualModeAction: { type: String, enum: ['start', 'stop'], default: "stop" }
    },
    
    timerSettings: {
      TON: { type: Number },
      TOFF: { type: Number }
    },
    electrodeConfig: {
      type: { type: String },
      settings: { type: mongoose.Schema.Types.Mixed }
    },
    alarmConfig: {
      enabled: { type: Boolean, default: false },
      thresholds: { type: mongoose.Schema.Types.Mixed },
      contacts: [{ type: String }]
    },
    modeConfig: { type: mongoose.Schema.Types.Mixed }, // Stores mode-specific settings
    deviceStatus: { type: String },
    lastCommand: {
      type: { type: String },
      data: { type: mongoose.Schema.Types.Mixed },
      timestamp: { type: Date }
    },
    source: { type: String, enum: ['device_response', 'command_sent', 'manual_entry', 'api_request', 'test_system'], default: 'device_response' },
    lastConfigUpdate: { type: Date },
    configRequestHistory: [{
      requestId: { type: String },
      timestamp: { type: Date },
      success: { type: Boolean },
      configType: { type: String }
    }],
    configHistory: [{
      timestamp: { type: Date },
      settings: { type: mongoose.Schema.Types.Mixed },
      source: { type: String },
      changedFields: [{ type: String }]
    }]
  },
  
  // **NEW: Device Synchronization Status**
  syncStatus: {
    lastSyncAttempt: { type: Date },
    lastSuccessfulSync: { type: Date },
    syncErrors: [{
      timestamp: { type: Date },
      error: { type: String },
      requestId: { type: String }
    }],
    pendingRequests: [{ type: String }], // Array of request IDs
    isOnline: { type: Boolean, default: false },
    responseTime: { type: Number } // Average response time in ms
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for better performance
deviceSchema.index({ deviceId: 1 });
deviceSchema.index({ 'configuration.currentMode': 1 });
deviceSchema.index({ 'syncStatus.isOnline': 1 });
deviceSchema.index({ 'configuration.lastConfigUpdate': 1 });

// Pre-save middleware to update timestamps
deviceSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance methods
deviceSchema.methods.updateConfiguration = function(configData) {
  this.configuration = {
    ...this.configuration,
    ...configData,
    lastConfigUpdate: new Date()
  };
  return this.save();
};

deviceSchema.methods.addConfigRequest = function(requestId, configType) {
  this.configuration.configRequestHistory.push({
    requestId,
    configType,
    timestamp: new Date(),
    success: false
  });
  
  this.syncStatus.pendingRequests.push(requestId);
  this.syncStatus.lastSyncAttempt = new Date();
  
  return this.save();
};

deviceSchema.methods.markConfigRequestSuccess = function(requestId) {
  const request = this.configuration.configRequestHistory.find(r => r.requestId === requestId);
  if (request) {
    request.success = true;
  }
  
  this.syncStatus.pendingRequests = this.syncStatus.pendingRequests.filter(id => id !== requestId);
  this.syncStatus.lastSuccessfulSync = new Date();
  
  return this.save();
};

deviceSchema.methods.addSyncError = function(error, requestId) {
  this.syncStatus.syncErrors.push({
    timestamp: new Date(),
    error: error.toString(),
    requestId
  });
  
  // Keep only last 10 errors
  if (this.syncStatus.syncErrors.length > 10) {
    this.syncStatus.syncErrors = this.syncStatus.syncErrors.slice(-10);
  }
  
  return this.save();
};

// Static methods
deviceSchema.statics.findByDeviceId = function(deviceId) {
  return this.findOne({ deviceId });
};

deviceSchema.statics.getOnlineDevices = function() {
  return this.find({ 'syncStatus.isOnline': true });
};

deviceSchema.statics.getDevicesNeedingSync = function(olderThanMinutes = 30) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  return this.find({
    $or: [
      { 'configuration.lastConfigUpdate': { $lt: cutoff } },
      { 'configuration.lastConfigUpdate': { $exists: false } }
    ]
  });
};

module.exports = mongoose.model('Device', deviceSchema);
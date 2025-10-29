const mongoose = require("mongoose")


const telemetrySchema = new mongoose.Schema({
  // 🔹 Fixed fields (always present)
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  event: {
    type: String,
    default: "NORMAL"
  },

  // 🔹 Flexible fields (payload can vary per device/model)
  data: {
    type: Map,
    of: mongoose.Schema.Types.Mixed // can hold Number, String, Boolean, etc.
  }
});

module.exports = mongoose.model("telemetry_data" , telemetrySchema);
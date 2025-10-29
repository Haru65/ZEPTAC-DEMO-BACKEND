// Basic data transform helper
function transformDeviceData(payload, topic) {
  return {
    id: payload.SPN?.toString() ?? payload.SN?.toString() ?? "123",
    name: payload.API ?? 'Device-123',
    icon: 'bi-device',
    type: 'IoT Sensor',
    location: payload.LATITUDE && payload.LONGITUDE && (payload.LATITUDE !== 0 || payload.LONGITUDE !== 0)
      ? `${payload.LATITUDE}, ${payload.LONGITUDE}` : "Mumbai, India",
    status: payload.EVENT ?? "NORMAL",
    lastSeen: payload.TimeStamp ?? new Date().toISOString(),
    timestamp: Date.now(),
    source: "device-123",
    metrics: Object.keys(payload)
      .filter(k => !['API', 'EVENT', 'TimeStamp', 'LATITUDE', 'LONGITUDE', 'SN', 'SPN', 'LOG'].includes(k))
      .map(k => ({
        type: k,
        value: parseFloat(payload[k]) || payload[k],
        icon: k === 'DCV' || k === 'ACV' ? 'bi-battery' : k === 'DCI' || k === 'ACI' ? 'bi-lightning-charge' : 'bi-graph-up'
      }))
  };
}

// Throttle function for updates
const UPDATE_THROTTLE = 1000; // ms
let lastUpdateTime = 0;

function createThrottledEmit(io) {
  return function throttledEmit(data) {
    const now = Date.now();
    if (now - lastUpdateTime >= UPDATE_THROTTLE) {
      io.emit('deviceUpdate', { type: 'device', data });
      lastUpdateTime = now;
    }
  };
}

module.exports = {
  transformDeviceData,
  createThrottledEmit
};
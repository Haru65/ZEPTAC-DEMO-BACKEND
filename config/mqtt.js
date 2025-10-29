const mqtt = require('mqtt');

// MQTT Broker configuration for device 123
const deviceBroker = {
  url: 'mqtt://broker.zeptac.com:1883',
  dataTopic: 'devices/123/data',
  commandTopic: 'devices/123/commands',
  options: {
    clientId: '123',
    username: 'zeptac_iot',
    password: 'ZepIOT@123',
    keepalive: 60,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
    clean: true,
    rejectUnauthorized: false,
    protocolVersion: 4,
    queueQoSZero: false,
    will: {
      topic: 'devices/123/status',
      payload: JSON.stringify({
        status: 'offline',
        timestamp: new Date().toISOString(),
        clientId: '123'
      }),
      qos: 1,
      retain: true
    },
    properties: {
      sessionExpiryInterval: 300,
      receiveMaximum: 100,
      maximumPacketSize: 100000
    }
  }
};

// Alternative stable brokers for testing
const alternativeBrokers = {
  mosquitto: 'mqtt://test.mosquitto.org:1883',
  eclipse: 'mqtt://mqtt.eclipseprojects.io:1883',
  hivemq: 'mqtt://broker.hivemq.com:1883',
  local: 'mqtt://localhost:1883'
};

module.exports = {
  deviceBroker,
  alternativeBrokers
};
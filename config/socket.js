const socketIo = require('socket.io');

const initializeSocket = (server) => {
  const io = socketIo(server, {
    cors: {
      origin: [
        "https://zeptac-iot-platform-vp3h-kljhebkdt-haru65s-projects.vercel.app", 
        "http://localhost:5173"
      ],
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  return io;
};

module.exports = { initializeSocket };
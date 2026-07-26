const { io } = require('socket.io-client');
const s = io('http://localhost:3000', { transports: ['websocket'] });
s.on('connect', () => console.log('connected'));
s.on('disconnect', (r) => console.log('disconnected:', r));
setTimeout(() => { console.log('still connected:', s.connected); s.disconnect(); process.exit(0); }, 3000);

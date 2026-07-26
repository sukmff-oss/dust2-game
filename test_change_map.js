// 測 in-game change_map
const { io } = require('socket.io-client');
const s1 = io('http://localhost:3000', { transports: ['websocket'] });
const s2 = io('http://localhost:3000', { transports: ['websocket'] });
let roomCode = null;

s1.on('connect', () => {
  // 用 Ice Cave (idx=1) 開房
  s1.emit('create_room', { name: 'Alice', mode: 'pk', mapIndex: 1 }, (r) => {
    roomCode = r.code;
    console.log('created:', r.code);
    setTimeout(() => s2.emit('join_room', { code: r.code, name: 'Bob' }, () => console.log('joined')), 200);
  });
});

s1.on('match_start', (d) => {
  console.log(`match_start: ${d.map?.name} (idx=${d.mapIndex})`);
  // 3 秒後手動切到 Warehouse
  setTimeout(() => {
    console.log('--- 觸發手動切換到 Warehouse (idx=2) ---');
    s1.emit('change_map', { mapIndex: 2 }, (res) => {
      console.log('change_map callback:', JSON.stringify(res));
    });
  }, 3000);
});

s1.on('map_changed', (d) => {
  console.log(`>>> MAP_CHANGED: ${d.map?.name} idx=${d.mapIndex} manual=${d.manual}`);
  if (d.manual && d.mapIndex === 2) {
    console.log('\n✅ 手動切地圖成功!');
    setTimeout(() => { s1.disconnect(); s2.disconnect(); process.exit(0); }, 1000);
  }
});

setTimeout(() => { s1.disconnect(); s2.disconnect(); process.exit(0); }, 20000);

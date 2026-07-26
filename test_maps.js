// 直接連 server 並透過 socket 模擬完整循環 (5 張地圖)
// 用官方 socket.io 協議 join room,並監聽所有地圖事件
const { io } = require('socket.io-client');
const s1 = io('http://localhost:3000', { transports: ['websocket'] });
const s2 = io('http://localhost:3000', { transports: ['websocket'] });
let roomCode = null;
let mapCount = 0;
const mapNames = [];

s1.on('connect', () => {
  console.log('s1 connected');
  s1.emit('create_room', { name: 'Alice', mode: 'pk' }, (r) => {
    console.log('create:', r.code);
    roomCode = r.code;
    setTimeout(() => {
      s2.emit('join_room', { code: roomCode, name: 'Bob' }, () => {
        console.log('Bob joined\n');
      });
    }, 300);
  });
});

s1.on('match_start', (d) => {
  console.log(`✓ match_start: ${d.map?.name} (${d.map?.subtitle})`);
  mapNames.push(d.map?.name);
  mapCount++;
  // Alice 開始往前衝 + 射擊
  setTimeout(() => {
    const t = setInterval(() => {
      s1.emit('input', { keys: { w: true }, yaw: Math.PI, fire: true, weapon: 'pistol' });
    }, 180);
    setTimeout(() => clearInterval(t), 8000);
  }, 600);
});

s1.on('map_changed', (d) => {
  console.log(`↻ map_changed: ${d.map?.name} (${d.map?.subtitle})`);
  mapNames.push(d.map?.name);
  mapCount++;
  if (mapCount >= 6) {  // 1 起始 + 5 切換
    console.log(`\n=== 全部 ${mapCount} 張地圖都跑過 ===`);
    console.log('順序: ' + mapNames.join(' → '));
    setTimeout(() => { s1.disconnect(); s2.disconnect(); process.exit(0); }, 500);
  } else {
    // 繼續打下一張
    setTimeout(() => {
      const t = setInterval(() => {
        s1.emit('input', { keys: { w: true }, yaw: Math.PI, fire: true, weapon: 'pistol' });
      }, 180);
      setTimeout(() => clearInterval(t), 8000);
    }, 2000);
  }
});

setTimeout(() => {
  console.log(`\ntimeout (已測 ${mapCount} 張): ${mapNames.join(', ')}`);
  s1.disconnect(); s2.disconnect();
  process.exit(0);
}, 60000);

// 直接打 server API 加分,驗證 cycleMap 邏輯確實執行
// 加一個 debug endpoint:/api/debug/kill?room=XXX&team=T 強制 T 加 1 殺
const http = require('http');
const { io } = require('socket.io-client');

const s1 = io('http://localhost:3000', { transports: ['websocket'] });
const s2 = io('http://localhost:3000', { transports: ['websocket'] });
let roomCode = null;

function debugKill(roomCode, team) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000/api/debug/kill?room=${roomCode}&team=${team}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

s1.on('connect', () => {
  s1.emit('create_room', { name: 'Alice', mode: 'pk' }, (r) => {
    roomCode = r.code;
    console.log('create:', r.code);
    setTimeout(() => s2.emit('join_room', { code: roomCode, name: 'Bob' }, () => console.log('joined')), 200);
  });
});

s1.on('match_start', async (d) => {
  console.log(`match_start: ${d.map.name}`);
  // 等 1 秒後開始加分
  setTimeout(async () => {
    // 殺 50 次(5 張地圖 × 10 殺)
    for (let i = 1; i <= 50; i++) {
      try {
        const r = await debugKill(roomCode, 'T');
        if (i % 10 === 0) console.log(`[kill #${i}] scores=${JSON.stringify(r.scores)} mapIdx=${r.mapIndex}`);
      } catch (e) {
        console.log(`[debug kill error] ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 100));
    }
  }, 1000);
});

s1.on('map_winner', (d) => console.log(`>>> MAP WINNER: ${d.winner}`));
s1.on('map_changed', (d) => {
  console.log(`>>> MAP CHANGED → ${d.map?.name} (idx=${d.mapIndex})`);
  if (d.mapIndex >= 3) {
    console.log('✅ cycleMap 至少執行了 3 次!');
    setTimeout(() => { s1.disconnect(); s2.disconnect(); process.exit(0); }, 500);
  }
});

setTimeout(() => { console.log('timeout'); s1.disconnect(); s2.disconnect(); process.exit(0); }, 30000);

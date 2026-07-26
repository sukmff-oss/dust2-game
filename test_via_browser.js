// 開 2 個 socket 模擬 2 玩家加入 PK 房間 + 觸發 debug kill
const { io } = require('socket.io-client');
const http = require('http');

const s1 = io('http://localhost:3000', { transports: ['websocket'] });
const s2 = io('http://localhost:3000', { transports: ['websocket'] });

function debugKill(roomCode, team) {
  return new Promise((resolve) => {
    http.get(`http://localhost:3000/api/debug/kill?room=${roomCode}&team=${team}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
  });
}

s1.on('connect', () => {
  s1.emit('create_room', { name: 'Alice', mode: 'pk' }, (r) => {
    console.log('[created]', r.code);
    setTimeout(() => s2.emit('join_room', { code: r.code, name: 'Bob' }, () => console.log('[joined]')), 200);
  });
});

s1.on('match_start', async (d) => {
  console.log(`[match_start] map=${d.map?.name} mode=${d.mode}`);
  setTimeout(async () => {
    console.log('--- 開始觸發 10 殺 ---');
    for (let i = 1; i <= 11; i++) {
      const r = await debugKill(s1.io.opts.hostname === 'localhost' ? 'DIRECT' : d.code, 'T');
      console.log(`[debug kill #${i}] scores=${JSON.stringify(r.scores)}`);
      await new Promise(r => setTimeout(r, 100));
    }
  }, 1000);
});

s1.on('map_winner', (d) => console.log(`[map_winner] ${d.winner}`));
s1.on('map_changed', (d) => console.log(`[map_changed] → ${d.map?.name} idx=${d.mapIndex}`));

setTimeout(() => { s1.disconnect(); s2.disconnect(); process.exit(0); }, 20000);

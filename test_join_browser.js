// 加入 browser 創的 PK 房間,讓 match 開始,然後觸發 kill
const { io } = require('socket.io-client');
const http = require('http');

const ROOM = process.argv[2] || 'K4SFBS';
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
  console.log('joining', ROOM);
  s1.emit('join_room', { code: ROOM, name: 'Bob1' }, (r) => console.log('join result:', JSON.stringify(r)));
});
s2.on('connect', () => {
  s2.emit('join_room', { code: ROOM, name: 'Bob2' }, (r) => console.log('join2:', JSON.stringify(r)));
});

s1.on('match_start', async (d) => {
  console.log(`\n[MATCH START] map=${d.map?.name} idx=${d.mapIndex}`);
  setTimeout(async () => {
    console.log('--- 觸發 11 殺 ---');
    for (let i = 1; i <= 11; i++) {
      const r = await debugKill(ROOM, 'T');
      console.log(`[debug kill #${i}] scores=${JSON.stringify(r.scores)} mode=${r.mode} mapIdx=${r.mapIndex}`);
      await new Promise(r => setTimeout(r, 150));
    }
    console.log('--- 等 3 秒看 client 是否收到 map_changed ---');
    setTimeout(() => { s1.disconnect(); s2.disconnect(); process.exit(0); }, 3000);
  }, 500);
});

s1.on('map_winner', (d) => console.log(`[MAP WINNER] ${d.winner}`));
s1.on('map_changed', (d) => console.log(`[MAP CHANGED] → ${d.map?.name} idx=${d.mapIndex}`));

setTimeout(() => { s1.disconnect(); s2.disconnect(); process.exit(0); }, 15000);

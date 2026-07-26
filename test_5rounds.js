// 5 場內不會切地圖,跑 11 殺驗證
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

let roomCode = null;
s1.on('connect', () => {
  s1.emit('create_room', { name: 'Alice', mode: 'pk' }, (resp) => {
    roomCode = resp.code;
    console.log('created:', roomCode);
    setTimeout(() => s2.emit('join_room', { code: roomCode, name: 'Bob' }, () => console.log('joined')), 200);
  });
});

s1.on('match_start', async (d) => {
  console.log(`\nmatch_start: ${d.map?.name} idx=${d.mapIndex}`);
  setTimeout(async () => {
    console.log('\n=== 跑 60 殺 (6 場 × 10 殺),觀察 round_reset vs map_changed ===');
    for (let i = 1; i <= 80; i++) {
      const res = await debugKill(roomCode, 'T');
      if (i % 10 === 0) console.log(`[kill #${i}] scores=${JSON.stringify(res.scores)} roundInMap=${res.roundInMap}/${res.roundsPerMap} mapIdx=${res.mapIndex}`);
      await new Promise(r => setTimeout(r, 200));
    }
  }, 500);
});

s1.on('round_reset', (d) => console.log(`>>> ROUND RESET: round ${d.roundInMap + 1}/${d.roundsPerMap} on same map`));
s1.on('map_winner', (d) => console.log(`>>> MAP_WINNER: ${d.winner}`));
s1.on('map_changed', (d) => console.log(`>>> MAP_CHANGED → ${d.map?.name} idx=${d.mapIndex}`));

setTimeout(() => { s1.disconnect(); s2.disconnect(); process.exit(0); }, 30000);

// 合併:create + join + 等 match + 80 殺,看 map_changed
const { io } = require('socket.io-client');
const http = require('http');

const s1 = io('http://localhost:3000', { transports: ['websocket'] });
const s2 = io('http://localhost:3000', { transports: ['websocket'] });

let matchStarted = false;

function debugKill(roomCode, team) {
  return new Promise((resolve) => {
    http.get(`http://localhost:3000/api/debug/kill?room=${roomCode}&team=${team}`, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(JSON.parse(body)));
    });
  });
}

let roomCode = null;

// s1 監聽
s1.on('connect', () => {
  console.log('A connected');
  s1.emit('create_room', { name: 'Alice', mode: 'pk', mapIndex: 2 }, (r) => {
    roomCode = r.code;
    console.log('Alice created:', roomCode);
  });
});
s1.on('match_start', (d) => {
  matchStarted = true;
  console.log(`\n[match_start] map=${d.map?.name} idx=${d.mapIndex} roundInMap=${d.roundInMap} roundsPerMap=${d.roundsPerMap}`);
});
s1.on('map_winner', (d) => console.log(`[map_winner] winner=${d.winner}`));
s1.on('round_reset', (d) => console.log(`[round_reset] roundInMap=${d.roundInMap}/${d.roundsPerMap}`));
s1.on('map_changed', (d) => console.log(`\n>>> [MAP_CHANGED] → ${d.map?.name} (idx=${d.mapIndex}) roundInMap=${d.roundInMap}`));

// s2 監聽
s2.on('connect', () => {
  console.log('B connected, joining in 200ms');
  setTimeout(() => {
    if (roomCode) s2.emit('join_room', { code: roomCode, name: 'Bob' }, () => console.log('Bob joined'));
  }, 200);
});
s2.on('match_start', () => { matchStarted = true; });

async function main() {
  console.log('等待 match_start...');
  for (let i = 0; i < 80; i++) {
    if (matchStarted) break;
    await new Promise(r => setTimeout(r, 200));
  }
  if (!matchStarted) {
    console.log('timeout waiting for match');
    process.exit(1);
  }

  console.log('\n開始 80 殺...');
  for (let i = 1; i <= 80; i++) {
    const res = await debugKill(roomCode, 'T').catch(() => ({}));
    if (i % 10 === 0) console.log(`  kill #${i}: T=${res?.scores?.T} roundInMap=${res?.roundInMap}/${res?.roundsPerMap} mapIdx=${res?.mapIndex}`);
    await new Promise(r => setTimeout(r, 250));
  }
  setTimeout(() => process.exit(0), 3000);
}

main();
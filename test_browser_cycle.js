// 監聽 map_changed 跟 round_reset 事件 + 抓 HUD 狀態
const { io } = require('socket.io-client');
const http = require('http');

const roomCode = process.argv[2];
const s1 = io('http://localhost:3000', { transports: ['websocket'] });

s1.on('connect', () => {
  console.log('connected, joining', roomCode);
  s1.emit('join_room', { code: roomCode, name: 'Bob' }, () => {
    console.log('joined');
  });
});

let matchStarted = false;

s1.on('match_start', (d) => {
  matchStarted = true;
  console.log(`[match_start] map=${d.map?.name} idx=${d.mapIndex} roundInMap=${d.roundInMap}`);
});

s1.on('map_winner', (d) => {
  console.log(`[map_winner] winner=${d.winner} scores=${JSON.stringify(d.scores)}`);
});

s1.on('round_reset', (d) => {
  console.log(`[round_reset] roundInMap=${d.roundInMap} roundsPerMap=${d.roundsPerMap}`);
});

s1.on('map_changed', (d) => {
  console.log(`[MAP_CHANGED] → ${d.map?.name} (idx=${d.mapIndex}) roundInMap=${d.roundInMap}`);
});

async function kill() {
  return new Promise((resolve) => {
    http.get(`http://localhost:3000/api/debug/kill?room=${roomCode}&team=T`, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(JSON.parse(body)));
    });
  });
}

async function main() {
  // 等 match_start
  await new Promise(r => {
    if (s1.connected && matchStarted) r();
    else s1.once('match_start', () => r());
  });
  console.log('match 已開始,開始 80 殺...');
  for (let i = 1; i <= 80; i++) {
    const res = await kill();
    if (i % 10 === 0) console.log(`  [kill #${i}] scores=${JSON.stringify(res.scores)}`);
    await new Promise(r => setTimeout(r, 250));
  }
  setTimeout(() => process.exit(0), 3000);
}

s1.on('state', (d) => {
  if (d.mapIndex !== undefined && Math.random() < 0.01) {
    console.log(`[state] mapIndex=${d.mapIndex} roundInMap=${d.roundInMap} roundsPerMap=${d.roundsPerMap}`);
  }
});

main();
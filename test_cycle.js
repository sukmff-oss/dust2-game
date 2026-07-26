// 模擬玩家打到 10 殺,觸發地圖循環
const { io } = require('socket.io-client');
const s1 = io('http://localhost:3000', { transports: ['websocket'] });
const s2 = io('http://localhost:3000', { transports: ['websocket'] });
let roomCode = null;
let inputsSent = 0;

s1.on('connect', () => {
  console.log('s1 connected:', s1.id);
  s1.emit('create_room', { name: 'Alice', mode: 'pk' }, (r) => {
    console.log('create:', JSON.stringify(r));
    roomCode = r.code;
    setTimeout(() => {
      s2.emit('join_room', { code: roomCode, name: 'Bob' }, (r2) => {
        console.log('join:', JSON.stringify(r2));
      });
    }, 200);
  });
});

s1.on('disconnect', (r) => console.log('s1 disconnect:', r));
s2.on('disconnect', (r) => console.log('s2 disconnect:', r));
s1.on('state', (d) => {
  if (inputsSent > 0 && inputsSent < 6) console.log(`[state s1] T=${d.players[0].x.toFixed(1)},${d.players[0].z.toFixed(1)} CT=${d.players[1].x.toFixed(1)},${d.players[1].z.toFixed(1)} T_hp=${d.players[0].health} CT_hp=${d.players[1].health} scores=${JSON.stringify(d.scores)}`);
});
s1.on('player_hit', (d) => console.log('[player_hit]', JSON.stringify(d)));
s2.on('player_hit', (d) => console.log('[s2 player_hit]', JSON.stringify(d)));
s2.on('player_killed', (d) => console.log('[player_killed]', JSON.stringify(d)));

s1.on('match_start', (d) => {
  console.log(`[match_start] mode=${d.mode} map=${d.map.name} weapons=${Object.keys(d.weapons)}`);
  setTimeout(() => {
    console.log('--- Alice 開始移動+射擊 ---');
    let shotCount = 0;
    const fireInterval = setInterval(() => {
      shotCount++;
      inputsSent++;
      s1.emit('input', {
        keys: { w: true, s: false, a: false, d: false },
        yaw: Math.PI, pitch: 0,
        fire: true,
        weapon: 'pistol',
      });
      if (shotCount >= 150) clearInterval(fireInterval);
    }, 200);
  }, 500);
});

let mapCount = 0;
s1.on('map_changed', (d) => {
  mapCount++;
  console.log(`[map_changed] → ${d.map.name} (${mapCount} 次) scores=${JSON.stringify(d.scores)} sessionScores=${JSON.stringify(d.sessionScores)}`);
  if (mapCount >= 2) {
    setTimeout(() => { s1.disconnect(); s2.disconnect(); process.exit(0); }, 1000);
  }
});
s2.on('map_changed', (d) => console.log(`[s2 map_changed] → ${d.map.name}`));

s1.on('map_winner', (d) => console.log(`[map_winner] ${d.winner} 贏得本張! scores=${JSON.stringify(d.scores)}`));
s2.on('map_winner', (d) => console.log(`[s2 map_winner] ${d.winner} 贏得本張`));

setTimeout(() => {
  console.log(`--- timeout, exiting (inputs sent: ${inputsSent}) ---`);
  s1.disconnect(); s2.disconnect();
  process.exit(0);
}, 35000);


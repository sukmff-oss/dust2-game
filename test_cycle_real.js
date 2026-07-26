// Alice 走到側面避開中線 cover,持續射 Bob 到 10 殺
const { io } = require('socket.io-client');

const s1 = io('http://localhost:3000', { transports: ['websocket'] });
const s2 = io('http://localhost:3000', { transports: ['websocket'] });

s1.on('connect', () => {
  s1.emit('create_room', { name: 'Alice', mode: 'pk' }, (r) => {
    console.log('create:', r.code);
    setTimeout(() => s2.emit('join_room', { code: r.code, name: 'Bob' }, () => console.log('joined')), 200);
  });
});

s1.on('match_start', (d) => {
  console.log(`match_start: ${d.map.name}`);
  let phase = 'move';  // move → shoot
  let moveTicks = 0;
  const t = setInterval(() => {
    moveTicks++;
    if (phase === 'move') {
      // Alice 走右邊 +Z (避開中線)
      s1.emit('input', {
        keys: { d: true, w: true },
        yaw: Math.PI * 0.75,  // 朝東北方
        fire: false,
        weapon: 'pistol',
      });
      if (moveTicks > 40) {
        phase = 'shoot';
        console.log('switch to shoot phase');
      }
    } else {
      // Alice 在右側,射向 Bob (Bob 在北邊 = +Z)
      s1.emit('input', {
        keys: { w: false, d: false, a: false, s: false },
        yaw: Math.PI * 0.5,  // 朝北偏西,瞄 Bob
        fire: moveTicks % 2 === 0,
        reload: moveTicks % 14 === 0,
        weapon: 'pistol',
      });
    }
    if (moveTicks > 3000) clearInterval(t);
  }, 30);
});

s1.on('player_killed', (d) => console.log(`[kill] ${d.attackerName} → ${d.victimName}`));
s1.on('map_winner', (d) => console.log(`>>> MAP WINNER: ${d.winner} scores=${JSON.stringify(d.scores)}`));
s1.on('map_changed', (d) => {
  console.log(`>>> MAP CHANGED → ${d.map?.name} (idx=${d.mapIndex}/${d.mapTotal})`);
  if (d.mapIndex >= 5) {
    console.log('✅ 5 張地圖都跑過了!');
    setTimeout(() => { s1.disconnect(); s2.disconnect(); process.exit(0); }, 500);
  }
});

setTimeout(() => {
  console.log('timeout');
  s1.disconnect(); s2.disconnect();
  process.exit(0);
}, 90000);

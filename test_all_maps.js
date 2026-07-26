// 動態測試:每張地圖都開房間跑 match_start,確認伺服器端正確載入
const { io } = require('socket.io-client');
const http = require('http');

const s1 = io('http://localhost:3000', { transports: ['websocket'] });
const s2 = io('http://localhost:3000', { transports: ['websocket'] });
let roomCode = null;
const results = [];

function debugKill(roomCode, team) {
  return new Promise((resolve) => {
    http.get(`http://localhost:3000/api/debug/kill?room=${roomCode}&team=${team}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
  });
}

async function testMap(mapIdx) {
  return new Promise((resolve) => {
    const s1t = io('http://localhost:3000', { transports: ['websocket'] });
    const s2t = io('http://localhost:3000', { transports: ['websocket'] });
    let matchStarted = false;
    s1t.on('connect', () => {
      s1t.emit('create_room', { name: 'Alice', mode: 'pk', mapIndex: mapIdx }, (r) => {
        const code = r.code;
        console.log(`\n[Map ${mapIdx}] 開房: ${code}`);
        s2t.emit('join_room', { code, name: 'Bob' }, () => console.log(`  Bob joined`));
      });
    });
    s1t.on('match_start', async (d) => {
      matchStarted = true;
      const ok = d.map && d.mapIndex === mapIdx;
      console.log(`  ${ok ? '✅' : '❌'} match_start: map="${d.map?.name}" (idx=${d.mapIndex})`);
      console.log(`  ${d.map?.colliders?.length >= 4 ? '✅' : '❌'} colliders: ${d.map?.colliders?.length}`);
      console.log(`  ${d.map?.decor?.length >= 1 ? '✅' : '❌'} decor: ${d.map?.decor?.length}`);
      console.log(`  ${d.map?.spawnPoints?.length === 2 ? '✅' : '❌'} spawn points: ${d.map?.spawnPoints?.length}`);
      // 等 1 秒然後驗證手動切換也能用
      setTimeout(() => {
        s1t.emit('change_map', { mapIndex: 1 }, (res) => {
          console.log(`  ${res?.ok ? '✅' : '❌'} 手動切換到 idx=1: ${res?.mapName || res?.error}`);
          results.push({ idx: mapIdx, name: d.map?.name, manualSwitch: res?.ok });
          s1t.disconnect();
          s2t.disconnect();
          setTimeout(resolve, 500);
        });
      }, 1000);
    });
    setTimeout(() => {
      if (!matchStarted) {
        console.log(`  ❌ 沒收到 match_start`);
        results.push({ idx: mapIdx, error: 'no match_start' });
        s1t.disconnect();
        s2t.disconnect();
        resolve();
      }
    }, 12000);
  });
}

async function main() {
  for (let i = 0; i < 5; i++) {
    await testMap(i);
  }
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  動態測試總結');
  console.log('═══════════════════════════════════════════════════════');
  results.forEach(r => {
    if (r.error) console.log(`  [${r.idx}] ❌ ${r.error}`);
    else console.log(`  [${r.idx}] ${r.name} - ${r.manualSwitch ? '✅' : '❌'}`);
  });
  const allOk = results.every(r => !r.error && r.manualSwitch);
  console.log(`\n  ${allOk ? '✅ 5 張地圖全部可正常開啟' : '❌ 有地圖異常'}\n`);
  process.exit(allOk ? 0 : 1);
}

s1.disconnect();
s2.disconnect();
main();

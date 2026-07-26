// 驗證 match_start 帶 mapIndex/mapTotal/roundInMap/roundsPerMap
const { io } = require('socket.io-client');
const s1 = io('http://localhost:3000', { transports: ['websocket'] });
const s2 = io('http://localhost:3000', { transports: ['websocket'] });

s1.on('connect', () => {
  // 測試地圖 3 (Aztec Ruins)
  s1.emit('create_room', { name: 'Alice', mode: 'pk', mapIndex: 3 }, (r) => {
    console.log('created:', r.code);
    setTimeout(() => s2.emit('join_room', { code: r.code, name: 'Bob' }, () => console.log('joined')), 200);
  });
});

s1.on('match_start', (d) => {
  console.log('\n=== match_start payload ===');
  console.log('mapIndex:    ', d.mapIndex);
  console.log('mapTotal:    ', d.mapTotal);
  console.log('roundInMap:  ', d.roundInMap);
  console.log('roundsPerMap:', d.roundsPerMap);
  console.log('map.name:    ', d.map?.name);
  console.log('map.id:      ', d.map?.id);

  // 驗證
  const checks = [
    ['mapIndex 是數字', typeof d.mapIndex === 'number'],
    ['mapIndex = 3', d.mapIndex === 3],
    ['mapTotal = 5', d.mapTotal === 5],
    ['roundInMap = 0', d.roundInMap === 0],
    ['roundsPerMap = 5', d.roundsPerMap === 5],
    ['map.id = aztec_ruins', d.map?.id === 'aztec_ruins'],
  ];
  console.log('\n=== 驗證 ===');
  let allOk = true;
  checks.forEach(([label, ok]) => {
    console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    if (!ok) allOk = false;
  });
  console.log(`\n${allOk ? '✅ 全部欄位正確' : '❌ 有欄位缺失'}`);
  setTimeout(() => { s1.disconnect(); s2.disconnect(); process.exit(allOk ? 0 : 1); }, 500);
});

setTimeout(() => { console.log('timeout'); s1.disconnect(); s2.disconnect(); process.exit(1); }, 15000);

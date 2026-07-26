// 完整地圖健康檢查
const { PK_MAPS } = require('./maps.js');

console.log('═══════════════════════════════════════════════════════');
console.log('  PK 地圖健康檢查');
console.log('═══════════════════════════════════════════════════════\n');

let issues = 0;
const seen = new Set();

PK_MAPS.forEach((m, i) => {
  console.log(`\n[${i}] ${m.name} (${m.subtitle}) — ${m.id}`);
  console.log(`  模式: ${m.mode} | 天空: ${m.sky} | 地板: ${m.floorColor}`);
  console.log(`  Colliders: ${m.colliders.length} | Decor: ${m.decor.length}`);

  // 1) 重複 ID 檢查
  if (seen.has(m.id)) {
    console.log(`  ❌ 重複 id: ${m.id}`);
    issues++;
  }
  seen.add(m.id);

  // 2) 必填欄位檢查
  const required = ['id', 'name', 'subtitle', 'sky', 'fog', 'fogNear', 'fogFar', 'ambient',
    'floorColor', 'wallColor', 'coverColor', 'colliders', 'decor', 'spawnPoints', 'botSpawns', 'patrolPoints'];
  for (const k of required) {
    if (m[k] === undefined) {
      console.log(`  ❌ 缺欄位: ${k}`);
      issues++;
    }
  }

  // 3) Spawn points 檢查 (T/CT 都要有)
  const tSpawn = m.spawnPoints.filter(s => s.team === 'T');
  const ctSpawn = m.spawnPoints.filter(s => s.team === 'CT');
  if (m.mode === 'pk' && (tSpawn.length === 0 || ctSpawn.length === 0)) {
    console.log(`  ❌ PK 模式 spawn 缺: T=${tSpawn.length} CT=${ctSpawn.length}`);
    issues++;
  } else {
    console.log(`  ✓ spawn: T=${tSpawn.length} CT=${ctSpawn.length} (${tSpawn[0]?.x?.toFixed(1)},${tSpawn[0]?.z?.toFixed(1)} ← → ${ctSpawn[0]?.x?.toFixed(1)},${ctSpawn[0]?.z?.toFixed(1)})`);
  }

  // 4) Colliders 必須包含 4 面圍牆 (PK 邊界)
  if (m.mode === 'pk') {
    // 找 4 面牆 x 在 ±14 跟 z 在 ±14
    const walls = m.colliders.filter(c => {
      const onEdge = Math.abs(Math.abs(c.x) - 14) < 0.1 || Math.abs(Math.abs(c.z) - 14) < 0.1;
      return onEdge && c.h >= 3;
    });
    if (walls.length < 4) {
      console.log(`  ❌ PK 圍牆只有 ${walls.length} 面 (應有 4 面)`);
      issues++;
    } else {
      console.log(`  ✓ 圍牆 ${walls.length} 面 (PK 邊界)`);
    }
  }

  // 5) Decor / colliders 沒有 NaN / 異常值
  let badCoords = 0;
  for (const c of [...m.colliders, ...m.decor]) {
    if (isNaN(c.x) || isNaN(c.y) || isNaN(c.z) ||
        isNaN(c.w) || isNaN(c.h) || isNaN(c.d)) {
      badCoords++;
    }
    if (c.w <= 0 || c.h <= 0 || c.d <= 0) badCoords++;
  }
  if (badCoords > 0) {
    console.log(`  ❌ 異常 collider/decor: ${badCoords}`);
    issues++;
  } else {
    console.log(`  ✓ 所有 collider/decor 座標正常`);
  }

  // 6) Color 格式檢查
  const colorFields = ['sky', 'fog', 'ambient', 'floorColor', 'wallColor', 'coverColor'];
  for (const k of colorFields) {
    if (typeof m[k] === 'string' && !m[k].match(/^#[0-9a-fA-F]{6}$/)) {
      console.log(`  ❌ ${k} 不是 6 位 hex: ${m[k]}`);
      issues++;
    }
  }

  // 7) Spawn 在地圖範圍內 (PK 28x28 = ±14)
  if (m.mode === 'pk') {
    for (const s of m.spawnPoints) {
      if (Math.abs(s.x) > 14 || Math.abs(s.z) > 14) {
        console.log(`  ❌ spawn (${s.x},${s.z}) 超出 PK 邊界 ±14`);
        issues++;
      }
    }
  }
});

console.log('\n═══════════════════════════════════════════════════════');
console.log(`  總結: ${PK_MAPS.length} 張地圖, ${issues} 個問題`);
console.log('═══════════════════════════════════════════════════════\n');

if (issues === 0) {
  console.log('✅ 全部地圖通過檢查,可以正常開啟\n');
  process.exit(0);
} else {
  console.log('❌ 發現問題,請修正後重跑\n');
  process.exit(1);
}

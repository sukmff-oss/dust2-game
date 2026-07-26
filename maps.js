// =====================================================
// CS2 經典 PK 對決地圖 — 3 張循環
// =====================================================
// 每張地圖都是 30x30 對稱競技場,中央有 3 個掩體
// 1v1 模式,只用手槍,先達 10 殺就切下一張

const PK_ARENA_SIZE = 14;   // 半邊長 14m → 全場 28m 見方
const WALL_H = 4;           // 邊牆高度 4m

// 公用 helper: 圍牆 (四面牆圍住場地)
function arenaWalls() {
  const s = PK_ARENA_SIZE, h = WALL_H;
  return [
    // 北牆 (z = +s)
    { x: 0, y: h/2, z:  s, w: s*2, h, d: 0.5, type: 'wall' },
    // 南牆 (z = -s)
    { x: 0, y: h/2, z: -s, w: s*2, h, d: 0.5, type: 'wall' },
    // 東牆 (x = +s)
    { x:  s, y: h/2, z: 0, w: 0.5, h, d: s*2, type: 'wall' },
    // 西牆 (x = -s)
    { x: -s, y: h/2, z: 0, w: 0.5, h, d: s*2, type: 'wall' },
  ];
}

// 公用 spawn 點 (T 在南,CT 在北)
function pkSpawnPoints() {
  return [
    { team: 'T',  x: 0, y: 1.7, z: -11, yaw: 0 },
    { team: 'CT', x: 0, y: 1.7, z:  11, yaw: Math.PI },
  ];
}

// 公用 patrol 點 (PK 模式沒 bot,僅留空 array 給 bot AI 用)
function emptyPatrols() { return []; }
function emptyBotSpawns() { return []; }

// 把 collider array 拆成「阻擋 raycast/movement」與「僅裝飾」
function splitColliders(arr) {
  return {
    colliders: arr.filter(c => c.type !== 'decor'),  // 牆、掩體 — 真實碰撞
    decor: arr.filter(c => c.type === 'decor'),     // 純裝飾,無碰撞
  };
}

// === MAP 1: Dusty Duel (沙漠黃昏) ===
function dustyDuel() {
  const { colliders, decor } = splitColliders([
    // 邊牆
    ...arenaWalls(),
    // 中央 3 個木箱掩體 (有碰撞)
    { x: -3.5, y: 1.0, z: 0, w: 2.2, h: 2.0, d: 2.2, type: 'cover' },
    { x:  3.5, y: 1.0, z: 0, w: 2.2, h: 2.0, d: 2.2, type: 'cover' },
    { x:  0,   y: 1.0, z: 1.5, w: 4.5, h: 2.0, d: 1.5, type: 'cover' },
    // 純裝飾:小石頭、桶子、燈柱底座
    { x: -10, y: 0.3, z:  -8, w: 0.8, h: 0.6, d: 0.8, type: 'decor', color: '#8a6d4a' },
    { x:  10, y: 0.3, z:  -8, w: 0.8, h: 0.6, d: 0.8, type: 'decor', color: '#8a6d4a' },
    { x: -10, y: 0.3, z:   8, w: 0.8, h: 0.6, d: 0.8, type: 'decor', color: '#8a6d4a' },
    { x:  10, y: 0.3, z:   8, w: 0.8, h: 0.6, d: 0.8, type: 'decor', color: '#8a6d4a' },
    // 燈柱(高瘦裝飾)
    { x: -11.5, y: 3.0, z: 0, w: 0.2, h: 6.0, d: 0.2, type: 'decor', color: '#1a1a1a' },
    { x:  11.5, y: 3.0, z: 0, w: 0.2, h: 6.0, d: 0.2, type: 'decor', color: '#1a1a1a' },
  ]);
  return {
    id: 'dusty_duel',
    name: 'Dusty Duel',
    subtitle: '沙漠黃昏',
    mode: 'pk',
    sky: '#e8a868',
    fog: '#d49a5a',
    fogNear: 20,
    fogFar: 50,
    ambient: '#b88858',
    floorColor: '#c89060',
    wallColor: '#a87850',
    coverColor: '#8b6240',
    colliders,
    decor,
    spawnPoints: pkSpawnPoints(),
    botSpawns: emptyBotSpawns(),
    patrolPoints: emptyPatrols(),
  };
}

// === MAP 2: Ice Cave (冰洞窟) ===
function iceCave() {
  const { colliders, decor } = splitColliders([
    ...arenaWalls(),
    // 中央 3 個冰塊掩體 (較高)
    { x: -3.5, y: 1.2, z:  0, w: 2.0, h: 2.4, d: 2.0, type: 'cover' },
    { x:  3.5, y: 1.2, z:  0, w: 2.0, h: 2.4, d: 2.0, type: 'cover' },
    { x:  0,   y: 1.2, z: -1, w: 4.0, h: 2.4, d: 1.5, type: 'cover' },
    // 冰晶裝飾
    { x: -8, y: 0.4, z: -7, w: 0.6, h: 0.8, d: 0.6, type: 'decor', color: '#cce8ff' },
    { x:  8, y: 0.4, z: -7, w: 0.6, h: 0.8, d: 0.6, type: 'decor', color: '#cce8ff' },
    { x: -8, y: 0.4, z:  7, w: 0.6, h: 0.8, d: 0.6, type: 'decor', color: '#cce8ff' },
    { x:  8, y: 0.4, z:  7, w: 0.6, h: 0.8, d: 0.6, type: 'decor', color: '#cce8ff' },
    { x:  0, y: 1.5, z: -8, w: 1.0, h: 3.0, d: 1.0, type: 'decor', color: '#a8d8ff' },
    { x:  0, y: 1.5, z:  8, w: 1.0, h: 3.0, d: 1.0, type: 'decor', color: '#a8d8ff' },
  ]);
  return {
    id: 'ice_cave',
    name: 'Ice Cave',
    subtitle: '冰封洞窟',
    mode: 'pk',
    sky: '#88c8f0',
    fog: '#6090c0',
    fogNear: 18,
    fogFar: 48,
    ambient: '#cce8ff',
    floorColor: '#b8d8e8',
    wallColor: '#a0c0d8',
    coverColor: '#d8eef8',
    colliders,
    decor,
    spawnPoints: pkSpawnPoints(),
    botSpawns: emptyBotSpawns(),
    patrolPoints: emptyPatrols(),
  };
}

// === MAP 3: Warehouse (倉庫) ===
function warehouse() {
  const { colliders, decor } = splitColliders([
    ...arenaWalls(),
    // 金屬貨櫃掩體
    { x: -4, y: 1.3, z: -1, w: 2.5, h: 2.6, d: 5.5, type: 'cover' },
    { x:  4, y: 1.3, z:  1, w: 2.5, h: 2.6, d: 5.5, type: 'cover' },
    { x:  0, y: 0.4, z:  0, w: 3.5, h: 0.8, d: 1.5, type: 'cover' },
    // 棧板裝飾
    { x: -10, y: 0.2, z: -8, w: 1.2, h: 0.4, d: 1.2, type: 'decor', color: '#6a4528' },
    { x:  10, y: 0.2, z: -8, w: 1.2, h: 0.4, d: 1.2, type: 'decor', color: '#6a4528' },
    { x: -10, y: 0.2, z:  8, w: 1.2, h: 0.4, d: 1.2, type: 'decor', color: '#6a4528' },
    { x:  10, y: 0.2, z:  8, w: 1.2, h: 0.4, d: 1.2, type: 'decor', color: '#6a4528' },
    // 金屬桶
    { x: -10, y: 0.7, z:  0, w: 0.6, h: 1.4, d: 0.6, type: 'decor', color: '#3a3530' },
    { x:  10, y: 0.7, z:  0, w: 0.6, h: 1.4, d: 0.6, type: 'decor', color: '#3a3530' },
  ]);
  return {
    id: 'warehouse',
    name: 'Warehouse',
    subtitle: '廢棄倉庫',
    mode: 'pk',
    sky: '#404858',
    fog: '#202830',
    fogNear: 15,
    fogFar: 45,
    ambient: '#888a90',
    floorColor: '#2a2a30',
    wallColor: '#1a1a20',
    coverColor: '#5a5048',
    colliders,
    decor,
    spawnPoints: pkSpawnPoints(),
    botSpawns: emptyBotSpawns(),
    patrolPoints: emptyPatrols(),
  };
}

// === MAP 4: Aztec Ruins (古瑪雅砂岩神殿) ===
function aztecRuins() {
  const { colliders, decor } = splitColliders([
    ...arenaWalls(),
    // 中央神殿遺跡 — 較高掩體(石階造型)
    { x: -4, y: 1.0, z: -2, w: 2.5, h: 2.0, d: 2.5, type: 'cover' },
    { x:  4, y: 1.0, z:  2, w: 2.5, h: 2.0, d: 2.5, type: 'cover' },
    { x:  0, y: 1.0, z:  0, w: 3.0, h: 2.0, d: 2.0, type: 'cover' },
    { x:  0, y: 3.5, z:  0, w: 1.5, h: 1.0, d: 1.5, type: 'cover' },  // 頂部石塊
    // 古文明裝飾
    { x: -10, y: 1.5, z:  0, w: 0.8, h: 3.0, d: 0.8, type: 'decor', color: '#a07840' },  // 圖騰柱
    { x:  10, y: 1.5, z:  0, w: 0.8, h: 3.0, d: 0.8, type: 'decor', color: '#a07840' },
    { x: -10, y: 0.3, z: -8, w: 1.0, h: 0.6, d: 1.0, type: 'decor', color: '#8a6438' },  // 石階
    { x:  10, y: 0.3, z: -8, w: 1.0, h: 0.6, d: 1.0, type: 'decor', color: '#8a6438' },
    { x: -10, y: 0.3, z:  8, w: 1.0, h: 0.6, d: 1.0, type: 'decor', color: '#8a6438' },
    { x:  10, y: 0.3, z:  8, w: 1.0, h: 0.6, d: 1.0, type: 'decor', color: '#8a6438' },
    { x: -7, y: 0.3, z:  -4, w: 0.6, h: 0.4, d: 0.6, type: 'decor', color: '#6a4828' },  // 碎石
    { x:  7, y: 0.3, z:   4, w: 0.6, h: 0.4, d: 0.6, type: 'decor', color: '#6a4828' },
  ]);
  return {
    id: 'aztec_ruins',
    name: 'Aztec Ruins',
    subtitle: '古神殿遺跡',
    mode: 'pk',
    sky: '#d8b078',        // 黃昏沙漠
    fog: '#b89060',
    fogNear: 18,
    fogFar: 48,
    ambient: '#c89868',
    floorColor: '#c89868',
    wallColor: '#a07840',
    coverColor: '#8a6438',
    colliders,
    decor,
    spawnPoints: pkSpawnPoints(),
    botSpawns: emptyBotSpawns(),
    patrolPoints: emptyPatrols(),
  };
}

// === MAP 5: Vertigo (摩天樓頂) ===
function vertigo() {
  const { colliders, decor } = splitColliders([
    ...arenaWalls(),
    // 中央金屬鷹架 — 高瘦掩體
    { x: -3, y: 1.2, z:  0, w: 1.2, h: 2.4, d: 4.0, type: 'cover' },
    { x:  3, y: 1.2, z:  0, w: 1.2, h: 2.4, d: 4.0, type: 'cover' },
    { x:  0, y: 1.2, z: -3, w: 4.0, h: 2.4, d: 1.2, type: 'cover' },
    { x:  0, y: 1.2, z:  3, w: 4.0, h: 2.4, d: 1.2, type: 'cover' },
    // 高空鷹架柱
    { x: -6, y: 3.0, z: -6, w: 0.4, h: 6.0, d: 0.4, type: 'decor', color: '#888888' },
    { x:  6, y: 3.0, z: -6, w: 0.4, h: 6.0, d: 0.4, type: 'decor', color: '#888888' },
    { x: -6, y: 3.0, z:  6, w: 0.4, h: 6.0, d: 0.4, type: 'decor', color: '#888888' },
    { x:  6, y: 3.0, z:  6, w: 0.4, h: 6.0, d: 0.4, type: 'decor', color: '#888888' },
    // 通風管
    { x: -10, y: 1.0, z:  0, w: 0.6, h: 2.0, d: 8.0, type: 'decor', color: '#6a7080' },
    { x:  10, y: 1.0, z:  0, w: 0.6, h: 2.0, d: 8.0, type: 'decor', color: '#6a7080' },
    // 警示桶
    { x: -3, y: 0.5, z:  -8, w: 0.6, h: 1.0, d: 0.6, type: 'decor', color: '#ff8833' },
    { x:  3, y: 0.5, z:  -8, w: 0.6, h: 1.0, d: 0.6, type: 'decor', color: '#ff8833' },
    { x: -3, y: 0.5, z:   8, w: 0.6, h: 1.0, d: 0.6, type: 'decor', color: '#ff8833' },
    { x:  3, y: 0.5, z:   8, w: 0.6, h: 1.0, d: 0.6, type: 'decor', color: '#ff8833' },
  ]);
  return {
    id: 'vertigo',
    name: 'Vertigo',
    subtitle: '摩天樓頂',
    mode: 'pk',
    sky: '#5870a0',        // 高空藍
    fog: '#3a4870',
    fogNear: 25,
    fogFar: 60,
    ambient: '#8090a8',
    floorColor: '#3a3a40',  // 深灰水泥
    wallColor: '#4a4a52',
    coverColor: '#5a6068',
    colliders,
    decor,
    spawnPoints: pkSpawnPoints(),
    botSpawns: emptyBotSpawns(),
    patrolPoints: emptyPatrols(),
  };
}

// 匯出所有 PK 地圖 (5 張循環)
const PK_MAPS = [dustyDuel(), iceCave(), warehouse(), aztecRuins(), vertigo()];

module.exports = { PK_MAPS };

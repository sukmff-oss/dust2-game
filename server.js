// =============================================================
// DUST II — Multiplayer Server (Node.js + Express + Socket.io)
// Authoritative state for: rooms, players, bots, hit detection
// =============================================================

const express = require('express');
const http = require('http');
const path = require('path');
const { PK_MAPS } = require('./maps.js');
const { Server } = require('socket.io');

// =====================================================
// 設定
// =====================================================
const PORT = process.env.PORT || 3000;
const TICK_HZ = 30;
const TICK_DT = 1 / TICK_HZ;
const MAX_KILLS = 10;
const BOT_SHOOT_RANGE = 35;
const BOT_VIEW_RANGE = 60;
const BOT_HP = 80;
const BOT_SHOOT_COOLDOWN = 0.9;
const BOT_SHOOT_DAMAGE = 12;
const MAX_ROOM_SIZE = 8;
const QUICK_PLAY_TIMEOUT_MS = 10000;
const RESPAWN_DELAY_MS = 3000;
const MATCH_RESET_MS = 6000;

// =====================================================
// 地圖 / 武器 (與 client 同步 — 修改需兩邊一致)
// =====================================================
const MAP = {
  spawnPoints: [
    { team: 'T', x: 0, y: 1.7, z: 8, yaw: 0 },
    { team: 'CT', x: -7, y: 1.7, z: -28, yaw: Math.PI },
  ],
  botSpawns: [
    { x: -7, z: -25 }, { x: 10, z: -28 }, { x: -3, z: -5 },
    { x: 13, z: -20 }, { x: -12, z: -32 },
  ],
  patrolPoints: [
    { x: -7, z: -20 }, { x: -7, z: -8 }, { x: 3, z: 0 },
    { x: 8, z: -10 }, { x: 15, z: -25 }, { x: -7, z: -35 },
    { x: -10, z: -10 },
  ],
  // 簡化碰撞箱 (位置/尺寸 — client 端也有相同定義)
  colliders: [
    { x: -10, y: 3, z: -10, w: 2, h: 6, d: 30 },
    { x: -7, y: 3, z: 1, w: 8, h: 6, d: 2 },
    { x: -7, y: 3, z: -22, w: 8, h: 6, d: 2 },
    { x: -13, y: 2.5, z: -16, w: 2, h: 5, d: 2 },
    { x: -4, y: 2.5, z: -16, w: 2, h: 5, d: 2 },
    { x: -7, y: 4.4, z: -16, w: 10, h: 1.2, d: 2 },
    { x: 10, y: 2.5, z: -8, w: 2, h: 5, d: 40 },
    { x: 17, y: 2.5, z: -27, w: 14, h: 5, d: 2 },
    { x: 0, y: 2.5, z: -38, w: 40, h: 5, d: 2 },
    { x: 14, y: 2, z: 5, w: 6, h: 4, d: 5 },
    { x: 22, y: 2.5, z: 8, w: 6, h: 5, d: 5 },
    { x: 30, y: 1.5, z: 12, w: 8, h: 3, d: 4 },
    { x: -3, y: 2.15, z: 1.5, w: 4, h: 4.3, d: 0.4 },
  ],
};

const WEAPONS = {
  knife: {
    name: 'Knife',           // 刀(CS 致敬)
    pellets: 1,
    spread: 0,
    damage: 55,              // 普攻 55;後刺 100 (一擊死)
    range: 2.0,              // 近戰,2m
    fireRate: 0.55,          // ~1.8 刀/秒
    magSize: 0,              // 不耗彈
    reserveStart: 0,         // 沒備彈
    reloadTime: 0,           // 不換彈
    headshotMult: 2.0,       // 頭部加成
    isMelee: true,           // 近戰標記
  },
  nova: {
    name: 'Nova',
    pellets: 8,
    spread: 0.07,
    damage: 11,
    range: 25,
    fireRate: 0.9,
    magSize: 8,
    reserveStart: 32,
    reloadTime: 4.0,
    headshotMult: 1.0,
  },
  ak47: {
    name: 'AK-47',
    pellets: 1,
    spread: 0.012,
    damage: 36,
    range: 80,
    fireRate: 0.1,
    magSize: 30,
    reserveStart: 90,
    reloadTime: 2.4,
    headshotMult: 1.3,
  },
  pistol: {
    name: 'USP-S',           // CS2 經典消音手槍
    pellets: 1,
    spread: 0.022,
    damage: 35,              // 身體 35,爆頭 35*2.5 = 87
    range: 50,
    fireRate: 0.17,          // ~6 發/秒
    magSize: 12,
    reserveStart: 36,
    reloadTime: 2.1,
    headshotMult: 2.5,       // 爆頭一擊斃命 (87 > 100 不可能,所以 87 扣到 ~0)
  },
};

// =====================================================
// Express + Socket.io
// =====================================================
const app = express();
app.use(express.static(path.join(__dirname)));
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    players: Array.from(rooms.values()).reduce((s, r) => s + r.players.size, 0),
    uptime: process.uptime(),
  });
});

// Debug: 強制幫某隊加分 (測試 cycleMap 用,無身份驗證)
app.get('/api/debug/kill', (req, res) => {
  const code = req.query.room;
  const team = req.query.team;
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: 'room not found' });
  if (!['T', 'CT'].includes(team)) return res.status(400).json({ error: 'team must be T or CT' });
  if (room.state !== 'playing') return res.status(400).json({ error: 'room not playing' });
  if (room._cycling) return res.json({ ok: true, scores: room.scores, note: 'cycle in progress, skip' });
  room.scores[team]++;
  // 走跟正常 applyDamage 一樣的檢查邏輯
  if (room.scores.T >= room.maxKills || room.scores.CT >= room.maxKills) {
    room._lastMapScores = { ...room.scores };
    if (room.mode === 'pk') {
      const mapWinner = room.scores.T >= room.maxKills ? 'T' : 'CT';
      io.to(room.code).emit('map_winner', { winner: mapWinner, scores: room.scores });
      room._cycling = true;  // 防 1.5s 內重複觸發
      setTimeout(() => { cycleMap(room); room._cycling = false; }, 1500);
    } else {
      endMatch(room);
    }
  }
  res.json({ ok: true, scores: room.scores, mode: room.mode, mapIndex: room.mapIndex, roundInMap: room.roundInMap, roundsPerMap: room.roundsPerMap });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 30000,
});

// =====================================================
// 房間管理
// =====================================================
const rooms = new Map();        // code → Room
const quickQueue = [];          // 等配對的 socket.id

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆的 0/O/1/I
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function makePlayer(socketId, name, team, map) {
  const m = map || MAP;
  let spawn = m.spawnPoints.find(s => s.team === team);
  if (!spawn) spawn = MAP.spawnPoints.find(s => s.team === team) || { x: 0, y: 1.7, z: 0, yaw: 0 };
  // PK 模式預設武器是 pistol;TDM 預設 nova
  const defaultWeapon = (m.mode === 'pk') ? 'pistol' : 'nova';
  return {
    id: socketId,
    name: (name || 'Player').slice(0, 20),
    team,
    x: spawn.x, y: spawn.y, z: spawn.z,
    yaw: spawn.yaw, pitch: 0,
    health: 100,
    alive: true,
    weapon: defaultWeapon,
    ammo: cloneAmmo(),
    kills: 0, deaths: 0,
    lastFire: 0, reloading: false, reloadTimer: 0,
    lastInputAt: Date.now(),
  };
}

function cloneAmmo() {
  return {
    knife: { mag: 1, reserve: 1 },          // 刀永遠有(不耗彈)
    nova: { mag: WEAPONS.nova.magSize, reserve: WEAPONS.nova.reserveStart },
    ak47: { mag: WEAPONS.ak47.magSize, reserve: WEAPONS.ak47.reserveStart },
    pistol: { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserveStart },
  };
}

function makeRoom(code, hostSocketId, hostName) {
  const room = {
    code,
    hostId: hostSocketId,
    mode: 'tdm',            // 'tdm' | 'pk' (1v1 pistol duel)
    mapIndex: 0,            // 0 = DUST2 for TDM; 0/1/2 for PK cycle
    roundInMap: 0,          // 當前地圖已進行幾場 (1..5)
    roundsPerMap: 5,        // 每張地圖打 5 場後強制切換下一張
    players: new Map(),
    bots: [],
    state: 'waiting',       // waiting | playing | ended
    scores: { T: 0, CT: 0 },
    sessionScores: { T: 0, CT: 0 },  // 跨地圖累計 (PK 模式用)
    maxKills: MAX_KILLS,
    startedAt: null,
    resetTimer: null,
  };
  room.players.set(hostSocketId, makePlayer(hostSocketId, hostName, 'T', MAP));
  rooms.set(code, room);
  return room;
}

// 取得當前地圖 — TDM 用 DUST2,PK 用循環中的地圖
function getCurrentMap(room) {
  if (room.mode === 'pk') return PK_MAPS[room.mapIndex % PK_MAPS.length];
  return MAP;  // TDM 一直用原本 DUST2
}

function joinRoom(room, socketId, name) {
  // 根據 mode 決定用哪張地圖的 spawn
  const currentMap = getCurrentMap(room);
  let tCount = 0, ctCount = 0;
  for (const p of room.players.values()) {
    if (p.team === 'T') tCount++;
    else if (p.team === 'CT') ctCount++;
    else ctCount++;
  }
  const team = tCount <= ctCount ? 'T' : 'CT';
  room.players.set(socketId, makePlayer(socketId, name, team, currentMap));
  return team;
}

function leaveRoom(room, socketId) {
  room.players.delete(socketId);
  // Cancel any pending reset
  if (room.players.size === 0) {
    if (room.resetTimer) clearTimeout(room.resetTimer);
    rooms.delete(room.code);
    return true;
  }
  return false;
}

function startMatch(room) {
  if (room.state === 'playing') return;
  room.state = 'playing';
  room.startedAt = Date.now();
  room.scores = { T: 0, CT: 0 };
  // TDM 模式:1 人時 spawn bots 一起玩;PK 模式永遠不 spawn bot
  const currentMap = getCurrentMap(room);
  if (room.mode === 'tdm' && room.players.size < 2) {
    spawnBots(room, 3, currentMap);
  }
  // 廣播對戰開始
  io.to(room.code).emit('match_start', {
    code: room.code,
    mode: room.mode,
    mapIndex: room.mapIndex,                                   // ← 新增
    mapTotal: room.mode === 'pk' ? PK_MAPS.length : 1,         // ← 新增
    roundInMap: room.roundInMap,                               // ← 新增
    roundsPerMap: room.roundsPerMap,                           // ← 新增
    scores: room.scores,
    sessionScores: room.sessionScores,
    maxKills: room.maxKills,
    map: {
      id: currentMap.id || 'dust2',
      name: currentMap.name || 'Dust II',
      subtitle: currentMap.subtitle,
      colliders: currentMap.colliders,
      decor: currentMap.decor,
      spawnPoints: currentMap.spawnPoints,
      sky: currentMap.sky,
      fog: currentMap.fog,
      fogNear: currentMap.fogNear,
      fogFar: currentMap.fogFar,
      ambient: currentMap.ambient,
      floorColor: currentMap.floorColor,
      wallColor: currentMap.wallColor,
      coverColor: currentMap.coverColor,
    },
    weapons: room.mode === 'pk' ? { knife: WEAPONS.knife, pistol: WEAPONS.pistol } : WEAPONS,
    players: Array.from(room.players.values()).map(p => ({
      id: p.id, name: p.name, team: p.team,
    })),
    bots: room.bots.map(b => ({ id: b.id })),
  });
  console.log(`[match] ${room.code} started mode=${room.mode} map=${currentMap.name} (${room.players.size}P + ${room.bots.length}B)`);
}

// PK 模式:打完 10 殺後切到下一張地圖 (非結束對戰)
// 邏輯:每張地圖打 roundsPerMap 場後,才切到下一張地圖
function cycleMap(room) {
  if (room.mode !== 'pk') return false;
  room.roundInMap++;
  const willSwitchMap = room.roundInMap >= room.roundsPerMap;
  if (willSwitchMap) {
    room.mapIndex++;
    room.roundInMap = 0;
  }
  room.scores = { T: 0, CT: 0 };
  // 把本張地圖的分數加到 session 累計
  // 注意:這裡分數在 endMatch 之前已經累計過一次,這裡不再加
  // 換下一張,所有玩家回到出生點、補滿血與彈藥
  const currentMap = getCurrentMap(room);
  for (const p of room.players.values()) {
    const spawn = currentMap.spawnPoints.find(s => s.team === p.team);
    if (spawn) { p.x = spawn.x; p.y = spawn.y; p.z = spawn.z; p.yaw = spawn.yaw; p.pitch = 0; }
    p.health = 100; p.alive = true;
    p.ammo = cloneAmmo();
    p.weapon = (currentMap.mode === 'pk') ? 'pistol' : 'nova';
    p.kills = 0; p.deaths = 0;  // 重置每場 K/D
    // 累計 session 分數(玩家本回合的 kills 也要算進去)
    const scoreForTeam = p.team;
    if (room._lastMapScores) {
      room.sessionScores[scoreForTeam] += room._lastMapScores[scoreForTeam] || 0;
    }
  }
  // 重建 nav grid 因為 colliders 變了 (地圖切換時才需要)
  if (willSwitchMap) {
    NAV.cells = null;
    buildNavGrid();
  }
  // 廣播:同地圖 reset 還是切到下張
  if (willSwitchMap) {
    io.to(room.code).emit('map_changed', {
      mapIndex: room.mapIndex,
      map: {
        id: currentMap.id,
        name: currentMap.name,
        subtitle: currentMap.subtitle,
        colliders: currentMap.colliders,
        decor: currentMap.decor,
        spawnPoints: currentMap.spawnPoints,
        sky: currentMap.sky,
        fog: currentMap.fog,
        fogNear: currentMap.fogNear,
        fogFar: currentMap.fogFar,
        ambient: currentMap.ambient,
        floorColor: currentMap.floorColor,
        wallColor: currentMap.wallColor,
        coverColor: currentMap.coverColor,
      },
      scores: room.scores,
      sessionScores: room.sessionScores,
      maxKills: room.maxKills,
      roundInMap: room.roundInMap,
      roundsPerMap: room.roundsPerMap,
    });
    console.log(`[map] ${room.code} cycled to ${currentMap.name} (idx=${room.mapIndex}, round ${room.roundInMap + 1}/${room.roundsPerMap})`);
  } else {
    // 同地圖 reset (新一場)
    io.to(room.code).emit('round_reset', {
      scores: room.scores,
      sessionScores: room.sessionScores,
      roundInMap: room.roundInMap,
      roundsPerMap: room.roundsPerMap,
      map: {
        id: currentMap.id,
        name: currentMap.name,
        subtitle: currentMap.subtitle,
        spawnPoints: currentMap.spawnPoints,
      },
      players: Array.from(room.players.values()).map(p => ({
        id: p.id, name: p.name, team: p.team,
        x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
        health: p.health, alive: p.alive, weapon: p.weapon,
        ammo: p.ammo, kills: p.kills, deaths: p.deaths,
      })),
    });
    console.log(`[round] ${room.code} reset round ${room.roundInMap + 1}/${room.roundsPerMap} on ${currentMap.name}`);
  }
  return willSwitchMap;
}

function endMatch(room) {
  room.state = 'ended';
  const winner = room.scores.T >= room.maxKills ? 'T' : 'CT';
  io.to(room.code).emit('match_end', {
    winner,
    scores: room.scores,
    duration: Math.floor((Date.now() - room.startedAt) / 1000),
  });
  console.log(`[match] ${room.code} ended, winner ${winner}`);
  // 6 秒後自動 reset
  room.resetTimer = setTimeout(() => resetMatch(room), MATCH_RESET_MS);
}

function resetMatch(room) {
  room.resetTimer = null;
  room.scores = { T: 0, CT: 0 };
  room.bots = [];
  for (const p of room.players.values()) {
    const spawn = MAP.spawnPoints.find(s => s.team === p.team);
    p.x = spawn.x; p.y = spawn.y; p.z = spawn.z;
    p.yaw = spawn.yaw; p.pitch = 0;
    p.health = 100; p.alive = true;
    p.ammo = cloneAmmo();
    p.kills = 0; p.deaths = 0;
    p.reloading = false; p.reloadTimer = 0;
  }
  room.state = 'waiting';
  io.to(room.code).emit('room_state', serializeRoom(room));
  // 自動開始下一場
  setTimeout(() => {
    if (room.state === 'waiting') startMatch(room);
  }, 2000);
}

function spawnBots(room, n, currentMap) {
  const map = currentMap || MAP;
  for (let i = 0; i < n && i < map.botSpawns.length; i++) {
    const sp = map.botSpawns[i];
    // 防呆:出生點如果卡牆裡,自動移到最近可走格
    let spawnX = sp.x, spawnZ = sp.z;
    const startCell = worldToCell(spawnX, spawnZ);
    if (!isWalkable(startCell.cx, startCell.cz)) {
      const nearest = findNearestWalkable(startCell.cx, startCell.cz);
      if (nearest) {
        const w = cellToWorld(nearest.cx, nearest.cz);
        spawnX = w.x;
        spawnZ = w.z;
        console.log(`[spawn-fix] bot ${i} spawn (${sp.x},${sp.z}) 卡牆,移到 (${spawnX.toFixed(1)},${spawnZ.toFixed(1)})`);
      }
    }
    room.bots.push({
      id: `bot_${i}_${Date.now()}`,
      x: spawnX, y: 0, z: spawnZ,
      yaw: 0,
      health: BOT_HP,
      alive: true,
      state: 'patrol',
      waypointIdx: i % MAP.patrolPoints.length,
      shootCooldown: 0,
      walkPhase: Math.random() * Math.PI * 2,
      // A* 路徑狀態
      path: null,
      pathIdx: 0,
      pathGoal: null,
      pathTime: 0,
      lastX: spawnX,
      lastZ: spawnZ,
      stuckTimer: 0,
    });
  }
}

function clearBots(room) {
  room.bots = [];
}

// =====================================================
// 導航網格 + A* 路徑尋找
// =====================================================
const NAV = {
  cellSize: 1.5,           // 每格 1.5m
  originX: -18,            // 地圖左邊界
  originZ: -42,            // 地圖後邊界
  width: 36,               // 36 格 (54m 寬)
  height: 38,              // 38 格 (57m 深)
  cells: null,             // Uint8Array: 1=可走, 0=阻擋
  botRadius: 0.5,
};

function buildNavGrid() {
  NAV.cells = new Uint8Array(NAV.width * NAV.height);
  const botTop = 2.5;
  const half = NAV.cellSize / 2;
  for (let cz = 0; cz < NAV.height; cz++) {
    for (let cx = 0; cx < NAV.width; cx++) {
      // Cell AABB (中心點 + 半邊長)
      const cellMinX = NAV.originX + cx * NAV.cellSize;
      const cellMaxX = cellMinX + NAV.cellSize;
      const cellMinZ = NAV.originZ + cz * NAV.cellSize;
      const cellMaxZ = cellMinZ + NAV.cellSize;
      let blocked = false;
      for (const c of MAP.colliders) {
        // Wall AABB (含 bot 半徑 padding)
        const wallMinX = c.x - c.w/2 - NAV.botRadius;
        const wallMaxX = c.x + c.w/2 + NAV.botRadius;
        const wallMinZ = c.z - c.d/2 - NAV.botRadius;
        const wallMaxZ = c.z + c.d/2 + NAV.botRadius;
        const wallTop = c.y + c.h / 2;
        const wallBot = c.y - c.h / 2;
        // AABB 重疊檢查 + 高度檢查
        const overlapX = cellMinX < wallMaxX && cellMaxX > wallMinX;
        const overlapZ = cellMinZ < wallMaxZ && cellMaxZ > wallMinZ;
        const overlapHeight = wallTop > 0 && wallBot < botTop;
        if (overlapX && overlapZ && overlapHeight) {
          blocked = true;
          break;
        }
      }
      NAV.cells[cz * NAV.width + cx] = blocked ? 0 : 1;
    }
  }
}

function worldToCell(x, z) {
  return {
    cx: Math.floor((x - NAV.originX) / NAV.cellSize),
    cz: Math.floor((z - NAV.originZ) / NAV.cellSize),
  };
}

function cellToWorld(cx, cz) {
  return {
    x: NAV.originX + (cx + 0.5) * NAV.cellSize,
    z: NAV.originZ + (cz + 0.5) * NAV.cellSize,
  };
}

function isWalkable(cx, cz) {
  if (cx < 0 || cx >= NAV.width || cz < 0 || cz >= NAV.height) return false;
  return NAV.cells[cz * NAV.width + cx] === 1;
}

function findNearestWalkable(cx, cz) {
  // 往外擴展找最近的可走格
  for (let r = 0; r <= 8; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        if (isWalkable(cx + dx, cz + dz)) return { cx: cx + dx, cz: cz + dz };
      }
    }
  }
  return null;
}

function heur(a, b) {
  return Math.hypot(a.cx - b.cx, a.cz - b.cz);
}

// A* 路徑尋找 — 回傳陣列 of {x,z} waypoints (含起點),失敗回傳 []
function findPath(sx, sz, gx, gz) {
  const start = worldToCell(sx, sz);
  let goal = worldToCell(gx, gz);

  // 起點/終點卡牆 → 找最近可走格
  if (!isWalkable(start.cx, start.cz)) {
    const n = findNearestWalkable(start.cx, start.cz);
    if (!n) return [];
    start.cx = n.cx; start.cz = n.cz;
  }
  if (!isWalkable(goal.cx, goal.cz)) {
    const n = findNearestWalkable(goal.cx, goal.cz);
    if (!n) return [];
    goal.cx = n.cx; goal.cz = n.cz;
  }
  if (start.cx === goal.cx && start.cz === goal.cz) return [];

  // A* 主迴圈 — 用閉集合 + 開放陣列 (小網格效能足夠)
  const open = [];
  const closed = new Set();
  const startNode = {
    cx: start.cx, cz: start.cz, g: 0,
    h: heur(start, goal), f: 0,
    parent: null,
  };
  startNode.f = startNode.g + startNode.h;
  open.push(startNode);

  while (open.length > 0) {
    // 找最低 f 的節點
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[best].f) best = i;
    }
    const cur = open.splice(best, 1)[0];
    const key = cur.cx * 1000 + cur.cz;
    if (closed.has(key)) continue;
    closed.add(key);

    if (cur.cx === goal.cx && cur.cz === goal.cz) {
      // 重構路徑
      const path = [];
      let n = cur;
      while (n) {
        const w = cellToWorld(n.cx, n.cz);
        path.unshift({ x: w.x, z: w.z });
        n = n.parent;
      }
      // 路徑平滑:合併共線節點,只保留方向改變的轉折點
      return smoothPath(path);
    }

    // 8 個鄰居 (含對角)
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (const [dx, dz] of dirs) {
      const ncx = cur.cx + dx, ncz = cur.cz + dz;
      if (!isWalkable(ncx, ncz)) continue;
      const nKey = ncx * 1000 + ncz;
      if (closed.has(nKey)) continue;
      // 對角移動時,兩側格也必須可走 (避免穿牆)
      if (dx !== 0 && dz !== 0) {
        if (!isWalkable(cur.cx + dx, cur.cz) || !isWalkable(cur.cx, cur.cz + dz)) continue;
      }
      const moveCost = (dx !== 0 && dz !== 0) ? 1.414 : 1;
      const tentativeG = cur.g + moveCost;
      const existing = open.find(n => n.cx === ncx && n.cz === ncz);
      if (existing && existing.g <= tentativeG) continue;
      const h = heur({ cx: ncx, cz: ncz }, goal);
      const node = {
        cx: ncx, cz: ncz, g: tentativeG, h, f: tentativeG + h,
        parent: cur,
      };
      if (existing) {
        Object.assign(existing, node);
      } else {
        open.push(node);
      }
    }
  }
  return [];
}

// 路徑平滑:只保留方向改變的轉折點,bot 走起來更順
function smoothPath(path) {
  if (path.length <= 2) return path;
  const result = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1], cur = path[i], next = path[i + 1];
    const dx1 = cur.x - prev.x, dz1 = cur.z - prev.z;
    const dx2 = next.x - cur.x, dz2 = next.z - cur.z;
    // 方向相同 → 共線,跳過
    if (Math.abs(dx1 * dz2 - dz1 * dx2) < 0.01) continue;
    result.push(cur);
  }
  result.push(path[path.length - 1]);
  return result;
}

// =====================================================
// 幾何輔助
// =====================================================
function isBlocked(x, z, room) {
  const r = 0.4;
  // PK 模式要用當前地圖的 colliders (arena 邊牆 + 掩體)
  // 否則玩家會直接穿過 PK 地圖的牆
  const map = room ? getCurrentMap(room) : MAP;
  for (const c of map.colliders) {
    if (x + r > c.x - c.w/2 && x - r < c.x + c.w/2 &&
        z + r > c.z - c.d/2 && z - r < c.z + c.d/2 &&
        c.y + c.h > 0.5) {
      return true;
    }
  }
  return false;
}

// Ray vs Collider list — 回傳 true 表示被擋住
function raycastBlocked(ox, oy, oz, dx, dy, dz, maxDist) {
  const STEPS = Math.max(4, Math.ceil(maxDist / 0.3));
  for (let i = 1; i <= STEPS; i++) {
    const t = (i / STEPS) * maxDist;
    const x = ox + dx * t;
    const y = oy + dy * t;
    const z = oz + dz * t;
    for (const c of MAP.colliders) {
      if (x > c.x - c.w/2 && x < c.x + c.w/2 &&
          y > c.y - c.h/2 && y < c.y + c.h/2 &&
          z > c.z - c.d/2 && z < c.z + c.d/2) {
        return true;
      }
    }
  }
  return false;
}

// Ray vs AABB — 回傳最近 hit 距離或 null
function rayVsAABB(ox, oy, oz, dx, dy, dz, bx, by, bz, bw, bh, bd) {
  const minX = bx - bw/2, maxX = bx + bw/2;
  const minY = by - bh/2, maxY = by + bh/2;
  const minZ = bz - bd/2, maxZ = bz + bd/2;

  let tmin = -Infinity, tmax = Infinity;
  if (Math.abs(dx) > 1e-6) {
    const t1 = (minX - ox) / dx;
    const t2 = (maxX - ox) / dx;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else if (ox < minX || ox > maxX) return null;
  if (Math.abs(dy) > 1e-6) {
    const t1 = (minY - oy) / dy;
    const t2 = (maxY - oy) / dy;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else if (oy < minY || oy > maxY) return null;
  if (Math.abs(dz) > 1e-6) {
    const t1 = (minZ - oz) / dz;
    const t2 = (maxZ - oz) / dz;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else if (oz < minZ || oz > maxZ) return null;
  if (tmax >= tmin && tmax > 0) return Math.max(0, tmin);
  return null;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// =====================================================
// Bot AI (server-side)
// =====================================================
// 效能優化:Bot 思考降頻 30Hz → 5Hz (用 _thinkTimer 累加 dt)
function updateBots(room, dt) {
  for (const bot of room.bots) {
    if (!bot.alive) continue;
    // 移動邏輯仍每 tick 跑(物理),但 AI 決策(shoot/chase/patrol)只每 200ms 跑一次
    bot._thinkTimer = (bot._thinkTimer || 0) + dt;
    const SHOULD_THINK = bot._thinkTimer >= 0.2;
    if (SHOULD_THINK) bot._thinkTimer = 0;
    if (!SHOULD_THINK) continue;
    // 效能優化:距離 > 80m 跳過(玩家根本看不到)
    let nearest = null, nearDist = Infinity;
    for (const p of room.players.values()) {
      if (!p.alive) continue;
      const dx = p.x - bot.x, dz = p.z - bot.z;
      const d = Math.hypot(dx, dz);
      if (d > 80) continue;  // 效能優化:跳過太遠的
      if (d < nearDist) { nearDist = d; nearest = p; }
    }

    // LOS 檢查 (是否能看到玩家)
    let canSee = false;
    if (nearest && nearDist < BOT_VIEW_RANGE) {
      const dirX = (nearest.x - bot.x) / nearDist;
      const dirZ = (nearest.z - bot.z) / nearDist;
      if (!raycastBlocked(bot.x, 1.7, bot.z, dirX, 0, dirZ, nearDist)) {
        canSee = true;
      }
    }

    if (canSee && nearDist < BOT_SHOOT_RANGE) {
      // === SHOOT 狀態 ===
      bot.state = 'shoot';
      bot.path = null;  // 進入射擊模式 → 清掉路徑
      bot.yaw = Math.atan2(nearest.x - bot.x, nearest.z - bot.z);
      bot.shootCooldown -= dt;
      if (bot.shootCooldown <= 0) {
        botShoot(room, bot, nearest);
        bot.shootCooldown = BOT_SHOOT_COOLDOWN * (0.7 + Math.random() * 0.6);
      }
    } else if (nearest) {
      // === CHASE 狀態 (看到玩家但超出射擊距離,或看不到但知道玩家在哪) ===
      bot.state = 'chase';
      followPath(bot, nearest.x, nearest.z, room, dt);
    } else {
      // === PATROL 狀態 (沒玩家可追) ===
      bot.state = 'patrol';
      patrolBot(bot, dt, room);
    }
  }
}

// 沿著 A* 路徑走 — 必要時自動重新規劃
function followPath(bot, goalX, goalZ, room, dt) {
  // 判斷是否需要重新規劃路徑
  const goalMoved = !bot.pathGoal ||
    Math.hypot(goalX - bot.pathGoal.x, goalZ - bot.pathGoal.z) > 3;
  const pathStale = !bot.path || bot.path.length === 0 ||
    (Date.now() - bot.pathTime > 2500);  // 每 2.5s 重算
  const stuck = bot.stuckTimer > 1.2;     // 卡住超過 1.2s → 重算

  if (goalMoved || pathStale || stuck) {
    bot.path = findPath(bot.x, bot.z, goalX, goalZ);
    bot.pathIdx = 0;
    bot.pathGoal = { x: goalX, z: goalZ };
    bot.pathTime = Date.now();
    bot.lastX = bot.x;
    bot.lastZ = bot.z;
    bot.stuckTimer = 0;
  }

  if (!bot.path || bot.path.length === 0) return;

  // 卡住偵測
  const moved = Math.hypot(bot.x - bot.lastX, bot.z - bot.lastZ);
  if (moved < 0.04) {
    bot.stuckTimer += dt;
  } else {
    bot.stuckTimer = 0;
    bot.lastX = bot.x;
    bot.lastZ = bot.z;
  }

  // 沿路徑走 (跳過第一個點 = 自己位置)
  while (bot.pathIdx < bot.path.length) {
    const wp = bot.path[bot.pathIdx];
    const dx = wp.x - bot.x, dz = wp.z - bot.z;
    if (Math.hypot(dx, dz) < 0.55) {
      bot.pathIdx++;
      continue;
    }
    // 朝 waypoint 移動
    const step = (bot.speed || 2.2) * dt;
    const len = Math.hypot(dx, dz);
    const nx = bot.x + (dx / len) * step;
    const nz = bot.z + (dz / len) * step;
    if (!isBlocked(nx, nz, room)) {
      bot.x = nx; bot.z = nz;
      bot.yaw = Math.atan2(dx, dz);
      bot.walkPhase += dt * 8;
    } else {
      // 這個 waypoint 暫時進不去 → 下一個
      bot.pathIdx++;
      bot.stuckTimer += dt;
    }
    break;
  }
  if (bot.pathIdx >= bot.path.length) {
    bot.path = null;  // 到達終點
  }
}

// 巡邏 — 走到目標 waypoint 後規劃下一段路徑
function patrolBot(bot, dt, room) {
  const wp = MAP.patrolPoints[bot.waypointIdx];
  // 簡化:巡邏直接走直線(patrol points 之間通常沒牆)
  const dx = wp.x - bot.x, dz = wp.z - bot.z;
  const len = Math.hypot(dx, dz);
  if (len < 1.2) {
    bot.waypointIdx = (bot.waypointIdx + 1) % MAP.patrolPoints.length;
    bot.path = null;
    return;
  }
  const step = (bot.speed || 2.2) * dt;
  const nx = bot.x + (dx / len) * step;
  const nz = bot.z + (dz / len) * step;
  if (!isBlocked(nx, nz, room)) {
    bot.x = nx; bot.z = nz;
    bot.yaw = Math.atan2(dx, dz);
    bot.walkPhase += dt * 8;
  } else {
    // 被擋 → 規劃 A* 路徑繞過
    bot.path = findPath(bot.x, bot.z, wp.x, wp.z);
    bot.pathIdx = 0;
    bot.pathTime = Date.now();
  }
}

function botShoot(room, bot, target) {
  const ox = bot.x, oy = 1.7, oz = bot.z;
  const tx = target.x, ty = target.y - 0.3, tz = target.z;
  const dx = tx - ox, dy = ty - oy, dz = tz - oz;
  const len = Math.hypot(dx, dy, dz);
  const sX = dx/len + (Math.random() - 0.5) * 0.05;
  const sY = dy/len + (Math.random() - 0.5) * 0.05;
  const sZ = dz/len + (Math.random() - 0.5) * 0.05;
  const slen = Math.hypot(sX, sY, sZ);
  const ndx = sX/slen, ndy = sY/slen, ndz = sZ/slen;

  if (raycastBlocked(ox, oy, oz, ndx, ndy, ndz, BOT_SHOOT_RANGE)) return;
  const dist = Math.hypot(target.x - ox, target.z - oz);
  const distFactor = Math.max(0.3, 1 - dist / BOT_SHOOT_RANGE);
  applyDamage(room, target, BOT_SHOOT_DAMAGE * distFactor, bot.id, 'Bot', false);
}

// =====================================================
// 命中 / 死亡 / 重生
// =====================================================
function applyDamage(room, victim, dmg, attackerId, attackerName, headshot = false) {
  if (!victim.alive) return;
  victim.health = Math.max(0, victim.health - dmg);
  const isBot = victim.id && victim.id.startsWith('bot_');

  io.to(room.code).emit('player_hit', {
    victimId: victim.id,
    attackerId,
    damage: Math.round(dmg * 10) / 10,
    newHealth: Math.round(victim.health),
    headshot,  // 爆頭旗標
  });

  if (victim.health <= 0) {
    victim.alive = false;

    if (isBot) {
      // Bot 死亡 — 給攻擊者加分,廣播 kill
      if (room.players.has(attackerId)) {
        const atk = room.players.get(attackerId);
        atk.kills++;
        room.scores[atk.team]++;
        io.to(room.code).emit('player_killed', {
          victimId: victim.id,
          victimName: '恐怖份子',
          attackerId: atk.id,
          attackerName: atk.name,
          weapon: WEAPONS[atk.weapon].name,
          teamKilled: 'bot',
        });
      }
      // 5 秒後重生 bot (讓單人模式有持續對手)
      setTimeout(() => respawnBot(room, victim.id), 5000);
    } else {
      // 玩家死亡
      victim.deaths++;
      if (room.players.has(attackerId)) {
        const atk = room.players.get(attackerId);
        atk.kills++;
        room.scores[atk.team]++;
        io.to(room.code).emit('player_killed', {
          victimId: victim.id,
          victimName: victim.name,
          attackerId: atk.id,
          attackerName: atk.name,
          weapon: WEAPONS[atk.weapon].name,
          teamKilled: victim.team,
        });
      } else {
        io.to(room.code).emit('player_killed', {
          victimId: victim.id,
          victimName: victim.name,
          attackerId: 'bot',
          attackerName: '恐怖份子',
          weapon: 'AK-47',
          teamKilled: victim.team,
        });
      }
      // 重生
      setTimeout(() => respawnPlayer(room, victim), RESPAWN_DELAY_MS);
    }

    // 檢查勝負
    if (room._cycling) return;  // 正在切換地圖,跳過 score check
    if (room.scores.T >= room.maxKills || room.scores.CT >= room.maxKills) {
      // 把本張分數暫存(PK 用於累計 session)
      room._lastMapScores = { ...room.scores };
      if (room.mode === 'pk') {
        // PK 模式:直接切下一張地圖 (不結束對戰)
        // 廣播本張地圖的贏家
        const mapWinner = room.scores.T >= room.maxKills ? 'T' : 'CT';
        io.to(room.code).emit('map_winner', { winner: mapWinner, scores: room.scores });
        room._cycling = true;  // 防 1.5s 內重複觸發
        // 1.5 秒後切換地圖
        setTimeout(() => { cycleMap(room); room._cycling = false; }, 1500);
      } else {
        endMatch(room);
      }
    }
  }
}

function respawnBot(room, botId) {
  const bot = room.bots.find(b => b.id === botId);
  if (!bot || !room.players.size) return;
  // 隨機重生到其中一個 spawn 點
  const sp = MAP.botSpawns[Math.floor(Math.random() * MAP.botSpawns.length)];
  let spawnX = sp.x, spawnZ = sp.z;
  // 防呆:同樣檢查是否可走
  const startCell = worldToCell(spawnX, spawnZ);
  if (!isWalkable(startCell.cx, startCell.cz)) {
    const nearest = findNearestWalkable(startCell.cx, startCell.cz);
    if (nearest) {
      const w = cellToWorld(nearest.cx, nearest.cz);
      spawnX = w.x;
      spawnZ = w.z;
    }
  }
  bot.x = spawnX; bot.z = spawnZ;
  bot.yaw = 0;
  bot.health = BOT_HP;
  bot.alive = true;
  bot.state = 'patrol';
  bot.waypointIdx = Math.floor(Math.random() * MAP.patrolPoints.length);
  bot.shootCooldown = 0;
  bot.path = null;
  bot.lastX = spawnX;
  bot.lastZ = spawnZ;
  bot.stuckTimer = 0;
}

function respawnPlayer(room, player) {
  if (!room.players.has(player.id)) return; // 已經斷線
  // 根據當前地圖取 spawn (PK 模式也要用 PK map 的 spawn)
  const currentMap = getCurrentMap(room);
  const spawn = currentMap.spawnPoints.find(s => s.team === player.team) ||
                MAP.spawnPoints.find(s => s.team === player.team) ||
                { x: 0, y: 1.7, z: 0, yaw: 0 };
  player.x = spawn.x; player.y = spawn.y; player.z = spawn.z;
  player.yaw = spawn.yaw; player.pitch = 0;
  player.health = 100;
  player.alive = true;
  player.ammo = cloneAmmo();
  player.reloading = false; player.reloadTimer = 0;
  io.to(room.code).emit('player_respawn', {
    id: player.id,
    x: player.x, y: player.y, z: player.z,
    yaw: player.yaw,
  });
}

// =====================================================
// 玩家輸入處理 (per tick, 30Hz)
// =====================================================
function handleInput(socketId, input) {
  const room = findPlayerRoom(socketId);
  if (!room || room.state !== 'playing') return;
  const player = room.players.get(socketId);
  if (!player || !player.alive) return;

  player.lastInputAt = Date.now();

  // 視角
  player.yaw = input.yaw || 0;
  player.pitch = clamp(input.pitch || 0, -Math.PI/2 + 0.01, Math.PI/2 - 0.01);

  // 換彈
  if (input.reload) tryReload(player);
  // 武器切換 (PK 模式只允許 pistol)
  const allowedWeapon = (room.mode === 'pk') ? 'pistol' : input.weapon;
  if (allowedWeapon && allowedWeapon !== player.weapon && !player.reloading && WEAPONS[allowedWeapon]) {
    player.weapon = allowedWeapon;
  }

  // 移動
  const speed = input.shift ? 7.5 : 4.5;
  let dx = 0, dz = 0;
  if (input.keys?.w) dz -= 1;
  if (input.keys?.s) dz += 1;
  if (input.keys?.a) dx -= 1;
  if (input.keys?.d) dx += 1;
  if (dx || dz) {
    const len = Math.hypot(dx, dz);
    dx /= len; dz /= len;
    const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
    const wx = dx * cy + dz * sy;
    const wz = -dx * sy + dz * cy;
    const step = speed * TICK_DT;
    const nx = player.x + wx * step;
    const nz = player.z + wz * step;
    if (!isBlocked(nx, nz, room)) {
      player.x = nx; player.z = nz;
    } else if (!isBlocked(nx, player.z, room)) {
      player.x = nx;
    } else if (!isBlocked(player.x, nz, room)) {
      player.z = nz;
    }
  }

  // 換彈計時
  if (player.reloading) {
    player.reloadTimer -= TICK_DT;
    if (player.reloadTimer <= 0) finishReload(player);
  }

  // 開火 (只在玩家點擊瞬間送 fire=true 時觸發 — 避免每 tick 重複)
  if (input.fire) tryFire(room, player);
}

function tryReload(player) {
  const w = WEAPONS[player.weapon];
  const ammo = player.ammo[player.weapon];
  if (ammo.mag >= w.magSize) return;
  if (ammo.reserve <= 0) return;
  if (player.reloading) return;
  player.reloading = true;
  player.reloadTimer = w.reloadTime;
}

function finishReload(player) {
  const w = WEAPONS[player.weapon];
  const ammo = player.ammo[player.weapon];
  const need = w.magSize - ammo.mag;
  const take = Math.min(need, ammo.reserve);
  ammo.mag += take;
  ammo.reserve -= take;
  player.reloading = false;
}

// 刀攻擊:近戰距離 + 角度判定
function tryMelee(room, player, w) {
  const ox = player.x, oy = player.y, oz = player.z;
  const forward = {
    x: -Math.sin(player.yaw),
    z: -Math.cos(player.yaw),
  };
  let bestVictim = null, bestDot = 0.5;  // dot > 0.5 ≈ 60° 內
  let bestDist = w.range, bestHeadshot = false;

  // 檢查其他玩家
  for (const [otherId, other] of room.players) {
    if (otherId === player.id || !other.alive) continue;
    const dx = other.x - ox, dz = other.z - oz;
    const d = Math.hypot(dx, dz);
    if (d > w.range) continue;
    const dot = (dx * forward.x + dz * forward.z) / Math.max(0.001, d);
    if (dot > bestDot) {
      bestDot = dot;
      bestVictim = other;
      bestDist = d;
      bestHeadshot = dot > 0.9;  // 超準確命中 = 爆頭 (刀在頭部高度)
    }
  }
  // 檢查 bot
  for (const bot of room.bots) {
    if (!bot.alive) continue;
    const dx = bot.x - ox, dz = bot.z - oz;
    const d = Math.hypot(dx, dz);
    if (d > w.range) continue;
    const dot = (dx * forward.x + dz * forward.z) / Math.max(0.001, d);
    if (dot > bestDot) {
      bestDot = dot;
      bestVictim = bot;
      bestDist = d;
      bestHeadshot = dot > 0.9;
    }
  }

  if (!bestVictim) return;
  const mult = bestHeadshot ? (w.headshotMult || 2.0) : 1.0;
  const dmg = w.damage * mult;

  // 玩家 / bot 不同處理
  if (bestVictim.id) {  // 玩家
    applyDamage(room, bestVictim, dmg, player.id, player.name, bestHeadshot);
  } else {  // bot
    botTakeDamage(room, bestVictim, dmg, player.id, player.name, bestHeadshot);
  }
}

function tryFire(room, player) {
  const now = Date.now() / 1000;
  const w = WEAPONS[player.weapon];
  if (now - player.lastFire < w.fireRate) return;
  const ammo = player.ammo[player.weapon];
  if (ammo.mag <= 0) { tryReload(player); return; }
  player.lastFire = now;
  ammo.mag--;

  // 刀特殊處理:不耗彈,近戰距離判定
  if (w.isMelee) {
    ammo.mag++;  // 取消扣彈
    return tryMelee(room, player, w);
  }

  // 子彈方向 (從 camera)
  const forward = {
    x: -Math.sin(player.yaw) * Math.cos(player.pitch),
    y:  Math.sin(player.pitch),
    z: -Math.cos(player.yaw) * Math.cos(player.pitch),
  };
  const ox = player.x, oy = player.y, oz = player.z;

  let hitVictim = null, hitDist = Infinity, hitDamage = 0, hitHeadshot = false;
  let hitIsBot = false;

  for (let i = 0; i < w.pellets; i++) {
    const dir = {
      x: forward.x + (Math.random() - 0.5) * w.spread,
      y: forward.y + (Math.random() - 0.5) * w.spread,
      z: forward.z + (Math.random() - 0.5) * w.spread,
    };
    const dlen = Math.hypot(dir.x, dir.y, dir.z);
    dir.x /= dlen; dir.y /= dlen; dir.z /= dlen;

    // 1) 檢查其他玩家
    for (const [otherId, other] of room.players) {
      if (otherId === player.id || !other.alive) continue;
      const t = rayVsAABB(ox, oy, oz, dir.x, dir.y, dir.z,
        other.x, 1.1, other.z, 0.7, 1.6, 0.4);
      if (t !== null && t < hitDist && t < w.range) {
        if (!raycastBlocked(ox, oy, oz, dir.x, dir.y, dir.z, t)) {
          hitDist = t;
          hitVictim = other;
          hitIsBot = false;
          // 命中點 y 座標決定是否爆頭 (>1.7 = 頭部)
          const hitY = oy + dir.y * t;
          const isHeadshot = hitY > 1.7;
          const falloff = w.pellets > 1 ? Math.max(0.4, 1 - t / w.range * 0.6) : 1;
          const mult = isHeadshot ? (w.headshotMult || 1.0) : 1.0;
          hitDamage = w.damage * falloff * mult;
          hitHeadshot = isHeadshot;
        }
      }
    }

    // 2) 檢查 bots (單人模式時主要的對手)
    for (const bot of room.bots) {
      if (!bot.alive) continue;
      const t = rayVsAABB(ox, oy, oz, dir.x, dir.y, dir.z,
        bot.x, 1.1, bot.z, 0.7, 1.6, 0.4);
      if (t !== null && t < hitDist && t < w.range) {
        if (!raycastBlocked(ox, oy, oz, dir.x, dir.y, dir.z, t)) {
          hitDist = t;
          hitVictim = bot;
          hitIsBot = true;
          const hitY = oy + dir.y * t;
          const isHeadshot = hitY > 1.7;
          const falloff = w.pellets > 1 ? Math.max(0.4, 1 - t / w.range * 0.6) : 1;
          const mult = isHeadshot ? (w.headshotMult || 1.0) : 1.0;
          hitDamage = w.damage * falloff * mult;
          hitHeadshot = isHeadshot;
        }
      }
    }
  }

  // 廣播開火 (其他人看到 muzzle flash / 音效)
  io.to(room.code).emit('player_fired', {
    shooterId: player.id,
    weapon: player.weapon,
    mag: ammo.mag,
    reserve: ammo.reserve,
    reloading: player.reloading,
  });

  if (hitVictim) {
    applyDamage(room, hitVictim, hitDamage, player.id, player.name, hitHeadshot);
  }
}

function findPlayerRoom(socketId) {
  for (const room of rooms.values()) {
    if (room.players.has(socketId)) return room;
  }
  return null;
}

function serializeRoom(room) {
  const currentMap = getCurrentMap(room);
  return {
    code: room.code,
    state: room.state,
    mode: room.mode,
    mapIndex: room.mapIndex,
    mapTotal: room.mode === 'pk' ? PK_MAPS.length : 1,
    mapName: currentMap.name,
    mapSubtitle: currentMap.subtitle,
    roundInMap: room.roundInMap,             // ← 新增
    roundsPerMap: room.roundsPerMap,         // ← 新增
    scores: room.scores,
    sessionScores: room.sessionScores,
    maxKills: room.maxKills,
    startedAt: room.startedAt,
    players: Array.from(room.players.values()).map(p => ({
      id: p.id, name: p.name, team: p.team,
      x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
      health: p.health, alive: p.alive, weapon: p.weapon,
      ammo: p.ammo, kills: p.kills, deaths: p.deaths,
      reloading: p.reloading,
    })),
    bots: room.bots.map(b => ({
      id: b.id, x: b.x, y: b.y, z: b.z, yaw: b.yaw,
      health: b.health, alive: b.alive, walkPhase: b.walkPhase,
    })),
  };
}

// =====================================================
// Tick (30Hz) — Bot AI + state broadcast
// =====================================================
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;

  for (const room of rooms.values()) {
    if (room.state !== 'playing') continue;
    updateBots(room, dt);
    io.to(room.code).emit('state', serializeRoom(room));
  }
}, Math.floor(1000 / TICK_HZ));

// =====================================================
// Socket.io 事件
// =====================================================
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  socket.on('create_room', ({ name, mode, mapIndex }, cb) => {
    try {
      const code = genCode();
      const room = makeRoom(code, socket.id, name);
      // PK 模式設定
      if (mode === 'pk') {
        room.mode = 'pk';
        // 接受自選地圖 (-1 = 隨機, 0..4 = 指定)
        let mi = parseInt(mapIndex);
        if (isNaN(mi) || mi < -1 || mi >= PK_MAPS.length) mi = 0;
        if (mi === -1) mi = Math.floor(Math.random() * PK_MAPS.length);
        room.mapIndex = mi;
        console.log(`[room] ${code} PK start map=${PK_MAPS[mi].name} (idx=${mi})`);
      }
      socket.join(code);
      socket.data.roomCode = code;
      cb?.({ ok: true, code, selfId: socket.id, mode: room.mode });
      io.to(code).emit('room_state', serializeRoom(room));
      const AUTO_START_MS = room.mode === 'pk' ? 8000 : 10000;
      const NEED_PLAYERS = room.mode === 'pk' ? 2 : 1;  // PK 模式需要 2 人
      setTimeout(() => {
        if (room.state === 'waiting' && room.players.size >= NEED_PLAYERS) {
          startMatch(room);
        } else if (room.mode === 'tdm' && room.state === 'waiting' && room.players.size === 1) {
          // TDM 1 人時自動開始 (會 spawn bots)
          startMatch(room);
        }
      }, AUTO_START_MS);
      console.log(`[room] ${code} created by ${name || 'anon'} mode=${room.mode} (${socket.id.slice(0,6)})`);
    } catch (err) {
      console.error('[create_room]', err);
      cb?.({ ok: false, error: err.message });
    }
  });

  socket.on('join_room', ({ code, name }, cb) => {
    const upperCode = (code || '').toUpperCase().trim();
    const room = rooms.get(upperCode);
    if (!room) return cb?.({ ok: false, error: '房間代碼錯誤或不存在' });
    if (room.state === 'ended') return cb?.({ ok: false, error: '比賽已結束,請稍候重置' });
    if (room.players.size >= MAX_ROOM_SIZE) return cb?.({ ok: false, error: '房間已滿' });
    const team = joinRoom(room, socket.id, name);
 socket.join(upperCode);
 socket.data.roomCode = upperCode;
 cb?.({ ok: true, code: upperCode, selfId: socket.id });
 io.to(upperCode).emit('room_state', serializeRoom(room));
    io.to(upperCode).emit('player_joined', {
      name: room.players.get(socket.id).name,
      team,
      playerCount: room.players.size,
    });
    // 第二人加入 → 開始 / 1 人等 10 秒 → 加 bot 開始
    if (room.state === 'waiting') {
      if (room.players.size >= 2) {
        clearBots(room);
        startMatch(room);
      } else {
        // 等 10 秒還沒第 2 人 → 開 bot
        setTimeout(() => {
          if (room.state === 'waiting' && room.players.size === 1) {
            startMatch(room);
          }
        }, 10000);
      }
    }
    console.log(`[room] ${upperCode} joined by ${name || 'anon'} (${socket.id.slice(0,6)}) team ${team}, now ${room.players.size}P`);
  });

  socket.on('quick_play', ({ name }, cb) => {
    // 嘗試配對
    while (quickQueue.length > 0) {
      const partnerId = quickQueue.shift();
      const partner = io.sockets.sockets.get(partnerId);
      if (!partner || !partner.connected) continue;
      const partnerRoom = partner.data.roomCode ? rooms.get(partner.data.roomCode) : null;
      if (partnerRoom && partnerRoom.state === 'waiting' &&
          partnerRoom.players.size < MAX_ROOM_SIZE) {
        const team = joinRoom(partnerRoom, socket.id, name);
        socket.join(partnerRoom.code);
        socket.data.roomCode = partnerRoom.code;
        cb?.({ ok: true, code: partnerRoom.code, selfId: socket.id });
        io.to(partnerRoom.code).emit('room_state', serializeRoom(partnerRoom));
        io.to(partnerRoom.code).emit('player_joined', {
          name: partnerRoom.players.get(socket.id).name,
          team,
          playerCount: partnerRoom.players.size,
        });
        if (partnerRoom.players.size >= 2) {
          clearBots(partnerRoom);
          startMatch(partnerRoom);
        }
        console.log(`[quick] paired → ${partnerRoom.code}`);
        return;
      }
    }
    // 沒人配 → 開新房排隊
    const code = genCode();
    const room = makeRoom(code, socket.id, name);
    socket.join(code);
    socket.data.roomCode = code;
    cb?.({ ok: true, code, selfId: socket.id });
    io.to(code).emit('room_state', serializeRoom(room));
    quickQueue.push(socket.id);
    // 10 秒還沒配到 → 加 bot 開始
    setTimeout(() => {
      const idx = quickQueue.indexOf(socket.id);
      if (idx >= 0) {
        quickQueue.splice(idx, 1);
        if (room.state === 'waiting') startMatch(room);
      }
    }, QUICK_PLAY_TIMEOUT_MS);
    console.log(`[quick] ${socket.id.slice(0,6)} queued, created ${code}`);
  });

  // 手動切換地圖 (PK 模式 only)
  socket.on('change_map', ({ mapIndex }, cb) => {
    try {
      const code = socket.data.roomCode;
      const room = code && rooms.get(code);
      if (!room) return cb?.({ ok: false, error: '不在房間裡' });
      if (room.mode !== 'pk') return cb?.({ ok: false, error: '只有 PK 模式能切地圖' });
      if (room.state !== 'playing') return cb?.({ ok: false, error: '房間未開始' });
      if (room._cycling) return cb?.({ ok: false, error: '正在切換中' });
      // 驗證地圖 index
      const targetIdx = parseInt(mapIndex);
      if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= PK_MAPS.length) {
        return cb?.({ ok: false, error: '地圖 index 錯誤' });
      }
      // 強制切換到目標地圖
      room.mapIndex = targetIdx;
      room.roundInMap = 0;  // 手動切換重置 round 計數
      room.scores = { T: 0, CT: 0 };
      room._lastMapScores = { T: 0, CT: 0 };
      const currentMap = PK_MAPS[room.mapIndex];
      for (const p of room.players.values()) {
        const spawn = currentMap.spawnPoints.find(s => s.team === p.team);
        if (spawn) { p.x = spawn.x; p.y = spawn.y; p.z = spawn.z; p.yaw = spawn.yaw; p.pitch = 0; }
        p.health = 100; p.alive = true;
        p.ammo = cloneAmmo();
        p.weapon = 'pistol';
        p.kills = 0; p.deaths = 0;
      }
      NAV.cells = null;
      buildNavGrid();
      io.to(room.code).emit('map_changed', {
        mapIndex: room.mapIndex,
        map: {
          id: currentMap.id, name: currentMap.name, subtitle: currentMap.subtitle,
          colliders: currentMap.colliders, decor: currentMap.decor, spawnPoints: currentMap.spawnPoints,
          sky: currentMap.sky, fog: currentMap.fog, fogNear: currentMap.fogNear, fogFar: currentMap.fogFar,
          ambient: currentMap.ambient, floorColor: currentMap.floorColor, wallColor: currentMap.wallColor, coverColor: currentMap.coverColor,
        },
        scores: room.scores,
        sessionScores: room.sessionScores,
        maxKills: room.maxKills,
        roundInMap: room.roundInMap,
        roundsPerMap: room.roundsPerMap,
        manual: true,  // 標記為手動切換
      });
      console.log(`[map] ${room.code} manual switch to ${currentMap.name} (idx=${room.mapIndex})`);
      cb?.({ ok: true, mapIndex: room.mapIndex, mapName: currentMap.name });
    } catch (e) {
      cb?.({ ok: false, error: e.message });
    }
  });

  socket.on('input', (input) => {
    try { handleInput(socket.id, input); }
    catch (err) { console.error('[input]', err); }
  });

  socket.on('chat', ({ text }) => {
    const room = findPlayerRoom(socket.id);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const clean = String(text || '').slice(0, 100);
    if (!clean.trim()) return;
    io.to(room.code).emit('chat', { name: player.name, team: player.team, text: clean });
  });

  socket.on('ping_room', (_, cb) => {
    const room = findPlayerRoom(socket.id);
    cb?.({ ok: !!room, code: room?.code, state: room?.state });
  });

  socket.on('leave_room', () => {
    handleDisconnect(socket);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[-] ${socket.id.slice(0,6)} disconnected (${reason})`);
    handleDisconnect(socket);
  });
});

function handleDisconnect(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;
  const wasHost = room.hostId === socket.id;
  const left = leaveRoom(room, socket.id);
  if (left) {
    console.log(`[room] ${code} destroyed (empty)`);
    return;
  }
  // 還有別人 — 通知
  io.to(code).emit('player_left', { playerCount: room.players.size });
  if (wasHost) {
    // 把 host 轉給第一個剩餘玩家
    room.hostId = room.players.keys().next().value;
  }
  // 進行中只剩 1 人 → 加 bot
  if (room.state === 'playing' && room.players.size === 1 && room.bots.length === 0) {
    spawnBots(room, 2);
    io.to(code).emit('info', { msg: '對手離開,AI 已加入戰場' });
  }
  // 從 quickQueue 移除
  const idx = quickQueue.indexOf(socket.id);
  if (idx >= 0) quickQueue.splice(idx, 1);
}

// =====================================================
// 啟動
// =====================================================
buildNavGrid();
const walkableCount = NAV.cells.reduce((s, v) => s + v, 0);
console.log(`[nav] 網格 ${NAV.width}x${NAV.height} = ${NAV.cells.length} 格,可走 ${walkableCount} 格 (${(walkableCount/NAV.cells.length*100).toFixed(1)}%)`);

server.listen(PORT, () => {
  console.log('');
  console.log('🟡  DUST II — Multiplayer Server');
  console.log(`    本機:    http://localhost:${PORT}`);
  console.log(`    健康:    http://localhost:${PORT}/api/health`);
  console.log(`    對外:    cloudflared tunnel --url http://localhost:${PORT}`);
  console.log('');
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT', () => { console.log('\n關閉中...'); server.close(); process.exit(0); });

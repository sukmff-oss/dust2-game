// =============================================================
// DUST II — Multiplayer Client (Three.js + Socket.io)
// Renders scene locally; sends input to server; renders remote
// players + bots from authoritative server state.
// =============================================================

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { io } from 'socket.io-client';

// =====================================================
// Web Audio 程序化音效系統 (零外部資源)
// =====================================================
class SFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      console.warn('SFX init failed:', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.4;
    return this.muted;
  }

  noiseBuffer(duration = 0.3) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Nova 霰彈槍 — 低頻爆破 + 噪音
  nova() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    // 低頻 sub-bass thump
    const osc = this.ctx.createOscillator();
    const oscG = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(85, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.18);
    oscG.gain.setValueAtTime(0.7, now);
    oscG.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(oscG).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.3);

    // 噪音爆破 (低通過濾)
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(0.22);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.Q.value = 1.0;
    const nG = this.ctx.createGain();
    nG.gain.setValueAtTime(0.55, now);
    nG.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    noise.connect(lp).connect(nG).connect(this.master);
    noise.start(now);
    noise.stop(now + 0.22);
  }

  // AK-47 — 高頻 sharp crack + 低頻 punch
  ak47() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    // High crack (bandpass noise)
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(0.08);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 1.2;
    const nG = this.ctx.createGain();
    nG.gain.setValueAtTime(0.55, now);
    nG.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    noise.connect(bp).connect(nG).connect(this.master);
    noise.start(now);
    noise.stop(now + 0.08);

    // Mid punch
    const osc = this.ctx.createOscillator();
    const oG = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.05);
    oG.gain.setValueAtTime(0.35, now);
    oG.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(oG).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  // 換彈咔嗒 (機械聲)
  reload() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const oG = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.06);
    oG.gain.setValueAtTime(0.25, now);
    oG.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(oG).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.09);

    // 第二次咔嗒 (reload 結束)
    const osc2 = this.ctx.createOscillator();
    const oG2 = this.ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(700, now + 0.18);
    osc2.frequency.exponentialRampToValueAtTime(300, now + 0.22);
    oG2.gain.setValueAtTime(0.25, now + 0.18);
    oG2.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc2.connect(oG2).connect(this.master);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.25);
  }

  // 空彈匣乾扣
  empty() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const oG = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1300;
    oG.gain.setValueAtTime(0.12, now);
    oG.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(oG).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  // 命中 (body thud)
  hit(headshot = false) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    // 命中 thud
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(headshot ? 380 : 180, now);
    osc.frequency.exponentialRampToValueAtTime(headshot ? 220 : 80, now + 0.05);
    oscGain.gain.setValueAtTime(headshot ? 0.7 : 0.5, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(oscGain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.12);
    // 爆頭時加個高頻「叮」
    if (headshot) {
      const osc2 = this.ctx.createOscillator();
      const osc2Gain = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = 1200;
      osc2Gain.gain.setValueAtTime(0.3, now + 0.01);
      osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc2.connect(osc2Gain).connect(this.master);
      osc2.start(now + 0.01);
      osc2.stop(now + 0.13);
    }
  }

  // 擊殺 (高頻 ding 雙音)
  kill() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const oG = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    oG.gain.setValueAtTime(0.3, now);
    oG.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(oG).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.2);

    // 泛音 (bell-like)
    const osc2 = this.ctx.createOscillator();
    const oG2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 1320;
    oG2.gain.setValueAtTime(0.2, now + 0.03);
    oG2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc2.connect(oG2).connect(this.master);
    osc2.start(now + 0.03);
    osc2.stop(now + 0.24);
  }

  // 受傷 (低頻 thud, 心跳感)
  damage() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const oG = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(70, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.12);
    oG.gain.setValueAtTime(0.5, now);
    oG.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(oG).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  // UI 點擊
  click() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const oG = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1100;
    oG.gain.setValueAtTime(0.08, now);
    oG.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    osc.connect(oG).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  // 死亡 (低頻哀鳴 + 噪音)
  death() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const oG = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
    oG.gain.setValueAtTime(0.3, now);
    oG.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(oG).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.65);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(0.3);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const nG = this.ctx.createGain();
    nG.gain.setValueAtTime(0.2, now);
    nG.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    noise.connect(lp).connect(nG).connect(this.master);
    noise.start(now);
    noise.stop(now + 0.35);
  }

  // 勝利 fanfare
  victory() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047]; // C E G C (高八度)
    notes.forEach((freq, i) => {
      const t = now + i * 0.12;
      const osc = this.ctx.createOscillator();
      const oG = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      oG.gain.setValueAtTime(0.3, t);
      oG.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(oG).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.42);
    });
  }
}

const sfx = new SFX();

// =====================================================
// 視覺武器設定 (與 server 端 WEAPONS 不同 — 這只控制模型外觀)
// =====================================================
const WEAPONS_VISUAL = {
  nova: {
    name: 'Nova',
    color: 0x222222,
    barrelLength: 0.85,
    barrelWidth: 0.13,
    isShotgun: true,
  },
  ak47: {
    name: 'AK-47',
    color: 0x4a3220,
    barrelLength: 0.95,
    barrelWidth: 0.06,
    isShotgun: false,
  },
};

// =====================================================
// 玩家視覺設定
// =====================================================
const PLAYER_VISUAL = {
  height: 1.7,
  radius: 0.4,
  walkSpeed: 4.5,
  runSpeed: 7.5,
};

// =====================================================
// 全域狀態
// =====================================================
const state = {
  // 連線
  connected: false,
  myId: null,
  myTeam: null,

  // 房間
  room: null,             // 從 server 收到
  roomCode: null,
  matchStartedAt: null,
  matchEndAt: null,
  waitingForMatch: false,
  waitTimer: 0,

  // 本地玩家 (從 server 更新)
  health: 100,
  weapon: 'nova',
  ammo: { nova: { mag: 8, reserve: 32 }, ak47: { mag: 30, reserve: 90 } },
  reloading: false,
  reloadStartTime: null,
  alive: true,
  kills: 0,
  deaths: 0,
  name: 'Player',

  // 視角
  yaw: 0,
  pitch: 0,

  // 輸入
  keys: { w: false, a: false, s: false, d: false, shift: false },
  firePressed: false,
  reloadPressed: false,
  weaponSwitchTo: null,

  // 遊戲階段
  phase: 'lobby',         // lobby | waiting | playing | ended

  // 渲染輔助
  remotePlayers: new Map(), // id → {group, hpBar, hpBarBg, walkPhase}
  bots: new Map(),          // id → {group, hpBar, hpBarBg, walkPhase, alive}
};

// =====================================================
// DOM 參照
// =====================================================
const dom = {
  health: document.getElementById('health'),
  ammoCur: document.getElementById('ammo-current'),
  ammoRes: document.getElementById('ammo-reserve'),
  weaponName: document.getElementById('weapon-name'),
  hitmarker: document.getElementById('hitmarker'),
  killfeed: document.getElementById('killfeed'),
  vignette: document.getElementById('damage-vignette'),

  // Lobby
  lobby: document.getElementById('lobby'),
  lobbyConnecting: document.getElementById('lobby-connecting'),
  lobbyMain: document.getElementById('lobby-main'),
  lobbyWaiting: document.getElementById('lobby-waiting'),
  lobbyInGame: document.getElementById('lobby-ingame'),
  playerName: document.getElementById('player-name'),
  btnCreate: document.getElementById('btn-create'),
  btnCreatePk: document.getElementById('btn-create-pk'),
  btnQuick: document.getElementById('btn-quick'),
  roomCodeInput: document.getElementById('room-code-input'),
  btnJoin: document.getElementById('btn-join'),
  lobbyError: document.getElementById('lobby-error'),
  myRoomCode: document.getElementById('my-room-code'),
  myTeam: document.getElementById('my-team'),
  waitTimer: document.getElementById('wait-timer'),
  playerList: document.getElementById('player-list'),

  // 連線狀態
  connStatus: document.getElementById('conn-status'),

  // 靜音按鈕
  muteBtn: document.getElementById('mute-btn'),

  // PK 模式 HUD
  mapInfo: document.getElementById('map-info'),
  mapName: document.getElementById('map-name'),
  mapSubtitle: document.getElementById('map-subtitle'),
  mapCurrent: document.getElementById('map-current'),
  mapTotal: document.getElementById('map-total'),
  mapChangeBanner: document.getElementById('map-change-banner'),
  mapWinnerBanner: document.getElementById('map-winner-banner'),

  // 換彈 HUD
  reloadBar: document.getElementById('reload-bar'),
  reloadBarFill: document.querySelector('#reload-bar .reload-bar-fill'),

  // 換地圖 HUD (PK 模式 only)
  btnChangeMap: document.getElementById('btn-change-map'),
  mapChangePanel: document.getElementById('map-change-panel'),
  mcpGrid: document.getElementById('mcp-grid'),
  mcpClose: document.getElementById('mcp-close'),

  // 計分板
  scoreT: document.getElementById('score-t'),
  scoreCT: document.getElementById('score-ct'),
  matchTimer: document.getElementById('match-timer'),

  // 開始按鈕 (in-game)
  startScreen: document.getElementById('start-screen'),
  startBtn: document.getElementById('start-btn'),
  botCount: document.getElementById('bot-count'),
  startObjective: document.getElementById('start-objective'),

  // 結束畫面
  overlay: document.getElementById('overlay'),
  overlayTitle: document.getElementById('overlay-title'),
  overlayMsg: document.getElementById('overlay-msg'),
  resumeBtn: document.getElementById('resume-btn'),

  // 聊天
  chatBox: document.getElementById('chat-box'),
  chatList: document.getElementById('chat-list'),
  chatInput: document.getElementById('chat-input'),
  chatToggle: document.getElementById('chat-toggle'),
};

// =====================================================
// Three.js 場景
// =====================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb4c4);
scene.fog = new THREE.Fog(0xc9b896, 40, 160);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 500);
camera.position.set(0, PLAYER_VISUAL.height, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const sun = new THREE.DirectionalLight(0xffe8c8, 1.3);
sun.position.set(40, 60, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -80; sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80; sun.shadow.camera.bottom = -80;
sun.shadow.camera.far = 200;
scene.add(sun);
scene.add(new THREE.AmbientLight(0xb8a890, 0.55));
scene.add(new THREE.HemisphereLight(0xd4c8a8, 0x8a6b48, 0.5));

// =====================================================
// 紋理生成
// =====================================================
function makeSandTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c8a878';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const s = Math.random() * 1.4;
    ctx.fillStyle = `rgba(${130 + Math.random()*60},${100 + Math.random()*40},${60 + Math.random()*30},${0.3 + Math.random()*0.4})`;
    ctx.fillRect(x, y, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return tex;
}
function makeAdobeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c8a878';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(80,60,40,0.3)';
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random()*256, Math.random()*256);
    ctx.lineTo(Math.random()*256, Math.random()*256);
    ctx.lineWidth = 0.5 + Math.random();
    ctx.stroke();
  }
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(${80 + Math.random()*40},${60 + Math.random()*30},${30 + Math.random()*20},${0.1 + Math.random()*0.15})`;
    ctx.beginPath();
    ctx.arc(Math.random()*256, Math.random()*256, 4 + Math.random()*16, 0, Math.PI*2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const sandTex = makeSandTexture();
const adobeTex = makeAdobeTexture();
const sandMat = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.95, color: 0xd4b890 });
const adobeMat = new THREE.MeshStandardMaterial({ map: adobeTex, roughness: 0.9, color: 0xc8a878 });

// =====================================================
// 地圖 — 與 server MAP.colliders 對應
// =====================================================
const colliders = [];
function box(w, h, d, x, y, z, mat, rotY = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.castShadow = true;
  m.receiveShadow = true;
  m.geometry.computeBoundingBox();
  colliders.push(m);
  scene.add(m);
  return m;
}

const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), sandMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 主要建築
box(2, 6, 30, -10, 3, -10, adobeMat);
box(8, 6, 2, -7, 3, 1, adobeMat);
box(8, 6, 2, -7, 3, -22, adobeMat);

// 隧道拱門
box(2, 5, 2, -13, 2.5, -16, adobeMat);
box(2, 5, 2, -4, 2.5, -16, adobeMat);
box(10, 1.2, 2, -7, 4.4, -16, adobeMat);

// "2" 字樣
const twoMat = new THREE.MeshBasicMaterial({ color: 0xd83a4a });
function twoSign(x, y, z) {
  const g = new THREE.Group();
  const seg = (px, py, w, h) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), twoMat);
    m.position.set(px, py, 0);
    return m;
  };
  g.add(seg(0, 0.6, 0.4, 0.08));
  g.add(seg(0.18, 0.4, 0.08, 0.4));
  g.add(seg(0, 0.2, 0.4, 0.08));
  g.add(seg(-0.18, 0, 0.08, 0.4));
  g.add(seg(0, -0.2, 0.4, 0.08));
  g.position.set(x, y, z);
  g.rotation.y = Math.PI;
  scene.add(g);
}
twoSign(-4.3, 3.0, -15.0);

// 周邊建築
box(2, 5, 40, 10, 2.5, -8, adobeMat);
box(14, 5, 2, 17, 2.5, -27, adobeMat);
box(40, 5, 2, 0, 2.5, -38, adobeMat);
box(6, 4, 5, 14, 2, 5, adobeMat);
box(6, 5, 5, 22, 2.5, 8, adobeMat);
box(8, 3, 4, 30, 1.5, 12, adobeMat);

// B 區綠門
const greenDoor = new THREE.Mesh(
  new THREE.BoxGeometry(3.5, 4, 0.3),
  new THREE.MeshStandardMaterial({ color: 0x3a5a3a, roughness: 0.7 })
);
greenDoor.position.set(-3, 2, 1.5);
scene.add(greenDoor);
box(4, 4.3, 0.4, -3, 2.15, 1.5, adobeMat);

// 藍色老爺車
const carBody = new THREE.Mesh(
  new THREE.BoxGeometry(1.8, 0.7, 4.2),
  new THREE.MeshStandardMaterial({ color: 0x88a8c4, roughness: 0.5, metalness: 0.4 })
);
carBody.position.set(5, 0.5, -2);
carBody.castShadow = true;
scene.add(carBody);
const carCab = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 0.6, 2.2),
  new THREE.MeshStandardMaterial({ color: 0x6b8aa6, roughness: 0.4, metalness: 0.5 })
);
carCab.position.set(5, 1.15, -1.8);
carCab.castShadow = true;
scene.add(carCab);
[ [-0.7, 0.3, 1.4], [0.7, 0.3, 1.4], [-0.7, 0.3, -1.4], [0.7, 0.3, -1.4] ].forEach(([x,y,z]) => {
  const wheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.25, 12),
    new THREE.MeshStandardMaterial({ color: 0x222 })
  );
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(5 + x, y, -2 + z);
  scene.add(wheel);
});

// 木箱堆
const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.85 });
const crateMat2 = new THREE.MeshStandardMaterial({ color: 0x7a5a2a, roughness: 0.85 });
function crate(x, y, z, w = 1, h = 1, d = 1, mat = crateMat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
crate(-5, 0.5, 0); crate(-5, 1.5, 0, 1, 1, 1, crateMat2); crate(-4, 0.5, 0.5, 1, 1, 1, crateMat2);
crate(-3, 0.5, -8); crate(-2, 0.5, -8, 1, 1, 1, crateMat2); crate(-2.5, 1.5, -8);
crate(8, 0.5, -27); crate(9, 0.5, -27); crate(8.5, 1.5, -27);
crate(8.5, 0.5, -26, 1, 1, 1, crateMat2);

// 棕櫚樹
function palm(x, z) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.28, 6, 8),
    new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.9 })
  );
  trunk.position.set(x, 3, z);
  trunk.castShadow = true;
  scene.add(trunk);
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.05, 3),
      new THREE.MeshStandardMaterial({ color: 0x4a6a2a, roughness: 0.8 })
    );
    leaf.position.set(x, 6.2, z);
    leaf.rotation.y = (i / 7) * Math.PI * 2;
    leaf.rotation.x = -0.4;
    scene.add(leaf);
  }
}
palm(-13, 5); palm(-13, -28); palm(15, -15);

// 大石頭
function rock(x, z, s = 1) {
  const r = new THREE.Mesh(
    new THREE.DodecahedronGeometry(s, 0),
    new THREE.MeshStandardMaterial({ color: 0x9a8a70, roughness: 0.95 })
  );
  r.position.set(x, s * 0.4, z);
  r.rotation.set(Math.random(), Math.random(), Math.random());
  r.castShadow = true;
  r.receiveShadow = true;
  scene.add(r);
}
rock(-12, -5, 0.8); rock(-11, -5.5, 0.5); rock(12, -2, 0.7); rock(13, -1.5, 0.4);

// =====================================================
// 動態地圖渲染 (PK 模式專用)
// =====================================================
state.mapDecorGroup = null;

// 簡單紋理生成 (依地圖類型)
function makePlainTexture(hex, withGrain = false) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 256, 256);
  if (withGrain) {
    for (let i = 0; i < 6000; i++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      const s = Math.random() * 1.2;
      ctx.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.15})`;
      ctx.fillRect(x, y, s, s);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// 從伺服器收到的地圖資料渲染裝飾 + 碰撞視覺化
function renderMapDecor(mapData) {
  if (state.mapDecorGroup) {
    scene.remove(state.mapDecorGroup);
    state.mapDecorGroup.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
    state.mapDecorGroup = null;
  }
  const group = new THREE.Group();
  group.name = 'pk-map-decor';

  // 地板 — 大平面
  const floorMat = new THREE.MeshStandardMaterial({
    color: mapData.floorColor || '#888',
    roughness: 0.9,
    metalness: 0.05,
  });
  // PK 場地大約 30x30,直接蓋大一點
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // 牆 + 掩體 (colliders)
  const wallMat = new THREE.MeshStandardMaterial({
    color: mapData.wallColor || '#666',
    roughness: 0.85,
    metalness: 0.05,
  });
  const coverMat = new THREE.MeshStandardMaterial({
    color: mapData.coverColor || '#777',
    roughness: 0.7,
    metalness: 0.1,
  });
  for (const c of (mapData.colliders || [])) {
    const mat = c.type === 'cover' ? coverMat : wallMat;
    const m = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), mat);
    m.position.set(c.x, c.y, c.z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  // 純裝飾
  const decorMatCache = {};
  for (const d of (mapData.decor || [])) {
    let mat = decorMatCache[d.color];
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: d.color || '#999',
        roughness: 0.8,
        metalness: 0.1,
      });
      decorMatCache[d.color] = mat;
    }
    const m = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, d.d), mat);
    m.position.set(d.x, d.y, d.z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  scene.add(group);
  state.mapDecorGroup = group;
}

// =====================================================
// 武器模型 (第一人稱手持)
// =====================================================
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);
scene.add(camera);

function buildWeapon(key) {
  while (weaponGroup.children.length) {
    const g = weaponGroup.children[0];
    weaponGroup.remove(g);
    g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  const w = WEAPONS_VISUAL[key];
  if (!w) return;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w.barrelWidth, w.barrelWidth, w.barrelLength),
    new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.6, metalness: 0.5 })
  );
  body.position.set(0, 0, -w.barrelLength / 2);
  weaponGroup.add(body);

  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(w.barrelWidth * 1.2, w.barrelWidth * 1.2, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 })
  );
  stock.position.set(0, 0, w.barrelLength / 2 - 0.15);
  weaponGroup.add(stock);

  if (w.isShotgun) {
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, w.barrelLength, 8),
      new THREE.MeshStandardMaterial({ color: 0x333, metalness: 0.6 })
    );
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, -0.09, -w.barrelLength / 2);
    weaponGroup.add(tube);
  }

  const sight = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.06, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xffcc33 })
  );
  sight.position.set(0, w.barrelWidth / 2 + 0.03, -w.barrelLength + 0.05);
  weaponGroup.add(sight);

  weaponGroup.position.set(0.28, -0.32, -0.55);
  weaponGroup.rotation.y = -0.05;
  weaponGroup.rotation.x = -0.02;
}

// =====================================================
// 玩家 / Bot 模型工廠
// =====================================================
function makePlayerMesh(team) {
  // T 隊 = 紅衣, CT 隊 = 藍衣 (CS 致敬配色)
  const isCT = team === 'CT';
  const bodyColor = isCT ? 0x2a4a6a : 0x4a3a28;     // 深藍 vs 深咖
  const headColor = 0xd8b890;
  const scarfColor = isCT ? 0x3a6a9a : 0xb83838;    // 藍頭巾 vs 紅頭巾

  const root = new THREE.Group();

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.9, 0.4),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.9 })
  );
  torso.position.y = 1.1;
  torso.castShadow = true;
  root.add(torso);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.4, 0.4),
    new THREE.MeshStandardMaterial({ color: headColor, roughness: 0.7 })
  );
  head.position.y = 1.8;
  head.castShadow = true;
  root.add(head);

  const scarf = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.12, 0.42),
    new THREE.MeshStandardMaterial({ color: scarfColor, roughness: 0.8 })
  );
  scarf.position.y = 1.85;
  root.add(scarf);

  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.3), legMat);
  legL.position.set(-0.18, 0.45, 0);
  legL.castShadow = true;
  root.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.18;
  root.add(legR);

  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x222 })
  );
  gun.position.set(0.3, 1.1, -0.25);
  gun.rotation.x = 0.3;
  root.add(gun);

  // 血條
  const hpBarBg = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x000, depthTest: false, transparent: true })
  );
  hpBarBg.position.y = 2.2;
  hpBarBg.renderOrder = 999;
  root.add(hpBarBg);
  const hpBar = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xff3333, depthTest: false, transparent: true })
  );
  hpBar.position.y = 2.2;
  hpBar.position.z = 0.001;
  hpBar.renderOrder = 1000;
  root.add(hpBar);

  // 名字標籤 (用 CSS2D 簡化 — 直接用 sprite? 太複雜,先用純文字 canvas sprite)
  const nameLabel = makeNameLabel('Player', isCT);
  nameLabel.position.y = 2.5;
  root.add(nameLabel);

  scene.add(root);
  return { root, head, torso, legL, legR, hpBar, hpBarBg, nameLabel };
}

function makeNameLabel(name, isCT) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = isCT ? '#66ccff' : '#ffcc33';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2, 0.5, 1);
  return sprite;
}

function makeBotMesh() {
  // Bot 沿用原版外觀 (深咖 + 紅頭巾)
  const root = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.9, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 })
  );
  torso.position.y = 1.1; torso.castShadow = true; root.add(torso);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.4, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xd8b890, roughness: 0.7 })
  );
  head.position.y = 1.8; head.castShadow = true; root.add(head);
  const scarf = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.12, 0.42),
    new THREE.MeshStandardMaterial({ color: 0xb83838, roughness: 0.8 })
  );
  scarf.position.y = 1.85; root.add(scarf);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.3), legMat);
  legL.position.set(-0.18, 0.45, 0); legL.castShadow = true; root.add(legL);
  const legR = legL.clone(); legR.position.x = 0.18; root.add(legR);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x222 })
  );
  gun.position.set(0.3, 1.1, -0.25); gun.rotation.x = 0.3; root.add(gun);

  const hpBarBg = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x000, depthTest: false, transparent: true })
  );
  hpBarBg.position.y = 2.2; hpBarBg.renderOrder = 999; root.add(hpBarBg);
  const hpBar = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xff3333, depthTest: false, transparent: true })
  );
  hpBar.position.y = 2.2; hpBar.position.z = 0.001; hpBar.renderOrder = 1000; root.add(hpBar);

  scene.add(root);
  return { root, head, torso, legL, legR, hpBar, hpBarBg };
}

// =====================================================
// Socket.io 連線
// =====================================================
const socket = io({
  transports: ['websocket', 'polling'],
  reconnection: true,
});

socket.on('connect', () => {
  state.connected = true;
  state.myId = socket.id;
  dom.connStatus.textContent = '● 已連線';
  dom.connStatus.className = 'conn-status connected';
  showLobbySection('main');
});

socket.on('disconnect', () => {
  state.connected = false;
  dom.connStatus.textContent = '● 連線中斷,重連中...';
  dom.connStatus.className = 'conn-status disconnected';
  showLobbySection('connecting');
});

socket.on('connect_error', (err) => {
  dom.connStatus.textContent = '● 連線失敗: ' + err.message;
  dom.connStatus.className = 'conn-status disconnected';
});

socket.on('room_state', (data) => {
  state.room = data;
  state.roomCode = data.code;
  state.waitingForMatch = data.state === 'waiting';
  showLobbySection('waiting');
  dom.myRoomCode.textContent = data.code;
  renderPlayerList(data.players);
});

socket.on('match_start', (data) => {
  state.phase = 'playing';
  state.matchStartedAt = Date.now();
  state.waitingForMatch = false;
  state.room = data;
  state.mode = data.mode;  // 'tdm' | 'pk'
  hideLobby();
  dom.startScreen.style.display = 'flex';
  // PK 模式:顯示「換地圖」按鈕
  if (dom.btnChangeMap) dom.btnChangeMap.style.display = (data.mode === 'pk') ? 'block' : 'none';
  // PK 模式自動切到手槍
  if (data.mode === 'pk' && data.weapons?.pistol) {
    state.weapon = 'pistol';
    sfx.click();
  }
  const totalPlayers = (data.players?.length ?? 0) + (data.bots?.length ?? 0);
  dom.botCount.textContent = totalPlayers - 1;
  const objText = data.mode === 'pk'
    ? `PK 對決 — ${data.map?.name || ''} (${data.map?.subtitle || ''}) · 先達 ${data.maxKills} 殺切下一張地圖`
    : `目標:殲滅敵方,先達 ${data.maxKills} 殺`;
  dom.startObjective.textContent = objText;
  // 渲染地圖裝飾 (PK 模式是新地圖,DUST2 也有自己的裝飾)
  if (data.map?.decor) {
    renderMapDecor(data.map);
  }
});

// 切換地圖 (PK 模式專用) — 重新生成裝飾與碰撞體
socket.on('map_changed', (data) => {
  console.log('[map_changed]', data.map?.name);
  state.room = { ...state.room, ...data };
  // 清掉舊裝飾,渲染新地圖
  if (state.mapDecorGroup) {
    scene.remove(state.mapDecorGroup);
    state.mapDecorGroup = null;
  }
  if (data.map) {
    renderMapDecor(data.map);
    // 更新天空與光線
    if (data.map.sky) {
      scene.background = new THREE.Color(data.map.sky);
    }
    if (data.map.fog) {
      scene.fog = new THREE.Fog(data.map.fog, data.map.fogNear || 20, data.map.fogFar || 50);
    }
    if (data.map.ambient) {
      const ambient = scene.getObjectByName('ambient-light');
      if (ambient) ambient.color.set(data.map.ambient);
    }
    // 強制把玩家瞬移到新出生點
    const me = data.players?.find(p => p.id === state.myId);
    if (me && data.map.spawnPoints) {
      const spawn = data.map.spawnPoints.find(s => s.team === me.team);
      if (spawn) {
        state.yaw = spawn.yaw;
        state.pitch = 0;
        smoothMyPosition(spawn.x, spawn.y, spawn.z);
      }
    }
  }
  // 短訊息 — 顯示 4 秒讓玩家清楚知道換地圖了
  if (dom.mapChangeBanner) {
    dom.mapChangeBanner.innerHTML = `
      <div class="mb-line1">→ 下張地圖</div>
      <div class="mb-line2">${data.map?.name || '未知'}</div>
      <div class="mb-line3">${data.map?.subtitle || ''}</div>
    `;
    dom.mapChangeBanner.style.display = 'block';
    // 重啟動畫
    dom.mapChangeBanner.style.animation = 'none';
    void dom.mapChangeBanner.offsetWidth;  // reflow
    dom.mapChangeBanner.style.animation = 'bannerPop 0.4s ease-out';
    setTimeout(() => { dom.mapChangeBanner.style.display = 'none'; }, 4000);
  }
});

// 單張地圖贏家
socket.on('map_winner', (data) => {
  if (dom.mapWinnerBanner) {
    dom.mapWinnerBanner.textContent = `${data.winner === 'T' ? '🔴 T' : '🔵 CT'} 拿下本場!`;
    dom.mapWinnerBanner.style.display = 'block';
    setTimeout(() => { dom.mapWinnerBanner.style.display = 'none'; }, 1400);
  }
});

// 同地圖新一場(5 場內的 reset)
socket.on('round_reset', (data) => {
  console.log(`[round_reset] round ${data.roundInMap + 1}/${data.roundsPerMap}`);
  state.room = { ...state.room, ...data };
  // 短訊息:第 X/5 場
  if (dom.mapChangeBanner) {
    dom.mapChangeBanner.innerHTML = `
      <div class="mb-line1">第 ${data.roundInMap + 1} / ${data.roundsPerMap} 場</div>
      <div class="mb-line2">${data.map?.name || '同地圖'}</div>
      <div class="mb-line3">準備下一場!</div>
    `;
    dom.mapChangeBanner.style.display = 'block';
    dom.mapChangeBanner.style.animation = 'none';
    void dom.mapChangeBanner.offsetWidth;
    dom.mapChangeBanner.style.animation = 'bannerPop 0.4s ease-out';
    setTimeout(() => { dom.mapChangeBanner.style.display = 'none'; }, 2500);
  }
  // 把玩家移到新出生點
  const me = data.players?.find(p => p.id === state.myId);
  if (me && data.map?.spawnPoints) {
    const spawn = data.map.spawnPoints.find(s => s.team === me.team);
    if (spawn) {
      state.yaw = spawn.yaw;
      state.pitch = 0;
      smoothMyPosition(spawn.x, spawn.y, spawn.z);
    }
  }
  updateMatchUI();
});

socket.on('state', (data) => {
  // Server state — 30Hz
  if (data.code) state.roomCode = data.code;
  state.room = data;
  state.matchStartedAt = data.startedAt || state.matchStartedAt;
  updateMatchUI();
  syncRemotePlayers(data.players || []);
  syncBots(data.bots || []);
  // 自己的 state
  const me = (data.players || []).find(p => p.id === state.myId);
  if (me) {
    // 偵測 reload 開始
    if (me.reloading && !state.reloading) {
      state.reloadStartTime = performance.now();
    } else if (!me.reloading) {
      state.reloadStartTime = null;
    }
    state.health = me.health;
    state.alive = me.alive;
    state.weapon = me.weapon;
    state.ammo = me.ammo;
    state.reloading = me.reloading;
    state.kills = me.kills;
    state.deaths = me.deaths;
    state.name = me.name;
    // 視角 (用我的 yaw/pitch 推回 camera)
    state.yaw = me.yaw;
    state.pitch = me.pitch;
    // 平滑到 server 位置
    smoothMyPosition(me.x, me.y, me.z);
  }
});

socket.on('player_fired', (data) => {
  if (data.shooterId === state.myId) {
    // 自己開火 — 後座力 + 槍口閃光 + 對應武器音效
    weaponKick = 1;
    spawnLocalMuzzleFlash();
    // 播放武器音效
    if (data.weapon === 'nova') sfx.nova();
    else if (data.weapon === 'ak47') sfx.ak47();
    // 同步 server 端的彈藥數字 (確保 HUD 與 server 一致)
    if (state.ammo[data.weapon]) {
      state.ammo[data.weapon].mag = data.mag;
      state.ammo[data.weapon].reserve = data.reserve;
      state.reloading = data.reloading;
    }
  } else {
    // 別人開火 — 顯示 muzzle flash + 對應武器音效 (距離衰減)
    const rp = state.remotePlayers.get(data.shooterId);
    if (rp && rp.mesh) {
      spawnMuzzleFlash(rp.mesh.root, data.weapon);
    }
    if (data.weapon === 'nova') sfx.nova();
    else if (data.weapon === 'ak47') sfx.ak47();
  }
});

// 自己槍口的閃光 — 短暫亮光球
function spawnLocalMuzzleFlash() {
  if (!weaponGroup.children.length) return;
  const flash = new THREE.PointLight(0xffcc44, 4, 6);
  flash.position.set(0, 0.05, -1.0);
  weaponGroup.add(flash);
  setTimeout(() => {
    try { weaponGroup.remove(flash); flash.dispose?.(); } catch(_) {}
  }, 50);
}

socket.on('player_hit', (data) => {
  if (data.victimId === state.myId) {
    flashDamage();
    sfx.damage();
  } else if (data.attackerId === state.myId) {
    // 我打到別人 (玩家或 bot 都算)
    sfx.hit(data.headshot);
    showHitmarker(data.newHealth <= 0);
  }
  const rp = state.remotePlayers.get(data.victimId);
  if (rp && rp.mesh) {
    rp.mesh.torso.material.emissive.setHex(0xff0000);
    rp.mesh.torso.material.emissiveIntensity = 0.8;
    setTimeout(() => {
      rp.mesh.torso.material.emissive.setHex(0x000000);
      rp.mesh.torso.material.emissiveIntensity = 0;
    }, 80);
  }
});

socket.on('player_killed', (data) => {
  pushKillfeed(data.attackerName, data.victimName, data.weapon, data.attackerId === state.myId, data.victimId === state.myId);
  // 死亡動畫 (倒下)
  const victimMesh = state.remotePlayers.get(data.victimId)?.mesh ||
                     (data.victimId.startsWith('bot_') ? state.bots.get(data.victimId)?.mesh : null);
  if (victimMesh) {
    victimMesh.root.rotation.x = Math.PI / 2;
    victimMesh.root.position.y = 0.2;
    victimMesh.hpBar.visible = false;
    victimMesh.hpBarBg.visible = false;
  }
  if (data.victimId === state.myId) {
    showHitmarker(false);
    sfx.death();
  } else if (data.attackerId === state.myId) {
    showHitmarker(true);
    sfx.kill();
  }
});

socket.on('player_respawn', (data) => {
  const m = state.remotePlayers.get(data.id)?.mesh;
  if (m) {
    m.root.rotation.x = 0;
    m.root.position.y = 0;
    m.hpBar.visible = true;
    m.hpBarBg.visible = true;
  }
});

socket.on('match_end', (data) => {
  state.phase = 'ended';
  state.matchEndAt = Date.now();
  const winner = data.winner;
  const myTeam = (state.room.players || []).find(p => p.id === state.myId)?.team;
  const iWon = winner === myTeam;
  controls.unlock();
  if (dom.btnChangeMap) dom.btnChangeMap.style.display = 'none';
  if (dom.mapChangePanel) dom.mapChangePanel.style.display = 'none';
  dom.overlay.classList.remove('hidden', 'win', 'lose');
  dom.overlay.classList.add(iWon ? 'win' : 'lose');
  dom.overlayTitle.textContent = iWon ? 'VICTORY' : 'DEFEAT';
  dom.overlayMsg.textContent = `T ${data.scores.T} : ${data.scores.CT} CT · 用時 ${data.duration} 秒`;
  if (iWon) sfx.victory(); else sfx.death();
});

socket.on('room_state', (data) => {
  // 重置後 server 重新送房間狀態
  if (state.phase === 'ended' && data.state === 'waiting') {
    state.phase = 'waiting';
    dom.overlay.classList.add('hidden');
    showLobbySection('waiting');
    dom.myRoomCode.textContent = data.code;
    renderPlayerList(data.players);
  }
});

socket.on('info', (data) => {
  pushSystemMsg(data.msg);
});

socket.on('chat', (data) => {
  pushChat(data.name, data.text, data.team);
});

// =====================================================
// 大廳邏輯
// =====================================================
function showLobbySection(which) {
  dom.lobbyConnecting.style.display = which === 'connecting' ? 'flex' : 'none';
  dom.lobbyMain.style.display = which === 'main' ? 'flex' : 'none';
  dom.lobbyWaiting.style.display = which === 'waiting' ? 'flex' : 'none';
}

function hideLobby() {
  dom.lobby.style.display = 'none';
}
function showLobby() {
  dom.lobby.style.display = 'flex';
}

function lobbyError(msg) {
  dom.lobbyError.textContent = msg;
  dom.lobbyError.style.opacity = '1';
  setTimeout(() => { dom.lobbyError.style.opacity = '0'; }, 3000);
}

dom.btnCreate?.addEventListener('click', () => {
  sfx.init(); sfx.resume(); sfx.click();
  const name = dom.playerName.value.trim() || 'Player';
  socket.emit('create_room', { name, mode: 'tdm' }, (res) => {
    if (!res?.ok) lobbyError(res?.error || '建立失敗');
  });
});

dom.btnCreatePk?.addEventListener('click', () => {
  sfx.init(); sfx.resume(); sfx.click();
  const name = dom.playerName.value.trim() || 'Player';
  const mapIndex = (typeof state._pickedMapIdx === 'number') ? state._pickedMapIdx : 0;
  socket.emit('create_room', { name, mode: 'pk', mapIndex }, (res) => {
    if (!res?.ok) lobbyError(res?.error || '建立失敗');
  });
});

// Lobby 地圖選擇器邏輯
function initLobbyMapPicker() {
  const btns = document.querySelectorAll('.map-pick-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.click();
      btns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const idx = parseInt(btn.dataset.mapidx);
      state._pickedMapIdx = idx;  // -1 = 隨機, 0..4 = 指定
    });
  });
}
initLobbyMapPicker();

// =====================================================
// 遊戲中換地圖 (PK 模式,右上 🗺️ 按鈕)
// =====================================================
const PK_MAPS_CLIENT = [
  { id: 'dusty_duel',     name: 'Dusty Duel', subtitle: '沙漠黃昏',     color: '#c89060' },
  { id: 'ice_cave',       name: 'Ice Cave',   subtitle: '冰封洞窟',     color: '#b8d8e8' },
  { id: 'warehouse',      name: 'Warehouse',  subtitle: '廢棄倉庫',     color: '#5a5048' },
  { id: 'aztec_ruins',    name: 'Aztec Ruins',subtitle: '古神殿遺跡',   color: '#a07840' },
  { id: 'vertigo',        name: 'Vertigo',    subtitle: '摩天樓頂',     color: '#3a3a40' },
];

function populateMapChangePanel() {
  if (!dom.mcpGrid) return;
  dom.mcpGrid.innerHTML = '';
  const currentIdx = state.room?.mapIndex ?? 0;
  PK_MAPS_CLIENT.forEach((m, i) => {
    const btn = document.createElement('button');
    btn.className = 'mcp-btn' + (i === currentIdx ? ' current' : '');
    btn.style.setProperty('--swatch', m.color);
    btn.innerHTML = `
      <div class="mcp-swatch"></div>
      <div class="mcp-name">${m.name}</div>
      <div class="mcp-sub">${m.subtitle}</div>
      ${i === currentIdx ? '<div style="color:#66ff66;font-size:10px;margin-top:2px">目前</div>' : ''}
    `;
    btn.addEventListener('click', () => {
      sfx.click();
      socket.emit('change_map', { mapIndex: i }, (res) => {
        if (res?.ok) {
          dom.mapChangePanel.style.display = 'none';
          sfx.pickup();
        } else {
          console.warn('change_map error:', res?.error);
        }
      });
    });
    dom.mcpGrid.appendChild(btn);
  });
  // 隨機按鈕
  const randBtn = document.createElement('button');
  randBtn.className = 'mcp-btn mcp-random';
  randBtn.innerHTML = `
    <div class="mcp-swatch" style="background:linear-gradient(135deg,#ff6b35,#2196f3)"></div>
    <div class="mcp-name">🎲 隨機</div>
    <div class="mcp-sub">5 張隨機選</div>
  `;
  randBtn.addEventListener('click', () => {
    sfx.click();
    const i = Math.floor(Math.random() * PK_MAPS_CLIENT.length);
    socket.emit('change_map', { mapIndex: i }, (res) => {
      if (res?.ok) {
        dom.mapChangePanel.style.display = 'none';
        sfx.pickup();
      }
    });
  });
  dom.mcpGrid.appendChild(randBtn);
}

dom.btnChangeMap?.addEventListener('click', () => {
  sfx.click();
  populateMapChangePanel();
  dom.mapChangePanel.style.display = 'block';
});
dom.mcpClose?.addEventListener('click', () => {
  dom.mapChangePanel.style.display = 'none';
});
// M 鍵開啟換地圖面板,Esc 關閉
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && state.phase === 'playing' && state.mode === 'pk') {
    if (dom.mapChangePanel?.style.display === 'block') return;  // 已開就不重複觸發
    populateMapChangePanel();
    if (dom.mapChangePanel) dom.mapChangePanel.style.display = 'block';
  } else if (e.code === 'Escape' && dom.mapChangePanel?.style.display === 'block') {
    dom.mapChangePanel.style.display = 'none';
  }
});

dom.btnJoin?.addEventListener('click', () => {
  sfx.init(); sfx.resume(); sfx.click();
  const name = dom.playerName.value.trim() || 'Player';
  const code = dom.roomCodeInput.value.trim().toUpperCase();
  if (code.length !== 6) return lobbyError('請輸入 6 位房間代碼');
  socket.emit('join_room', { code, name }, (res) => {
    if (!res?.ok) lobbyError(res?.error || '加入失敗');
  });
});

dom.btnQuick?.addEventListener('click', () => {
  sfx.init(); sfx.resume(); sfx.click();
  const name = dom.playerName.value.trim() || 'Player';
  socket.emit('quick_play', { name }, (res) => {
    if (!res?.ok) lobbyError(res?.error || '配對失敗');
  });
});

dom.roomCodeInput?.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') dom.btnJoin.click();
});

dom.playerName?.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') dom.btnQuick.click();
});

function renderPlayerList(players) {
  if (!dom.playerList) return;
  dom.playerList.innerHTML = '';
  for (const p of players) {
    const div = document.createElement('div');
    div.className = `pl-item team-${p.team.toLowerCase()}`;
    div.textContent = `${p.team === 'T' ? 'T' : 'CT'} · ${p.name} (${p.kills || 0}K/${p.deaths || 0}D)`;
    dom.playerList.appendChild(div);
  }
}

// 等待時間計時
setInterval(() => {
  if (state.waitingForMatch) {
    state.waitTimer++;
    dom.waitTimer.textContent = state.waitTimer;
    // 10 秒自動加 bot
    if (state.waitTimer === 10) {
      pushSystemMsg('無對手,系統將自動加入 AI...');
    }
  } else {
    state.waitTimer = 0;
  }
}, 1000);

// =====================================================
// 玩家控制 (PointerLock + 鍵盤 + 滑鼠輸入送到 server)
// =====================================================
const controls = new PointerLockControls(camera, document.body);

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyW') state.keys.w = true;
  if (e.code === 'KeyA') state.keys.a = true;
  if (e.code === 'KeyS') state.keys.s = true;
  if (e.code === 'KeyD') state.keys.d = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.keys.shift = true;
  if (e.code === 'KeyR') {
    state.reloadPressed = true;
    sfx.reload();  // 換彈音效 (使用者按下 R 時立即播放,不等 server 回應)
  }
  if (e.code === 'Digit1') state.weaponSwitchTo = 'nova';
  if (e.code === 'Digit2') state.weaponSwitchTo = 'ak47';
  if (e.code === 'KeyM') toggleMute();
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW') state.keys.w = false;
  if (e.code === 'KeyA') state.keys.a = false;
  if (e.code === 'KeyS') state.keys.s = false;
  if (e.code === 'KeyD') state.keys.d = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.keys.shift = false;
});

dom.startBtn?.addEventListener('click', () => {
  sfx.init(); sfx.resume(); sfx.click();
  controls.lock();
});
dom.resumeBtn?.addEventListener('click', () => {
  sfx.init(); sfx.resume(); sfx.click();
  controls.lock();
});

controls.addEventListener('lock', () => {
  dom.startScreen.style.display = 'none';
  dom.overlay.classList.add('hidden');
});
controls.addEventListener('unlock', () => {
  if (state.phase === 'playing' || state.phase === 'ended') {
    dom.overlay.classList.remove('hidden', 'win', 'lose');
    if (state.phase === 'playing') {
      dom.overlayTitle.textContent = 'PAUSED';
      dom.overlayMsg.textContent = '按 Esc / 點擊繼續 回到遊戲';
    }
  }
});

// =====================================================
// 靜音切換
// =====================================================
function toggleMute() {
  sfx.init();
  const muted = sfx.toggleMute();
  if (dom.muteBtn) {
    dom.muteBtn.textContent = muted ? '🔇' : '🔊';
    dom.muteBtn.classList.toggle('muted', muted);
  }
}
dom.muteBtn?.addEventListener('click', () => {
  sfx.init(); sfx.resume();
  toggleMute();
});
let mouseDown = false;
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  sfx.init(); sfx.resume();  // 首次點擊初始化 audio (瀏覽器要求)
  // 點擊永遠接受 — 若 pointer lock 失效,自動重新鎖定 (讓使用者從 Esc/失焦恢復)
  mouseDown = true;
  if (state.phase === 'playing' && state.alive && !controls.isLocked) {
    try { controls.lock(); } catch (_) {}
  }
});
document.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  mouseDown = false;
});
// 防止瀏覽器右鍵選單干擾
document.addEventListener('contextmenu', (e) => e.preventDefault());

// =====================================================
// 滑鼠視角 — 本地立即反應,送給 server
// =====================================================
const PITCH_LIMIT = Math.PI / 2 - 0.01;
document.addEventListener('mousemove', (e) => {
  if (!controls.isLocked) return;
  // PointerLockControls 已經幫我們處理相機 yaw/pitch
  // 但我們要把值寫回 state.yaw/pitch 供伺服器參考
  state.yaw = camera.rotation.y;
  state.pitch = camera.rotation.x;
});

// =====================================================
// 平滑我的位置 (server-driven)
// =====================================================
function smoothMyPosition(x, y, z) {
  // Lerp 我的相機到 server 位置 (避免 jitter)
  const lerpFactor = 0.35;
  camera.position.x += (x - camera.position.x) * lerpFactor;
  camera.position.y += (y - camera.position.y) * lerpFactor;
  camera.position.z += (z - camera.position.z) * lerpFactor;
  camera.rotation.order = 'YXZ';
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;
}

// =====================================================
// 同步遠端玩家
// =====================================================
function syncRemotePlayers(serverPlayers) {
  const serverIds = new Set(serverPlayers.map(p => p.id));

  // 移除已離開的
  for (const [id, rp] of state.remotePlayers) {
    if (!serverIds.has(id)) {
      scene.remove(rp.mesh.root);
      rp.mesh.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      state.remotePlayers.delete(id);
    }
  }

  // 新增 / 更新
  for (const p of serverPlayers) {
    if (p.id === state.myId) continue; // 不渲染自己
    let rp = state.remotePlayers.get(p.id);
    if (!rp) {
      const mesh = makePlayerMesh(p.team);
      rp = { mesh, lastPos: null, walkPhase: 0 };
      state.remotePlayers.set(p.id, rp);
    }
    // 平滑插值位置
    rp.mesh.root.position.x = p.x;
    rp.mesh.root.position.y = p.y - PLAYER_VISUAL.height; // 角色腳在地面
    rp.mesh.root.position.z = p.z;
    rp.mesh.root.rotation.y = p.yaw;

    // 走路擺動
    const prev = rp.lastPos;
    const moving = prev && (Math.hypot(p.x - prev.x, p.z - prev.z) > 0.05);
    rp.lastPos = { x: p.x, z: p.z };
    if (moving) {
      rp.walkPhase += 0.3;
      rp.mesh.legL.rotation.x = Math.sin(rp.walkPhase) * 0.5;
      rp.mesh.legR.rotation.x = -Math.sin(rp.walkPhase) * 0.5;
    } else {
      rp.mesh.legL.rotation.x *= 0.8;
      rp.mesh.legR.rotation.x *= 0.8;
    }

    // 血條
    rp.mesh.hpBar.scale.x = Math.max(0, p.health / 100);
    rp.mesh.hpBar.visible = p.alive;
    rp.mesh.hpBarBg.visible = p.alive;
    rp.mesh.hpBar.lookAt(camera.position);
    rp.mesh.hpBarBg.lookAt(camera.position);

    // 名字標籤面對相機 (Sprite 自動)
    rp.mesh.nameLabel.lookAt(camera.position);

    // 死亡狀態
    if (!p.alive && rp.mesh.root.rotation.x < Math.PI / 4) {
      rp.mesh.root.rotation.x = Math.PI / 2;
      rp.mesh.root.position.y = 0.2;
    } else if (p.alive && rp.mesh.root.rotation.x > Math.PI / 4) {
      rp.mesh.root.rotation.x = 0;
      rp.mesh.root.position.y = 0;
    }
  }
}

function syncBots(serverBots) {
  const serverIds = new Set(serverBots.map(b => b.id));

  for (const [id, b] of state.bots) {
    if (!serverIds.has(id)) {
      scene.remove(b.mesh.root);
      b.mesh.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      state.bots.delete(id);
    }
  }

  for (const b of serverBots) {
    let existing = state.bots.get(b.id);
    if (!existing) {
      const mesh = makeBotMesh();
      existing = { mesh, walkPhase: b.walkPhase || 0, wasAlive: true };
      state.bots.set(b.id, existing);
    }

    // 死亡動畫: 倒下 + 不走路動畫
    if (!b.alive) {
      // 只在剛死亡那刻倒下,不要每 tick 覆寫
      if (existing.wasAlive) {
        existing.mesh.root.rotation.x = Math.PI / 2;
        existing.mesh.root.position.y = 0.2;
        existing.mesh.legL.rotation.x = 0;
        existing.mesh.legR.rotation.x = 0;
        existing.wasAlive = false;
      }
      existing.mesh.hpBar.visible = false;
      existing.mesh.hpBarBg.visible = false;
    } else {
      // 活著時同步位置與動畫
      existing.mesh.root.position.set(b.x, b.y, b.z);
      existing.mesh.root.rotation.x = 0;
      existing.mesh.root.rotation.y = b.yaw;
      existing.mesh.root.position.y = 0;

      existing.walkPhase = b.walkPhase || existing.walkPhase;
      existing.mesh.legL.rotation.x = Math.sin(existing.walkPhase) * 0.5;
      existing.mesh.legR.rotation.x = -Math.sin(existing.walkPhase) * 0.5;

      existing.mesh.hpBar.scale.x = Math.max(0, b.health / 80);
      existing.mesh.hpBar.visible = true;
      existing.mesh.hpBarBg.visible = true;
      existing.wasAlive = true;
    }

    existing.mesh.hpBar.lookAt(camera.position);
    existing.mesh.hpBarBg.lookAt(camera.position);
  }
}

// =====================================================
// 武器特效
// =====================================================
let weaponKick = 0;
const muzzleFlashes = [];

function spawnMuzzleFlash(parentGroup, weaponKey) {
  const flash = new THREE.PointLight(0xffcc44, 3, 8);
  const offset = new THREE.Vector3(0.3, 1.1, -0.5);
  offset.applyEuler(parentGroup.rotation);
  flash.position.copy(parentGroup.position).add(offset);
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 50);
}

// =====================================================
// HUD / UI 更新
// =====================================================
function updateHUD() {
  dom.health.textContent = Math.ceil(state.health);
  if (state.health <= 30) dom.health.classList.add('danger');
  else dom.health.classList.remove('danger');

  const ammo = state.ammo[state.weapon] || { mag: 0, reserve: 0 };
  dom.ammoCur.textContent = ammo.mag;
  dom.ammoRes.textContent = ammo.reserve;
  dom.weaponName.textContent = WEAPONS_VISUAL[state.weapon]?.name || '—';

  if (ammo.mag <= 3) dom.ammoCur.classList.add('low');
  else dom.ammoCur.classList.remove('low');

  dom.ammoCur.classList.remove('bump');
  void dom.ammoCur.offsetWidth;
  dom.ammoCur.classList.add('bump');
}

function updateMatchUI() {
  if (!state.room) return;
  const scores = state.room.scores || { T: 0, CT: 0 };
  if (dom.scoreT) dom.scoreT.textContent = scores.T;
  if (dom.scoreCT) dom.scoreCT.textContent = scores.CT;
  if (dom.matchTimer && state.matchStartedAt && state.phase === 'playing') {
    const sec = Math.floor((Date.now() - state.matchStartedAt) / 1000);
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    dom.matchTimer.textContent = `${mm}:${ss}`;
  }
  // PK 模式:顯示地圖資訊 + Session 分數
  if (state.room.mode === 'pk') {
    if (dom.mapInfo) dom.mapInfo.style.display = 'block';
    if (dom.mapName) dom.mapName.textContent = state.room.mapName || '';
    if (dom.mapSubtitle) dom.mapSubtitle.textContent = state.room.mapSubtitle || '';
    // 顯示「第 X/5 場」+ 總地圖數
    if (dom.mapCurrent) {
      const roundInMap = (state.room.roundInMap ?? 0) + 1;
      const roundsPerMap = state.room.roundsPerMap || 5;
      dom.mapCurrent.textContent = `第${roundInMap}/${roundsPerMap}場`;
    }
    if (dom.mapTotal) dom.mapTotal.textContent = `地圖 ${(state.room.mapIndex ?? 0) + 1}/${state.room.mapTotal || 3}`;
    // 把 session 分數加到 scoreboard 下方
    if (dom.scoreT && state.room.sessionScores) {
      const sessionT = state.room.sessionScores.T || 0;
      const sessionCT = state.room.sessionScores.CT || 0;
      dom.scoreT.innerHTML = `${scores.T}<span style="font-size:10px;color:#888;display:block">S:${sessionT}</span>`;
      dom.scoreCT.innerHTML = `${scores.CT}<span style="font-size:10px;color:#888;display:block">S:${sessionCT}</span>`;
    }
  } else {
    if (dom.mapInfo) dom.mapInfo.style.display = 'none';
  }
}

function showHitmarker(kill) {
  dom.hitmarker.classList.add('show');
  if (kill) dom.hitmarker.classList.add('kill');
  clearTimeout(showHitmarker._t);
  showHitmarker._t = setTimeout(() => {
    dom.hitmarker.classList.remove('show', 'kill');
  }, 120);
}

function flashDamage() {
  dom.vignette.classList.add('flash');
  clearTimeout(flashDamage._t);
  flashDamage._t = setTimeout(() => dom.vignette.classList.remove('flash'), 120);
}

function pushKillfeed(killer, victim, weapon, iKilled, iDied) {
  const row = document.createElement('div');
  row.className = 'kill-row' + (iKilled ? ' i-killed' : '') + (iDied ? ' i-died' : '');
  row.innerHTML = `<span class="killer">${killer}</span> <span class="weapon">[${weapon}]</span> <span class="victim">${victim}</span>`;
  dom.killfeed.appendChild(row);
  setTimeout(() => row.remove(), 4100);
}

function pushSystemMsg(msg) {
  const row = document.createElement('div');
  row.className = 'kill-row system';
  row.textContent = 'ℹ ' + msg;
  dom.killfeed.appendChild(row);
  setTimeout(() => row.remove(), 5000);
}

function pushChat(name, text, team) {
  if (!dom.chatList) return;
  const row = document.createElement('div');
  row.className = `chat-row team-${(team || 'T').toLowerCase()}`;
  row.innerHTML = `<b>${name}:</b> ${text}`;
  dom.chatList.appendChild(row);
  dom.chatList.scrollTop = dom.chatList.scrollHeight;
  // 顯示 chat box
  dom.chatBox?.classList.add('visible');
  clearTimeout(pushChat._t);
  pushChat._t = setTimeout(() => dom.chatBox?.classList.remove('visible'), 4000);
}

// =====================================================
// 主迴圈
// =====================================================
const clock = new THREE.Clock();
let inputSendTimer = 0;
let lastEmptySound = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());

  // 武器切換 / 換彈
  if (state.weaponSwitchTo && state.weaponSwitchTo !== state.weapon && !state.reloading) {
    state.weapon = state.weaponSwitchTo;
    buildWeapon(state.weapon);
    updateHUD();
  }
  state.weaponSwitchTo = null;

  // 送輸入到 server (60Hz 本地 / 30Hz server 處理)
  inputSendTimer += dt;
  if (inputSendTimer >= 1 / 60) {
    inputSendTimer = 0;
    if (state.connected && state.phase === 'playing' && state.alive) {
      // 空彈匣偵測:按住滑鼠 + 子彈 0 + 沒在換彈 → 播 click,不送 fire=true
      const curAmmo = state.ammo[state.weapon];
      const isEmpty = mouseDown && curAmmo && curAmmo.mag === 0 && !state.reloading;
      if (isEmpty && performance.now() - lastEmptySound > 250) {
        sfx.empty();
        lastEmptySound = performance.now();
      }
      socket.emit('input', {
        yaw: state.yaw,
        pitch: state.pitch,
        keys: { ...state.keys },
        shift: state.keys.shift,
        fire: mouseDown && !isEmpty,
        reload: state.reloadPressed,
        weapon: state.weapon,
      });
    }
    state.reloadPressed = false;
  }

  // HUD 更新
  if (state.phase === 'playing' || state.phase === 'ended') {
    updateHUD();
    updateMatchUI();
  }

  // 武器動畫 (kick + sway + 換彈下沉)
  weaponKick *= Math.pow(0.001, dt);
  if (state.reloading) {
    weaponGroup.rotation.x = -0.6 * Math.sin(Math.PI * 4);
    weaponGroup.position.y = -0.42;
  } else {
    weaponGroup.rotation.x = -weaponKick * 0.15;
    weaponGroup.position.y = -0.32 - weaponKick * 0.05;
  }
  const t = performance.now() / 1000;

  // Reload 進度條 (HUD)
  if (state.reloading && state.reloadStartTime) {
    const w = window.WEAPONS_VISUAL?.[state.weapon];
    const reloadTime = w?.reloadTime || 2.0;
    const elapsed = (performance.now() - state.reloadStartTime) / 1000;
    const progress = Math.min(1, elapsed / reloadTime);
    if (dom.reloadBar) {
      dom.reloadBar.style.display = 'block';
      dom.reloadBarFill.style.width = (progress * 100) + '%';
    }
  } else if (dom.reloadBar) {
    dom.reloadBar.style.display = 'none';
  }

  // 低血量警告 (HP < 30 → 紅色脈動邊框 + 心跳聲)
  if (state.alive && state.health < 30 && state.health > 0) {
    if (!state.lowHpBeeping) {
      state.lowHpBeeping = true;
      // 每 0.6 秒播一次心跳
      const beatInterval = setInterval(() => {
        if (state.health > 30 || !state.alive) {
          clearInterval(beatInterval);
          state.lowHpBeeping = false;
          return;
        }
        sfx.damage();
      }, 600);
    }
    if (dom.vignette && !dom.vignette.classList.contains('lowhp')) {
      dom.vignette.classList.add('lowhp');
    }
  } else {
    if (state.lowHpBeeping) state.lowHpBeeping = false;
    if (dom.vignette) dom.vignette.classList.remove('lowhp');
  }
  const sway = (state.keys.a || state.keys.d) ? Math.sin(t * 8) * 0.005 : 0;
  weaponGroup.position.x = 0.28 + sway;
  if (state.keys.shift && (state.keys.w || state.keys.s || state.keys.a || state.keys.d)) {
    weaponGroup.position.y -= Math.abs(Math.sin(t * 12)) * 0.02;
  }

  renderer.render(scene, camera);
}

// 視窗縮放
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// =====================================================
// 啟動
// =====================================================
buildWeapon('nova');
showLobby();
showLobbySection('connecting');
animate();

// 暴露給 console debug
window.__game = { state, scene, camera, socket, sfx, WEAPONS_VISUAL };

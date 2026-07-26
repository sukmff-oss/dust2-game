# DUST II — Mini CS2 (Multiplayer)

> 🎮 致敬 CS2 Dust II 的瀏覽器 3D 第一人稱射擊,**支援多人對戰 + AI 補位**。

![Made with Three.js](https://img.shields.io/badge/Three.js-r160-orange)
![Socket.io](https://img.shields.io/badge/Socket.io-4.7-black)
![Node](https://img.shields.io/badge/Node-18%2B-green)
![MIT](https://img.shields.io/badge/license-MIT-blue)

---

## 🚀 快速啟動

### 安裝
```bash
cd D:\AI\projects\dust2-fps
npm install
```

### 啟動伺服器
```bash
npm start
# 或直接
node server.js
```

伺服器開在 `http://localhost:3000`,同時:
- **服務靜態檔案** (`index.html`, `game.js`, `style.css`)
- **跑 Socket.io** WebSocket 伺服器 (real-time 多人)

開瀏覽器 → `http://localhost:3000` → 看到大廳 → 開打!

### 健康檢查
```bash
curl http://localhost:3000/api/health
# → {"ok":true,"rooms":N,"players":N,"uptime":N}
```

---

## 🎯 遊戲流程

### 1. 連線大廳
開啟瀏覽器後看到三個選項:
- **🏠 創建房間** — 拿到 6 位代碼,給朋友加入
- **⚡ 快速對戰** — 自動配對等待中的玩家,或開新房排隊
- **輸入代碼 → 加入** — 朋友告訴你代碼後輸入加入

### 2. 等待 / 配對
房間畫面會顯示:
- 房間代碼(大字,可複製)
- 等待秒數計時
- 目前玩家列表(T 隊黃色 / CT 隊藍色)
- 10 秒後若無對手,自動加入 AI bot 開打

### 3. 比賽開始
伺服器廣播 `match_start` 事件,客戶端切換到遊戲畫面:
- 按「點擊開始」鎖定滑鼠(PointerLock)
- 出場作戰!3 隻 Bot 會主動衝過來

### 4. 死亡 / 重生 / 結束
- 死亡 3 秒後自動重生
- 一隊先達 10 殺 → Victory / Defeat
- 6 秒後自動 reset,新一輪

---

## 🗺️ 操作

| 按鍵 | 功能 |
|---|---|
| **WASD** | 移動 |
| **滑鼠** | 視角 (PointerLock) |
| **左鍵** | 開火 |
| **R** | 換彈 |
| **1** | Nova 霰彈槍 |
| **2** | AK-47 |
| **Shift** | 奔跑 |
| **Esc** | 暫停 / 解除鎖定 |

---

## 🏗️ 架構 (Server-Authoritative)

```
┌──────────────┐                    ┌──────────────────┐
│  Browser 1   │  Socket.io         │                  │
│ (Three.js)   │ ◀═══════════════▶ │  Node.js Server  │
├──────────────┤   WebSocket        │  - Express       │
│  Browser 2   │                    │  - Socket.io     │
│ (Three.js)   │ ◀═══════════════▶ │  - 30Hz tick     │
├──────────────┤                    │  - Bot AI (FSM)  │
│  Browser N   │                    │  - 命中檢測       │
│              │                    │  - 房間管理       │
└──────────────┘                    └──────────────────┘
```

### Server 職責
- **房間管理** — `Map<roomCode, Room>` + 快速配對 queue
- **玩家狀態** — yaw/pitch/position/health/ammo/weapon
- **Bot AI** — patrol → chase → shoot 有限狀態機
- **命中檢測** — 伺服器端 ray-vs-AABB,防作弊
- **30Hz tick** — 廣播 state 給所有客戶端
- **自動重生** — 死亡 3s 後
- **回合制** — 先達 10 殺 → 結束 → 6s 後 reset

### Client 職責
- 純渲染(Three.js 場景、武器模型、HUD)
- 60Hz 送輸入到伺服器
- 平滑插值本地相機到 server 位置 (lerp 0.35)
- 接收 server state 渲染遠端玩家與 bots
- 純顯示 HUD(HP/彈藥/計分從 server 來)

### 為什麼 server-authoritative?
- **防作弊** — 客戶端無法竄改命中判定
- **簡化同步** — 伺服器是 single source of truth
- **低延遲容忍** — 客戶端只負責預測與渲染

---

## 🔫 武器

| 武器 | 彈匣 | 備彈 | 射速 | 特色 |
|---|---|---|---|---|
| Nova 霰彈槍 | 8 | 32 | 0.9s | 8 顆 pellet,近距離毀滅 |
| AK-47 | 30 | 90 | 0.1s | 高單發傷害,中距離精準 |

---

## 🤖 Bot AI

3 隻恐怖份子 (深咖衣服 + 紅頭巾),行為有限狀態機:
- **PATROL** — 在 7 個巡邏點之間移動
- **CHASE** — 看到玩家(距離 < 60m 且射線未被擋),衝向玩家
- **SHOOT** — 進入射程(35m),停下來瞄準射擊,有 5% 散佈

頭頂有血條,被擊倒會倒下,3 秒後自動重生(單人模式)。

---

## 🌐 朋友連線設定 (Cloudflare Tunnel)

預設朋友無法從 internet 連到 `localhost:3000`。用 Cloudflare Tunnel 開個臨時公開 URL:

### 安裝 cloudflared
下載: https://github.com/cloudflare/cloudflared/releases
選 `cloudflared-windows-amd64.exe`,改名 `cloudflared.exe` 放到 `C:\Windows\System32\` 或任何 PATH 目錄。

### 啟動臨時 tunnel
```bash
cloudflared tunnel --url http://localhost:3000
```

會印出類似:
```
https://random-words-here.trycloudflare.com
```

把這網址給朋友即可。不需註冊帳號,免費,臨時 URL 每次啟動會換。

---

## 🌐 朋友連線設定 (LocalTunnel,免安裝)

如果你不想裝 cloudflared:

```bash
npx localtunnel --port 3000
```

會印出 `https://xxx.loca.lt`。**第一次訪問會要求密碼**:
1. 查你的對外 IP: `curl https://api.ipify.org`
2. 在 localtunnel 密碼頁輸入這個 IP

---

## ☁️ 部署到 Render (24/7 公開)

### 前置
- GitHub 帳號
- Render 帳號 (https://render.com)

### 步驟
1. **推到 GitHub**
   ```bash
   cd D:\AI\projects\dust2-fps
   git init
   git add .
   git commit -m "DUST II multiplayer v0.2"
   # 接到你的 sukmff-oss org 倉庫
   ```

2. **Render 建立 Web Service**
   - 到 https://dashboard.render.com → New → Web Service
   - 連 GitHub repo
   - 設定:
     - **Build Command**: `npm install`
     - **Start Command**: `node server.js`
     - **Plan**: Free($0,15 分鐘無人就睡) / Starter $7/月(永遠醒著)

3. **環境變數**
   - `PORT` — Render 會自動設,不用手動
   - `NODE_VERSION` — 選 18 以上

4. **部署完成** 會拿到 `https://your-app.onrender.com`,直接給朋友

### ⚠️ Render Free 注意事項
- 15 分鐘沒人連會自動 sleep
- 有人連時需 ~30 秒喚醒,首次載入會慢
- WebSocket 支援 OK(Socket.io 走 WS upgrade)

---

## 📁 檔案結構

```
dust2-fps/
├── server.js         # Node + Express + Socket.io (~26 KB)
├── game.js           # Three.js + Socket.io client (~38 KB)
├── index.html        # DOM + 大廳 + HUD (~6 KB)
├── style.css         # 大廳/計分板/聊天樣式 (~14 KB)
├── package.json      # deps: express, socket.io
├── README.md         # 本檔
└── node_modules/
```

---

## 🐛 已知限制 / TODO

### v0.2.0 目前
- ✅ 房間 + 配對
- ✅ 1v1 PvP (Bot 補位)
- ✅ Server-authoritative hit detection
- ✅ 30Hz state sync
- ⚠️ 沒有客戶端預測 (input lag 30Hz 可能略頓)
- ⚠️ 沒有客戶端補間(interpolation) — 遠端玩家移動可能抖動
- ⚠️ 沒有換彈下沉/槍口火焰視覺特效
- ⚠️ 沒有音效

### 下一步可能升級
1. **客戶端預測 + 伺服器和解** (像 Source engine)
2. **客戶端插值** (lerp 100ms 緩衝)
3. **Web Audio 音效** (Howler.js)
4. **更多武器** (M4A1, AWP, Deagle, USP)
5. **裝飾系統** (彈殼、灰塵、腳印)
6. **真實 CS2 模式** (Bomb plant/defuse, 16 回合)

---

## 🔧 調試指令

### 伺服器日誌
```bash
# tail 即時日誌
tail -f server.log
```

事件代碼:
- `[+]` 玩家連線
- `[-]` 玩家斷線
- `[room] ABC123 created` 房間創建
- `[match] ABC123 started (2P + 0B)` 對戰開始
- `[match] ABC123 ended, winner T` 對戰結束
- `[quick] paired → XYZ` 快速配對成功

### 客戶端除錯
瀏覽器 Console 可以存取 `window.__game`:
```js
__game.state           // 完整狀態物件
__game.socket          // Socket.io 客戶端
__game.scene           // Three.js 場景 (debug 用)
__game.camera          // 玩家相機

// 模擬送輸入
__game.socket.emit('input', { yaw: 1.0, pitch: 0, keys: {w:true}, fire: false, weapon: 'nova' });

// 創建房間
__game.socket.emit('create_room', { name: 'DebugPlayer' }, res => console.log(res));

// 強制觸發 match
__game.socket.emit('quick_play', { name: 'DebugPlayer' });
```

### 健康監控
```bash
# 房間 / 玩家數
watch -n 1 'curl -s http://localhost:3000/api/health'
```

---

## 📜 License

MIT — 自由取用 / 修改 / 發布。

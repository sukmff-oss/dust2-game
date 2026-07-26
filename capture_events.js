// 直接從 browser 透過 socket.io 看收到的 map_changed 跟 state 廣播
// 這個會在 browser console 跑,但因為 module scope state,看不到 state.room
// 所以用 globalThis 看 events
const events = [];
window.__captureEvent = (name, data) => events.push({ name, t: Date.now(), summary: name === 'state' ? `idx=${data.mapIndex} r=${data.roundInMap}` : name === 'map_changed' ? `→${data.map?.name}(idx=${data.mapIndex})` : '' });

// 攔截 socket 監聽器 - 透過 on() 函數
const origSocket = window.socket;
if (origSocket) {
  ['match_start','map_winner','round_reset','map_changed','state'].forEach(evt => {
    origSocket.on(evt, (d) => window.__captureEvent(evt, d));
  });
  console.log('事件已攔截,事件數:0');
} else {
  console.log('socket not exposed');
}
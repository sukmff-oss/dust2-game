// 模擬第二個玩家加入 PK 房間
const { io } = require('socket.io-client');
const s = io('http://localhost:3000', { transports: ['websocket'] });
s.on('connect', () => {
  console.log('connected:', s.id);
  s.emit('join_room', { code: 'G7MF8C', name: 'BotTest' }, (r) => {
    console.log('join result:', JSON.stringify(r));
  });
});
s.on('match_start', (d) => {
  console.log('match_start:', JSON.stringify({
    mode: d.mode,
    map: d.map?.name,
    weapons: Object.keys(d.weapons || {}),
    players: d.players.length
  }));
});
s.on('map_changed', (d) => {
  console.log('map_changed:', d.map?.name, 'idx=', d.mapIndex);
});
s.on('map_winner', (d) => {
  console.log('map_winner:', d.winner, 'scores:', JSON.stringify(d.scores));
});
setTimeout(() => { s.disconnect(); process.exit(0); }, 12000);

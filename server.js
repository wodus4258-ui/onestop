const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

// ─── HTTP 서버 (Render 헬스체크 + UptimeRobot 슬립 방지용) ───
const httpServer = http.createServer((req, res) => {
  if (req.url === '/ping' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const wss = new WebSocket.Server({ server: httpServer });

// ─── 방 관리 ───
// rooms: { [roomCode]: { customer: ws | null, admin: ws | null } }
const rooms = {};

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.role = null;
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      return;
    }

    const { type } = msg;

    // ─── JOIN: 방 참여 ───
    if (type === 'join') {
      const { roomCode, role } = msg;
      if (!roomCode || !role || !['customer', 'admin'].includes(role)) {
        ws.send(JSON.stringify({ type: 'error', message: '잘못된 요청입니다.' }));
        return;
      }

      if (!rooms[roomCode]) rooms[roomCode] = { customer: null, admin: null };

      // 이미 같은 역할이 있으면 거부
      if (rooms[roomCode][role]) {
        ws.send(JSON.stringify({ type: 'error', message: '이미 같은 역할이 접속 중입니다. 잠시 후 다시 시도해주세요.' }));
        return;
      }

      rooms[roomCode][role] = ws;
      ws.roomCode = roomCode;
      ws.role = role;
      console.log(`[JOIN] ${roomCode} / ${role}`);

      const otherRole = role === 'customer' ? 'admin' : 'customer';
      if (rooms[roomCode][otherRole]) {
        rooms[roomCode][otherRole].send(JSON.stringify({ type: 'peer_joined', role }));
        ws.send(JSON.stringify({ type: 'peer_joined', role: otherRole }));
      } else {
        ws.send(JSON.stringify({ type: 'waiting' }));
      }
      return;
    }

    // ─── OFFER / ANSWER / ICE / BYE: 상대방에게 중계 ───
    if (['offer', 'answer', 'ice', 'bye'].includes(type)) {
      const room = rooms[ws.roomCode];
      if (!room) return;
      const otherRole = ws.role === 'customer' ? 'admin' : 'customer';
      const peer = room[otherRole];
      if (peer && peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify(msg));
      }
    }
  });

  // ─── 연결 종료 ───
  ws.on('close', () => {
    if (!ws.roomCode || !rooms[ws.roomCode]) return;
    const room = rooms[ws.roomCode];
    const otherRole = ws.role === 'customer' ? 'admin' : 'customer';
    const peer = room[otherRole];

    if (peer && peer.readyState === WebSocket.OPEN) {
      peer.send(JSON.stringify({ type: 'peer_left' }));
    }

    room[ws.role] = null;
    if (!room.customer && !room.admin) {
      delete rooms[ws.roomCode];
      console.log(`[ROOM CLOSED] ${ws.roomCode}`);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
});

// ─── Ping 주기 (좀비 연결 정리) ───
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

httpServer.listen(PORT, () => {
  console.log(`✅ Signal server running on port ${PORT}`);
});
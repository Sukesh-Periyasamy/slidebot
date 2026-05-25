import { io } from 'socket.io-client';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const DECK_ID = 'stress-test-deck';
const SLIDE_ID = 'slide-1';
const NUM_CLIENTS = 100;

console.log(`Starting stress test against ${API_URL} with ${NUM_CLIENTS} clients...`);

const clients = [];
let connected = 0;

for (let i = 0; i < NUM_CLIENTS; i++) {
  const socket = io(`${API_URL}/collaboration`, {
    transports: ['websocket'],
    auth: { token: `fake-token-${i}` } // Assuming auth bypass or mock in local/stress mode
  });

  socket.on('connect', () => {
    connected++;
    socket.emit('join_deck', { deckId: DECK_ID, slideId: SLIDE_ID }, () => {
       // joined
    });
  });

  clients.push(socket);
}

let tick = 0;
setInterval(() => {
  console.log(`Connected: ${connected}/${NUM_CLIENTS}`);
  
  // Every interval, simulate activity
  for (let i = 0; i < connected; i++) {
    const socket = clients[i];
    if (!socket.connected) continue;
    
    // 50% chance to move cursor
    if (Math.random() > 0.5) {
      socket.emit('cursor_move', {
        deckId: DECK_ID,
        sessionId: 'session-1',
        slideId: SLIDE_ID,
        position: { x: Math.random() * 1000, y: Math.random() * 1000 }
      });
    }
  }
  tick++;
  
  if (tick >= 60) { // 1 min run
    console.log('Stress test complete');
    process.exit(0);
  }
}, 1000);

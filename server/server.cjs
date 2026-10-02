const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.get('/', (req, res) => {
  res.send('Rummy Tiles WebSocket Server is Running!');
});

const rooms = {};

function createEmptyGrid() {
  return Array.from({ length: 8 }, () => Array(16).fill(null));
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_room', ({ playerName }) => {
    const roomCode = `ROOM-${Math.floor(1000 + Math.random() * 9000)}`;
    const newRoom = {
      code: roomCode,
      hostId: socket.id,
      players: [{ id: socket.id, name: playerName || 'Player 1' }],
      status: 'LOBBY',
      currentTurnIndex: 0,
      grid: createEmptyGrid(),
      rules: {
        initialMeldMode: 'CUMULATIVE_30',
        allowWrapAround: false,
        timerSetting: 'NO_TIMER',
        jokerSubstitutionMode: 'STRICT_REPLACE',
      },
    };

    rooms[roomCode] = newRoom;
    socket.join(roomCode);
    socket.emit('room_created', { room: newRoom });
  });

  socket.on('join_room', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (!room) {
      socket.emit('error_message', 'Room not found.');
      return;
    }
    if (room.status !== 'LOBBY') {
      socket.emit('error_message', 'Game already in progress.');
      return;
    }

    room.players.push({ id: socket.id, name: playerName || `Player ${room.players.length + 1}` });
    socket.join(roomCode);
    io.to(roomCode).emit('room_updated', room);
  });

  socket.on('update_lobby_settings', ({ roomCode, rules }) => {
    const room = rooms[roomCode];
    if (room && room.hostId === socket.id) {
      room.rules = rules;
      io.to(roomCode).emit('room_updated', room);
    }
  });

  socket.on('start_game', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.hostId === socket.id) {
      room.status = 'IN_GAME';
      room.currentTurnIndex = 0;
      room.grid = createEmptyGrid();
      io.to(roomCode).emit('game_started', room);
    }
  });

  socket.on('update_board_grid', ({ roomCode, grid }) => {
    const room = rooms[roomCode];
    if (room) {
      const activePlayer = room.players[room.currentTurnIndex];
      if (activePlayer && activePlayer.id === socket.id) {
        room.grid = grid;
        socket.to(roomCode).emit('board_grid_updated', { grid });
      }
    }
  });

  socket.on('pass_turn', ({ roomCode, grid }) => {
    const room = rooms[roomCode];
    if (room) {
      const activePlayer = room.players[room.currentTurnIndex];
      if (activePlayer && activePlayer.id === socket.id) {
        if (grid) room.grid = grid;
        room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
        io.to(roomCode).emit('turn_changed', {
          currentTurnIndex: room.currentTurnIndex,
          grid: room.grid,
        });
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
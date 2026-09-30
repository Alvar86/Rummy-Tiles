const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = {};

function generateRoomCode() {
  return 'ROOM-' + Math.floor(100 + Math.random() * 900);
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ playerName }) => {
    const code = generateRoomCode();
    const newRoom = {
      code,
      hostId: socket.id,
      players: [{ id: socket.id, name: playerName || 'Host' }],
      status: 'LOBBY',
      rules: {
        initialMeldMode: 'CUMULATIVE_30',
        allowWrapAround: false,
        timerSetting: 'NO_TIMER',
        jokerSubstitutionMode: 'STRICT_REPLACE'
      }
    };

    rooms[code] = newRoom;
    socket.join(code);
    socket.emit('room_created', { room: newRoom });
  });

  socket.on('join_room', ({ roomCode, playerName }) => {
    const cleanCode = roomCode ? roomCode.trim().toUpperCase() : '';
    const room = rooms[cleanCode];

    if (!room) {
      socket.emit('error_message', 'Room not found.');
      return;
    }

    if (room.status !== 'LOBBY') {
      socket.emit('error_message', 'Game has already started in this room.');
      return;
    }

    if (room.players.length >= 4) {
      socket.emit('error_message', 'Room is full.');
      return;
    }

    room.players.push({ id: socket.id, name: playerName || `Player ${room.players.length + 1}` });
    socket.join(cleanCode);

    socket.emit('room_created', { room });
    io.to(cleanCode).emit('room_updated', room);
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
      io.to(roomCode).emit('game_started', room);
    }
  });

  socket.on('update_board_grid', ({ roomCode, grid }) => {
    socket.to(roomCode).emit('board_grid_updated', { grid });
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        if (room.players.length === 0) {
          delete rooms[code];
        } else {
          if (room.hostId === socket.id) {
            room.hostId = room.players[0].id;
          }
          io.to(code).emit('room_updated', room);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Rummy Tiles server running on port ${PORT}`);
});
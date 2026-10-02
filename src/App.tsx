import { useEffect, useState, type DragEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  autoSortRack,
  DEFAULT_RULES,
  TILE_COLORS,
  type Board,
  type GameRulesConfig,
  type Rack,
  type Tile,
  type TileColor,
  validateBoard,
} from './engine';
import './App.css';

const GRID_ROWS = 8;
const GRID_COLS = 16;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://rummy-tiles.onrender.com';

type BoardGrid = (Tile | null)[][];

interface Snapshot {
  rack: Rack;
  grid: BoardGrid;
  boardMelds: Board;
}

interface RoomData {
  code: string;
  hostId: string;
  players: { id: string; name: string }[];
  status: 'LOBBY' | 'IN_GAME';
  rules: GameRulesConfig;
  currentTurnIndex: number;
  grid?: BoardGrid;
}

function createEmptyGrid(): BoardGrid {
  return Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));
}

function createShuffledPool(prefix = 'p0'): Tile[] {
  const pool: Tile[] = [];
  let uniqueCounter = 0;

  for (let copy = 0; copy < 2; copy += 1) {
    for (const color of TILE_COLORS) {
      for (let number = 1; number <= 13; number += 1) {
        uniqueCounter += 1;
        pool.push({
          id: `${prefix}-color-${number}-copy-uid${uniqueCounter}`,
          number,
          color,
          isJoker: false,
        });
      }
    }
  }

  uniqueCounter += 1;
  pool.push({ id: `${prefix}-joker-0-uid${uniqueCounter}`, number: 1, color: 'black', isJoker: true });
  uniqueCounter += 1;
  pool.push({ id: `${prefix}-joker-1-uid${uniqueCounter}`, number: 1, color: 'black', isJoker: true });

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool;
}

function extractBoardMeldsFromGrid(grid: BoardGrid): Board {
  const melds: Board = [];
  for (let r = 0; r < grid.length; r += 1) {
    let currentMeld: Tile[] = [];
    for (let c = 0; c < grid[r].length; c += 1) {
      const cell = grid[r][c];
      if (cell) {
        currentMeld.push(cell);
      } else {
        if (currentMeld.length > 0) {
          melds.push(currentMeld);
          currentMeld = [];
        }
      }
    }
    if (currentMeld.length > 0) {
      melds.push(currentMeld);
    }
  }
  return melds;
}

function tileLabel(tile: Tile): string {
  return tile.isJoker ? 'J' : String(tile.number);
}

function tileColorClass(color: TileColor): string {
  return `tile tile--${color}`;
}

export default function App() {
  const [screen, setScreen] = useState<'MENU' | 'SANDBOX' | 'LOBBY' | 'ONLINE_GAME'>('MENU');

  // Socket state
  const [socket, setSocket] = useState<Socket | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [room, setRoom] = useState<RoomData | null>(null);

  // Settings State
  const [activeRules, setActiveRules] = useState<GameRulesConfig>(DEFAULT_RULES);
  const [pendingRules, setPendingRules] = useState<GameRulesConfig>(DEFAULT_RULES);

  // Gameplay State
  const [pool, setPool] = useState<Tile[]>([]);
  const [rack, setRack] = useState<Rack>([]);
  const [grid, setGrid] = useState<BoardGrid>(createEmptyGrid);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastDrawnId, setLastDrawnId] = useState<string | null>(null);
  const [message, setMessage] = useState('Your turn is active. Move tiles or draw a tile to pass.');
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success'>('info');
  const [hasInitialMeld, setHasInitialMeld] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    rack: [],
    grid: createEmptyGrid(),
    boardMelds: [],
  });

  const isSandbox = screen === 'SANDBOX';
  const activePlayer = room?.players[room?.currentTurnIndex ?? 0];
  const isMyTurn = isSandbox || (socket && activePlayer && socket.id === activePlayer.id);

  // Socket initialization
  useEffect(() => {
    const s = io(SOCKET_URL);
    setSocket(s);

    s.on('room_created', ({ room }: { room: RoomData }) => {
      setRoom(room);
      setActiveRules(room.rules);
      setPendingRules(room.rules);
      setScreen('LOBBY');
    });

    s.on('room_updated', (updatedRoom: RoomData) => {
      setRoom(updatedRoom);
      setActiveRules(updatedRoom.rules);
      setPendingRules(updatedRoom.rules);
    });

    s.on('game_started', (roomData: RoomData) => {
      setRoom(roomData);
      const playerIdx = roomData.players.findIndex((p) => p.id === s.id);
      startFreshGame(roomData.rules, playerIdx >= 0 ? playerIdx : 0);
      setScreen('ONLINE_GAME');
    });

    s.on('board_grid_updated', ({ grid }: { grid: BoardGrid }) => {
      setGrid(grid);
    });

    s.on('turn_changed', ({ currentTurnIndex, grid }: { currentTurnIndex: number; grid: BoardGrid }) => {
      setRoom((prev) => (prev ? { ...prev, currentTurnIndex } : null));
      setGrid(grid);
      setSnapshot((prev) => ({
        rack: prev.rack,
        grid: JSON.parse(JSON.stringify(grid)),
        boardMelds: extractBoardMeldsFromGrid(grid),
      }));
      setSelectedId(null);
    });

    s.on('error_message', (msg: string) => {
      alert(msg);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Update status feedback message when turn changes in Online Game
  useEffect(() => {
    if (screen === 'ONLINE_GAME' && room && activePlayer) {
      if (isMyTurn) {
        setFeedback('It is your turn! Move tiles or draw a tile to pass.', 'info');
      } else {
        setFeedback(`Waiting for ${activePlayer.name}'s turn...`, 'info');
      }
    }
  }, [screen, room?.currentTurnIndex, room?.players, socket?.id]);

  // Keybind: Spacebar returns selected tile to rack
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code === 'Space' && selectedId && isMyTurn) {
        event.preventDefault();
        moveTileToRack(selectedId);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, rack, grid, isMyTurn]);

  function notifyActionTaken() {
    if (lastDrawnId) {
      setLastDrawnId(null);
    }
  }

  function setFeedback(msg: string, type: 'info' | 'error' | 'success') {
    setMessage(msg);
    setStatusType(type);
  }

  function startFreshGame(rulesToUse: GameRulesConfig = activeRules, playerIndex = 0) {
    setActiveRules(rulesToUse);
    const fullPool = createShuffledPool(`p${playerIndex}`);
    const initialRack = fullPool.slice(0, 14);
    const initialPool = fullPool.slice(14);
    const emptyGrid = createEmptyGrid();

    setPool(initialPool);
    setRack(initialRack);
    setGrid(emptyGrid);
    setSelectedId(null);
    setLastDrawnId(null);
    setHasInitialMeld(false);
    setSnapshot({
      rack: JSON.parse(JSON.stringify(initialRack)),
      grid: emptyGrid,
      boardMelds: [],
    });
    setFeedback('Game started! Move tiles or draw a tile to pass.', 'info');
  }

  function applySandboxRules() {
    setActiveRules({ ...pendingRules });
    setFeedback('Custom settings applied live to Sandbox mode!', 'success');
  }

  function createRoom() {
    if (!socket) return;
    if (!playerName.trim()) {
      alert('Please enter your name first.');
      return;
    }
    socket.emit('create_room', { playerName });
  }

  function joinRoom() {
    if (!socket) return;
    if (!playerName.trim()) {
      alert('Please enter your name first.');
      return;
    }
    if (!roomInput.trim()) {
      alert('Please enter a room code.');
      return;
    }
    socket.emit('join_room', { roomCode: roomInput, playerName });
  }

  function updateLobbyRules(newRules: GameRulesConfig) {
    setPendingRules(newRules);
    if (socket && room && socket.id === room.hostId) {
      socket.emit('update_lobby_settings', { roomCode: room.code, rules: newRules });
    }
  }

  function startOnlineGame() {
    if (socket && room) {
      socket.emit('start_game', { roomCode: room.code });
    }
  }

  function revertTurn() {
    if (!isMyTurn) return;
    notifyActionTaken();
    setRack(snapshot.rack);
    setGrid(snapshot.grid);
    setSelectedId(null);

    if (socket && room) {
      socket.emit('update_board_grid', { roomCode: room.code, grid: snapshot.grid });
    }

    setFeedback('Board and rack reset to start of turn snapshot.', 'info');
  }

  function drawTileAndPass() {
    if (!isMyTurn) return;
    notifyActionTaken();
    if (pool.length === 0) {
      setFeedback('Tile pool is empty! Cannot draw more tiles.', 'error');
      return;
    }
    const drawnTile = pool[0];
    const newPool = pool.slice(1);
    const targetGrid = snapshot.grid;
    const gridTileIds = new Set<string>();

    for (const row of targetGrid) {
      for (const cell of row) {
        if (cell) gridTileIds.add(cell.id);
      }
    }

    const restoredRackTiles: Tile[] = [...rack];
    for (const row of grid) {
      for (const cell of row) {
        if (cell && !gridTileIds.has(cell.id)) {
          restoredRackTiles.push(cell);
        }
      }
    }

    const finalRack = [...restoredRackTiles, drawnTile];
    setGrid(targetGrid);
    setRack(finalRack);
    setPool(newPool);
    setLastDrawnId(drawnTile.id);
    setSelectedId(null);

    const nextMelds = extractBoardMeldsFromGrid(targetGrid);
    setSnapshot({
      grid: JSON.parse(JSON.stringify(targetGrid)),
      rack: JSON.parse(JSON.stringify(finalRack)),
      boardMelds: JSON.parse(JSON.stringify(nextMelds)),
    });

    if (socket && room) {
      socket.emit('pass_turn', { roomCode: room.code, grid: targetGrid });
    }

    setFeedback(`You drew a tile (${tileLabel(drawnTile)} ${drawnTile.color}). Turn passed.`, 'info');
  }

  function calculateNewTilePoints(snapshotBoard: Board, currentBoard: Board): number {
    const originalTileIds = new Set(snapshotBoard.flatMap((m) => m.map((t) => t.id)));
    let totalPoints = 0;
    for (const meld of currentBoard) {
      for (const tile of meld) {
        if (!originalTileIds.has(tile.id)) {
          totalPoints += tile.isJoker ? 10 : tile.number;
        }
      }
    }
    return totalPoints;
  }

  function handleEndTurn() {
    if (!isMyTurn) return;
    notifyActionTaken();
    const currentMelds = extractBoardMeldsFromGrid(grid);
    const isValid = validateBoard(currentMelds, activeRules);

    if (!isValid) {
      setFeedback(
        'Invalid board! Ensure all horizontal tile runs or sets have 3+ valid tiles before ending your turn.',
        'error'
      );
      return;
    }

    if (!hasInitialMeld && activeRules.initialMeldMode === 'CUMULATIVE_30') {
      const pointsPlaced = calculateNewTilePoints(snapshot.boardMelds, currentMelds);
      if (pointsPlaced < 30) {
        setFeedback(
          `Initial meld requires 30+ points! You only placed ${pointsPlaced} points. Adjust your move or draw a tile.`,
          'error'
        );
        return;
      }
      setHasInitialMeld(true);
    }

    setSnapshot({
      rack: JSON.parse(JSON.stringify(rack)),
      grid: JSON.parse(JSON.stringify(grid)),
      boardMelds: JSON.parse(JSON.stringify(currentMelds)),
    });

    if (socket && room) {
      socket.emit('pass_turn', { roomCode: room.code, grid });
    }

    setSelectedId(null);
    setFeedback('Turn ended successfully!', 'success');
  }

  function moveTileToRack(tileId: string, targetRackIndex?: number) {
    if (!isMyTurn) return;
    notifyActionTaken();
    let tile: Tile | undefined = rack.find((t) => t.id === tileId);
    let fromGridPos: { r: number; c: number } | null = null;

    if (!tile) {
      for (let r = 0; r < grid.length; r += 1) {
        for (let c = 0; c < grid[r].length; c += 1) {
          if (grid[r][c]?.id === tileId) {
            tile = grid[r][c]!;
            fromGridPos = { r, c };
            break;
          }
        }
        if (tile) break;
      }
    }

    if (!tile) return;

    let newRack = [...rack];
    const newGrid = grid.map((row) => [...row]);

    if (fromGridPos) {
      newGrid[fromGridPos.r][fromGridPos.c] = null;
    } else {
      newRack = newRack.filter((t) => t.id !== tileId);
    }

    if (targetRackIndex !== undefined && targetRackIndex >= 0 && targetRackIndex <= newRack.length) {
      newRack.splice(targetRackIndex, 0, tile);
    } else {
      newRack.push(tile);
    }

    setRack(newRack);
    setGrid(newGrid);
    setSelectedId(null);

    if (socket && room) {
      socket.emit('update_board_grid', { roomCode: room.code, grid: newGrid });
    }
  }

  function moveTileToGridCell(tileId: string, targetR: number, targetC: number) {
    if (!isMyTurn) return;
    notifyActionTaken();
    let tile: Tile | undefined = rack.find((t) => t.id === tileId);
    let fromGridPos: { r: number; c: number } | null = null;

    if (!tile) {
      for (let r = 0; r < grid.length; r += 1) {
        for (let c = 0; c < grid[r].length; c += 1) {
          if (grid[r][c]?.id === tileId) {
            tile = grid[r][c]!;
            fromGridPos = { r, c };
            break;
          }
        }
        if (tile) break;
      }
    }

    if (!tile) return;

    if (fromGridPos && fromGridPos.r === targetR && fromGridPos.c === targetC) {
      setSelectedId(null);
      return;
    }

    let newRack = [...rack];
    const newGrid = grid.map((row) => [...row]);

    if (fromGridPos) {
      newGrid[fromGridPos.r][fromGridPos.c] = null;
    } else {
      newRack = newRack.filter((t) => t.id !== tileId);
    }

    const existingTile = newGrid[targetR][targetC];
    if (existingTile) {
      if (fromGridPos) {
        newGrid[fromGridPos.r][fromGridPos.c] = existingTile;
      } else {
        newRack.push(existingTile);
      }
    }

    newGrid[targetR][targetC] = tile;
    setRack(newRack);
    setGrid(newGrid);
    setSelectedId(null);

    if (socket && room) {
      socket.emit('update_board_grid', { roomCode: room.code, grid: newGrid });
    }
  }

  function onTileClick(tileId: string) {
    if (!isMyTurn) return;
    notifyActionTaken();
    setSelectedId((current) => (current === tileId ? null : tileId));
  }

  function onDragStart(event: DragEvent<HTMLButtonElement>, tileId: string) {
    if (!isMyTurn) return;
    notifyActionTaken();
    event.dataTransfer.setData('text/plain', tileId);
    event.dataTransfer.effectAllowed = 'move';
    setSelectedId(tileId);
  }

  function onDropRack(event: DragEvent<HTMLElement>, targetRackIndex?: number) {
    event.preventDefault();
    event.stopPropagation();
    if (!isMyTurn) return;
    const tileId = event.dataTransfer.getData('text/plain');
    if (tileId) moveTileToRack(tileId, targetRackIndex);
  }

  function onDropCell(event: DragEvent<HTMLElement>, r: number, c: number) {
    event.preventDefault();
    event.stopPropagation();
    if (!isMyTurn) return;
    const tileId = event.dataTransfer.getData('text/plain');
    if (tileId) moveTileToGridCell(tileId, r, c);
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    if (!isMyTurn) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  // --- SCREEN RENDERS ---

  if (screen === 'MENU') {
    return (
      <main className="sandbox menu-screen">
        <header className="sandbox__header">
          <h1>Rummy Tiles</h1>
          <p>Select an option to play</p>
        </header>
        <section className="menu-actions">
          <input
            type="text"
            placeholder="Your Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
          />
          <button
            type="button"
            className="btn-large btn-primary"
            onClick={() => {
              startFreshGame();
              setScreen('SANDBOX');
            }}
          >
            Single Player Practice / Sandbox
          </button>
          <button type="button" className="btn-large btn-success" onClick={createRoom}>
            Create Online Room
          </button>
          <div className="join-row">
            <input
              type="text"
              placeholder="Room Code (e.g. ROOM-402)"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
            />
            <button type="button" className="btn-large btn-secondary" onClick={joinRoom}>
              Join
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'LOBBY' && room) {
    const isHost = socket?.id === room.hostId;
    return (
      <main className="sandbox lobby-screen">
        <header className="sandbox__header">
          <h1>Lobby: {room.code}</h1>
          <p>{isHost ? 'You are the Host. Adjust settings and start when ready.' : 'Waiting for host to start...'}</p>
        </header>
        <div className="lobby-card">
          <h3>Players in Room</h3>
          <ul className="player-list">
            {room.players.map((p) => (
              <li key={p.id}>
                {p.name} {p.id === room.hostId ? ' (Host)' : ''}
              </li>
            ))}
          </ul>
          <h3>Game Settings</h3>
          {isHost ? (
            <div className="rules-grid">
              <label>
                Initial Meld Mode:
                <select
                  value={pendingRules.initialMeldMode}
                  onChange={(e) =>
                    updateLobbyRules({
                      ...pendingRules,
                      initialMeldMode: e.target.value as 'CUMULATIVE_30' | 'SINGLE_SET',
                    })
                  }
                >
                  <option value="CUMULATIVE_30">30 Points Minimum</option>
                  <option value="SINGLE_SET">Single Set Allowed</option>
                </select>
              </label>
              <label>
                Wrap-Around (13 connects to 1):
                <input
                  type="checkbox"
                  checked={pendingRules.allowWrapAround}
                  onChange={(e) => updateLobbyRules({ ...pendingRules, allowWrapAround: e.target.checked })}
                />
              </label>
              <label>
                Timer Mode:
                <select
                  value={pendingRules.timerSetting}
                  onChange={(e) =>
                    updateLobbyRules({
                      ...pendingRules,
                      timerSetting: e.target.value as 'NO_TIMER' | 'FIXED_PER_TURN' | 'CHESS_CLOCK',
                    })
                  }
                >
                  <option value="NO_TIMER">No Timer</option>
                  <option value="FIXED_PER_TURN">60s Per Turn</option>
                  <option value="CHESS_CLOCK">Chess Clock</option>
                </select>
              </label>
              <label>
                Joker Mode:
                <select
                  value={pendingRules.jokerSubstitutionMode}
                  onChange={(e) =>
                    updateLobbyRules({
                      ...pendingRules,
                      jokerSubstitutionMode: e.target.value as 'STRICT_REPLACE' | 'FREE_MOVE',
                    })
                  }
                >
                  <option value="STRICT_REPLACE">Strict Tile Replace (Official)</option>
                  <option value="FREE_MOVE">Free Move Anywhere</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="read-only-rules">
              <p>• Initial Meld: <strong>{room.rules.initialMeldMode}</strong></p>
              <p>• Wrap-Around: <strong>{room.rules.allowWrapAround ? 'Enabled' : 'Disabled'}</strong></p>
              <p>• Timer: <strong>{room.rules.timerSetting}</strong></p>
              <p>• Joker Mode: <strong>{room.rules.jokerSubstitutionMode}</strong></p>
            </div>
          )}
          {isHost && (
            <button type="button" className="btn-large btn-primary" onClick={startOnlineGame}>
              Start Game
            </button>
          )}
          <button type="button" className="btn-large btn-danger" onClick={() => setScreen('MENU')}>
            Leave Lobby
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="sandbox">
      <header className="sandbox__header">
        <div className="header-bar">
          <h1>{isSandbox ? 'Rummy Tiles (Sandbox)' : `Room ${room?.code}`}</h1>
          <button type="button" onClick={() => setScreen('MENU')}>
            ← Main Menu
          </button>
        </div>
        <p>
          Status: <strong>{hasInitialMeld ? 'Initial Meld Complete' : 'Initial Meld Pending (30 pts)'}</strong> | Turn: <strong>{isSandbox ? 'Sandbox (Free Play)' : activePlayer?.name}</strong> | Pool Tiles: <strong>{pool.length}</strong>
        </p>
      </header>

      <div className={`status-banner status-banner--${statusType}`} role="alert">
        {message}
      </div>

      <section className="sandbox__rules">
        <details>
          <summary><strong>Game Settings</strong></summary>
          {isSandbox ? (
            <div>
              <div className="rules-grid">
                <label>
                  Initial Meld Mode:
                  <select
                    value={pendingRules.initialMeldMode}
                    onChange={(e) =>
                      setPendingRules({
                        ...pendingRules,
                        initialMeldMode: e.target.value as 'CUMULATIVE_30' | 'SINGLE_SET',
                      })
                    }
                  >
                    <option value="CUMULATIVE_30">30 Points Minimum</option>
                    <option value="SINGLE_SET">Single Set Allowed</option>
                  </select>
                </label>
                <label>
                  Wrap-Around (13 connects to 1):
                  <input
                    type="checkbox"
                    checked={pendingRules.allowWrapAround}
                    onChange={(e) => setPendingRules({ ...pendingRules, allowWrapAround: e.target.checked })}
                  />
                </label>
                <label>
                  Timer Mode:
                  <select
                    value={pendingRules.timerSetting}
                    onChange={(e) =>
                      setPendingRules({
                        ...pendingRules,
                        timerSetting: e.target.value as 'NO_TIMER' | 'FIXED_PER_TURN' | 'CHESS_CLOCK',
                      })
                    }
                  >
                    <option value="NO_TIMER">No Timer</option>
                    <option value="FIXED_PER_TURN">60s Per Turn</option>
                    <option value="CHESS_CLOCK">Chess Clock</option>
                  </select>
                </label>
                <label>
                  Joker Mode:
                  <select
                    value={pendingRules.jokerSubstitutionMode}
                    onChange={(e) =>
                      setPendingRules({
                        ...pendingRules,
                        jokerSubstitutionMode: e.target.value as 'STRICT_REPLACE' | 'FREE_MOVE',
                      })
                    }
                  >
                    <option value="STRICT_REPLACE">Strict Tile Replace (Official)</option>
                    <option value="FREE_MOVE">Free Move Anywhere</option>
                  </select>
                </label>
              </div>
              <button type="button" className="btn-apply" onClick={applySandboxRules}>
                Apply Custom Settings Live
              </button>
            </div>
          ) : (
            <div className="read-only-rules" style={{ marginTop: '10px' }}>
              <p>• Settings are locked for this online game by the host.</p>
            </div>
          )}
        </details>
      </section>

      <section className="sandbox__board" aria-label="Board">
        <h2>Board Grid (Horizontal Melds)</h2>
        <div className="board-grid-container">
          {grid.map((row, r) => (
            <div key={`row-${r}`} className="board-row">
              {row.map((cellTile, c) => (
                <div
                  key={`cell-${r}-${c}`}
                  className={`board-cell ${cellTile ? 'board-cell--occupied' : ''}`}
                  onDragOver={allowDrop}
                  onDrop={(event) => onDropCell(event, r, c)}
                  onClick={() => {
                    if (selectedId && isMyTurn) {
                      moveTileToGridCell(selectedId, r, c);
                    }
                  }}
                >
                  {cellTile && (
                    <TileView
                      tile={cellTile}
                      selected={selectedId === cellTile.id}
                      isDrawn={lastDrawnId === cellTile.id}
                      disabled={!isMyTurn}
                      onClick={() => onTileClick(cellTile.id)}
                      onDragStart={(event) => onDragStart(event, cellTile.id)}
                      onDragOver={allowDrop}
                      onDrop={(event) => onDropCell(event, r, c)}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="sandbox__actions">
        <button type="button" className="btn-success" disabled={!isMyTurn} onClick={handleEndTurn}>
          End Turn
        </button>
        <button type="button" className="btn-secondary" disabled={!isMyTurn} onClick={drawTileAndPass}>
          Draw Tile & Pass
        </button>
        <button type="button" className="btn-danger" disabled={!isMyTurn} onClick={revertTurn}>
          Reset Turn
        </button>
        <button
          type="button"
          onClick={() => {
            notifyActionTaken();
            setRack(autoSortRack(rack, 'NUMBER'));
          }}
        >
          Sort by Number
        </button>
        <button
          type="button"
          onClick={() => {
            notifyActionTaken();
            setRack(autoSortRack(rack, 'COLOR'));
          }}
        >
          Sort by Color
        </button>
        {isSandbox && (
          <button
            type="button"
            className="btn-danger"
            style={{ marginLeft: 'auto' }}
            onClick={() => startFreshGame()}
          >
            Reset Whole Game
          </button>
        )}
      </section>

      <section className="sandbox__rack" aria-label="Rack">
        <h2>Your Rack ({rack.length} tiles)</h2>
        <div className="drop-zone drop-zone--rack" onDragOver={allowDrop} onDrop={(e) => onDropRack(e)}>
          <div className="rack-row">
            {rack.map((tile, idx) => (
              <div
                key={tile.id}
                className="rack-slot"
                onDragOver={allowDrop}
                onDrop={(event) => onDropRack(event, idx)}
              >
                <TileView
                  tile={tile}
                  selected={selectedId === tile.id}
                  isDrawn={lastDrawnId === tile.id}
                  disabled={!isMyTurn}
                  onClick={() => onTileClick(tile.id)}
                  onDragStart={(event) => onDragStart(event, tile.id)}
                  onDragOver={allowDrop}
                  onDrop={(event) => onDropRack(event, idx)}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function TileView({
  tile,
  selected,
  isDrawn,
  disabled,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  tile: Tile;
  selected: boolean;
  isDrawn?: boolean;
  disabled?: boolean;
  onClick: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  const classes = [
    tileColorClass(tile.color),
    tile.isJoker ? 'tile--joker' : '',
    selected ? 'tile--selected' : '',
    isDrawn ? 'tile--drawn' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      draggable={!disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onClick();
      }}
      onDragStart={(e) => {
        if (!disabled) onDragStart(e);
      }}
      onDragOver={onDragOver}
      onDrop={(event) => {
        event.stopPropagation();
        if (!disabled) onDrop(event);
      }}
      style={disabled ? { opacity: 0.8, cursor: 'not-allowed' } : undefined}
    >
      {tileLabel(tile)}
    </button>
  );
}
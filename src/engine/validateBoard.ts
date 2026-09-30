import type { Board, GameRulesConfig } from './types';
import { validateMeld } from './validateMeld';

/** True when every meld on the board is a legal Set or Run. An empty board is legal. */
export function validateBoard(board: Board, config: GameRulesConfig): boolean {
  return board.every((meld) => validateMeld(meld, config));
}

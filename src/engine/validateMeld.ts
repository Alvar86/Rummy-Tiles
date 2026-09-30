import {
  MAX_RANK,
  MAX_SET_SIZE,
  MIN_MELD_SIZE,
  MIN_RANK,
  RANK_COUNT,
} from './constants';
import type { GameRulesConfig, Meld, Tile } from './types';

/**
 * True when `meld` is a legal Set or Run under `config`.
 * Tile order is ignored; jokers fill any missing ranks/colors.
 *
 * Set: 3–4 tiles, same rank, distinct colors.
 * Run: 3–13 tiles, same color, consecutive ranks (optional 13→1 wrap).
 */
export function validateMeld(meld: Meld, config: GameRulesConfig): boolean {
  if (meld.length < MIN_MELD_SIZE) {
    return false;
  }
  return isLegalSet(meld) || isLegalRun(meld, config.allowWrapAround);
}

function naturals(meld: Meld): Tile[] {
  return meld.filter((tile) => !tile.isJoker);
}

function isLegalSet(meld: Meld): boolean {
  if (meld.length > MAX_SET_SIZE) {
    return false;
  }

  const tiles = naturals(meld);
  if (tiles.length === 0) {
    return true;
  }

  const rank = tiles[0].number;
  if (!isValidRank(rank) || tiles.some((tile) => tile.number !== rank)) {
    return false;
  }

  const colors = tiles.map((tile) => tile.color);
  return new Set(colors).size === colors.length;
}

function isLegalRun(meld: Meld, allowWrapAround: boolean): boolean {
  if (meld.length > RANK_COUNT) {
    return false;
  }

  const tiles = naturals(meld);
  if (tiles.length === 0) {
    return true;
  }

  const color = tiles[0].color;
  if (tiles.some((tile) => tile.color !== color)) {
    return false;
  }

  const ranks = tiles.map((tile) => tile.number);
  if (ranks.some((rank) => !isValidRank(rank))) {
    return false;
  }
  if (new Set(ranks).size !== ranks.length) {
    return false;
  }

  const span = allowWrapAround
    ? circularCoveringSpan(ranks)
    : Math.max(...ranks) - Math.min(...ranks) + 1;

  return span <= meld.length;
}

/**
 * Length of the shortest arc on a 13-rank circle that covers every given rank.
 * Extra jokers may extend that arc up to `meld.length` (capped at 13).
 */
function circularCoveringSpan(ranks: number[]): number {
  const sorted = [...ranks].sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 1) {
    return 1;
  }

  let maxGap = 0;
  for (let i = 0; i < count - 1; i += 1) {
    maxGap = Math.max(maxGap, sorted[i + 1] - sorted[i]);
  }
  maxGap = Math.max(maxGap, sorted[0] + RANK_COUNT - sorted[count - 1]);

  return RANK_COUNT - maxGap + 1;
}

function isValidRank(rank: number): boolean {
  return rank >= MIN_RANK && rank <= MAX_RANK;
}

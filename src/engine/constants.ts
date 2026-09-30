import type { GameRulesConfig, TileColor } from './types';

export const MIN_RANK = 1;
export const MAX_RANK = 13;
export const RANK_COUNT = 13;

export const MIN_MELD_SIZE = 3;
export const MAX_SET_SIZE = 4;

export const TILE_COLORS: readonly TileColor[] = [
  'red',
  'blue',
  'black',
  'yellow',
];

export const COLOR_SORT_ORDER: Record<TileColor, number> = {
  red: 0,
  blue: 1,
  black: 2,
  yellow: 3,
};

export const DEFAULT_RULES: GameRulesConfig = {
  allowWrapAround: false,
  initialMeldMode: 'CUMULATIVE_30',
  invalidTurnPenalty: 'AUTO_REVERT',
  timerSetting: 'NO_TIMER',
  jokerSubstitutionMode: 'STRICT_REPLACE',
};

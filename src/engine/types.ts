export type TileColor = 'red' | 'blue' | 'black' | 'yellow';

export interface Tile {
  id: string;
  /** Rank 1–13. Ignored when `isJoker` is true. */
  number: number;
  /** Suit color. Ignored when `isJoker` is true. */
  color: TileColor;
  isJoker: boolean;
}

/** A group on the table: a Set or a Run of 3+ tiles. */
export type Meld = Tile[];

/** A player's hand. */
export type Rack = Tile[];

/** All exposed melds. */
export type Board = Meld[];

export type InitialMeldMode = 'SINGLE_SET' | 'CUMULATIVE_30';
export type InvalidTurnPenalty = 'AUTO_REVERT' | 'PICKUP_LOOSE';
export type TimerSetting = 'NO_TIMER' | 'FIXED_PER_TURN' | 'CHESS_CLOCK';
export type JokerSubstitutionMode = 'STRICT_REPLACE' | 'FREE_MOVE';

export interface GameRulesConfig {
  /** When true, a same-color run may wrap 13 → 1. */
  allowWrapAround: boolean;
  initialMeldMode: InitialMeldMode;
  invalidTurnPenalty: InvalidTurnPenalty;
  timerSetting: TimerSetting;
  jokerSubstitutionMode: JokerSubstitutionMode;
}

export type RackSortBy = 'NUMBER' | 'COLOR';

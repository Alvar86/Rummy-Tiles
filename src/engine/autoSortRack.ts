import { COLOR_SORT_ORDER } from './constants';
import type { Rack, RackSortBy, Tile } from './types';

/**
 * Returns a new rack sorted ascending. Jokers are always placed last.
 * Does not mutate the input.
 *
 * NUMBER: rank, then color (red → blue → black → yellow).
 * COLOR: color, then rank.
 */
export function autoSortRack(rack: Rack, sortBy: RackSortBy): Tile[] {
  const sorted = [...rack];

  sorted.sort((a, b) => {
    if (a.isJoker !== b.isJoker) {
      return Number(a.isJoker) - Number(b.isJoker);
    }

    if (sortBy === 'NUMBER') {
      if (a.number !== b.number) {
        return a.number - b.number;
      }
      return COLOR_SORT_ORDER[a.color] - COLOR_SORT_ORDER[b.color];
    }

    if (a.color !== b.color) {
      return COLOR_SORT_ORDER[a.color] - COLOR_SORT_ORDER[b.color];
    }
    return a.number - b.number;
  });

  return sorted;
}

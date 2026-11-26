import { Board, hasUsefulMove, isSolved, toColors } from '../core/board';
import type { AnalyzeStatus } from './protocol';
import { encode, solve } from './solver';

/**
 * Can the player still win from here? 'dead' only when the search space was
 * exhausted without a solution, so we never cry wolf on a hard position.
 */
export function analyzeBoard(board: Board, maxNodes = 150_000): AnalyzeStatus {
  if (isSolved(board)) return 'solvable';
  if (!hasUsefulMove(board)) return 'dead';
  const res = solve(encode(toColors(board)), { maxNodes, weight: 3 });
  if (res.status === 'solved') return 'solvable';
  return res.status === 'unsolvable' ? 'dead' : 'unknown';
}

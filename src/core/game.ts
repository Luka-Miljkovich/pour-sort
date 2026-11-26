/**
 * Game session state and actions. Pure functions: every action returns a new
 * GameState so it can be saved verbatim after every move.
 */
import { applyPour, Board, cloneBoard, isSolved, revealAll } from './board';

export const UNDOS_PER_LEVEL = 5;

export interface GameState {
  level: number;
  /** board at level start (without the extra bottle) – used by restart */
  initial: Board;
  board: Board;
  /** previous boards, most recent last; at most `undosLeft` entries are kept */
  history: Board[];
  undosLeft: number;
  extraUsed: boolean;
  moves: number;
  won: boolean;
}

export function newGame(level: number, initial: Board): GameState {
  return {
    level,
    initial: cloneBoard(initial),
    board: cloneBoard(initial),
    history: [],
    undosLeft: UNDOS_PER_LEVEL,
    extraUsed: false,
    moves: 0,
    won: false,
  };
}

export interface PourResult {
  game: GameState;
  amount: number;
}

export function pour(g: GameState, s: number, d: number): PourResult {
  if (g.won) return { game: g, amount: 0 };
  const { board, amount } = applyPour(g.board, s, d);
  if (amount === 0) return { game: g, amount: 0 };
  // keep only as many snapshots as undos remain (slice(-0) would keep everything)
  const history = g.undosLeft > 0 ? [...g.history, g.board].slice(-g.undosLeft) : [];
  const won = isSolved(board);
  return {
    game: { ...g, board: won ? revealAll(board) : board, history, moves: g.moves + 1, won },
    amount,
  };
}

export function canUndo(g: GameState): boolean {
  return !g.won && g.undosLeft > 0 && g.history.length > 0;
}

export function undo(g: GameState): GameState {
  if (!canUndo(g)) return g;
  const history = g.history.slice(0, -1);
  return {
    ...g,
    board: g.history[g.history.length - 1],
    history,
    undosLeft: g.undosLeft - 1,
    moves: Math.max(0, g.moves - 1),
  };
}

/** Restart the level: original board, helpers refilled. */
export function restart(g: GameState): GameState {
  return newGame(g.level, g.initial);
}

export function canAddBottle(g: GameState): boolean {
  return !g.won && !g.extraUsed;
}

/** Adds one empty bottle (once per level). Also added to undo history so undo keeps it. */
export function addBottle(g: GameState): GameState {
  if (!canAddBottle(g)) return g;
  return {
    ...g,
    board: [...g.board, []],
    history: g.history.map((b) => [...b, []]),
    extraUsed: true,
  };
}

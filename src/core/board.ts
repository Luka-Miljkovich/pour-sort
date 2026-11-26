/**
 * Pure game rules. No DOM, no randomness.
 *
 * A bottle is an array of units, index 0 = bottom, last = top.
 * A unit is a color index plus an optional "hidden" flag (shown as "?"
 * until it reaches the top of its bottle).
 */

export const CAPACITY = 4;

export interface Unit {
  /** color index, 0-based */
  c: number;
  /** hidden layer – revealed when it becomes the top unit */
  h?: true;
}

export type Bottle = Unit[];
export type Board = Bottle[];

export function cloneBoard(board: Board): Board {
  return board.map((b) => b.map((u) => (u.h ? { c: u.c, h: true } : { c: u.c })));
}

export function topUnit(b: Bottle): Unit | undefined {
  return b[b.length - 1];
}

/** Number of same-coloured units at the top of a bottle (actual colour, hidden or not). */
export function topRun(b: Bottle): number {
  if (b.length === 0) return 0;
  const c = b[b.length - 1].c;
  let n = 0;
  for (let i = b.length - 1; i >= 0 && b[i].c === c; i--) n++;
  return n;
}

/** True if every unit in the bottle is the same colour (and it is non-empty). */
export function isUniform(b: Bottle): boolean {
  return b.length > 0 && topRun(b) === b.length;
}

/** A finished bottle: full and one colour. */
export function isComplete(b: Bottle): boolean {
  return b.length === CAPACITY && isUniform(b);
}

/**
 * How many units would move from `s` to `d`. 0 means the pour is illegal.
 * Rules: different bottles, source non-empty, target has space, and the target
 * is empty or its top colour matches. All matching top units move, as many as fit.
 */
export function pourAmount(board: Board, s: number, d: number): number {
  if (s === d) return 0;
  const src = board[s];
  const dst = board[d];
  if (!src || !dst || src.length === 0) return 0;
  const space = CAPACITY - dst.length;
  if (space <= 0) return 0;
  const t = topUnit(dst);
  if (t && t.c !== topUnit(src)!.c) return 0;
  return Math.min(topRun(src), space);
}

export function canPour(board: Board, s: number, d: number): boolean {
  return pourAmount(board, s, d) > 0;
}

/** Reveal the top unit of a bottle (hidden layers become visible at the top). */
function revealTop(b: Bottle): void {
  const t = topUnit(b);
  if (t && t.h) delete t.h;
}

/**
 * Apply a pour, returning a new board (input is not mutated) and the amount moved.
 * Moved units are always revealed, and the new top of the source is revealed.
 */
export function applyPour(board: Board, s: number, d: number): { board: Board; amount: number } {
  const amount = pourAmount(board, s, d);
  if (amount === 0) return { board, amount: 0 };
  const next = cloneBoard(board);
  const src = next[s];
  const dst = next[d];
  for (let i = 0; i < amount; i++) {
    const u = src.pop()!;
    dst.push({ c: u.c });
  }
  revealTop(src);
  return { board: next, amount };
}

/** Won when every bottle is empty or full of one colour. */
export function isSolved(board: Board): boolean {
  return board.every((b) => b.length === 0 || isComplete(b));
}

/**
 * A move is "useful" if it is legal and not pointless.
 * Pointless: pouring a bottle that is already a single colour into an empty
 * bottle (it only relocates the stack), or touching a completed bottle.
 */
export function isUsefulMove(board: Board, s: number, d: number): boolean {
  if (!canPour(board, s, d)) return false;
  const src = board[s];
  if (isComplete(src)) return false;
  if (board[d].length === 0 && isUniform(src)) return false;
  return true;
}

export function usefulMoves(board: Board): [number, number][] {
  const out: [number, number][] = [];
  for (let s = 0; s < board.length; s++)
    for (let d = 0; d < board.length; d++) if (isUsefulMove(board, s, d)) out.push([s, d]);
  return out;
}

export function hasUsefulMove(board: Board): boolean {
  for (let s = 0; s < board.length; s++)
    for (let d = 0; d < board.length; d++) if (isUsefulMove(board, s, d)) return true;
  return false;
}

/** Plain colour matrix (for the solver / hashing). */
export function toColors(board: Board): number[][] {
  return board.map((b) => b.map((u) => u.c));
}

export function fromColors(cols: number[][], hideBelowTop = false): Board {
  return cols.map((b) =>
    b.map((c, i) => (hideBelowTop && i < b.length - 1 ? { c, h: true as const } : { c })),
  );
}

export function revealAll(board: Board): Board {
  return board.map((b) => b.map((u) => ({ c: u.c })));
}

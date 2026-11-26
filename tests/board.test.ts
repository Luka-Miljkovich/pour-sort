import { describe, expect, it } from 'vitest';
import {
  applyPour,
  Board,
  canPour,
  fromColors,
  hasUsefulMove,
  isSolved,
  isUsefulMove,
  pourAmount,
} from '../src/core/board';

const B = (cols: number[][], hidden = false): Board => fromColors(cols, hidden);

describe('pour rules', () => {
  it('pours onto an empty bottle', () => {
    const b = B([[0, 1], []]);
    expect(pourAmount(b, 0, 1)).toBe(1);
  });

  it('pours onto a matching top colour', () => {
    expect(canPour(B([[0, 1], [2, 1]]), 0, 1)).toBe(true);
  });

  it('refuses a mismatched top colour', () => {
    expect(canPour(B([[0, 1], [2, 3]]), 0, 1)).toBe(false);
  });

  it('refuses a full target', () => {
    expect(canPour(B([[1], [2, 3, 0, 1]]), 0, 1)).toBe(false);
  });

  it('refuses an empty source and pouring into itself', () => {
    const b = B([[], [1]]);
    expect(canPour(b, 0, 1)).toBe(false);
    expect(canPour(b, 1, 1)).toBe(false);
  });

  it('moves all matching top units together', () => {
    const { board, amount } = applyPour(B([[0, 1, 1, 1], []]), 0, 1);
    expect(amount).toBe(3);
    expect(board[0].map((u) => u.c)).toEqual([0]);
    expect(board[1].map((u) => u.c)).toEqual([1, 1, 1]);
  });

  it('moves only as many as fit', () => {
    const { board, amount } = applyPour(B([[0, 1, 1, 1], [2, 3, 1]]), 0, 1);
    expect(amount).toBe(1);
    expect(board[0].map((u) => u.c)).toEqual([0, 1, 1]);
    expect(board[1].map((u) => u.c)).toEqual([2, 3, 1, 1]);
  });

  it('does not mutate the input board', () => {
    const b = B([[0, 1], []]);
    applyPour(b, 0, 1);
    expect(b[0].length).toBe(2);
  });

  it('illegal pour returns the same board and amount 0', () => {
    const b = B([[0], [1]]);
    const r = applyPour(b, 0, 1);
    expect(r.amount).toBe(0);
    expect(r.board).toBe(b);
  });
});

describe('hidden layers', () => {
  it('reveals the new top of the source after a pour', () => {
    const b = B([[0, 2, 1], []], true);
    expect(b[0][1].h).toBe(true);
    const { board } = applyPour(b, 0, 1);
    expect(board[0][1].h).toBeUndefined();
    expect(board[0][0].h).toBe(true);
  });

  it('hidden units of the same colour move together and arrive revealed', () => {
    const b = B([[0, 1, 1], []], true);
    const { board, amount } = applyPour(b, 0, 1);
    expect(amount).toBe(2);
    expect(board[1].every((u) => !u.h)).toBe(true);
  });
});

describe('win detection', () => {
  it('won when every bottle is empty or full of one colour', () => {
    expect(isSolved(B([[0, 0, 0, 0], [], [1, 1, 1, 1]]))).toBe(true);
  });
  it('not won with a partial single-colour bottle', () => {
    expect(isSolved(B([[0, 0, 0], [0], [1, 1, 1, 1]]))).toBe(false);
  });
  it('not won with mixed bottles', () => {
    expect(isSolved(B([[0, 0, 1, 1], [1, 1, 0, 0]]))).toBe(false);
  });
});

describe('useful moves', () => {
  it('moving a single-colour stack into an empty bottle is not useful', () => {
    expect(isUsefulMove(B([[0, 0], []]), 0, 1)).toBe(false);
  });
  it('detects when no useful moves remain', () => {
    expect(hasUsefulMove(B([[0, 1, 0, 1], [1, 0, 1, 0]]))).toBe(false);
    expect(hasUsefulMove(B([[0, 1, 0, 1], [1, 0, 1], []]))).toBe(true);
  });
});

describe('dead-end analysis', () => {
  it('reports dead when moves exist but no solution does', async () => {
    const { analyzeBoard } = await import('../src/gen/analyze');
    // only move: bottle 2 -> 3, after which nothing can move
    const b = B([[0, 1, 0, 1], [1, 0, 1, 0], [2, 3, 2, 3], [3, 2, 3]]);
    expect(hasUsefulMove(b)).toBe(true);
    expect(analyzeBoard(b)).toBe('dead');
  });
  it('reports solvable for a generated level', async () => {
    const { analyzeBoard } = await import('../src/gen/analyze');
    const { generateLevel } = await import('../src/gen/generator');
    expect(analyzeBoard(generateLevel(3).board)).toBe('solvable');
  });
});

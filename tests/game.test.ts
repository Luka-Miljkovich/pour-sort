import { describe, expect, it } from 'vitest';
import { fromColors } from '../src/core/board';
import { addBottle, canUndo, newGame, pour, restart, undo, UNDOS_PER_LEVEL } from '../src/core/game';

const start = () => newGame(3, fromColors([[0, 1, 0, 1], [1, 0, 1, 0], []]));

describe('game actions', () => {
  it('counts moves and records history', () => {
    const { game } = pour(start(), 0, 2);
    expect(game.moves).toBe(1);
    expect(game.history.length).toBe(1);
  });

  it('undo restores the previous board and uses an undo', () => {
    const g0 = start();
    const g1 = pour(g0, 0, 2).game;
    const g2 = undo(g1);
    expect(g2.board).toEqual(g0.board);
    expect(g2.undosLeft).toBe(UNDOS_PER_LEVEL - 1);
    expect(g2.moves).toBe(0);
  });

  it('allows at most 5 undos per level', () => {
    let g = newGame(1, fromColors([[1], [1], [0, 2]]));
    let used = 0;
    for (let i = 0; i < 8; i++) {
      g = pour(g, 0, 1).game;
      g = pour(g, 1, 0).game;
    }
    expect(g.moves).toBe(16);
    while (canUndo(g)) {
      g = undo(g);
      used++;
    }
    expect(used).toBe(5);
    expect(g.undosLeft).toBe(0);
    // with no undos left, history stays empty
    g = pour(g, 0, 1).game;
    expect(g.history.length).toBe(0);
  });

  it('extra bottle is added once and survives undo', () => {
    let g = pour(start(), 0, 2).game;
    g = addBottle(g);
    expect(g.board.length).toBe(4);
    expect(addBottle(g)).toBe(g);
    g = undo(g);
    expect(g.board.length).toBe(4);
  });

  it('restart resets board and helpers', () => {
    let g = addBottle(pour(start(), 0, 2).game);
    g = restart(g);
    expect(g.board).toEqual(g.initial);
    expect(g.extraUsed).toBe(false);
    expect(g.undosLeft).toBe(UNDOS_PER_LEVEL);
    expect(g.moves).toBe(0);
  });

  it('marks the game won and reveals everything', () => {
    const g = newGame(1, fromColors([[0, 0, 0], [1, 1, 1, 1], [0]], true));
    const { game } = pour(g, 2, 0);
    expect(game.won).toBe(true);
    expect(game.board.flat().some((u) => u.h)).toBe(false);
  });
});

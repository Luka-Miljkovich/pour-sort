import { describe, expect, it } from 'vitest';
import { applyPour, isSolved } from '../src/core/board';
import { generateLevel, levelSpec } from '../src/gen/generator';

describe('generator', () => {
  it('is deterministic for a level number', () => {
    expect(generateLevel(5).board).toEqual(generateLevel(5).board);
  });

  it('level 1 starts at 7 colours with 2 empty bottles', () => {
    const g = generateLevel(1);
    expect(g.spec.colors).toBe(7);
    expect(g.board.length).toBe(9);
    expect(g.board.filter((b) => b.length === 0).length).toBe(2);
  });

  it('caps at 12 colours and hides layers from level 40 on some levels', () => {
    expect(levelSpec(500).colors).toBe(12);
    expect(levelSpec(39).hidden).toBe(false);
    expect([40, 41, 42, 43].some((l) => levelSpec(l).hidden)).toBe(true);
  });

  it('the stored solution actually solves the level', () => {
    for (const n of [1, 40, 130]) {
      const g = generateLevel(n);
      let b = g.board;
      for (const [s, d] of g.solution) {
        const r = applyPour(b, s, d);
        expect(r.amount).toBeGreaterThan(0);
        b = r.board;
      }
      expect(isSolved(b)).toBe(true);
    }
  });
});

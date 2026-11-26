/**
 * Deterministic level generator.
 *
 * For a level number we derive a seed, deal several random candidate boards,
 * keep only those the solver proves solvable, score each by solver metrics
 * and pick the candidate at a target difficulty percentile that rises
 * through each colour tier.
 */
import { Board, CAPACITY, fromColors } from '../core/board';
import { levelSeed, mulberry32, shuffle } from '../core/rng';
import { applyMove, encode, genMoves, Move, solve, State } from './solver';

/** Bump only if you intentionally want every level to change. Saved games keep their own board. */
export const GENERATOR_VERSION = 1;

export interface LevelSpec {
  level: number;
  colors: number;
  empties: number;
  hidden: boolean;
  /** 0..1 – where in the candidate difficulty ranking to pick */
  percentile: number;
}

/** Colour tiers: [first level, colour count]. */
const TIERS: [number, number][] = [
  [1, 7],
  [16, 8],
  [36, 9],
  [61, 10],
  [91, 11],
  [126, 12],
];

export function levelSpec(level: number): LevelSpec {
  let ti = 0;
  for (let i = 0; i < TIERS.length; i++) if (level >= TIERS[i][0]) ti = i;
  const [start, colors] = TIERS[ti];
  const next = ti + 1 < TIERS.length ? TIERS[ti + 1][0] : start + 75;
  const t = Math.min(1, (level - start) / Math.max(1, next - 1 - start));
  // Within a tier the target climbs from ~35th to ~95th percentile.
  // In the last tier it keeps climbing slowly and then holds near the top.
  const percentile = 0.35 + 0.6 * t;
  // From level 40, roughly every third level has hidden layers.
  const hidden = level >= 40 && level % 3 === 1;
  return { level, colors, empties: 2, hidden, percentile };
}

export interface Metrics {
  /** moves in the solver's solution */
  solutionLength: number;
  /** share of alternative moves along the solution that lead to a dead end */
  deadEndRate: number;
  /** average number of useful moves available along the solution */
  branching: number;
  /** solver effort (expanded nodes) */
  nodes: number;
  /** combined difficulty score */
  score: number;
}

export interface GeneratedLevel {
  level: number;
  spec: LevelSpec;
  board: Board;
  solution: Move[];
  metrics: Metrics;
  generatorVersion: number;
}

const CANDIDATES = 10;
const SOLVE_BUDGET = 60_000;
const TRAP_BUDGET = 1500;

function deal(colors: number, empties: number, rnd: () => number): number[][] {
  for (;;) {
    const pool: number[] = [];
    for (let c = 0; c < colors; c++) for (let i = 0; i < CAPACITY; i++) pool.push(c);
    shuffle(pool, rnd);
    const bottles: number[][] = [];
    for (let b = 0; b < colors; b++) bottles.push(pool.slice(b * CAPACITY, (b + 1) * CAPACITY));
    // Reject deals with a bottle already done or with 3 of a kind stacked (too easy a start).
    const ok = bottles.every((b) => {
      let run = 1;
      for (let i = 1; i < b.length; i++) {
        run = b[i] === b[i - 1] ? run + 1 : 1;
        if (run >= 3) return false;
      }
      return true;
    });
    if (!ok) continue;
    for (let e = 0; e < empties; e++) bottles.push([]);
    return bottles;
  }
}

/**
 * Walks the solution and, at every position, tries each alternative useful
 * move. Returns the share of alternatives that lead to a dead end (the solver
 * cannot finish from there within a small budget) and the average branching.
 */
function trapStats(start: State, solution: Move[]): { deadEndRate: number; branching: number } {
  let st = start;
  let alts = 0;
  let traps = 0;
  let branches = 0;
  for (const m of solution) {
    const moves = genMoves(st);
    branches += moves.length;
    for (const a of moves) {
      if (a[0] === m[0] && a[1] === m[1]) continue;
      alts++;
      if (solve(applyMove(st, a), { maxNodes: TRAP_BUDGET, weight: 3 }).status !== 'solved') traps++;
    }
    st = applyMove(st, m);
  }
  return {
    deadEndRate: alts ? traps / alts : 0,
    branching: solution.length ? branches / solution.length : 0,
  };
}

export function scoreOf(m: Omit<Metrics, 'score'>): number {
  return m.solutionLength + 30 * m.deadEndRate + 0.8 * m.branching;
}

export function generateLevel(level: number, debug?: (m: Metrics) => void): GeneratedLevel {
  const spec = levelSpec(level);
  const rnd = mulberry32(levelSeed(level, GENERATOR_VERSION));
  const cands: { cols: number[][]; solution: Move[]; metrics: Metrics }[] = [];
  let attempts = 0;
  while (cands.length < CANDIDATES && attempts < 200) {
    attempts++;
    const cols = deal(spec.colors, spec.empties, rnd);
    const st = encode(cols);
    const res = solve(st, { maxNodes: SOLVE_BUDGET, weight: 1.5 });
    if (res.status !== 'solved') continue;
    const base = {
      solutionLength: res.moves.length,
      ...trapStats(st, res.moves),
      nodes: res.nodes,
    };
    const metrics = { ...base, score: scoreOf(base) };
    debug?.(metrics);
    cands.push({ cols, solution: res.moves, metrics });
  }
  if (cands.length === 0) throw new Error(`could not generate level ${level}`);
  cands.sort((a, b) => a.metrics.score - b.metrics.score);
  const pick = cands[Math.round(spec.percentile * (cands.length - 1))];
  return {
    level,
    spec,
    board: fromColors(pick.cols, spec.hidden),
    solution: pick.solution,
    metrics: pick.metrics,
    generatorVersion: GENERATOR_VERSION,
  };
}

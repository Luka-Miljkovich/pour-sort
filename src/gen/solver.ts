/**
 * Solver for pour-sort boards, working on a compact string encoding.
 * Each bottle is a string of colour chars (bottom -> top). Bottles are
 * interchangeable, so the visited-set key sorts them.
 *
 * Uses weighted A* with an admissible-ish heuristic (runs - colours) and
 * a deterministic node budget, so results never depend on timing.
 */
import { CAPACITY } from '../core/board';

export type Move = [number, number];
export type State = string[];

export interface SolveResult {
  status: 'solved' | 'unsolvable' | 'unknown';
  moves: Move[];
  nodes: number;
}

export function encode(cols: number[][]): State {
  return cols.map((b) => b.map((c) => String.fromCharCode(97 + c)).join(''));
}

export function decode(state: State): number[][] {
  return state.map((b) => Array.from(b, (ch) => ch.charCodeAt(0) - 97));
}

export function keyOf(state: State): string {
  return state.slice().sort().join('|');
}

function topRun(b: string): number {
  const n = b.length;
  if (n === 0) return 0;
  const c = b[n - 1];
  let k = 1;
  while (k < n && b[n - 1 - k] === c) k++;
  return k;
}

function runs(b: string): number {
  if (b.length === 0) return 0;
  let r = 1;
  for (let i = 1; i < b.length; i++) if (b[i] !== b[i - 1]) r++;
  return r;
}

export function isSolvedState(st: State): boolean {
  for (const b of st) {
    if (b.length === 0) continue;
    if (b.length !== CAPACITY || runs(b) !== 1) return false;
  }
  return true;
}

/** Heuristic: total runs minus number of colours (each colour ends as exactly one run). */
export function heuristic(st: State, nColors: number): number {
  let r = 0;
  for (const b of st) r += runs(b);
  return r - nColors;
}

/**
 * Legal, non-pointless moves with symmetry pruning (only one empty target is tried).
 */
export function genMoves(st: State): Move[] {
  const out: Move[] = [];
  for (let s = 0; s < st.length; s++) {
    const src = st[s];
    if (src.length === 0) continue;
    const run = topRun(src);
    if (run === CAPACITY) continue; // completed bottle
    const uniform = run === src.length;
    const top = src[src.length - 1];
    let triedEmpty = false;
    for (let d = 0; d < st.length; d++) {
      if (d === s) continue;
      const dst = st[d];
      if (dst.length === 0) {
        if (uniform || triedEmpty) continue;
        triedEmpty = true;
        out.push([s, d]);
      } else if (dst.length < CAPACITY && dst[dst.length - 1] === top) {
        out.push([s, d]);
      }
    }
  }
  return out;
}

export function applyMove(st: State, [s, d]: Move): State {
  const src = st[s];
  const dst = st[d];
  const amt = Math.min(topRun(src), CAPACITY - dst.length);
  const next = st.slice();
  next[s] = src.slice(0, src.length - amt);
  next[d] = dst + src.slice(src.length - amt);
  return next;
}

/** Minimal binary heap keyed by number. */
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k,
      v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] < key || (k[p] === key && v[p] <= val)) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.k,
      v = this.v;
    const top = v[0];
    const lk = k.pop()!;
    const lv = v.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && (k[c + 1] < k[c] || (k[c + 1] === k[c] && v[c + 1] < v[c]))) c++;
        if (k[c] > lk || (k[c] === lk && v[c] >= lv)) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

export interface SolveOptions {
  maxNodes?: number;
  /** heuristic weight; 1 = A* (shortest), higher = faster but longer solutions */
  weight?: number;
}

export function solve(start: State, opts: SolveOptions = {}): SolveResult {
  const maxNodes = opts.maxNodes ?? 200_000;
  const w = opts.weight ?? 2;
  const colors = new Set(start.join('')).size;

  if (isSolvedState(start)) return { status: 'solved', moves: [], nodes: 0 };

  const states: State[] = [start];
  const parent: number[] = [-1];
  const moveOf: (Move | null)[] = [null];
  const gOf: number[] = [0];
  const seen = new Map<string, number>([[keyOf(start), 0]]);
  const heap = new Heap();
  heap.push(w * heuristic(start, colors), 0);
  let expanded = 0;

  while (heap.size > 0) {
    const id = heap.pop();
    const st = states[id];
    const g = gOf[id];
    if (++expanded > maxNodes) return { status: 'unknown', moves: [], nodes: expanded };
    for (const m of genMoves(st)) {
      const nx = applyMove(st, m);
      const key = keyOf(nx);
      const prev = seen.get(key);
      if (prev !== undefined && gOf[prev] <= g + 1) continue;
      const nid = states.length;
      states.push(nx);
      parent.push(id);
      moveOf.push(m);
      gOf.push(g + 1);
      seen.set(key, nid);
      if (isSolvedState(nx)) {
        const moves: Move[] = [];
        for (let c = nid; parent[c] !== -1; c = parent[c]) moves.push(moveOf[c]!);
        moves.reverse();
        return { status: 'solved', moves, nodes: expanded };
      }
      heap.push(g + 1 + w * heuristic(nx, colors), nid);
    }
  }
  return { status: 'unsolvable', moves: [], nodes: expanded };
}

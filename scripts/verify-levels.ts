/**
 * Verifies levels 1..N (default 200):
 *  - every level is solvable: its solver solution is replayed with the real
 *    game rules (src/core/board.ts) and must end in a solved board
 *  - generation is deterministic (sampled)
 *  - difficulty trends upward: positive overall slope, positive rank
 *    correlation inside every colour tier, later levels harder than early ones
 *
 * Usage: npm run verify-levels [-- --to 200] [-- --csv levels.csv]
 */
import { writeFileSync } from 'node:fs';
import { applyPour, isSolved } from '../src/core/board';
import { generateLevel, GeneratedLevel } from '../src/gen/generator';

const args = process.argv.slice(2);
const argVal = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const TO = Number(argVal('--to') ?? 200);
const CSV = argVal('--csv');

const failures: string[] = [];
const rows: GeneratedLevel[] = [];
const t0 = Date.now();

for (let n = 1; n <= TO; n++) {
  const g = generateLevel(n);
  let b = g.board;
  for (const [s, d] of g.solution) {
    const r = applyPour(b, s, d);
    if (r.amount === 0) {
      failures.push(`level ${n}: illegal move ${s}->${d} in solution`);
      break;
    }
    b = r.board;
  }
  if (!isSolved(b)) failures.push(`level ${n}: solution does not solve the board`);
  const colors = new Set(g.board.flat().map((u) => u.c)).size;
  if (colors !== g.spec.colors) failures.push(`level ${n}: expected ${g.spec.colors} colours, got ${colors}`);
  if (n % 10 === 0 && JSON.stringify(generateLevel(n).board) !== JSON.stringify(g.board))
    failures.push(`level ${n}: generation is not deterministic`);
  rows.push(g);
  if (n % 25 === 0) process.stdout.write(`  generated ${n}/${TO} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
}

// ---------- difficulty trend ----------
const score = rows.map((r) => r.metrics.score);
const lv = rows.map((r) => r.level);

function slope(x: number[], y: number[]) {
  const mx = x.reduce((a, b) => a + b, 0) / x.length;
  const my = y.reduce((a, b) => a + b, 0) / y.length;
  let num = 0,
    den = 0;
  for (let i = 0; i < x.length; i++) {
    num += (x[i] - mx) * (y[i] - my);
    den += (x[i] - mx) ** 2;
  }
  return num / den;
}
function ranks(a: number[]) {
  const idx = a.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
  const r = new Array(a.length);
  idx.forEach(([, i], k) => (r[i] = k));
  return r as number[];
}
function spearman(x: number[], y: number[]) {
  const rx = ranks(x),
    ry = ranks(y);
  const n = x.length;
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (rx[i] - ry[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

console.log('\nLevel  Colors Hidden  Moves  DeadEnd  Branch  Score');
for (const r of rows) {
  if (r.level <= 3 || r.level % 10 === 0 || r.level === TO)
    console.log(
      `${String(r.level).padStart(5)}  ${String(r.spec.colors).padStart(6)} ${(r.spec.hidden ? 'yes' : '').padStart(6)}` +
        `  ${String(r.metrics.solutionLength).padStart(5)}  ${(r.metrics.deadEndRate * 100).toFixed(0).padStart(6)}%` +
        `  ${r.metrics.branching.toFixed(1).padStart(6)}  ${r.metrics.score.toFixed(1).padStart(5)}`,
    );
}

console.log('\nPer colour tier:');
const tiers = [...new Set(rows.map((r) => r.spec.colors))];
let prevMean = -Infinity;
for (const c of tiers) {
  const tr = rows.filter((r) => r.spec.colors === c);
  const s = tr.map((r) => r.metrics.score);
  const rho = spearman(
    tr.map((r) => r.level),
    s,
  );
  const m = mean(s);
  console.log(
    `  ${String(c).padStart(2)} colours  levels ${tr[0].level}-${tr[tr.length - 1].level}` +
      `  mean score ${m.toFixed(1)}  first→last ${s[0].toFixed(1)}→${s[s.length - 1].toFixed(1)}  rank-corr ${rho.toFixed(2)}`,
  );
  if (tr.length >= 5 && rho <= 0.2) failures.push(`tier ${c}: difficulty does not rise inside the tier (rho=${rho.toFixed(2)})`);
  if (m <= prevMean) failures.push(`tier ${c}: mean difficulty not above previous tier`);
  prevMean = m;
}

const sl = slope(lv, score);
const first = mean(score.slice(0, 20));
const last = mean(score.slice(-20));
console.log(`\nOverall slope: ${sl.toFixed(3)} score/level   first 20 avg ${first.toFixed(1)}  →  last 20 avg ${last.toFixed(1)}`);
if (sl <= 0) failures.push('overall difficulty slope is not positive');
if (last <= first) failures.push('last levels are not harder than the first');

if (CSV) {
  writeFileSync(
    CSV,
    'level,colors,hidden,moves,deadEndRate,branching,score\n' +
      rows
        .map((r) =>
          [r.level, r.spec.colors, r.spec.hidden ? 1 : 0, r.metrics.solutionLength, r.metrics.deadEndRate.toFixed(4), r.metrics.branching.toFixed(3), r.metrics.score.toFixed(3)].join(','),
        )
        .join('\n'),
  );
  console.log(`wrote ${CSV}`);
}

console.log(`\nChecked ${TO} levels in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
if (failures.length) {
  console.error(`\nFAILED (${failures.length}):\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log(`OK: all ${TO} levels solvable, deterministic, difficulty trends upward.`);

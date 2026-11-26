/**
 * Fit N bottles into the board area with no scrolling. Tries 1–4 rows and
 * keeps the arrangement with the largest bottles. Each bottle gets a whole
 * grid cell as its tap target, which is much larger than the glass itself.
 */
export const GLASS_ASPECT = 3.3; // height / width (includes headroom above the liquid)
const MAX_GLASS_W = 66;

export interface Cell {
  /** cell (tap target) in board coordinates */
  x: number;
  y: number;
  w: number;
  h: number;
  /** glass top-left in board coordinates */
  gx: number;
  gy: number;
}

export interface Layout {
  rows: number;
  cols: number;
  gw: number;
  gh: number;
  lift: number;
  cells: Cell[];
}

export function computeLayout(n: number, W: number, H: number): Layout {
  let best: { rows: number; cols: number; gw: number } | null = null;
  for (let rows = 1; rows <= 4; rows++) {
    const cols = Math.ceil(n / rows);
    if ((rows - 1) * cols >= n) continue; // would leave an empty row
    const cellW = W / cols;
    const cellH = H / rows;
    const gw = Math.min(cellW * 0.68, (cellH * 0.8) / GLASS_ASPECT, MAX_GLASS_W);
    if (!best || gw > best.gw + 1) best = { rows, cols, gw };
  }
  const { rows, cols, gw } = best!;
  const gh = gw * GLASS_ASPECT;
  const cellW = W / cols;
  // Don't stretch rows taller than needed; centre the block vertically.
  const cellH = Math.min(H / rows, gh / 0.8 + 18);
  const top = (H - cellH * rows) / 2;
  const lift = gh * 0.14;

  // balance bottles across rows (e.g. 9 -> 5 + 4)
  const perRow: number[] = [];
  let left = n;
  for (let r = 0; r < rows; r++) {
    const k = Math.ceil(left / (rows - r));
    perRow.push(k);
    left -= k;
  }
  const cells: Cell[] = [];
  perRow.forEach((k, r) => {
    const rowLeft = (W - k * cellW) / 2;
    for (let i = 0; i < k; i++) {
      const x = rowLeft + i * cellW;
      const y = top + r * cellH;
      cells.push({
        x,
        y,
        w: cellW,
        h: cellH,
        gx: x + (cellW - gw) / 2,
        gy: y + cellH - gh - Math.min(10, cellH * 0.04),
      });
    }
  });
  return { rows, cols, gw, gh, lift, cells };
}

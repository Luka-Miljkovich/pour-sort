// Renders the app icon SVG to the PNG sizes iOS / Android need (uses the preinstalled Playwright Chromium).
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

// Playwright is not a project dependency; use whichever install `require` can find (global or local).
const { chromium } = createRequire(import.meta.url)('playwright');

const tube = (x, colors, tilt = 0) => {
  const w = 74, h = 250, y = 150, unit = 52;
  const layers = colors
    .map((c, i) => `<rect x="${x}" y="${y + h - 14 - (i + 1) * unit}" width="${w}" height="${unit + 1}" fill="${c}"/>`)
    .join('');
  return `<g transform="rotate(${tilt} ${x + w / 2} ${y + h})">
    <clipPath id="c${x}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="37"/><rect x="${x}" y="${y}" width="${w}" height="60"/></clipPath>
    <g clip-path="url(#c${x})">${layers}
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#hl)"/></g>
    <path d="M${x} ${y} V${y + h - 37} a37 37 0 0 0 74 0 V${y}" fill="none" stroke="rgba(225,232,255,.75)" stroke-width="7"/>
    <rect x="${x - 8}" y="${y - 10}" width="${w + 16}" height="14" rx="7" fill="#dfe6ff"/>
  </g>`;
};

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="10%" r="95%"><stop offset="0" stop-color="#26315a"/><stop offset=".6" stop-color="#111628"/><stop offset="1" stop-color="#07090f"/></radialGradient>
    <linearGradient id="hl" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".15"/></linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${pad}) translate(-256 -256)">
    ${tube(118, ['#2f6bff', '#ef4444', '#fde047'])}
    ${tube(219, ['#16a34a', '#16a34a', '#16a34a', '#16a34a'])}
    ${tube(320, ['#f472b6', '#fb8c1e', '#9d4edd'])}
  </g>
</svg>`;

mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const out = [
  ['apple-touch-icon.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.78],
];
for (const [name, size, pad] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#07090f">${svg(pad).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  writeFileSync(`public/icons/${name}`, await page.screenshot({ omitBackground: false }));
  console.log('wrote', name);
}
writeFileSync('public/icons/icon.svg', svg(1));
await browser.close();

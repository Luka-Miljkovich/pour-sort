/**
 * 12 colours chosen to stay distinguishable on a dark background: hue AND
 * lightness differ between neighbours (e.g. dark green vs lime, blue vs sky).
 * Every colour also has a unique symbol for the optional symbol mode.
 */
export interface ColorDef {
  name: string;
  fill: string;
  /** colour for the symbol drawn on top */
  ink: string;
  /** SVG path in a 24x24 box */
  path: string;
  evenodd?: boolean;
}

const DARK = 'rgba(10,12,20,.62)';
const LIGHT = 'rgba(255,255,255,.86)';

export const COLORS: ColorDef[] = [
  { name: 'Red', fill: '#ef4444', ink: DARK, path: 'M12 5a7 7 0 1 0 .001 0z' },
  { name: 'Orange', fill: '#fb8c1e', ink: DARK, path: 'M12 3.5 21 19.5H3z' },
  { name: 'Yellow', fill: '#fde047', ink: DARK, path: 'M5 5h14v14H5z' },
  { name: 'Green', fill: '#16a34a', ink: LIGHT, path: 'M12 2.5 21.5 12 12 21.5 2.5 12z' },
  {
    name: 'Blue',
    fill: '#2f6bff',
    ink: LIGHT,
    path: 'M12 2.8l2.7 6 6.5.6-4.9 4.3 1.5 6.4L12 16.7l-5.8 3.4 1.5-6.4-4.9-4.3 6.5-.6z',
  },
  {
    name: 'Purple',
    fill: '#9d4edd',
    ink: LIGHT,
    path: 'M12 20.5C4.5 15 3 11 4.8 7.6 6.8 4.2 10.6 4.8 12 7.6c1.4-2.8 5.2-3.4 7.2 0 1.8 3.4.3 7.4-7.2 12.9z',
  },
  { name: 'Pink', fill: '#f472b6', ink: DARK, path: 'M9 3.5h6v5.5h5.5v6H15v5.5H9V15H3.5V9H9z' },
  {
    name: 'Sky',
    fill: '#7dd3fc',
    ink: DARK,
    path: 'M12 4a8 8 0 1 0 .001 0zM12 8.2a3.8 3.8 0 1 1-.001 0z',
    evenodd: true,
  },
  {
    name: 'White',
    fill: '#eef0f4',
    ink: DARK,
    path: 'M6.3 3.8 12 9.5l5.7-5.7 2.5 2.5-5.7 5.7 5.7 5.7-2.5 2.5-5.7-5.7-5.7 5.7-2.5-2.5 5.7-5.7-5.7-5.7z',
  },
  { name: 'Brown', fill: '#8d5a2b', ink: LIGHT, path: 'M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z' },
  { name: 'Lime', fill: '#a3e635', ink: DARK, path: 'M14.5 2.8A9.5 9.5 0 1 0 21.2 15 7.4 7.4 0 1 1 14.5 2.8z' },
  { name: 'Grey', fill: '#8e98ab', ink: DARK, path: 'M3.5 5h17v3.4h-17zM3.5 10.3h17v3.4h-17zM3.5 15.6h17V19h-17z' },
];

export function symbolSvg(c: number): string {
  const d = COLORS[c];
  return `<svg class="sym" viewBox="0 0 24 24" aria-hidden="true"><path d="${d.path}" fill="${d.ink}"${
    d.evenodd ? ' fill-rule="evenodd"' : ''
  }/></svg>`;
}

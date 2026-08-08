/**
 * Generate the icon set from one SVG, so every size comes from the same source.
 * Flat fills only: the SVG rasteriser available here silently drops gradients
 * to black.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#241713"/>
  <!-- A lens over a stack of text lines, the lower ones dimmed: the thing the
       tool looks for is text that is there but cannot be read. -->
  <rect x="24" y="28" width="52" height="9" rx="4" fill="#f0e6e2"/>
  <rect x="24" y="46" width="66" height="9" rx="4" fill="#a3736a"/>
  <rect x="24" y="64" width="44" height="9" rx="4" fill="#5b3a34"/>
  <circle cx="82" cy="84" r="24" fill="none" stroke="#e8836a" stroke-width="8"/>
  <rect x="97" y="99" width="22" height="9" rx="4.5" fill="#e8836a" transform="rotate(45 97 99)"/>
</svg>`;

fs.mkdirSync('icons', { recursive: true });
fs.writeFileSync('icons/icon.svg', svg);

for (const size of [16, 32, 48, 128, 512]) {
  execFileSync('convert', [
    '-background',
    'none',
    '-density',
    '900',
    'icons/icon.svg',
    '-resize',
    `${size}x${size}`,
    `icons/icon-${size}.png`,
  ]);
  console.log(`icons/icon-${size}.png  ${fs.statSync(`icons/icon-${size}.png`).size} B`);
}

/**
 * Generates icon PNGs from assets/icon.svg using @resvg/resvg-js.
 * Run: node scripts/generate-icons.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const svgSrc = readFileSync(resolve(root, 'assets/icon.svg'), 'utf-8');
const outDir = resolve(root, 'assets/icons');
mkdirSync(outDir, { recursive: true });

const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const resvg = new Resvg(svgSrc, {
    fitTo: { mode: 'width', value: size },
    background: 'transparent',
  });
  const data = resvg.render();
  const png = data.asPng();
  const out = resolve(outDir, `icon${size}.png`);
  writeFileSync(out, png);
  console.log(`✓ icon${size}.png  (${png.byteLength} bytes)`);
}

console.log('\nAll icons generated.');

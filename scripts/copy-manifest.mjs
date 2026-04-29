/**
 * Post-build script: ensures manifest.json and assets are in the dist folder.
 * vite-plugin-web-extension handles this, but this is a safety net.
 */

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const DIST = `${ROOT}/dist`;

// Ensure dist exists
if (!existsSync(DIST)) {
  mkdirSync(DIST, { recursive: true });
}

// Copy icons
const iconsDir = `${ROOT}/assets/icons`;
const distIconsDir = `${DIST}/assets/icons`;
if (existsSync(iconsDir)) {
  mkdirSync(distIconsDir, { recursive: true });
  cpSync(iconsDir, distIconsDir, { recursive: true });
  console.log('✓ Copied icons to dist/assets/icons/');
} else {
  console.warn('⚠  No icons found at assets/icons/ — run npm run build:icons first.');
}

console.log('✓ Post-build copy complete.');

// Re-draws the app icon PNGs from the SVG sources in assets/brand/.
// Run from apps/mobile:  node scripts/export-icons.mjs
// Uses npx so no dependency is added to the app.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jobs = [
  ['brand/icon.svg', 'icon.png'],
  ['brand/icon-foreground.svg', 'android-icon-foreground.png'],
  ['brand/background.svg', 'android-icon-background.png'],
  ['brand/icon-monochrome.svg', 'android-icon-monochrome.png'],
  ['brand/splash.svg', 'splash-icon.png'],
];

for (const [svg, png] of jobs) {
  const input = path.join(root, 'assets', svg);
  const output = path.join(root, 'assets', png);
  execFileSync(
    'npx',
    ['--yes', '@resvg/resvg-js-cli', '--fit-width', '1024', '--fit-height', '1024', input, output],
    { stdio: 'inherit', shell: true },
  );
  console.log(`${svg} -> ${png}`);
}

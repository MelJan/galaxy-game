// Packt den fertigen Build (dist/) als ZIP für den Upload auf itch.io: release/galaxy-game-itch.zip.
// Läuft nach `npm run build` (siehe `npm run itch`). Die index.html liegt in der obersten Ebene des Archivs,
// so wie itch.io es für HTML-Spiele erwartet.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';

const out = 'release/galaxy-game-itch.zip';
if (!existsSync('dist/index.html')) {
  console.error('dist/index.html fehlt – zuerst bauen (npm run build).');
  process.exit(1);
}
mkdirSync('release', { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-qr', `../${out}`, '.', '-x', '.DS_Store'], { cwd: 'dist', stdio: 'inherit' });
console.log(`Fertig für itch.io: ${out} (${(statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);

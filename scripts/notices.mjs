// Sammelt die Lizenztexte aller Bibliotheken, die im fertigen Spiel enthalten sind, in eine Datei.
// Läuft vor jedem Build (npm run build) und landet als dist/licenses/THIRD_PARTY_NOTICES.txt im Spiel.
import { readFileSync, writeFileSync } from 'node:fs';

const PACKAGES = [
  { name: 'three.js', pkg: 'three', note: '3D-Grafik' },
  { name: 'Press Start 2P (Schrift, über @fontsource)', pkg: '@fontsource/press-start-2p', note: 'Pixel-Schrift der Oberfläche' },
];

let out = 'GALAXY GAME – Lizenzhinweise für enthaltene Software von Dritten\n';
out += '================================================================\n\n';
for (const p of PACKAGES) {
  const meta = JSON.parse(readFileSync(`node_modules/${p.pkg}/package.json`, 'utf8'));
  const license = readFileSync(`node_modules/${p.pkg}/LICENSE`, 'utf8').trim();
  out += `${p.name} ${meta.version} – ${p.note}\nLizenz: ${meta.license}\n\n${license}\n\n----------------------------------------------------------------\n\n`;
}
writeFileSync('public/licenses/THIRD_PARTY_NOTICES.txt', out);
console.log('Lizenzhinweise geschrieben: public/licenses/THIRD_PARTY_NOTICES.txt');

import { defineConfig } from 'vite';

// Eigener Port, damit es nicht mit anderen lokalen Projekten auf 5173 kollidiert
export default defineConfig({
  // Relative Pfade im Build: läuft in jedem Unterordner (itch.io, GitHub Pages unter /galaxy-game/)
  base: './',
  server: { port: 5180, strictPort: true },
  preview: { port: 5181, strictPort: true },
});

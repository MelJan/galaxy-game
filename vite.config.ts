import { defineConfig } from 'vite';

// Eigener Port, damit es nicht mit anderen lokalen Projekten auf 5173 kollidiert
export default defineConfig({
  server: { port: 5180, strictPort: true },
  preview: { port: 5181, strictPort: true },
});

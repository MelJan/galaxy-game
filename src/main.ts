import { Game } from './Game';

const game = new Game(document.getElementById('app')!, document.getElementById('pause')!);
game.start();

// Nur im Dev-Server: Zugriff für automatisierte Tests
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;

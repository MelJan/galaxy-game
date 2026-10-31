import type { Input } from '../core/Input';
import { DIFFICULTIES } from '../game/Difficulty';
import { loadHighscores } from '../game/Highscores';
import { hasSaves } from '../game/SaveGame';

export interface TitleHandlers {
  start(difficulty: number): void;
  /** „Spiel laden“ gewählt. */
  load(): void;
  credits(): void;
  move(): void;
}

/** Titelbildschirm mit Auswahl des Schwierigkeitsgrads. Pfeiltasten/WASD wählen, Enter/Leertaste startet. */
export class Title {
  private readonly root = document.getElementById('title')!;
  private readonly list = document.getElementById('title-list')!;
  private readonly rows: HTMLElement[] = [];
  private selected = 0;
  /** Gewählte Spieleranzahl (links/rechts umschalten). */
  players = 1;
  private readonly playersEl = document.getElementById('title-players')!;
  isOpen = false;

  constructor(private readonly handlers: TitleHandlers) {
    DIFFICULTIES.forEach((d, i) => {
      const row = document.createElement('button');
      row.className = 'difficulty';
      row.style.setProperty('--accent', d.color);
      row.innerHTML = `<span class="name">${d.name}</span><span class="info"><span class="desc">${d.description}</span><span class="best"></span></span>`;
      row.addEventListener('mouseenter', () => this.select(i));
      row.addEventListener('click', () => {
        this.select(i);
        this.handlers.start(i);
      });
      this.list.append(row);
      this.rows.push(row);
    });
    // Letzter Eintrag: Spiel laden
    const load = document.createElement('button');
    load.className = 'difficulty load';
    load.style.setProperty('--accent', '#5af0ff');
    load.innerHTML = '<span class="name">SPIEL LADEN</span><span class="desc">GESPEICHERTEN SPIELSTAND FORTSETZEN</span>';
    load.addEventListener('mouseenter', () => this.select(DIFFICULTIES.length));
    load.addEventListener('click', () => this.choose(DIFFICULTIES.length));
    this.list.append(load);
    this.rows.push(load);
    const credits = document.createElement('button');
    credits.className = 'difficulty load';
    credits.style.setProperty('--accent', '#9ab8e0');
    credits.innerHTML = '<span class="name">CREDITS</span><span class="desc">MITWIRKENDE UND LIZENZEN</span>';
    credits.addEventListener('mouseenter', () => this.select(DIFFICULTIES.length + 1));
    credits.addEventListener('click', () => this.choose(DIFFICULTIES.length + 1));
    this.list.append(credits);
    this.rows.push(credits);
  }

  private get canLoad(): boolean {
    return hasSaves();
  }

  private choose(i: number): void {
    if (i < DIFFICULTIES.length) this.handlers.start(i);
    else if (i === DIFFICULTIES.length) {
      if (this.canLoad) this.handlers.load();
    } else this.handlers.credits();
  }

  /** Eine Zeile weiter (dir = ±1), „Spiel laden“ überspringen, solange es nichts zu laden gibt. */
  private step(dir: number): void {
    let i = Math.max(0, Math.min(this.rows.length - 1, this.selected + dir));
    if (i === DIFFICULTIES.length && !this.canLoad) i = Math.max(0, Math.min(this.rows.length - 1, i + dir));
    this.select(i);
  }

  show(selected: number): void {
    this.isOpen = true;
    // Rekorde je Stufe (können sich seit dem letzten Mal geändert haben)
    const scores = loadHighscores();
    DIFFICULTIES.forEach((d, i) => {
      const best = scores[d.id];
      this.rows[i].querySelector('.best')!.textContent = best ? `REKORD ${String(best).padStart(7, '0')}` : '';
    });
    this.selected = Math.min(selected, DIFFICULTIES.length - 1);
    this.root.classList.remove('hidden');
    this.refresh();
  }

  hide(): void {
    this.isOpen = false;
    this.root.classList.add('hidden');
  }

  handleInput(input: Input): void {
    if (input.wasPressed('ArrowLeft') || input.wasPressed('ArrowRight') || input.wasPressed('KeyA') || input.wasPressed('KeyD')) {
      this.players = this.players === 1 ? 2 : 1;
      this.handlers.move();
    }
    this.renderPlayers(input.coopDevices);
    if (input.wasPressed('Start')) this.choose(this.selected);
    if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) this.step(-1);
    if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) this.step(1);
    if (input.wasPressed('Enter') || input.wasPressed('Space')) this.choose(this.selected);
  }

  private select(i: number): void {
    if (i === this.selected) return;
    this.selected = i;
    this.handlers.move();
    this.refresh();
  }

  private renderPlayers([p1, p2]: [string, string]): void {
    const html =
      `<span class="${this.players === 1 ? 'on' : ''}">1 SPIELER</span><span class="${this.players === 2 ? 'on' : ''}">2 SPIELER</span>` +
      (this.players === 2 ? `<small>SPIELER 1: ${p1} · SPIELER 2: ${p2}</small>` : '');
    if (this.playersEl.innerHTML !== html) this.playersEl.innerHTML = html;
  }

  private refresh(): void {
    this.rows.forEach((row, i) => row.classList.toggle('selected', i === this.selected));
    this.rows[DIFFICULTIES.length].classList.toggle('disabled', !this.canLoad);
  }
}

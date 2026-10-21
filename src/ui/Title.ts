import type { Input } from '../core/Input';
import { DIFFICULTIES } from '../game/Difficulty';
import { hasSaves } from '../game/SaveGame';

export interface TitleHandlers {
  start(difficulty: number): void;
  /** „Spiel laden“ gewählt. */
  load(): void;
  move(): void;
}

/** Titelbildschirm mit Auswahl des Schwierigkeitsgrads. Pfeiltasten/WASD wählen, Enter/Leertaste startet. */
export class Title {
  private readonly root = document.getElementById('title')!;
  private readonly list = document.getElementById('title-list')!;
  private readonly rows: HTMLElement[] = [];
  private selected = 0;
  isOpen = false;

  constructor(private readonly handlers: TitleHandlers) {
    DIFFICULTIES.forEach((d, i) => {
      const row = document.createElement('button');
      row.className = 'difficulty';
      row.style.setProperty('--accent', d.color);
      row.innerHTML = `<span class="name">${d.name}</span><span class="desc">${d.description}</span>`;
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
  }

  private get canLoad(): boolean {
    return hasSaves();
  }

  private choose(i: number): void {
    if (i < DIFFICULTIES.length) this.handlers.start(i);
    else if (this.canLoad) this.handlers.load();
  }

  show(selected: number): void {
    this.isOpen = true;
    this.selected = Math.min(selected, DIFFICULTIES.length - 1);
    this.root.classList.remove('hidden');
    this.refresh();
  }

  hide(): void {
    this.isOpen = false;
    this.root.classList.add('hidden');
  }

  handleInput(input: Input): void {
    const last = this.canLoad ? DIFFICULTIES.length : DIFFICULTIES.length - 1;
    if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) this.select(Math.max(0, this.selected - 1));
    if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) this.select(Math.min(last, this.selected + 1));
    if (input.wasPressed('Enter') || input.wasPressed('Space')) this.choose(this.selected);
  }

  private select(i: number): void {
    if (i === this.selected) return;
    this.selected = i;
    this.handlers.move();
    this.refresh();
  }

  private refresh(): void {
    this.rows.forEach((row, i) => row.classList.toggle('selected', i === this.selected));
    this.rows[DIFFICULTIES.length].classList.toggle('disabled', !this.canLoad);
  }
}

import type { Input } from '../core/Input';
import { DIFFICULTIES } from '../game/Difficulty';
import { loadHighscores } from '../game/Highscores';
import { hasSaves } from '../game/SaveGame';
import { getLang, t } from '../i18n';

export interface TitleHandlers {
  start(difficulty: number): void;
  /** „Spiel laden“ gewählt. */
  load(): void;
  credits(): void;
  /** Sprache umschalten (Deutsch/Englisch). */
  language(): void;
  move(): void;
}

/** Titelbildschirm mit Auswahl des Schwierigkeitsgrads. Pfeiltasten/WASD wählen, Enter/Leertaste startet, L wechselt die Sprache. */
export class Title {
  private readonly root = document.getElementById('title')!;
  private readonly list = document.getElementById('title-list')!;
  private readonly rows: HTMLElement[] = [];
  private selected = 0;
  /** Gewählte Spieleranzahl (links/rechts umschalten). */
  players = 1;
  private readonly playersEl = document.getElementById('title-players')!;
  private playersHtml = '';
  isOpen = false;

  constructor(private readonly handlers: TitleHandlers) {
    DIFFICULTIES.forEach((d, i) => {
      const row = document.createElement('button');
      row.className = 'difficulty';
      row.style.setProperty('--accent', d.color);
      row.innerHTML = '<span class="name"></span><span class="info"><span class="desc"></span><span class="best"></span></span>';
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
    load.innerHTML = '<span class="name"></span><span class="desc"></span>';
    load.addEventListener('mouseenter', () => this.select(DIFFICULTIES.length));
    load.addEventListener('click', () => this.choose(DIFFICULTIES.length));
    this.list.append(load);
    this.rows.push(load);
    const credits = document.createElement('button');
    credits.className = 'difficulty load';
    credits.style.setProperty('--accent', '#9ab8e0');
    credits.innerHTML = '<span class="name"></span><span class="desc"></span>';
    credits.addEventListener('mouseenter', () => this.select(DIFFICULTIES.length + 1));
    credits.addEventListener('click', () => this.choose(DIFFICULTIES.length + 1));
    this.list.append(credits);
    this.rows.push(credits);
    const language = document.createElement('button');
    language.className = 'difficulty load';
    language.style.setProperty('--accent', '#ff9ad0');
    language.innerHTML = '<span class="name"></span><span class="desc"></span>';
    language.addEventListener('mouseenter', () => this.select(DIFFICULTIES.length + 2));
    language.addEventListener('click', () => this.choose(DIFFICULTIES.length + 2));
    this.list.append(language);
    this.rows.push(language);
    this.renderTexts();
  }

  /** Beschriftungen in der aktuellen Sprache (auch nach einem Sprachwechsel). */
  renderTexts(): void {
    const set = (row: HTMLElement, name: string, desc: string) => {
      row.querySelector('.name')!.textContent = name;
      row.querySelector('.desc')!.textContent = desc;
    };
    DIFFICULTIES.forEach((d, i) => set(this.rows[i], t(d.name), t(d.description)));
    const extra = DIFFICULTIES.length;
    set(this.rows[extra], t('SPIEL LADEN'), t('GESPEICHERTEN SPIELSTAND FORTSETZEN'));
    set(this.rows[extra + 1], 'CREDITS', t('MITWIRKENDE UND LIZENZEN'));
    // Immer in der jeweils anderen Sprache mitbeschriftet, damit man den Schalter auch ohne Deutsch findet
    set(this.rows[extra + 2], getLang() === 'de' ? 'SPRACHE: DEUTSCH' : 'LANGUAGE: ENGLISH', getLang() === 'de' ? 'LANGUAGE: ENGLISH (L)' : 'SPRACHE: DEUTSCH (L)');
    this.playersHtml = '';
    this.renderBest();
    if (this.isOpen) this.refresh();
  }

  /** Rekorde je Stufe (können sich seit dem letzten Mal geändert haben). */
  private renderBest(): void {
    const scores = loadHighscores();
    DIFFICULTIES.forEach((d, i) => {
      const best = scores[d.id];
      this.rows[i].querySelector('.best')!.textContent = best ? t('REKORD {score}', { score: String(best).padStart(7, '0') }) : '';
    });
  }

  private get canLoad(): boolean {
    return hasSaves();
  }

  private choose(i: number): void {
    if (i < DIFFICULTIES.length) this.handlers.start(i);
    else if (i === DIFFICULTIES.length) {
      if (this.canLoad) this.handlers.load();
    } else if (i === DIFFICULTIES.length + 1) this.handlers.credits();
    else this.handlers.language();
  }

  /** Eine Zeile weiter (dir = ±1), „Spiel laden“ überspringen, solange es nichts zu laden gibt. */
  private step(dir: number): void {
    let i = Math.max(0, Math.min(this.rows.length - 1, this.selected + dir));
    if (i === DIFFICULTIES.length && !this.canLoad) i = Math.max(0, Math.min(this.rows.length - 1, i + dir));
    this.select(i);
  }

  show(selected: number): void {
    this.isOpen = true;
    this.renderBest();
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
    if (input.wasPressed('KeyL')) this.handlers.language();
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
      `<span class="${this.players === 1 ? 'on' : ''}">${t('1 SPIELER')}</span><span class="${this.players === 2 ? 'on' : ''}">${t('2 SPIELER')}</span>` +
      (this.players === 2 ? `<small>${t('SPIELER 1')}: ${p1} · ${t('SPIELER 2')}: ${p2}</small>` : '');
    // Vergleich mit dem zuletzt gesetzten Text (innerHTML liest Sonderzeichen anders zurück)
    if (this.playersHtml !== html) this.playersEl.innerHTML = this.playersHtml = html;
  }

  private refresh(): void {
    this.rows.forEach((row, i) => row.classList.toggle('selected', i === this.selected));
    this.rows[DIFFICULTIES.length].classList.toggle('disabled', !this.canLoad);
  }
}

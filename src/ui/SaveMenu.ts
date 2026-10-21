import type { Input } from '../core/Input';
import { DIFFICULTIES } from '../game/Difficulty';
import { deleteSlot, formatTime, loadSlots, SLOT_COUNT, type SaveData } from '../game/SaveGame';

export type SaveMenuMode = 'save' | 'load';

export interface SaveMenuHandlers {
  /** Speichern: Slot gewählt (darf überschreiben). */
  save(slot: number): void;
  /** Laden: Spielstand gewählt. */
  load(data: SaveData): void;
  close(): void;
  move(): void;
  deny(): void;
}

/**
 * Liste der 10 Speicherplätze. Im Speichermodus überschreibt Enter den gewählten Slot
 * (ein zweites Enter bestätigt das Überschreiben), im Lademodus lädt es. Entf löscht, Esc schließt.
 */
export class SaveMenu {
  private readonly root = document.getElementById('saves')!;
  private readonly title = document.getElementById('saves-title')!;
  private readonly list = document.getElementById('saves-list')!;
  private readonly hint = document.getElementById('saves-hint')!;
  private readonly rows: HTMLElement[] = [];
  private slots: (SaveData | null)[] = [];
  private selected = 0;
  private mode: SaveMenuMode = 'load';
  /** Slot, dessen Überschreiben gerade bestätigt werden muss. */
  private confirm = -1;
  isOpen = false;

  constructor(private readonly handlers: SaveMenuHandlers) {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const row = document.createElement('button');
      row.className = 'slot';
      row.addEventListener('mouseenter', () => this.select(i));
      row.addEventListener('click', () => {
        this.select(i);
        this.activate();
      });
      this.list.append(row);
      this.rows.push(row);
    }
  }

  show(mode: SaveMenuMode): void {
    this.mode = mode;
    this.isOpen = true;
    this.confirm = -1;
    this.slots = loadSlots();
    // Speichern: erster freier Slot vorausgewählt; Laden: neuester Spielstand
    if (mode === 'save') {
      const free = this.slots.indexOf(null);
      this.selected = free >= 0 ? free : 0;
    } else {
      let newest = 0;
      this.slots.forEach((s, i) => {
        if (s && (!this.slots[newest] || s.savedAt > this.slots[newest]!.savedAt)) newest = i;
      });
      this.selected = newest;
    }
    this.title.textContent = mode === 'save' ? 'SPIEL SPEICHERN' : 'SPIEL LADEN';
    this.hint.innerHTML =
      mode === 'save'
        ? 'PFEILTASTEN: SLOT WÄHLEN &middot; ENTER: SPEICHERN &middot; ENTF: LÖSCHEN &middot; ESC: ZURÜCK'
        : 'PFEILTASTEN: WÄHLEN &middot; ENTER: LADEN &middot; ENTF: LÖSCHEN &middot; ESC: ZURÜCK';
    this.root.classList.remove('hidden');
    this.refresh();
  }

  hide(): void {
    this.isOpen = false;
    this.root.classList.add('hidden');
  }

  handleInput(input: Input): void {
    if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) this.select((this.selected + SLOT_COUNT - 1) % SLOT_COUNT);
    if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) this.select((this.selected + 1) % SLOT_COUNT);
    if (input.wasPressed('Enter') || input.wasPressed('Space')) this.activate();
    if (input.wasPressed('Delete') || input.wasPressed('Backspace')) this.remove();
    if (input.wasPressed('Escape')) this.handlers.close();
  }

  private select(i: number): void {
    if (i === this.selected) return;
    this.selected = i;
    this.confirm = -1;
    this.handlers.move();
    this.refresh();
  }

  private activate(): void {
    const slot = this.slots[this.selected];
    if (this.mode === 'load') {
      if (slot) this.handlers.load(slot);
      else this.handlers.deny();
      return;
    }
    // Belegten Slot erst nach Bestätigung überschreiben
    if (slot && this.confirm !== this.selected) {
      this.confirm = this.selected;
      this.refresh();
      return;
    }
    this.handlers.save(this.selected);
    this.slots = loadSlots();
    this.confirm = -1;
    this.refresh();
    this.rows[this.selected].classList.remove('saved');
    void this.rows[this.selected].offsetWidth;
    this.rows[this.selected].classList.add('saved');
  }

  private remove(): void {
    if (!this.slots[this.selected]) return;
    deleteSlot(this.selected);
    this.slots = loadSlots();
    this.confirm = -1;
    this.refresh();
  }

  private refresh(): void {
    this.rows.forEach((row, i) => {
      const s = this.slots[i];
      const num = `<span class="num">${String(i + 1).padStart(2, '0')}</span>`;
      if (!s) {
        row.innerHTML = `${num}<span class="label empty">— LEER —</span>`;
      } else {
        const d = DIFFICULTIES[s.difficulty] ?? DIFFICULTIES[0];
        const stage = s.loop > 0 ? ` · STUFE ${s.loop + 1}` : '';
        const warn = this.confirm === i ? '<span class="confirm">ENTER: ÜBERSCHREIBEN?</span>' : '';
        row.innerHTML =
          `${num}<span class="label">${s.label}<small><b style="color:${d.color}">${d.name}${stage}</b>` +
          ` &middot; SCORE ${String(s.score).padStart(7, '0')} &middot; GOLD ${s.gold}</small></span>` +
          `<span class="time">${formatTime(s.savedAt)}</span>${warn}`;
      }
      row.classList.toggle('selected', i === this.selected);
      row.classList.toggle('filled', !!s);
    });
  }
}

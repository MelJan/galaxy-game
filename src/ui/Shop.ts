import type { Input } from '../core/Input';
import { ICON_PALETTE, UPGRADES, type UpgradeDef, type Upgrades } from '../game/Upgrades';
import { renderPixelArt } from '../gfx/pixel';
import { t } from '../i18n';

export type BuyResult = 'ok' | 'poor' | 'max' | 'full';

/** Was die Werft zum Anzeigen braucht. */
export interface ShopState {
  gold: number;
  hull: number;
  maxHull: number;
  upgrades: Upgrades;
}

export interface ShopHandlers {
  state(): ShopState;
  buy(def: UpgradeDef): BuyResult;
  close(): void;
  /** Speichern-Menü öffnen. */
  save(): void;
  /** Auswahl bewegt (für ein Klick-Geräusch). */
  move(): void;
}

const COLUMNS = 5;
const ICON_SCALE = 4;

/**
 * Die Werft zwischen den Wellen: Karten mit Pixel-Icon, Stufen, nächster Wirkung und Preis.
 * Bedienung mit Pfeiltasten/WASD, Leertaste/Enter kauft, Esc fliegt weiter. Maus geht auch.
 */
export class Shop {
  private readonly root = document.getElementById('shop')!;
  private readonly grid = document.getElementById('shop-grid')!;
  private readonly gold = document.getElementById('shop-gold')!;
  private readonly hull = document.getElementById('shop-hull')!;
  private readonly continueBtn = document.getElementById('shop-continue')!;
  private readonly saveBtn = document.getElementById('shop-save')!;
  private readonly cards: HTMLElement[] = [];
  private focus = 0;
  /** Maus erst nach echter Bewegung beachten (siehe SaveMenu). */
  private mouseArmed = false;
  isOpen = false;

  constructor(private readonly handlers: ShopHandlers) {
    UPGRADES.forEach((def, i) => {
      const card = document.createElement('button');
      card.className = 'card';
      const icon = renderPixelArt(def.icon, ICON_PALETTE);
      icon.className = 'icon';
      icon.style.width = `${def.icon[0].length * ICON_SCALE}px`;
      icon.style.height = `${def.icon.length * ICON_SCALE}px`;
      card.append(icon);
      for (const cls of ['name', 'pips', 'effect', 'price']) {
        const el = document.createElement('div');
        el.className = cls;
        card.append(el);
      }
      card.addEventListener('mouseenter', () => this.mouseArmed && this.setFocus(i));
      card.addEventListener('click', () => {
        this.setFocus(i);
        this.activate();
      });
      this.grid.append(card);
      this.cards.push(card);
    });
    this.root.addEventListener('mousemove', (e) => {
      if (e.movementX !== 0 || e.movementY !== 0) this.mouseArmed = true;
    });
    this.continueBtn.addEventListener('mouseenter', () => this.mouseArmed && this.setFocus(UPGRADES.length));
    this.continueBtn.addEventListener('click', () => this.handlers.close());
    this.saveBtn.addEventListener('mouseenter', () => this.mouseArmed && this.setFocus(UPGRADES.length + 1));
    this.saveBtn.addEventListener('click', () => this.handlers.save());
  }

  show(): void {
    this.mouseArmed = false;
    this.isOpen = true;
    this.focus = 0;
    this.root.classList.remove('hidden');
    this.refresh();
  }

  hide(): void {
    this.isOpen = false;
    this.root.classList.add('hidden');
  }

  /** Tastatur: Auswahl bewegen, kaufen, schließen. */
  handleInput(input: Input): void {
    // Fokus: 0..n-1 Karten, n = Weiterfliegen, n+1 = Speichern
    const cont = UPGRADES.length;
    const save = cont + 1;
    const f = this.focus;
    const onButtons = f >= cont;
    if (input.wasPressed('ArrowLeft') || input.wasPressed('KeyA')) this.setFocus(onButtons ? cont : Math.max(0, f - 1));
    if (input.wasPressed('ArrowRight') || input.wasPressed('KeyD')) this.setFocus(onButtons ? save : Math.min(cont - 1, f + 1));
    if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) this.setFocus(onButtons ? cont - COLUMNS : Math.max(0, f - COLUMNS));
    if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) this.setFocus(onButtons ? f : f + COLUMNS >= cont ? cont : f + COLUMNS);
    if (input.wasPressed('Space') || input.wasPressed('Enter')) this.activate();
    if (input.wasPressed('Escape')) this.handlers.close();
  }

  private setFocus(i: number): void {
    if (i === this.focus) return;
    this.focus = i;
    this.handlers.move();
    this.refresh();
  }

  private activate(): void {
    if (this.focus === UPGRADES.length) {
      this.handlers.close();
      return;
    }
    if (this.focus === UPGRADES.length + 1) {
      this.handlers.save();
      return;
    }
    const card = this.cards[this.focus];
    const result = this.handlers.buy(UPGRADES[this.focus]);
    // Kurzes Aufblitzen (gekauft) oder Wackeln (geht nicht)
    card.classList.remove('bought', 'denied');
    void card.offsetWidth;
    card.classList.add(result === 'ok' ? 'bought' : 'denied');
    this.refresh();
  }

  /** Alle Karten an Gold, Stufen und Preise anpassen. */
  refresh(): void {
    const s = this.handlers.state();
    this.gold.textContent = String(s.gold);
    this.hull.textContent = `${s.hull}/${s.maxHull}`;
    UPGRADES.forEach((def, i) => {
      const card = this.cards[i];
      const level = s.upgrades.level(def.id);
      const price = s.upgrades.price(def);
      const full = def.id === 'repair' && s.hull >= s.maxHull;
      const [name, pips, effect, priceEl] = [...card.querySelectorAll('div')];
      name.textContent = t(def.name);
      pips.innerHTML = def.repeat ? '' : def.prices.map((_, k) => `<i class="${k < level ? 'on' : ''}"></i>`).join('');
      effect.textContent = t(price === null ? 'AUSGEBAUT' : full ? 'HÜLLE IST VOLL' : def.effects[Math.min(level, def.effects.length - 1)]);
      priceEl.innerHTML = price === null ? 'MAX' : `<span class="coin"></span>${price}`;
      card.classList.toggle('focus', this.focus === i);
      card.classList.toggle('maxed', price === null || full);
      card.classList.toggle('poor', price !== null && price > s.gold);
    });
    this.continueBtn.classList.toggle('focus', this.focus === UPGRADES.length);
    this.saveBtn.classList.toggle('focus', this.focus === UPGRADES.length + 1);
  }
}

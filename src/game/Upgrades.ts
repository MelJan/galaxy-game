import type { Palette } from '../gfx/pixel';

/** Dauerhafte Verbesserungen aus der Werft. Sie gelten bis zum Game Over. */
export type UpgradeId =
  | 'fireRate'
  | 'guns'
  | 'damage'
  | 'hull'
  | 'repair'
  | 'shieldGen'
  | 'magnet'
  | 'duration'
  | 'engine'
  | 'drones';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** Wirkung der jeweils nächsten Stufe (Index = aktuelle Stufe). */
  effects: string[];
  /** Preise je Stufe. Bei repeat: Grundpreis, der mit jedem Kauf steigt. */
  prices: number[];
  repeat?: { step: number };
  icon: string[];
}

export const ICON_PALETTE: Palette = {
  k: 0x0b0a1a,
  W: 0xffffff,
  Y: 0xffe24a,
  y: 0x8a6a10,
  C: 0x5af0ff,
  c: 0x147a9a,
  R: 0xff4a5a,
  r: 0x8a1830,
  G: 0x9a9ab0,
  g: 0x4a4a5e,
  O: 0xffa83a,
  o: 0x9a4a10,
};

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'fireRate',
    name: 'FEUERRATE',
    effects: ['+10% SCHUSSFREQUENZ', '+10% SCHUSSFREQUENZ', '+10% SCHUSSFREQUENZ', '+10% SCHUSSFREQUENZ', '+10% SCHUSSFREQUENZ'],
    prices: [30, 50, 80, 120, 170],
    icon: ['.....YYk.', '....YYk..', '...YYk...', '..YYYYYk.', '....YYk..', '...YYk...', '..YYk....', '.YYk.....', '.........'],
  },
  {
    id: 'guns',
    name: 'KANONEN',
    effects: ['DRITTER LAUF IN DER MITTE', 'FLÜGELKANONEN FEUERN MIT', 'FLÜGELKANONEN STREUEN'],
    prices: [60, 120, 200],
    icon: ['.W..W..W.', '.C..C..C.', '.C..C..C.', '.C..C..C.', '.c..c..c.', '.........', '..GGGGG..', '.GgggggG.', '.........'],
  },
  {
    id: 'damage',
    name: 'DURCHSCHLAG',
    effects: ['+25% SCHADEN', '+25% SCHADEN', '+25% SCHADEN', '+25% SCHADEN'],
    prices: [50, 100, 160, 240],
    icon: ['....R....', '.R..R..R.', '..RRORR..', '..ROYOR..', 'RRRYWYRRR', '..ROYOR..', '..RRORR..', '.R..R..R.', '....R....'],
  },
  {
    id: 'hull',
    name: 'PANZERUNG',
    effects: ['+1 MAXIMALE HÜLLE', '+1 MAXIMALE HÜLLE', '+1 MAXIMALE HÜLLE'],
    prices: [40, 80, 130],
    icon: ['.GGGGGGG.', 'GgGgggGgG', 'Ggg...ggG', 'Gg.CCC.gG', 'Gg.CCC.gG', 'Ggg...ggG', 'GgGgggGgG', '.GGGGGGG.', '.........'],
  },
  {
    id: 'repair',
    name: 'REPARATUR',
    effects: ['+1 HÜLLE SOFORT'],
    prices: [15],
    repeat: { step: 10 },
    icon: ['...RRR...', '...RWR...', '...RWR...', 'RRRRWRRRR', 'RWWWWWWWR', 'RRRRWRRRR', '...RWR...', '...RWR...', '...RRR...'],
  },
  {
    id: 'shieldGen',
    name: 'SCHILDGENERATOR',
    effects: ['SCHILD LÄDT ALLE 20 S', 'SCHILD LÄDT ALLE 15 S', 'SCHILD LÄDT ALLE 10 S'],
    prices: [80, 140, 220],
    icon: ['CCCCCCCCC', 'CccWWWccC', 'CcWcccWcC', 'CcWcccWcC', '.CccWccC.', '.CcccccC.', '..CcccC..', '...CcC...', '....C....'],
  },
  {
    id: 'magnet',
    name: 'MAGNET',
    effects: ['MÜNZEN AUS +50% ENTFERNUNG', 'MÜNZEN AUS +50% ENTFERNUNG', 'MÜNZEN AUS +50% ENTFERNUNG'],
    prices: [25, 50, 90],
    icon: ['.RR...RR.', '.RR...RR.', '.WW...WW.', '.GG...GG.', '.GG...GG.', '.GGg.gGG.', '..GGGGG..', '...ggg...', '.........'],
  },
  {
    id: 'duration',
    name: 'VERSTÄRKER',
    effects: ['POWER-UPS +25% LÄNGER', 'POWER-UPS +25% LÄNGER', 'POWER-UPS +25% LÄNGER'],
    prices: [35, 70, 120],
    icon: ['YYYYYYYYY', '.y.....y.', '..yOOOy..', '...yOy...', '....O....', '...y.y...', '..y.O.y..', '.yOOOOOy.', 'YYYYYYYYY'],
  },
  {
    id: 'engine',
    name: 'TRIEBWERK',
    effects: ['+10% GESCHWINDIGKEIT', '+10% GESCHWINDIGKEIT', '+10% GESCHWINDIGKEIT'],
    prices: [30, 60, 100],
    icon: ['....W....', '...WCW...', '..WC.CW..', '.WC...CW.', '...O.O...', '..OYOYO..', '..OYOYO..', '...O.O...', '....O....'],
  },
  {
    id: 'drones',
    name: 'BEGLEITDROHNE',
    effects: ['1 BEGLEITER DAUERHAFT', '2 BEGLEITER DAUERHAFT'],
    prices: [150, 300],
    icon: ['.........', '.yy...yy.', 'yYYy.yYYy', 'yYWy.yYWy', '.yy...yy.', '....C....', '...CCC...', '..CWCWC..', '.........'],
  },
];

const SHIELD_COOLDOWNS = [0, 20, 15, 10];

/** Gekaufte Stufen und die daraus abgeleiteten Werte. */
export class Upgrades {
  private readonly levels = new Map<UpgradeId, number>();

  reset(): void {
    this.levels.clear();
  }

  /** Stufen für einen Spielstand. */
  toJSON(): Partial<Record<UpgradeId, number>> {
    return Object.fromEntries(this.levels);
  }

  load(levels: Partial<Record<UpgradeId, number>>): void {
    this.levels.clear();
    for (const def of UPGRADES) {
      const lvl = Math.floor(levels[def.id] ?? 0);
      const max = def.repeat ? Infinity : def.prices.length;
      if (lvl > 0) this.levels.set(def.id, Math.min(lvl, max));
    }
  }

  level(id: UpgradeId): number {
    return this.levels.get(id) ?? 0;
  }

  /** Preis der nächsten Stufe, null wenn ausgebaut. */
  price(def: UpgradeDef): number | null {
    const lvl = this.level(def.id);
    if (def.repeat) return def.prices[0] + lvl * def.repeat.step;
    return lvl < def.prices.length ? def.prices[lvl] : null;
  }

  buy(id: UpgradeId): void {
    this.levels.set(id, this.level(id) + 1);
  }

  get fireIntervalMul(): number {
    return Math.pow(0.9, this.level('fireRate'));
  }

  get gunLevel(): number {
    return this.level('guns');
  }

  get damageMul(): number {
    return 1 + 0.25 * this.level('damage');
  }

  get maxHull(): number {
    return 5 + this.level('hull');
  }

  /** Sekunden bis zum automatischen Aufladen des Schilds, 0 = kein Generator. */
  get shieldCooldown(): number {
    return SHIELD_COOLDOWNS[this.level('shieldGen')];
  }

  get magnetMul(): number {
    return 1 + 0.5 * this.level('magnet');
  }

  get durationMul(): number {
    return 1 + 0.25 * this.level('duration');
  }

  get speedMul(): number {
    return 1 + 0.1 * this.level('engine');
  }

  get drones(): number {
    return this.level('drones');
  }
}

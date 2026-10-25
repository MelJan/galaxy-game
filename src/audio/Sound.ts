/**
 * Retro-Sound komplett per Web Audio synthetisiert: Effekte und Musik.
 * Jede Fraktion hat eine eigene Klangwelt (Metall, Fleisch, Kristall). Effekte variieren bei jedem Abspielen
 * leicht in Tonhöhe und Ausprägung, damit Wiederholungen nicht monoton klingen.
 * Browser erlauben Audio erst nach einer Nutzeraktion, deshalb startet der AudioContext beim ersten Tastendruck.
 */
import { storage } from '../core/storage';
import { BOSS_PLAN, buildLead, chordAt, rootAt, SECTIONS, SECTOR_PLAN, type Section } from './arranger';
import { LOOP_STEPS, SECTOR_SONGS, SONGS, type Song } from './music';

export type Material = 'metal' | 'flesh' | 'crystal' | 'slime' | 'void';
export type ShotSound = 'normal' | 'boss' | 'acid' | 'aether' | 'orb' | 'slime' | 'tracer' | 'shard' | 'void' | 'bio' | 'spike' | 'bolt';
export type BossTheme =
  | 'mothership'
  | 'queen'
  | 'ark'
  | 'urschleim'
  | 'rocket'
  | 'fortress'
  | 'shardswarm'
  | 'singularity'
  | 'leviathan'
  | 'cabrio'
  | 'kosmograd'
  | 'unitas'
  | 'squadron'
  | 'odysseus'
  | 'worldbreaker';
export type MusicMode = 'normal' | BossTheme;
export type PowerUpSound = 'repair' | 'shield' | 'fan' | 'laser' | 'missile' | 'option';

/** Wohin ein Klang geht: Bus (Effekte oder Musik) und Anteile für Hall und Echo. */
interface Route {
  bus?: 'sfx' | 'music';
  reverb?: number;
  echo?: number;
}

interface ToneOptions extends Route {
  type: OscillatorType;
  freq: number;
  /** Zielfrequenz am Ende (exponentieller Sweep). */
  to?: number;
  dur: number;
  vol: number;
  delay?: number;
  attack?: number;
  /** Tiefpass-Grenzfrequenz (z. B. für weiche Sägezahn-Bässe). */
  lowpass?: number;
  /** Vibrato: [Frequenz in Hz, Tiefe in Cent]. */
  vibrato?: [number, number];
}

interface NoiseOptions extends Route {
  dur: number;
  vol: number;
  filter: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
  delay?: number;
}

/** Hall und Echo für einen Bus. */
interface Fx {
  reverb: GainNode;
  echo: GainNode;
}

const STORAGE_KEY = 'audio';
const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** Wert um ±amount zufällig variieren. */
const vary = (v: number, amount = 0.08) => v * (1 + (Math.random() * 2 - 1) * amount);
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/** Töne der vier Runenkristalle der Kristallarche (pentatonisch, klingen in jeder Folge gut). */
const GLYPH_NOTES = [76, 79, 81, 84];

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private fx!: Record<'sfx' | 'music', Fx>;
  private noiseBuffer!: AudioBuffer;
  private readonly lastPlayed = new Map<string, number>();

  private soundOn = true;
  private musicOn = true;
  private paused = false;

  private musicTimer = 0;
  private nextStepTime = 0;
  private step = 0;
  private song: Song = SONGS.chip;
  private sectorSong: Song = SONGS.chip;
  private musicMode: MusicMode = 'normal';
  /** Arrangement: Anzahl gespielter Abschnitte, aktueller und vorheriger Abschnitt, Melodie dazu. */
  private phrase = 0;
  private section: Section = SECTIONS.intro;
  private prevSection: Section | null = null;
  private lead: [number, number, number][] = [];
  private sectionStarted = -1;
  private intensity = 0.5;
  private musicFilter!: BiquadFilterNode;
  private laserNodes: { oscs: OscillatorNode[]; gain: GainNode } | null = null;
  private coinCombo = 0;
  private lastCoin = 0;

  constructor() {
    const saved = storage.getJSON<{ sound?: unknown; music?: unknown }>(STORAGE_KEY) ?? {};
    if (typeof saved.sound === 'boolean') this.soundOn = saved.sound;
    if (typeof saved.music === 'boolean') this.musicOn = saved.music;
    const unlock = () => this.ensure();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
  }

  get isSoundOn(): boolean {
    return this.soundOn;
  }

  get isMusicOn(): boolean {
    return this.musicOn;
  }

  // -------------------------------------------------------------------------
  // Aufbau: Busse, Hall, Echo
  // -------------------------------------------------------------------------

  private ensure(): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 4;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.soundOn ? 0.7 : 0;
      this.master.connect(comp);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.music = ctx.createGain();
      this.music.gain.value = this.musicOn ? 0.32 : 0;
      // Musik läuft durch einen Tiefpass, den das Arrangement fährt (Intro, Breakdown, Aufbau)
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 18000;
      this.musicFilter.Q.value = 0.9;
      this.music.connect(this.musicFilter).connect(this.master);

      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      const impulse = this.makeImpulse(2.4);
      this.fx = { sfx: this.makeFx(this.sfx, impulse), music: this.makeFx(this.music, impulse) };
      this.startMusic();
    }
    if (this.ctx.state === 'suspended' && !this.paused) void this.ctx.resume();
  }

  /** Künstlicher Raumhall: abklingendes Rauschen als Impulsantwort. */
  private makeImpulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  /** Hall und Echo, deren Ausgang in den jeweiligen Bus führt (so wirkt Stummschalten auch auf die Fahnen). */
  private makeFx(bus: GainNode, impulse: AudioBuffer): Fx {
    const ctx = this.ctx!;
    const reverb = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    reverb.connect(conv).connect(wet).connect(bus);

    const echo = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.27;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.45;
    echo.connect(delay).connect(tone).connect(feedback).connect(delay);
    tone.connect(echoOut).connect(bus);
    return { reverb, echo };
  }

  private save(): void {
    storage.setJSON(STORAGE_KEY, { sound: this.soundOn, music: this.musicOn });
  }

  toggleSound(): void {
    this.soundOn = !this.soundOn;
    if (this.ctx) this.master.gain.setTargetAtTime(this.soundOn ? 0.7 : 0, this.ctx.currentTime, 0.02);
    this.save();
  }

  toggleMusic(): void {
    this.musicOn = !this.musicOn;
    if (this.ctx) this.music.gain.setTargetAtTime(this.musicOn ? 0.32 : 0, this.ctx.currentTime, 0.05);
    this.save();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!this.ctx) return;
    if (paused) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  /** Verhindert, dass derselbe Effekt in sehr kurzem Abstand gestapelt wird. */
  private throttle(name: string, gap: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < gap) return false;
    this.lastPlayed.set(name, now);
    return true;
  }

  // -------------------------------------------------------------------------
  // Stimmen
  // -------------------------------------------------------------------------

  /** Ausgang einer Stimme auf Bus, Hall und Echo verteilen. */
  private route(node: AudioNode, r: Route): void {
    const which = r.bus ?? 'sfx';
    node.connect(which === 'music' ? this.music : this.sfx);
    const ctx = this.ctx!;
    for (const [amount, input] of [
      [r.reverb, this.fx[which].reverb],
      [r.echo, this.fx[which].echo],
    ] as const) {
      if (!amount) continue;
      const send = ctx.createGain();
      send.gain.value = amount;
      node.connect(send).connect(input);
    }
  }

  private tone(o: ToneOptions): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const attack = o.attack ?? 0.005;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(o.vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(o.dur, attack + 0.01));
    let src: AudioNode = osc;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      src = osc.connect(f);
    }
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = o.vibrato[0];
      depth.gain.value = o.vibrato[1];
      lfo.connect(depth).connect(osc.detune);
      lfo.start(t);
      lfo.stop(t + o.dur + 0.05);
    }
    src.connect(gain);
    this.route(gain, o);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  private noise(o: NoiseOptions): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = o.filter;
    f.frequency.setValueAtTime(o.freq, t);
    if (o.q) f.Q.value = o.q;
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(o.vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(gain);
    this.route(gain, o);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.02);
  }

  /** FM-Glocke: kristallin, glasig. ratio und index bestimmen die Klangfarbe. */
  private bell(freq: number, dur: number, vol: number, opts: Route & { delay?: number; ratio?: number; index?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const gain = ctx.createGain();
    carrier.frequency.value = freq;
    mod.frequency.value = freq * (opts.ratio ?? 3.5);
    modGain.gain.setValueAtTime(freq * (opts.index ?? 1.4), t);
    modGain.gain.exponentialRampToValueAtTime(1, t + dur);
    mod.connect(modGain).connect(carrier.frequency);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    carrier.connect(gain);
    this.route(gain, opts);
    for (const o of [carrier, mod]) {
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /** Knurren und Brüllen: Sägezahn durch zwei Formant-Filter, mit Vibrato. */
  private growl(freq: number, to: number, dur: number, vol: number, formants: [number, number], opts: Route & { delay?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = rnd(6, 11);
    depth.gain.value = 60;
    lfo.connect(depth).connect(osc.detune);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + dur * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const f of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 4;
      osc.connect(bp).connect(gain);
    }
    this.route(gain, opts);
    for (const o of [osc, lfo]) {
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /** Schnelle Folge kurzer Zirplaute, wie ein Insekt. */
  private chitter(count: number, base: number, vol: number, delay = 0): void {
    for (let i = 0; i < count; i++) {
      const f = vary(base, 0.25);
      this.tone({ type: 'sawtooth', freq: f, to: f * 0.7, dur: 0.018, vol, delay: delay + i * rnd(0.022, 0.035), lowpass: 4000 });
    }
  }

  // -------------------------------------------------------------------------
  // Spieler
  // -------------------------------------------------------------------------

  shoot(): void {
    if (!this.throttle('shoot', 0.05)) return;
    this.tone({ type: 'square', freq: vary(1400, 0.06), to: vary(320, 0.1), dur: 0.07, vol: 0.04 });
  }

  /** Dauerlaser an/aus: brummender Dauerton, solange er feuert. */
  setLaser(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (on && !this.laserNodes) {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 0.05);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2200;
      filter.connect(gain).connect(this.sfx);
      const oscs = (
        [
          ['sawtooth', 138],
          ['square', 277.5],
        ] as const
      ).map(([type, freq]) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        o.connect(filter);
        o.start();
        return o;
      });
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 9;
      depth.gain.value = 6;
      lfo.connect(depth).connect(oscs[0].frequency);
      lfo.start();
      this.laserNodes = { oscs: [...oscs, lfo], gain };
    } else if (!on && this.laserNodes) {
      const { oscs, gain } = this.laserNodes;
      gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
      for (const o of oscs) o.stop(ctx.currentTime + 0.15);
      this.laserNodes = null;
    }
  }

  missile(): void {
    if (!this.throttle('missile', 0.1)) return;
    this.noise({ dur: 0.25, vol: 0.08, filter: 'bandpass', freq: vary(1600), to: 400 });
    this.tone({ type: 'triangle', freq: 300, to: vary(900), dur: 0.15, vol: 0.03 });
  }

  /** Münze: mehrere schnell hintereinander steigen in der Tonhöhe (Combo). */
  coin(): void {
    if (!this.throttle('coin', 0.03) || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.coinCombo = now - this.lastCoin < 0.4 ? Math.min(this.coinCombo + 1, 12) : 0;
    this.lastCoin = now;
    const f = 988 * Math.pow(2, this.coinCombo / 12);
    this.tone({ type: 'square', freq: f, dur: 0.05, vol: 0.045 });
    this.tone({ type: 'square', freq: f * 1.335, dur: 0.11, vol: 0.045, delay: 0.05 });
  }

  playerHit(): void {
    this.tone({ type: 'sawtooth', freq: vary(420), to: 70, dur: 0.4, vol: 0.14 });
    this.noise({ dur: 0.3, vol: 0.2, filter: 'bandpass', freq: 900, to: 200 });
  }

  /** Schild fängt einen Treffer ab. */
  shieldHit(): void {
    this.tone({ type: 'sawtooth', freq: vary(1800), to: 500, dur: 0.18, vol: 0.08 });
    this.bell(vary(1400), 0.4, 0.05, { reverb: 0.3 });
  }

  /** Power-up eingesammelt: jede Sorte mit eigener Figur. */
  powerUp(kind: PowerUpSound): void {
    switch (kind) {
      case 'repair':
        [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.12, vol: 0.08, delay: i * 0.06 }));
        break;
      case 'shield':
        [880, 1320, 1760].forEach((f, i) => this.bell(f, 0.6, 0.05, { delay: i * 0.07, reverb: 0.4 }));
        break;
      case 'fan':
        [659, 880, 1109, 1319, 1760].forEach((f, i) => this.tone({ type: 'square', freq: f, dur: 0.07, vol: 0.05, delay: i * 0.045 }));
        break;
      case 'laser':
        this.tone({ type: 'sawtooth', freq: 200, to: 1600, dur: 0.45, vol: 0.07, lowpass: 3000 });
        this.tone({ type: 'square', freq: 400, to: 3200, dur: 0.45, vol: 0.03 });
        break;
      case 'missile':
        this.noise({ dur: 0.4, vol: 0.12, filter: 'bandpass', freq: 400, to: 3000 });
        [440, 660, 880].forEach((f, i) => this.tone({ type: 'square', freq: f, dur: 0.06, vol: 0.05, delay: 0.1 + i * 0.05 }));
        break;
      case 'option':
        [784, 988, 1175].forEach((f, i) => {
          this.tone({ type: 'triangle', freq: f, dur: 0.15, vol: 0.06, delay: i * 0.08 });
          this.tone({ type: 'triangle', freq: f * 1.5, dur: 0.15, vol: 0.04, delay: i * 0.08 + 0.04 });
        });
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Gegner: Treffer, Explosionen und Schüsse je nach Material und Fraktion
  // -------------------------------------------------------------------------

  hit(material: Material = 'metal'): void {
    if (!this.throttle(`hit-${material}`, 0.035)) return;
    if (material === 'void') {
      // Hohles, rückwärts klingendes Schlürfen
      this.tone({ type: 'sine', freq: vary(90), to: vary(420), dur: 0.08, vol: 0.07 });
      this.noise({ dur: 0.06, vol: 0.05, filter: 'bandpass', freq: vary(500), to: 1500, q: 6 });
    } else if (material === 'slime') {
      // Blubbern
      this.tone({ type: 'sine', freq: vary(320, 0.2), to: 120, dur: 0.07, vol: 0.08 });
      this.noise({ dur: 0.05, vol: 0.05, filter: 'bandpass', freq: vary(900), q: 5 });
    } else if (material === 'flesh') {
      // Quietschen und Matschen
      this.noise({ dur: 0.08, vol: 0.12, filter: 'bandpass', freq: vary(600, 0.25), to: 180, q: 3 });
      this.tone({ type: 'sine', freq: vary(160), to: 70, dur: 0.07, vol: 0.06 });
    } else if (material === 'crystal') {
      this.bell(vary(pick([1900, 2200, 2500]), 0.05), 0.18, 0.03, { reverb: 0.25, ratio: 2.76 });
    } else {
      this.noise({ dur: 0.05, vol: 0.12, filter: 'highpass', freq: 2500 });
      this.tone({ type: 'square', freq: vary(260, 0.12), to: 140, dur: 0.05, vol: 0.04 });
    }
  }

  explode(size: 1 | 2 | 3, material: Material = 'metal'): void {
    if (!this.throttle(`explode-${material}-${size}`, 0.04)) return;
    const dur = [0, 0.35, 0.6, 1.1][size];
    if (material === 'void') {
      // Implosion: Sog nach innen, dann ein dumpfer Knall
      this.noise({ dur: dur * 0.5, vol: 0.12 + size * 0.05, filter: 'bandpass', freq: 3000, to: 200, q: 2 });
      this.tone({ type: 'sine', freq: vary(600), to: 50, dur: dur * 0.5, vol: 0.18 + size * 0.06 });
      this.tone({ type: 'sine', freq: 70, to: 30, dur: dur, vol: 0.25 + size * 0.08, delay: dur * 0.45, reverb: 0.3 });
    } else if (material === 'slime') {
      // Platschen, dann aufsteigende Blasen
      this.noise({ dur: dur * 0.8, vol: 0.18 + size * 0.06, filter: 'bandpass', freq: vary(1300), to: 220, q: 2 });
      this.tone({ type: 'sine', freq: vary(90), to: 40, dur: dur * 0.7, vol: 0.22 + size * 0.07 });
      for (let i = 0; i < 2 + size * 2; i++) {
        const f = rnd(200, 500);
        this.tone({ type: 'sine', freq: f, to: f * 2.4, dur: 0.06, vol: 0.05, delay: rnd(0.04, dur) });
      }
    } else if (material === 'flesh') {
      // Platschen mit Blubbern
      this.noise({ dur: dur * 0.9, vol: 0.2 + size * 0.07, filter: 'bandpass', freq: vary(1000, 0.2), to: 140, q: 1.5 });
      this.tone({ type: 'sine', freq: vary(110), to: 35, dur: dur * 0.8, vol: 0.25 + size * 0.08 });
      for (let i = 0; i < size + 1; i++) this.tone({ type: 'sine', freq: rnd(250, 500), to: rnd(80, 140), dur: 0.08, vol: 0.06, delay: rnd(0.03, dur * 0.6) });
      if (size >= 2) this.chitter(4, 2600, 0.025, 0.05);
    } else if (material === 'crystal') {
      // Glas zersplittert, dazu ein tiefer Schlag im Hall
      this.noise({ dur: dur * 0.6, vol: 0.12 + size * 0.04, filter: 'highpass', freq: 3000, reverb: 0.3 });
      this.tone({ type: 'sine', freq: vary(120), to: 40, dur: dur, vol: 0.22 + size * 0.08 });
      for (let i = 0; i < 3 + size * 3; i++) this.bell(rnd(1800, 4200), rnd(0.15, 0.4), 0.02, { delay: rnd(0, dur * 0.5), ratio: 2.76, echo: 0.2 });
    } else {
      this.noise({ dur, vol: 0.22 + size * 0.08, filter: 'lowpass', freq: vary(2400), to: 120 });
      this.tone({ type: 'sine', freq: vary(140), to: 35, dur: dur * 0.9, vol: 0.25 + size * 0.1 });
      // Scheppernde Trümmer
      for (let i = 0; i < size; i++) this.tone({ type: 'square', freq: rnd(900, 1800), to: rnd(400, 700), dur: 0.04, vol: 0.025, delay: rnd(0.05, dur * 0.7) });
    }
  }

  /** Gegnerschüsse je nach Art unterschiedlich. */
  enemyShot(style: ShotSound): void {
    if (!this.throttle(`shot-${style}`, style === 'boss' ? 0.09 : 0.07)) return;
    switch (style) {
      case 'acid':
        // Spucken: zischend, mit Blubberblase
        this.noise({ dur: 0.14, vol: 0.09, filter: 'bandpass', freq: vary(1300, 0.15), to: 400, q: 2 });
        this.tone({ type: 'sine', freq: vary(380), to: 900, dur: 0.05, vol: 0.05, delay: 0.03 });
        break;
      case 'aether':
        this.bell(vary(1200, 0.06), 0.12, 0.035, { ratio: 2.5, index: 2, echo: 0.25 });
        break;
      case 'orb':
        this.tone({ type: 'sine', freq: vary(400), to: 240, dur: 0.35, vol: 0.06, vibrato: [14, 40], reverb: 0.3 });
        break;
      case 'boss':
        this.tone({ type: 'sine', freq: vary(300), to: 620, dur: 0.09, vol: 0.06 });
        break;
      case 'slime':
        // Schleimkugel: ein dickes „Blopp“
        this.tone({ type: 'sine', freq: vary(160), to: 420, dur: 0.12, vol: 0.08 });
        this.noise({ dur: 0.08, vol: 0.04, filter: 'bandpass', freq: 700, q: 4 });
        break;
      case 'tracer':
        // Maschinenkanone: trocken und kurz
        this.noise({ dur: 0.04, vol: 0.1, filter: 'bandpass', freq: vary(2200), q: 1.5 });
        this.tone({ type: 'square', freq: vary(180), to: 90, dur: 0.04, vol: 0.04 });
        break;
      case 'void':
        this.tone({ type: 'sine', freq: vary(700), to: 140, dur: 0.18, vol: 0.06, vibrato: [20, 60], echo: 0.2 });
        break;
      case 'bio':
        // Elektrisches Knistern
        this.noise({ dur: 0.12, vol: 0.09, filter: 'highpass', freq: 3000 });
        this.tone({ type: 'square', freq: vary(1200), to: 300, dur: 0.1, vol: 0.03 });
        break;
      case 'spike':
        this.noise({ dur: 0.05, vol: 0.08, filter: 'bandpass', freq: vary(3500), q: 3 });
        break;
      case 'bolt':
        // Laserbolzen: heller Pfeifton mit schnellem Abfall
        this.tone({ type: 'sawtooth', freq: vary(1800, 0.08), to: 500, dur: 0.1, vol: 0.04, lowpass: 5000 });
        break;
      case 'shard':
        this.bell(vary(2600, 0.1), 0.08, 0.025, { ratio: 3.5, index: 1.5 });
        this.noise({ dur: 0.03, vol: 0.03, filter: 'highpass', freq: 7000 });
        break;
      default:
        this.tone({ type: 'triangle', freq: vary(520, 0.1), to: 180, dur: 0.14, vol: 0.07 });
    }
  }

  /** Schwärmer schlüpfen oder schwärmen aus. */
  swarm(): void {
    if (!this.throttle('swarm', 0.35)) return;
    this.chitter(Math.floor(rnd(4, 8)), rnd(2200, 3200), 0.03);
  }

  /** Eine Brutmutter zerplatzt oder ein Ei schlüpft. */
  squelch(): void {
    if (!this.throttle('squelch', 0.15)) return;
    this.noise({ dur: 0.3, vol: 0.18, filter: 'bandpass', freq: vary(500), to: 1400, q: 2.5 });
    this.tone({ type: 'sine', freq: vary(90), to: 50, dur: 0.25, vol: 0.15 });
    this.chitter(5, 2600, 0.03, 0.1);
  }

  /** Warp-Sprung eines Phasengleiters. */
  warp(): void {
    if (!this.throttle('warp', 0.08)) return;
    this.tone({ type: 'sine', freq: vary(220), to: vary(1500), dur: 0.28, vol: 0.05, echo: 0.3 });
    this.noise({ dur: 0.2, vol: 0.04, filter: 'highpass', freq: 4000 });
  }

  /** Schuss prallt an einem Energieschild ab. */
  shieldZap(): void {
    if (!this.throttle('shieldZap', 0.06)) return;
    this.bell(vary(900, 0.1), 0.12, 0.03, { ratio: 1.41, index: 3 });
  }

  /** Schuss prallt an Panzerung ab; klingt je nach Material anders. */
  clink(material: Material = 'metal'): void {
    if (!this.throttle(`clink-${material}`, 0.06)) return;
    if (material === 'void') this.tone({ type: 'sine', freq: vary(160), to: 320, dur: 0.06, vol: 0.04 });
    else if (material === 'slime') this.tone({ type: 'sine', freq: vary(220), to: 160, dur: 0.05, vol: 0.05 });
    else if (material === 'flesh') this.noise({ dur: 0.05, vol: 0.06, filter: 'bandpass', freq: vary(800), q: 4 });
    else if (material === 'crystal') this.bell(vary(3000, 0.1), 0.08, 0.02, { ratio: 1.41 });
    else {
      this.tone({ type: 'triangle', freq: vary(2400, 0.1), to: 1900, dur: 0.05, vol: 0.05 });
      this.noise({ dur: 0.03, vol: 0.04, filter: 'highpass', freq: 6000 });
    }
  }

  /** Feindlicher Strahl beginnt zu laden (Vorwarnung). */
  beamCharge(): void {
    if (!this.throttle('beamCharge', 0.2)) return;
    this.tone({ type: 'sine', freq: 300, to: 1200, dur: 1.0, vol: 0.05, vibrato: [18, 50] });
  }

  /** Feindlicher Strahl feuert. */
  beamFire(): void {
    if (!this.throttle('beamFire', 0.2)) return;
    this.noise({ dur: 0.8, vol: 0.14, filter: 'lowpass', freq: 2500, to: 600 });
    this.tone({ type: 'sawtooth', freq: 110, to: 80, dur: 0.8, vol: 0.07, lowpass: 1800 });
    this.bell(vary(1600), 0.6, 0.03, { reverb: 0.4 });
  }

  waveStart(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'square', freq: f, dur: 0.1, vol: 0.05, delay: i * 0.08 }));
  }

  gameOver(): void {
    [392, 330, 262, 196].forEach((f, i) => this.tone({ type: 'triangle', freq: f, to: f * 0.97, dur: 0.3, vol: 0.12, delay: i * 0.22 }));
  }

  // -------------------------------------------------------------------------
  // Werft
  // -------------------------------------------------------------------------

  shopOpen(): void {
    [392, 523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.18, vol: 0.07, delay: i * 0.07, echo: 0.2 }));
  }

  shopMove(): void {
    if (!this.throttle('shopMove', 0.04)) return;
    this.tone({ type: 'square', freq: 880, dur: 0.03, vol: 0.03 });
  }

  /** Kauf: Münzen klimpern, dann ein Aufwärts-Akkord. */
  shopBuy(): void {
    for (let i = 0; i < 4; i++) this.tone({ type: 'square', freq: vary(1319, 0.04), dur: 0.05, vol: 0.04, delay: i * 0.04 });
    [784, 988, 1175, 1568].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.2, vol: 0.06, delay: 0.16 + i * 0.05 }));
  }

  shopDeny(): void {
    this.tone({ type: 'square', freq: 196, dur: 0.12, vol: 0.06 });
    this.tone({ type: 'square', freq: 185, dur: 0.16, vol: 0.06, delay: 0.1 });
  }

  // -------------------------------------------------------------------------
  // Endgegner
  // -------------------------------------------------------------------------

  /** Ankündigung: Sirene, Brüllen oder Chor, je nach Endgegner. */
  bossWarning(theme: BossTheme): void {
    if (theme === 'mothership') {
      for (let i = 0; i < 3; i++) {
        this.tone({ type: 'square', freq: 880, dur: 0.26, vol: 0.07, delay: i * 0.6 });
        this.tone({ type: 'square', freq: 622, dur: 0.26, vol: 0.07, delay: i * 0.6 + 0.3 });
      }
    } else if (theme === 'cabrio') {
      // Hupe und quietschende Reifen
      for (let i = 0; i < 2; i++) {
        this.tone({ type: 'square', freq: 392, dur: 0.22, vol: 0.09, delay: i * 0.35 });
        this.tone({ type: 'square', freq: 494, dur: 0.22, vol: 0.07, delay: i * 0.35 });
      }
      this.noise({ dur: 0.9, vol: 0.12, filter: 'bandpass', freq: 2600, to: 1600, q: 6, delay: 0.8 });
    } else if (theme === 'kosmograd' || theme === 'unitas') {
      // Funkspruch: Piepser und Rauschen
      this.noise({ dur: 2.2, vol: 0.05, filter: 'bandpass', freq: 1800, q: 1.2 });
      for (let i = 0; i < 4; i++) this.tone({ type: 'sine', freq: theme === 'kosmograd' ? 1100 : 1500, dur: 0.12, vol: 0.06, delay: 0.3 + i * 0.4 });
      this.tone({ type: 'sawtooth', freq: 70, dur: 2.4, vol: 0.08, attack: 0.6, lowpass: 400, delay: 0.2, reverb: 0.4 });
    } else if (theme === 'squadron') {
      // Vorbeiflug: Doppler-Sirren
      for (let i = 0; i < 3; i++) this.tone({ type: 'sawtooth', freq: 900, to: 300, dur: 0.6, vol: 0.06, lowpass: 3000, delay: i * 0.45 });
      this.noise({ dur: 1.8, vol: 0.1, filter: 'bandpass', freq: 800, to: 300, delay: 0.1 });
    } else if (theme === 'odysseus') {
      // Ringantrieb fährt hoch
      this.tone({ type: 'sine', freq: 110, to: 880, dur: 2.2, vol: 0.12, vibrato: [7, 40], reverb: 0.4 });
      [76, 81, 88].forEach((m, i) => this.bell(midiToFreq(m), 1.2, 0.05, { delay: 1 + i * 0.25, echo: 0.3 }));
    } else if (theme === 'worldbreaker') {
      // Schwere, langsame Schritte einer gewaltigen Maschine
      for (let i = 0; i < 4; i++) {
        this.tone({ type: 'sine', freq: 55, to: 30, dur: 0.6, vol: 0.55, delay: i * 0.7 });
        this.noise({ dur: 0.5, vol: 0.18, filter: 'lowpass', freq: 500, delay: i * 0.7 });
      }
      this.tone({ type: 'sawtooth', freq: 41, dur: 3, vol: 0.12, attack: 1, lowpass: 300, reverb: 0.5 });
    } else if (theme === 'singularity') {
      // Tiefer Gravitations-Wub, der immer langsamer wird
      for (let i = 0; i < 5; i++) this.tone({ type: 'sine', freq: 90 - i * 10, to: 30, dur: 0.5 + i * 0.1, vol: 0.4, delay: i * (0.4 + i * 0.12), reverb: 0.4 });
      this.noise({ dur: 3, vol: 0.08, filter: 'bandpass', freq: 3000, to: 120, q: 2, reverb: 0.5 });
    } else if (theme === 'leviathan') {
      // Walgesang und Sonar
      this.tone({ type: 'sine', freq: 180, to: 420, dur: 1.4, vol: 0.18, vibrato: [4, 80], reverb: 0.6 });
      this.tone({ type: 'sine', freq: 420, to: 140, dur: 1.6, vol: 0.16, vibrato: [5, 100], reverb: 0.6, delay: 1.3 });
      for (let i = 0; i < 3; i++) this.bell(1320, 0.8, 0.06, { delay: 0.4 + i * 0.9, ratio: 1, index: 0.2, echo: 0.6 });
    } else if (theme === 'urschleim') {
      // Gurgeln aus der Tiefe
      this.growl(70, 45, 2.2, 0.3, [300, 800], { reverb: 0.5 });
      for (let i = 0; i < 8; i++) this.tone({ type: 'sine', freq: rnd(120, 260), to: rnd(60, 90), dur: 0.15, vol: 0.12, delay: 0.3 + i * 0.2 });
    } else if (theme === 'rocket') {
      // Countdown und Zündung
      for (let i = 0; i < 3; i++) this.tone({ type: 'sine', freq: 880, dur: 0.12, vol: 0.08, delay: i * 0.5 });
      this.tone({ type: 'sine', freq: 1760, dur: 0.3, vol: 0.08, delay: 1.5 });
      this.noise({ dur: 2.6, vol: 0.35, filter: 'lowpass', freq: 150, to: 1800, delay: 1.6 });
      this.tone({ type: 'sawtooth', freq: 40, to: 70, dur: 2.6, vol: 0.18, lowpass: 400, delay: 1.6 });
    } else if (theme === 'fortress') {
      // Tiefes Nebelhorn
      for (const f of [55, 82.4]) this.tone({ type: 'sawtooth', freq: f, dur: 2.8, vol: 0.12, attack: 0.8, lowpass: 450, reverb: 0.5 });
      this.tone({ type: 'sawtooth', freq: 55, dur: 1.4, vol: 0.12, attack: 0.3, lowpass: 450, delay: 3, reverb: 0.5 });
    } else if (theme === 'shardswarm') {
      // Fallende Kristallkaskade
      for (let i = 0; i < 18; i++) this.bell(midiToFreq(100 - i * 2), 0.8, 0.04, { delay: i * 0.08, ratio: 3.5, index: 1.2, echo: 0.3 });
      this.noise({ dur: 2, vol: 0.06, filter: 'highpass', freq: 6000, reverb: 0.5 });
    } else if (theme === 'queen') {
      this.growl(110, 55, 2.2, 0.35, [450, 1100], { reverb: 0.5 });
      for (let i = 0; i < 4; i++) this.tone({ type: 'sine', freq: 70, to: 40, dur: 0.18, vol: 0.4, delay: 0.6 + i * 0.45 });
      this.chitter(10, 2400, 0.03, 1.2);
    } else {
      // Chor aus verstimmten Sägezähnen, der anschwillt, dazu Glocken
      for (const m of [50, 57, 62, 65]) {
        for (const d of [-8, 8]) {
          this.tone({ type: 'sawtooth', freq: midiToFreq(m) * Math.pow(2, d / 1200), dur: 2.6, vol: 0.03, attack: 1.2, lowpass: 1400, reverb: 0.5 });
        }
      }
      [74, 81, 86].forEach((m, i) => this.bell(midiToFreq(m), 1.4, 0.05, { delay: 0.8 + i * 0.35, reverb: 0.5, echo: 0.3 }));
    }
  }

  /** Mutterschiff: Panzertore gleiten auf. */
  doorOpen(): void {
    this.tone({ type: 'sawtooth', freq: 70, to: 260, dur: 1.3, vol: 0.12 });
    this.noise({ dur: 1.3, vol: 0.12, filter: 'lowpass', freq: 500 });
    this.noise({ dur: 0.15, vol: 0.35, filter: 'bandpass', freq: 1100, delay: 1.35 });
  }

  /** Königin reißt brüllend die Kiefer auf. */
  roar(): void {
    this.growl(vary(95), 60, 1.3, 0.32, [500, 1250], { reverb: 0.35 });
    this.noise({ dur: 1.1, vol: 0.1, filter: 'bandpass', freq: 700, to: 300, q: 1.2 });
  }

  /** Königin zuckt schreiend zurück. */
  screech(): void {
    this.growl(vary(380), 900, 0.7, 0.22, [1200, 2600], { reverb: 0.3 });
    this.chitter(8, 3000, 0.03, 0.1);
  }

  /** Tentakelglied abgeschossen. */
  sever(): void {
    if (!this.throttle('sever', 0.08)) return;
    this.noise({ dur: 0.12, vol: 0.14, filter: 'bandpass', freq: vary(1400), to: 300, q: 2 });
    this.tone({ type: 'sine', freq: vary(220), to: 90, dur: 0.1, vol: 0.08 });
  }

  /** Königin legt ein Ei. */
  eggLay(): void {
    if (!this.throttle('eggLay', 0.2)) return;
    this.noise({ dur: 0.25, vol: 0.12, filter: 'bandpass', freq: 300, to: 900, q: 3 });
    this.tone({ type: 'sine', freq: 140, to: 60, dur: 0.2, vol: 0.12 });
  }

  /** Arche: Runenkristall leuchtet auf oder wird getroffen (eigener Ton je Kristall). */
  glyph(i: number): void {
    const f = midiToFreq(GLYPH_NOTES[i % GLYPH_NOTES.length]);
    this.bell(f, 0.9, 0.08, { ratio: 2, index: 0.8, reverb: 0.4, echo: 0.2 });
    this.tone({ type: 'sine', freq: f / 2, dur: 0.6, vol: 0.05 });
  }

  /** Arche: falsche Reihenfolge. */
  glyphFail(): void {
    this.tone({ type: 'sawtooth', freq: 146.8, dur: 0.6, vol: 0.08, lowpass: 1500 });
    this.tone({ type: 'sawtooth', freq: 155.6, dur: 0.6, vol: 0.08, lowpass: 1500 });
    this.noise({ dur: 0.4, vol: 0.08, filter: 'bandpass', freq: 600 });
  }

  /** Arche: Folge geschafft, der Schild fällt. */
  glyphSuccess(): void {
    [74, 78, 81, 86, 90].forEach((m, i) => this.bell(midiToFreq(m), 1.2, 0.06, { delay: i * 0.08, reverb: 0.5, echo: 0.3 }));
    this.tone({ type: 'sine', freq: 600, to: 120, dur: 1.2, vol: 0.08, delay: 0.3 });
  }

  /** Urschleim teilt sich. */
  split(): void {
    this.noise({ dur: 0.35, vol: 0.2, filter: 'bandpass', freq: 600, to: 1800, q: 2 });
    this.tone({ type: 'sine', freq: vary(140), to: 60, dur: 0.3, vol: 0.2 });
    this.tone({ type: 'sine', freq: vary(300), to: 700, dur: 0.15, vol: 0.08, delay: 0.1 });
  }

  /** Raketentriebwerk zündet. */
  ignite(): void {
    if (!this.throttle('ignite', 0.25)) return;
    this.noise({ dur: 0.9, vol: 0.2, filter: 'lowpass', freq: 300, to: 1600 });
    this.tone({ type: 'sawtooth', freq: 45, to: 80, dur: 0.9, vol: 0.1, lowpass: 500 });
  }

  /** Heiße Stufentrennung. */
  separation(): void {
    this.noise({ dur: 1.4, vol: 0.4, filter: 'lowpass', freq: 3000, to: 100 });
    this.tone({ type: 'sine', freq: 90, to: 30, dur: 1.2, vol: 0.45 });
    this.tone({ type: 'square', freq: 1200, to: 300, dur: 0.2, vol: 0.06, delay: 0.1 });
  }

  /** Traktorstrahl der Asteroidenfestung. */
  tractor(): void {
    this.tone({ type: 'sine', freq: 110, to: 160, dur: 2.2, vol: 0.12, vibrato: [6, 120], reverb: 0.3 });
    this.tone({ type: 'triangle', freq: 220, to: 330, dur: 2.2, vol: 0.05, vibrato: [6, 120] });
  }

  /** Kristallsplitter wachsen nach. */
  regrow(): void {
    if (!this.throttle('regrow', 0.15)) return;
    this.bell(vary(3200, 0.15), 0.25, 0.02, { ratio: 3.5, echo: 0.3 });
  }

  /** Kristallschwarm dehnt sich aus. */
  pulse(): void {
    this.tone({ type: 'sine', freq: 200, to: 900, dur: 0.7, vol: 0.08, reverb: 0.4 });
    this.noise({ dur: 0.7, vol: 0.08, filter: 'highpass', freq: 3000, to: 8000 });
  }

  /** Singularität: ein Generator fällt, der Sog wird stärker. */
  gravity(): void {
    this.tone({ type: 'sine', freq: 50, to: 25, dur: 1.2, vol: 0.4, reverb: 0.4 });
    this.tone({ type: 'sawtooth', freq: 400, to: 60, dur: 0.8, vol: 0.06, lowpass: 1200 });
  }

  /** Etwas wird vom Schwarzen Loch verschluckt. */
  swallow(): void {
    if (!this.throttle('swallow', 0.12)) return;
    this.tone({ type: 'sine', freq: vary(900), to: 60, dur: 0.2, vol: 0.03 });
  }

  /** Leviathan brüllt (vor Sturzangriffen). */
  whale(): void {
    this.tone({ type: 'sine', freq: vary(140), to: 320, dur: 0.9, vol: 0.2, vibrato: [5, 90], reverb: 0.5 });
    this.growl(80, 60, 0.9, 0.12, [400, 900], { reverb: 0.4 });
  }

  /** Leviathan verliert ein Schwanzstück. */
  shed(): void {
    this.noise({ dur: 0.3, vol: 0.15, filter: 'bandpass', freq: 800, to: 300, q: 2 });
    this.tone({ type: 'sine', freq: 200, to: 80, dur: 0.3, vol: 0.12 });
  }

  /** Sternencabrio hupt. */
  honk(): void {
    if (!this.throttle('honk', 0.5)) return;
    this.tone({ type: 'square', freq: 392, dur: 0.25, vol: 0.09 });
    this.tone({ type: 'square', freq: 494, dur: 0.25, vol: 0.07 });
  }

  /** Ein Stationsmodul bricht ab. */
  detach(): void {
    this.noise({ dur: 0.6, vol: 0.2, filter: 'bandpass', freq: 1200, to: 200, q: 2 });
    this.tone({ type: 'square', freq: 220, to: 60, dur: 0.5, vol: 0.06 });
    for (let i = 0; i < 4; i++) this.tone({ type: 'square', freq: rnd(1200, 2400), dur: 0.03, vol: 0.03, delay: rnd(0, 0.4) });
  }

  /** Schuss wird von einem Solarsegel zurückgespiegelt. */
  reflect(): void {
    if (!this.throttle('reflect', 0.07)) return;
    this.bell(vary(2200, 0.1), 0.1, 0.03, { ratio: 1.41, index: 2 });
  }

  /** Odysseus teleportiert sich. */
  teleport(): void {
    this.tone({ type: 'sine', freq: 300, to: 2400, dur: 0.5, vol: 0.06, vibrato: [30, 80], echo: 0.3 });
    this.noise({ dur: 0.4, vol: 0.05, filter: 'highpass', freq: 5000 });
  }

  /** Countdown-Tick des Weltenbrechers (die letzten Sekunden höher). */
  tick(urgent = false): void {
    this.tone({ type: 'square', freq: urgent ? 1320 : 880, dur: 0.05, vol: urgent ? 0.07 : 0.04 });
  }

  /** Superwaffe lädt. */
  superCharge(): void {
    this.tone({ type: 'sawtooth', freq: 60, to: 900, dur: 2, vol: 0.12, lowpass: 2500, reverb: 0.4 });
    this.noise({ dur: 2, vol: 0.12, filter: 'bandpass', freq: 300, to: 6000, q: 1.5 });
  }

  /** Superwaffe feuert. */
  superFire(): void {
    this.noise({ dur: 1.8, vol: 0.5, filter: 'lowpass', freq: 5000, to: 200, reverb: 0.4 });
    this.tone({ type: 'sawtooth', freq: 80, to: 40, dur: 1.8, vol: 0.25, lowpass: 1200 });
    this.tone({ type: 'sine', freq: 50, to: 25, dur: 1.8, vol: 0.5 });
  }

  /** Lange Todessequenz eines Endgegners. */
  bossDeath(material: Material): void {
    if (material === 'void') {
      // Kollaps: alles wird eingesaugt, dann Stille, dann ein gewaltiger Knall
      this.noise({ dur: 2.2, vol: 0.3, filter: 'bandpass', freq: 6000, to: 80, q: 1.5 });
      this.tone({ type: 'sine', freq: 1200, to: 40, dur: 2.2, vol: 0.2 });
      this.noise({ dur: 2, vol: 0.5, filter: 'lowpass', freq: 3000, to: 60, delay: 2.4, reverb: 0.5 });
      this.tone({ type: 'sine', freq: 60, to: 20, dur: 2, vol: 0.5, delay: 2.4 });
    } else if (material === 'slime') {
      this.noise({ dur: 2.8, vol: 0.3, filter: 'bandpass', freq: 1500, to: 120, q: 1.5 });
      for (let i = 0; i < 16; i++) this.tone({ type: 'sine', freq: rnd(150, 450), to: rnd(500, 1200), dur: 0.1, vol: 0.06, delay: rnd(0, 2.5) });
    } else if (material === 'flesh') {
      this.growl(260, 40, 3.2, 0.35, [600, 1500], { reverb: 0.5 });
      this.noise({ dur: 3.4, vol: 0.35, filter: 'bandpass', freq: 900, to: 90, q: 1.2 });
    } else if (material === 'crystal') {
      this.noise({ dur: 3.4, vol: 0.25, filter: 'highpass', freq: 2000, to: 300, reverb: 0.5 });
      for (let i = 0; i < 24; i++) this.bell(rnd(1200, 5000), rnd(0.3, 0.8), 0.025, { delay: rnd(0, 3), echo: 0.3 });
      for (const m of [50, 57, 62]) this.tone({ type: 'sawtooth', freq: midiToFreq(m), to: midiToFreq(m - 12), dur: 3.4, vol: 0.04, attack: 0.5, lowpass: 1200, reverb: 0.6 });
    } else {
      this.noise({ dur: 3.6, vol: 0.45, filter: 'lowpass', freq: 3200, to: 60 });
      this.tone({ type: 'sine', freq: 95, to: 25, dur: 3.6, vol: 0.5 });
    }
  }

  // -------------------------------------------------------------------------
  // Musik
  // -------------------------------------------------------------------------

  /** Sektor-Musik wählen (Index in SECTOR_SONGS). */
  setSector(sector: number): void {
    this.sectorSong = SONGS[SECTOR_SONGS[sector % SECTOR_SONGS.length]];
    if (this.musicMode === 'normal') this.setMusic('normal');
  }

  /** Musikstück wechseln: Sektor-Musik oder der Track eines Endgegners. Beginnt sofort mit dem ersten Abschnitt. */
  setMusic(mode: MusicMode): void {
    this.musicMode = mode;
    const song = mode === 'normal' ? this.sectorSong : SONGS[mode];
    if (song === this.song) return;
    this.song = song;
    this.step = 0;
    this.phrase = 0;
    this.beginSection();
    if (this.ctx) this.nextStepTime = Math.max(this.nextStepTime, this.ctx.currentTime + 0.05);
  }

  /**
   * Spielintensität 0..1 (z. B. Anzahl Gegner). Wird geglättet; bestimmt beim nächsten Abschnitt,
   * ob es ruhiger (zwischen Wellen) oder dichter (viele Gegner) weitergeht.
   */
  setIntensity(target: number, dt: number): void {
    this.intensity += (clamp01(target) - this.intensity) * Math.min(1, dt * 0.35);
  }

  private startMusic(): void {
    if (!this.ctx) return;
    this.step = 0;
    this.phrase = 0;
    this.beginSection();
    this.nextStepTime = this.ctx.currentTime + 0.1;
    window.clearInterval(this.musicTimer);
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 25);
  }

  /** Einfacher Sequenzer mit Vorausplanung, läuft unabhängig von der Framerate. */
  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // Nach einer langen Unterbrechung nicht alle verpassten Schritte nachholen
    if (this.nextStepTime < ctx.currentTime - 0.2) this.nextStepTime = ctx.currentTime + 0.05;
    const stepLen = 60 / this.song.tempo / 4;
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      if (this.step === 0 && this.sectionStarted !== this.phrase) this.applySectionFilter(this.nextStepTime, stepLen);
      this.playStep(this.step, this.nextStepTime - ctx.currentTime, stepLen);
      this.nextStepTime += stepLen;
      this.step = (this.step + 1) % LOOP_STEPS;
      if (this.step === 0) {
        this.phrase++;
        this.beginSection();
      }
    }
  }

  /** Nächsten Abschnitt wählen: nach Plan, aber angepasst an die Spielintensität. */
  private beginSection(): void {
    const boss = this.musicMode !== 'normal';
    const plan = boss ? BOSS_PLAN : SECTOR_PLAN;
    // Nach dem ersten Durchlauf ohne Intro weiter
    const i = this.phrase < plan.length ? this.phrase : 1 + ((this.phrase - 1) % (plan.length - 1));
    let section = SECTIONS[plan[i]];
    if (!boss && this.phrase > 0) {
      const calm = this.intensity < 0.18;
      const loud = section.drums === 'off' || section.name === 'build';
      // Ruhige Phase im Spiel (zwischen Wellen, Werft): kein voller Einsatz, sondern ein ruhiger Abschnitt
      if (calm && !loud) section = SECTIONS.calm;
      // Viel los: Schlagzeug verdichten
      else if (this.intensity > 0.65 && section.drums === 'normal') section = { ...section, drums: 'busy' };
    }
    this.prevSection = this.section;
    this.section = section;
    this.lead = buildLead(this.song, section, this.phrase * 7919 + this.song.tempo);
  }

  /** Tiefpass-Fahrt über den Abschnitt (Intro öffnet sich, Aufbau rauscht nach oben). */
  private applySectionFilter(at: number, stepLen: number): void {
    this.sectionStarted = this.phrase;
    const f = this.musicFilter.frequency;
    const [from, to] = this.section.filter;
    f.cancelScheduledValues(at);
    f.setValueAtTime(from, at);
    if (to !== from) f.exponentialRampToValueAtTime(to, at + stepLen * LOOP_STEPS);
  }

  private playStep(step: number, delay: number, len: number): void {
    const song = this.song;
    const L = this.section;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const root = rootAt(song, bar, L);
    const chord = chordAt(song, bar, L);
    const m: Route = { bus: 'music' };
    const melody = this.lead.find(([at]) => at === step);
    const lv = L.leadVol;
    const arpIdx = L.arp[s % 4];
    // Im Wirbel am Ende des Abschnitts schweigt das normale Schlagzeug
    const fillNow = L.fill && bar === 3 && s >= 12;
    const drums = (L.drums === 'normal' || L.drums === 'busy') && !fillNow;
    const fullBass = L.bass === 'full';

    switch (song.style) {
      case 'chip':
      case 'mothership': {
        const drive = song.style === 'mothership';
        if (fullBass && (drive || s % 2 === 0)) {
          const note = root + (s % 4 === 2 ? 12 : 0);
          this.tone({ ...m, type: drive ? 'sawtooth' : 'triangle', freq: midiToFreq(note), dur: len * (drive ? 0.9 : 1.8), vol: drive ? 0.22 : 0.5, delay });
        }
        if (L.harm) {
          const arp = [chord[0], chord[1], chord[2], chord[0] + 12][arpIdx] + 12;
          this.tone({ ...m, type: 'square', freq: midiToFreq(arp), dur: len * 0.8, vol: 0.06, delay });
        }
        if (melody) this.tone({ ...m, type: 'square', freq: midiToFreq(melody[1]), dur: len * melody[2] * 0.95, vol: 0.12 * lv, delay });
        if (drums) {
          const kick = drive ? s % 4 === 0 : s === 0 || s === 8 || s === 10;
          if (kick) this.tone({ ...m, type: 'sine', freq: 150, to: 40, dur: 0.14, vol: 0.7, delay });
          if (s === 4 || s === 12) this.noise({ ...m, dur: 0.12, vol: 0.35, filter: 'bandpass', freq: 1800, delay });
          if (s % 2 === 1) this.noise({ ...m, dur: 0.03, vol: 0.12, filter: 'highpass', freq: 7000, delay });
        }
        break;
      }

      case 'swarm': {
        if (fullBass && [0, 3, 6, 8, 11, 14].includes(s)) this.tone({ ...m, type: 'sawtooth', freq: midiToFreq(root), dur: len * 1.6, vol: 0.3, lowpass: 380, delay });
        if (L.harm && s % 4 === 2) this.tone({ ...m, type: 'triangle', freq: midiToFreq(chord[arpIdx % 3]), dur: len * 1.5, vol: 0.05, delay });
        if (melody) this.tone({ ...m, type: 'triangle', freq: midiToFreq(melody[1]), dur: len * melody[2] * 0.95, vol: 0.13 * lv, vibrato: [5, 18], reverb: 0.25, delay });
        if (drums) {
          // Herzschlag: ba-dum auf 0/2 und 8/10, dazu tiefe Toms und ein Rassler
          if ([0, 2, 8, 10].includes(s)) this.tone({ ...m, type: 'sine', freq: s % 8 === 0 ? 110 : 90, to: 42, dur: 0.2, vol: s % 8 === 0 ? 0.75 : 0.5, delay });
          if (s === 6 || s === 14) this.tone({ ...m, type: 'sine', freq: 170, to: 80, dur: 0.22, vol: 0.4, delay });
          if (s % 2 === 1) this.noise({ ...m, dur: 0.05, vol: 0.06, filter: 'bandpass', freq: 5000, q: 2, delay });
        }
        break;
      }

      case 'ascend':
      case 'ark': {
        const fast = song.style === 'ark';
        if (s === 0) {
          for (const n of chord) {
            for (const d of [-7, 7]) {
              this.tone({ ...m, type: 'sawtooth', freq: midiToFreq(n - 12) * Math.pow(2, d / 1200), dur: len * 16, vol: 0.016, attack: len * 4, lowpass: 1300, reverb: 0.4, delay });
            }
          }
        }
        if (fullBass && (fast ? s % 2 === 0 : s % 8 === 0)) {
          this.tone({ ...m, type: 'sine', freq: midiToFreq(root + (fast && s % 4 === 2 ? 12 : 0)), dur: len * (fast ? 1.8 : 7), vol: 0.4, delay });
        }
        if (L.harm) {
          const arp = [chord[0], chord[1], chord[2], chord[1]][arpIdx] + 12;
          this.bell(midiToFreq(arp), len * 3, fast ? 0.035 : 0.03, { bus: 'music', echo: 0.35, ratio: 2, index: 0.9, delay });
        }
        if (melody) this.tone({ ...m, type: fast ? 'triangle' : 'sine', freq: midiToFreq(melody[1]), dur: len * melody[2] * 0.95, vol: 0.12 * lv, reverb: 0.35, echo: 0.25, delay });
        if (drums) {
          if (fast ? s % 4 === 0 : s % 8 === 0) this.tone({ ...m, type: 'sine', freq: 120, to: 45, dur: 0.16, vol: fast ? 0.6 : 0.45, delay });
          if (fast && (s === 4 || s === 12)) this.noise({ ...m, dur: 0.14, vol: 0.25, filter: 'bandpass', freq: 2200, reverb: 0.3, delay });
          if (fast ? s % 2 === 1 : s % 4 === 2) this.noise({ ...m, dur: 0.03, vol: 0.06, filter: 'highpass', freq: 9000, delay });
          if (!fast && (s === 4 || s === 12)) this.bell(2400, 0.4, 0.015, { bus: 'music', ratio: 1.41, reverb: 0.4, delay });
        }
        break;
      }

      case 'slime': {
        const fast = song.tempo > 120;
        if (fullBass && [0, 3, 6, 10, 12].includes(s)) this.tone({ ...m, type: 'sine', freq: midiToFreq(root + 12), to: midiToFreq(root), dur: len * 2.2, vol: 0.42, delay });
        if (L.harm && s % 2 === 1 && Math.random() < 0.6) {
          const n = midiToFreq(chord[Math.floor(Math.random() * 3)] + 24);
          this.tone({ ...m, type: 'sine', freq: n, to: n * 1.5, dur: 0.06, vol: 0.035, delay });
        }
        if (melody) this.tone({ ...m, type: 'triangle', freq: midiToFreq(melody[1]), dur: len * melody[2] * 0.9, vol: 0.11 * lv, vibrato: [7, 35], reverb: 0.3, delay });
        if (drums) {
          if (s === 0 || s === 8 || (fast && s === 11)) this.tone({ ...m, type: 'sine', freq: 130, to: 45, dur: 0.16, vol: 0.6, delay });
          if (s === 4 || s === 12) this.noise({ ...m, dur: 0.12, vol: 0.22, filter: 'bandpass', freq: 1400, q: 3, delay });
          if (s === 14 && Math.random() < 0.5) this.noise({ ...m, dur: 0.04, vol: 0.08, filter: 'highpass', freq: 5000, delay });
        }
        break;
      }

      case 'terran': {
        const fast = song.tempo > 130;
        if (fullBass && s % 2 === 0) this.tone({ ...m, type: 'square', freq: midiToFreq(root + (s % 4 === 2 ? 12 : 0)), dur: len * 1.6, vol: 0.1, lowpass: 900, delay });
        if (melody) {
          for (const d of [-6, 6]) {
            this.tone({ ...m, type: 'square', freq: midiToFreq(melody[1]) * Math.pow(2, d / 1200), dur: len * melody[2] * 0.95, vol: 0.05 * lv, attack: 0.04, lowpass: 2400, delay });
          }
        }
        if (L.harm && s % 4 === 0 && s !== 0) this.tone({ ...m, type: 'triangle', freq: midiToFreq(chord[1 + (arpIdx % 2)]), dur: len * 3, vol: 0.04, delay });
        if (drums) {
          if (s === 0 || s === 8 || (fast && (s === 6 || s === 10))) this.tone({ ...m, type: 'sine', freq: 140, to: 42, dur: 0.15, vol: 0.7, delay });
          if (s === 4 || s === 12) this.noise({ ...m, dur: 0.14, vol: 0.35, filter: 'bandpass', freq: 1900, delay });
          if (bar % 2 === 1 && s >= 13) this.noise({ ...m, dur: 0.05, vol: 0.14, filter: 'bandpass', freq: 2300, delay });
          if (s % 2 === 0) this.noise({ ...m, dur: 0.03, vol: 0.05, filter: 'highpass', freq: 8000, delay });
        }
        break;
      }

      case 'void': {
        const fast = song.tempo > 120;
        if (s === 0) {
          this.tone({ ...m, type: 'sawtooth', freq: midiToFreq(root), dur: len * 16, vol: 0.12, attack: len * 10, lowpass: 380, delay });
          if (L.harm) for (const n of chord) this.tone({ ...m, type: 'triangle', freq: midiToFreq(n), dur: len * 15, vol: 0.025, attack: len * 12, reverb: 0.6, delay });
        }
        if (melody) this.tone({ ...m, type: 'sine', freq: midiToFreq(melody[1]), dur: len * melody[2], vol: 0.1 * lv, attack: len * Math.min(3, melody[2]), vibrato: [3, 25], reverb: 0.5, echo: 0.3, delay });
        if (drums) {
          if (s === 0 || (fast && s === 8) || s === 10) this.tone({ ...m, type: 'sine', freq: 70, to: 30, dur: 0.35, vol: 0.6, delay });
          if (fast && s % 4 === 2) this.noise({ ...m, dur: 0.2, vol: 0.1, filter: 'bandpass', freq: 400, to: 3000, q: 3, delay });
        }
        if (L.harm && s === 12) this.noise({ ...m, dur: len * 4, vol: 0.05, filter: 'highpass', freq: 2000, to: 8000, reverb: 0.5, delay });
        break;
      }

      case 'deep': {
        const fast = song.tempo > 120;
        if (melody) {
          const next = this.lead.find(([at]) => at > step);
          const to = next ? midiToFreq(next[1]) : undefined;
          this.tone({ ...m, type: 'sine', freq: midiToFreq(melody[1]), to, dur: len * melody[2], vol: 0.12 * lv, attack: len, vibrato: [4.5, 30], reverb: 0.5, delay });
        }
        if (fullBass && s % 8 === 0) this.tone({ ...m, type: 'sine', freq: midiToFreq(root), dur: len * 8, vol: 0.38, attack: 0.05, delay });
        if (L.harm && s % 2 === 0) this.tone({ ...m, type: 'triangle', freq: midiToFreq(chord[(s / 2 + arpIdx) % 3] + 12), dur: len * 1.8, vol: 0.04, echo: 0.3, delay });
        if (s === 0 && bar % 2 === 0) this.bell(1320, 1.2, 0.05, { bus: 'music', ratio: 1, index: 0.2, echo: 0.6, delay });
        if (drums) {
          if (fast ? s % 4 === 0 : s === 0 || s === 9) this.tone({ ...m, type: 'sine', freq: 110, to: 45, dur: 0.2, vol: 0.5, delay });
          if (fast && (s === 4 || s === 12)) this.noise({ ...m, dur: 0.15, vol: 0.18, filter: 'bandpass', freq: 900, q: 2, reverb: 0.3, delay });
        }
        break;
      }

      case 'crystal': {
        const fast = song.tempo > 150;
        if (s === 0) this.tone({ ...m, type: 'sine', freq: midiToFreq(root), dur: len * 15, vol: 0.3, delay });
        if (fullBass && fast && s === 8) this.tone({ ...m, type: 'sine', freq: midiToFreq(root + 7), dur: len * 7, vol: 0.2, delay });
        if (s === 0) for (const n of chord) this.tone({ ...m, type: 'triangle', freq: midiToFreq(n - 12), dur: len * 16, vol: 0.02, attack: len * 4, reverb: 0.5, delay });
        if (L.harm && (fast ? [0, 2, 3, 5, 6, 8, 10, 11, 13, 14] : [0, 3, 6, 9, 12, 14]).includes(s)) {
          this.bell(midiToFreq(chord[Math.floor(Math.random() * 3)] + 24), len * 4, 0.028, { bus: 'music', ratio: 3.5, index: 1.2, echo: 0.4, delay });
        }
        if (melody) this.bell(midiToFreq(melody[1]), len * melody[2] * 1.2, 0.07 * lv, { bus: 'music', ratio: 2, index: 0.6, reverb: 0.4, delay });
        if (drums) {
          if (s % 2 === 1) this.bell(4200, 0.05, 0.01, { bus: 'music', ratio: 1.41, delay });
          if (fast && s % 4 === 0) this.tone({ ...m, type: 'sine', freq: 120, to: 50, dur: 0.12, vol: 0.45, delay });
        }
        break;
      }

      case 'queen': {
        if (s === 0) {
          this.tone({ ...m, type: 'sawtooth', freq: midiToFreq(root + 12), dur: len * 16, vol: 0.14, attack: 0.3, lowpass: 500, delay });
          this.tone({ ...m, type: 'sawtooth', freq: midiToFreq(root + 13), dur: len * 16, vol: 0.05, attack: 0.6, lowpass: 400, delay });
        }
        if (melody) this.tone({ ...m, type: 'sawtooth', freq: midiToFreq(melody[1]), dur: len * melody[2], vol: 0.06 * lv, attack: 0.2, lowpass: 1600, vibrato: [5.5, 30], reverb: 0.45, delay });
        if (drums) {
          if ([0, 3, 6, 8, 10, 13].includes(s)) this.tone({ ...m, type: 'sine', freq: s === 0 ? 70 : s % 2 ? 150 : 115, to: 50, dur: 0.25, vol: s === 0 ? 0.8 : 0.45, delay });
          if (s === 0) this.noise({ ...m, dur: 0.4, vol: 0.2, filter: 'lowpass', freq: 400, delay });
          if (s % 2 === 1) this.noise({ ...m, dur: 0.05, vol: 0.05, filter: 'bandpass', freq: 4000, q: 2, delay });
        }
        if (L.harm && s === 15 && Math.random() < 0.5) this.chitter(4, 2400, 0.015, delay);
        break;
      }
    }

    this.playArrangement(step, delay, len, root, chord);
  }

  /** Ebenen, die für alle Stile gleich sind: Grundton-Pedal, Fläche, Gegenstimme, Dichte, Aufbau, Wirbel, Becken. */
  private playArrangement(step: number, delay: number, len: number, root: number, chord: number[]): void {
    const L = this.section;
    const style = this.song.style;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const m: Route = { bus: 'music' };

    // Pedal statt Bass: ein langer, weicher Grundton pro Takt
    if (L.bass === 'pedal' && s === 0) this.tone({ ...m, type: 'sine', freq: midiToFreq(root), dur: len * 16, vol: 0.3, attack: len * 2, delay });

    // Fläche für Stile ohne eigene
    const hasPad = ['ascend', 'ark', 'void', 'crystal', 'queen'].includes(style);
    if (L.pad && !hasPad && s === 0) {
      for (const n of chord) this.tone({ ...m, type: 'triangle', freq: midiToFreq(n), dur: len * 16, vol: 0.022, attack: len * 5, reverb: 0.5, delay });
    }

    // Gegenstimme in Vierteln, Klangfarbe je Stilfamilie
    if (L.counter && s % 4 === 0) {
      const lowChords = chord[0] < 60;
      const n = chord[[0, 2, 1, 2][(s / 4) % 4]] + (lowChords ? 12 : 0) + (bar % 2 ? 0 : 12);
      if (['ascend', 'ark', 'crystal', 'void'].includes(style)) this.bell(midiToFreq(n), len * 4, 0.03, { bus: 'music', ratio: 2, index: 0.8, echo: 0.3, delay });
      else if (['chip', 'mothership', 'terran'].includes(style)) this.tone({ ...m, type: 'triangle', freq: midiToFreq(n), dur: len * 3.5, vol: 0.06, delay });
      else this.tone({ ...m, type: 'sine', freq: midiToFreq(n), dur: len * 3.5, vol: 0.06, vibrato: [5, 20], reverb: 0.3, delay });
    }

    // Dichteres Schlagzeug: Sechzehntel-Hi-Hats und ein zusätzlicher Kick
    if (L.drums === 'busy' && !(L.fill && bar === 3 && s >= 12)) {
      this.noise({ ...m, dur: 0.02, vol: s % 4 === 2 ? 0.07 : 0.035, filter: 'highpass', freq: 9000, delay });
      if (s === 14 || (s === 6 && bar % 2 === 1)) this.tone({ ...m, type: 'sine', freq: 140, to: 42, dur: 0.12, vol: 0.45, delay });
    }

    // Aufbau: Kick auf jede Viertel, Snare immer dichter und lauter, darüber ein Rauschen, das ansteigt
    if (L.drums === 'build') {
      if (s % 4 === 0) this.tone({ ...m, type: 'sine', freq: 150, to: 42, dur: 0.14, vol: 0.65, delay });
      const every = bar < 2 ? 4 : bar === 2 ? 2 : 1;
      if (s % every === 0 && (bar > 0 || s % 8 === 4)) {
        const v = 0.08 + ((bar * 16 + s) / 64) * 0.25;
        this.noise({ ...m, dur: 0.06, vol: v, filter: 'bandpass', freq: 1800 + bar * 300, delay });
      }
      if (step === 0) this.noise({ ...m, dur: len * 64, vol: 0.05, filter: 'bandpass', freq: 400, to: 9000, q: 1.5, delay });
    }

    // Wirbel am Ende des vierten Takts: absteigende Toms und Snare
    if (L.fill && bar === 3 && s >= 12) {
      this.tone({ ...m, type: 'sine', freq: [240, 190, 150, 115][s - 12], to: 60, dur: 0.16, vol: 0.45, delay });
      this.noise({ ...m, dur: 0.05, vol: 0.12 + (s - 12) * 0.04, filter: 'bandpass', freq: 2000, delay });
    }

    // Becken beim Wiedereinsatz nach ruhigen Teilen oder dem Aufbau
    const prev = this.prevSection;
    const reentry = prev && (prev.drums === 'off' || prev.drums === 'build') && L.drums !== 'off' && L.drums !== 'build';
    if (step === 0 && reentry) {
      this.noise({ ...m, dur: 1.4, vol: 0.16, filter: 'highpass', freq: 5000, reverb: 0.3, delay });
      this.tone({ ...m, type: 'sine', freq: 150, to: 38, dur: 0.25, vol: 0.8, delay });
    }
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

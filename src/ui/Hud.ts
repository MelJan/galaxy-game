import { t } from '../i18n';

/** Anzeige über dem Spiel: Score, Gold, Hülle, Wellen-Banner, Game Over. */
export class Hud {
  private readonly score = document.getElementById('score')!;
  private readonly gold = document.getElementById('gold')!;
  private readonly hull = document.getElementById('hull')!;
  private readonly hull2 = document.getElementById('hull2')!;
  private readonly banner = document.getElementById('banner')!;
  private readonly gameOver = document.getElementById('gameover')!;
  private readonly finalScore = document.getElementById('final-score')!;
  private readonly audio = document.getElementById('audio')!;
  private readonly flashEl = document.getElementById('flash')!;
  private readonly powerUps = document.getElementById('powerups')!;
  private readonly bossBar = document.getElementById('bossbar')!;
  private readonly bossName = document.getElementById('bossname')!;
  private readonly bossFill = document.getElementById('bossfill')!;
  private bannerTimer = 0;

  setScore(n: number): void {
    this.score.textContent = String(n).padStart(7, '0');
  }

  setGold(n: number): void {
    this.gold.textContent = String(n);
  }

  /** Hülle von Spieler 0 oder 1. */
  setHull(player: number, current: number, max: number): void {
    const el = player === 0 ? this.hull : this.hull2;
    if (el.childElementCount !== max) {
      el.replaceChildren(...Array.from({ length: max }, () => document.createElement('i')));
    }
    [...el.children].forEach((seg, i) => seg.classList.toggle('empty', i >= current));
    el.classList.toggle('critical', current === 1);
  }

  /** Zweite Hüllenanzeige nur im Zweispieler-Modus; Beschriftung „P1“/„P2“ statt „HÜLLE“. */
  setPlayers(n: number): void {
    document.getElementById('hull2-row')!.classList.toggle('hidden', n < 2);
    document.getElementById('hull-label')!.textContent = n < 2 ? t('HÜLLE') : 'P1';
  }

  showBanner(title: string, subtitle = '', warn = false, duration = 2200): void {
    this.banner.innerHTML = subtitle ? `${title}<small>${subtitle}</small>` : title;
    this.banner.classList.toggle('warn', warn);
    this.banner.classList.remove('hidden');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.add('hidden'), duration);
  }

  /** Aktive Power-ups mit Restzeit, z. B. "SCHILD ×3 12  LASER 8". */
  setPowerUps(entries: { label: string; time: number; cls: string }[]): void {
    const html = entries
      .filter((e) => e.time > 0)
      .map((e) => `<span class="${e.cls}">${e.label}${Number.isFinite(e.time) ? ` ${Math.ceil(e.time)}` : ''}</span>`)
      .join('');
    if (this.powerUps.innerHTML !== html) this.powerUps.innerHTML = html;
  }

  /** Steuerungshinweise erneut einblenden (beim Start eines Durchlaufs). */
  showHint(): void {
    const hint = document.getElementById('hint')!;
    hint.style.animation = 'none';
    void hint.offsetWidth;
    hint.style.animation = '';
  }

  setDifficulty(name: string, color: string): void {
    const el = document.getElementById('difficulty')!;
    el.textContent = name;
    el.style.color = color;
  }

  /** Lebensbalken des Endgegners; name = null blendet ihn aus. */
  setBoss(name: string | null, health: number): void {
    this.bossBar.classList.toggle('hidden', name === null);
    if (name === null) return;
    if (this.bossName.textContent !== name) this.bossName.textContent = name;
    this.bossFill.style.width = `${Math.round(Math.max(0, Math.min(1, health)) * 1000) / 10}%`;
  }

  hideBanner(): void {
    window.clearTimeout(this.bannerTimer);
    this.banner.classList.add('hidden');
  }

  /** Weißer Bildschirmblitz. */
  flash(): void {
    this.flashEl.classList.remove('active');
    void this.flashEl.offsetWidth; // Animation neu starten
    this.flashEl.classList.add('active');
  }

  /** best: Rekord der Stufe, auf der der Durchlauf begann (difficulty: ihr Name). */
  showGameOver(score: number, best: number, isNew: boolean, difficulty: string): void {
    this.finalScore.textContent = String(score).padStart(7, '0');
    const el = document.getElementById('go-best')!;
    el.textContent = isNew
      ? t('NEUER REKORD AUF {name}!', { name: difficulty })
      : t('REKORD {name} {score}', { name: difficulty, score: String(best).padStart(7, '0') });
    el.classList.toggle('new', isNew);
    this.gameOver.classList.remove('hidden');
  }

  hideGameOver(): void {
    this.gameOver.classList.add('hidden');
  }

  setAudio(sound: boolean, music: boolean): void {
    this.audio.textContent = `${sound ? '' : t('TON AUS') + '  '}${music ? '' : t('MUSIK AUS')}`.trim();
  }
}

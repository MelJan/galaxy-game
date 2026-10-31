import * as THREE from 'three';
import { DEV } from './dev/flags';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Sound } from './audio/Sound';
import { CAMERA, FIELD, PIXEL, RENDER_HEIGHT } from './config';
import { Input } from './core/Input';
import { isTouchDevice } from './core/Touch';
import { FIRE_RAMP } from './fx/explode';
import { Particles } from './fx/Particles';
import { Session } from './game/Session';
import { GFX, gfxUniforms, loadGfxMode, setGfxMode } from './gfx/mode';
import { refreshPixelTextures } from './gfx/pixel';
import { Hud } from './ui/Hud';
import { Asteroids } from './world/Asteroids';
import { Nebula } from './world/Nebula';
import { Planets } from './world/Planets';
import { Starfield } from './world/Starfield';

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  /** Je Grafikmodus ein eigener Composer: Retro ohne MSAA in Niedrigauflösung, Smooth mit MSAA in voller Auflösung. */
  private readonly retroComposer: EffectComposer;
  private readonly smoothComposer: EffectComposer;
  private readonly timer = new THREE.Timer();
  private readonly input = new Input();
  private readonly touchPause = document.getElementById('touch-pause')!;

  /** Alle Hintergrund-Ebenen. Wird gegen die Spielerbewegung verschoben, das ergibt die Parallaxe. */
  private readonly background = new THREE.Group();
  private nebula: Nebula;
  private starfield: Starfield;
  private readonly planets: Planets;
  private readonly asteroids: Asteroids;

  private readonly engineFx: Particles;
  private readonly sparkFx: Particles;
  private readonly fireFx: Particles;
  private readonly sound = new Sound();
  private readonly hud = new Hud();
  private readonly session: Session;

  private bufferW = 0;
  private bufferH = 0;
  private sway = new THREE.Vector2();
  private shakeAmount = 0;
  /** Farbthema des aktuellen Sektors (Nebel). */
  private theme = 0;
  private camZ = 0;
  private time = 0;
  private paused = false;
  private resizeTimer = 0;

  constructor(
    container: HTMLElement,
    private readonly pauseEl: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    // Farben der Pixel-Art unverfälscht lassen
    this.renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(this.renderer.domElement);
    loadGfxMode();
    this.setupTouch();

    this.scene.background = new THREE.Color(0x02030a);
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.5, 2000);
    this.fitView();


    // Licht für die 3D-Asteroiden: warme "Sonne" oben links, kühles Gegenlicht
    this.scene.add(new THREE.AmbientLight(0x30406a, 0.6));
    const sun = new THREE.DirectionalLight(0xfff0dd, 2.4);
    sun.position.set(-0.7, 0.6, 0.6);
    this.scene.add(sun);

    this.nebula = new Nebula(this.camera);
    this.starfield = new Starfield(this.camera);
    this.planets = new Planets(this.camera);
    this.asteroids = new Asteroids(this.camera);
    this.background.add(this.nebula.mesh, this.starfield.group, this.planets.group, this.asteroids.group);
    this.scene.add(this.background);

    this.engineFx = new Particles(500, 1, FIRE_RAMP);
    this.sparkFx = new Particles(1200, 1);
    this.fireFx = new Particles(1500, 2, FIRE_RAMP, 3);
    this.scene.add(this.engineFx.points, this.sparkFx.points, this.fireFx.points);
    this.session = new Session(
      this.scene,
      { engine: this.engineFx, sparks: this.sparkFx, fire: this.fireFx },
      this.sound,
      this.hud,
      {
        shake: (amount) => (this.shakeAmount = Math.max(this.shakeAmount, amount)),
        sector: (index) => {
          this.theme = index;
          this.nebula.setTheme(index);
        },
      },
    );
    this.hud.setAudio(this.sound.isSoundOn, this.sound.isMusicOn);

    this.retroComposer = this.createComposer(0);
    this.smoothComposer = this.createComposer(4);
    this.applySize();

    window.addEventListener('resize', () => this.onResize());
    // Hinweis beim Verbinden oder Trennen eines Controllers
    this.input.onPadChange = (connected, slot, id) => {
      const name = id.replace(/\(.*?\)/g, '').trim().slice(0, 32).toUpperCase();
      this.hud.showBanner(`CONTROLLER ${slot} ${connected ? 'VERBUNDEN' : 'GETRENNT'}`, name, !connected, 2200);
      this.sound.shopMove();
    };
  }

  /**
   * Handy und Tablet: Ziehen auf dem Spielfeld steuert, Bildschirm-Knöpfe lösen virtuelle Tasten aus
   * (Pause, Weiter, Speichern, Neustart, Zurück). Die Touch-Oberfläche erscheint bei Touch-Geräten sofort,
   * sonst bei der ersten Berührung. Beim ersten Antippen geht das Spiel (wo erlaubt) in den Vollbildmodus.
   */
  private setupTouch(): void {
    const enable = () => document.body.classList.add('touch');
    if (isTouchDevice()) enable();
    this.input.attachTouch(this.renderer.domElement, enable);
    const keys: Record<string, string> = {
      'touch-pause': 'KeyP',
      'pause-resume': 'KeyP',
      'pause-save': 'KeyS',
      'go-restart': 'Enter',
      'go-menu': 'Escape',
      'saves-back': 'Escape',
    };
    for (const [id, code] of Object.entries(keys)) {
      document.getElementById(id)?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.input.press(code);
      });
    }
    // Credits: Antippen irgendwo (außer auf den Lizenz-Link) schließt sie
    document.getElementById('credits')?.addEventListener('click', (e) => {
      if (document.body.classList.contains('touch') && !(e.target as Element).closest('a')) this.input.press('Escape');
    });
    let triedFullscreen = false;
    document.addEventListener(
      'touchend',
      () => {
        if (triedFullscreen || !document.fullscreenEnabled || document.fullscreenElement) return;
        triedFullscreen = true;
        document.documentElement
          .requestFullscreen({ navigationUI: 'hide' })
          .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('portrait'))
          .catch(() => {});
      },
      { capture: true },
    );
  }

  private createComposer(samples: number): EffectComposer {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.4, 0.95));
    composer.addPass(new OutputPass());
    return composer;
  }

  private get composer(): EffectComposer {
    return GFX.smooth ? this.smoothComposer : this.retroComposer;
  }

  start(): void {
    this.timer.connect(document);
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private frame(timestamp: number): void {
    this.timer.update(timestamp);
    // Im ersten Frame kann das Delta negativ sein (rAF-Zeitstempel liegt vor dem Timer-Start)
    const dt = THREE.MathUtils.clamp(this.timer.getDelta(), 0, 1 / 20);
    // Esc schließt in der Werft das Menü statt zu pausieren
    this.input.update();
    if (!this.session.blocksPause && (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape') || this.input.wasPressed('Start'))) {
      this.setPaused(!this.paused);
    }
    // In der Pause: S öffnet das Speichermenü, das Menü wird auch pausiert bedient
    if (this.paused) {
      if (this.session.menuOpen) this.session.handleMenus(this.input);
      else if (this.input.wasPressed('KeyS') || this.input.wasPressed('PadY')) this.session.openSaveMenu();
    }
    this.touchPause.classList.toggle('hidden', this.paused || this.session.blocksPause);
    if (this.input.wasPressed('KeyG')) this.toggleGfxMode();
    if (this.input.wasPressed('KeyM')) this.sound.toggleMusic();
    if (this.input.wasPressed('KeyN')) this.sound.toggleSound();
    this.hud.setAudio(this.sound.isSoundOn, this.sound.isMusicOn);
    // ?turbo=N (nur Entwicklung): mehrere feste Schritte pro Bild
    if (!this.paused) for (let i = 0; i < DEV.turbo; i++) this.update(DEV.turbo > 1 ? 1 / 30 : dt);
    this.planets.renderSurfaces(this.renderer);
    this.composer.render();
    // Tastendrücke gelten nur für diesen Frame: was niemand abgeholt hat, darf später kein Menü auslösen
    this.input.clearPressed();
  }

  private update(dt: number): void {
    this.time += dt;
    this.nebula.update(this.time, dt);
    this.starfield.update(this.time);
    this.planets.update(dt, this.time);
    this.asteroids.update(dt, this.camera);

    this.session.update(dt, this.input);
    this.engineFx.update(dt);
    this.sparkFx.update(dt);
    this.fireFx.update(dt);

    // Hintergrund weich gegen die Spielerposition verschieben: nahe Ebenen bewegen sich sichtbar mehr
    const focus = this.session.focus;
    const k = 1 - Math.exp(-3 * dt);
    this.sway.x += (-focus.x * CAMERA.swayX - this.sway.x) * k;
    this.sway.y += (-focus.y * CAMERA.swayY - this.sway.y) * k;
    this.background.position.set(this.sway.x, this.sway.y, 0);

    // Bildschirmwackeln bei Explosionen und Treffern
    this.shakeAmount *= Math.exp(-7 * dt);
    const s = this.shakeAmount;
    this.camera.position.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, this.camZ);
  }

  private toggleGfxMode(): void {
    setGfxMode(!GFX.smooth);
    refreshPixelTextures();
    this.planets.applyGfxMode();
    this.applySize();
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    // Liegengebliebene Tastendrücke (z. B. S vom Fliegen) nicht ins Pausenmenü mitnehmen
    this.input.clearPressed();
    this.input.touch?.release();
    this.sound.setPaused(paused);
    this.pauseEl.classList.toggle('hidden', !paused);
  }

  /**
   * Interne Auflösung und Kamera so wählen, dass ein Bildschirm-Pixel auf der Spielebene
   * genau PIXEL Welt-Einheiten groß ist. Das Spielfeld füllt die volle Breite.
   */
  private fitView(): void {
    const aspect = window.innerWidth / window.innerHeight;
    const minW = Math.ceil((2 * (FIELD.minHalfWidth + CAMERA.marginX)) / PIXEL);
    let bh = RENDER_HEIGHT;
    let bw = Math.round(bh * aspect);
    if (bw < minW) {
      bw = minW;
      bh = Math.round(bw / aspect);
    }
    this.bufferW = bw + (bw % 2);
    this.bufferH = bh + (bh % 2);

    const halfH = (this.bufferH * PIXEL) / 2;
    this.camera.aspect = GFX.smooth ? aspect : this.bufferW / this.bufferH;
    this.camZ = halfH / Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2));
    this.camera.position.set(0, 0, this.camZ);
    this.camera.updateProjectionMatrix();

    FIELD.halfWidth = halfH * this.camera.aspect - CAMERA.marginX;
    // Touch: Fingerweg in Welt-Einheiten (die Bildhöhe zeigt 2 · halfH)
    if (this.input.touch) this.input.touch.worldPerPx = (2 * halfH) / window.innerHeight;
  }

  /** Renderer-Auflösung je nach Grafikmodus: Spiel-Pixel (Retro) oder volle Bildschirmauflösung (Smooth). */
  private applySize(): void {
    this.fitView();
    const canvas = this.renderer.domElement;
    let scale = 1;
    if (GFX.smooth) {
      const ratio = Math.min(window.devicePixelRatio, 2);
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.composer.setPixelRatio(ratio);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      scale = (window.innerHeight * ratio) / this.bufferH;
    } else {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(this.bufferW, this.bufferH, false);
      this.composer.setPixelRatio(1);
      this.composer.setSize(this.bufferW, this.bufferH);
    }
    canvas.style.imageRendering = GFX.smooth ? 'auto' : 'pixelated';
    gfxUniforms.uPixelScale.value = scale;
    this.engineFx.setPixelScale(scale);
    this.sparkFx.setPixelScale(scale);
    this.fireFx.setPixelScale(scale);
  }

  private onResize(): void {
    this.applySize();

    // Hintergrund-Ebenen passend zur neuen Kamera neu aufbauen (entprellt)
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      this.nebula.dispose();
      this.starfield.dispose();
      this.nebula = new Nebula(this.camera);
      this.starfield = new Starfield(this.camera);
      this.nebula.setTheme(this.theme, true);
      this.nebula.update(this.time);
      this.starfield.update(this.time);
      this.background.add(this.nebula.mesh, this.starfield.group);
    }, 200);
  }
}

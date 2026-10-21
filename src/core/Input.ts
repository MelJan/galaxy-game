const BLOCKED_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  /** Angesammelte Tastendrücke verwerfen, z. B. beim Öffnen eines Menüs (sonst kauft Dauerfeuer sofort etwas). */
  clearPressed(): void {
    this.pressed.clear();
  }

  /** True genau einmal pro Tastendruck. */
  wasPressed(code: string): boolean {
    return this.pressed.delete(code);
  }

  get axisX(): number {
    return (this.isDown('ArrowRight', 'KeyD') ? 1 : 0) - (this.isDown('ArrowLeft', 'KeyA') ? 1 : 0);
  }

  get axisY(): number {
    return (this.isDown('ArrowUp', 'KeyW') ? 1 : 0) - (this.isDown('ArrowDown', 'KeyS') ? 1 : 0);
  }

  get fire(): boolean {
    return this.isDown('Space');
  }
}

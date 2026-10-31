import { beforeEach, describe, expect, it, vi } from 'vitest';
import { highscore, loadHighscores, submitHighscore } from './Highscores';

describe('Highscores', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, String(v)),
    });
  });

  it('merkt sich den besten Score je Stufe', () => {
    expect(highscore('easy')).toBe(0);
    expect(submitHighscore('easy', 5000)).toBe(true);
    expect(submitHighscore('easy', 3000)).toBe(false);
    expect(submitHighscore('easy', 5000)).toBe(false);
    expect(submitHighscore('hard', 100)).toBe(true);
    expect(loadHighscores()).toEqual({ easy: 5000, hard: 100 });
  });

  it('kaputte Einträge werden ignoriert', () => {
    localStorage.setItem('galaxy.highscores', JSON.stringify({ easy: 'viel', hard: -3, normal: 42 }));
    expect(loadHighscores()).toEqual({ normal: 42 });
    localStorage.setItem('galaxy.highscores', '{kaputt');
    expect(loadHighscores()).toEqual({});
  });
});

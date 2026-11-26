import { describe, expect, it } from 'vitest';
import { fromColors } from '../src/core/board';
import { addBottle, newGame, pour } from '../src/core/game';
import { defaultSave, KV, loadSave, migrate, SAVE_KEY, SAVE_VERSION, writeSave } from '../src/save/save';

class Mem implements KV {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

const midGame = () => {
  let g = newGame(42, fromColors([[0, 1, 2, 1], [1, 0, 2, 0], [2, 2, 1, 0], [], []], true));
  g = pour(g, 0, 3).game;
  g = addBottle(g);
  g = pour(g, 1, 4).game;
  return g;
};

describe('save / load', () => {
  it('returns defaults when nothing is saved', () => {
    expect(loadSave(new Mem())).toEqual(defaultSave());
  });

  it('round-trips the exact mid-level board, history, helpers and settings', () => {
    const kv = new Mem();
    const data = { ...defaultSave(), maxLevel: 42, game: midGame(), settings: { sound: false, symbols: true } };
    expect(writeSave(kv, data)).toBe(true);
    const back = loadSave(kv);
    expect(back).toEqual(data);
    expect(back.game!.board[0][0].h).toBe(true); // hidden layers persisted
    expect(back.game!.history.length).toBe(2);
    expect(back.game!.extraUsed).toBe(true);
  });

  it('keeps a backup instead of wiping an unreadable save', () => {
    const kv = new Mem();
    kv.setItem(SAVE_KEY, '{not json');
    const d = loadSave(kv);
    expect(d).toEqual(defaultSave());
    expect(kv.getItem(`${SAVE_KEY}.backup.unreadable`)).toBe('{not json');
  });

  it('keeps progress when the game part is invalid', () => {
    const kv = new Mem();
    kv.setItem(SAVE_KEY, JSON.stringify({ v: 1, maxLevel: 17, game: { level: 'x' }, settings: { sound: false } }));
    const d = loadSave(kv);
    expect(d.maxLevel).toBe(17);
    expect(d.game).toBeNull();
    expect(d.settings.sound).toBe(false);
    expect(d.settings.symbols).toBe(false); // new setting filled with default
  });

  it('migrates step by step through versions', () => {
    const migrations = {
      1: (d: any) => ({ ...d, v: 2, a: 1 }),
      2: (d: any) => ({ ...d, v: 3, b: d.a + 1 }),
    };
    expect(migrate({ v: 1, maxLevel: 5 }, migrations, 3)).toEqual({ v: 3, maxLevel: 5, a: 1, b: 2 });
  });

  it('treats an unversioned save as v1', () => {
    expect(migrate({ maxLevel: 3 }).v).toBe(SAVE_VERSION);
  });

  it('never throws when storage is unavailable', () => {
    const broken: KV = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
    };
    expect(loadSave(broken)).toEqual(defaultSave());
    expect(writeSave(broken, defaultSave())).toBe(false);
  });
});

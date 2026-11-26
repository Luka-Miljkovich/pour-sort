/**
 * Versioned persistence. Every save carries `v`; loading runs migrations
 * step by step up to SAVE_VERSION, so app updates never wipe progress.
 * If a save cannot be read it is copied to a backup key, never deleted.
 */
import type { Board, Unit } from '../core/board';
import { CAPACITY } from '../core/board';
import type { GameState } from '../core/game';

export const SAVE_KEY = 'poursort.save';
export const SAVE_VERSION = 1;

export interface Settings {
  sound: boolean;
  symbols: boolean;
}

export interface SaveData {
  v: typeof SAVE_VERSION;
  /** highest level reached */
  maxLevel: number;
  game: GameState | null;
  settings: Settings;
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function defaultSave(): SaveData {
  return { v: SAVE_VERSION, maxLevel: 1, game: null, settings: { sound: true, symbols: false } };
}

/**
 * Migrations: key = version being migrated FROM. Each returns data at version key+1.
 * Example for the future:  1: (d) => ({ ...d, v: 2, stats: {} })
 */
export const MIGRATIONS: Record<number, (d: any) => any> = {};

export function migrate(raw: any, migrations = MIGRATIONS, target = SAVE_VERSION): any {
  let d = raw;
  // v0: pre-release shape without a version field
  if (typeof d.v !== 'number') d = { ...d, v: 1 };
  while (d.v < target) {
    const step = migrations[d.v];
    if (!step) throw new Error(`no migration from v${d.v}`);
    d = step(d);
  }
  return d;
}

function isUnit(u: any): u is Unit {
  return u && typeof u.c === 'number' && u.c >= 0 && u.c < 32;
}

function isBoard(b: any): b is Board {
  return (
    Array.isArray(b) &&
    b.length > 0 &&
    b.every((bt: any) => Array.isArray(bt) && bt.length <= CAPACITY && bt.every(isUnit))
  );
}

function validGame(g: any): g is GameState {
  return (
    g &&
    Number.isInteger(g.level) &&
    g.level >= 1 &&
    isBoard(g.initial) &&
    isBoard(g.board) &&
    Array.isArray(g.history) &&
    g.history.every(isBoard) &&
    Number.isInteger(g.undosLeft) &&
    typeof g.extraUsed === 'boolean' &&
    Number.isInteger(g.moves) &&
    typeof g.won === 'boolean'
  );
}

export function loadSave(kv: KV): SaveData {
  let text: string | null = null;
  try {
    text = kv.getItem(SAVE_KEY);
  } catch {
    return defaultSave();
  }
  if (!text) return defaultSave();
  try {
    const raw = JSON.parse(text);
    if (typeof raw.v === 'number' && raw.v > SAVE_VERSION) {
      // Saved by a newer app version (e.g. rollback). Keep it; play on a copy.
      backup(kv, text, `future-v${raw.v}`);
    }
    const d = migrate(raw);
    const def = defaultSave();
    const out: SaveData = {
      v: SAVE_VERSION,
      maxLevel: Number.isInteger(d.maxLevel) && d.maxLevel >= 1 ? d.maxLevel : 1,
      game: validGame(d.game) ? d.game : null,
      settings: { ...def.settings, ...(d.settings ?? {}) },
    };
    if (out.game && out.game.level > out.maxLevel) out.maxLevel = out.game.level;
    if (!out.game && d.game) backup(kv, text, 'invalid-game');
    return out;
  } catch {
    backup(kv, text, 'unreadable');
    return defaultSave();
  }
}

function backup(kv: KV, text: string, tag: string) {
  try {
    kv.setItem(`${SAVE_KEY}.backup.${tag}`, text);
  } catch {
    /* storage full – nothing more we can do */
  }
}

export function writeSave(kv: KV, data: SaveData): boolean {
  try {
    kv.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/**
 * The level to resume on. A saved v>SAVE_VERSION game is still honoured as
 * long as it validates.
 */
export function resumeLevel(d: SaveData): number {
  return d.game ? d.game.level : d.maxLevel;
}

import { Board, Bottle, CAPACITY, canPour, hasUsefulMove, isComplete } from '../core/board';
import {
  addBottle,
  canAddBottle,
  canUndo,
  GameState,
  newGame,
  pour,
  restart,
  undo,
} from '../core/game';
import { GenClient } from '../gen/client';
import { levelSpec } from '../gen/generator';
import { KV, loadSave, SaveData, writeSave } from '../save/save';
import { ICONS } from './icons';
import { computeLayout, Layout } from './layout';
import { COLORS, symbolSvg } from './palette';
import { Sound } from './sound';

const $ = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

/** Storage that never throws (private mode, quota). */
const storage: KV = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => localStorage.setItem(k, v),
};

type SheetKind = 'stuck' | 'dead';

export class App {
  private data: SaveData;
  private game: GameState | null = null;
  private gen = new GenClient();
  private sound = new Sound();
  private selected: number | null = null;
  /** per-bottle animation queue */
  private locks: Promise<unknown>[] = [];
  /** pours queued or running per bottle */
  private busyCount: number[] = [];
  private layout!: Layout;
  private slots: HTMLElement[] = [];
  /** bumps whenever running animations must be abandoned (undo/restart/...) */
  private epoch = 0;
  private running: Animation[] = [];
  private pendingPours = 0;
  private analyzeToken = 0;
  private stuckDismissed = false;
  private idleWaiters: (() => void)[] = [];

  private root: HTMLElement;
  private boardEl!: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.data = loadSave(storage);
    this.sound.enabled = this.data.settings.sound;
    this.buildShell();
    this.applySettings();
  }

  // ---------------------------------------------------------------- setup

  private buildShell() {
    this.root.innerHTML = `
      <header class="hud">
        <div class="hud-left">
          <div class="level-label">Level <span class="chip hidden-chip" hidden>${ICONS.eyeOff}<span>Hidden</span></span></div>
          <div class="level-num">–</div>
        </div>
        <div class="hud-mid"><div class="moves-num">0</div><div class="moves-label">moves</div></div>
        <div class="hud-right">
          <button class="icon-btn" data-act="symbols" aria-label="Toggle colour symbols">${ICONS.shapes}</button>
          <button class="icon-btn" data-act="sound" aria-label="Toggle sound"></button>
        </div>
      </header>
      <main class="board" aria-label="Bottles"></main>
      <footer class="bar">
        <button class="act" data-act="undo" aria-label="Undo">${ICONS.undo}<span class="act-label">Undo</span><span class="badge" data-badge="undo">5</span></button>
        <button class="act" data-act="restart" aria-label="Restart level">${ICONS.restart}<span class="act-label">Restart</span></button>
        <button class="act" data-act="add" aria-label="Add an empty bottle">${ICONS.bottle}<span class="act-label">Bottle</span><span class="badge" data-badge="add">1</span></button>
      </footer>
      <div class="overlay loading" hidden><div class="spinner"></div><div>Mixing colours…</div></div>
      <div class="overlay sheet-wrap" hidden>
        <div class="sheet" role="dialog" aria-modal="true">
          <div class="sheet-title"></div>
          <div class="sheet-text"></div>
          <div class="sheet-actions">
            <button class="pill" data-act="undo">${ICONS.undo}<span>Undo <b data-badge="undo2"></b></span></button>
            <button class="pill" data-act="add">${ICONS.bottle}<span>Extra bottle</span></button>
            <button class="pill primary" data-act="restart">${ICONS.restart}<span>Restart</span></button>
            <button class="pill ghost" data-act="dismiss"><span>Keep looking</span></button>
          </div>
        </div>
      </div>
      <div class="overlay win-wrap" hidden>
        <div class="confetti"></div>
        <div class="win">
          <div class="win-kicker">Level <span class="win-level"></span></div>
          <div class="win-title">Sorted!</div>
          <div class="win-sub"></div>
          <button class="pill primary big" data-act="next"><span>Next level</span>${ICONS.next}</button>
        </div>
      </div>
      <div class="rotate-hint">Turn your phone upright to play</div>
    `;
    this.boardEl = $(this.root, '.board');

    // One pointerdown handler for everything: fast, no 300ms click delay.
    this.root.addEventListener('pointerdown', (e) => {
      this.sound.unlock();
      const t = e.target as HTMLElement;
      const btn = t.closest('button[data-act]') as HTMLButtonElement | null;
      if (btn) {
        if (!btn.disabled) this.onAction(btn.dataset.act!);
        e.preventDefault();
        return;
      }
      if (this.boardEl.contains(t) && !this.overlayOpen()) {
        e.preventDefault();
        // Hit-test by geometry, not by DOM target: a bottle flying over a
        // neighbour mid-pour must not steal taps meant for that neighbour.
        const i = this.cellAt(e.clientX, e.clientY);
        if (i !== null) this.onTap(i);
      }
    });
    // keyboard access for buttons
    this.root.addEventListener('click', (e) => {
      if ((e as PointerEvent).pointerType) return;
      const btn = (e.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement | null;
      if (btn && !btn.disabled && e.detail === 0) this.onAction(btn.dataset.act!);
    });

    new ResizeObserver(() => this.relayout()).observe(this.boardEl);
  }

  async start() {
    const g = this.data.game;
    if (g) {
      this.setGame(g);
      if (g.won) this.showWin(false);
      else this.checkStuck();
    } else {
      await this.loadLevel(this.data.maxLevel);
    }
  }

  private async loadLevel(n: number) {
    this.game = null;
    this.setLoading(true);
    try {
      const lv = await this.gen.level(n);
      this.data.maxLevel = Math.max(this.data.maxLevel, n);
      this.setGame(newGame(n, lv.board));
      this.persist();
    } catch (err) {
      console.error(err);
      $(this.root, '.loading div:last-child').textContent = 'Could not create level. Restart the app.';
      return;
    } finally {
      this.setLoading(false);
    }
  }

  private setGame(g: GameState) {
    this.cancelAnimations();
    this.game = g;
    this.selected = null;
    this.stuckDismissed = false;
    this.rebuildBottles();
    this.updateHud();
    this.gen.prefetch(g.level + 1);
  }

  private persist() {
    this.data.game = this.game;
    writeSave(storage, this.data);
  }

  // ---------------------------------------------------------------- rendering

  private relayout() {
    if (!this.game) return;
    const r = this.boardEl.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    this.layout = computeLayout(this.game.board.length, r.width, r.height);
    const L = this.layout;
    this.root.style.setProperty('--gw', `${L.gw}px`);
    this.root.style.setProperty('--gh', `${L.gh}px`);
    this.root.style.setProperty('--lift', `${-L.lift}px`);
    this.slots.forEach((s, i) => {
      const c = L.cells[i];
      s.style.transform = `translate(${c.x}px, ${c.y}px)`;
      s.style.width = `${c.w}px`;
      s.style.height = `${c.h}px`;
      const b = s.firstElementChild as HTMLElement;
      b.style.left = `${c.gx - c.x}px`;
      b.style.top = `${c.gy - c.y}px`;
    });
  }

  private cellAt(clientX: number, clientY: number): number | null {
    if (!this.layout) return null;
    const r = this.boardEl.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const i = this.layout.cells.findIndex((c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
    return i >= 0 ? i : null;
  }

  private rebuildBottles() {
    if (!this.game) return;
    this.boardEl.innerHTML = '';
    this.slots = this.game.board.map((_, i) => {
      const s = document.createElement('div');
      s.className = 'slot';
      s.dataset.i = String(i);
      s.setAttribute('role', 'button');
      s.innerHTML = `<div class="bottle"><div class="cap"></div><div class="rim"></div><div class="glass"><div class="liquid"></div><div class="shine"></div></div></div>`;
      this.boardEl.appendChild(s);
      return s;
    });
    this.game.board.forEach((b, i) => this.renderBottle(i, b));
    this.relayout();
  }

  private unitHtml(u: { c: number; h?: true }, extra = ''): string {
    if (u.h) return `<div class="unit hid${extra}"><span class="q">?</span></div>`;
    return `<div class="unit${extra}" style="--c:${COLORS[u.c].fill}">${symbolSvg(u.c)}</div>`;
  }

  /** incoming: number of top units to render at height 0 (to be poured in) */
  private renderBottle(i: number, b: Bottle, incoming = 0) {
    const slot = this.slots[i];
    if (!slot) return;
    const liquid = $(slot, '.liquid');
    liquid.innerHTML = b
      .map((u, k) => this.unitHtml(u, k >= b.length - incoming ? ' incoming' : ''))
      .join('');
    slot.classList.toggle('done', isComplete(b));
    slot.setAttribute(
      'aria-label',
      `Bottle ${i + 1}: ${b.length ? b.map((u) => (u.h ? 'hidden' : COLORS[u.c].name)).join(', ') : 'empty'}`,
    );
  }

  private updateHud() {
    const g = this.game;
    $(this.root, '.level-num').textContent = g ? String(g.level) : '–';
    $(this.root, '.hidden-chip').hidden = !(g && levelSpec(g.level).hidden);
    $(this.root, '.moves-num').textContent = g ? String(g.moves) : '0';
    const undoLeft = g ? g.undosLeft : 0;
    this.root.querySelectorAll<HTMLElement>('[data-badge="undo"]').forEach((e) => (e.textContent = String(undoLeft)));
    $(this.root, '[data-badge="undo2"]').textContent = `(${undoLeft})`;
    $(this.root, '[data-badge="add"]').textContent = g && !g.extraUsed ? '1' : '0';
    this.root.querySelectorAll<HTMLButtonElement>('button[data-act="undo"]').forEach((b) => (b.disabled = !g || !canUndo(g)));
    this.root.querySelectorAll<HTMLButtonElement>('button[data-act="add"]').forEach((b) => (b.disabled = !g || !canAddBottle(g)));
    this.root.querySelectorAll<HTMLButtonElement>('button[data-act="restart"]').forEach((b) => (b.disabled = !g));
  }

  private applySettings() {
    const s = this.data.settings;
    this.root.classList.toggle('symbols-on', s.symbols);
    const sb = $(this.root, 'button[data-act="sound"]');
    sb.innerHTML = s.sound ? ICONS.soundOn : ICONS.soundOff;
    sb.classList.toggle('off', !s.sound);
    sb.setAttribute('aria-pressed', String(s.sound));
    const sy = $(this.root, 'button[data-act="symbols"]');
    sy.classList.toggle('off', !s.symbols);
    sy.setAttribute('aria-pressed', String(s.symbols));
    this.sound.enabled = s.sound;
  }

  // ---------------------------------------------------------------- input

  private onAction(act: string) {
    switch (act) {
      case 'undo':
        return this.doUndo();
      case 'restart':
        return this.doRestart();
      case 'add':
        return this.doAddBottle();
      case 'sound':
        this.data.settings.sound = !this.data.settings.sound;
        this.applySettings();
        this.persist();
        this.sound.select();
        return;
      case 'symbols':
        this.data.settings.symbols = !this.data.settings.symbols;
        this.applySettings();
        this.persist();
        return;
      case 'dismiss':
        this.stuckDismissed = true;
        return this.hideSheet();
      case 'next':
        return this.nextLevel();
    }
  }

  private select(i: number | null) {
    if (this.selected !== null) this.slots[this.selected]?.classList.remove('lifted');
    this.selected = i;
    if (i !== null) this.slots[i].classList.add('lifted');
  }

  private onTap(i: number) {
    const g = this.game;
    if (!g || g.won) return;
    const sel = this.selected;
    if (sel === null) {
      if (g.board[i].length === 0) return this.shake(i);
      this.select(i);
      this.sound.select();
      return;
    }
    if (sel === i) {
      this.select(null);
      return;
    }
    if (canPour(g.board, sel, i)) {
      void this.doPour(sel, i);
      return;
    }
    // Not a valid target: switch the selection to it if it has liquid.
    if (g.board[i].length > 0) {
      this.select(i);
      this.sound.select();
    } else {
      this.shake(i);
    }
  }

  private shake(i: number) {
    this.sound.deny();
    const b = $(this.slots[i], '.bottle');
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
  }

  // ---------------------------------------------------------------- actions

  private async doPour(s: number, d: number) {
    const g = this.game!;
    const before = g.board;
    const { game, amount } = pour(g, s, d);
    if (amount === 0) return;
    this.game = game;
    this.persist(); // saved before the animation even starts
    this.selected = null;
    this.updateHud();
    this.analyzeToken++;

    // The game state is already final; the animation is queued per bottle so
    // fast tapping never drops input – a pour involving a bottle that is still
    // animating starts as soon as that bottle is free.
    const epoch = this.epoch;
    this.pendingPours++;
    const queued = (this.busyCount[s] ?? 0) + (this.busyCount[d] ?? 0) > 0;
    // a queued source shouldn't look selected while it waits its turn
    if (queued) this.slots[s].classList.remove('lifted');
    this.busyCount[s] = (this.busyCount[s] ?? 0) + 1;
    this.busyCount[d] = (this.busyCount[d] ?? 0) + 1;
    const wait = Promise.all([this.locks[s], this.locks[d]]);
    const run = wait.then(async () => {
      if (epoch !== this.epoch) return;
      try {
        await this.animatePour(s, d, amount, before, game.board, epoch);
      } catch {
        /* animation interrupted */
      }
      if (epoch === this.epoch) {
        this.busyCount[s]--;
        this.busyCount[d]--;
      }
    });
    this.locks[s] = this.locks[d] = run;
    await run;
    if (epoch !== this.epoch) return;
    this.pendingPours--;
    if (this.pendingPours === 0) this.flushIdle();
    if (isComplete(game.board[d])) this.sound.complete();
    if (this.game?.won && this.game === game) {
      await this.whenIdle();
      if (this.game === game) setTimeout(() => this.showWin(true), 350);
      return;
    }
    if (this.game === game) this.checkStuck();
  }

  private async animatePour(s: number, d: number, amount: number, before: Board, after: Board, epoch: number) {
    const L = this.layout;
    const sSlot = this.slots[s];
    const sB = $(sSlot, '.bottle');
    const sc = L.cells[s];
    const dc = L.cells[d];
    const w = L.gw;
    const h = L.gh;
    const dir = dc.gx >= sc.gx ? 1 : -1;
    // mouth of the source lands just above the target's mouth
    const mx = dc.gx + w / 2 - dir * w * 0.2;
    const my = dc.gy - h * 0.1;
    const dx = mx - (sc.gx + w / 2);
    const dy = my - sc.gy;
    const remaining = after[s].length;
    const ang = dir * (70 + 9 * (CAPACITY - remaining));
    const wasLifted = sSlot.classList.contains('lifted');
    const from = wasLifted ? `translateY(${-L.lift}px)` : 'translate(0,0)';
    const pose = `translate(${dx}px, ${dy}px) rotate(${ang}deg)`;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // catch up quickly when the player taps faster than the animations
    const k = reduce ? 0.35 : this.pendingPours > 1 ? 0.5 : 1;

    sSlot.classList.add('pouring');
    if (this.selected !== s) sSlot.classList.remove('lifted');
    const go = sB.animate([{ transform: from }, { transform: pose }], {
      duration: 260 * k,
      easing: 'cubic-bezier(.3,.8,.3,1)',
      fill: 'forwards',
    });
    this.running.push(go);
    await go.finished;
    if (epoch !== this.epoch) return;

    // Pour phase
    this.renderBottle(d, after[d], amount);
    const pourMs = (140 + 110 * amount) * k;
    const srcUnits = Array.from(sSlot.querySelectorAll<HTMLElement>('.unit')).slice(-amount);
    const dstUnits = Array.from(this.slots[d].querySelectorAll<HTMLElement>('.unit.incoming'));
    const liquidH = h * 0.86; // matches CSS .liquid height
    const surfaceY = dc.gy + h - (liquidH * before[d].length) / CAPACITY;

    const stream = document.createElement('div');
    stream.className = 'stream';
    stream.style.background = COLORS[after[d][after[d].length - 1].c].fill;
    stream.style.left = `${mx - w * 0.07}px`;
    stream.style.width = `${w * 0.14}px`;
    stream.style.top = `${my}px`;
    stream.style.height = `${Math.max(8, surfaceY - my)}px`;
    this.boardEl.appendChild(stream);

    this.sound.pour(amount, before[d].length, pourMs);
    const anims: Animation[] = [
      stream.animate(
        [
          { transform: 'scaleY(0)', transformOrigin: 'top' },
          { transform: 'scaleY(1)', transformOrigin: 'top', offset: 0.18 },
          { transform: 'scaleY(1)', transformOrigin: 'bottom', offset: 0.8 },
          { transform: 'scaleY(0)', transformOrigin: 'bottom' },
        ],
        { duration: pourMs + 120 * k, fill: 'forwards' },
      ),
      ...srcUnits.map((u) =>
        u.animate([{ height: '25%' }, { height: '0%' }], { duration: pourMs, delay: 60 * k, fill: 'forwards', easing: 'ease-in-out' }),
      ),
      ...dstUnits.map((u) =>
        u.animate([{ height: '0%' }, { height: '25%' }], { duration: pourMs, delay: 90 * k, fill: 'forwards', easing: 'ease-in-out' }),
      ),
    ];
    this.running.push(...anims);
    try {
      await Promise.all(anims.map((a) => a.finished));
    } catch {
      /* cancelled */
    }
    stream.remove();
    if (epoch !== this.epoch) return;
    this.renderBottle(s, after[s]);
    this.renderBottle(d, after[d]);
    const topUnit = $(sSlot, '.unit:last-child');
    if (topUnit && before[s][before[s].length - amount - 1]?.h) topUnit.classList.add('reveal');

    const back = sB.animate([{ transform: pose }, { transform: 'translate(0,0)' }], {
      duration: 240 * k,
      easing: 'cubic-bezier(.4,0,.2,1)',
      fill: 'forwards',
    });
    this.running.push(back);
    try {
      await back.finished;
    } catch {
      /* cancelled */
    }
    if (epoch !== this.epoch) return;
    go.cancel();
    back.cancel();
    sSlot.classList.remove('pouring');
    this.running = this.running.filter((a) => a !== go && a !== back && !anims.includes(a));
  }

  /** Abandon all running pour animations and snap to the true state. */
  private cancelAnimations() {
    this.epoch++;
    for (const a of this.running) {
      try {
        a.cancel();
      } catch {
        /* ignore */
      }
    }
    this.running = [];
    this.locks = [];
    this.busyCount = [];
    this.pendingPours = 0;
    this.boardEl?.querySelectorAll('.stream').forEach((e) => e.remove());
    this.slots.forEach((s) => s.classList.remove('pouring'));
    this.flushIdle();
  }

  private whenIdle(): Promise<void> {
    if (this.pendingPours === 0) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  private flushIdle() {
    const w = this.idleWaiters;
    this.idleWaiters = [];
    w.forEach((f) => f());
  }

  private afterStateJump() {
    this.cancelAnimations();
    this.select(null);
    this.stuckDismissed = false;
    this.analyzeToken++;
    this.hideSheet();
    if (this.slots.length !== this.game!.board.length) this.rebuildBottles();
    else this.game!.board.forEach((b, i) => this.renderBottle(i, b));
    this.updateHud();
    this.persist();
  }

  private doUndo() {
    if (!this.game || !canUndo(this.game)) return;
    this.game = undo(this.game);
    this.afterStateJump();
    this.checkStuck();
  }

  private doRestart() {
    if (!this.game) return;
    this.game = restart(this.game);
    this.afterStateJump();
    this.rebuildBottles();
  }

  private doAddBottle() {
    if (!this.game || !canAddBottle(this.game)) return;
    this.game = addBottle(this.game);
    this.afterStateJump();
    this.sound.select();
  }

  private async nextLevel() {
    if (!this.game) return;
    const n = this.game.level + 1;
    this.hideWin();
    this.cancelAnimations();
    await this.loadLevel(n);
  }

  // ---------------------------------------------------------------- stuck detection

  private async checkStuck() {
    const g = this.game;
    if (!g || g.won) return;
    // "Keep looking" only silences the dead-end warning; truly having no moves always shows.
    if (!hasUsefulMove(g.board)) {
      await this.whenIdle();
      if (this.game === g) this.showSheet('stuck');
      return;
    }
    if (this.stuckDismissed) return;
    const token = ++this.analyzeToken;
    let status: string;
    try {
      status = await this.gen.analyze(g.board);
    } catch {
      return;
    }
    if (status !== 'dead' || token !== this.analyzeToken || this.game !== g) return;
    await this.whenIdle();
    if (this.game === g && !this.stuckDismissed) this.showSheet('dead');
  }

  // ---------------------------------------------------------------- overlays

  private overlayOpen() {
    return this.root.querySelector('.overlay:not([hidden]):not(.loading)') !== null;
  }

  private setLoading(on: boolean) {
    $(this.root, '.loading').hidden = !on;
  }

  private showSheet(kind: SheetKind) {
    const g = this.game!;
    this.select(null);
    $(this.root, '.sheet-title').textContent = kind === 'stuck' ? 'No moves left' : 'Dead end';
    $(this.root, '.sheet-text').textContent =
      kind === 'stuck'
        ? 'There are no useful pours left. Undo a few moves, add an extra bottle, or start over.'
        : 'This position can no longer be solved. Undo a few moves, add an extra bottle, or start over.';
    $(this.root, '.sheet button[data-act="dismiss"]').hidden = kind === 'stuck';
    $(this.root, '.sheet button[data-act="add"]').hidden = !canAddBottle(g);
    this.updateHud();
    $(this.root, '.sheet-wrap').hidden = false;
  }

  private hideSheet() {
    $(this.root, '.sheet-wrap').hidden = true;
  }

  private showWin(fresh: boolean) {
    const g = this.game!;
    this.select(null);
    $(this.root, '.win-level').textContent = String(g.level);
    $(this.root, '.win-sub').textContent = `Solved in ${g.moves} move${g.moves === 1 ? '' : 's'}`;
    const conf = $(this.root, '.confetti');
    conf.innerHTML = '';
    if (fresh) {
      this.sound.win();
      const used = [...new Set(g.board.flat().map((u) => u.c))];
      for (let i = 0; i < 36; i++) {
        const p = document.createElement('i');
        p.style.left = `${Math.random() * 100}%`;
        p.style.background = COLORS[used[i % used.length]].fill;
        p.style.animationDelay = `${Math.random() * 0.5}s`;
        p.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
        p.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
        conf.appendChild(p);
      }
    }
    $(this.root, '.win-wrap').hidden = false;
    this.hideSheet();
  }

  private hideWin() {
    $(this.root, '.win-wrap').hidden = true;
  }
}

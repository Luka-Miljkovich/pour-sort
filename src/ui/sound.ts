/**
 * Tiny synthesized sound effects (Web Audio) – no audio files to download.
 * iOS only allows audio after a user gesture, so `unlock()` is called on the
 * first touch.
 */
export class Sound {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private ok() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  select() {
    if (this.ok()) this.tone(660, 0, 0.07, 'sine', 0.18, 880);
  }

  deny() {
    if (this.ok()) this.tone(180, 0, 0.12, 'triangle', 0.18, 120);
  }

  /** bubbly glugs whose pitch rises as the target fills */
  pour(amount: number, fillBefore: number, duration: number) {
    if (!this.ok()) return;
    const n = Math.max(3, Math.round(duration / 70));
    for (let i = 0; i < n; i++) {
      const level = fillBefore + (amount * i) / n;
      const f = 260 + level * 85 + (i % 2) * 30;
      this.tone(f, i * (duration / 1000 / n), 0.06, 'sine', 0.22, f * 1.6);
    }
  }

  complete() {
    if (!this.ok()) return;
    this.tone(880, 0, 0.18, 'sine', 0.2);
    this.tone(1320, 0.06, 0.22, 'sine', 0.15);
  }

  win() {
    if (!this.ok()) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.11, 0.35, 'triangle', 0.22));
  }
}

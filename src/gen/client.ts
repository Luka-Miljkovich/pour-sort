import type { Board } from '../core/board';
import type { GeneratedLevel } from './generator';
import type { AnalyzeStatus, WorkerRequest, WorkerResponse } from './protocol';

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;
type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

/**
 * Talks to the generator Web Worker so heavy work never blocks the UI.
 * Generated levels are cached in memory; the next level is prefetched.
 */
export class GenClient {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private levels = new Map<number, Promise<GeneratedLevel>>();

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const r = e.data;
      const p = this.pending.get(r.id);
      if (!p) return;
      this.pending.delete(r.id);
      if (r.type === 'error') p.reject(new Error(r.message));
      else if (r.type === 'generate') p.resolve(r.level);
      else p.resolve(r.status);
    };
  }

  private call<T>(req: DistributiveOmit<WorkerRequest, 'id'>): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  level(n: number): Promise<GeneratedLevel> {
    let p = this.levels.get(n);
    if (!p) {
      p = this.call<GeneratedLevel>({ type: 'generate', level: n });
      p.catch(() => this.levels.delete(n));
      this.levels.set(n, p);
      // keep the cache small
      for (const k of this.levels.keys()) if (k < n - 1) this.levels.delete(k);
    }
    return p;
  }

  prefetch(n: number): void {
    void this.level(n).catch(() => {});
  }

  analyze(board: Board): Promise<AnalyzeStatus> {
    return this.call<AnalyzeStatus>({ type: 'analyze', board });
  }
}

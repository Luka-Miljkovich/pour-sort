import type { Board } from '../core/board';
import { analyzeBoard } from './analyze';
import { generateLevel, GeneratedLevel } from './generator';
import type { AnalyzeStatus, WorkerRequest, WorkerResponse } from './protocol';
// Inlined as a blob: works offline, inside sandboxed hosts, and never goes
// stale in the service-worker cache.
import GenWorker from './worker?worker&inline';

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;
type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

/**
 * Talks to the generator Web Worker so heavy work never blocks the UI.
 * If workers are unavailable it falls back to the main thread (slower, still works).
 * Generated levels are cached in memory; the next level is prefetched.
 */
export class GenClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private levels = new Map<number, Promise<GeneratedLevel>>();

  constructor() {
    try {
      this.worker = new GenWorker();
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const r = e.data;
        const p = this.pending.get(r.id);
        if (!p) return;
        this.pending.delete(r.id);
        if (r.type === 'error') p.reject(new Error(r.message));
        else if (r.type === 'generate') p.resolve(r.level);
        else p.resolve(r.status);
      };
      this.worker.onerror = () => this.fallback();
    } catch {
      this.worker = null;
    }
  }

  /** Worker failed to start: answer everything (pending too) on the main thread. */
  private fallback() {
    this.worker?.terminate();
    this.worker = null;
    // re-run requests that never got an answer
    const stuck = [...this.pending.entries()];
    this.pending.clear();
    for (const [, p] of stuck) p.reject(new Error('worker unavailable'));
    this.levels.clear();
  }

  private local(req: DistributiveOmit<WorkerRequest, 'id'>): Promise<any> {
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(req.type === 'generate' ? generateLevel(req.level) : analyzeBoard(req.board));
        } catch (e) {
          reject(e);
        }
      }, 16),
    );
  }

  private call<T>(req: DistributiveOmit<WorkerRequest, 'id'>): Promise<T> {
    if (!this.worker) return this.local(req);
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        // a worker failure falls back to local computation
        reject: () => this.local(req).then(resolve, reject),
      });
      this.worker!.postMessage({ ...req, id } as WorkerRequest);
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

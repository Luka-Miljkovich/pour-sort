import type { Board } from '../core/board';
import type { GeneratedLevel } from './generator';

export type WorkerRequest =
  | { id: number; type: 'generate'; level: number }
  | { id: number; type: 'analyze'; board: Board };

export type AnalyzeStatus = 'solvable' | 'dead' | 'unknown';

export type WorkerResponse =
  | { id: number; type: 'generate'; level: GeneratedLevel }
  | { id: number; type: 'analyze'; status: AnalyzeStatus }
  | { id: number; type: 'error'; message: string };

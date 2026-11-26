/// <reference lib="webworker" />
import { analyzeBoard } from './analyze';
import { generateLevel } from './generator';
import type { WorkerRequest, WorkerResponse } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  let res: WorkerResponse;
  try {
    if (req.type === 'generate') res = { id: req.id, type: 'generate', level: generateLevel(req.level) };
    else res = { id: req.id, type: 'analyze', status: analyzeBoard(req.board) };
  } catch (err) {
    res = { id: req.id, type: 'error', message: String(err) };
  }
  ctx.postMessage(res);
};

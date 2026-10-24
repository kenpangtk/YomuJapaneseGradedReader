import type { Language } from '../types';
import type { RawTokenizedSentence, WorkerRequest, WorkerResponse } from './protocol';

export type TokenizerStatus = 'idle' | 'loading' | 'ready' | 'error';

type StatusListener = (status: TokenizerStatus, message?: string) => void;

const listeners = new Set<StatusListener>();

let worker: Worker | null = null;
let nextId = 1;
let status: TokenizerStatus = 'idle';
let statusMessage: string | undefined;
let warmupPromise: Promise<void> | null = null;

const pending = new Map<
  number,
  { resolve: (value: WorkerResponse) => void; reject: (error: Error) => void }
>();

function setStatus(next: TokenizerStatus, message?: string): void {
  status = next;
  statusMessage = message;
  listeners.forEach((listener) => listener(status, statusMessage));
}

export function getTokenizerStatus(): { status: TokenizerStatus; message?: string } {
  return { status, message: statusMessage };
}

export function subscribeTokenizerStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  listener(status, statusMessage);
  return () => listeners.delete(listener);
}

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(`${import.meta.env.BASE_URL}yomu-tokenizer.worker.js`);
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.type === 'error') {
      setStatus('error', response.message);
      request.reject(new Error(response.message));
      return;
    }
    setStatus('ready');
    request.resolve(response);
  };
  worker.onerror = (event) => {
    const message = event.message || 'Tokenizer worker failed.';
    setStatus('error', message);
    pending.forEach((request) => request.reject(new Error(message)));
    pending.clear();
  };
  return worker;
}

function send(request: WorkerRequest): Promise<WorkerResponse> {
  const activeWorker = ensureWorker();
  return new Promise((resolve, reject) => {
    pending.set(request.id, { resolve, reject });
    activeWorker.postMessage(request);
  });
}

export function warmupTokenizer(): Promise<void> {
  if (status === 'ready') return Promise.resolve();
  if (warmupPromise) return warmupPromise;
  setStatus('loading');
  const id = nextId++;
  warmupPromise = send({ type: 'warmup', id })
    .then(() => undefined)
    .catch((error) => {
      warmupPromise = null;
      throw error;
    });
  return warmupPromise;
}

export async function tokenizeSentences(
  sentences: string[],
  language: Language = 'ja',
): Promise<RawTokenizedSentence[]> {
  if (language === 'zh') {
    const { tokenizeChineseSentences } = await import('./zh');
    return tokenizeChineseSentences(sentences);
  }
  await warmupTokenizer();
  const id = nextId++;
  const response = await send({ type: 'tokenize', id, sentences });
  if (response.type !== 'tokens') {
    throw new Error('Unexpected tokenizer response.');
  }
  return response.sentences;
}

export interface RawToken {
  surface: string;
  dictionary: string;
  reading: string;
  pos: string;
  posDetail: string;
  properNoun: boolean;
  start: number;
  end: number;
}

export interface RawTokenizedSentence {
  text: string;
  tokens: RawToken[];
}

export type WorkerRequest =
  | { type: 'warmup'; id: number }
  | { type: 'tokenize'; id: number; sentences: string[] };

export type WorkerResponse =
  | { type: 'ready'; id: number }
  | { type: 'tokens'; id: number; sentences: RawTokenizedSentence[] }
  | { type: 'error'; id: number; message: string };

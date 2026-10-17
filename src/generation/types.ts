import type { ProviderKind, StoryLength } from '../types';

export interface ReviewWordRequest {
  id: string;
  dictionary: string;
  reading: string;
  gloss: string;
  pos: string;
  jlpt: number | null;
  aboveLevel: boolean;
  firstStoryPending: boolean;
  sourceSentence: string | null;
  targetOccurrences: number;
}

export interface GenerationRequest {
  level: number;
  newWordCap: number;
  lengthPreference: StoryLength;
  targetChars: { min: number; max: number; target: number };
  topic: string;
  interests: string[];
  seed: number;
  reviewWords: ReviewWordRequest[];
  knownWords: string[];
  grammar: string[];
  style: string;
  recentTitles: string[];
  recentStoryIds: string[];
  repairNotes: string[];
}

export interface Provider {
  kind: ProviderKind;
  generate(
    request: GenerationRequest,
    onText: (chunk: string) => void,
    signal: AbortSignal,
  ): Promise<string>;
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export function abortError(): Error {
  const error = new Error('Generation cancelled.');
  error.name = 'AbortError';
  return error;
}

export type FuriganaMode = 'off' | 'always' | 'hover' | 'learn';
export type StoryLength = 'short' | 'medium' | 'long';
export type WordState = 'learning' | 'known' | 'suspended';
export type Difficulty = 'too_easy' | 'just_right' | 'too_hard';
export type RecallResponse = 'knew' | 'sort_of' | 'didnt_know';
export type ProviderKind = 'mock' | 'openai';

export const STORY_LENGTH_LABELS: Record<StoryLength, string> = {
  short: 'Short · 2–4 min',
  medium: 'Medium',
  long: 'Long',
};

export const FURIGANA_LABELS: Record<FuriganaMode, string> = {
  off: 'Off',
  always: 'Always',
  hover: 'On hover / tap',
  learn: 'Learn-only',
};

export interface Profile {
  id: 'profile';
  level: number;
  levelLocked: boolean;
  furiganaMode: FuriganaMode;
  translationsDefault: boolean;
  interests: string[];
  storyLength: StoryLength;
  onboarded: boolean;
  contentNoticeAcknowledged: boolean;
  hardness: number;
  newWordCap: number;
  consecutiveHard: number;
  consecutiveEasy: number;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  id: 'settings';
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  furiganaDefault: FuriganaMode;
  textSize: number;
  translationsDefault: boolean;
  locale: 'en';
  updatedAt: number;
}

export interface WordCheckRecord {
  storyId: string;
  response: RecallResponse;
  at: number;
}

export interface Word {
  id: string;
  dictionary: string;
  reading: string;
  surfaceForms: string[];
  gloss: string;
  pos: string;
  jlpt: number | null;
  state: WordState;
  aboveLevel: boolean;
  firstStoryPending: boolean;
  recognition: number;
  successes: number;
  lapses: number;
  stabilityDays: number;
  dueAt: number;
  lastSeenAt: number | null;
  exposures: number;
  checks: WordCheckRecord[];
  sourceStoryId: string | null;
  sourceSentence: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface FuriganaSegment {
  text: string;
  ruby?: string;
}

export interface ReaderToken {
  surface: string;
  dictionary: string;
  reading: string;
  pos: string;
  posDetail: string;
  properNoun: boolean;
  jlpt: number | null;
  gloss: string;
  start: number;
  end: number;
  furigana: FuriganaSegment[];
}

export interface PhraseSpan {
  start: number;
  end: number;
  gloss: string;
  source: string;
}

export interface ReaderSentence {
  text: string;
  translationEn: string;
  tokens: ReaderToken[];
  phrases: PhraseSpan[];
}

export interface TargetWord {
  dictionary: string;
  reading: string;
  gloss: string;
  occurrences: number;
}

export interface GenerationMeta {
  provider: ProviderKind;
  model: string;
  attempts: number;
  fallbackUsed: boolean;
  seed: number;
  requestLevel: number;
  reviewWordIds: string[];
  validation: ValidationSummary | null;
  generatedAt: number;
  repairNotes: string[];
}

export interface ValidationSummary {
  passed: boolean;
  rawCoverage: number;
  adjustedCoverage: number;
  newWordCount: number;
  newWords: string[];
  kanjiOutOfLevelPct: number;
  length: number;
  reviewOccurrences: Record<string, number>;
  warnings?: string[];
  errors: string[];
}

export interface Story {
  id: string;
  createdAt: number;
  level: number;
  levelAtGeneration: number;
  topic: string;
  titleJa: string;
  titleEn: string;
  text: string;
  sentences: ReaderSentence[];
  targetWords: TargetWord[];
  grammarPoints: string[];
  generationMeta: GenerationMeta;
  isFallback: boolean;
  fallbackLabel: string | null;
  readState: 'unread' | 'reading' | 'finished';
  progress: number;
  finishedAt: number | null;
  feedbackSubmitted: boolean;
  lookupCount: number;
  translationReveals: number;
  charCount: number;
  tokenCount: number;
  selectedReviewWordIds: string[];
}

export interface Feedback {
  storyId: string;
  comprehension: number | null;
  difficulty: Difficulty | null;
  interest: number | null;
  skipped: boolean;
  wordChecks: { wordId: string; response: RecallResponse }[];
  lookupCount: number;
  translationReveals: number;
  createdAt: number;
  adaptationSummary: string;
  levelBefore: number;
  levelAfter: number;
}

export interface GenerationLog {
  id: string;
  storyId: string | null;
  request: string;
  model: string;
  attempts: number;
  validation: ValidationSummary | null;
  fallbackUsed: boolean;
  error: string | null;
  createdAt: number;
}

export interface AppEvent {
  id: string;
  type: 'lookup' | 'translation' | 'add' | 'finish' | 'report';
  storyId: string | null;
  wordId: string | null;
  createdAt: number;
}

export interface ExportBundle {
  app: 'yomu';
  version: 2;
  exportedAt: number;
  profile: Profile | null;
  settings: Omit<AppSettings, 'id'> | null;
  words: Word[];
  stories: Story[];
  feedback: Feedback[];
  generationLogs: GenerationLog[];
  events: AppEvent[];
}

export interface ImportPreview {
  bundle: ExportBundle;
  counts: {
    words: number;
    stories: number;
    feedback: number;
    events: number;
    generationLogs: number;
  };
  warnings: string[];
}

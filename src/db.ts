import Dexie, { type Table } from 'dexie';
import { DAY_MS, tomorrow } from './lib/date';
import { isAboveLevel, baseNewWordCap } from './lib/level';
import { newId } from './lib/random';
import type {
  AppEvent,
  AppSettings,
  ExportBundle,
  Feedback,
  GenerationLog,
  Language,
  Profile,
  Story,
  Word,
} from './types';
import { mergeImportData, type MergeResult } from './lib/exportImport';
import { defaultLanguageState, normalizeSavedLevels } from './lib/languageDefaults';
import {
  FALLBACK_BASE_URL,
  FALLBACK_MODEL,
  hasOptedOutOfSharedProvider,
  resetSharedProviderState,
  sharedProviderDefaults,
} from './lib/sharedConfig';

const API_KEY_STORAGE = 'yomu.openai.apiKey';

export class YomuDatabase extends Dexie {
  profile!: Table<Profile, string>;
  words!: Table<Word, string>;
  stories!: Table<Story, string>;
  feedback!: Table<Feedback, string>;
  generationLogs!: Table<GenerationLog, string>;
  settings!: Table<AppSettings, string>;
  events!: Table<AppEvent, string>;

  constructor() {
    super('yomu');
    this.version(1).stores({
      profile: 'id',
      words: 'id, state, dueAt, recognition, &[dictionary+reading]',
      stories: 'id, createdAt, level',
      feedback: 'storyId, createdAt',
      generationLogs: 'id, storyId, createdAt',
      settings: 'id',
    });

    this.version(2)
      .stores({
        profile: 'id',
        words: 'id, state, dueAt, recognition, &[dictionary+reading], lastSeenAt',
        stories: 'id, createdAt, level, readState',
        feedback: 'storyId, createdAt',
        generationLogs: 'id, storyId, createdAt',
        settings: 'id',
        events: 'id, type, storyId, createdAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Profile>('profile')
          .toCollection()
          .modify((profile) => {
            profile.hardness ??= 0;
            profile.newWordCap ??= baseNewWordCap(profile.level ?? 2);
            profile.consecutiveHard ??= 0;
            profile.consecutiveEasy ??= 0;
            profile.levelLocked ??= false;
          });
      });

    this.version(3)
      .stores({
        profile: 'id',
        words: 'id, language, state, dueAt, recognition, [language+dictionary+reading], lastSeenAt, [language+state]',
        stories: 'id, createdAt, level, readState, language, [language+createdAt]',
        feedback: 'storyId, createdAt',
        generationLogs: 'id, storyId, createdAt',
        settings: 'id',
        events: 'id, type, storyId, createdAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Word>('words')
          .toCollection()
          .modify((word) => {
            word.language ??= 'ja';
          });
        await transaction
          .table<Story>('stories')
          .toCollection()
          .modify((story) => {
            story.language ??= 'ja';
          });
        await transaction
          .table<Profile>('profile')
          .toCollection()
          .modify((profile) => {
            profile.language ??= 'ja';
            profile.savedLevels = normalizeSavedLevels(profile);
          });
      });
  }
}

export const db = new YomuDatabase();

function readStoredApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export type ApiKeySource = 'saved' | 'shared' | 'none';

export function getApiKeySource(): ApiKeySource {
  if (readStoredApiKey()) return 'saved';
  return sharedProviderDefaults.enabled ? 'shared' : 'none';
}

export function getApiKey(): string {
  return readStoredApiKey() || (sharedProviderDefaults.enabled ? sharedProviderDefaults.apiKey : '');
}

export function setApiKey(value: string): void {
  localStorage.setItem(API_KEY_STORAGE, value);
}

export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE);
}

export function defaultProfile(now = Date.now()): Profile {
  const ja = defaultLanguageState('ja');
  return {
    id: 'profile',
    language: 'ja',
    level: ja.level,
    levelLocked: false,
    furiganaMode: ja.furiganaMode,
    translationsDefault: false,
    interests: [],
    storyLength: 'short',
    onboarded: false,
    contentNoticeAcknowledged: false,
    hardness: ja.hardness,
    newWordCap: ja.newWordCap,
    consecutiveHard: ja.consecutiveHard,
    consecutiveEasy: ja.consecutiveEasy,
    savedLevels: {
      ja,
      zh: defaultLanguageState('zh'),
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function defaultSettings(now = Date.now()): AppSettings {
  return {
    id: 'settings',
    provider: sharedProviderDefaults.enabled ? 'openai' : 'mock',
    baseUrl: sharedProviderDefaults.enabled ? sharedProviderDefaults.baseUrl : FALLBACK_BASE_URL,
    model: sharedProviderDefaults.enabled ? sharedProviderDefaults.model : FALLBACK_MODEL,
    furiganaDefault: 'always',
    textSize: 100,
    translationsDefault: false,
    locale: 'en',
    updatedAt: now,
  };
}

export async function getProfile(): Promise<Profile | undefined> {
  return db.profile.get('profile');
}

export async function ensureProfile(): Promise<Profile> {
  const existing = await getProfile();
  if (existing) return existing;
  const profile = defaultProfile();
  await db.profile.put(profile);
  return profile;
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.profile.put({ ...profile, updatedAt: Date.now() });
}

export async function patchProfile(patch: Partial<Profile>): Promise<Profile> {
  const current = await ensureProfile();
  const next = { ...current, ...patch, id: 'profile' as const, updatedAt: Date.now() };
  await db.profile.put(next);
  return next;
}

export async function getSettings(): Promise<AppSettings> {
  const existing = await db.settings.get('settings');
  if (!existing) {
    const settings = defaultSettings();
    await db.settings.put(settings);
    return settings;
  }

  if (!sharedProviderDefaults.enabled || hasOptedOutOfSharedProvider()) return existing;
  if (readStoredApiKey()) return existing;

  const alreadyShared =
    existing.provider === 'openai' &&
    existing.baseUrl === sharedProviderDefaults.baseUrl &&
    existing.model === sharedProviderDefaults.model;

  if (alreadyShared) return existing;

  const settings: AppSettings = {
    ...existing,
    provider: 'openai',
    baseUrl: sharedProviderDefaults.baseUrl,
    model: sharedProviderDefaults.model,
    updatedAt: Date.now(),
  };
  await db.settings.put(settings);
  return settings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put({ ...settings, id: 'settings', updatedAt: Date.now() });
}

export function wordId(dictionary: string, reading: string, language: Language = 'ja'): string {
  return language === 'zh' ? `zh:${dictionary}::${reading}` : `${dictionary}::${reading}`;
}

export async function findWord(
  dictionary: string,
  reading: string,
  language: Language = 'ja',
): Promise<Word | undefined> {
  return db.words
    .where('[language+dictionary+reading]')
    .equals([language, dictionary, reading])
    .first();
}

export interface AddWordInput {
  language?: Language;
  dictionary: string;
  reading: string;
  surface: string;
  gloss: string;
  pos: string;
  jlpt: number | null;
  sourceStoryId: string | null;
  sourceSentence: string | null;
  level: number;
}

export async function addWord(input: AddWordInput): Promise<{ word: Word; added: boolean }> {
  const language = input.language ?? 'ja';
  const existing = await findWord(input.dictionary, input.reading, language);
  if (existing) return { word: existing, added: false };
  const now = Date.now();
  const word: Word = {
    id: wordId(input.dictionary, input.reading, language),
    language,
    dictionary: input.dictionary,
    reading: input.reading,
    surfaceForms: [input.surface],
    gloss: input.gloss,
    pos: input.pos,
    jlpt: input.jlpt,
    state: 'learning',
    aboveLevel: isAboveLevel(input.jlpt, input.level, language),
    firstStoryPending: true,
    recognition: 0,
    successes: 0,
    lapses: 0,
    stabilityDays: 1,
    dueAt: tomorrow(now),
    lastSeenAt: null,
    exposures: 0,
    checks: [],
    sourceStoryId: input.sourceStoryId,
    sourceSentence: input.sourceSentence,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.words.add(word);
    return { word, added: true };
  } catch (error) {
    if (error instanceof Dexie.ConstraintError) {
      const concurrent = await findWord(input.dictionary, input.reading, language);
      if (concurrent) return { word: concurrent, added: false };
    }
    throw error;
  }
}

export async function updateWord(id: string, patch: Partial<Word>): Promise<Word | undefined> {
  const existing = await db.words.get(id);
  if (!existing) return undefined;
  const next = { ...existing, ...patch, id, updatedAt: Date.now() };
  await db.words.put(next);
  return next;
}

export async function listWords(language?: Language): Promise<Word[]> {
  if (!language) return db.words.toArray();
  return db.words.where('language').equals(language).toArray();
}

export async function markWordKnown(id: string): Promise<void> {
  const existing = await db.words.get(id);
  if (!existing) return;
  await updateWord(id, {
    state: 'known',
    recognition: 100,
    successes: Math.max(3, existing.successes),
    stabilityDays: 30,
    firstStoryPending: false,
  });
}

export async function suspendWord(id: string): Promise<void> {
  await updateWord(id, { state: 'suspended' });
}

export async function resumeWord(id: string): Promise<void> {
  await updateWord(id, { state: 'learning', dueAt: Date.now() });
}

export async function needsReview(id: string): Promise<void> {
  await updateWord(id, {
    state: 'learning',
    recognition: 50,
    successes: 0,
    stabilityDays: 1,
    dueAt: tomorrow(),
    firstStoryPending: false,
  });
}

export async function deleteWord(id: string): Promise<void> {
  await db.words.delete(id);
}

export async function saveStory(story: Story): Promise<void> {
  await db.stories.put(story);
}

export async function getStory(id: string): Promise<Story | undefined> {
  return db.stories.get(id);
}

export async function updateStory(id: string, patch: Partial<Story>): Promise<void> {
  await db.stories.update(id, patch);
}

export async function listStories(limit?: number, language?: Language): Promise<Story[]> {
  const stories = language
    ? await db.stories.where('language').equals(language).toArray()
    : await db.stories.toArray();
  stories.sort((left, right) => right.createdAt - left.createdAt);
  return limit ? stories.slice(0, limit) : stories;
}

export async function saveFeedback(feedback: Feedback): Promise<void> {
  await db.feedback.put(feedback);
}

export async function getFeedback(storyId: string): Promise<Feedback | undefined> {
  return db.feedback.get(storyId);
}

export async function listFeedback(): Promise<Feedback[]> {
  return db.feedback.toArray();
}

export async function logGeneration(log: GenerationLog): Promise<void> {
  await db.generationLogs.put(log);
}

export async function listGenerationLogs(limit = 50): Promise<GenerationLog[]> {
  return db.generationLogs.orderBy('createdAt').reverse().limit(limit).toArray();
}

export async function addEvent(type: AppEvent['type'], storyId: string | null, wordIdValue: string | null): Promise<void> {
  await db.events.add({
    id: newId('event'),
    type,
    storyId,
    wordId: wordIdValue,
    createdAt: Date.now(),
  });
}

export async function listEvents(): Promise<AppEvent[]> {
  return db.events.toArray();
}

export interface StatsSnapshot {
  storiesRead: number;
  storiesFinished: number;
  medianComprehension: number | null;
  wordsLearning: number;
  wordsKnown: number;
  wordsSuspended: number;
  dueWords: number;
  characterCount: number;
  levelTrend: { at: number; level: number }[];
}

export async function getStats(language?: Language): Promise<StatsSnapshot> {
  const [allStories, allFeedback, allWords, profile] = await Promise.all([
    db.stories.toArray(),
    db.feedback.toArray(),
    db.words.toArray(),
    ensureProfile(),
  ]);
  const stories = language ? allStories.filter((story) => story.language === language) : allStories;
  const words = language ? allWords.filter((word) => word.language === language) : allWords;
  const storyIds = new Set(stories.map((story) => story.id));
  const feedback = language
    ? allFeedback.filter((item) => storyIds.has(item.storyId))
    : allFeedback;
  const activeLevel = language && profile.language !== language
    ? profile.savedLevels[language]?.level ?? profile.level
    : profile.level;

  const completed = feedback.filter((item) => !item.skipped && item.comprehension !== null);
  const comprehensionValues = completed
    .map((item) => item.comprehension ?? 0)
    .sort((left, right) => left - right);
  const median =
    comprehensionValues.length === 0
      ? null
      : comprehensionValues[Math.floor(comprehensionValues.length / 2)] ?? null;
  const ratedStories = stories
    .filter((story) => story.readState === 'finished')
    .sort((left, right) => left.finishedAt! - right.finishedAt!);
  const levelTrend = ratedStories.map((story) => ({
    at: story.finishedAt ?? story.createdAt,
    level: feedback.find((item) => item.storyId === story.id)?.levelAfter ?? story.level,
  }));
  if (levelTrend.length === 0) {
    levelTrend.push({ at: Date.now(), level: activeLevel });
  }
  return {
    storiesRead: stories.filter((story) => story.progress > 0 || story.readState !== 'unread').length,
    storiesFinished: stories.filter((story) => story.readState === 'finished').length,
    medianComprehension: median,
    wordsLearning: words.filter((word) => word.state === 'learning').length,
    wordsKnown: words.filter((word) => word.state === 'known').length,
    wordsSuspended: words.filter((word) => word.state === 'suspended').length,
    dueWords: words.filter(
      (word) => word.state === 'learning' && word.dueAt <= Date.now(),
    ).length,
    characterCount: stories.reduce((total, story) => total + story.charCount, 0),
    levelTrend,
  };
}

export interface ClearResult {
  cleared: boolean;
}

export async function clearAllData(): Promise<ClearResult> {
  await db.transaction(
    'rw',
    [db.profile, db.words, db.stories, db.feedback, db.generationLogs, db.settings, db.events],
    async () => {
      await Promise.all([
        db.profile.clear(),
        db.words.clear(),
        db.stories.clear(),
        db.feedback.clear(),
        db.generationLogs.clear(),
        db.settings.clear(),
        db.events.clear(),
      ]);
    },
  );
  clearApiKey();
  resetSharedProviderState();
  return { cleared: true };
}

export async function createExportBundle(): Promise<ExportBundle> {
  const [profile, settings, words, stories, feedback, generationLogs, events] = await Promise.all([
    getProfile(),
    getSettings(),
    db.words.toArray(),
    db.stories.toArray(),
    db.feedback.toArray(),
    db.generationLogs.toArray(),
    db.events.toArray(),
  ]);
  return {
    app: 'yomu',
    version: 2,
    exportedAt: Date.now(),
    profile: profile ?? null,
    settings: settings
      ? {
          provider: settings.provider,
          baseUrl: settings.baseUrl,
          model: settings.model,
          furiganaDefault: settings.furiganaDefault,
          textSize: settings.textSize,
          translationsDefault: settings.translationsDefault,
          locale: settings.locale,
          updatedAt: settings.updatedAt,
        }
      : null,
    words,
    stories,
    feedback,
    generationLogs,
    events,
  };
}

export function daysSince(timestamp: number | null): number {
  if (!timestamp) return Number.POSITIVE_INFINITY;
  return (Date.now() - timestamp) / DAY_MS;
}

export async function importBundle(bundle: ExportBundle): Promise<MergeResult> {
  const [profile, settings, words, stories, feedback, generationLogs, events] = await Promise.all([
    getProfile(),
    getSettings(),
    db.words.toArray(),
    db.stories.toArray(),
    db.feedback.toArray(),
    db.generationLogs.toArray(),
    db.events.toArray(),
  ]);
  const merged = mergeImportData(
    {
      profile: profile ?? null,
      settings,
      words,
      stories,
      feedback,
      generationLogs,
      events,
    },
    bundle,
  );
  await db.transaction(
    'rw',
    [db.profile, db.words, db.stories, db.feedback, db.generationLogs, db.settings, db.events],
    async () => {
      if (merged.profile) await db.profile.put(merged.profile);
      if (merged.settings) await db.settings.put(merged.settings);
      await db.words.clear();
      await db.words.bulkPut(merged.words);
      await db.stories.clear();
      await db.stories.bulkPut(merged.stories);
      await db.feedback.clear();
      await db.feedback.bulkPut(merged.feedback);
      await db.generationLogs.clear();
      await db.generationLogs.bulkPut(merged.generationLogs);
      await db.events.clear();
      await db.events.bulkPut(merged.events);
    },
  );
  return merged;
}


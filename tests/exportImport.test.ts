import { describe, expect, it } from 'vitest';
import { mergeImportData, parseImport } from '../src/lib/exportImport';
import type {
  AppEvent,
  AppSettings,
  ExportBundle,
  Feedback,
  GenerationLog,
  Profile,
  Story,
  Word,
} from '../src/types';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile',
    level: 2,
    levelLocked: false,
    furiganaMode: 'always',
    translationsDefault: false,
    interests: ['daily life'],
    storyLength: 'short',
    onboarded: true,
    contentNoticeAcknowledged: true,
    hardness: 0,
    newWordCap: 5,
    consecutiveHard: 0,
    consecutiveEasy: 0,
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    id: 'settings',
    provider: 'mock',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    furiganaDefault: 'always',
    textSize: 100,
    translationsDefault: false,
    locale: 'en',
    updatedAt: 100,
    ...overrides,
  };
}

function word(overrides: Partial<Word> = {}): Word {
  return {
    id: '公園::こうえん',
    dictionary: '公園',
    reading: 'こうえん',
    surfaceForms: ['公園'],
    gloss: 'park',
    pos: 'noun',
    jlpt: 5,
    state: 'learning',
    aboveLevel: false,
    firstStoryPending: false,
    recognition: 10,
    successes: 0,
    lapses: 0,
    stabilityDays: 1,
    dueAt: 1000,
    lastSeenAt: null,
    exposures: 1,
    checks: [],
    sourceStoryId: null,
    sourceSentence: null,
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function story(overrides: Partial<Story> = {}): Story {
  return {
    id: 'story-1',
    createdAt: 100,
    level: 2,
    levelAtGeneration: 2,
    topic: 'nature',
    titleJa: '公園',
    titleEn: 'The Park',
    text: '公園。',
    sentences: [],
    targetWords: [],
    grammarPoints: [],
    generationMeta: {
      provider: 'mock',
      model: 'mock',
      attempts: 1,
      fallbackUsed: false,
      seed: 1,
      requestLevel: 2,
      reviewWordIds: [],
      validation: null,
      generatedAt: 100,
      repairNotes: [],
    },
    isFallback: false,
    fallbackLabel: null,
    readState: 'finished',
    progress: 1,
    finishedAt: 200,
    feedbackSubmitted: true,
    lookupCount: 0,
    translationReveals: 0,
    charCount: 3,
    tokenCount: 1,
    selectedReviewWordIds: [],
    ...overrides,
  };
}

function feedback(overrides: Partial<Feedback> = {}): Feedback {
  return {
    storyId: 'story-1',
    comprehension: 3,
    difficulty: 'just_right',
    interest: 2,
    skipped: false,
    wordChecks: [],
    lookupCount: 0,
    translationReveals: 0,
    createdAt: 100,
    adaptationSummary: 'Next story: N4 lower',
    levelBefore: 2,
    levelAfter: 2,
    ...overrides,
  };
}

function bundle(overrides: Partial<ExportBundle> = {}): ExportBundle {
  return {
    app: 'yomu',
    version: 2,
    exportedAt: 100,
    profile: profile(),
    settings: { ...settings(), id: undefined } as unknown as Omit<AppSettings, 'id'>,
    words: [word()],
    stories: [story()],
    feedback: [feedback()],
    generationLogs: [],
    events: [],
    ...overrides,
  };
}

function localData() {
  return {
    profile: profile({ level: 2, updatedAt: 100 }),
    settings: settings({ model: 'old-model', updatedAt: 100 }),
    words: [word({ recognition: 10, updatedAt: 100 })],
    stories: [story({ titleEn: 'Local title' })],
    feedback: [feedback({ comprehension: 2, createdAt: 100 })],
    generationLogs: [
      {
        id: 'log-1',
        storyId: 'story-1',
        request: '{}',
        model: 'mock',
        attempts: 1,
        validation: null,
        fallbackUsed: false,
        error: null,
        createdAt: 100,
      } satisfies GenerationLog,
    ],
    events: [
      {
        id: 'event-1',
        type: 'lookup',
        storyId: 'story-1',
        wordId: null,
        createdAt: 100,
      } satisfies AppEvent,
    ],
  };
}

describe('export/import', () => {
  it('parses a valid Yomu export and previews counts', () => {
    const incoming = bundle();
    incoming.settings = { ...settings(), id: undefined } as unknown as Omit<AppSettings, 'id'>;
    const parsed = parseImport(JSON.stringify(incoming));
    expect(parsed.counts.words).toBe(1);
    expect(parsed.counts.stories).toBe(1);
    expect(parsed.counts.feedback).toBe(1);
    expect(parsed.warnings).toEqual([]);
  });

  it('rejects non-Yomu files and unsupported versions', () => {
    expect(() => parseImport('{"app":"other"}')).toThrow(/not a Yomu export/);
    expect(() => parseImport(JSON.stringify({ ...bundle(), version: 99 }))).toThrow(/Unsupported/);
    expect(() => parseImport('not json')).toThrow(/valid JSON/);
  });

  it('ignores API key-like fields and warns', () => {
    const parsed = parseImport(JSON.stringify({ ...bundle(), apiKey: 'secret' }));
    expect(parsed.warnings[0]).toMatch(/API keys are ignored/);
    expect(JSON.stringify(parsed.bundle)).not.toContain('secret');
  });

  it('merges newer feedback and profile, deduplicates words, and keeps local stories', () => {
    const incoming = bundle({
      profile: profile({ level: 3, updatedAt: 300 }),
      settings: { ...settings({ model: 'new-model', updatedAt: 300 }), id: undefined } as unknown as Omit<
        AppSettings,
        'id'
      >,
      words: [
        word({ recognition: 50, updatedAt: 300 }),
        word({
          id: '猫::ねこ',
          dictionary: '猫',
          reading: 'ねこ',
          surfaceForms: ['猫'],
          gloss: 'cat',
          recognition: 0,
          updatedAt: 300,
        }),
      ],
      stories: [story({ titleEn: 'Imported title' })],
      feedback: [feedback({ comprehension: 5, createdAt: 300 })],
      generationLogs: [
        {
          id: 'log-1',
          storyId: 'story-1',
          request: '{}',
          model: 'mock',
          attempts: 1,
          validation: null,
          fallbackUsed: false,
          error: null,
          createdAt: 300,
        },
        {
          id: 'log-2',
          storyId: 'story-2',
          request: '{}',
          model: 'mock',
          attempts: 1,
          validation: null,
          fallbackUsed: false,
          error: null,
          createdAt: 300,
        },
      ],
      events: [
        { id: 'event-1', type: 'lookup', storyId: 'story-1', wordId: null, createdAt: 300 },
        { id: 'event-2', type: 'add', storyId: 'story-1', wordId: '猫::ねこ', createdAt: 300 },
      ],
    });
    const merged = mergeImportData(localData(), incoming, 500);
    expect(merged.profile?.level).toBe(3);
    expect(merged.settings?.model).toBe('new-model');
    expect(merged.words).toHaveLength(2);
    expect(merged.words.find((item) => item.dictionary === '公園')?.recognition).toBe(50);
    expect(merged.stories).toHaveLength(1);
    expect(merged.stories[0].titleEn).toBe('Local title');
    expect(merged.feedback[0].comprehension).toBe(5);
    expect(merged.generationLogs).toHaveLength(2);
    expect(merged.events).toHaveLength(2);
    expect(merged.addedWords).toBe(1);
    expect(merged.addedStories).toBe(0);
    expect(merged.addedFeedback).toBe(0);
  });

  it('keeps local data when imported data is older', () => {
    const incoming = bundle({
      profile: profile({ level: 1, updatedAt: 50 }),
      words: [word({ recognition: 20, updatedAt: 50 })],
      feedback: [feedback({ comprehension: 1, createdAt: 50 })],
    });
    const merged = mergeImportData(localData(), incoming, 500);
    expect(merged.profile?.level).toBe(2);
    expect(merged.words.find((item) => item.dictionary === '公園')?.recognition).toBe(10);
    expect(merged.feedback[0].comprehension).toBe(2);
  });

  it('restores the imported profile and settings into an empty learner database', () => {
    const emptyLocal = {
      profile: profile({ level: 1, updatedAt: 999 }),
      settings: settings({ model: 'current', updatedAt: 999 }),
      words: [],
      stories: [],
      feedback: [],
      generationLogs: [],
      events: [],
    };
    const incoming = bundle({
      profile: profile({ level: 3, updatedAt: 1 }),
      settings: { ...settings({ model: 'restored', updatedAt: 1 }), id: undefined } as unknown as Omit<
        AppSettings,
        'id'
      >,
      words: [],
      stories: [],
      feedback: [],
    });
    const merged = mergeImportData(emptyLocal, incoming, 1000);
    expect(merged.profile?.level).toBe(3);
    expect(merged.settings?.model).toBe('restored');
  });

  it('round-trips an exported bundle without an API key', () => {
    const snapshot = JSON.stringify(bundle());
    const parsed = parseImport(snapshot);
    expect(JSON.stringify(parsed.bundle)).not.toContain('apiKey');
    expect(parsed.bundle.app).toBe('yomu');
    expect(parsed.bundle.version).toBe(2);
    expect(parsed.bundle.words[0].dictionary).toBe('公園');
  });
});

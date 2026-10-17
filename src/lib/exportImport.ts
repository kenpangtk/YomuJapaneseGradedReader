import type {
  AppEvent,
  AppSettings,
  ExportBundle,
  Feedback,
  GenerationLog,
  ImportPreview,
  Profile,
  Story,
  Word,
} from '../types';

interface ImportData {
  profile: Profile | null;
  settings: AppSettings | null;
  words: Word[];
  stories: Story[];
  feedback: Feedback[];
  generationLogs: GenerationLog[];
  events: AppEvent[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`);
  return value;
}

function validateProfile(value: unknown): Profile | null {
  if (value === null || value === undefined) return null;
  if (!isObject(value)) throw new Error('profile must be an object or null.');
  if (typeof value.level !== 'number' || !Number.isFinite(value.level)) {
    throw new Error('profile.level must be a number.');
  }
  return value as unknown as Profile;
}

function validateSettings(value: unknown): AppSettings | null {
  if (value === null || value === undefined) return null;
  if (!isObject(value)) throw new Error('settings must be an object or null.');
  return value as unknown as AppSettings;
}

function validateWords(values: unknown[]): Word[] {
  return values.map((value, index) => {
    if (!isObject(value)) throw new Error(`words[${index}] must be an object.`);
    if (typeof value.dictionary !== 'string' || typeof value.reading !== 'string') {
      throw new Error(`words[${index}] needs dictionary and reading.`);
    }
    if (typeof value.state !== 'string') throw new Error(`words[${index}] needs a state.`);
    return value as unknown as Word;
  });
}

function validateStories(values: unknown[]): Story[] {
  return values.map((value, index) => {
    if (!isObject(value)) throw new Error(`stories[${index}] must be an object.`);
    if (typeof value.id !== 'string' || typeof value.text !== 'string') {
      throw new Error(`stories[${index}] needs id and text.`);
    }
    if (!Array.isArray(value.sentences)) throw new Error(`stories[${index}].sentences must be an array.`);
    return value as unknown as Story;
  });
}

function validateFeedback(values: unknown[]): Feedback[] {
  return values.map((value, index) => {
    if (!isObject(value)) throw new Error(`feedback[${index}] must be an object.`);
    if (typeof value.storyId !== 'string') throw new Error(`feedback[${index}] needs storyId.`);
    return value as unknown as Feedback;
  });
}

function validateLogs(values: unknown[]): GenerationLog[] {
  return values.map((value, index) => {
    if (!isObject(value)) throw new Error(`generationLogs[${index}] must be an object.`);
    if (typeof value.id !== 'string') throw new Error(`generationLogs[${index}] needs id.`);
    return value as unknown as GenerationLog;
  });
}

function validateEvents(values: unknown[]): AppEvent[] {
  return values.map((value, index) => {
    if (!isObject(value)) throw new Error(`events[${index}] must be an object.`);
    if (typeof value.id !== 'string' || typeof value.type !== 'string') {
      throw new Error(`events[${index}] needs id and type.`);
    }
    return value as unknown as AppEvent;
  });
}

export function parseImport(raw: string): ImportPreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!isObject(parsed) || parsed.app !== 'yomu') {
    throw new Error('This is not a Yomu export file.');
  }
  if (parsed.version !== 1 && parsed.version !== 2) {
    throw new Error(`Unsupported export version: ${String(parsed.version)}.`);
  }
  const warnings: string[] = [];
  if (raw.includes('"apiKey"')) {
    warnings.push('The file appears to contain provider fields. API keys are ignored and never imported.');
  }
  const bundle: ExportBundle = {
    app: 'yomu',
    version: 2,
    exportedAt: typeof parsed.exportedAt === 'number' ? parsed.exportedAt : Date.now(),
    profile: validateProfile(parsed.profile),
    settings: validateSettings(parsed.settings),
    words: validateWords(requireArray(parsed.words ?? [], 'words')),
    stories: validateStories(requireArray(parsed.stories ?? [], 'stories')),
    feedback: validateFeedback(requireArray(parsed.feedback ?? [], 'feedback')),
    generationLogs: validateLogs(requireArray(parsed.generationLogs ?? [], 'generationLogs')),
    events: validateEvents(requireArray(parsed.events ?? [], 'events')),
  };
  return {
    bundle,
    counts: {
      words: bundle.words.length,
      stories: bundle.stories.length,
      feedback: bundle.feedback.length,
      events: bundle.events.length,
      generationLogs: bundle.generationLogs.length,
    },
    warnings,
  };
}

function wordKey(word: Pick<Word, 'dictionary' | 'reading'>): string {
  return `${word.dictionary}::${word.reading}`;
}

function stableWordId(word: Pick<Word, 'dictionary' | 'reading'>): string {
  return `${word.dictionary}::${word.reading}`;
}

export interface MergeResult extends ImportData {
  addedWords: number;
  addedStories: number;
  addedFeedback: number;
}

export function mergeImportData(
  local: ImportData,
  incoming: ExportBundle,
  now = Date.now(),
): MergeResult {
  const localIsEmpty =
    local.words.length === 0 &&
    local.stories.length === 0 &&
    local.feedback.length === 0;
  const profile =
    !local.profile ||
    localIsEmpty ||
    (incoming.profile && incoming.profile.updatedAt > local.profile.updatedAt)
      ? incoming.profile
      : local.profile;

  const localSettings = local.settings;
  const importedSettings = incoming.settings
    ? { ...incoming.settings, id: 'settings' as const }
    : null;
  const settings =
    !localSettings ||
    localIsEmpty ||
    (importedSettings && importedSettings.updatedAt > localSettings.updatedAt)
      ? importedSettings
      : localSettings;

  const wordMap = new Map<string, Word>();
  for (const word of local.words) wordMap.set(wordKey(word), { ...word, id: stableWordId(word) });
  let addedWords = 0;
  for (const word of incoming.words) {
    const key = wordKey(word);
    const existing = wordMap.get(key);
    if (!existing) {
      wordMap.set(key, { ...word, id: stableWordId(word) });
      addedWords += 1;
    } else if ((word.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
      wordMap.set(key, { ...existing, ...word, id: stableWordId(word), createdAt: existing.createdAt });
    }
  }

  const storyMap = new Map<string, Story>();
  for (const story of local.stories) storyMap.set(story.id, story);
  let addedStories = 0;
  for (const story of incoming.stories) {
    if (!storyMap.has(story.id)) {
      storyMap.set(story.id, story);
      addedStories += 1;
    }
  }

  const feedbackMap = new Map<string, Feedback>();
  for (const item of local.feedback) feedbackMap.set(item.storyId, item);
  let addedFeedback = 0;
  for (const item of incoming.feedback) {
    const existing = feedbackMap.get(item.storyId);
    if (!existing) {
      feedbackMap.set(item.storyId, item);
      addedFeedback += 1;
    } else if ((item.createdAt ?? 0) > (existing.createdAt ?? 0)) {
      feedbackMap.set(item.storyId, item);
    }
  }

  const logMap = new Map<string, GenerationLog>();
  for (const log of local.generationLogs) logMap.set(log.id, log);
  for (const log of incoming.generationLogs) if (!logMap.has(log.id)) logMap.set(log.id, log);

  const eventMap = new Map<string, AppEvent>();
  for (const event of local.events) eventMap.set(event.id, event);
  for (const event of incoming.events) if (!eventMap.has(event.id)) eventMap.set(event.id, event);

  return {
    profile: profile ? { ...profile, updatedAt: now } : null,
    settings,
    words: [...wordMap.values()],
    stories: [...storyMap.values()],
    feedback: [...feedbackMap.values()],
    generationLogs: [...logMap.values()],
    events: [...eventMap.values()],
    addedWords,
    addedStories,
    addedFeedback,
  };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

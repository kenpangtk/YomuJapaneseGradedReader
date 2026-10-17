import { db, ensureProfile, getApiKey, getSettings, logGeneration, saveStory } from '../db';
import { alignStory, normalizeContractToClientTokens, validateContractAlignment } from '../lib/alignment';
import { lookupGloss } from '../content/glossary';
import { allowedGrammar, isAboveLevel, lengthRange } from '../lib/level';
import { newId } from '../lib/random';
import { reviewBudgetForLength, selectReviewWords } from '../lib/srs';
import { validateStory } from '../lib/validation';
import { tokenizeSentences } from '../tokenizer/client';
import type { GenerationMeta, Profile, Story, StoryLength, ValidationSummary, Word } from '../types';
import type { ContractStory } from './contract';
import { extractJsonObject, validateContractShape } from './contract';
import { MockProvider } from './mock';
import { buildOfflineStory } from './offline';
import { OpenAiProvider } from './openai';
import type { GenerationRequest, Provider, ReviewWordRequest } from './types';
import { isAbortError } from './types';

export interface GenerateStoryOptions {
  topic?: string;
  length?: StoryLength;
  seed?: number;
  profile?: Profile;
}

export interface GenerationUpdate {
  status: string;
  previewChars: number;
  attempt: number;
}

export interface GenerateStoryResult {
  story: Story;
  logId: string;
  fallback: boolean;
}

function defaultTopic(profile: Profile, seed: number): string {
  if (profile.interests.length === 0) return 'an everyday slice of life';
  return profile.interests[seed % profile.interests.length];
}

function reviewWordRequest(word: Word, level: number): ReviewWordRequest {
  return {
    id: word.id,
    dictionary: word.dictionary,
    reading: word.reading,
    gloss: word.gloss,
    pos: word.pos,
    jlpt: word.jlpt,
    aboveLevel: word.aboveLevel || isAboveLevel(word.jlpt, level),
    firstStoryPending: word.firstStoryPending,
    sourceSentence: word.sourceSentence,
    targetOccurrences: word.firstStoryPending
      ? 2
      : Math.max(1, Math.round(4 * (1 - word.recognition / 100))),
  };
}

function makeRequest(
  profile: Profile,
  level: number,
  topic: string,
  lengthPreference: StoryLength,
  seed: number,
  reviewWords: ReviewWordRequest[],
  knownWords: string[],
  repairNotes: string[],
  previousTitles: string[],
  recentStoryIds: string[],
): GenerationRequest {
  return {
    level,
    newWordCap: profile.newWordCap,
    lengthPreference,
    targetChars: lengthRange(level, lengthPreference),
    topic,
    interests: profile.interests,
    seed,
    reviewWords,
    knownWords,
    grammar: allowedGrammar(level),
    style: 'warm, clear, contemporary graded reader with a complete ending',
    recentTitles: previousTitles,
    recentStoryIds,
    repairNotes,
  };
}

function providerFor(settings: Awaited<ReturnType<typeof getSettings>>): Provider {
  if (settings.provider === 'mock') return new MockProvider();
  return new OpenAiProvider({
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKey: getApiKey(),
  });
}

async function sanitizeRequest(request: GenerationRequest): Promise<string> {
  return JSON.stringify(request).slice(0, 12_000);
}

async function generateAttempt(
  provider: Provider,
  request: GenerationRequest,
  words: Word[],
  selected: Word[],
  recentTexts: string[],
  onUpdate: (update: GenerationUpdate) => void,
  signal: AbortSignal,
): Promise<{
  contract: ContractStory;
  validation: ValidationSummary;
  sentences: Story['sentences'];
  raw: string;
  normalized: boolean;
}> {
  let previewChars = 0;
  onUpdate({ status: 'Writing a story…', previewChars, attempt: request.repairNotes.length + 1 });
  const raw = await provider.generate(
    request,
    (chunk) => {
      previewChars += chunk.length;
      onUpdate({
        status: 'Writing a story…',
        previewChars,
        attempt: request.repairNotes.length + 1,
      });
    },
    signal,
  );
  if (signal.aborted) throw new DOMException('Generation cancelled.', 'AbortError');
  onUpdate({ status: 'Checking level and token alignment…', previewChars, attempt: request.repairNotes.length + 1 });
  const parsed = extractJsonObject(raw);
  const parsedContract = validateContractShape(parsed.value);
  const raws = await tokenizeSentences(parsedContract.sentences.map((sentence) => sentence.text));
  const alignment = validateContractAlignment(parsedContract);
  const normalized = alignment.errors.length > 0;
  const contract = normalized
    ? normalizeContractToClientTokens(parsedContract, raws, lookupGloss)
    : parsedContract;
  const sentences = alignStory(contract, raws, lookupGloss);
  const validation = validateStory(contract, sentences, {
    requestedLevel: request.level,
    lengthPreference: request.lengthPreference,
    newWordCap: request.newWordCap,
    trackedWords: words,
    selectedWords: selected,
    exemptWordIds: selected.map((word) => word.id),
    recentTexts,
  });
  return { contract, validation, sentences, raw, normalized };
}

function storyIdFor(): string {
  return newId('story');
}

export async function generateStory(
  options: GenerateStoryOptions,
  onUpdate: (update: GenerationUpdate) => void,
  signal: AbortSignal,
): Promise<GenerateStoryResult> {
  const profile = options.profile ?? (await ensureProfile());
  const settings = await getSettings();
  const provider = providerFor(settings);
  const allWords = await db.words.toArray();
  const recentStories = await db.stories.orderBy('createdAt').reverse().limit(20).toArray();
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const topic = options.topic?.trim() || defaultTopic(profile, seed);
  const lengthPreference = options.length ?? profile.storyLength;
  const level = profile.level;
  const range = lengthRange(level, lengthPreference);
  const reviewBudget = reviewBudgetForLength(range.target);
  const selected = selectReviewWords(
    allWords,
    level,
    Math.min(reviewBudget, settings.provider === 'mock' ? 2 : reviewBudget),
  );
  const knownWords = allWords
    .filter((word) => word.state === 'known')
    .map((word) => word.dictionary)
    .slice(0, 60);
  const recentTexts = settings.provider === 'mock' ? [] : recentStories.map((story) => story.text);
  const previousTitles = recentStories.map((story) => story.titleJa);
  const selectedRequests = selected.map((word) => reviewWordRequest(word, level));
  let activeLevel = level;
  let repairNotes: string[] = [];
  let lastFailure = '';
  let attempts = 0;
  let finalContract: ContractStory | null = null;
  let finalValidation: ValidationSummary | null = null;
  let finalSentences: Story['sentences'] | null = null;
  let lowered = false;

  while (true) {
    if (signal.aborted) throw new DOMException('Generation cancelled.', 'AbortError');
    attempts += 1;
    const request = makeRequest(
      profile,
      activeLevel,
      topic,
      lengthPreference,
      seed + attempts,
      selectedRequests,
      knownWords,
      repairNotes,
      previousTitles,
      recentStories.map((story) => story.id),
    );
    try {
      const result = await generateAttempt(
        provider,
        request,
        allWords,
        selected,
        recentTexts,
        onUpdate,
        signal,
      );
      if (result.normalized) {
        repairNotes = [
          ...repairNotes,
          'Re-aligned model token offsets with the client tokenizer.',
        ];
      }
      if (result.validation.passed) {
        finalContract = result.contract;
        finalValidation = result.validation;
        finalSentences = result.sentences;
        break;
      }
      lastFailure = result.validation.errors.join(' ');
      repairNotes = result.validation.errors;
      finalValidation = result.validation;
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        throw new DOMException('Generation cancelled.', 'AbortError');
      }
      lastFailure = error instanceof Error ? error.message : 'Generation failed.';
      repairNotes = [lastFailure];
    }

    if (attempts < 3) continue;
    if (!lowered && settings.provider !== 'mock' && activeLevel > 1) {
      activeLevel = Math.max(1, Math.round((activeLevel - 0.25) * 1000) / 1000);
      lowered = true;
      continue;
    }
    break;
  }

  if (!finalContract || !finalSentences || !finalValidation) {
    onUpdate({ status: 'Preparing an offline story…', previewChars: 0, attempt: attempts });
    const offline = await buildOfflineStory({
      level,
      topic,
      interests: profile.interests,
      seed,
      recentStoryIds: recentStories.map((story) => story.id),
      withReviewWords: false,
    });
    const raw = await tokenizeSentences(offline.contract.sentences.map((sentence) => sentence.text));
    const sentences = alignStory(offline.contract, raw, lookupGloss);
    const story = buildStory(
      offline.contract,
      sentences,
      level,
      topic,
      seed,
      provider.kind,
      settings.model,
      attempts,
      true,
      null,
      [],
      activeLevel,
      repairNotes,
    );
    await saveStory(story);
    const logId = newId('log');
    await logGeneration({
      id: logId,
      storyId: story.id,
      request: await sanitizeRequest(
        makeRequest(profile, activeLevel, topic, lengthPreference, seed, selectedRequests, knownWords, [], previousTitles, recentStories.map((story) => story.id)),
      ),
      model: settings.model,
      attempts,
      validation: finalValidation,
      fallbackUsed: true,
      error: lastFailure || 'Validation failed.',
      createdAt: Date.now(),
    });
    return { story, logId, fallback: true };
  }

  onUpdate({ status: 'Saving story…', previewChars: 0, attempt: attempts });
  const story = buildStory(
    finalContract,
    finalSentences,
    level,
    topic,
    seed,
    provider.kind,
    settings.model,
    attempts,
    false,
    finalValidation,
    selected
      .filter((word) => (finalValidation?.reviewOccurrences[word.id] ?? 0) > 0)
      .map((word) => word.id),
    activeLevel,
    repairNotes,
  );
  await saveStoryWithUpdates(story, selected, finalSentences);
  const logId = newId('log');
  await logGeneration({
    id: logId,
    storyId: story.id,
    request: await sanitizeRequest(
      makeRequest(profile, activeLevel, topic, lengthPreference, seed, selectedRequests, knownWords, repairNotes, previousTitles, recentStories.map((story) => story.id)),
    ),
    model: settings.model,
    attempts,
    validation: finalValidation,
    fallbackUsed: false,
    error: null,
    createdAt: Date.now(),
  });
  return { story, logId, fallback: false };
}

function buildStory(
  contract: ContractStory,
  sentences: Story['sentences'],
  requestedLevel: number,
  topic: string,
  seed: number,
  provider: 'mock' | 'openai',
  model: string,
  attempts: number,
  isFallback: boolean,
  validation: ValidationSummary | null,
  selectedReviewWordIds: string[],
  activeLevel: number,
  repairNotes: string[],
): Story {
  const now = Date.now();
  const meta: GenerationMeta = {
    provider,
    model,
    attempts,
    fallbackUsed: isFallback,
    seed,
    requestLevel: activeLevel,
    reviewWordIds: selectedReviewWordIds,
    validation,
    generatedAt: now,
    repairNotes,
  };
  const tokenCount = sentences.reduce((total, sentence) => total + sentence.tokens.length, 0);
  return {
    id: storyIdFor(),
    createdAt: now,
    level: contract.level,
    levelAtGeneration: requestedLevel,
    topic,
    titleJa: contract.title_ja,
    titleEn: contract.title_en,
    text: contract.text,
    sentences,
    targetWords: contract.target_words.map((word) => ({
      dictionary: word.dictionary,
      reading: word.reading,
      gloss: word.gloss,
      occurrences: word.occurrences ?? 0,
    })),
    grammarPoints: contract.grammar_points,
    generationMeta: meta,
    isFallback,
    fallbackLabel: isFallback ? 'Offline story' : null,
    readState: 'unread',
    progress: 0,
    finishedAt: null,
    feedbackSubmitted: false,
    lookupCount: 0,
    translationReveals: 0,
    charCount: [...contract.text].length,
    tokenCount,
    selectedReviewWordIds,
  };
}

async function saveStoryWithUpdates(
  story: Story,
  selected: Word[],
  sentences: Story['sentences'],
): Promise<void> {
  const appeared = new Set<string>();
  for (const sentence of sentences) {
    for (const token of sentence.tokens) {
      for (const word of selected) {
        if (
          token.dictionary === word.dictionary &&
          (token.reading === word.reading || !word.reading)
        ) {
          appeared.add(word.id);
        }
      }
    }
  }
  await db.transaction('rw', [db.stories, db.words], async () => {
    await db.stories.put(story);
    for (const word of selected) {
      if (!appeared.has(word.id)) continue;
      await db.words.update(word.id, {
        firstStoryPending: false,
        updatedAt: Date.now(),
      });
    }
  });
}

export async function testProviderConnection(): Promise<string> {
  const settings = await getSettings();
  if (settings.provider === 'mock') return 'Offline mock provider is ready.';
  const provider = new OpenAiProvider({
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKey: getApiKey(),
  });
  return provider.testConnection();
}

export function suggestedTopic(profile: Profile, seed = Date.now()): string {
  return defaultTopic(profile, seed);
}

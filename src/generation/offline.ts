import type { FallbackStory } from '../content/fallbackStories';
import { lookupGloss } from '../content/glossary';
import { bandForLevel, clamp } from '../lib/level';
import { hashString, mulberry32 } from '../lib/random';
import { tokenizeSentences } from '../tokenizer/client';
import type { ContractSentence, ContractStory, ContractToken } from './contract';
import type { ReviewWordRequest } from './types';

export interface OfflineStoryOptions {
  level: number;
  topic: string;
  interests: string[];
  seed: number;
  recentStoryIds?: string[];
  reviewWords?: ReviewWordRequest[];
  withReviewWords?: boolean;
}

export interface OfflineStoryResult {
  contract: ContractStory;
  fallback: FallbackStory;
  usedReviewWords: ReviewWordRequest[];
}

const LEVEL_INDEX: Record<string, number> = { N5: 1, N4: 2, N3: 3, N2: 4, N1: 5 };

function chooseFallbackStory(options: OfflineStoryOptions, stories: FallbackStory[]): FallbackStory {
  const band = bandForLevel(clamp(options.level, 1, 5)).code;
  const targetLevel = LEVEL_INDEX[band];
  const candidates = stories.filter((story) => story.level === targetLevel);
  const recent = new Set(options.recentStoryIds ?? []);
  const fresh = candidates.filter((story) => !recent.has(story.id));
  const pool = fresh.length ? fresh : candidates;
  const topic = options.topic.toLowerCase();
  const matching = pool.filter(
    (story) =>
      story.topic === topic ||
      story.interests.some((interest) => interest === topic || options.interests.includes(interest)),
  );
  const finalPool = matching.length ? matching : pool;
  const random = mulberry32(options.seed ^ hashString(options.topic));
  return finalPool[Math.floor(random() * finalPool.length)] ?? candidates[0];
}

function reviewSentence(word: ReviewWordRequest): { text: string; translation: string } {
  const surface = word.dictionary;
  if (word.pos === 'verb') {
    return {
      text: `${surface}ことにしました。そして、また${surface}と思います。`,
      translation: `I decided to ${word.gloss}, and I think I will do it again.`,
    };
  }
  if (word.pos === 'i-adjective') {
    return {
      text: `${surface}と思いました。今日は${surface}日でした。`,
      translation: `I thought it was ${word.gloss}. Today was a ${word.gloss} day.`,
    };
  }
  if (word.pos === 'na-adjective') {
    return {
      text: `${surface}だと思いました。今日は${surface}な日でした。`,
      translation: `I thought it was ${word.gloss}. Today was a ${word.gloss} day.`,
    };
  }
  if (word.pos === 'adverb') {
    return {
      text: `${surface}しました。明日も${surface}したいです。`,
      translation: `I did it ${word.gloss}. I want to do it ${word.gloss} tomorrow too.`,
    };
  }
  if (word.pos === 'noun') {
    return {
      text: `${surface}が、今日の話です。${surface}について、もう少し知りたいです。`,
      translation: `${word.gloss} is today’s topic. I want to know a little more about ${word.gloss}.`,
    };
  }
  return {
    text: `${surface}と書きました。また${surface}と書きました。`,
    translation: `I wrote “${surface}.” I wrote “${surface}” again.`,
  };
}

function buildToken(
  raw: {
    surface: string;
    dictionary: string;
    reading: string;
    pos: string;
    start: number;
    end: number;
  },
  reviewWords: ReviewWordRequest[],
  fallbackJlpt: number,
): ContractToken {
  const tagged = reviewWords.find(
    (word) => word.dictionary === raw.dictionary || word.dictionary === raw.surface,
  );
  const entry = lookupGloss(raw.surface, raw.dictionary, raw.reading);
  return {
    surface: raw.surface,
    dictionary: raw.dictionary,
    reading: raw.reading,
    pos: raw.pos,
    gloss: tagged?.gloss || entry?.gloss || 'No gloss available',
    jlpt: fallbackJlpt,
    start: raw.start,
    end: raw.end,
  };
}

export async function buildOfflineStory(options: OfflineStoryOptions): Promise<OfflineStoryResult> {
  const { FALLBACK_STORIES } = await import('../content/fallbackStories');
  const fallback = chooseFallbackStory(options, FALLBACK_STORIES);
  const selected = (options.reviewWords ?? []).slice(0, 3);
  const useReview = Boolean(options.withReviewWords && selected.length);
  const baseSentences = fallback.sentences.map((sentence) => ({
    text: sentence.text,
    translation_en: sentence.translation_en,
  }));
  const reviewSentences = useReview
    ? [
        {
          text: '今日は、前のことを書きました。',
          translation_en: 'Today I wrote about previous things.',
        },
        ...selected.map((word) => {
          const sentence = reviewSentence(word);
          return { text: sentence.text, translation_en: sentence.translation };
        }),
      ]
    : [];
  const allSentences = [...reviewSentences, ...baseSentences];
  const raw = await tokenizeSentences(allSentences.map((sentence) => sentence.text));

  const sentences: ContractSentence[] = allSentences.map((sentence, index) => {
    const tokens = raw[index].tokens.map((token) =>
      buildToken(token, selected, 6 - (LEVEL_INDEX[bandForLevel(options.level).code] ?? 2)),
    );
    return {
      text: sentence.text,
      translation_en: sentence.translation_en,
      tokens,
      phrases: tokens.length
        ? [{ start: 0, end: tokens.length, gloss: sentence.translation_en }]
        : [],
    };
  });

  const text = allSentences.map((sentence) => sentence.text).join('');
  const tokenKeys = new Map<string, { gloss: string; occurrences: number }>();
  for (const sentence of sentences) {
    for (const token of sentence.tokens) {
      const key = `${token.dictionary}|${token.reading}`;
      const existing = tokenKeys.get(key);
      if (existing) existing.occurrences += 1;
      else tokenKeys.set(key, { gloss: token.gloss, occurrences: 1 });
    }
  }
  const targetWords = selected
    .map((word) => {
      const key = `${word.dictionary}|${word.reading}`;
      const found = tokenKeys.get(key);
      return found
        ? {
            dictionary: word.dictionary,
            reading: word.reading,
            gloss: word.gloss,
            occurrences: found.occurrences,
          }
        : null;
    })
    .filter((word): word is NonNullable<typeof word> => Boolean(word));

  const contract: ContractStory = {
    title_ja: useReview ? `${fallback.titleJa}（復習）` : fallback.titleJa,
    title_en: useReview ? `${fallback.titleEn} (Review)` : fallback.titleEn,
    level: options.level,
    summary_en: fallback.summaryEn,
    text,
    sentences,
    target_words: targetWords,
    grammar_points: fallback.grammarPoints,
    content_notes: [
      'Offline story. Personalization may be limited.',
      ...(useReview ? ['A short review prelude is included for tracked words.'] : []),
    ],
  };

  return {
    contract,
    fallback,
    usedReviewWords: targetWords
      .map((target) => selected.find((word) => word.dictionary === target.dictionary) ?? null)
      .filter((word): word is ReviewWordRequest => Boolean(word)),
  };
}

export async function streamText(
  text: string,
  onText: (chunk: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const chunks = text.match(/[\s\S]{1,64}/g) ?? [];
  for (const chunk of chunks) {
    if (signal.aborted) {
      const error = new Error('Generation cancelled.');
      error.name = 'AbortError';
      throw error;
    }
    onText(chunk);
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
}


import type { FallbackStory } from '../content/fallbackStories';
import { lookupGlossFor } from '../content/glossary';
import type { ZhFallbackStory } from '../content/zh/fallbackStories';
import { bandForLevel, clamp } from '../lib/level';
import { hashString, mulberry32 } from '../lib/random';
import { tokenizeSentences } from '../tokenizer/client';
import type { Language } from '../types';
import type { ContractSentence, ContractStory, ContractToken } from './contract';
import type { ReviewWordRequest } from './types';

export interface OfflineStoryOptions {
  language: Language;
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
  fallback: FallbackStory | ZhFallbackStory;
  usedReviewWords: ReviewWordRequest[];
}

type AnyFallbackStory = FallbackStory | ZhFallbackStory;

const LEVEL_INDEX: Record<string, number> = { N5: 1, N4: 2, N3: 3, N2: 4, N1: 5 };
const HSK_INDEX: Record<string, number> = { HSK1: 1, HSK2: 2, HSK3: 3, HSK4: 4, HSK5: 5, HSK6: 6 };

function levelIndexFor(level: number, language: Language): number {
  const code = bandForLevel(clamp(level, 1, 5), language).code;
  const table = language === 'zh' ? HSK_INDEX : LEVEL_INDEX;
  return table[code] ?? 1;
}

function storyTitle(story: AnyFallbackStory): string {
  return 'titleZh' in story ? story.titleZh : story.titleJa;
}

function chooseFallbackStory(
  options: OfflineStoryOptions,
  stories: AnyFallbackStory[],
): AnyFallbackStory {
  const targetLevel = levelIndexFor(options.level, options.language);
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
  return finalPool[Math.floor(random() * finalPool.length)] ?? candidates[0] ?? stories[0];
}

async function fallbackStoriesFor(language: Language): Promise<AnyFallbackStory[]> {
  if (language === 'zh') {
    const { ZH_FALLBACK_STORIES } = await import('../content/zh/fallbackStories');
    return ZH_FALLBACK_STORIES;
  }
  const { FALLBACK_STORIES } = await import('../content/fallbackStories');
  return FALLBACK_STORIES;
}

function reviewSentenceJapanese(word: ReviewWordRequest): { text: string; translation: string } {
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

function reviewSentenceChinese(word: ReviewWordRequest): { text: string; translation: string } {
  const surface = word.dictionary;
  if (word.pos === 'verb') {
    return {
      text: `我决定${surface}。以后我还想${surface}。`,
      translation: `I decided to ${word.gloss}, and I would like to ${word.gloss} again in the future.`,
    };
  }
  if (word.pos === 'adjective' || word.pos === 'i-adjective' || word.pos === 'na-adjective') {
    return {
      text: `我觉得很${surface}。今天是很${surface}的一天。`,
      translation: `I felt very ${word.gloss}. Today was a very ${word.gloss} day.`,
    };
  }
  if (word.pos === 'adverb') {
    return {
      text: `我${surface}完成了这件事。明天也想${surface}试一试。`,
      translation: `I completed this ${word.gloss}. Tomorrow I want to try it ${word.gloss} too.`,
    };
  }
  if (word.pos === 'noun') {
    return {
      text: `${surface}是今天的话题。我想更多地了解${surface}。`,
      translation: `${word.gloss} is today’s topic. I want to learn more about ${word.gloss}.`,
    };
  }
  return {
    text: `我写了“${surface}”。我又写了一次“${surface}”。`,
    translation: `I wrote “${surface}.” I wrote “${surface}” again.`,
  };
}

function reviewSentence(
  word: ReviewWordRequest,
  language: Language,
): { text: string; translation: string } {
  return language === 'zh' ? reviewSentenceChinese(word) : reviewSentenceJapanese(word);
}

function reviewPrelude(language: Language): { text: string; translation_en: string } {
  return language === 'zh'
    ? { text: '今天我们先复习几个词。', translation_en: 'Today we will review a few words first.' }
    : { text: '今日は、前のことを書きました。', translation_en: 'Today I wrote about previous things.' };
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
  language: Language,
): ContractToken {
  const tagged = reviewWords.find(
    (word) => word.dictionary === raw.dictionary || word.dictionary === raw.surface,
  );
  const entry = lookupGlossFor(language, raw.surface, raw.dictionary, raw.reading);
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
  const stories = await fallbackStoriesFor(options.language);
  const fallback = chooseFallbackStory(options, stories);
  const selected = (options.reviewWords ?? []).slice(0, 3);
  const useReview = Boolean(options.withReviewWords && selected.length);
  const baseSentences = fallback.sentences.map((sentence) => ({
    text: sentence.text,
    translation_en: sentence.translation_en,
  }));
  const reviewSentences = useReview
    ? [
        reviewPrelude(options.language),
        ...selected.map((word) => {
          const sentence = reviewSentence(word, options.language);
          return { text: sentence.text, translation_en: sentence.translation };
        }),
      ]
    : [];
  const allSentences = [...reviewSentences, ...baseSentences];
  const raw = await tokenizeSentences(
    allSentences.map((sentence) => sentence.text),
    options.language,
  );
  const fallbackTag =
    options.language === 'zh'
      ? fallback.level
      : 6 - (levelIndexFor(options.level, options.language) ?? 2);

  const sentences: ContractSentence[] = allSentences.map((sentence, index) => {
    const tokens = raw[index].tokens.map((token) =>
      buildToken(token, selected, fallbackTag, options.language),
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

  const baseTitle = storyTitle(fallback);
  const reviewSuffix = options.language === 'zh' ? '（复习）' : '（復習）';
  const contract: ContractStory = {
    title_ja: useReview ? `${baseTitle}${reviewSuffix}` : baseTitle,
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

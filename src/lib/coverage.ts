import { COMMON_KANA_WORDS, FUNCTION_POS, allowedKanji } from '../content/levelLists';
import { ZH_FUNCTION_WORDS, ZH_GLOSSARY } from '../content/zh/levelLists';
import { tokenHasKanji } from './alignment';
import { glossaryAllowedKanji, lookupGlossFor } from '../content/glossary';
import { levelTagToScore } from './level';
import type { Language, ReaderSentence, ReaderToken, Word } from '../types';

export interface CoverageReport {
  countedTokens: number;
  knownWeight: number;
  rawKnown: number;
  rawCoverage: number;
  adjustedCoverage: number;
  newWords: string[];
  kanjiTokens: number;
  outOfLevelKanjiTokens: number;
  kanjiOutOfLevelPct: number;
  missingFurigana: string[];
}

export function wordKey(dictionary: string, reading: string): string {
  return `${dictionary}::${reading}`;
}

export function tokenMatchesWord(token: ReaderToken, word: Word): boolean {
  if (token.dictionary === word.dictionary) {
    if (!word.reading || token.reading === word.reading) return true;
  }
  return word.surfaceForms.includes(token.surface);
}

export function tokenMatchesAnyWord(token: ReaderToken, words: Word[]): Word | undefined {
  return words.find((word) => tokenMatchesWord(token, word));
}

export function buildWordLookup(words: Word[]): Map<string, Word> {
  const map = new Map<string, Word>();
  for (const word of words) {
    map.set(wordKey(word.dictionary, word.reading), word);
    for (const surface of word.surfaceForms) {
      if (!map.has(`surface:${surface}`)) map.set(`surface:${surface}`, word);
    }
  }
  return map;
}

export function lookupTrackedWord(token: ReaderToken, lookup: Map<string, Word>): Word | undefined {
  return lookup.get(wordKey(token.dictionary, token.reading)) ?? lookup.get(`surface:${token.surface}`);
}

function chineseKnownChars(level: number): Set<string> {
  const chars = new Set<string>();
  const limit = level + 0.8;
  for (const [word, entry] of Object.entries(ZH_GLOSSARY)) {
    const score = levelTagToScore(entry.jlpt, 'zh');
    if (score !== null && score <= limit) {
      for (const char of word) chars.add(char);
    }
  }
  for (const word of ZH_FUNCTION_WORDS) {
    for (const char of word) chars.add(char);
  }
  return chars;
}

function glossaryKnown(
  token: ReaderToken,
  level: number,
  language: Language,
): { known: boolean; newWord: boolean } {
  const entry = lookupGlossFor(language, token.surface, token.dictionary, token.reading);
  if (entry) {
    const score = levelTagToScore(entry.jlpt ?? null, language);
    const tolerance = language === 'zh' ? 0.8 : 0.25;
    const known = score !== null && score <= level + tolerance;
    return { known, newWord: !known };
  }
  if (language === 'zh') {
    if (/\bname\b/i.test(token.gloss)) return { known: true, newWord: false };
    if (ZH_FUNCTION_WORDS.has(token.dictionary) || ZH_FUNCTION_WORDS.has(token.surface)) {
      return { known: true, newWord: false };
    }
  } else if (
    FUNCTION_POS.has(token.pos) ||
    COMMON_KANA_WORDS.has(token.dictionary) ||
    COMMON_KANA_WORDS.has(token.surface)
  ) {
    return { known: true, newWord: false };
  }
  return { known: false, newWord: token.pos !== 'symbol' };
}

export function analyzeCoverage(
  sentences: ReaderSentence[],
  level: number,
  words: Word[],
  exemptWordIds: string[] = [],
  language: Language = 'ja',
): CoverageReport {
  const lookup = buildWordLookup(words);
  const exempt = new Set(exemptWordIds);
  const allowed = language === 'ja' ? allowedKanji(level) : new Set<string>();
  if (language === 'ja') {
    for (const char of glossaryAllowedKanji(level)) allowed.add(char);
  }
  const zhChars = language === 'zh' ? chineseKnownChars(level) : null;
  const tagTolerance = language === 'zh' ? 0.8 : 0.25;

  let countedTokens = 0;
  let knownWeight = 0;
  let rawKnown = 0;
  let kanjiTokens = 0;
  let outOfLevelKanjiTokens = 0;
  const missingFurigana = new Set<string>();
  const knownForms = new Set<string>();
  const unknownForms = new Set<string>();

  for (const sentence of sentences) {
    for (const token of sentence.tokens) {
      if (token.pos === 'symbol' || !token.surface.trim()) continue;
      const tracked = lookupTrackedWord(token, lookup);
      if (tracked && exempt.has(tracked.id)) continue;
      if (tracked || token.properNoun) {
        knownForms.add(token.dictionary);
        continue;
      }
      const taggedScore = levelTagToScore(token.jlpt, language);
      if (taggedScore !== null && taggedScore <= level + tagTolerance) {
        knownForms.add(token.dictionary);
        continue;
      }
      const fallback = glossaryKnown(token, level, language);
      const compoundKnown =
        language === 'zh' &&
        zhChars !== null &&
        [...token.dictionary].length > 1 &&
        [...token.dictionary].every((char) => zhChars.has(char));
      if (fallback.known || compoundKnown) knownForms.add(token.dictionary);
    }
  }

  for (const sentence of sentences) {
    for (const token of sentence.tokens) {
      if (token.pos === 'symbol' || !token.surface.trim()) continue;
      const tracked = lookupTrackedWord(token, lookup);
      if (tracked && exempt.has(tracked.id)) continue;

      countedTokens += 1;
      if (tracked) {
        if (tracked.state === 'known') {
          knownWeight += 1;
          rawKnown += 1;
        } else if (tracked.state === 'learning') {
          knownWeight += 0.5;
          rawKnown += 1;
        }
      } else if (token.properNoun || knownForms.has(token.dictionary)) {
        knownWeight += 1;
        rawKnown += 1;
      } else {
        unknownForms.add(token.dictionary);
      }

      if (language === 'ja' && tokenHasKanji(token)) {
        kanjiTokens += 1;
        const tokenScore = levelTagToScore(token.jlpt, language);
        const tokenTagKnown = tokenScore !== null && tokenScore <= level + 0.25;
        const isOutOfLevel =
          !tokenTagKnown &&
          [...token.surface].some(
            (char) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3005]/u.test(char) && !allowed.has(char),
          );
        if (isOutOfLevel) {
          outOfLevelKanjiTokens += 1;
          const hasRuby = token.furigana.some((segment) => Boolean(segment.ruby));
          if (!hasRuby) missingFurigana.add(token.surface);
        }
      }
    }
  }

  const newWords = [...unknownForms].filter((form) => !knownForms.has(form));
  return {
    countedTokens,
    knownWeight,
    rawKnown,
    rawCoverage: countedTokens === 0 ? 1 : rawKnown / countedTokens,
    adjustedCoverage: countedTokens === 0 ? 1 : knownWeight / countedTokens,
    newWords: [...newWords],
    kanjiTokens,
    outOfLevelKanjiTokens,
    kanjiOutOfLevelPct: kanjiTokens === 0 ? 0 : outOfLevelKanjiTokens / kanjiTokens,
    missingFurigana: [...missingFurigana],
  };
}

export function countWordOccurrences(sentences: ReaderSentence[], words: Word[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const word of words) result[word.id] = 0;
  for (const sentence of sentences) {
    for (const token of sentence.tokens) {
      const tracked = tokenMatchesAnyWord(token, words);
      if (tracked) result[tracked.id] = (result[tracked.id] ?? 0) + 1;
    }
  }
  return result;
}

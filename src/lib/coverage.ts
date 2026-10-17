import { COMMON_KANA_WORDS, FUNCTION_POS, allowedKanji } from '../content/levelLists';
import { tokenHasKanji } from './alignment';
import { glossaryAllowedKanji, lookupGloss } from '../content/glossary';
import { jlptToScore } from './level';
import type { ReaderSentence, ReaderToken, Word } from '../types';

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

function glossaryKnown(token: ReaderToken, level: number): { known: boolean; newWord: boolean } {
  const entry = lookupGloss(token.surface, token.dictionary, token.reading);
  if (entry) {
    const score = jlptToScore(entry.jlpt ?? null);
    const known = score !== null && score <= level + 0.25;
    return { known, newWord: !known };
  }
  if (FUNCTION_POS.has(token.pos) || COMMON_KANA_WORDS.has(token.dictionary) || COMMON_KANA_WORDS.has(token.surface)) {
    return { known: true, newWord: false };
  }
  return { known: false, newWord: token.pos !== 'symbol' };
}

export function analyzeCoverage(
  sentences: ReaderSentence[],
  level: number,
  words: Word[],
  exemptWordIds: string[] = [],
): CoverageReport {
  const lookup = buildWordLookup(words);
  const exempt = new Set(exemptWordIds);
  const allowed = allowedKanji(level);
  for (const char of glossaryAllowedKanji(level)) allowed.add(char);

  let countedTokens = 0;
  let knownWeight = 0;
  let rawKnown = 0;
  let kanjiTokens = 0;
  let outOfLevelKanjiTokens = 0;
  const missingFurigana = new Set<string>();
  const newWords = new Set<string>();

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
      } else if (token.properNoun) {
        knownWeight += 1;
        rawKnown += 1;
      } else {
        const taggedScore = jlptToScore(token.jlpt);
        if (taggedScore !== null && taggedScore <= level + 0.25) {
          knownWeight += 1;
          rawKnown += 1;
        } else {
          const fallback = glossaryKnown(token, level);
          if (fallback.known) {
            knownWeight += 1;
            rawKnown += 1;
          } else if (fallback.newWord) {
            newWords.add(token.dictionary);
          }
        }
      }

      if (tokenHasKanji(token)) {
        kanjiTokens += 1;
        const tokenScore = jlptToScore(token.jlpt);
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

import type { ContractStory } from '../generation/contract';
import type { Language, ReaderSentence, ValidationSummary, Word } from '../types';
import { validateContractAlignment } from './alignment';
import { analyzeCoverage, countWordOccurrences } from './coverage';
import { lengthRange } from './level';
import { charCount, normalizeText } from './text';
import type { StoryLength } from '../types';

export interface ValidationOptions {
  requestedLevel: number;
  lengthPreference: StoryLength;
  newWordCap: number;
  trackedWords: Word[];
  selectedWords: Word[];
  exemptWordIds: string[];
  recentTexts: string[];
  language?: Language;
}

export function textSimilarity(left: string, right: string): number {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigrams = (text: string): Set<string> => {
    const set = new Set<string>();
    const chars = [...text];
    for (let index = 0; index < chars.length - 1; index += 1) {
      set.add(`${chars[index]}${chars[index + 1]}`);
    }
    return set;
  };
  const leftSet = bigrams(a);
  const rightSet = bigrams(b);
  let intersection = 0;
  for (const item of leftSet) if (rightSet.has(item)) intersection += 1;
  const union = leftSet.size + rightSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function validateStory(
  contract: ContractStory,
  sentences: ReaderSentence[],
  options: ValidationOptions,
): ValidationSummary {
  const errors: string[] = [];
  const warnings: string[] = [];
  const alignment = validateContractAlignment(contract);
  errors.push(...alignment.errors);

  const language = options.language ?? 'ja';
  const length = charCount(contract.text);
  const range = lengthRange(options.requestedLevel, options.lengthPreference, language);
  const softMin = Math.floor(range.min * 0.8);
  const softMax = Math.ceil(range.max * 1.2);
  const hardMin = Math.floor(range.min * 0.7);
  const hardMax = Math.ceil(range.max * 1.3);
  if (length < hardMin || length > hardMax) {
    errors.push(
      `Length is ${length} characters; expected ${hardMin}–${hardMax} for ${options.lengthPreference}.`,
    );
  } else if (length < softMin || length > softMax) {
    warnings.push(
      `Length ${length} is slightly outside the preferred ${softMin}–${softMax} character range.`,
    );
  }

  if (Math.abs(contract.level - options.requestedLevel) > 0.75) {
    errors.push(`Story level ${contract.level} does not match the requested level ${options.requestedLevel}.`);
  }

  const coverage = analyzeCoverage(
    sentences,
    options.requestedLevel,
    options.trackedWords,
    options.exemptWordIds,
    language,
  );
  const allWords = options.selectedWords;
  const chinese = language === 'zh';
  const coverageFloor = chinese ? 0.8 : 0.93;
  const coverageTarget = chinese ? 0.9 : 0.95;
  if (coverage.adjustedCoverage < coverageFloor) {
    errors.push(
      `Assumed-known coverage is ${(coverage.adjustedCoverage * 100).toFixed(1)}%; at least ${(coverageFloor * 100).toFixed(0)}% is required.`,
    );
  } else if (coverage.adjustedCoverage < coverageTarget) {
    warnings.push(
      `Assumed-known coverage is ${(coverage.adjustedCoverage * 100).toFixed(1)}%; below the ${(coverageTarget * 100).toFixed(0)}% target. Story accepted; feedback will adjust the next one.`,
    );
  }
  const newWordHardCap = chinese ? options.newWordCap + 12 : options.newWordCap;
  if (coverage.newWords.length > newWordHardCap) {
    errors.push(
      `There are ${coverage.newWords.length} new dictionary forms; the hard cap is ${newWordHardCap}.`,
    );
  } else if (coverage.newWords.length > options.newWordCap) {
    warnings.push(
      `There are ${coverage.newWords.length} new dictionary forms vs the ${options.newWordCap} target. Story accepted; feedback will adjust the next one.`,
    );
  }
  if (coverage.kanjiOutOfLevelPct > 0.02) {
    warnings.push(
      `${(coverage.kanjiOutOfLevelPct * 100).toFixed(1)}% of kanji tokens are outside the bundled level whitelist; furigana is shown.`,
    );
  }
  if (coverage.missingFurigana.length > 0) {
    errors.push(`Out-of-level kanji without furigana: ${coverage.missingFurigana.join('、')}.`);
  }

  const reviewOccurrences = countWordOccurrences(sentences, allWords);
  if (allWords.length > 0) {
    const missing = allWords.filter((word) => (reviewOccurrences[word.id] ?? 0) < 1);
    if (missing.length > 0) {
      warnings.push(
        `Skipped review words that did not fit naturally: ${missing.map((word) => word.dictionary).join('、')}. They remain due.`,
      );
    }
    const included = allWords.filter((word) => (reviewOccurrences[word.id] ?? 0) >= 1);
    const twice = included.filter((word) => (reviewOccurrences[word.id] ?? 0) >= 2).length;
    if (included.length > 0 && twice / included.length < 0.7) {
      warnings.push('Fewer than 70% of the included review words appeared twice.');
    }
  }

  if (/[A-Za-z]/.test(contract.text)) {
    errors.push('Japanese text contains Latin letters or romaji.');
  }
  if (/[<>]/.test(contract.text)) {
    errors.push('Story text contains HTML-like characters.');
  }

  for (const recent of options.recentTexts.slice(0, 20)) {
    if (textSimilarity(contract.text, recent) >= 0.82) {
      errors.push('Story is too similar to a recent story.');
      break;
    }
  }

  return {
    passed: errors.length === 0,
    rawCoverage: coverage.rawCoverage,
    adjustedCoverage: coverage.adjustedCoverage,
    newWordCount: coverage.newWords.length,
    newWords: coverage.newWords,
    kanjiOutOfLevelPct: coverage.kanjiOutOfLevelPct,
    length,
    reviewOccurrences,
    warnings,
    errors,
  };
}

export function repairInstruction(summary: ValidationSummary): string {
  return [
    'Rewrite the entire story as a single JSON object matching the contract.',
    'Fix every violation below; do not return a patch or commentary.',
    ...summary.errors.map((error) => `- ${error}`),
  ].join('\n');
}

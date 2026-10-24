import { baseNewWordCap, bandForLevel, clamp, clampLevel, levelSummary, lookupBaseline } from './level';
import type { Difficulty, Language, Profile, RecallResponse, StoryLength } from '../types';

export interface FeedbackSignals {
  comprehension: number | null;
  difficulty: Difficulty | null;
  interest: number | null;
  lookupCount: number;
  translationReveals: number;
  charCount: number;
  wordChecks: RecallResponse[];
}

export interface AdaptationResult {
  level: number;
  levelDelta: number;
  hardness: number;
  newWordCap: number;
  consecutiveHard: number;
  consecutiveEasy: number;
  storyLength: StoryLength;
  summary: string;
  lookupHardness: number;
  comprehensionHardness: number;
  difficultyHardness: number;
  quizHardness: number;
  consolidation: boolean;
  easyBoost: boolean;
}

function clampSignal(value: number): number {
  return clamp(value, -1, 1);
}

export function lookupHardness(
  signals: FeedbackSignals,
  level: number,
  language: Language = 'ja',
): number {
  const baseline = lookupBaseline(level, language);
  const weightedLookups = signals.lookupCount + signals.translationReveals * 0.5;
  const rate = signals.charCount > 0 ? (weightedLookups / signals.charCount) * 100 : 0;
  return clampSignal((rate - baseline) / baseline);
}

function shorten(length: StoryLength): StoryLength {
  if (length === 'long') return 'medium';
  if (length === 'medium') return 'short';
  return 'short';
}

function buildSummary(
  level: number,
  levelDelta: number,
  length: StoryLength,
  previousLength: StoryLength,
  newWordCap: number,
  consolidation: boolean,
  easyBoost: boolean,
  behaviorOnly: boolean,
  language: Language,
): string {
  const parts = [`Next story: ${levelSummary(level, language)}`];
  if (levelDelta <= -0.005) parts.push(`level down ${Math.abs(levelDelta).toFixed(2)}`);
  else if (levelDelta >= 0.005) parts.push(`level up ${levelDelta.toFixed(2)}`);
  else if (behaviorOnly) parts.push('level updated from reading behavior');
  else parts.push('level steady');
  if (length !== previousLength) parts.push('shorter next story');
  if (consolidation) parts.push('consolidation: no new words');
  else if (easyBoost) parts.push('more new words available');
  else if (newWordCap === 0) parts.push('no new words next time');
  return parts.join(' · ');
}

export function computeAdaptation(
  profile: Profile,
  signals: FeedbackSignals,
  skipped: boolean,
  language: Language = profile.language,
): AdaptationResult {
  const lHard = lookupHardness(signals, profile.level, language);
  let level = profile.level;
  let hardness = profile.hardness;
  let newWordCap = profile.newWordCap;
  let consecutiveHard = profile.consecutiveHard;
  let consecutiveEasy = profile.consecutiveEasy;
  let storyLength = profile.storyLength;
  let comprehensionHardness = 0;
  let difficultyHardness = 0;
  let quizHardness = 0;
  let consolidation = false;
  let easyBoost = false;

  const behaviorOnly = skipped || signals.comprehension === null || signals.difficulty === null;

  if (behaviorOnly) {
    const behaviorHardness = 0.5 * lHard;
    hardness = 0.6 * profile.hardness + 0.4 * behaviorHardness;
    const rawDelta = clamp(-0.15 * hardness, -0.25, 0.25);
    level = clampLevel(level + rawDelta);
    const levelDelta = level - profile.level;
    return {
      level,
      levelDelta,
      hardness,
      newWordCap,
      consecutiveHard,
      consecutiveEasy,
      storyLength,
      summary: buildSummary(
        level,
        levelDelta,
        storyLength,
        profile.storyLength,
        newWordCap,
        false,
        false,
        true,
        language,
      ),
      lookupHardness: lHard,
      comprehensionHardness,
      difficultyHardness,
      quizHardness,
      consolidation,
      easyBoost,
    };
  }

  const comprehension = signals.comprehension as number;
  const difficulty = signals.difficulty as Difficulty;
  const d = difficulty === 'too_easy' ? -1 : difficulty === 'too_hard' ? 1 : 0;
  const cHard = (3 - comprehension) / 2;
  const qHard =
    signals.wordChecks.length > 0
      ? clampSignal(
          (signals.wordChecks.filter((response) => response === 'didnt_know').length /
            signals.wordChecks.length -
            0.3) /
            0.7,
        )
      : 0;
  comprehensionHardness = cHard;
  difficultyHardness = d;
  quizHardness = qHard;

  const rawHardness = 0.45 * d + 0.3 * cHard + 0.15 * lHard + 0.1 * qHard;
  hardness = 0.6 * profile.hardness + 0.4 * rawHardness;

  const hardStory = d === 1 || comprehension <= 2;
  const easyStory = d === -1 && comprehension === 5;
  consecutiveHard = hardStory ? profile.consecutiveHard + 1 : 0;
  consecutiveEasy = easyStory ? profile.consecutiveEasy + 1 : 0;

  let rawDelta = -0.15 * hardness;
  if (consecutiveHard >= 2) {
    rawDelta -= 0.1;
    consolidation = true;
    newWordCap = 0;
    storyLength = shorten(profile.storyLength);
  }
  if (consecutiveEasy >= 2) {
    rawDelta += 0.1;
    easyBoost = true;
  }
  rawDelta = clamp(rawDelta, -0.25, 0.25);
  const previousLevel = profile.level;
  level = clampLevel(profile.level + rawDelta);
  const levelDelta = level - previousLevel;

  if (!consolidation) {
    const comprehensionAdjustment = comprehension >= 4 ? 1 : comprehension <= 2 ? -2 : 0;
    newWordCap = baseNewWordCap(level, language) + comprehensionAdjustment + (easyBoost ? 2 : 0);
    newWordCap = clamp(newWordCap, 0, 12);
  }

  return {
    level,
    levelDelta,
    hardness,
    newWordCap,
    consecutiveHard,
    consecutiveEasy,
    storyLength,
    summary: buildSummary(
      level,
      levelDelta,
      storyLength,
      profile.storyLength,
      newWordCap,
      consolidation,
      easyBoost,
      false,
      language,
    ),
    lookupHardness: lHard,
    comprehensionHardness,
    difficultyHardness,
    quizHardness,
    consolidation,
    easyBoost,
  };
}

export function nextLengthLabel(result: AdaptationResult, language: Language = 'ja'): string {
  const band = bandForLevel(result.level, language);
  return `${band.code} ${band.sub} · ${result.newWordCap} new-word cap`;
}

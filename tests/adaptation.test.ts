import { describe, expect, it } from 'vitest';
import { computeAdaptation, type FeedbackSignals } from '../src/lib/adaptation';
import type { Profile } from '../src/types';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile',
    language: 'ja',
    level: 2,
    levelLocked: false,
    furiganaMode: 'always',
    translationsDefault: false,
    interests: ['daily life'],
    storyLength: 'medium',
    onboarded: true,
    contentNoticeAcknowledged: true,
    hardness: 0,
    newWordCap: 5,
    consecutiveHard: 0,
    consecutiveEasy: 0,
    savedLevels: {
      ja: { level: 2, hardness: 0, newWordCap: 5, consecutiveHard: 0, consecutiveEasy: 0, furiganaMode: 'always' },
      zh: { level: 1, hardness: 0, newWordCap: 3, consecutiveHard: 0, consecutiveEasy: 0, furiganaMode: 'always' },
    },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function signals(overrides: Partial<FeedbackSignals> = {}): FeedbackSignals {
  return {
    comprehension: 3,
    difficulty: 'just_right',
    interest: 2,
    lookupCount: 0,
    translationReveals: 0,
    charCount: 400,
    wordChecks: [],
    ...overrides,
  };
}

describe('level adaptation', () => {
  it('moves the level down for a hard story and caps movement', () => {
    const result = computeAdaptation(profile(), signals({ comprehension: 1, difficulty: 'too_hard' }), false);
    expect(result.level).toBeLessThan(2);
    expect(result.level).toBeGreaterThanOrEqual(1.75);
    expect(result.levelDelta).toBeGreaterThanOrEqual(-0.25);
  });

  it('applies the two-consecutive-hard rule with consolidation and shorter stories', () => {
    const result = computeAdaptation(
      profile({ consecutiveHard: 1, storyLength: 'long' }),
      signals({ comprehension: 2, difficulty: 'too_hard' }),
      false,
    );
    expect(result.consecutiveHard).toBe(2);
    expect(result.newWordCap).toBe(0);
    expect(result.storyLength).toBe('medium');
    expect(result.consolidation).toBe(true);
    expect(result.summary).toContain('consolidation');
  });

  it('applies the two-consecutive-easy rule and raises the cap', () => {
    const result = computeAdaptation(
      profile({ consecutiveEasy: 1 }),
      signals({ comprehension: 5, difficulty: 'too_easy' }),
      false,
    );
    expect(result.consecutiveEasy).toBe(2);
    expect(result.level).toBeGreaterThan(2);
    expect(result.easyBoost).toBe(true);
    expect(result.newWordCap).toBeGreaterThan(5);
  });

  it('never moves more than 0.25 in one story', () => {
    const result = computeAdaptation(
      profile({ hardness: 4, consecutiveHard: 1, level: 4 }),
      signals({ comprehension: 1, difficulty: 'too_hard', lookupCount: 30 }),
      false,
    );
    expect(result.levelDelta).toBeGreaterThanOrEqual(-0.25);
    expect(result.levelDelta).toBeLessThanOrEqual(0.25);
  });

  it('uses only lookup behavior, at half weight, when feedback is skipped', () => {
    const result = computeAdaptation(
      profile({ hardness: 0 }),
      signals({ comprehension: null, difficulty: null, lookupCount: 20, charCount: 300 }),
      true,
    );
    expect(result.consecutiveHard).toBe(0);
    expect(result.consecutiveEasy).toBe(0);
    expect(result.levelDelta).toBeGreaterThanOrEqual(-0.25);
    expect(result.summary).toContain('reading behavior');
  });

  it('resets consecutive counters when a normal story follows', () => {
    const result = computeAdaptation(
      profile({ consecutiveHard: 1 }),
      signals({ comprehension: 4, difficulty: 'just_right' }),
      false,
    );
    expect(result.consecutiveHard).toBe(0);
  });
});

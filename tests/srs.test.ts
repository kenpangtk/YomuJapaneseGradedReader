import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../src/lib/date';
import {
  applyPassiveExposure,
  applyRecall,
  cooldownDays,
  inCooldown,
  injectionCount,
  selectReviewWords,
  STABILITY_LADDER,
} from '../src/lib/srs';
import type { Word } from '../src/types';

const now = new Date('2026-10-17T00:00:00Z').getTime();

function word(overrides: Partial<Word> = {}): Word {
  return {
    id: '公園::こうえん',
    language: 'ja',
    dictionary: '公園',
    reading: 'こうえん',
    surfaceForms: ['公園'],
    gloss: 'park',
    pos: 'noun',
    jlpt: 5,
    state: 'learning',
    aboveLevel: false,
    firstStoryPending: false,
    recognition: 0,
    successes: 0,
    lapses: 0,
    stabilityDays: 1,
    dueAt: now,
    lastSeenAt: null,
    exposures: 0,
    checks: [],
    sourceStoryId: null,
    sourceSentence: null,
    createdAt: now - DAY_MS,
    updatedAt: now - DAY_MS,
    ...overrides,
  };
}

describe('word scheduling', () => {
  it('applies Knew it, success ladder, and due date', () => {
    const next = applyRecall(word(), 'knew', 'story-1', now);
    expect(next.recognition).toBe(14);
    expect(next.successes).toBe(1);
    expect(next.stabilityDays).toBe(STABILITY_LADDER[1]);
    expect(next.dueAt).toBe(now + STABILITY_LADDER[1] * DAY_MS);
    expect(next.exposures).toBe(1);
    expect(next.checks).toHaveLength(1);
  });

  it('applies Sort of without changing stability', () => {
    const next = applyRecall(word({ recognition: 40, stabilityDays: 7 }), 'sort_of', 'story-1', now);
    expect(next.recognition).toBe(44);
    expect(next.stabilityDays).toBe(7);
    expect(next.dueAt).toBe(now + 3.5 * DAY_MS);
    expect(next.successes).toBe(0);
  });

  it('applies Did not know, resets successes, and schedules tomorrow', () => {
    const next = applyRecall(
      word({ recognition: 60, successes: 4, stabilityDays: 14 }),
      'didnt_know',
      'story-1',
      now,
    );
    expect(next.recognition).toBe(35);
    expect(next.successes).toBe(0);
    expect(next.lapses).toBe(1);
    expect(next.stabilityDays).toBe(1);
    expect(next.dueAt).toBe(now + DAY_MS);
  });

  it('applies passive exposure but caps it at 40', () => {
    const next = applyPassiveExposure(word({ recognition: 39 }), 'story-1', now);
    expect(next.recognition).toBe(40);
    expect(next.exposures).toBe(1);
    const capped = applyPassiveExposure(word({ recognition: 40 }), 'story-1', now);
    expect(capped.recognition).toBe(40);
  });

  it('graduates only after three recent Knew checks and recognition >= 85', () => {
    const ready = word({
      recognition: 85,
      successes: 2,
      checks: [
        { storyId: 'a', response: 'knew', at: now },
        { storyId: 'b', response: 'knew', at: now },
      ],
    });
    const graduated = applyRecall(ready, 'knew', 'c', now);
    expect(graduated.recognition).toBe(99);
    expect(graduated.successes).toBe(3);
    expect(graduated.state).toBe('known');
  });

  it('does not graduate when the last check is not Knew', () => {
    const ready = word({
      recognition: 90,
      successes: 3,
      checks: [
        { storyId: 'a', response: 'knew', at: now },
        { storyId: 'b', response: 'knew', at: now },
      ],
    });
    const next = applyRecall(ready, 'sort_of', 'c', now);
    expect(next.state).toBe('learning');
  });

  it('computes injection count and cooldowns from recognition', () => {
    expect(injectionCount(word({ recognition: 0 }))).toBe(4);
    expect(injectionCount(word({ recognition: 50 }))).toBe(2);
    expect(injectionCount(word({ recognition: 84 }))).toBe(1);
    expect(injectionCount(word({ recognition: 85 }))).toBe(1);
    expect(injectionCount(word({ state: 'known', recognition: 100 }))).toBe(0);
    expect(cooldownDays(10)).toBe(0);
    expect(cooldownDays(40)).toBe(3);
    expect(cooldownDays(70)).toBe(7);
    expect(cooldownDays(90)).toBe(Number.POSITIVE_INFINITY);
  });

  it('prioritizes first-story and due words when selecting reviews', () => {
    const pending = word({ id: 'pending', dictionary: '猫', reading: 'ねこ', firstStoryPending: true, dueAt: now + 10 * DAY_MS });
    const due = word({ id: 'due', dictionary: '犬', reading: 'いぬ', dueAt: now - DAY_MS, recognition: 20 });
    const cool = word({
      id: 'cool',
      dictionary: '鳥',
      reading: 'とり',
      recognition: 50,
      lastSeenAt: now - DAY_MS,
      dueAt: now - DAY_MS,
    });
    const selected = selectReviewWords([cool, due, pending], 2, 5, now);
    expect(selected.map((item) => item.id)).toEqual(['pending', 'due']);
    expect(inCooldown(cool, now)).toBe(true);
  });

  it('caps above-level introductions at three per story', () => {
    const advanced = Array.from({ length: 5 }, (_, index) =>
      word({
        id: `advanced-${index}`,
        dictionary: `語${index}`,
        reading: `ご${index}`,
        aboveLevel: true,
        firstStoryPending: true,
        dueAt: now,
      }),
    );
    const selected = selectReviewWords(advanced, 1, 12, now);
    expect(selected).toHaveLength(3);
  });
});

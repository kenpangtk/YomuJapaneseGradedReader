import { addDays, DAY_MS, tomorrow } from './date';
import { clamp } from './level';
import type { RecallResponse, Word } from '../types';

export const STABILITY_LADDER = [1, 3, 7, 14, 30, 60] as const;

export function recognitionFor(response: RecallResponse, current: number): number {
  if (response === 'knew') return clamp(current + 14, 0, 100);
  if (response === 'sort_of') return clamp(current + 4, 0, 100);
  return clamp(current - 25, 0, 100);
}

export function applyRecall(
  word: Word,
  response: RecallResponse,
  storyId: string,
  now = Date.now(),
): Word {
  const checks = [
    ...word.checks,
    { storyId, response, at: now },
  ].slice(-30);
  const recognition = recognitionFor(response, word.recognition);
  let successes = word.successes;
  let lapses = word.lapses;
  let stabilityDays = word.stabilityDays;
  let dueAt = word.dueAt;

  if (response === 'knew') {
    successes += 1;
    stabilityDays = STABILITY_LADDER[Math.min(successes, STABILITY_LADDER.length - 1)];
    dueAt = addDays(now, stabilityDays);
  } else if (response === 'sort_of') {
    dueAt = addDays(now, Math.max(1, stabilityDays / 2));
  } else {
    successes = 0;
    lapses += 1;
    stabilityDays = 1;
    dueAt = tomorrow(now);
  }

  const lastThree = checks.slice(-3);
  const graduated =
    recognition >= 85 &&
    successes >= 3 &&
    lastThree.length === 3 &&
    lastThree.every((check) => check.response === 'knew');

  return {
    ...word,
    recognition,
    successes,
    lapses,
    stabilityDays,
    dueAt,
    lastSeenAt: now,
    exposures: word.exposures + 1,
    checks,
    state: graduated ? 'known' : word.state === 'suspended' ? 'suspended' : 'learning',
    firstStoryPending: false,
    updatedAt: now,
  };
}

export function applyPassiveExposure(word: Word, storyId: string, now = Date.now()): Word {
  const eligible = word.state === 'learning';
  return {
    ...word,
    recognition: eligible ? Math.min(40, word.recognition + 1) : word.recognition,
    exposures: word.exposures + 1,
    lastSeenAt: now,
    firstStoryPending: false,
    updatedAt: now,
    checks: word.checks,
    sourceStoryId: word.sourceStoryId ?? storyId,
  };
}

export function injectionCount(word: Word): number {
  if (word.state !== 'learning') return 0;
  return clamp(Math.round(4 * (1 - word.recognition / 100)), 0, 4);
}

export function cooldownDays(recognition: number): number {
  if (recognition < 40) return 0;
  if (recognition < 70) return 3;
  if (recognition < 85) return 7;
  return Number.POSITIVE_INFINITY;
}

export function daysSinceSeen(word: Word, now = Date.now()): number {
  if (!word.lastSeenAt) return Number.POSITIVE_INFINITY;
  return (now - word.lastSeenAt) / DAY_MS;
}

export function inCooldown(word: Word, now = Date.now()): boolean {
  if (word.firstStoryPending) return false;
  const cooldown = cooldownDays(word.recognition);
  return daysSinceSeen(word, now) < cooldown;
}

export function selectReviewWords(
  words: Word[],
  _level: number,
  budget: number,
  now = Date.now(),
): Word[] {
  if (budget <= 0) return [];
  const candidates = words.filter(
    (word) => word.state === 'learning' && !inCooldown(word, now),
  );
  const sorted = [...candidates].sort((left, right) => {
    if (left.firstStoryPending !== right.firstStoryPending) return left.firstStoryPending ? -1 : 1;
    const leftDue = left.dueAt <= now;
    const rightDue = right.dueAt <= now;
    if (leftDue !== rightDue) return leftDue ? -1 : 1;
    if (left.recognition !== right.recognition) return left.recognition - right.recognition;
    return left.dueAt - right.dueAt;
  });

  const selected: Word[] = [];
  let advancedIntroductions = 0;
  for (const word of sorted) {
    if (word.aboveLevel && word.firstStoryPending) {
      if (advancedIntroductions >= 3) continue;
      advancedIntroductions += 1;
    }
    selected.push(word);
    if (selected.length >= budget) break;
  }
  return selected;
}

export function reviewBudgetForLength(chars: number): number {
  return Math.min(12, Math.max(1, Math.round(chars / 40)));
}

export function scheduleLabel(word: Word, now = Date.now()): string {
  if (word.state === 'known') return 'graduated';
  if (word.state === 'suspended') return 'suspended';
  const days = Math.ceil((word.dueAt - now) / DAY_MS);
  if (days <= 0) return 'due now';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

import type { AppContext } from '../app';
import { getStats } from '../db';
import { bandForLevel, levelSummary } from '../lib/level';
import { el } from '../ui/dom';

export async function renderStats(root: HTMLElement, context: AppContext): Promise<void> {
  const language = context.profile.language;
  const stats = await getStats(language);
  const band = bandForLevel(context.profile.level, language);
  const trend = stats.levelTrend.slice(-24);
  const maxLevel = 5;
  const barHeights = trend.map((point) => Math.max(4, (point.level / maxLevel) * 100));

  root.append(
    el('div', { className: 'page-head' }, [
      el('div', {}, [
        el('div', { className: 'eyebrow', text: 'Progress' }),
        el('h1', { text: 'Reading stats' }),
        el('p', { text: 'A quiet record of what you have read and what is returning next. No streaks, no leaderboards.' }),
      ]),
      el('a', { className: 'btn btn-secondary', href: '#/settings', text: 'Export data' }),
    ]),
    el('div', { className: 'grid grid-4', style: { marginBottom: '1.2rem' } }, [
      el('div', { className: 'stat-card' }, [
        el('strong', { text: String(stats.storiesFinished) }),
        el('span', { text: 'stories finished' }),
      ]),
      el('div', { className: 'stat-card' }, [
        el('strong', { text: stats.medianComprehension ? `${stats.medianComprehension}/5` : '—' }),
        el('span', { text: 'median comprehension' }),
      ]),
      el('div', { className: 'stat-card' }, [
        el('strong', { text: String(stats.wordsLearning) }),
        el('span', { text: 'words learning' }),
      ]),
      el('div', { className: 'stat-card' }, [
        el('strong', { text: String(stats.wordsKnown) }),
        el('span', { text: 'words known' }),
      ]),
    ]),
    el('div', { className: 'grid grid-2' }, [
      el('div', { className: 'card' }, [
        el('div', { className: 'row-between' }, [
          el('h2', { text: 'Level trend' }),
          el('span', { className: 'badge badge-moss', text: levelSummary(context.profile.level, language) }),
        ]),
        el('p', { className: 'small muted', text: 'Each bar is the level after a finished story. Feedback moves the score in small steps.' }),
        el('div', { className: 'sparkline', role: 'img', 'aria-label': 'Level trend over recent finished stories' },
          barHeights.map((height, index) =>
            el('span', {
              style: { height: `${height}%` },
              title: `Story ${index + 1}: ${trend[index]?.level.toFixed(2)}`,
            }),
          ),
        ),
        el('div', { className: 'row-between tiny faint', style: { marginTop: '0.5rem' } }, [
          el('span', { text: trend.length ? `oldest · ${trend[0].level.toFixed(2)}` : 'no data' }),
          el('span', { text: trend.length ? `latest · ${trend[trend.length - 1].level.toFixed(2)}` : '' }),
        ]),
      ]),
      el('div', { className: 'card' }, [
        el('h2', { text: 'Vocabulary' }),
        el('p', { className: 'small muted', text: 'Words fade out of deliberate injection as recognition strengthens.' }),
        ...[
          { label: 'Learning', value: stats.wordsLearning, color: 'var(--gold)' },
          { label: 'Known', value: stats.wordsKnown, color: 'var(--moss)' },
          { label: 'Suspended', value: stats.wordsSuspended, color: 'var(--ink-faint)' },
        ].map((item) =>
          el('div', { style: { marginTop: '0.9rem' } }, [
            el('div', { className: 'row-between small' }, [
              el('span', { text: item.label }),
              el('strong', { text: String(item.value) }),
            ]),
            el('div', { className: 'progress-track', style: { marginTop: '0.3rem' } }, [
              el('span', {
                style: {
                  width: `${Math.min(100, (item.value / Math.max(1, stats.wordsLearning + stats.wordsKnown + stats.wordsSuspended)) * 100)}%`,
                  background: item.color,
                },
              }),
            ]),
          ]),
        ),
        el('div', { className: 'notice', style: { marginTop: '1.1rem' } }, [
          el('span', { text: `${stats.dueWords} learning ${stats.dueWords === 1 ? 'word is' : 'words are'} due now. ${band.code} target: ${band.charMin}–${band.charMax} character stories.` }),
        ]),
      ]),
    ]),
    el('div', { className: 'card card-soft', style: { marginTop: '1.2rem' } }, [
      el('div', { className: 'row-between' }, [
        el('div', {}, [
          el('h2', { text: 'Reading volume' }),
          el('p', { className: 'muted small', style: { marginBottom: 0 }, text: `${stats.characterCount.toLocaleString()} characters across ${stats.storiesFinished} finished ${stats.storiesFinished === 1 ? 'story' : 'stories'}.` }),
        ]),
        el('a', { className: 'btn btn-secondary', href: '#/history', text: 'Story history' }),
      ]),
    ]),
  );
}

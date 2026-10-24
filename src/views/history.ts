import type { AppContext } from '../app';
import { listFeedback, listStories } from '../db';
import { formatDate } from '../lib/date';
import { levelSummary } from '../lib/level';
import { el } from '../ui/dom';

export async function renderHistory(root: HTMLElement, context: AppContext): Promise<void> {
  const language = context.profile.language;
  const [stories, feedback] = await Promise.all([listStories(undefined, language), listFeedback()]);
  const feedbackByStory = new Map(feedback.map((item) => [item.storyId, item]));

  const rows = stories.map((story) => {
    const rated = feedbackByStory.get(story.id);
    const rating = rated && !rated.skipped ? rated.comprehension : null;
    return el('div', { className: 'story-row' }, [
      el('div', {}, [
        el('a', { className: 'story-row-title', href: `#/reader/${story.id}`, text: story.titleJa }),
        el('div', { className: 'story-row-meta' }, [
          el('span', { text: formatDate(story.createdAt) }),
          el('span', { text: levelSummary(story.level, story.language) }),
          el('span', { text: story.topic }),
          el('span', { text: `${story.tokenCount} tokens` }),
          story.isFallback ? el('span', { className: 'badge badge-gold', text: 'Offline' }) : null,
        ]),
        el('div', { className: 'small muted', style: { marginTop: '0.25rem' }, text: story.titleEn }),
      ]),
      el('div', { className: 'story-row-side' }, [
        story.readState === 'finished'
          ? el('span', { className: 'badge badge-moss', text: 'Finished' })
          : story.progress > 0
            ? el('span', { className: 'badge badge-accent', text: `${Math.round(story.progress * 100)}%` })
            : el('span', { className: 'badge', text: 'Unread' }),
        rating
          ? el('span', { className: 'small', title: `Comprehension ${rating}/5`, text: `${'●'.repeat(rating)}${'○'.repeat(5 - rating)}` })
          : el('span', { className: 'faint small', text: rated?.skipped ? 'Unrated' : 'No feedback' }),
        el('a', { className: 'btn btn-quiet', href: `#/reader/${story.id}`, text: 'Read' }),
        story.readState === 'finished'
          ? el('a', { className: 'btn btn-quiet', href: `#/feedback/${story.id}`, text: rated ? 'Feedback' : 'Rate' })
          : null,
      ]),
    ]);
  });

  root.append(
    el('div', { className: 'page-head' }, [
      el('div', {}, [
        el('div', { className: 'eyebrow', text: 'Library' }),
        el('h1', { text: 'Story history' }),
        el('p', { text: 'Every story is saved with its token data. Reread without generating or spending provider tokens.' }),
      ]),
      el('a', { className: 'btn btn-primary', href: '#/home', text: 'Read next' }),
    ]),
    stories.length
      ? el('div', { className: 'story-list' }, rows)
      : el('div', { className: 'empty-state' }, [
          el('div', { className: 'empty-state-mark', 'aria-hidden': 'true', text: language === 'zh' ? '书' : '本' }),
          el('h2', { text: 'No stories yet.' }),
          el('p', { text: 'Your completed and in-progress stories will appear here, with their ratings and tokenized text intact.' }),
          el('a', { className: 'btn btn-primary', href: '#/home', text: 'Generate a story' }),
        ]),
    ...(stories.length
      ? [
          el('div', { className: 'notice', style: { marginTop: '1.5rem' } }, [
            el('span', { text: 'History is local to this browser. Use Settings → Export to keep a portable copy.' }),
          ]),
        ]
      : []),
  );
}

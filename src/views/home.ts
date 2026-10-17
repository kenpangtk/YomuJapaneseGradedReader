import type { AppContext } from '../app';
import { getStats, listStories, listWords } from '../db';
import { bandForLevel, lengthRange, levelSummary } from '../lib/level';
import { formatDate } from '../lib/date';
import type { Story, StoryLength } from '../types';
import { STORY_LENGTH_LABELS } from '../types';
import { getTokenizerStatus, subscribeTokenizerStatus, warmupTokenizer } from '../tokenizer/client';
import { button, el } from '../ui/dom';
import { runGeneration } from '../ui/generation';

const LENGTHS: StoryLength[] = ['short', 'medium', 'long'];

function recentStoryRow(story: Story): HTMLElement {
  return el('a', { className: 'story-row', href: `#/reader/${story.id}` }, [
    el('div', {}, [
      el('div', { className: 'story-row-title', text: story.titleJa }),
      el('div', { className: 'story-row-meta' }, [
        el('span', { text: formatDate(story.createdAt) }),
        el('span', { text: `Level ${story.level.toFixed(2)}` }),
        el('span', { text: story.topic }),
        el('span', { text: `${story.charCount} chars` }),
        story.isFallback ? el('span', { className: 'badge badge-gold', text: 'Offline' }) : null,
      ]),
    ]),
    el('div', { className: 'story-row-side' }, [
      story.readState === 'finished'
        ? el('span', { className: 'badge badge-moss', text: 'Finished' })
        : story.progress > 0
          ? el('span', { className: 'badge badge-accent', text: `${Math.round(story.progress * 100)}%` })
          : el('span', { className: 'badge', text: 'New' }),
      el('span', { 'aria-hidden': 'true', text: '→' }),
    ]),
  ]);
}

export async function renderHome(root: HTMLElement, context: AppContext): Promise<void> {
  const [stats, stories, words] = await Promise.all([
    getStats(),
    listStories(4),
    listWords(),
  ]);
  const profile = context.profile;
  const band = bandForLevel(profile.level);
  const range = lengthRange(profile.level, profile.storyLength);
  let topic = 'surprise';
  let length: StoryLength = profile.storyLength;
  const dueWords = words.filter((word) => word.state === 'learning' && word.dueAt <= Date.now());
  const learningWords = words.filter((word) => word.state === 'learning');

  const topicChoices = ['surprise', ...profile.interests];
  const topicStrip = el('div', { className: 'topic-strip', role: 'group', 'aria-label': 'Story topic' });
  const renderTopics = () => {
    topicStrip.replaceChildren(
      ...topicChoices.map((choice) =>
        el('button', {
          type: 'button',
          className: 'topic-chip',
          'aria-pressed': topic === choice,
          text: choice === 'surprise' ? 'Surprise me' : choice,
          on: {
            click: () => {
              topic = choice;
              renderTopics();
            },
          },
        }),
      ),
    );
  };
  renderTopics();

  const lengthSelect = el('select', {
    className: 'select',
    'aria-label': 'Story length',
    style: { width: 'auto', minWidth: '170px' },
    on: {
      change: (event) => {
        length = (event.target as HTMLSelectElement).value as StoryLength;
      },
    },
  }, LENGTHS.map((choice) => el('option', { value: choice, selected: choice === length }, STORY_LENGTH_LABELS[choice])));

  const generate = () => {
    runGeneration(context, { topic: topic === 'surprise' ? undefined : topic, length });
  };
  const primary = button('Read next', { variant: 'primary', onClick: generate });

  const tokenizerNotice = el('div', { hidden: true });
  const updateTokenizerStatus = () => {
    const status = getTokenizerStatus();
    if (status.status === 'ready' || status.status === 'idle') {
      tokenizerNotice.hidden = true;
      return;
    }
    tokenizerNotice.hidden = false;
    tokenizerNotice.className = status.status === 'error' ? 'notice notice-error' : 'notice';
    tokenizerNotice.replaceChildren(
      status.status === 'error'
        ? el('span', { text: `Tokenizer could not load: ${status.message ?? 'unknown error'}. Check the README and reload.` })
        : el('span', { text: 'Loading the Japanese tokenizer in the background. Browsing stays available.' }),
    );
  };
  const unsubscribe = subscribeTokenizerStatus(updateTokenizerStatus);
  context.setCleanup(unsubscribe);
  warmupTokenizer().catch(() => updateTokenizerStatus());

  const levelProgress = ((profile.level - 1) / 4) * 100;

  const page = el('div', { className: 'stack' }, [
    tokenizerNotice,
    el('div', { className: 'hero' }, [
      el('section', { className: 'hero-main', 'aria-labelledby': 'home-title' }, [
        el('div', { className: 'eyebrow', text: `${band.code} · ${band.sub} · ${profile.storyLength} stories` }),
        el('h1', { id: 'home-title', text: 'Read something just beyond easy.' }),
        el('p', { className: 'hero-lead', text: 'A short, original Japanese story with furigana, instant glosses, and words that come back when they matter.' }),
        el('div', { className: 'hero-actions' }, [
          primary,
          el('a', { className: 'btn btn-secondary', href: '#/words', text: `${learningWords.length} learning words` }),
        ]),
        el('div', { style: { marginTop: '1.7rem' } }, [
          el('div', { className: 'field-label', text: 'Topic' }),
          topicStrip,
          el('div', { className: 'row', style: { marginTop: '0.8rem' } }, [
            el('span', { className: 'field-label', text: 'Length' }),
            lengthSelect,
            el('span', { className: 'hint', text: `~${range.min}–${range.max} characters` }),
          ]),
        ]),
      ]),
      el('aside', { className: 'hero-side' }, [
        el('section', { className: 'level-card', 'aria-label': 'Current reading level' }, [
          el('div', { className: 'eyebrow', text: 'Current level' }),
          el('h2', { text: levelSummary(profile.level) }),
          el('p', { text: `Continuous score ${profile.level.toFixed(2)} · new-word cap ${profile.newWordCap}. Feedback nudges this score after every story.` }),
          el('div', { className: 'level-meter', role: 'img', 'aria-label': `Level ${profile.level.toFixed(2)} out of 5` }, [
            el('span', { style: { width: `${levelProgress}%` } }),
          ]),
          el('div', { className: 'level-meta' }, [
            el('span', { text: 'N5' }),
            el('span', { text: 'N1' }),
          ]),
        ]),
        el('div', { className: 'mini-stats' }, [
          el('div', { className: 'mini-stat' }, [
            el('strong', { text: String(stats.storiesFinished) }),
            el('span', { text: 'stories finished' }),
          ]),
          el('div', { className: 'mini-stat' }, [
            el('strong', { text: String(dueWords.length) }),
            el('span', { text: 'words due' }),
          ]),
          el('div', { className: 'mini-stat' }, [
            el('strong', { text: stats.medianComprehension ? `${stats.medianComprehension}/5` : '—' }),
            el('span', { text: 'median comprehension' }),
          ]),
          el('div', { className: 'mini-stat' }, [
            el('strong', { text: String(stats.wordsKnown) }),
            el('span', { text: 'words graduated' }),
          ]),
        ]),
      ]),
    ]),
    el('div', { className: 'row-between' }, [
      el('div', {}, [
        el('div', { className: 'section-head', style: { margin: '0.3rem 0 0.2rem' } }, [
          el('h2', { text: 'Recent reading' }),
          stories.length ? el('a', { className: 'small', href: '#/history', text: 'All stories →' }) : null,
        ]),
        el('p', { className: 'small muted', text: dueWords.length ? `${dueWords.length} tracked words are ready to return. Newly added words are prioritized next.` : 'New stories recycle due words automatically.' }),
      ]),
      context.settings.provider === 'mock'
        ? el('span', { className: 'badge badge-gold', text: 'Offline mock provider' })
        : el('span', { className: 'badge badge-moss', text: `${context.settings.model} · BYOK` }),
    ]),
    stories.length
      ? el('div', { className: 'story-list' }, stories.map(recentStoryRow))
      : el('div', { className: 'empty-state' }, [
          el('div', { className: 'empty-state-mark', 'aria-hidden': 'true', text: '読' }),
          el('h2', { text: 'Your library is waiting.' }),
          el('p', { text: 'Generate your first story. It will be saved locally with cached token data for instant rereading.' }),
          primary,
        ]),
    dueWords.length
      ? el('div', { className: 'card card-soft' }, [
          el('div', { className: 'row-between' }, [
            el('h2', { text: 'Coming back next' }),
            el('a', { className: 'small', href: '#/words', text: 'Word list →' }),
          ]),
          el('div', { className: 'chip-row' }, dueWords.slice(0, 8).map((word) =>
            el('span', { className: 'badge badge-accent', text: `${word.dictionary} · ${word.reading}` }),
          )),
        ])
      : null,
    el('div', { className: 'card card-soft' }, [
      el('div', { className: 'row-between' }, [
        el('div', {}, [
          el('h2', { text: 'Read, reflect, adapt.' }),
          el('p', { className: 'muted small', style: { marginBottom: 0 }, text: 'Finish a story to rate comprehension and check the words that actually appeared. The next story uses that feedback.' }),
        ]),
        el('a', { className: 'btn btn-secondary', href: '#/stats', text: 'See reading stats' }),
      ]),
    ]),
  ]);

  root.append(page);
}

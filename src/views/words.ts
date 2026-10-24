import type { AppContext } from '../app';
import {
  deleteWord,
  listWords,
  markWordKnown,
  needsReview,
  resumeWord,
  suspendWord,
} from '../db';
import { formatDate } from '../lib/date';
import { levelSystemLabel, readingFieldLabel } from '../lib/languageDefaults';
import { scheduleLabel } from '../lib/srs';
import type { Language, Word, WordState } from '../types';
import { button, el } from '../ui/dom';
import { showToast } from '../ui/toast';

type Filter = 'all' | WordState;
type Sort = 'recent' | 'weakest' | 'seen' | 'due';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'learning', label: 'Learning' },
  { id: 'known', label: 'Known' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'all', label: 'All' },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: 'recent', label: 'Recently added' },
  { id: 'weakest', label: 'Weakest recognition' },
  { id: 'seen', label: 'Most seen' },
  { id: 'due', label: 'Due soonest' },
];

function stateBadge(word: Word): HTMLElement {
  if (word.state === 'known') return el('span', { className: 'badge badge-moss', text: 'Known' });
  if (word.state === 'suspended') return el('span', { className: 'badge', text: 'Suspended' });
  return el('span', { className: 'badge badge-gold', text: 'Learning' });
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(words: Word[], language: Language): void {
  const header = ['word', readingFieldLabel(language).toLowerCase(), 'gloss', 'state', 'recognition', 'exposures', 'last seen', 'due date'];
  const rows = words.map((word) => [
    word.dictionary,
    word.reading,
    word.gloss,
    word.state,
    word.recognition,
    word.exposures,
    word.lastSeenAt ? new Date(word.lastSeenAt).toISOString() : '',
    new Date(word.dueAt).toISOString(),
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `yomu-words-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function renderWords(root: HTMLElement, context: AppContext): Promise<void> {
  const language = context.profile.language;
  const readingLabel = readingFieldLabel(language);
  let words = await listWords(language);
  let filter: Filter = 'learning';
  let sort: Sort = 'recent';
  let search = '';

  const page = el('div', { className: 'stack' }, [
    el('div', { className: 'page-head' }, [
      el('div', {}, [
        el('div', { className: 'eyebrow', text: 'Vocabulary' }),
        el('h1', { text: 'Your words' }),
        el('p', { text: `Words you add at ${context.profile.level.toFixed(2)} return inside later stories. No separate flashcard queue.` }),
      ]),
      el('div', { className: 'row' }, [
        button('Export CSV', {
          variant: 'secondary',
          onClick: () => {
            downloadCsv(words, language);
            showToast('CSV downloaded.');
          },
        }),
        el('a', { className: 'btn btn-primary', href: '#/home', text: 'Read a story' }),
      ]),
    ]),
    el('div', { className: 'toolbar' }, [
      el('input', {
        className: 'input',
        type: 'search',
        placeholder: `Search word, ${readingLabel.toLowerCase()}, or gloss`,
        'aria-label': 'Search words',
        on: {
          input: (event) => {
            search = (event.target as HTMLInputElement).value.trim().toLowerCase();
            renderRows();
          },
        },
      }),
      el('div', { className: 'segmented', role: 'group', 'aria-label': 'Filter words' },
        FILTERS.map((item) =>
          el('button', {
            type: 'button',
            'aria-pressed': filter === item.id,
            text: item.label,
            on: {
              click: () => {
                filter = item.id;
                renderFilterState();
                renderRows();
              },
            },
          }),
        ),
      ),
      el('select', {
        className: 'select',
        'aria-label': 'Sort words',
        style: { width: 'auto' },
        on: {
          change: (event) => {
            sort = (event.target as HTMLSelectElement).value as Sort;
            renderRows();
          },
        },
      }, SORTS.map((item) => el('option', { value: item.id }, item.label))),
    ]),
    el('div', { className: 'small muted', id: 'word-count' }),
    el('div', { className: 'word-table' }, [
      el('div', { className: 'word-table-head', 'aria-hidden': 'true' }, [
        el('span', { text: 'Word' }),
        el('span', { text: `${readingLabel} / gloss` }),
        el('span', { text: levelSystemLabel(language) }),
        el('span', { text: 'Recognition' }),
        el('span', { text: 'Seen / due' }),
        el('span', { text: '' }),
      ]),
      el('div', { id: 'word-rows' }),
    ]),
  ]);
  root.append(page);
  const rowsHost = page.querySelector<HTMLElement>('#word-rows');
  const countHost = page.querySelector<HTMLElement>('#word-count');
  const filterButtons = page.querySelectorAll<HTMLButtonElement>('.segmented button');

  function renderFilterState(): void {
    filterButtons.forEach((buttonNode, index) => {
      buttonNode.setAttribute('aria-pressed', String(FILTERS[index]?.id === filter));
    });
  }

  function filtered(): Word[] {
    const list = words.filter((word) => {
      if (filter !== 'all' && word.state !== filter) return false;
      if (!search) return true;
      return (
        word.dictionary.toLowerCase().includes(search) ||
        word.reading.toLowerCase().includes(search) ||
        word.gloss.toLowerCase().includes(search)
      );
    });
    return list.sort((left, right) => {
      if (sort === 'weakest') return left.recognition - right.recognition || left.dueAt - right.dueAt;
      if (sort === 'seen') return right.exposures - left.exposures;
      if (sort === 'due') return left.dueAt - right.dueAt;
      return right.createdAt - left.createdAt;
    });
  }

  async function reload(): Promise<void> {
    words = await listWords(language);
    renderRows();
  }

  function rowFor(word: Word): HTMLElement {
    const actions = el('div', { className: 'word-actions' }, [
      word.state === 'learning'
        ? el('details', { className: 'details-menu' }, [
            el('summary', { text: 'Actions' }),
            el('div', { className: 'details-menu-panel' }, [
              el('button', {
                type: 'button',
                className: 'menu-button',
                text: 'Mark known',
                on: {
                  click: async () => {
                    if (!window.confirm(`Mark ${word.dictionary} as known? It will stop being injected and quizzed.`)) return;
                    await markWordKnown(word.id);
                    await reload();
                    showToast(`${word.dictionary} marked known.`);
                  },
                },
              }),
              el('button', {
                type: 'button',
                className: 'menu-button',
                text: 'Suspend',
                on: {
                  click: async () => {
                    await suspendWord(word.id);
                    await reload();
                    showToast(`${word.dictionary} suspended.`);
                  },
                },
              }),
              el('button', {
                type: 'button',
                className: 'menu-button menu-button-danger',
                text: 'Delete',
                on: {
                  click: async () => {
                    if (!window.confirm(`Delete ${word.dictionary} and its schedule? Past stories are unchanged.`)) return;
                    await deleteWord(word.id);
                    await reload();
                    showToast(`${word.dictionary} deleted.`);
                  },
                },
              }),
            ]),
          ])
        : word.state === 'suspended'
          ? button('Resume', {
              variant: 'quiet',
              onClick: async () => {
                await resumeWord(word.id);
                await reload();
                showToast(`${word.dictionary} is learning again.`);
              },
            })
          : el('details', { className: 'details-menu' }, [
              el('summary', { text: 'Actions' }),
              el('div', { className: 'details-menu-panel' }, [
                el('button', {
                  type: 'button',
                  className: 'menu-button',
                  text: 'Needs review',
                  on: {
                    click: async () => {
                      await needsReview(word.id);
                      await reload();
                      showToast(`${word.dictionary} returned to Learning.`);
                    },
                  },
                }),
                el('button', {
                  type: 'button',
                  className: 'menu-button',
                  text: 'Suspend',
                  on: {
                    click: async () => {
                      await suspendWord(word.id);
                      await reload();
                      showToast(`${word.dictionary} suspended.`);
                    },
                  },
                }),
                el('button', {
                  type: 'button',
                  className: 'menu-button menu-button-danger',
                  text: 'Delete',
                  on: {
                    click: async () => {
                      if (!window.confirm(`Delete ${word.dictionary} and its schedule? Past stories are unchanged.`)) return;
                      await deleteWord(word.id);
                      await reload();
                      showToast(`${word.dictionary} deleted.`);
                    },
                  },
                }),
              ]),
            ]),
    ]);

    return el('div', { className: 'word-row' }, [
      el('div', { className: 'word-main' }, [
        el('div', { className: 'word-dict' }, [
          el('strong', { text: word.dictionary }),
          el('span', { className: 'muted small', text: word.reading }),
          word.firstStoryPending ? el('span', { className: 'badge badge-accent', text: 'Next story' }) : null,
          word.aboveLevel ? el('span', { className: 'badge badge-gold', text: 'Above level' }) : null,
        ]),
        el('div', { className: 'word-gloss', text: word.gloss || 'No gloss available' }),
        el('div', { className: 'row', style: { marginTop: '0.3rem' } }, [
          stateBadge(word),
          el('span', { className: 'faint tiny', text: word.pos }),
        ]),
      ]),
      el('div', {}, [
        el('div', { className: 'small', text: word.reading }),
        el('div', { className: 'faint tiny', text: word.surfaceForms.slice(0, 3).join(' · ') }),
      ]),
      el('span', {
        className: 'badge badge-outline',
        text: word.jlpt ? (language === 'zh' ? `HSK ${word.jlpt}` : `JLPT N${word.jlpt}`) : '—',
      }),
      el('div', { className: 'word-recognition' }, [
        el('div', { className: 'progress-track', role: 'img', 'aria-label': `Recognition ${word.recognition} out of 100` }, [
          el('span', { style: { width: `${word.recognition}%` } }),
        ]),
        el('span', { className: 'tiny muted', text: `${word.recognition}` }),
      ]),
      el('div', { className: 'tiny faint' }, [
        el('div', { text: `${word.exposures} seen · ${word.successes} knew` }),
        el('div', { text: `last ${word.lastSeenAt ? formatDate(word.lastSeenAt) : 'never'} · ${scheduleLabel(word)}` }),
      ]),
      actions,
    ]);
  }

  function renderRows(): void {
    const list = filtered();
    rowsHost?.replaceChildren(
      ...(list.length
        ? list.map(rowFor)
        : [
            el('div', { className: 'empty-state', style: { border: '0', borderRadius: '0' } }, [
              el('div', { className: 'empty-state-mark', 'aria-hidden': 'true', text: language === 'zh' ? '词' : '語' }),
              el('h2', { text: words.length ? 'No words match this view.' : 'No words yet.' }),
              el('p', {
                text: words.length
                  ? 'Try another filter or search.'
                  : 'Tap any word while reading and add it. It will be prioritized in your next story.',
              }),
              words.length ? null : el('a', { className: 'btn btn-primary', href: '#/home', text: 'Read a story' }),
            ]),
          ]),
    );
    if (countHost) {
      countHost.textContent = `${list.length} ${list.length === 1 ? 'word' : 'words'} shown · ${words.filter((word) => word.firstStoryPending).length} waiting for their first story`;
    }
  }

  renderFilterState();
  renderRows();
}

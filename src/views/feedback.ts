import type { AppContext } from '../app';
import { db, getFeedback, getStory, listWords } from '../db';
import { computeAdaptation } from '../lib/adaptation';
import { tokenMatchesWord } from '../lib/coverage';
import { applyPassiveExposure, applyRecall } from '../lib/srs';
import type { Difficulty, Feedback, ReaderSentence, RecallResponse, Story, Word } from '../types';
import { button, el } from '../ui/dom';
import { runGeneration } from '../ui/generation';
import { showToast } from '../ui/toast';

interface WordCheckCandidate {
  word: Word;
  sentence: ReaderSentence;
}

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'too_easy', label: 'Too easy' },
  { id: 'just_right', label: 'Just right' },
  { id: 'too_hard', label: 'Too hard' },
];

const RESPONSES: { id: RecallResponse; label: string }[] = [
  { id: 'knew', label: 'Knew it' },
  { id: 'sort_of', label: 'Sort of' },
  { id: 'didnt_know', label: "Didn't know" },
];

function appearedCandidates(story: Story, words: Word[]): WordCheckCandidate[] {
  const candidates: WordCheckCandidate[] = [];
  for (const word of words) {
    if (word.state !== 'learning') continue;
    let found: ReaderSentence | null = null;
    for (const sentence of story.sentences) {
      if (sentence.tokens.some((token) => tokenMatchesWord(token, word))) {
        found = sentence;
        break;
      }
    }
    if (found) candidates.push({ word, sentence: found });
  }
  return candidates
    .sort((left, right) => {
      if (left.word.recognition !== right.word.recognition) {
        return left.word.recognition - right.word.recognition;
      }
      return left.word.dueAt - right.word.dueAt;
    })
    .slice(0, 6);
}

function summaryView(
  story: Story,
  feedback: Feedback,
  context: AppContext,
  readOnly: boolean,
): HTMLElement {
  const comprehension = feedback.comprehension;
  const view = el('div', { className: 'feedback-shell' }, [
    el('div', { className: 'feedback-card' }, [
      el('div', { className: 'eyebrow', text: readOnly ? 'Feedback saved' : 'Story complete' }),
      el('h1', { text: readOnly ? 'Feedback' : 'Nice reading.' }),
      el('p', { className: 'muted', text: story.titleJa }),
      el('div', { className: 'feedback-summary', style: { marginTop: '1.2rem' } }, [
        el('div', { className: 'field-label', text: 'What changed' }),
        el('strong', { text: feedback.adaptationSummary }),
        el('p', { className: 'small muted', style: { margin: '0.5rem 0 0' }, text: `Level ${feedback.levelBefore.toFixed(2)} → ${feedback.levelAfter.toFixed(2)}` }),
      ]),
      feedback.skipped
        ? el('div', { className: 'notice notice-warn', style: { marginTop: '1rem' } }, [
            el('span', { text: 'This story was marked unrated. Reading behavior still informed the level estimate; no word recognition checks were applied.' }),
          ])
        : el('div', { className: 'grid grid-3', style: { marginTop: '1rem' } }, [
            el('div', { className: 'stat-card' }, [
              el('strong', { text: comprehension ? `${comprehension}/5` : '—' }),
              el('span', { text: 'comprehension' }),
            ]),
            el('div', { className: 'stat-card' }, [
              el('strong', { text: feedback.difficulty === 'too_easy' ? 'Easy' : feedback.difficulty === 'too_hard' ? 'Hard' : 'Right' }),
              el('span', { text: 'difficulty' }),
            ]),
            el('div', { className: 'stat-card' }, [
              el('strong', { text: String(feedback.wordChecks.length) }),
              el('span', { text: 'words checked' }),
            ]),
          ]),
      feedback.wordChecks.length
        ? el('div', { style: { marginTop: '1.2rem' } }, [
            el('h2', { text: 'Word checks' }),
            el('div', { className: 'stack' }, feedback.wordChecks.map((check) =>
              el('div', { className: 'row-between small' }, [
                el('span', { className: 'muted', text: check.wordId.split('::')[0] }),
                el('span', { className: 'badge badge-outline', text: check.response === 'knew' ? 'Knew it' : check.response === 'sort_of' ? 'Sort of' : "Didn't know" }),
              ]),
            )),
          ])
        : null,
      el('div', { className: 'row', style: { marginTop: '1.5rem' } }, [
        button('Read next', {
          variant: 'primary',
          onClick: () => runGeneration(context, { length: context.profile.storyLength }),
        }),
        el('a', { className: 'btn btn-secondary', href: '#/reader/' + story.id, text: 'Reread story' }),
        el('a', { className: 'btn btn-ghost', href: '#/home', text: 'Library' }),
      ]),
    ]),
  ]);
  return view;
}

export async function renderFeedback(root: HTMLElement, context: AppContext, storyId: string): Promise<void> {
  const story = await getStory(storyId);
  if (!story) {
    root.append(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state-mark', text: '?' }),
      el('h1', { text: 'Story not found' }),
      el('a', { className: 'btn btn-primary', href: '#/home', text: 'Back to library' }),
    ]));
    return;
  }
  const existing = await getFeedback(storyId);
  if (existing) {
    root.replaceChildren(summaryView(story, existing, context, true));
    return;
  }

  const allWords = await listWords();
  const candidates = appearedCandidates(story, allWords);
  const responses = new Map<string, RecallResponse>();
  let comprehension: number | null = null;
  let difficulty: Difficulty | null = null;
  let interest: number | null = null;
  let saving = false;

  const save = async (skipped: boolean): Promise<void> => {
    if (saving) return;
    if (!skipped && (comprehension === null || difficulty === null)) {
      showToast('Choose comprehension and difficulty before saving.');
      return;
    }
    saving = true;
    const now = Date.now();
    const answered = [...responses.entries()].map(([wordId, response]) => ({ wordId, response }));
    const signals = {
      comprehension: skipped ? null : comprehension,
      difficulty: skipped ? null : difficulty,
      interest,
      lookupCount: story.lookupCount,
      translationReveals: story.translationReveals,
      charCount: story.charCount,
      wordChecks: skipped ? [] : answered.map((item) => item.response),
    };
    const adaptation = computeAdaptation(context.profile, signals, skipped);
    const nextProfile = {
      ...context.profile,
      level: adaptation.level,
      hardness: adaptation.hardness,
      newWordCap: adaptation.newWordCap,
      consecutiveHard: adaptation.consecutiveHard,
      consecutiveEasy: adaptation.consecutiveEasy,
      storyLength: adaptation.storyLength,
      updatedAt: now,
    };
    const appeared = new Set<string>();
    for (const word of allWords) {
      if (word.state !== 'learning') continue;
      if (story.sentences.some((sentence) => sentence.tokens.some((token) => tokenMatchesWord(token, word)))) {
        appeared.add(word.id);
      }
    }
    const updates: Word[] = [];
    for (const word of allWords) {
      if (!appeared.has(word.id)) continue;
      const response = responses.get(word.id);
      updates.push(
        response
          ? applyRecall(word, response, storyId, now)
          : applyPassiveExposure(word, storyId, now),
      );
    }
    const feedback: Feedback = {
      storyId,
      comprehension: skipped ? null : comprehension,
      difficulty: skipped ? null : difficulty,
      interest,
      skipped,
      wordChecks: skipped ? [] : answered,
      lookupCount: story.lookupCount,
      translationReveals: story.translationReveals,
      createdAt: now,
      adaptationSummary: adaptation.summary,
      levelBefore: context.profile.level,
      levelAfter: adaptation.level,
    };
    try {
      await db.transaction(
        'rw',
        [db.profile, db.words, db.stories, db.feedback],
        async () => {
          await db.profile.put(nextProfile);
          for (const word of updates) await db.words.put(word);
          await db.stories.update(storyId, {
            readState: 'finished',
            finishedAt: story.finishedAt ?? now,
            progress: 1,
            feedbackSubmitted: true,
          });
          await db.feedback.put(feedback);
        },
      );
    } catch (error) {
      saving = false;
      showToast(error instanceof Error ? error.message : 'Could not save feedback.');
      return;
    }
    context.profile = nextProfile;
    const updatedStory = { ...story, readState: 'finished' as const, finishedAt: story.finishedAt ?? now, progress: 1, feedbackSubmitted: true };
    root.replaceChildren(summaryView(updatedStory, feedback, context, false));
    showToast(skipped ? 'Story marked unrated. Reading behavior saved.' : 'Feedback saved. Next story adapted.');
  };

  const comprehensionButtons: HTMLButtonElement[] = [];
  const difficultyButtons: HTMLButtonElement[] = [];
  const interestButtons: HTMLButtonElement[] = [];

  const wordCheckNodes = candidates.map((candidate) => {
    const buttons = RESPONSES.map((response) => {
      const node = el('button', {
        type: 'button',
        'aria-pressed': false,
        text: response.label,
        on: {
          click: () => {
            const current = responses.get(candidate.word.id);
            if (current === response.id) responses.delete(candidate.word.id);
            else responses.set(candidate.word.id, response.id);
            buttons.forEach((buttonNode) => {
              buttonNode.setAttribute('aria-pressed', String(responses.get(candidate.word.id) === buttonNode.dataset.response));
            });
          },
        },
      });
      node.dataset.response = response.id;
      return node;
    });
    return el('div', { className: 'word-check' }, [
      el('div', { className: 'word-check-word' }, [
        el('strong', { text: candidate.word.dictionary }),
        el('span', { className: 'muted small', text: candidate.word.reading }),
        candidate.word.aboveLevel ? el('span', { className: 'badge badge-gold', text: 'Above level' }) : null,
      ]),
      el('div', { className: 'word-check-sentence', text: candidate.sentence.text }),
      el('div', { className: 'recall-options' }, [
        ...buttons,
        el('button', {
          type: 'button',
          className: 'btn btn-quiet',
          text: 'Skip this check',
          on: {
            click: () => {
              responses.delete(candidate.word.id);
              buttons.forEach((buttonNode) => buttonNode.setAttribute('aria-pressed', 'false'));
            },
          },
        }),
      ]),
    ]);
  });

  const stepComprehension = el('section', { className: 'feedback-step' }, [
    el('h2', { text: 'How much did you understand?' }),
    el('p', { className: 'small muted', text: 'A rough sense is enough.' }),
    el('div', { className: 'scale', role: 'group', 'aria-label': 'Comprehension from 1 to 5' },
      [1, 2, 3, 4, 5].map((value) => {
        const node = el('button', {
          type: 'button',
          'aria-pressed': false,
          'aria-label': `${value} out of 5`,
          text: String(value),
          on: {
            click: () => {
              comprehension = value;
              comprehensionButtons.forEach((buttonNode) => buttonNode.setAttribute('aria-pressed', String(Number(buttonNode.textContent) === value)));
            },
          },
        });
        comprehensionButtons.push(node);
        return node;
      }),
    ),
  ]);

  const stepDifficulty = el('section', { className: 'feedback-step' }, [
    el('h2', { text: 'How did the difficulty feel?' }),
    el('div', { className: 'difficulty-options', role: 'group', 'aria-label': 'Story difficulty' },
      DIFFICULTIES.map((item) => {
        const node = el('button', {
          type: 'button',
          className: 'chip',
          'aria-pressed': false,
          text: item.label,
          on: {
            click: () => {
              difficulty = item.id;
              difficultyButtons.forEach((buttonNode) =>
                buttonNode.setAttribute('aria-pressed', String(buttonNode.textContent === item.label)),
              );
            },
          },
        });
        difficultyButtons.push(node);
        return node;
      }),
    ),
  ]);

  const stepInterest = el('section', { className: 'feedback-step' }, [
    el('h2', { text: 'Was the story interesting?' }),
    el('p', { className: 'small muted', text: 'Optional. This informs topics, never level.' }),
    el('div', { className: 'scale', role: 'group', 'aria-label': 'Interest from 1 to 3' },
      [1, 2, 3].map((value) => {
        const node = el('button', {
          type: 'button',
          'aria-pressed': false,
          'aria-label': `${value} out of 3 interest`,
          text: String(value),
          on: {
            click: () => {
              interest = interest === value ? null : value;
              interestButtons.forEach((buttonNode) => buttonNode.setAttribute('aria-pressed', String(Number(buttonNode.textContent) === interest)));
            },
          },
        });
        interestButtons.push(node);
        return node;
      }),
    ),
  ]);

  const stepWords = el('section', { className: 'feedback-step' }, [
    el('h2', { text: 'Did these words feel familiar?' }),
    el('p', { className: 'small muted', text: 'Only words that actually appeared are shown. There are no correct answers, and each check is optional.' }),
    wordCheckNodes.length
      ? el('div', {}, wordCheckNodes)
      : el('div', { className: 'notice' }, [el('span', { text: 'No tracked words from this story need a check. Passive exposure still counts.' })]),
  ]);

  const reader = el('div', { className: 'feedback-shell' }, [
    el('div', { className: 'feedback-card' }, [
      el('div', { className: 'eyebrow', text: 'Story complete' }),
      el('h1', { text: story.titleJa }),
      el('p', { className: 'muted', text: 'A few quick impressions will shape the next story.' }),
      stepComprehension,
      stepDifficulty,
      stepInterest,
      stepWords,
      el('div', { className: 'row', style: { justifyContent: 'space-between', marginTop: '1.3rem' } }, [
        button('Skip feedback', {
          variant: 'ghost',
          onClick: () => {
            void save(true);
          },
        }),
        button('Save & continue', {
          variant: 'primary',
          onClick: () => {
            void save(false);
          },
        }),
      ]),
    ]),
  ]);
  root.replaceChildren(reader);
}

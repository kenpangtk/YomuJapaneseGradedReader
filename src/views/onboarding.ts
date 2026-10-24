import type { AppContext } from '../app';
import { saveProfile, saveSettings } from '../db';
import { bandCode, baseNewWordCap, defaultFuriganaForLevel, levelSummary } from '../lib/level';
import { defaultLanguageState, levelSystemLabel, pronunciationLabel } from '../lib/languageDefaults';
import { levelSamples } from '../content/levelSamples';
import { sharedProviderDefaults } from '../lib/sharedConfig';
import { INTERESTS, INTEREST_LABELS } from '../content/levelLists';
import type { FuriganaMode, Language, StoryLength } from '../types';
import { STORY_LENGTH_LABELS, FURIGANA_LABELS, LANGUAGE_LABELS } from '../types';
import { button, el, setDocumentTitle } from '../ui/dom';
import { runGeneration } from '../ui/generation';
import { showToast } from '../ui/toast';
import type { Profile } from '../types';

const LANGUAGES: Language[] = ['ja', 'zh'];

const FURIGANA_MODES: FuriganaMode[] = ['always', 'hover', 'click', 'learn', 'off'];
const LENGTHS: StoryLength[] = ['short', 'medium', 'long'];

function parseRubySample(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const regex = /\{([^|{}]+)\|([^}]+)\}/g;
  let lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > lastIndex) fragment.append(document.createTextNode(text.slice(lastIndex, index)));
    const ruby = document.createElement('ruby');
    ruby.append(document.createTextNode(match[1]));
    const rt = document.createElement('rt');
    rt.textContent = match[2];
    ruby.append(rt);
    fragment.append(ruby);
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) fragment.append(document.createTextNode(text.slice(lastIndex)));
  return fragment;
}

export async function renderOnboarding(root: HTMLElement, context: AppContext): Promise<void> {
  setDocumentTitle('Welcome');
  const draft: Profile = { ...context.profile };
  let step = 1;
  let showFurigana = true;
  let showEnglish = false;
  let noticeAccepted = draft.contentNoticeAcknowledged;
  let saving = false;

  const shell = el('div', { className: 'onboarding-shell' });
  root.append(shell);

  const saveOnboarding = async (): Promise<boolean> => {
    if (draft.interests.length === 0) {
      showToast('Choose at least one interest so stories have a starting point.');
      return false;
    }
    if (!noticeAccepted) {
      showToast('Please acknowledge the content notice.');
      return false;
    }
    saving = true;
    const language = draft.language;
    const newWordCap = baseNewWordCap(draft.level, language);
    draft.onboarded = true;
    draft.contentNoticeAcknowledged = true;
    draft.newWordCap = newWordCap;
    draft.hardness = 0;
    draft.consecutiveHard = 0;
    draft.consecutiveEasy = 0;
    draft.savedLevels = {
      ...draft.savedLevels,
      [language]: {
        level: draft.level,
        hardness: 0,
        newWordCap,
        consecutiveHard: 0,
        consecutiveEasy: 0,
        furiganaMode: draft.furiganaMode,
      },
    };
    await saveProfile(draft);
    context.settings = {
      ...context.settings,
      furiganaDefault: draft.furiganaMode,
      translationsDefault: draft.translationsDefault,
    };
    await saveSettings(context.settings);
    context.profile = { ...draft, updatedAt: Date.now() };
    return true;
  };

  const chooseLanguage = (language: Language): void => {
    if (draft.language === language) return;
    const savedLevels = {
      ...draft.savedLevels,
      [draft.language]: {
        level: draft.level,
        hardness: draft.hardness,
        newWordCap: draft.newWordCap,
        consecutiveHard: draft.consecutiveHard,
        consecutiveEasy: draft.consecutiveEasy,
        furiganaMode: draft.furiganaMode,
      },
    };
    const saved = savedLevels[language] ?? defaultLanguageState(language);
    draft.savedLevels = savedLevels;
    draft.language = language;
    draft.level = saved.level;
    draft.furiganaMode = saved.furiganaMode || defaultFuriganaForLevel(saved.level, language);
    showFurigana = draft.furiganaMode === 'always';
    render();
  };

  const render = (): void => {
    const samples = levelSamples(draft.language);
    const selectedSample =
      samples.find((sample) => sample.code === bandCode(draft.level, draft.language)) ?? samples[0];
    const pronunciation = pronunciationLabel(draft.language);
    const stepContent = el('div', { className: 'stack' });

    if (step === 1) {
      const sampleBody =
        draft.language === 'zh'
          ? el('div', {}, [
              showFurigana && selectedSample.pinyin
                ? el('p', { className: 'sample-pinyin', text: selectedSample.pinyin })
                : null,
              el('div', { className: 'sample-ja', text: selectedSample.text }),
            ])
          : el('div', { className: 'sample-ja' }, [
              showFurigana && selectedSample.ruby ? parseRubySample(selectedSample.ruby) : selectedSample.text,
            ]);
      stepContent.append(
        el('div', {}, [
          el('div', { className: 'eyebrow', text: 'Step 1 of 3' }),
          el('h1', { text: 'Where are you now?' }),
          el('p', { className: 'muted', text: 'Pick the level where you can read comfortably with some effort. You can change this later, and stories adapt after feedback.' }),
        ]),
        el('div', { className: 'field' }, [
          el('label', { text: 'Learning language' }),
          el('div', { className: 'language-choice', role: 'group', 'aria-label': 'Learning language' },
            LANGUAGES.map((language) => {
              const active = draft.language === language;
              return el('button', {
                type: 'button',
                className: 'language-choice-option',
                'aria-pressed': active ? 'true' : 'false',
                on: {
                  click: () => {
                    if (!active) chooseLanguage(language);
                  },
                },
              }, [
                el('span', { className: 'language-choice-native', text: language === 'zh' ? '中文' : '日本語' }),
                el('span', { className: 'language-choice-name', text: LANGUAGE_LABELS[language] }),
                el('span', { className: 'language-choice-system', text: levelSystemLabel(language) }),
              ]);
            }),
          ),
          el('span', { className: 'hint', text: 'Each language keeps its own level, pronunciation setting, and progress.' }),
        ]),
        el('div', { className: 'level-grid', role: 'group', 'aria-label': `${levelSystemLabel(draft.language)} starting level` },
          samples.map((sample) => {
            const selected = bandCode(draft.level, draft.language) === sample.code;
            return el('button', {
              type: 'button',
              className: 'level-option',
              'aria-pressed': selected ? 'true' : 'false',
              on: {
                click: () => {
                  draft.level = sample.level;
                  draft.furiganaMode = defaultFuriganaForLevel(sample.level, draft.language);
                  showFurigana = draft.furiganaMode === 'always';
                  render();
                },
              },
            }, [
              el('span', { className: 'level-option-code', text: sample.code }),
              el('span', { className: 'level-option-label', text: sample.label }),
              el('span', { className: 'level-option-sample', text: sample.text.slice(0, 40) }),
            ]);
          }),
        ),
        el('div', { className: 'sample-panel' }, [
          el('div', { className: 'row', style: { justifyContent: 'space-between', marginBottom: '0.45rem' } }, [
            el('span', { className: 'field-label', text: `${levelSummary(draft.level, draft.language)} sample` }),
            el('div', { className: 'row', style: { gap: '0.35rem' } }, [
              button(`${showFurigana ? 'Hide' : 'Show'} ${pronunciation.toLowerCase()}`, {
                variant: 'quiet',
                onClick: () => {
                  showFurigana = !showFurigana;
                  render();
                },
              }),
              button(showEnglish ? 'Hide English' : 'Show English', {
                variant: 'quiet',
                onClick: () => {
                  showEnglish = !showEnglish;
                  render();
                },
              }),
            ]),
          ]),
          sampleBody,
          showEnglish ? el('p', { className: 'sample-en', text: selectedSample.english }) : null,
        ]),
      );
    } else if (step === 2) {
      stepContent.append(
        el('div', {}, [
          el('div', { className: 'eyebrow', text: 'Step 2 of 3' }),
          el('h1', { text: 'Make reading yours.' }),
          el('p', { className: 'muted', text: 'These preferences are saved locally and can be changed at any time.' }),
        ]),
        el('div', { className: 'pref-grid' }, [
          el('div', { className: 'card card-soft' }, [
            el('h2', { text: pronunciation }),
            el('p', {
              className: 'muted small',
              text:
                draft.language === 'zh'
                  ? 'Pinyin above Chinese characters. On click reveals one word’s pinyin and definition; Learn-only shows readings for tracked words.'
                  : 'Readings above kanji. On click reveals one word’s reading and definition; Learn-only shows them for tracked words.',
            }),
            el('div', { className: 'segmented', role: 'group', 'aria-label': `${pronunciation} default` },
              FURIGANA_MODES.map((mode) =>
                el('button', {
                  type: 'button',
                  'aria-pressed': draft.furiganaMode === mode ? 'true' : 'false',
                  text: FURIGANA_LABELS[mode],
                  on: {
                    click: () => {
                      draft.furiganaMode = mode;
                      render();
                    },
                  },
                }),
              ),
            ),
          ]),
          el('div', { className: 'card card-soft' }, [
            el('h2', { text: 'Story length' }),
            el('p', { className: 'muted small', text: 'Short is the recommended default: a complete story in a few minutes.' }),
            el('div', { className: 'segmented', role: 'group', 'aria-label': 'Story length' },
              LENGTHS.map((length) =>
                el('button', {
                  type: 'button',
                  'aria-pressed': draft.storyLength === length,
                  text: STORY_LENGTH_LABELS[length],
                  on: {
                    click: () => {
                      draft.storyLength = length;
                      render();
                    },
                  },
                }),
              ),
            ),
          ]),
        ]),
        el('div', { className: 'card card-soft' }, [
          el('h2', { text: 'What do you enjoy reading about?' }),
          el('p', { className: 'muted small', text: 'Choose a few. Topic rotation starts here, and you can always pick something else before generating.' }),
          el('div', { className: 'interest-grid' },
            INTERESTS.map((interest) =>
              el('button', {
                type: 'button',
                className: 'chip',
                'aria-pressed': draft.interests.includes(interest),
                text: INTEREST_LABELS[interest],
                on: {
                  click: () => {
                    draft.interests = draft.interests.includes(interest)
                      ? draft.interests.filter((item) => item !== interest)
                      : [...draft.interests, interest];
                    render();
                  },
                },
              }),
            ),
          ),
        ]),
        el('label', { className: 'check' }, [
          el('input', {
            type: 'checkbox',
            checked: draft.translationsDefault,
            on: {
              change: (event) => {
                draft.translationsDefault = (event.target as HTMLInputElement).checked;
              },
            },
          }),
          el('span', {}, [
            el('strong', { text: 'Show sentence translations by default' }),
            el('span', { className: 'muted small', text: ' You can also reveal them with T at any time.' }),
          ]),
        ]),
        el('label', { className: 'check' }, [
          el('input', {
            type: 'checkbox',
            checked: noticeAccepted,
            on: {
              change: (event) => {
                noticeAccepted = (event.target as HTMLInputElement).checked;
              },
            },
          }),
          el('span', {}, [
            el('strong', { text: 'Content notice' }),
            el('span', { className: 'muted small', text: ' Topics are chosen by you. Yomu adds no content exclusions; the configured provider’s moderation is the boundary. Generation runs in your browser; provider settings are managed on this device.' }),
          ]),
        ]),
        el('div', { className: 'notice' }, [
          el('span', { 'aria-hidden': 'true', text: 'i' }),
          el('span', { text: 'No account, no backend, no telemetry. You can export or clear all data in Settings.' }),
        ]),
      );
    } else {
      const selectedInterests = draft.interests.map((interest) => INTEREST_LABELS[interest as keyof typeof INTEREST_LABELS] ?? interest);
      stepContent.append(
        el('div', {}, [
          el('div', { className: 'eyebrow', text: 'Step 3 of 3' }),
          el('h1', { text: 'Ready for your first story.' }),
          el('p', { className: 'muted', text: 'Yomu will generate a short story, tokenize it, and check that it fits your level before showing it.' }),
        ]),
        el('div', { className: 'grid grid-2' }, [
          el('div', { className: 'card card-soft' }, [
            el('div', { className: 'field-label', text: `Reading level · ${levelSystemLabel(draft.language)}` }),
            el('h2', { text: levelSummary(draft.level, draft.language), style: { marginTop: '0.4rem' } }),
            el('p', { className: 'muted small', text: `Continuous score ${draft.level.toFixed(2)} · new-word cap ${baseNewWordCap(draft.level, draft.language)}` }),
          ]),
          el('div', { className: 'card card-soft' }, [
            el('div', { className: 'field-label', text: 'Preferences' }),
            el('div', { className: 'stack', style: { marginTop: '0.6rem', gap: '0.35rem' } }, [
              el('span', { className: 'small', text: `Language: ${LANGUAGE_LABELS[draft.language]}` }),
              el('span', { className: 'small', text: `${pronunciation}: ${FURIGANA_LABELS[draft.furiganaMode]}` }),
              el('span', { className: 'small', text: `Length: ${STORY_LENGTH_LABELS[draft.storyLength]}` }),
              el('span', { className: 'small', text: `Translations: ${draft.translationsDefault ? 'shown' : 'on demand'}` }),
              el('span', { className: 'small', text: `Interests: ${selectedInterests.join(', ') || 'none'}` }),
            ]),
          ]),
        ]),
        el('div', { className: 'notice notice-moss' }, [
          el('span', { 'aria-hidden': 'true', text: '✓' }),
          el('span', {
            text: sharedProviderDefaults.enabled
              ? 'A shared provider is configured for this device. You can switch to the offline mock or use your own key in Settings.'
              : 'The default provider is the offline mock. Add an OpenAI-compatible endpoint and key in Settings whenever you want live generation.',
          }),
        ]),
        el('div', { className: 'card card-soft' }, [
          el('h2', { text: 'How the loop works' }),
          el('ol', { className: 'small muted', style: { marginBottom: 0, paddingLeft: '1.2rem', lineHeight: '1.8' } }, [
            el('li', { text: `Read with optional ${pronunciation.toLowerCase()} and instant word lookups.` }),
            el('li', { text: 'Add any word to your list; it returns in later stories.' }),
            el('li', { text: 'Finish and give short feedback; the next story adapts.' }),
          ]),
        ]),
      );
    }

    const primary =
      step < 3
        ? button('Continue', {
            variant: 'primary',
            onClick: () => {
              if (step === 1) {
                step = 2;
                render();
              } else if (draft.interests.length === 0) {
                showToast('Choose at least one interest.');
              } else if (!noticeAccepted) {
                showToast('Please acknowledge the content notice.');
              } else {
                step = 3;
                render();
              }
            },
          })
        : el('div', { className: 'row' }, [
            button('Go to library', {
              variant: 'secondary',
              disabled: saving,
              onClick: async () => {
                if (saving) return;
                const saved = await saveOnboarding();
                if (saved) context.navigate('#/home');
              },
            }),
            button('Create my first story', {
              variant: 'primary',
              disabled: saving,
              onClick: async () => {
                if (saving) return;
                const saved = await saveOnboarding();
                if (!saved) {
                  saving = false;
                  return;
                }
                saving = false;
                runGeneration(context, {
                  topic: draft.interests[0] ?? 'daily life',
                  length: draft.storyLength,
                });
              },
            }),
          ]);

    const back =
      step > 1
        ? button('Back', {
            variant: 'ghost',
            onClick: () => {
              step -= 1;
              render();
            },
          })
        : el('span');

    const progress = el('div', { className: 'onboarding-steps', 'aria-label': `Step ${step} of 3` },
      [1, 2, 3].map((number) =>
        el('div', { className: `onboarding-step ${number === step ? 'is-active' : ''}` }, [
          el('span', { className: 'onboarding-step-num', text: String(number) }),
          el('span', { text: number === 1 ? 'Level' : number === 2 ? 'Preferences' : 'First story' }),
        ]),
      ),
    );

    shell.replaceChildren(
      el('div', { className: 'onboarding-brand' }, [
        el('div', { className: 'brand' }, [
          el('span', { className: 'brand-mark', 'aria-hidden': 'true', text: '読' }),
          el('span', {}, [
            el('span', { className: 'brand-name', text: 'Yomu' }),
            el('span', { className: 'brand-sub', text: 'Adaptive graded reader' }),
          ]),
        ]),
        el('span', { className: 'badge badge-outline', text: 'Local-first · no account' }),
      ]),
      progress,
      el('div', { className: 'onboarding-panel', style: { marginTop: '1.5rem' } }, [
        stepContent,
        el('div', { className: 'onboarding-footer' }, [back, primary]),
      ]),
      el('p', { className: 'hint', style: { textAlign: 'center', marginTop: '1.2rem' }, text: 'You can revisit preferences and provider settings later.' }),
    );
  };

  render();
}

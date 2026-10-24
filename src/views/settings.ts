import type { AppContext } from '../app';
import {
  clearAllData,
  clearApiKey,
  createExportBundle,
  getApiKeySource,
  importBundle,
  listGenerationLogs,
  saveProfile,
  saveSettings,
  setApiKey,
} from '../db';
import { baseNewWordCap, lengthRange, levelSummary } from '../lib/level';
import { switchLanguage } from '../lib/language';
import { defaultLanguageState, levelSystemLabel, pronunciationLabel } from '../lib/languageDefaults';
import { levelSamples } from '../content/levelSamples';
import { optOutOfSharedProvider } from '../lib/sharedConfig';
import { downloadJson, parseImport } from '../lib/exportImport';
import { formatDateTime } from '../lib/date';
import { INTERESTS, INTEREST_LABELS } from '../content/levelLists';
import { testProviderConnection } from '../generation/pipeline';
import type { FuriganaMode, Language, ProviderKind, StoryLength } from '../types';
import { LANGUAGE_LABELS, FURIGANA_LABELS, STORY_LENGTH_LABELS } from '../types';
import { button, el } from '../ui/dom';
import { openModal } from '../ui/modal';
import { showError, showToast } from '../ui/toast';

const FURIGANA_MODES: FuriganaMode[] = ['off', 'always', 'hover', 'click', 'learn'];
const LENGTHS: StoryLength[] = ['short', 'medium', 'long'];
const LANGUAGES: Language[] = ['ja', 'zh'];

function levelOptions(language: Language, current: number): number[] {
  const set = new Set<number>(levelSamples(language).map((sample) => sample.level));
  set.add(Math.round(current * 1000) / 1000);
  return [...set].sort((left, right) => left - right);
}

export async function renderSettings(root: HTMLElement, context: AppContext): Promise<void> {
  const settings = context.settings;
  const profile = context.profile;
  const language = profile.language;
  const pronunciation = pronunciationLabel(language);
  const recentLogs = await listGenerationLogs(4);
  const keySource = getApiKeySource();
  const savedKey = keySource === 'saved';
  let level = profile.level;
  let furigana = profile.furiganaMode;
  let translations = settings.translationsDefault;
  let textSize = settings.textSize;
  let storyLength = profile.storyLength;
  let interests = [...profile.interests];
  let provider = settings.provider;
  let baseUrl = settings.baseUrl;
  let model = settings.model;
  let newKey = '';
  const providerStatus = el('div', { className: 'hint', id: 'provider-status' });

  const updateProviderStatus = (): void => {
    const source = getApiKeySource();
    const keyLabel =
      source === 'shared' ? 'shared server key' : source === 'saved' ? 'API key stored' : 'no API key stored';
    providerStatus.textContent =
      provider === 'mock'
        ? 'Active provider: Offline mock. New stories will not use the network.'
        : `Active provider: ${model.trim() || 'no model set'} @ ${baseUrl.trim() || 'no base URL'} · ${keyLabel}`;
  };

  const savePreferences = async (notify = true): Promise<void> => {
    const current = context.profile;
    const levelChanged = Math.abs(level - current.level) > 0.0001;
    const hardness = levelChanged ? 0 : current.hardness;
    const consecutiveHard = levelChanged ? 0 : current.consecutiveHard;
    const consecutiveEasy = levelChanged ? 0 : current.consecutiveEasy;
    const newWordCap = levelChanged ? baseNewWordCap(level, language) : current.newWordCap;
    const nextProfile = {
      ...current,
      level,
      furiganaMode: furigana,
      translationsDefault: translations,
      storyLength,
      interests,
      hardness,
      consecutiveHard,
      consecutiveEasy,
      newWordCap,
      savedLevels: {
        ...current.savedLevels,
        [language]: {
          level,
          hardness,
          consecutiveHard,
          consecutiveEasy,
          newWordCap,
          furiganaMode: furigana,
        },
      },
      updatedAt: Date.now(),
    };
    await saveProfile(nextProfile);
    const nextSettings = {
      ...context.settings,
      furiganaDefault: furigana,
      translationsDefault: translations,
      textSize,
      updatedAt: Date.now(),
    };
    await saveSettings(nextSettings);
    context.profile = nextProfile;
    context.settings = nextSettings;
    document.documentElement.style.setProperty('--reader-scale', String(textSize / 100));
    if (notify) {
      showToast(levelChanged ? `Level set to ${levelSummary(level, language)}. Adaptation history reset.` : 'Reading preferences saved.');
    }
  };

  const changeLanguage = async (next: Language): Promise<void> => {
    if (next === language) return;
    await savePreferences(false);
    context.profile = await switchLanguage(next);
    await context.refresh();
    showToast(`Learning language set to ${LANGUAGE_LABELS[next]}.`);
  };

  const saveProvider = async (notify = true, clearKeyInput = true): Promise<boolean> => {
    optOutOfSharedProvider();
    if (provider === 'openai') {
      if (!baseUrl.trim() || !model.trim()) {
        if (notify) showToast('Enter an endpoint and model for the provider.');
        else providerStatus.textContent = 'Not saved: endpoint and model are required.';
        return false;
      }
      if (!baseUrl.startsWith('https://') && !baseUrl.startsWith('http://localhost') && !baseUrl.startsWith('http://127.0.0.1')) {
        if (notify) showToast('Use an HTTPS endpoint (or localhost for local development).');
        else providerStatus.textContent = 'Not saved: use HTTPS or a localhost endpoint.';
        return false;
      }
    }
    if (newKey) {
      setApiKey(newKey.trim());
      if (clearKeyInput) {
        newKey = '';
        keyInput.value = '';
        keyInput.placeholder = '•••••••• saved locally';
      }
    }
    const next = {
      ...settings,
      provider,
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      updatedAt: Date.now(),
    };
    await saveSettings(next);
    context.settings = next;
    updateProviderStatus();
    if (notify) showToast(provider === 'mock' ? 'Offline mock provider selected.' : 'Provider settings saved.');
    return true;
  };

  const persistProviderDraft = async (): Promise<void> => {
    if (newKey) setApiKey(newKey.trim());
    const next = {
      ...settings,
      provider,
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      updatedAt: Date.now(),
    };
    await saveSettings(next);
    context.settings = next;
    updateProviderStatus();
  };

  const test = async (): Promise<void> => {
    const saved = await saveProvider();
    if (!saved) return;
    showToast('Testing provider connection…');
    try {
      const message = await testProviderConnection();
      showToast(message);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Connection test failed.');
    }
  };

  const keyInput = el('input', {
    className: 'input',
    type: 'password',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: keySource === 'saved' ? '•••••••• saved locally' : keySource === 'shared' ? 'Using shared server key' : 'sk-…',
    'aria-label': 'Provider API key',
    on: {
      input: (event) => {
        newKey = (event.target as HTMLInputElement).value;
        if (newKey.trim()) setApiKey(newKey.trim());
        void persistProviderDraft();
      },
    },
  });

  const lengthHint = el('span', { className: 'hint' });
  const updateLengthHint = (): void => {
    const range = lengthRange(level, storyLength, language);
    const lengthName = storyLength.charAt(0).toUpperCase() + storyLength.slice(1);
    lengthHint.textContent = `${lengthName} at ${levelSummary(level, language)}: about ${range.min}–${range.max} characters.`;
  };

  const levelSelect = el('select', {
    className: 'select',
    'aria-label': `${levelSystemLabel(language)} reading level`,
    on: {
      change: (event) => {
        level = Number((event.target as HTMLSelectElement).value);
        levelReadout.textContent = `${levelSummary(level, language)} · ${level.toFixed(2)}`;
        updateLengthHint();
      },
    },
  }, levelOptions(language, profile.level).map((value) =>
    el('option', { value: String(value), selected: Math.abs(value - level) < 0.001 }, `${levelSummary(value, language)} · ${value.toFixed(2)}`),
  ));
  const levelReadout = el('span', { className: 'badge badge-outline', text: `${levelSummary(level, language)} · ${level.toFixed(2)}` });

  const furiganaButtons = FURIGANA_MODES.map((mode) =>
    el('button', {
      type: 'button',
      'aria-pressed': furigana === mode ? 'true' : 'false',
      text: FURIGANA_LABELS[mode],
      on: {
        click: () => {
          furigana = mode;
          furiganaButtons.forEach((node) => node.setAttribute('aria-pressed', String(node.textContent === FURIGANA_LABELS[furigana])));
        },
      },
    }),
  );
  const lengthSelect = el('select', {
    className: 'select',
    'aria-label': 'Preferred story length',
    on: {
      change: (event) => {
        storyLength = (event.target as HTMLSelectElement).value as StoryLength;
        updateLengthHint();
      },
    },
  }, LENGTHS.map((choice) => el('option', { value: choice, selected: choice === storyLength }, STORY_LENGTH_LABELS[choice])));
  updateLengthHint();

  const textSizeInput = el('input', {
    className: 'input',
    type: 'range',
    min: '90',
    max: '140',
    step: '5',
    value: String(textSize),
    'aria-label': 'Reader text size',
    on: {
      input: (event) => {
        textSize = Number((event.target as HTMLInputElement).value);
        textSizeLabel.textContent = `${textSize}%`;
        document.documentElement.style.setProperty('--reader-scale', String(textSize / 100));
      },
    },
  });
  const textSizeLabel = el('span', { className: 'badge badge-outline', text: `${textSize}%` });

  const interestButtons = INTERESTS.map((interest) =>
    el('button', {
      type: 'button',
      className: 'chip',
      'aria-pressed': interests.includes(interest),
      text: INTEREST_LABELS[interest],
      on: {
        click: (event) => {
          interests = interests.includes(interest)
            ? interests.filter((item) => item !== interest)
            : [...interests, interest];
          (event.currentTarget as HTMLButtonElement).setAttribute('aria-pressed', String(interests.includes(interest)));
        },
      },
    }),
  );

  const providerSelect = el('select', {
    className: 'select',
    'aria-label': 'Story provider',
    on: {
      change: (event) => {
        provider = (event.target as HTMLSelectElement).value as ProviderKind;
        optOutOfSharedProvider();
        providerFields.hidden = provider === 'mock';
        void persistProviderDraft();
      },
    },
  }, [
    el('option', { value: 'mock', selected: provider === 'mock' }, 'Offline mock (deterministic, no key)'),
    el('option', { value: 'openai', selected: provider === 'openai' }, 'OpenAI-compatible (BYOK)'),
  ]);
  const baseUrlInput = el('input', {
    id: 'provider-base-url',
    className: 'input',
    type: 'url',
    value: baseUrl,
    autocomplete: 'url',
    'aria-label': 'Base URL',
    on: {
      input: (event) => {
        baseUrl = (event.target as HTMLInputElement).value;
        optOutOfSharedProvider();
        void persistProviderDraft();
      },
    },
  });
  const modelInput = el('input', {
    id: 'provider-model',
    className: 'input',
    type: 'text',
    value: model,
    autocomplete: 'off',
    'aria-label': 'Model',
    on: {
      input: (event) => {
        model = (event.target as HTMLInputElement).value;
        optOutOfSharedProvider();
        void persistProviderDraft();
      },
    },
  });
  const providerFields = el('div', { className: 'stack', hidden: provider === 'mock' }, [
    el('div', { className: 'field-row' }, [
      el('div', { className: 'field' }, [
        el('label', { for: 'provider-base-url', text: 'Base URL' }),
        baseUrlInput,
        el('span', { className: 'hint', text: 'Example: https://api.openai.com/v1. The endpoint must allow browser CORS for POST /chat/completions.' }),
      ]),
      el('div', { className: 'field' }, [
        el('label', { for: 'provider-model', text: 'Model' }),
        modelInput,
        el('span', { className: 'hint', text: 'Any chat-completions-compatible model.' }),
      ]),
    ]),
    el('div', { className: 'field' }, [
      el('label', { text: 'API key' }),
      el('div', { className: 'provider-key-row' }, [
        keyInput,
        savedKey
          ? button('Clear key', {
              variant: 'quiet',
              onClick: () => {
                clearApiKey();
                optOutOfSharedProvider();
                provider = 'mock';
                providerSelect.value = 'mock';
                providerFields.hidden = true;
                void persistProviderDraft();
                keyInput.placeholder = 'sk-…';
                updateProviderStatus();
                showToast('API key removed. Switched to the offline mock provider.');
              },
            })
          : null,
      ]),
      el('span', {
        className: 'hint',
        text:
          keySource === 'shared'
            ? 'Using the shared provider key supplied with this app. Anyone who can load this page can extract it; use only on a trusted network.'
            : savedKey
              ? 'A key is saved in localStorage. It is never shown in full, exported, or logged.'
              : 'Stored in localStorage only. Never exported or logged.',
      }),
    ]),
    el('div', { className: 'notice notice-warn' }, [
      el('span', { 'aria-hidden': 'true', text: '!' }),
      el('span', {
        text:
          keySource === 'shared'
            ? 'This app is using a shared provider key supplied by the server. Anyone who can load the page can extract the key. Use only on a trusted Wi-Fi network and use a scoped key with a spending limit.'
            : 'Browser-held keys are visible to any script on this origin. Use a scoped key and avoid untrusted scripts. The endpoint must allow browser CORS for POST /chat/completions; a provider that cannot allow CORS needs a thin proxy. A proxy is also required before public distribution.',
      }),
    ]),
    el('div', { className: 'row' }, [
      button('Save provider', { variant: 'secondary', onClick: () => { void saveProvider(); } }),
      button('Test connection', { variant: 'primary', onClick: () => { void test(); } }),
    ]),
  ]);

  updateProviderStatus();

  const fileInput = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    on: {
      change: async (event) => {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        try {
          const preview = parseImport(await file.text());
          const counts = preview.counts;
          const modal = openModal({
            title: 'Import Yomu data',
            body: el('div', {}, [
              el('p', { text: 'Review what will be merged. Newer feedback wins; words are deduplicated within each language by dictionary form and reading; stories are deduplicated by ID.' }),
              el('div', { className: 'import-preview' }, [
                el('span', { text: `${counts.words} words` }),
                el('span', { text: `${counts.stories} stories` }),
                el('span', { text: `${counts.feedback} feedback records` }),
                el('span', { text: `${counts.events} events` }),
                el('span', { text: `${counts.generationLogs} generation logs` }),
              ]),
              ...preview.warnings.map((warning) => el('div', { className: 'notice notice-warn' }, warning)),
              el('p', { className: 'hint', text: 'Your API key is not part of the import and will be preserved.' }),
            ]),
            actions: [
              button('Cancel', { variant: 'secondary', onClick: () => modal.close() }),
              button('Merge data', {
                variant: 'primary',
                onClick: async () => {
                  const result = await importBundle(preview.bundle);
                  modal.close();
                  context.navigate('#/home');
                  showToast(`Imported ${result.addedWords} words and ${result.addedStories} stories.`);
                },
              }),
            ],
          });
        } catch (error) {
          showError(error instanceof Error ? error.message : 'Import failed.');
        }
      },
    },
  });

  const clearConfirmInput = el('input', {
    className: 'input',
    type: 'text',
    autocomplete: 'off',
    'aria-label': 'Type CLEAR to confirm',
    placeholder: 'CLEAR',
  });
  const openClear = () => {
    clearConfirmInput.value = '';
    const modal = openModal({
      title: 'Clear all learner data?',
      body: el('div', {}, [
        el('p', { text: 'This removes your profile, stories, feedback, word schedules, provider settings, logs, and the saved API key. Export first if you want a copy.' }),
        el('div', { className: 'field' }, [
          el('label', { text: 'Type CLEAR to confirm' }),
          clearConfirmInput,
        ]),
      ]),
      actions: [
        button('Cancel', { variant: 'secondary', onClick: () => modal.close() }),
        button('Clear everything', {
          variant: 'danger',
          onClick: async () => {
            if (clearConfirmInput.value !== 'CLEAR') {
              showToast('Type CLEAR exactly to confirm.');
              return;
            }
            await clearAllData();
            modal.close();
            context.navigate('#/onboarding');
            showToast('All local learner data cleared.');
          },
        }),
      ],
    });
  };

  context.setCleanup(() => {
    void persistProviderDraft();
  });

  root.append(
    el('div', { className: 'page-head' }, [
      el('div', {}, [
        el('div', { className: 'eyebrow', text: 'Preferences' }),
        el('h1', { text: 'Settings' }),
        el('p', { text: 'Reading preferences, provider configuration, and local data controls.' }),
      ]),
      button('Save reading preferences', { variant: 'primary', onClick: () => { void savePreferences(); } }),
    ]),
    el('div', { className: 'settings-grid' }, [
      el('nav', { className: 'settings-nav', 'aria-label': 'Settings sections' }, [
        el('a', { href: '#language', text: 'Language' }),
        el('a', { href: '#reading', text: 'Reading' }),
        el('a', { href: '#provider', text: 'Provider' }),
        el('a', { href: '#data', text: 'Data' }),
        el('a', { href: '#about', text: 'About' }),
      ]),
      el('div', {}, [
        el('section', { id: 'language', className: 'settings-section card' }, [
          el('h2', { text: 'Learning language' }),
          el('p', { className: 'muted small', text: 'Japanese and Chinese keep separate levels, pronunciation settings, and adaptation history.' }),
          el('div', { className: 'language-choice', role: 'group', 'aria-label': 'Learning language' },
            LANGUAGES.map((code) => {
              const active = profile.language === code;
              const saved = profile.savedLevels[code] ?? defaultLanguageState(code);
              return el('button', {
                type: 'button',
                className: 'language-choice-option',
                'aria-pressed': active ? 'true' : 'false',
                on: {
                  click: () => {
                    if (!active) void changeLanguage(code);
                  },
                },
              }, [
                el('span', { className: 'language-choice-native', text: code === 'zh' ? '中文' : '日本語' }),
                el('span', { className: 'language-choice-name', text: LANGUAGE_LABELS[code] }),
                el('span', { className: 'language-choice-system', text: `${levelSystemLabel(code)} · ${levelSummary(active ? level : saved.level, code)}` }),
              ]);
            }),
          ),
          el('span', { className: 'hint', text: 'Switching loads the saved level and pronunciation setting for that language.' }),
        ]),
        el('section', { id: 'reading', className: 'settings-section card' }, [
          el('h2', { text: 'Reading' }),
          el('div', { className: 'stack' }, [
            el('div', { className: 'field-row' }, [
              el('div', { className: 'field' }, [
                el('label', { text: `${levelSystemLabel(language)} level` }),
                el('div', { className: 'row' }, [levelSelect, levelReadout]),
                el('span', { className: 'hint', text: 'Manual changes reset the adaptation moving average, not word schedules.' }),
              ]),
              el('div', { className: 'field' }, [
                el('label', { text: 'Preferred story length' }),
                lengthSelect,
                lengthHint,
              ]),
            ]),
            el('div', { className: 'field' }, [
              el('label', { text: `${pronunciation} default` }),
              el('div', { className: 'segmented', role: 'group', 'aria-label': `${pronunciation} default` }, furiganaButtons),
              el('span', {
                className: 'hint',
                text:
                  language === 'zh'
                    ? 'Show pinyin above Chinese characters. On click reveals one word’s pinyin and definition; Learn-only limits readings to tracked words.'
                    : 'Show readings above kanji. On click reveals one word’s reading and definition; Learn-only limits them to tracked words.',
              }),
            ]),
            el('div', { className: 'field' }, [
              el('label', { text: 'Reader text size' }),
              el('div', { className: 'row' }, [textSizeInput, textSizeLabel]),
            ]),
            el('label', { className: 'check' }, [
              el('input', {
                type: 'checkbox',
                checked: translations,
                on: {
                  change: (event) => {
                    translations = (event.target as HTMLInputElement).checked;
                  },
                },
              }),
              el('span', {}, [
                el('strong', { text: 'Show sentence translations by default' }),
                el('span', { className: 'muted small', text: ' You can always reveal them with T.' }),
              ]),
            ]),
            el('div', { className: 'field' }, [
              el('label', { text: 'Interests' }),
              el('div', { className: 'chip-row' }, interestButtons),
            ]),
          ]),
        ]),
        el('section', { id: 'provider', className: 'settings-section card' }, [
          el('h2', { text: 'Story provider' }),
          el('p', { className: 'muted small', text: 'The mock provider works fully offline. Live generation goes directly from this browser to your configured endpoint.' }),
          el('div', { className: 'field' }, [
            el('label', { text: 'Provider' }),
            providerSelect,
            providerStatus,
            el('span', { className: 'hint', text: 'Provider fields save automatically when you leave a field; Save provider remains available.' }),
          ]),
          providerFields,
          el('details', { className: 'generation-diagnostics' }, [
            el('summary', { text: `Recent generation diagnostics (${recentLogs.length})` }),
            ...(recentLogs.length
              ? recentLogs.map((log) =>
                  el('div', { className: 'diagnostic-row' }, [
                    el('strong', { text: `${formatDateTime(log.createdAt)} · ${log.model} · ${log.attempts} attempt(s)` }),
                    el('div', { text: log.fallbackUsed ? 'Result: bundled fallback' : 'Result: generated story' }),
                    log.error ? el('div', { style: { marginTop: '0.3rem' }, text: log.error }) : null,
                    ...(log.validation?.errors?.length
                      ? [el('ul', { style: { margin: '0.35rem 0 0', paddingLeft: '1.1rem' } }, log.validation.errors.slice(0, 6).map((error) => el('li', { text: error })))]
                      : []),
                  ]),
                )
              : [el('p', { className: 'hint', text: 'No generation attempts logged yet.' })]),
          ]),
        ]),
        el('section', { id: 'data', className: 'settings-section card' }, [
          el('h2', { text: 'Data' }),
          el('p', { className: 'muted small', text: 'Learner data lives in IndexedDB. Provider credentials live in localStorage. Nothing is sent anywhere unless you generate with a live provider.' }),
          el('div', { className: 'row' }, [
            button('Export JSON', {
              variant: 'secondary',
              onClick: async () => {
                const bundle = await createExportBundle();
                downloadJson(`yomu-export-${new Date().toISOString().slice(0, 10)}.json`, bundle);
                showToast('Export downloaded. API key excluded.');
              },
            }),
            button('Import JSON', {
              variant: 'secondary',
              onClick: () => fileInput.click(),
            }),
            fileInput,
          ]),
          el('div', { className: 'divider-label', text: 'Danger zone' }),
          el('div', { className: 'notice danger-zone' }, [
            el('div', { className: 'stack', style: { gap: '0.6rem' } }, [
              el('strong', { text: 'Clear all data' }),
              el('span', { className: 'small', text: 'Requires typed confirmation. Removes the API key too. This cannot be undone without an export.' }),
              el('div', {}, [button('Clear all data', { variant: 'danger', onClick: openClear })]),
            ]),
          ]),
        ]),
        el('section', { id: 'about', className: 'settings-section card card-soft' }, [
          el('h2', { text: 'About Yomu' }),
          el('p', { className: 'muted small', text: 'Yomu is a local-first MVP for adaptive Japanese and Chinese graded reading. Tokenization and readings are produced locally, and stories are validated for length, token alignment, coverage, character level, review words, and duplication before display.' }),
          el('p', {
            className: 'muted small',
            text:
              keySource === 'shared'
                ? 'Shared-provider warning: this build injects a provider key so every browser on the network can use it. Anyone who can load the page can extract the key. Use only on a trusted network, prefer a scoped key, and do not deploy publicly with shared defaults enabled.'
                : 'BYOK warning: a browser-held API key is visible to any script on the same origin. Use a scoped key. Do not deploy publicly without revisiting key handling and content policy.',
          }),
          el('div', { className: 'row' }, [
            el('a', { className: 'btn btn-secondary', href: '#/stats', text: 'Reading stats' }),
            el('a', { className: 'btn btn-ghost', href: '#/words', text: 'Word list' }),
          ]),
        ]),
      ]),
    ]),
  );
}

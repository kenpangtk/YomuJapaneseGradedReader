import type { AppContext } from '../app';
import {
  clearAllData,
  clearApiKey,
  createExportBundle,
  getApiKey,
  importBundle,
  listGenerationLogs,
  saveProfile,
  saveSettings,
  setApiKey,
} from '../db';
import { baseNewWordCap, levelSummary } from '../lib/level';
import { downloadJson, parseImport } from '../lib/exportImport';
import { formatDateTime } from '../lib/date';
import { INTERESTS, INTEREST_LABELS } from '../content/levelLists';
import { testProviderConnection } from '../generation/pipeline';
import type { FuriganaMode, ProviderKind, StoryLength } from '../types';
import { FURIGANA_LABELS, STORY_LENGTH_LABELS } from '../types';
import { button, el } from '../ui/dom';
import { openModal } from '../ui/modal';
import { showError, showToast } from '../ui/toast';

const FURIGANA_MODES: FuriganaMode[] = ['off', 'always', 'hover', 'learn'];
const LENGTHS: StoryLength[] = ['short', 'medium', 'long'];
const BASE_LEVELS = Array.from({ length: 17 }, (_, index) => 1 + index * 0.25);

function levelOptions(current: number): number[] {
  const set = new Set<number>(BASE_LEVELS);
  set.add(Math.round(current * 1000) / 1000);
  return [...set].sort((left, right) => left - right);
}

export async function renderSettings(root: HTMLElement, context: AppContext): Promise<void> {
  const settings = context.settings;
  const profile = context.profile;
  const recentLogs = await listGenerationLogs(4);
  const savedKey = getApiKey();
  let level = profile.level;
  let furigana = settings.furiganaDefault;
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
    const key = getApiKey();
    providerStatus.textContent =
      provider === 'mock'
        ? 'Active provider: Offline mock. New stories will not use the network.'
        : `Active provider: ${model.trim() || 'no model set'} @ ${baseUrl.trim() || 'no base URL'} · ${key ? 'API key stored' : 'no API key stored'}`;
  };

  const savePreferences = async (): Promise<void> => {
    const levelChanged = Math.abs(level - profile.level) > 0.0001;
    const nextProfile = {
      ...profile,
      level,
      furiganaMode: furigana,
      translationsDefault: translations,
      storyLength,
      interests,
      hardness: levelChanged ? 0 : profile.hardness,
      consecutiveHard: levelChanged ? 0 : profile.consecutiveHard,
      consecutiveEasy: levelChanged ? 0 : profile.consecutiveEasy,
      newWordCap: levelChanged ? baseNewWordCap(level) : profile.newWordCap,
      updatedAt: Date.now(),
    };
    await saveProfile(nextProfile);
    const nextSettings = {
      ...settings,
      furiganaDefault: furigana,
      translationsDefault: translations,
      textSize,
      updatedAt: Date.now(),
    };
    await saveSettings(nextSettings);
    context.profile = nextProfile;
    context.settings = nextSettings;
    document.documentElement.style.setProperty('--reader-scale', String(textSize / 100));
    showToast(levelChanged ? `Level set to ${levelSummary(level)}. Adaptation history reset.` : 'Reading preferences saved.');
  };

  const saveProvider = async (notify = true, clearKeyInput = true): Promise<boolean> => {
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
    placeholder: savedKey ? '•••••••• saved locally' : 'sk-…',
    'aria-label': 'Provider API key',
    on: {
      input: (event) => {
        newKey = (event.target as HTMLInputElement).value;
        if (newKey.trim()) setApiKey(newKey.trim());
        void persistProviderDraft();
      },
    },
  });

  const levelSelect = el('select', {
    className: 'select',
    'aria-label': 'Reading level',
    on: {
      change: (event) => {
        level = Number((event.target as HTMLSelectElement).value);
        levelReadout.textContent = `${levelSummary(level)} · ${level.toFixed(2)}`;
      },
    },
  }, levelOptions(profile.level).map((value) =>
    el('option', { value: String(value), selected: Math.abs(value - level) < 0.001 }, `${levelSummary(value)} · ${value.toFixed(2)}`),
  ));
  const levelReadout = el('span', { className: 'badge badge-outline', text: `${levelSummary(level)} · ${level.toFixed(2)}` });

  const furiganaButtons = FURIGANA_MODES.map((mode) =>
    el('button', {
      type: 'button',
      'aria-pressed': furigana === mode,
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
      },
    },
  }, LENGTHS.map((choice) => el('option', { value: choice, selected: choice === storyLength }, STORY_LENGTH_LABELS[choice])));

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
                keyInput.placeholder = 'sk-…';
                showToast('API key removed from this browser.');
              },
            })
          : null,
      ]),
      el('span', { className: 'hint', text: savedKey ? 'A key is saved in localStorage. It is never shown in full, exported, or logged.' : 'Stored in localStorage only. Never exported or logged.' }),
    ]),
    el('div', { className: 'notice notice-warn' }, [
      el('span', { 'aria-hidden': 'true', text: '!' }),
      el('span', { text: 'Browser-held keys are visible to any script on this origin. Use a scoped key and avoid untrusted scripts. The endpoint must allow browser CORS for POST /chat/completions; a provider that cannot allow CORS needs a thin proxy. A proxy is also required before public distribution.' }),
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
              el('p', { text: 'Review what will be merged. Newer feedback wins; words are deduplicated by dictionary form and reading; stories are deduplicated by ID.' }),
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
        el('a', { href: '#reading', text: 'Reading' }),
        el('a', { href: '#provider', text: 'Provider' }),
        el('a', { href: '#data', text: 'Data' }),
        el('a', { href: '#about', text: 'About' }),
      ]),
      el('div', {}, [
        el('section', { id: 'reading', className: 'settings-section card' }, [
          el('h2', { text: 'Reading' }),
          el('div', { className: 'stack' }, [
            el('div', { className: 'field-row' }, [
              el('div', { className: 'field' }, [
                el('label', { text: 'Current level' }),
                el('div', { className: 'row' }, [levelSelect, levelReadout]),
                el('span', { className: 'hint', text: 'Manual changes reset the adaptation moving average, not word schedules.' }),
              ]),
              el('div', { className: 'field' }, [
                el('label', { text: 'Preferred story length' }),
                lengthSelect,
              ]),
            ]),
            el('div', { className: 'field' }, [
              el('label', { text: 'Furigana default' }),
              el('div', { className: 'segmented', role: 'group', 'aria-label': 'Furigana default' }, furiganaButtons),
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
          el('p', { className: 'muted small', text: 'Yomu is a local-first MVP for adaptive Japanese graded reading. Tokenization uses kuromoji.js in a Web Worker. Furigana is generated from tokenizer readings. Stories are validated for length, token alignment, coverage, kanji, review words, and duplication before display.' }),
          el('p', { className: 'muted small', text: 'BYOK warning: a browser-held API key is visible to any script on the same origin. Use a scoped key. Do not deploy publicly without revisiting key handling and content policy.' }),
          el('div', { className: 'row' }, [
            el('a', { className: 'btn btn-secondary', href: '#/stats', text: 'Reading stats' }),
            el('a', { className: 'btn btn-ghost', href: '#/words', text: 'Word list' }),
          ]),
        ]),
      ]),
    ]),
  );
}

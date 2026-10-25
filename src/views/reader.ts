import type { AppContext } from '../app';
import {
  addEvent,
  addWord,
  deleteWord,
  getStory,
  listWords,
  patchProfile,
  saveSettings,
  updateStory,
} from '../db';
import { buildWordLookup, lookupTrackedWord, wordKey } from '../lib/coverage';
import { levelSummary } from '../lib/level';
import { levelSystemLabel, pronunciationLabel, readingFieldLabel } from '../lib/languageDefaults';
import { alignSentence } from '../lib/alignment';
import { lookupGlossFor } from '../content/glossary';
import { tokenizeSentences } from '../tokenizer/client';
import type { ContractSentence } from '../generation/contract';
import type { FuriganaMode, PhraseSpan, ReaderSentence, ReaderToken, Story, Word } from '../types';
import { FURIGANA_LABELS } from '../types';
import { button, el } from '../ui/dom';
import { runGeneration } from '../ui/generation';
import { showToast } from '../ui/toast';

interface TokenInfo {
  element: HTMLElement;
  token: ReaderToken;
  sentence: ReaderSentence;
  sentenceIndex: number;
  tokenIndex: number;
}

interface TranslationInfo {
  element: HTMLElement;
  button: HTMLButtonElement;
  shown: boolean;
}

const FURIGANA_CYCLE: FuriganaMode[] = ['off', 'always', 'hover', 'click', 'learn'];

function readingMinutes(story: Story): number {
  const rate = story.level < 2 ? 170 : story.level < 3 ? 250 : story.level < 4 ? 330 : 400;
  return Math.max(1, Math.round(story.charCount / rate));
}

function renderSegments(token: ReaderToken): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const segment of token.furigana) {
    if (!segment.ruby) {
      fragment.append(document.createTextNode(segment.text));
      continue;
    }
    const ruby = document.createElement('ruby');
    ruby.append(document.createTextNode(segment.text));
    const rt = document.createElement('rt');
    rt.textContent = segment.ruby;
    rt.setAttribute('aria-hidden', 'true');
    ruby.append(rt);
    fragment.append(ruby);
  }
  return fragment;
}

function phraseFor(sentence: ReaderSentence, tokenIndex: number): PhraseSpan | undefined {
  return sentence.phrases.find((phrase) => tokenIndex >= phrase.start && tokenIndex < phrase.end);
}

export async function renderReader(root: HTMLElement, context: AppContext, storyId: string): Promise<void> {
  const loadedStory = await getStory(storyId);
  if (!loadedStory) {
    root.append(
      el('div', { className: 'reader-shell' }, [
        el('main', { className: 'reader-main' }, [
          el('div', { className: 'empty-state' }, [
            el('div', { className: 'empty-state-mark', text: '?' }),
            el('h1', { text: 'Story not found' }),
            el('a', { className: 'btn btn-primary', href: '#/home', text: 'Back to library' }),
          ]),
        ]),
      ]),
    );
    return;
  }
  const story: Story = loadedStory;
  const language = story.language;
  const pronunciation = pronunciationLabel(language);
  const readingLabel = readingFieldLabel(language);
  const levelSystem = levelSystemLabel(language);
  const htmlLang = language === 'zh' ? 'zh-CN' : 'ja';
  const titleLookup = (surface: string, dictionary: string, reading: string) =>
    lookupGlossFor(language, surface, dictionary, reading);
  const levelTagLabel = (tag: number | null): string => {
    if (!tag) return `${levelSystem} —`;
    return language === 'zh' ? `${levelSystem} ${tag}` : `N${tag}`;
  };
  const words = await listWords(language);
  const trackedMap = buildWordLookup(words);
  const allTokenInfos: TokenInfo[] = [];
  const translationInfos: TranslationInfo[] = [];
  let mode: FuriganaMode = context.profile.furiganaMode;
  let textSize = context.settings.textSize;
  let rovingElement: HTMLElement | null = null;
  let dirty = false;
  let saveTimer = 0;
  let currentInfo: TokenInfo | null = null;
  let currentPinned = false;
  let hoverTimer = 0;
  let closeTimer = 0;
  let closedByRoute = false;

  const shell = el('div', { className: 'reader-shell' });
  const main = el('main', { id: 'main', className: 'reader-main' });
  const progressFill = el('span');
  const furiganaButton = el('button', {
    type: 'button',
    className: 'reader-tool',
    'aria-label': `${pronunciation}: ${FURIGANA_LABELS[mode]}. Press F to cycle.`,
    title: `${pronunciation}: ${FURIGANA_LABELS[mode]} (F)`,
  });
  const translationButton = el('button', {
    type: 'button',
    className: 'reader-tool',
    'aria-label': 'Toggle all sentence translations. Press T.',
    title: 'Toggle translations (T)',
    'aria-pressed': 'false',
  }, [el('span', { text: 'T · ' }), el('span', { className: 'reader-tool-label', text: language === 'zh' ? '译' : '訳' })]);
  const textSizeValueLabel = el('span', { className: 'reader-tool-label', text: `${textSize}%` });
  const textSizeButton = el('button', {
    type: 'button',
    className: 'reader-tool',
    'aria-label': `Text size: ${textSize}%. Adjust reading text size.`,
    title: 'Adjust text size',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
  }, [el('span', { className: 'tool-size', text: 'Aa' }), textSizeValueLabel]);
  const finishButton = el('button', {
    type: 'button',
    className: 'reader-tool reader-finish',
    'aria-label': 'Finish story and open feedback',
  }, [el('span', { 'aria-hidden': 'true', text: '✓' }), el('span', { className: 'reader-tool-label', text: 'Finish' })]);

  const header = el('header', { className: 'reader-header' }, [
    el('div', { className: 'reader-header-inner' }, [
      el('a', { className: 'reader-back', href: '#/home', 'aria-label': 'Back to library' }, [
        el('span', { 'aria-hidden': 'true', text: '←' }),
        el('span', { text: 'Library' }),
      ]),
      el('span', { className: 'reader-level', text: `${levelSummary(story.level, language)} · ${story.charCount} chars` }),
      el('div', { className: 'reader-toolbar' }, [
        furiganaButton,
        translationButton,
        textSizeButton,
        el('a', { className: 'reader-tool', href: '#/words', 'aria-label': 'Open word list' }, [
          el('span', { 'aria-hidden': 'true', className: 'tool-kanji', text: '語' }),
          el('span', { className: 'reader-tool-label', text: 'Words' }),
        ]),
        el('a', { className: 'reader-tool', href: '#/settings', 'aria-label': 'Open settings' }, [
          el('span', { 'aria-hidden': 'true', className: 'tool-kanji', text: '設' }),
          el('span', { className: 'reader-tool-label', text: 'Settings' }),
        ]),
        finishButton,
      ]),
    ]),
    el('div', { className: 'reader-progress', 'aria-hidden': 'true' }, [progressFill]),
  ]);

  const storyText = el('div', { className: `story-text furigana-${mode}`, lang: htmlLang, 'aria-label': story.titleJa });
  const providerNotice =
    story.generationMeta.provider === 'mock' && context.settings.provider === 'openai'
      ? el('div', { className: 'notice reader-notice' }, [
          el('span', { 'aria-hidden': 'true', text: 'i' }),
          el('span', {}, [
            el('strong', { text: 'This saved story used the offline mock. ' }),
            'Your current provider is OpenAI-compatible. Use ',
            el('strong', { text: 'Regenerate' }),
            ' or ',
            el('a', { href: '#/home', text: 'Read next' }),
            ' to generate a live story.',
          ]),
        ])
      : null;
  const fallbackReasons =
    story.generationMeta.validation?.errors?.length
      ? story.generationMeta.validation.errors
      : story.generationMeta.repairNotes;
  const fallbackNotice = story.isFallback
    ? el('div', { className: 'notice notice-warn reader-notice' }, [
        el('span', { 'aria-hidden': 'true', text: '!' }),
        el('span', {}, [
          el('strong', { text: 'Offline story. ' }),
          'The provider text did not pass validation, so a bundled fallback story is shown. Review-word personalization may be absent.',
        ]),
        ...(fallbackReasons.length
          ? [
              el('details', { className: 'fallback-details' }, [
                el('summary', { text: 'Why generation fell back' }),
                el('ul', {}, fallbackReasons.slice(0, 10).map((reason) => el('li', { text: reason }))),
                el('div', { className: 'row', style: { marginTop: '0.55rem' } }, [
                  button('Copy reasons', {
                    variant: 'quiet',
                    onClick: () => {
                      void navigator.clipboard
                        .writeText(fallbackReasons.join('\n'))
                        .then(() => showToast('Validation reasons copied.'))
                        .catch(() => showToast('Could not copy to the clipboard.'));
                    },
                  }),
                  el('span', { className: 'hint' }, [
                    'Details are also in ',
                    el('a', { href: '#/settings', text: 'Settings → Story provider' }),
                    '.',
                  ]),
                ]),
              ]),
            ]
          : []),
      ])
    : story.generationMeta.provider === 'mock'
      ? el('div', { className: 'notice notice-moss reader-notice' }, [
          el('span', { 'aria-hidden': 'true', text: '✓' }),
          el('span', {}, [
            el('strong', { text: 'Offline mock story. ' }),
            'Reading, word tracking, feedback, and adaptation work normally without a provider key.',
          ]),
        ])
      : null;

  const transcript: HTMLElement[] = [];
  for (let start = 0; start < story.sentences.length; start += 3) {
    const paragraph = el('p', { className: 'story-paragraph' });
    const group = story.sentences.slice(start, start + 3);
    group.forEach((sentence, offset) => {
      const sentenceIndex = start + offset;
      const sentenceEl = el('span', { className: 'sentence' });
      const translation = el('span', { className: 'sentence-translation', hidden: true });
      translation.textContent = sentence.translationEn || 'Translation unavailable.';
      const translateButton = el('button', {
        type: 'button',
        className: 'sentence-translate',
        'aria-label': `Show sentence translation ${sentenceIndex + 1}`,
        text: language === 'zh' ? '译' : '訳',
      });
      sentence.tokens.forEach((token, tokenIndex) => {
        const tracked = lookupTrackedWord(token, trackedMap);
        const forceFurigana = Boolean(tracked && tracked.state === 'learning' && tracked.exposures === 0);
        const classes = ['token'];
        if (tracked?.state === 'learning') classes.push('is-learning');
        if (tracked?.state === 'known') classes.push('is-known');
        if (forceFurigana) classes.push('force-furigana');
        const tokenEl = el('span', {
          className: classes.join(' '),
          role: 'button',
          tabindex: allTokenInfos.length === 0 ? '0' : '-1',
          'aria-label': `${token.surface}${token.reading && token.reading !== token.surface ? `, ${token.reading}` : ''}, ${token.gloss}`,
          'aria-haspopup': 'dialog',
        });
        tokenEl.append(renderSegments(token));
        const info: TokenInfo = { element: tokenEl, token, sentence, sentenceIndex, tokenIndex };
        allTokenInfos.push(info);
        sentenceEl.append(tokenEl);
      });
      const translationInfo: TranslationInfo = { element: translation, button: translateButton, shown: false };
      translationInfos.push(translationInfo);
      translateButton.addEventListener('click', () => {
        toggleTranslation(sentenceIndex, true);
      });
      const tools = el('span', { className: 'sentence-tools', 'aria-hidden': 'false' }, [translateButton]);
      const lastToken = sentenceEl.lastElementChild;
      if (lastToken) {
        sentenceEl.append(el('span', { className: 'sentence-end' }, [lastToken, tools]));
      } else {
        sentenceEl.append(tools);
      }
      sentenceEl.append(translation);
      paragraph.append(sentenceEl);
    });
    storyText.append(paragraph);
    transcript.push(paragraph);
  }
  if (allTokenInfos[0]) rovingElement = allTokenInfos[0].element;

  const resumeBanner = el('div', { className: 'resume-banner', hidden: true }, [
    el('span', { id: 'resume-text' }),
    el('div', { className: 'row', style: { gap: '0.4rem' } }, [
      button('Resume', {
        variant: 'quiet',
        onClick: () => {
          const progress = story.progress;
          resumeBanner.hidden = true;
          requestAnimationFrame(() => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            window.scrollTo({ top: Math.max(0, max * progress), behavior: 'smooth' });
          });
        },
      }),
      button('Start over', {
        variant: 'quiet',
        onClick: () => {
          story.progress = 0;
          resumeBanner.hidden = true;
          window.scrollTo({ top: 0, behavior: 'smooth' });
          void updateStory(story.id, { progress: 0, readState: story.readState === 'finished' ? 'finished' : 'reading' });
        },
      }),
    ]),
  ]);
  const resumeLabel = resumeBanner.querySelector<HTMLElement>('#resume-text');
  if (resumeLabel) {
    resumeLabel.textContent = `You left off ${Math.round(story.progress * 100)}% through this story.`;
  }
  if (story.progress > 0.04 && story.readState !== 'finished') resumeBanner.hidden = false;

  const reportStory = () => {
    void addEvent('report', story.id, null);
    showToast('Story report saved locally for diagnostics.');
  };

  const end = el('div', { className: 'reader-end' }, [
    el('div', { className: 'eyebrow', text: 'End of story' }),
    el('p', { className: 'story-meta-line', text: `${story.charCount.toLocaleString()} characters · about ${readingMinutes(story)} min` }),
    el('h2', { text: 'Finished reading?' }),
    el('p', { text: 'Rate your experience and check the tracked words that appeared. This is what adapts the next story.' }),
    el('div', { className: 'reader-footer-actions' }, [
      el('button', {
        type: 'button',
        className: 'btn btn-primary',
        text: story.feedbackSubmitted ? 'View feedback' : 'Finish story',
        on: { click: () => { void finish(); } },
      }),
      button('New story', {
        variant: 'secondary',
        onClick: () => runGeneration(context, { topic: story.topic, length: context.profile.storyLength }),
      }),
      button('Report story', {
        variant: 'ghost',
        onClick: reportStory,
      }),
    ]),
  ]);

  const titleHost = el('h1', { className: `reader-title furigana-${mode}`, lang: htmlLang, 'aria-label': story.titleJa });
  titleHost.textContent = story.titleJa;

  main.append(
    el('div', { className: 'reader-kicker' }, [
      el('span', { text: story.topic }),
      el('span', { className: 'badge badge-outline', text: story.isFallback ? 'Offline fallback' : 'Saved locally' }),
    ]),
    titleHost,
    ...(story.titleEn ? [el('div', { className: 'reader-subtitle', text: story.titleEn })] : []),
    el('div', { className: 'reader-meta' }, [
      el('span', { text: `${readingMinutes(story)} min read` }),
      el('span', { className: 'dot', text: `${story.charCount} characters` }),
      el('span', { className: 'dot', text: `${allTokenInfos.length} tokens` }),
      el('span', { className: 'dot' }, [
        el('button', {
          type: 'button',
          className: 'btn btn-ghost',
          text: 'Regenerate',
          style: { minHeight: '28px', padding: '0 0.35rem', fontSize: '0.74rem' },
          on: { click: () => runGeneration(context, { topic: story.topic, length: context.profile.storyLength }) },
        }),
      ]),
      el('span', { className: 'dot' }, [
        el('button', {
          type: 'button',
          className: 'btn btn-ghost',
          text: 'Report',
          style: { minHeight: '28px', padding: '0 0.35rem', fontSize: '0.74rem' },
          on: { click: reportStory },
        }),
      ]),
    ]),
    ...(providerNotice ? [providerNotice] : []),
    ...(fallbackNotice ? [fallbackNotice] : []),
    ...(story.feedbackSubmitted
      ? [
          el('div', { className: 'notice notice-moss reader-notice' }, [
            el('span', { text: 'Feedback for this story is saved. ' }),
            el('a', { href: `#/feedback/${story.id}`, text: 'View it' }),
          ]),
        ]
      : []),
    resumeBanner,
    storyText,
    end,
    el('p', { className: 'reader-tip' }, [
      el('span', { className: 'kbd', text: 'F' }),
      ` ${pronunciation.toLowerCase()} · `,
      el('span', { className: 'kbd', text: 'T' }),
      ' translations · ',
      el('span', { className: 'kbd', text: 'Enter' }),
      ' word details · ',
      el('span', { className: 'kbd', text: 'A' }),
      ' add word · ',
      el('span', { className: 'kbd', text: 'Esc' }),
      ' close',
    ]),
  );

  shell.append(header, main);
  root.replaceChildren(shell);
  applyFurigana(mode, false);
  void hydrateTitle(titleHost);

  // Translation state
  function toggleTranslation(index: number, userAction: boolean): void {
    const info = translationInfos[index];
    if (!info) return;
    info.shown = !info.shown;
    info.element.hidden = !info.shown;
    info.button.setAttribute('aria-pressed', String(info.shown));
    info.button.setAttribute('aria-label', info.shown ? 'Hide sentence translation' : 'Show sentence translation');
    if (info.shown && userAction) {
      story.translationReveals += 1;
      dirty = true;
      scheduleSave();
      void addEvent('translation', story.id, null);
    }
    updateTranslationButton();
  }

  function updateTranslationButton(): void {
    const anyShown = translationInfos.some((info) => info.shown);
    translationButton.setAttribute('aria-pressed', String(anyShown));
  }

  function showAllTranslations(countReveals: boolean): void {
    for (let index = 0; index < translationInfos.length; index += 1) {
      const info = translationInfos[index];
      if (info.shown) continue;
      info.shown = true;
      info.element.hidden = false;
      info.button.setAttribute('aria-pressed', 'true');
      info.button.setAttribute('aria-label', 'Hide sentence translation');
      if (countReveals) {
        story.translationReveals += 1;
        void addEvent('translation', story.id, null);
      }
    }
    if (countReveals) {
      dirty = true;
      scheduleSave();
    }
    updateTranslationButton();
  }

  function hideAllTranslations(): void {
    for (const info of translationInfos) {
      info.shown = false;
      info.element.hidden = true;
      info.button.setAttribute('aria-pressed', 'false');
      info.button.setAttribute('aria-label', 'Show sentence translation');
    }
    updateTranslationButton();
  }

  if (context.profile.translationsDefault) {
    showAllTranslations(false);
  }

  // Furigana
  function applyFurigana(next: FuriganaMode, persist = true): void {
    mode = next;
    storyText.classList.remove('furigana-off', 'furigana-always', 'furigana-hover', 'furigana-click', 'furigana-learn');
    storyText.classList.add(`furigana-${mode}`);
    titleHost.classList.remove('furigana-off', 'furigana-always', 'furigana-hover', 'furigana-click', 'furigana-learn');
    titleHost.classList.add(`furigana-${mode}`);
    furiganaButton.replaceChildren(
      el('span', { text: 'F · ' }),
      el('span', {
        className: 'reader-tool-label',
        text:
          mode === 'off'
            ? 'Off'
            : mode === 'always'
              ? 'Always'
              : mode === 'hover'
                ? 'Hover'
                : mode === 'click'
                  ? 'Click'
                  : 'Learn',
      }),
    );
    furiganaButton.setAttribute('aria-label', `${pronunciation}: ${FURIGANA_LABELS[mode]}. Press F to cycle.`);
    furiganaButton.title = `${pronunciation}: ${FURIGANA_LABELS[mode]} (F)`;
    if (!persist) return;
    const nextProfile = { ...context.profile, furiganaMode: mode, updatedAt: Date.now() };
    context.profile = nextProfile;
    context.settings = { ...context.settings, furiganaDefault: mode, updatedAt: Date.now() };
    void patchProfile({ furiganaMode: mode });
    void saveSettings(context.settings);
  }

  function cycleFurigana(): void {
    const index = FURIGANA_CYCLE.indexOf(mode);
    applyFurigana(FURIGANA_CYCLE[(index + 1) % FURIGANA_CYCLE.length]);
  }

  function toggleAllTranslations(): void {
    const anyHidden = translationInfos.some((info) => !info.shown);
    if (anyHidden) showAllTranslations(true);
    else hideAllTranslations();
    const defaultShown = translationInfos.some((info) => info.shown);
    context.profile = { ...context.profile, translationsDefault: defaultShown, updatedAt: Date.now() };
    context.settings = { ...context.settings, translationsDefault: defaultShown, updatedAt: Date.now() };
    void patchProfile({ translationsDefault: defaultShown });
    void saveSettings(context.settings);
  }

  furiganaButton.addEventListener('click', cycleFurigana);
  translationButton.addEventListener('click', toggleAllTranslations);

  // Token helpers
  function trackWordClassUpdates(): void {
    for (const info of allTokenInfos) {
      const tracked = lookupTrackedWord(info.token, trackedMap);
      info.element.classList.toggle('is-learning', tracked?.state === 'learning');
      info.element.classList.toggle('is-known', tracked?.state === 'known');
    }
  }

  function removeWordFromMap(word: Word, surface: string): void {
    for (const key of [wordKey(word.dictionary, word.reading), `surface:${surface}`]) {
      if (trackedMap.get(key)?.id === word.id) trackedMap.delete(key);
    }
  }

  function addToTrackedMap(word: Word, surface: string): void {
    trackedMap.set(wordKey(word.dictionary, word.reading), word);
    trackedMap.set(`surface:${surface}`, word);
  }

  async function addForInfo(info: TokenInfo): Promise<void> {
    if (info.token.pos === 'symbol') {
      showToast('Punctuation cannot be added to the word list.');
      return;
    }
    const existing = lookupTrackedWord(info.token, trackedMap);
    if (existing) {
      showToast(`${info.token.dictionary} is already on your list.`);
      updatePopoverAddState(existing);
      return;
    }
    const result = await addWord({
      language,
      dictionary: info.token.dictionary,
      reading: info.token.reading,
      surface: info.token.surface,
      gloss: info.token.gloss,
      pos: info.token.pos,
      jlpt: info.token.jlpt,
      sourceStoryId: story.id,
      sourceSentence: info.sentence.text,
      level: story.level,
    });
    addToTrackedMap(result.word, info.token.surface);
    trackWordClassUpdates();
    updatePopoverAddState(result.word);
    if (!result.added) {
      showToast(`${result.word.dictionary} is already on your list.`);
      return;
    }
    void addEvent('add', story.id, result.word.id);
    showToast(`Added ${result.word.dictionary} to your words.`, {
      label: 'Undo',
      onClick: () => {
        void deleteWord(result.word.id).then(() => {
          removeWordFromMap(result.word, info.token.surface);
          trackWordClassUpdates();
          showToast(`Removed ${result.word.dictionary}.`);
        });
      },
    });
  }

  async function hydrateTitle(host: HTMLElement): Promise<void> {
    try {
      const [raw] = await tokenizeSentences([story.titleJa], language);
      if (!raw || raw.tokens.length === 0 || !host.isConnected || closedByRoute) return;

      const titleContract: ContractSentence = {
        text: story.titleJa,
        translation_en: story.titleEn,
        tokens: [],
        phrases: [],
      };
      const baseSentence = alignSentence(titleContract, raw, titleLookup, language);
      const glossByKey = new Map<string, { gloss: string; jlpt: number | null }>();
      for (const sentence of story.sentences) {
        for (const token of sentence.tokens) {
          if (!token.gloss || token.gloss === 'No gloss available') continue;
          const key = `${token.dictionary}|${token.reading}`;
          if (!glossByKey.has(key)) glossByKey.set(key, { gloss: token.gloss, jlpt: token.jlpt });
        }
      }

      const titleSentence: ReaderSentence = {
        ...baseSentence,
        tokens: baseSentence.tokens.map((token) => {
          const hit = glossByKey.get(`${token.dictionary}|${token.reading}`);
          return hit ? { ...token, gloss: hit.gloss, jlpt: token.jlpt ?? hit.jlpt } : token;
        }),
      };

      const infos: TokenInfo[] = [];
      const elements: HTMLElement[] = titleSentence.tokens.map((token, tokenIndex) => {
        const tracked = lookupTrackedWord(token, trackedMap);
        const forceFurigana = Boolean(tracked && tracked.state === 'learning' && tracked.exposures === 0);
        const classes = ['token'];
        if (tracked?.state === 'learning') classes.push('is-learning');
        if (tracked?.state === 'known') classes.push('is-known');
        if (forceFurigana) classes.push('force-furigana');
        const tokenEl = el('span', {
          className: classes.join(' '),
          role: 'button',
          tabindex: '-1',
          'aria-label': `${token.surface}${token.reading && token.reading !== token.surface ? `, ${token.reading}` : ''}, ${token.gloss}`,
          'aria-haspopup': 'dialog',
        });
        tokenEl.append(renderSegments(token));
        infos.push({ element: tokenEl, token, sentence: titleSentence, sentenceIndex: -1, tokenIndex });
        return tokenEl;
      });

      host.replaceChildren(...elements);
      allTokenInfos.unshift(...infos);
      if (
        infos[0] &&
        !(document.activeElement instanceof HTMLElement && document.activeElement.classList.contains('token'))
      ) {
        setRoving(infos[0].element);
      }
    } catch {
      // Keep the plain title when the tokenizer is unavailable.
    }
  }

  function updatePopoverAddState(word: Word | undefined): void {
    if (!popover) return;
    const add = popover.querySelector<HTMLButtonElement>('.popover-add');
    if (!add) return;
    if (word) {
      add.disabled = true;
      add.textContent = word.state === 'known' ? 'Known word' : 'Added';
    } else {
      add.disabled = false;
      add.textContent = '+ Add to word list';
    }
    const stateHost = popover.querySelector<HTMLElement>('.popover-state');
    if (stateHost) {
      stateHost.textContent = word ? (word.state === 'known' ? 'Known' : word.state === 'suspended' ? 'Suspended' : 'Learning') : 'Not tracked';
      stateHost.className = `badge ${word ? (word.state === 'known' ? 'badge-moss' : word.state === 'suspended' ? '' : 'badge-accent') : 'badge-outline'}`;
    }
  }

  // Popover
  const popover = el('div', {
    className: 'token-popover',
    role: 'dialog',
    'aria-label': 'Word details',
    hidden: true,
  });
  document.body.append(popover);
  let popoverHovered = false;

  // Text-size control in the reader toolbar.
  const sizeValue = el('output', {
    className: 'badge badge-outline',
    'aria-live': 'polite',
    text: `${textSize}%`,
  });
  const sizeRange = el('input', {
    type: 'range',
    className: 'text-size-range',
    min: '90',
    max: '140',
    step: '5',
    value: String(textSize),
    'aria-label': 'Reader text size',
  });
  const sizeMinus = el('button', {
    type: 'button',
    className: 'btn btn-quiet text-size-step',
    'aria-label': 'Decrease text size',
    text: 'A−',
  });
  const sizePlus = el('button', {
    type: 'button',
    className: 'btn btn-quiet text-size-step',
    'aria-label': 'Increase text size',
    text: 'A+',
  });
  const textSizePopover = el('div', {
    className: 'text-size-popover',
    role: 'dialog',
    'aria-label': 'Text size',
    hidden: true,
  }, [
    el('div', { className: 'text-size-head' }, [
      el('strong', { text: 'Text size' }),
      el('button', {
        type: 'button',
        className: 'popover-close',
        'aria-label': 'Close text-size controls',
        text: '×',
      }),
    ]),
    el('div', { className: 'text-size-controls' }, [sizeMinus, sizeRange, sizePlus]),
    el('div', { className: 'row-between small muted', style: { marginTop: '0.55rem' } }, [
      el('span', { text: 'Smaller' }),
      sizeValue,
      el('span', { text: 'Larger' }),
    ]),
  ]);
  document.body.append(textSizePopover);

  function applyTextSize(value: number, persist = true): void {
    textSize = Math.min(140, Math.max(90, Math.round(value / 5) * 5));
    document.documentElement.style.setProperty('--reader-scale', String(textSize / 100));
    sizeRange.value = String(textSize);
    sizeValue.textContent = `${textSize}%`;
    textSizeValueLabel.textContent = `${textSize}%`;
    textSizeButton.setAttribute('aria-label', `Text size: ${textSize}%. Adjust reading text size.`);
    textSizeButton.title = `Adjust text size (${textSize}%)`;
    sizeMinus.disabled = textSize <= 90;
    sizePlus.disabled = textSize >= 140;
    if (!persist) return;
    context.settings = { ...context.settings, textSize, updatedAt: Date.now() };
    void saveSettings(context.settings);
  }

  function positionTextSizePopover(): void {
    const rect = textSizeButton.getBoundingClientRect();
    const width = textSizePopover.offsetWidth;
    const height = textSizePopover.offsetHeight;
    const margin = 10;
    const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - height - 8);
    }
    textSizePopover.style.left = `${Math.round(left)}px`;
    textSizePopover.style.top = `${Math.round(top)}px`;
  }

  function closeTextSizePopover(restoreFocus = false): void {
    if (textSizePopover.hidden) return;
    textSizePopover.hidden = true;
    textSizeButton.setAttribute('aria-expanded', 'false');
    if (restoreFocus) textSizeButton.focus();
  }

  function openTextSizePopover(): void {
    textSizePopover.hidden = false;
    textSizeButton.setAttribute('aria-expanded', 'true');
    positionTextSizePopover();
    requestAnimationFrame(() => sizeRange.focus());
  }

  textSizeButton.addEventListener('click', () => {
    if (textSizePopover.hidden) openTextSizePopover();
    else closeTextSizePopover(true);
  });
  textSizePopover.querySelector('.popover-close')?.addEventListener('click', () => closeTextSizePopover(true));
  sizeMinus.addEventListener('click', () => applyTextSize(textSize - 5));
  sizePlus.addEventListener('click', () => applyTextSize(textSize + 5));
  sizeRange.addEventListener('input', () => applyTextSize(Number(sizeRange.value)));
  applyTextSize(textSize, false);

  const closeTextSizeOnOutside = (event: Event): void => {
    if (textSizePopover.hidden) return;
    const target = event.target as Node;
    if (textSizePopover.contains(target) || textSizeButton.contains(target)) return;
    closeTextSizePopover(false);
  };
  document.addEventListener('pointerdown', closeTextSizeOnOutside);

  function positionPopover(info: TokenInfo): void {
    const rect = info.element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewLeft = viewport?.offsetLeft ?? 0;
    const viewTop = viewport?.offsetTop ?? 0;
    const viewWidth = viewport?.width ?? window.innerWidth;
    const viewHeight = viewport?.height ?? window.innerHeight;
    const margin = 10;
    const maxWidth = Math.max(180, viewWidth - margin * 2);
    popover.style.width = `${Math.min(380, maxWidth)}px`;
    popover.style.maxWidth = `${maxWidth}px`;
    popover.style.maxHeight = `${Math.max(96, Math.min(560, viewHeight - margin * 2))}px`;

    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(viewLeft + margin, Math.min(left, viewLeft + viewWidth - width - margin));

    const bottomLimit = viewTop + viewHeight - margin;
    let top = rect.bottom + 8;
    if (top + height > bottomLimit) {
      const above = rect.top - height - 8;
      top = above >= viewTop + margin ? above : Math.max(viewTop + margin, bottomLimit - height);
    }

    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }

  function openPopover(info: TokenInfo, pinned: boolean, focusPopover = false): void {
    clearTimeout(hoverTimer);
    clearTimeout(closeTimer);
    const countedLookup = currentInfo?.element === info.element && !popover.hidden;
    if (currentInfo?.element !== info.element) {
      currentInfo?.element.classList.remove('popover-open');
    }
    currentInfo = info;
    currentPinned = pinned;
    info.element.classList.add('popover-open');
    const tracked = lookupTrackedWord(info.token, trackedMap);
    if (!countedLookup) {
      story.lookupCount += 1;
      dirty = true;
      scheduleSave();
      void addEvent('lookup', story.id, tracked?.id ?? null);
    }
    const phrase = phraseFor(info.sentence, info.tokenIndex);
    const gloss = info.token.gloss || 'No gloss available';
    const meta = el('div', { className: 'popover-meta' }, [
      el('span', { className: 'badge badge-outline', text: levelTagLabel(info.token.jlpt) }),
      el('span', { className: `badge ${tracked ? (tracked.state === 'known' ? 'badge-moss' : tracked.state === 'suspended' ? '' : 'badge-accent') : 'badge-outline'} popover-state`, text: tracked ? (tracked.state === 'known' ? 'Known' : tracked.state === 'suspended' ? 'Suspended' : 'Learning') : 'Not tracked' }),
      tracked?.firstStoryPending ? el('span', { className: 'badge badge-gold', text: 'Next story' }) : null,
      tracked?.aboveLevel ? el('span', { className: 'badge badge-gold', text: 'Above level' }) : null,
    ]);
    const add = el('button', {
      type: 'button',
      className: 'btn btn-primary popover-add',
      text: tracked ? (tracked.state === 'known' ? 'Known word' : 'Added') : '+ Add to word list',
      disabled: Boolean(tracked),
    });
    add.addEventListener('click', () => { void addForInfo(info); });
    const report = el('button', {
      type: 'button',
      className: 'popover-report',
      text: 'Report gloss',
      on: {
        click: () => {
          void addEvent('report', story.id, tracked?.id ?? null);
          showToast('Gloss report saved locally.');
        },
      },
    });
    const content = el('div', {}, [
      el('div', { className: 'popover-head' }, [
        el('div', { className: 'popover-surface' }, [
          el('strong', { text: info.token.surface }),
          el('span', {
            className: 'popover-reading',
            title: readingLabel,
            'aria-label': `${readingLabel}: ${info.token.reading || '—'}`,
            text: info.token.reading || '—',
          }),
        ]),
        el('button', {
          type: 'button',
          className: 'popover-close',
          'aria-label': 'Close word details',
          text: '×',
          on: { click: () => closePopover(true) },
        }),
      ]),
      el('div', { className: 'popover-dict', text: `${info.token.dictionary} · ${info.token.pos}${info.token.properNoun ? ' · proper noun' : ''}` }),
      el('div', { className: 'popover-gloss', text: gloss }),
      meta,
      phrase
        ? el('div', { className: 'popover-phrase' }, [
            el('div', { className: 'popover-phrase-label', text: 'Phrase' }),
            el('div', { className: 'popover-phrase-text', text: phrase.source }),
            el('div', { className: 'popover-phrase-gloss', text: phrase.gloss || 'Phrase translation unavailable.' }),
          ])
        : null,
      (() => {
        const details = el('details', { className: 'popover-sentence' }, [
          el('summary', { text: 'Full sentence translation' }),
          el('p', { text: info.sentence.translationEn || 'Translation unavailable.' }),
        ]);
        details.addEventListener('toggle', () => {
          if (!details.open) return;
          story.translationReveals += 1;
          dirty = true;
          scheduleSave();
          void addEvent('translation', story.id, tracked?.id ?? null);
        });
        return details;
      })(),
      el('div', { className: 'popover-actions' }, [add, report]),
    ]);
    popover.replaceChildren(content);
    popover.hidden = false;
    positionPopover(info);
    if (focusPopover) {
      requestAnimationFrame(() => {
        popover.querySelector<HTMLElement>('.popover-close')?.focus();
      });
    }
  }

  function closePopover(restoreFocus = false): void {
    if (popover.hidden) return;
    clearTimeout(hoverTimer);
    clearTimeout(closeTimer);
    const info = currentInfo;
    popover.hidden = true;
    popover.replaceChildren();
    info?.element.classList.remove('popover-open');
    currentInfo = null;
    currentPinned = false;
    popoverHovered = false;
    if (restoreFocus && info) info.element.focus();
  }

  function setRoving(element: HTMLElement): void {
    if (rovingElement === element) return;
    if (rovingElement) rovingElement.setAttribute('tabindex', '-1');
    rovingElement = element;
    element.setAttribute('tabindex', '0');
  }

  function closeOnOutside(event: Event): void {
    if (popover.hidden) return;
    const target = event.target as Node;
    if (popover.contains(target)) return;
    if (target instanceof Element && target.closest('.token')) return;
    closePopover(false);
  }

  main.addEventListener('pointerover', (event) => {
    if (mode === 'click') return;
    const pointer = event as PointerEvent;
    if (pointer.pointerType && pointer.pointerType !== 'mouse') return;
    const target = (event.target as HTMLElement).closest<HTMLElement>('.token');
    if (!target) return;
    if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
    const info = allTokenInfos.find((item) => item.element === target);
    if (!info) return;
    clearTimeout(closeTimer);
    if (currentInfo?.element === target) return;
    if (currentPinned) return;
    clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => openPopover(info, false), 120);
  });

  main.addEventListener('pointerout', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('.token');
    if (!target) return;
    if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
    clearTimeout(hoverTimer);
    if (currentPinned || popoverHovered) return;
    clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => closePopover(false), 240);
  });

  main.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('.token');
    if (!target) return;
    const info = allTokenInfos.find((item) => item.element === target);
    if (!info) return;
    event.preventDefault();
    setRoving(target);
    target.focus({ preventScroll: true });
    if (currentInfo?.element === target && currentPinned) {
      closePopover(true);
      return;
    }
    openPopover(info, true);
  });

  popover.addEventListener('pointerenter', () => {
    popoverHovered = true;
    clearTimeout(closeTimer);
  });
  popover.addEventListener('pointerleave', () => {
    popoverHovered = false;
    if (currentPinned) return;
    clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => closePopover(false), 180);
  });

  document.addEventListener('pointerdown', closeOnOutside);

  // Keyboard navigation
  function focusedToken(): TokenInfo | undefined {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return undefined;
    return allTokenInfos.find((info) => info.element === active);
  }

  function moveFocus(info: TokenInfo, direction: 'left' | 'right' | 'sentence-up' | 'sentence-down'): void {
    let index = allTokenInfos.indexOf(info);
    if (direction === 'left') index -= 1;
    else if (direction === 'right') index += 1;
    else {
      const sentenceStep = direction === 'sentence-down' ? 1 : -1;
      const targetSentence = info.sentenceIndex + sentenceStep;
      const candidate = allTokenInfos.find(
        (item) => item.sentenceIndex === targetSentence && item.tokenIndex === info.tokenIndex,
      ) ?? allTokenInfos.find((item) => item.sentenceIndex === targetSentence);
      if (candidate) {
        closePopover(false);
        setRoving(candidate.element);
        candidate.element.focus();
        candidate.element.scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    const next = allTokenInfos[index];
    if (!next) return;
    closePopover(false);
    setRoving(next.element);
    next.element.focus();
    next.element.scrollIntoView({ block: 'nearest' });
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !textSizePopover.hidden) {
      event.preventDefault();
      closeTextSizePopover(true);
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement) {
      if (
        target.closest('input, select, textarea, [contenteditable="true"]') ||
        (target.tagName === 'BUTTON' && !target.classList.contains('token'))
      ) {
        if (event.key === 'Escape' && !popover.hidden) {
          event.preventDefault();
          closePopover(true);
        }
        return;
      }
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key;
    if (key === 'Escape') {
      if (!popover.hidden) {
        event.preventDefault();
        closePopover(true);
      }
      return;
    }
    if (key === 'f' || key === 'F') {
      event.preventDefault();
      cycleFurigana();
      return;
    }
    if (key === 't' || key === 'T') {
      event.preventDefault();
      toggleAllTranslations();
      return;
    }
    const info = focusedToken();
    if (!info) {
      if ((key === 'a' || key === 'A') && currentInfo) {
        event.preventDefault();
        void addForInfo(currentInfo);
      }
      return;
    }
    if (key === 'ArrowLeft') {
      event.preventDefault();
      moveFocus(info, 'left');
    } else if (key === 'ArrowRight') {
      event.preventDefault();
      moveFocus(info, 'right');
    } else if (key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(info, 'sentence-up');
    } else if (key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(info, 'sentence-down');
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      openPopover(info, true, true);
    } else if (key === 'a' || key === 'A') {
      event.preventDefault();
      void addForInfo(info);
    }
  }

  document.addEventListener('keydown', onKeyDown);

  // Copy plain Japanese without ruby annotations.
  storyText.addEventListener('copy', (event) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!storyText.contains(range.commonAncestorContainer)) return;
    const clone = range.cloneContents();
    const temp = document.createElement('div');
    temp.append(clone);
    temp.querySelectorAll('rt, .sentence-tools, .sentence-translation').forEach((node) => node.remove());
    const text = temp.textContent ?? '';
    if (text.trim()) {
      event.clipboardData?.setData('text/plain', text);
      event.preventDefault();
    }
  });

  // Reading position and debounced saves
  function saveState(): void {
    if (!dirty) return;
    dirty = false;
    const nextReadState =
      story.readState === 'finished' ? 'finished' : story.progress > 0.02 ? 'reading' : story.readState;
    story.readState = nextReadState;
    void updateStory(story.id, {
      progress: story.progress,
      lookupCount: story.lookupCount,
      translationReveals: story.translationReveals,
      readState: nextReadState,
    });
  }

  function scheduleSave(): void {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveState, 450);
  }

  function onScroll(): void {
    if (!popover.hidden) closePopover(false);
    closeTextSizePopover(false);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / max));
    story.progress = progress;
    progressFill.style.width = `${Math.round(progress * 100)}%`;
    if (story.readState === 'unread' && progress > 0.01) story.readState = 'reading';
    if (progress > 0.04 && !resumeBanner.hidden) resumeBanner.hidden = true;
    dirty = true;
    scheduleSave();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  const repositionPopover = () => {
    if (!popover.hidden && currentInfo) positionPopover(currentInfo);
  };
  const onResize = () => {
    repositionPopover();
    closeTextSizePopover(false);
  };
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', repositionPopover);
  window.visualViewport?.addEventListener('scroll', repositionPopover);

  async function finish(): Promise<void> {
    story.readState = 'finished';
    story.finishedAt = story.finishedAt ?? Date.now();
    story.progress = 1;
    await updateStory(story.id, {
      readState: 'finished',
      finishedAt: story.finishedAt,
      progress: 1,
      lookupCount: story.lookupCount,
      translationReveals: story.translationReveals,
    });
    context.navigate(`#/feedback/${story.id}`);
  }

  finishButton.addEventListener('click', () => { void finish(); });

  const initialProgress = story.progress;
  progressFill.style.width = `${Math.round(initialProgress * 100)}%`;

  context.setCleanup(() => {
    if (closedByRoute) return;
    closedByRoute = true;
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.visualViewport?.removeEventListener('resize', repositionPopover);
    window.visualViewport?.removeEventListener('scroll', repositionPopover);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointerdown', closeOnOutside);
    document.removeEventListener('pointerdown', closeTextSizeOnOutside);
    popover.remove();
    textSizePopover.remove();
    window.clearTimeout(hoverTimer);
    window.clearTimeout(closeTimer);
    window.clearTimeout(saveTimer);
    dirty = true;
    saveState();
  });
}

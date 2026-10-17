import { generateStory } from '../generation/pipeline';
import type { StoryLength } from '../types';
import type { AppContext } from '../app';
import { button, el } from './dom';
import { openModal, type ModalHandle } from './modal';
import { showError, showToast } from './toast';

export interface GenerationOptions {
  topic?: string;
  length?: StoryLength;
  seed?: number;
}

export function runGeneration(context: AppContext, options: GenerationOptions = {}): void {
  let controller = new AbortController();
  let closing = false;
  let handle: ModalHandle;
  let running = false;

  const status = el('div', { className: 'generation-status' }, [
    el('span', { className: 'spinner', 'aria-hidden': 'true' }),
    el('span', { text: 'Preparing story…' }),
  ]);
  const preview = el('p', { className: 'hint', text: 'Tokenizing and validating before the story appears.' });
  const skeleton = el('div', { className: 'skeleton-lines', 'aria-hidden': 'true' }, [
    el('div', { className: 'skeleton-line' }),
    el('div', { className: 'skeleton-line' }),
    el('div', { className: 'skeleton-line' }),
    el('div', { className: 'skeleton-line' }),
    el('div', { className: 'skeleton-line' }),
  ]);
  const errorBox = el('div', { className: 'notice notice-error', hidden: true });
  const cancel = button('Cancel', {
    variant: 'secondary',
    onClick: () => {
      controller.abort();
      if (running && !closing) showToast('Generation cancelled. Your current story is unchanged.');
      closing = true;
      handle.close();
    },
  });
  const retry = button('Try again', {
    variant: 'primary',
    onClick: () => {
      errorBox.hidden = true;
      start();
    },
  });
  retry.hidden = true;

  const body = el('div', {}, [
    el('p', { className: 'muted', text: 'Your current story stays available until a new one is ready.' }),
    skeleton,
    status,
    preview,
    errorBox,
    el('div', { className: 'row', style: { marginTop: '0.9rem' } }, [cancel, retry]),
  ]);

  handle = openModal({
    title: 'Writing a new story',
    body,
    className: 'generation-modal',
    onClose: () => {
      controller.abort();
      if (!closing && running) {
        showToast('Generation cancelled.');
      }
      closing = true;
    },
  });

  async function start(): Promise<void> {
    if (running) return;
    running = true;
    controller = new AbortController();
    cancel.disabled = false;
    retry.hidden = true;
    errorBox.hidden = true;
    skeleton.hidden = false;
    status.replaceChildren(
      el('span', { className: 'spinner', 'aria-hidden': 'true' }),
      el('span', { text: 'Preparing story…' }),
    );
    preview.textContent = 'Tokenizing and validating before the story appears.';
    try {
      const result = await generateStory(
        options,
        (update) => {
          status.replaceChildren(
            el('span', { className: 'spinner', 'aria-hidden': 'true' }),
            el('span', { text: update.status }),
          );
          preview.textContent = update.previewChars
            ? `${update.previewChars.toLocaleString()} characters received · attempt ${update.attempt}`
            : 'Tokenizing and validating before the story appears.';
        },
        controller.signal,
      );
      running = false;
      closing = true;
      handle.close();
      context.navigate(`#/reader/${result.story.id}`);
      if (result.fallback) {
        showToast('The provider story did not pass validation, so an offline story was prepared.');
      } else if (result.story.generationMeta.provider === 'mock') {
        showToast('Offline mock story ready.');
      }
    } catch (error) {
      running = false;
      if (controller.signal.aborted) {
        if (!closing) {
          closing = true;
          handle.close();
        }
        return;
      }
      skeleton.hidden = true;
      status.replaceChildren(el('span', { text: 'Generation failed.' }));
      preview.textContent = 'You can retry, switch to the offline mock provider, or import a fallback story.';
      errorBox.hidden = false;
      errorBox.textContent = error instanceof Error ? error.message : 'Generation failed.';
      retry.hidden = false;
      cancel.textContent = 'Close';
      showError(error instanceof Error ? error.message : 'Generation failed.');
    }
  }

  void start();
}

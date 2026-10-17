import { el } from './dom';

export interface ModalOptions {
  title: string;
  body: Node | string;
  actions?: Node[];
  className?: string;
  onClose?: () => void;
}

export interface ModalHandle {
  close: () => void;
  root: HTMLElement;
}

export function openModal(options: ModalOptions): ModalHandle {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const titleId = `modal-title-${Math.random().toString(36).slice(2)}`;
  const dialog = el('div', {
    className: `modal ${options.className ?? ''}`.trim(),
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
  });
  const backdrop = el('div', { className: 'modal-backdrop' });
  const panel = el('div', { className: 'modal-panel' }, [
    el('div', { className: 'modal-head' }, [
      el('h2', { id: titleId, className: 'modal-title', text: options.title }),
      el('button', {
        type: 'button',
        className: 'icon-btn',
        'aria-label': 'Close dialog',
        text: '×',
        on: { click: () => close() },
      }),
    ]),
    el('div', { className: 'modal-body' }, options.body),
    options.actions?.length ? el('div', { className: 'modal-actions' }, options.actions) : null,
  ]);
  dialog.append(backdrop, panel);
  document.body.append(dialog);
  document.body.classList.add('modal-open');

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const onBackdrop = () => close();
  backdrop.addEventListener('click', onBackdrop);
  document.addEventListener('keydown', onKeyDown);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown);
    document.body.classList.remove('modal-open');
    dialog.remove();
    previousFocus?.focus();
    options.onClose?.();
  };

  requestAnimationFrame(() => {
    const focusTarget = panel.querySelector<HTMLElement>(
      'input, select, textarea, button.btn-primary, button:not(:disabled)',
    );
    focusTarget?.focus();
  });

  return { close, root: dialog };
}

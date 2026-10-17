import { el } from './dom';

let toastContainer: HTMLElement | null = null;

function container(): HTMLElement {
  if (toastContainer) return toastContainer;
  toastContainer = el('div', {
    className: 'toast-region',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'false',
  });
  document.body.append(toastContainer);
  return toastContainer;
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export function showToast(message: string, action?: ToastAction, duration = 5000): () => void {
  const region = container();
  const toast = el('div', { className: 'toast' }, [
    el('span', { className: 'toast-message', text: message }),
  ]);
  let closed = false;
  let timer = 0;
  const close = () => {
    if (closed) return;
    closed = true;
    window.clearTimeout(timer);
    toast.classList.add('toast-leaving');
    window.setTimeout(() => toast.remove(), 160);
  };
  if (action) {
    toast.append(
      el('button', {
        type: 'button',
        className: 'toast-action',
        text: action.label,
        on: {
          click: () => {
            action.onClick();
            close();
          },
        },
      }),
    );
  }
  toast.append(
    el('button', {
      type: 'button',
      className: 'toast-close',
      'aria-label': 'Dismiss notification',
      text: '×',
      on: { click: close },
    }),
  );
  region.append(toast);
  timer = window.setTimeout(close, duration);
  return close;
}

export function showError(message: string): () => void {
  return showToast(message, undefined, 7000);
}

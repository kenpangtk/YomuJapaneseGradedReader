type Child = Node | string | number | null | undefined | false;

type Props = {
  className?: string;
  text?: string;
  dataset?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>;
  [key: string]: unknown;
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child | Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'className') {
      node.className = String(value);
      continue;
    }
    if (key === 'text') {
      node.textContent = String(value);
      continue;
    }
    if (key === 'dataset' && typeof value === 'object') {
      for (const [dataKey, dataValue] of Object.entries(value as Record<string, string>)) {
        node.dataset[dataKey] = dataValue;
      }
      continue;
    }
    if (key === 'on' && typeof value === 'object') {
      for (const [eventName, listener] of Object.entries(value as Record<string, (event: Event) => void>)) {
        if (typeof listener === 'function') node.addEventListener(eventName, listener);
      }
      continue;
    }
    if (key === 'style' && typeof value === 'object') {
      Object.assign((node as HTMLElement).style, value as Record<string, string>);
      continue;
    }
    if (key === 'value' && 'value' in node) {
      (node as HTMLInputElement).value = String(value);
      continue;
    }
    if (key === 'checked' && 'checked' in node) {
      (node as HTMLInputElement).checked = Boolean(value);
      continue;
    }
    if (key === 'disabled' && 'disabled' in node) {
      (node as HTMLButtonElement).disabled = Boolean(value);
      continue;
    }
    if (key === 'selected' && 'selected' in node) {
      (node as HTMLOptionElement).selected = Boolean(value);
      continue;
    }
    node.setAttribute(key, String(value));
  }
  appendChildren(node, children);
  return node;
}

function appendChildren(node: HTMLElement, children: Child | Child[]): void {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function frag(children: Child | Child[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    fragment.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return fragment;
}

export function button(
  label: string,
  options: {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
    onClick?: (event: MouseEvent) => void;
    type?: 'button' | 'submit';
    disabled?: boolean;
    className?: string;
    ariaLabel?: string;
  } = {},
): HTMLButtonElement {
  const node = el('button', {
    type: options.type ?? 'button',
    className: `btn ${options.variant ? `btn-${options.variant}` : 'btn-primary'} ${options.className ?? ''}`.trim(),
    disabled: options.disabled ?? false,
    'aria-label': options.ariaLabel,
  }, label);
  if (options.onClick) node.addEventListener('click', options.onClick);
  return node;
}

export function link(href: string, label: string, className = ''): HTMLAnchorElement {
  return el('a', { href, className }, label);
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function textNode(text: string): Text {
  return document.createTextNode(text);
}

export function setDocumentTitle(title: string): void {
  document.title = title ? `${title} · Yomu` : 'Yomu — Japanese Graded Reader';
}

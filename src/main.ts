import './styles/tokens.css';
import './styles/app.css';
import './styles/reader.css';
import { renderApp } from './app';

void renderApp();

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest<HTMLAnchorElement>('a[href^="#"]');
  if (!anchor) return;
  const href = anchor.getAttribute('href') ?? '';
  if (href === '#' || href.startsWith('#/')) return;
  const id = decodeURIComponent(href.slice(1));
  if (!id) return;
  const section = document.getElementById(id);
  if (!section) return;
  event.preventDefault();
  section.scrollIntoView({ block: 'start' });
  if (section instanceof HTMLElement) section.focus({ preventScroll: true });
});

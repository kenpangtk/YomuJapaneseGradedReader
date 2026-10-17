import { ensureProfile, getSettings } from './db';
import { levelSummary } from './lib/level';
import { setDocumentTitle, el } from './ui/dom';
import type { AppSettings, Profile } from './types';
import { renderOnboarding } from './views/onboarding';
import { renderHome } from './views/home';
import { renderReader } from './views/reader';
import { renderFeedback } from './views/feedback';
import { renderWords } from './views/words';
import { renderHistory } from './views/history';
import { renderSettings } from './views/settings';
import { renderStats } from './views/stats';

export interface AppContext {
  profile: Profile;
  settings: AppSettings;
  navigate: (hash: string) => void;
  refresh: () => Promise<void>;
  setCleanup: (cleanup: (() => void) | null) => void;
}

let activeCleanup: (() => void) | null = null;

function navigate(hash: string): void {
  if (location.hash === hash) {
    void renderApp();
    return;
  }
  location.hash = hash;
}

function parseRoute(): { name: string; param: string | null } {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name = 'home', ...rest] = raw.split('/');
  return { name: name || 'home', param: rest.length ? rest.join('/') : null };
}

function shell(profile: Profile, content: HTMLElement, active: string): HTMLElement {
  const header = el('header', { className: 'site-header' }, [
    el('div', { className: 'site-header-inner' }, [
      el('a', { className: 'brand', href: '#/home', 'aria-label': 'Yomu home' }, [
        el('span', { className: 'brand-mark', 'aria-hidden': 'true', text: '読' }),
        el('span', {}, [
          el('span', { className: 'brand-name', text: 'Yomu' }),
          el('span', { className: 'brand-sub', text: 'Japanese graded reader' }),
        ]),
      ]),
      el('nav', { className: 'site-nav', 'aria-label': 'Main navigation' }, [
        navLink('Home', '#/home', active === 'home'),
        navLink('Words', '#/words', active === 'words'),
        navLink('History', '#/history', active === 'history'),
        navLink('Stats', '#/stats', active === 'stats'),
        navLink('Settings', '#/settings', active === 'settings'),
      ]),
      el('a', { className: 'header-level', href: '#/settings', title: 'Reading level' }, [
        el('span', { className: 'level-dot', 'aria-hidden': 'true' }),
        el('span', {}, [
          el('strong', { text: levelSummary(profile.level) }),
          ' ',
          el('span', { text: `${profile.level.toFixed(2)}` }),
        ]),
      ]),
    ]),
  ]);
  const main = el('main', { id: 'main', className: 'site-main', tabindex: '-1' }, content);
  const footer = el('footer', { className: 'site-footer' }, [
    el('span', { text: 'Yomu · local-first reading practice' }),
    el('span', { text: 'Your data stays in this browser.' }),
  ]);
  return el('div', { className: 'app-shell' }, [header, main, footer]);
}

function navLink(label: string, href: string, current: boolean): HTMLElement {
  return el('a', {
    className: 'nav-link',
    href,
    'aria-current': current ? 'page' : undefined,
  }, label);
}

function errorView(error: unknown): HTMLElement {
  return el('div', { className: 'view' }, [
    el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state-mark', 'aria-hidden': 'true', text: '!' }),
      el('h1', { text: 'Something went wrong' }),
      el('p', { text: error instanceof Error ? error.message : 'An unexpected error occurred.' }),
      el('a', { className: 'btn btn-primary', href: '#/home', text: 'Back to library' }),
    ]),
  ]);
}

export async function renderApp(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  let profile: Profile;
  let settings: AppSettings;
  try {
    profile = await ensureProfile();
    settings = await getSettings();
  } catch (error) {
    root.replaceChildren(errorView(error));
    return;
  }

  document.documentElement.style.setProperty('--reader-scale', String(settings.textSize / 100));
  const route = parseRoute();
  if (!profile.onboarded && route.name !== 'onboarding') {
    navigate('#/onboarding');
    return;
  }
  if (profile.onboarded && route.name === 'onboarding') {
    navigate('#/home');
    return;
  }

  const context: AppContext = {
    profile,
    settings,
    navigate,
    refresh: renderApp,
    setCleanup: (cleanup) => {
      activeCleanup = cleanup;
    },
  };

  root.replaceChildren();
  try {
    if (route.name === 'onboarding') {
      setDocumentTitle('Welcome');
      await renderOnboarding(root, context);
      return;
    }
    if (route.name === 'reader' && route.param) {
      setDocumentTitle('Read');
      await renderReader(root, context, route.param);
      return;
    }
    if (route.name === 'feedback' && route.param) {
      setDocumentTitle('Story feedback');
      const container = el('div', { className: 'view' });
      root.append(shell(profile, container, 'home'));
      await renderFeedback(container, context, route.param);
      return;
    }

    const container = el('div', { className: 'view' });
    const current =
      route.name === 'words' || route.name === 'history' || route.name === 'settings' || route.name === 'stats'
        ? route.name
        : 'home';
    root.append(shell(profile, container, current));
    if (route.name === 'words') {
      setDocumentTitle('Word list');
      await renderWords(container, context);
    } else if (route.name === 'history') {
      setDocumentTitle('Story history');
      await renderHistory(container, context);
    } else if (route.name === 'settings') {
      setDocumentTitle('Settings');
      await renderSettings(container, context);
    } else if (route.name === 'stats') {
      setDocumentTitle('Reading stats');
      await renderStats(container, context);
    } else {
      setDocumentTitle('Library');
      await renderHome(container, context);
    }
  } catch (error) {
    console.error(error);
    root.replaceChildren(shell(profile, errorView(error), 'home'));
  }
}

window.addEventListener('hashchange', () => {
  void renderApp();
});

if (!location.hash) {
  location.hash = '#/home';
} else {
  void renderApp();
}

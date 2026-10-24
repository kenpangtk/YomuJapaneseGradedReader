const apiKey = (import.meta.env.VITE_SHARED_API_KEY ?? '').trim();
const baseUrl = (import.meta.env.VITE_SHARED_API_URL ?? '').trim();
const model = (import.meta.env.VITE_SHARED_API_MODEL ?? '').trim();

export const sharedProviderDefaults = {
  apiKey,
  baseUrl,
  model,
  enabled:
    import.meta.env.MODE !== 'test' &&
    import.meta.env.VITE_SHARED_PROVIDER === '1' &&
    Boolean(apiKey && baseUrl && model),
} as const;

export const FALLBACK_BASE_URL = 'https://api.openai.com/v1';
export const FALLBACK_MODEL = 'gpt-4o-mini';

const OPT_OUT_KEY = 'yomu.sharedProvider.optOut';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Storage can be unavailable in private modes; shared defaults still work for this page load.
  }
}

export function hasOptedOutOfSharedProvider(): boolean {
  return readFlag(OPT_OUT_KEY);
}

export function optOutOfSharedProvider(): void {
  writeFlag(OPT_OUT_KEY);
}

export function resetSharedProviderState(): void {
  try {
    localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // Ignore storage failures.
  }
}

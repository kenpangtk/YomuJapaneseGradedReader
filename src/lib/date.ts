export const DAY_MS = 86_400_000;

export function tomorrow(now = Date.now()): number {
  return now + DAY_MS;
}

export function addDays(now: number, days: number): number {
  return now + Math.max(0, days) * DAY_MS;
}

export function formatDate(timestamp: number | null): string {
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: new Date(timestamp).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(timestamp);
}

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}

export function relativeDue(timestamp: number, now = Date.now()): string {
  const days = Math.ceil((timestamp - now) / DAY_MS);
  if (days <= 0) return 'due now';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

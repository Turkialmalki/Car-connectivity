export const nowIso = (): string => new Date().toISOString();

export const isoIn = (seconds: number, from: Date = new Date()): string =>
  new Date(from.getTime() + seconds * 1000).toISOString();

/** "Updated 2 min ago" — the single most important label on a connected-car app. */
export const relativeTime = (iso: string, now: Date = new Date()): string => {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

export const clockTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export const dayMonth = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** "Sunday, 30 March" — the heading style used by the charging history. */
export const longDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/** True when two instants fall on different calendar days. */
export const spansDays = (startIso: string, endIso: string): boolean =>
  new Date(startIso).toDateString() !== new Date(endIso).toDateString();

export const formatDuration = (minutes: number): string => {
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
};

export const randomBetween = (min: number, max: number): number =>
  min + Math.random() * (max - min);

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Redacting logger.
 *
 * Connected-car telemetry is personal data. VIN, precise coordinates, email and
 * phone must never reach a log sink, a crash report or an analytics event in
 * clear text. Every log in this app goes through here.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g;
const PHONE_PATTERN = /\+?\d[\d\s-]{7,}\d/g;
const COORD_KEYS = new Set(['latitude', 'longitude', 'lat', 'lng', 'lon']);

export const redact = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value
      .replace(VIN_PATTERN, (v) => `VIN:••••${v.slice(-4)}`)
      .replace(EMAIL_PATTERN, (v) => `${v.slice(0, 2)}•••@•••`)
      .replace(PHONE_PATTERN, '•••••••');
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => {
        if (COORD_KEYS.has(k) && typeof v === 'number') {
          // Coarsen to ~1km so a log can still be useful without locating a person.
          return [k, Math.round(v * 100) / 100];
        }
        return [k, redact(v)];
      }),
    );
  }
  return value;
};

/** In-app ring buffer so the developer screen can show logs without a console. */
export type LogEntry = { level: LogLevel; message: string; context?: unknown; at: string };
const buffer: LogEntry[] = [];
const MAX_BUFFER = 200;

const write = (level: LogLevel, message: string, context?: unknown) => {
  const entry: LogEntry = {
    level,
    message,
    context: context === undefined ? undefined : redact(context),
    at: new Date().toISOString(),
  };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  if (level === 'error') console.error(`[vehicle] ${message}`, entry.context ?? '');
  else if (level === 'warn') console.warn(`[vehicle] ${message}`, entry.context ?? '');
};

export const logger = {
  debug: (m: string, c?: unknown) => write('debug', m, c),
  info: (m: string, c?: unknown) => write('info', m, c),
  warn: (m: string, c?: unknown) => write('warn', m, c),
  error: (m: string, c?: unknown) => write('error', m, c),
  entries: (): readonly LogEntry[] => buffer,
  clear: () => {
    buffer.length = 0;
  },
};

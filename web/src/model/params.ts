import { DEFAULT_POLICY } from './policy';
import type { ResultParams } from './result';

export type Params = ResultParams;

const DAY_MS = 86_400_000;

export interface Field {
  /** Key in the URL hash. */
  key: string;
  min: number;
  max: number;
  get(params: Params): number;
  set(params: Params, value: number): void;
}

/** The numbers a visitor can edit, with the ranges accepted from inputs and links. */
export const FIELDS: readonly Field[] = [
  {
    key: 'messages',
    min: 1,
    max: 1_000_000_000,
    get: (p) => p.messages,
    set: (p, v) => (p.messages = v),
  },
  {
    key: 'workerMax',
    min: 1,
    max: 1_000_000,
    get: (p) => p.workerLimit.max,
    set: (p, v) => (p.workerLimit.max = v),
  },
  {
    key: 'workerWindow',
    min: 1,
    max: DAY_MS,
    get: (p) => p.workerLimit.windowMs,
    set: (p, v) => (p.workerLimit.windowMs = v),
  },
  {
    key: 'providerMax',
    min: 1,
    max: 1_000_000,
    get: (p) => p.providerLimit.max,
    set: (p, v) => (p.providerLimit.max = v),
  },
  {
    key: 'providerWindow',
    min: 1,
    max: DAY_MS,
    get: (p) => p.providerLimit.windowMs,
    set: (p, v) => (p.providerLimit.windowMs = v),
  },
  {
    key: 'attempts',
    min: 1,
    max: 100,
    get: (p) => p.attempts,
    set: (p, v) => (p.attempts = v),
  },
  {
    key: 'backoff',
    min: 1,
    max: DAY_MS,
    get: (p) => p.backoff.delayMs,
    set: (p, v) => (p.backoff.delayMs = v),
  },
];

export function defaultParams(): Params {
  const { messages, workerLimit, providerLimit, attempts, backoff } = DEFAULT_POLICY;
  return {
    messages,
    workerLimit: { ...workerLimit },
    providerLimit: { ...providerLimit },
    attempts,
    backoff: { ...backoff },
  };
}

/** Parses a value typed by a visitor or read from a link; undefined when it is not allowed. */
export function parseValue(field: Field, text: string): number | undefined {
  if (!/^\d+$/.test(text.trim())) return undefined;
  const value = Number(text.trim());
  return value >= field.min && value <= field.max ? value : undefined;
}

/** Reads the URL hash. Unknown keys and invalid values are skipped and listed in `ignored`. */
export function parseParams(hash: string): { params: Params; ignored: string[] } {
  const params = defaultParams();
  const ignored: string[] = [];
  for (const [key, text] of new URLSearchParams(hash.replace(/^#/, ''))) {
    const field = FIELDS.find((f) => f.key === key);
    const value = field && parseValue(field, text);
    if (field && value !== undefined) field.set(params, value);
    else ignored.push(key);
  }
  return { params, ignored };
}

/** Hash with only the values that differ from the code defaults; empty when none do. */
export function toHash(params: Params): string {
  const defaults = defaultParams();
  const query = new URLSearchParams();
  for (const field of FIELDS) {
    if (field.get(params) !== field.get(defaults)) query.set(field.key, String(field.get(params)));
  }
  const text = query.toString();
  return text ? `#${text}` : '';
}

export function isCustom(params: Params): boolean {
  return toHash(params) !== '';
}

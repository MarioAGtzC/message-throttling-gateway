import type { Policy } from './policy';

export type ResultParams = Pick<
  Policy,
  'messages' | 'workerLimit' | 'providerLimit' | 'attempts' | 'backoff'
>;

export interface BurstResult {
  durationMs: number;
  ratePerSec: number;
  sent: number;
  failed: number;
  count429: number;
  /** The worker adds one retry per 429, so this equals count429. */
  retries: number;
  lost: number;
  duplicated: number;
  /** True when the worker can outpace the provider and the numbers are an estimate. */
  estimated: boolean;
}

/**
 * Result of a burst under ideal timing. Exact when the worker is not faster than the provider;
 * otherwise an estimate where every attempt succeeds with probability providerRate / workerRate.
 */
export function computeResult(params: ResultParams): BurstResult {
  const { messages, workerLimit: w, providerLimit: p, attempts, backoff } = params;
  const base = { lost: 0, duplicated: 0 };

  // Compare rates without division: w.max / w.windowMs <= p.max / p.windowMs.
  if (w.max * p.windowMs <= p.max * w.windowMs) {
    const durationMs = Math.ceil(messages / w.max) * w.windowMs;
    return {
      ...base,
      durationMs,
      ratePerSec: (messages * 1000) / durationMs,
      sent: messages,
      failed: 0,
      count429: 0,
      retries: 0,
      estimated: false,
    };
  }

  const success = (p.max * w.windowMs) / (w.max * p.windowMs);
  const rejectAll = (1 - success) ** attempts;
  const failed = Math.round(messages * rejectAll);
  const sent = messages - failed;
  const totalAttempts = Math.round((messages * (1 - rejectAll)) / success);
  const count429 = Math.max(0, totalAttempts - sent);

  const providerTime = (sent * p.windowMs) / p.max;
  const workerTime = (totalAttempts * w.windowMs) / w.max;
  // A message on its last attempt has waited 1 + 2 + … + 2^(attempts-2) backoff delays.
  const backoffTail = count429 > 0 ? (2 ** (attempts - 1) - 1) * backoff.delayMs : 0;
  const durationMs = Math.round(Math.max(providerTime, workerTime, backoffTail));

  return {
    ...base,
    durationMs,
    ratePerSec: durationMs > 0 ? (sent * 1000) / durationMs : 0,
    sent,
    failed,
    count429,
    retries: count429,
    estimated: true,
  };
}

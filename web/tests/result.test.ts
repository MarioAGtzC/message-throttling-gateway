import { DEFAULT_POLICY } from '../src/model/policy';
import { computeResult, type ResultParams } from '../src/model/result';

const base: ResultParams = DEFAULT_POLICY;
const withParams = (changes: Partial<ResultParams>): ResultParams => ({ ...base, ...changes });

describe('computeResult', () => {
  test('defaults: 100,000 messages sent in 16m 40s with no 429s', () => {
    expect(computeResult(base)).toEqual({
      durationMs: 1_000_000,
      ratePerSec: 100,
      sent: 100_000,
      failed: 0,
      count429: 0,
      retries: 0,
      lost: 0,
      duplicated: 0,
      estimated: false,
    });
  });

  test('1,000,000 messages take 2h 46m 40s', () => {
    expect(computeResult(withParams({ messages: 1_000_000 })).durationMs).toBe(10_000_000);
  });

  test('one message is sent in the first window', () => {
    const result = computeResult(withParams({ messages: 1 }));
    expect(result.durationMs).toBe(1000);
    expect(result.sent).toBe(1);
  });

  test('a slower worker sets the pace, with no 429s', () => {
    const result = computeResult(withParams({ workerLimit: { max: 50, windowMs: 1000 } }));
    expect(result.durationMs).toBe(2_000_000);
    expect(result.count429).toBe(0);
    expect(result.estimated).toBe(false);
  });

  test('different window lengths compare by rate', () => {
    // Worker 50 per 500 ms is the same 100/s as the provider.
    const result = computeResult(withParams({ workerLimit: { max: 50, windowMs: 500 } }));
    expect(result.estimated).toBe(false);
    expect(result.durationMs).toBe(1_000_000);
  });

  test('a worker faster than the provider gives an estimate with 429s and retries', () => {
    const result = computeResult(withParams({ workerLimit: { max: 200, windowMs: 1000 } }));
    // s = 0.5: failed = N × 0.5^5, attempts = N × (1 − 0.5^5) / 0.5
    expect(result.estimated).toBe(true);
    expect(result.failed).toBe(3125);
    expect(result.sent).toBe(96_875);
    expect(result.count429).toBe(193_750 - 96_875);
    expect(result.retries).toBe(result.count429);
    expect(result.durationMs).toBe(968_750);
    expect(result.ratePerSec).toBe(100);
  });

  test('a single attempt fails every rejected message', () => {
    const result = computeResult(
      withParams({ workerLimit: { max: 400, windowMs: 1000 }, attempts: 1 }),
    );
    expect(result.failed).toBe(75_000);
    expect(result.count429).toBe(75_000);
  });

  test('a long backoff stretches the estimated duration', () => {
    const result = computeResult(
      withParams({
        messages: 10,
        workerLimit: { max: 200, windowMs: 1000 },
        backoff: { type: 'exponential', delayMs: 60_000 },
      }),
    );
    // Last retry waits 1 + 2 + 4 + 8 = 15 backoff units.
    expect(result.durationMs).toBe(15 * 60_000);
  });

  test('sent + failed always equals the burst size', () => {
    for (const workerMax of [10, 100, 150, 1000, 1_000_000]) {
      for (const attempts of [1, 2, 5, 100]) {
        for (const messages of [1, 7, 100_000, 1_000_000_000]) {
          const r = computeResult(
            withParams({ messages, attempts, workerLimit: { max: workerMax, windowMs: 1000 } }),
          );
          expect(r.sent + r.failed).toBe(messages);
          expect(Number.isFinite(r.durationMs)).toBe(true);
        }
      }
    }
  });
});

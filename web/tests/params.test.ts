import { isCustom, parseParams, toHash, type Params } from '../src/model/params';
import { DEFAULT_POLICY } from '../src/model/policy';

const custom: Params = {
  messages: 2_500_000,
  workerLimit: { max: 250, windowMs: 2000 },
  providerLimit: { max: 50, windowMs: 500 },
  attempts: 7,
  backoff: { type: 'exponential', delayMs: 300 },
};

describe('parseParams', () => {
  test('an empty hash gives the defaults', () => {
    for (const hash of ['', '#']) {
      const { params, ignored } = parseParams(hash);
      expect(params).toEqual(defaults());
      expect(ignored).toEqual([]);
    }
  });

  test('reads every field', () => {
    const { params, ignored } = parseParams(
      '#messages=2500000&workerMax=250&workerWindow=2000&providerMax=50&providerWindow=500&attempts=7&backoff=300',
    );
    expect(params).toEqual(custom);
    expect(ignored).toEqual([]);
  });

  test('ignores and reports unknown keys, non-integers and out-of-range values', () => {
    const { params, ignored } = parseParams(
      '#messages=0&workerMax=abc&attempts=2.5&backoff=-1&providerWindow=86400001&color=red&providerMax=40',
    );
    expect(params).toEqual({ ...defaults(), providerLimit: { max: 40, windowMs: 1000 } });
    expect(ignored).toEqual([
      'messages',
      'workerMax',
      'attempts',
      'backoff',
      'providerWindow',
      'color',
    ]);
  });

  test('accepts the range limits', () => {
    const { params, ignored } = parseParams(
      '#messages=1000000000&workerMax=1000000&workerWindow=86400000&attempts=100&backoff=1',
    );
    expect(ignored).toEqual([]);
    expect(params.messages).toBe(1_000_000_000);
    expect(params.workerLimit).toEqual({ max: 1_000_000, windowMs: 86_400_000 });
    expect(params.attempts).toBe(100);
    expect(params.backoff.delayMs).toBe(1);
  });

  test('never returns a shared or frozen object', () => {
    const { params } = parseParams('');
    params.workerLimit.max = 5;
    expect(DEFAULT_POLICY.workerLimit.max).toBe(100);
  });
});

describe('toHash', () => {
  test('round-trips custom values', () => {
    expect(parseParams(toHash(custom)).params).toEqual(custom);
  });

  test('is empty for the defaults and lists only what changed', () => {
    expect(toHash(defaults())).toBe('');
    expect(toHash({ ...defaults(), attempts: 3 })).toBe('#attempts=3');
  });
});

describe('isCustom', () => {
  test('is false only for the code defaults', () => {
    expect(isCustom(defaults())).toBe(false);
    expect(isCustom({ ...defaults(), messages: 10 })).toBe(true);
    expect(isCustom({ ...defaults(), providerLimit: { max: 100, windowMs: 999 } })).toBe(true);
  });
});

function defaults(): Params {
  return parseParams('').params;
}

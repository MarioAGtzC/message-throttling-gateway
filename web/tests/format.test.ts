import { formatDuration, formatNumber } from '../src/model/format';

describe('formatDuration', () => {
  test.each([
    [1_000_000, '16m 40s'],
    [10_000_000, '2h 46m 40s'],
    [1000, '1s'],
    [3_600_000, '1h'],
    [3_605_000, '1h 5s'],
    [90_061_000, '1d 1h 1m 1s'],
    [450, '450 ms'],
    [0, '0 ms'],
    [1499, '1s'],
  ])('%d ms → %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });

  test('very long durations stay in days', () => {
    expect(formatDuration(1000 * 86_400_000)).toBe('1,000d');
  });
});

describe('formatNumber', () => {
  test('groups thousands', () => {
    expect(formatNumber(100_000)).toBe('100,000');
    expect(formatNumber(1_000_000_000)).toBe('1,000,000,000');
    expect(formatNumber(0)).toBe('0');
  });
});

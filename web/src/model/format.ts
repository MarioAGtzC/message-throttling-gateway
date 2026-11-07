const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

const UNITS: [suffix: string, ms: number][] = [
  ['d', 86_400_000],
  ['h', 3_600_000],
  ['m', 60_000],
  ['s', 1000],
];

const HUNDRED_YEARS_MS = 36_525 * 86_400_000;

/** "16m 40s", "2h 46m 40s", "1h 5s"; under a second it shows milliseconds. */
export function formatDuration(ms: number): string {
  if (Math.round(ms) < 1000) return `${Math.round(ms)} ms`;
  if (ms > HUNDRED_YEARS_MS) return 'more than 100 years';

  let rest = Math.round(ms / 1000) * 1000;
  const parts: string[] = [];
  for (const [suffix, size] of UNITS) {
    const amount = Math.floor(rest / size);
    rest -= amount * size;
    if (amount > 0) parts.push(`${formatNumber(amount)}${suffix}`);
  }
  return parts.join(' ');
}

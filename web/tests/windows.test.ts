/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatDuration, formatNumber } from '../src/model/format';
import { DEFAULT_POLICY } from '../src/model/policy';
import { computeResult } from '../src/model/result';
import { TIMELINE, timelineRows } from '../src/model/windows';
import { initWindows } from '../src/ui/windows';

const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');

const $ = <T extends Element = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing ${selector}`);
  return element;
};

describe('two windows dataset', () => {
  const rows = timelineRows(TIMELINE);

  test('every send falls inside one worker window and one provider window', () => {
    for (const row of rows) {
      expect(row.workerWindow).toBeGreaterThan(0);
      expect(row.providerWindow).toBeGreaterThan(0);
    }
  });

  test('a provider window opens with the first request after the previous one ends', () => {
    TIMELINE.providerWindows.forEach((window, i) => {
      expect(window.endMs - window.startMs).toBe(TIMELINE.windowMs);
      const first = rows.find((row) => row.providerWindow === i + 1);
      expect(first?.atMs).toBe(window.startMs);
      const previous = TIMELINE.providerWindows[i - 1];
      if (previous) expect(window.startMs).toBeGreaterThanOrEqual(previous.endMs);
    });
  });

  test('the worker never takes more than its limit per window', () => {
    TIMELINE.workerWindows.forEach((_, i) => {
      expect(rows.filter((row) => row.workerWindow === i + 1).length).toBeLessThanOrEqual(
        TIMELINE.limit,
      );
    });
  });

  test('Mock C answers 429 exactly when its window already counted the limit', () => {
    for (const row of rows) expect(row.status).toBe(row.providerCount > TIMELINE.limit ? 429 : 200);
    expect(rows.some((row) => row.status === 429)).toBe(true);
  });
});

describe('two windows section', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = new DOMParser().parseFromString(
      html,
      'text/html',
    ).documentElement.innerHTML;
    initWindows();
  });

  test('the numbers in the text match the gateway code', () => {
    // The copy is static, so this test is what catches a drift from DEFAULT_POLICY.
    const text = ($('#limits').textContent ?? '').replace(/\s+/g, ' ');
    const { workerLimit: w, providerLimit: p, messages } = DEFAULT_POLICY;
    const limitRate = (w.max * 1000) / w.windowMs;
    // Real rate = min(limit, 1 / time per job), at 5 ms and at 20 ms per job.
    const atJobMs = (jobMs: number) => {
      const rate = Math.min(limitRate, 1000 / jobMs);
      const { durationMs } = computeResult({
        ...DEFAULT_POLICY,
        workerLimit: { max: rate, windowMs: 1000 },
      });
      return [`min(${limitRate}/s, ${1000 / jobMs}/s) = ${rate}/s`, formatDuration(durationMs)];
    };

    expect(text).toContain(`at most ${w.max} jobs per ${w.windowMs} ms`);
    expect(text).toContain(`accepts ${p.max} requests per ${p.windowMs} ms`);
    expect(text).toContain(`${formatNumber(messages)} messages`);
    for (const piece of [...atJobMs(5), ...atJobMs(20)]) expect(text).toContain(piece);
    expect(text).toContain(`each job takes under ${1000 / limitRate} ms`);
  });

  test('the "Show data" table rows match the dataset', () => {
    expect($('#limits-data summary').textContent).toBe('Show data');
    const body = [...document.querySelectorAll('#limits-rows tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent),
    );
    expect(body).toEqual(
      timelineRows(TIMELINE).map((row) => [
        `${row.atMs} ms`,
        row.id,
        String(row.workerWindow),
        `${row.providerWindow} (${row.providerCount} / ${TIMELINE.limit})`,
        String(row.status),
      ]),
    );
  });

  test('the chart draws every window and one mark per send, with the 429s set apart', () => {
    const chart = $<SVGSVGElement>('#limits-chart');
    expect(chart.querySelectorAll('.lane-worker .window')).toHaveLength(
      TIMELINE.workerWindows.length,
    );
    expect(chart.querySelectorAll('.lane-provider .window')).toHaveLength(
      TIMELINE.providerWindows.length,
    );
    expect(chart.querySelectorAll('.send')).toHaveLength(TIMELINE.sends.length);
    expect(chart.querySelectorAll('.send-429')).toHaveLength(
      TIMELINE.sends.filter((send) => send.status === 429).length,
    );
    expect(chart.getAttribute('role')).toBe('img');
    expect(chart.getAttribute('aria-label')).toContain('2 answered 429');
  });
});

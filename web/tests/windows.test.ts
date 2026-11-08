/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

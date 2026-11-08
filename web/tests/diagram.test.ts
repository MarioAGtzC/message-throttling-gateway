/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCENARIOS } from '../src/model/scenarios';
import { initSteps } from '../src/ui/steps';

const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');

const $ = <T extends Element = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing ${selector}`);
  return element;
};
const diagram = () => $<SVGSVGElement>('#steps-diagram');
const active = () =>
  [...document.querySelectorAll('#steps-diagram [data-hop]')]
    .filter((hop) => hop.getAttribute('data-active') === 'true')
    .map((hop) => hop.getAttribute('data-hop'));
const count = (hop: string) => $(`#steps-diagram [data-hop="${hop}"] .hop-count`).textContent;
const next = () => $<HTMLButtonElement>('#steps-next').click();
const choose = (id: string) => {
  const select = $<HTMLSelectElement>('#steps-scenario');
  select.value = id;
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

beforeEach(() => {
  document.documentElement.innerHTML = new DOMParser().parseFromString(
    html,
    'text/html',
  ).documentElement.innerHTML;
  initSteps();
});

describe('flow diagram', () => {
  test('is an image with a text summary and the four parts of the flow', () => {
    expect(diagram().getAttribute('role')).toBe('img');
    const labels = [...diagram().querySelectorAll('.node-title')].map((t) => t.textContent);
    expect(labels).toEqual(['Mock A', 'Service B', 'Worker', 'Mock C']);
  });

  test('highlights the hop of every step', () => {
    for (const scenario of SCENARIOS) {
      choose(scenario.id);
      scenario.steps.forEach((step, i) => {
        if (i > 0) next();
        expect(active()).toEqual(step.hop ? [step.hop] : []);
      });
    }
  });

  test('shows counters per hop and the answer on the active one', () => {
    choose('rate-limit');
    expect(count('intake')).toBe('4 saved');
    expect(count('queue')).toBe('4 queued');
    expect(count('provider')).toBe('0 sent');
    for (let i = 0; i < 4; i++) next();
    // m4 got a 429 and waits in the delayed list.
    expect(count('queue')).toBe('1 queued');
    expect(count('provider')).toBe('3 sent · 429');
  });

  test('the aria-label changes with the step and names the active hop', () => {
    const first = diagram().getAttribute('aria-label');
    expect(first).toContain('Mock A to Service B');
    expect(first).toContain('6 saved');
    next();
    const second = diagram().getAttribute('aria-label');
    expect(second).not.toBe(first);
    expect(second).toContain('Active: Service B queue to Worker');
    next();
    expect(diagram().getAttribute('aria-label')).toContain('Active: Worker to Mock C, answer 200');
  });
});

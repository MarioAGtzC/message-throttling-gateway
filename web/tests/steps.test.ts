/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCENARIOS, type Scenario } from '../src/model/scenarios';
import { initSteps } from '../src/ui/steps';

const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing ${selector}`);
  return element;
};
const button = (name: 'prev' | 'next' | 'last') => $<HTMLButtonElement>(`#steps-${name}`);
const select = () => $<HTMLSelectElement>('#steps-scenario');
const counter = () => $('#steps-counter').textContent;
const narration = () => $('#steps-narration').textContent;

const scenario = (index: number): Scenario => {
  const found = SCENARIOS[index];
  if (!found) throw new Error(`missing scenario ${index}`);
  return found;
};
const narrationOf = (s: Scenario, step: number) => s.steps[step]?.narration;

beforeEach(() => {
  document.documentElement.innerHTML = new DOMParser().parseFromString(
    html,
    'text/html',
  ).documentElement.innerHTML;
  initSteps();
});

describe('step by step', () => {
  test('lists every scenario and starts at step 1 of the first one', () => {
    expect([...select().options].map((o) => o.textContent)).toEqual(SCENARIOS.map((s) => s.title));
    expect(select().value).toBe(scenario(0).id);
    expect(counter()).toBe(`Step 1 of ${scenario(0).steps.length}`);
    expect(narration()).toBe(narrationOf(scenario(0), 0));
    expect($('#steps-narration').getAttribute('aria-live')).toBe('polite');
    expect(button('prev').disabled).toBe(true);
    expect(button('next').disabled).toBe(false);
    expect(button('last').disabled).toBe(false);
  });

  test('next and previous move one step', () => {
    button('next').click();
    expect(counter()).toBe(`Step 2 of ${scenario(0).steps.length}`);
    expect(narration()).toBe(narrationOf(scenario(0), 1));
    expect(button('prev').disabled).toBe(false);

    button('prev').click();
    expect(counter()).toBe(`Step 1 of ${scenario(0).steps.length}`);
    expect(button('prev').disabled).toBe(true);
  });

  test('last jumps to the end and disables next and last', () => {
    const steps = scenario(0).steps.length;
    button('last').click();
    expect(counter()).toBe(`Step ${steps} of ${steps}`);
    expect(narration()).toBe(narrationOf(scenario(0), steps - 1));
    expect(button('next').disabled).toBe(true);
    expect(button('last').disabled).toBe(true);
    expect(button('prev').disabled).toBe(false);
  });

  test('keeps keyboard focus on a control when the focused button gets disabled', () => {
    button('last').focus();
    button('last').click();
    expect(document.activeElement).toBe(button('prev'));
  });

  test('changing the scenario resets to step 1', () => {
    button('next').click();
    button('next').click();
    select().value = scenario(2).id;
    select().dispatchEvent(new Event('change', { bubbles: true }));
    expect(counter()).toBe(`Step 1 of ${scenario(2).steps.length}`);
    expect(narration()).toBe(narrationOf(scenario(2), 0));
    expect(button('prev').disabled).toBe(true);
  });

  test('side panel shows the queue, both windows and one status row per message', () => {
    // rate-limit, step 5: m4 got a 429 and waits for its first retry.
    select().value = 'rate-limit';
    select().dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 4; i++) button('next').click();

    expect($('#steps-clock').textContent).toBe('t = 1,020 ms');
    expect($('#steps-waiting').textContent).toBe('empty');
    expect($('#steps-delayed').textContent).toBe('m4 until 2,020 ms (retry 1)');
    expect($('#steps-worker').textContent).toBe('1 / 3');
    expect($('#steps-provider').textContent).toBe('4 / 3');

    const rows = [...document.querySelectorAll('#steps-rows tr')].map((tr) =>
      [...tr.children].map((td) => td.textContent),
    );
    expect(rows).toEqual([
      ['m1', 'SENT', '0', '1'],
      ['m2', 'SENT', '0', '1'],
      ['m3', 'SENT', '0', '1'],
      ['m4', 'RETRYING', '1', '1'],
    ]);
    expect(document.querySelector('#steps-rows tr:last-child td:nth-child(2)')?.className).toBe(
      'status-retrying',
    );
  });
});

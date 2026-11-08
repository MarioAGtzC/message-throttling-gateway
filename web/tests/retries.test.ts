/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_POLICY, type Policy } from '../src/model/policy';
import { initRetries } from '../src/ui/retries';

const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');

const $ = (selector: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`missing ${selector}`);
  return element;
};
const items = () =>
  [...document.querySelectorAll('#retries-timeline li')].map((li) => li.textContent);

beforeEach(() => {
  document.documentElement.innerHTML = new DOMParser().parseFromString(
    html,
    'text/html',
  ).documentElement.innerHTML;
});

describe('retries section', () => {
  test('the backoff timeline shows 1, 2, 4 and 8 s between the 5 attempts of the code', () => {
    initRetries();
    expect(items()).toEqual([
      'Attempt 1 at 0 ms, then waits 1s',
      'Attempt 2 at 1s, then waits 2s',
      'Attempt 3 at 3s, then waits 4s',
      'Attempt 4 at 7s, then waits 8s',
      'Attempt 5 at 15s, then FAILED',
    ]);
    expect($('#retries-summary').textContent).toBe(
      'A message gets 5 attempts. If every one fails, it ends FAILED 15s after the first.',
    );
  });

  test('labels follow the policy: retry n waits 2^(n-1) × the base delay', () => {
    const policy: Policy = {
      ...DEFAULT_POLICY,
      attempts: 3,
      backoff: { type: 'exponential', delayMs: 500 },
    };
    initRetries(policy);
    expect(items()).toEqual([
      'Attempt 1 at 0 ms, then waits 500 ms',
      'Attempt 2 at 500 ms, then waits 1s',
      'Attempt 3 at 2s, then FAILED',
    ]);
    expect(document.querySelectorAll('#retries-timeline li')).toHaveLength(policy.attempts);
  });

  test('the response table lists every answer of the gateway', () => {
    const codes = [...document.querySelectorAll('#responses tbody th')].map((th) => th.textContent);
    expect(codes).toEqual(['202', '200', '400', '404', '500']);
  });
});

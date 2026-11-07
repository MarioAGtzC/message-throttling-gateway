/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initDemo } from '../src/ui/demo';

const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing ${selector}`);
  return element;
};
const out = (name: string) => $(`[data-out="${name}"]`).textContent;
const input = (key: string) => $<HTMLInputElement>(`#demo input[name="${key}"]`);

function type(key: string, value: string) {
  input(key).value = value;
  input(key).dispatchEvent(new Event('input', { bubbles: true }));
}

function load(hash: string) {
  document.documentElement.innerHTML = new DOMParser().parseFromString(
    html,
    'text/html',
  ).documentElement.innerHTML;
  history.replaceState(null, '', `/${hash}`);
  initDemo();
}

afterEach(() => jest.useRealTimers());

describe('live demo', () => {
  test('starts with the code values and no badge', () => {
    load('');
    expect(input('messages').value).toBe('100000');
    expect(input('attempts').value).toBe('5');
    expect(out('time')).toBe('16m 40s');
    expect(out('rate')).toBe('100 msg/s');
    expect(out('sent')).toBe('100,000');
    expect(out('count429')).toBe('0');
    expect(out('lost')).toBe('0');
    expect(out('duplicated')).toBe('0');
    expect($('#demo-custom').hidden).toBe(true);
    expect($('#demo-estimated').hidden).toBe(true);
    expect($('#demo-ignored').hidden).toBe(true);
  });

  test('restores values from the link and reports the ignored ones', () => {
    load('#messages=200&workerMax=abc&nope=1');
    expect(input('messages').value).toBe('200');
    expect(input('workerMax').value).toBe('100');
    expect(out('time')).toBe('2s');
    expect(out('sent')).toBe('200');
    expect($('#demo-custom').hidden).toBe(false);
    const ignored = $('#demo-ignored');
    expect(ignored.hidden).toBe(false);
    expect(ignored.textContent).toContain('workerMax');
    expect(ignored.textContent).toContain('nope');
    expect(location.hash).toBe('#messages=200');
  });

  test('leaves a clean link untouched', () => {
    load('#attempts=3&messages=50');
    expect(location.hash).toBe('#attempts=3&messages=50');
  });

  test('updates the card, the badge and the hash on every input', () => {
    load('');
    type('messages', '1000');
    expect(out('time')).toBe('10s');
    expect(out('sent')).toBe('1,000');
    expect($('#demo-custom').hidden).toBe(false);
    expect(location.hash).toBe('#messages=1000');

    type('messages', '100000');
    expect($('#demo-custom').hidden).toBe(true);
    expect(location.hash).toBe('');
  });

  test('marks the result as estimated when the worker outpaces the provider', () => {
    load('');
    type('providerMax', '50');
    expect($('#demo-estimated').hidden).toBe(false);
    expect(Number(out('count429')?.replace(/,/g, ''))).toBeGreaterThan(0);
    expect(out('retries')).toBe(out('count429'));
  });

  test('keeps the last valid result and flags an invalid input', () => {
    load('');
    type('messages', '0');
    expect(input('messages').getAttribute('aria-invalid')).toBe('true');
    expect(out('sent')).toBe('100,000');
    expect(location.hash).toBe('');

    type('messages', '10');
    expect(input('messages').getAttribute('aria-invalid')).toBe('false');
    expect(out('sent')).toBe('10');
  });

  test('explains an invalid input in text, not only with color', () => {
    load('');
    const hint = $('#hint-messages');
    const original = hint.textContent;
    type('messages', 'abc');
    expect(hint.textContent).toBe('Not valid: enter a whole number from 1 to 1,000,000,000.');
    type('messages', '10');
    expect(hint.textContent).toBe(original);

    type('attempts', '0');
    $<HTMLButtonElement>('#demo-reset').click();
    expect($('#hint-attempts').textContent).not.toContain('Not valid');

    type('backoff', '0');
    type('backoff', '500');
    expect($('#hint-backoff sup')).not.toBeNull();
  });

  test('resets to the code values', () => {
    load('#messages=7&attempts=2&bad=1');
    $<HTMLButtonElement>('#demo-reset').click();
    expect(input('messages').value).toBe('100000');
    expect(input('attempts').value).toBe('5');
    expect(out('time')).toBe('16m 40s');
    expect($('#demo-custom').hidden).toBe(true);
    expect($('#demo-ignored').hidden).toBe(true);
    expect(location.hash).toBe('');
  });

  test('announces the result once after the visitor stops typing', () => {
    jest.useFakeTimers();
    load('');
    const live = $('#demo-announce');
    expect(live.getAttribute('aria-live')).toBe('polite');
    type('messages', '1');
    type('messages', '10');
    type('messages', '100');
    expect(live.textContent).toBe('');
    jest.advanceTimersByTime(1000);
    expect(live.textContent).toContain('100 messages');
    expect(live.textContent).toContain('1s');
  });

  test('names the result card with its heading', () => {
    load('');
    const card = $('#demo-result-title').closest('.card');
    expect(card?.tagName).toBe('SECTION');
    expect(card?.getAttribute('aria-labelledby')).toBe('demo-result-title');
  });

  test('labels the rate as an average', () => {
    load('');
    expect($('[data-out="rate"]').closest('div')?.textContent).toContain('Average rate');
  });
});

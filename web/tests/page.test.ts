/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');
const page = new DOMParser().parseFromString(html, 'text/html');

const SECTION_IDS = [
  'demo',
  'steps',
  'limits',
  'retries',
  'idempotency',
  'limitations',
  'decisions',
  'run',
];

describe('index.html', () => {
  test('has a CSP meta that only allows self and Google Fonts', () => {
    const csp = page
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content');
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self' https://fonts.googleapis.com");
    expect(csp).not.toContain('unsafe-inline');
  });

  test('has exactly one h1', () => {
    expect(page.querySelectorAll('h1')).toHaveLength(1);
  });

  test('has header, main and footer landmarks', () => {
    expect(page.querySelector('body > header')).not.toBeNull();
    expect(page.querySelector('body > main')).not.toBeNull();
    expect(page.querySelector('body > footer')).not.toBeNull();
  });

  test.each(SECTION_IDS)('has section #%s with a heading', (id) => {
    const section = page.getElementById(id);
    expect(section?.tagName).toBe('SECTION');
    expect(section?.querySelector('h2')).not.toBeNull();
    expect(section?.getAttribute('aria-labelledby')).toBe(section?.querySelector('h2')?.id);
  });

  test('links the stylesheet and has no inline styles or scripts', () => {
    expect(page.querySelector('link[rel="stylesheet"][href="css/site.css"]')).not.toBeNull();
    expect(page.querySelectorAll('style, [style]')).toHaveLength(0);
    for (const script of page.querySelectorAll('script')) {
      expect(script.getAttribute('src')).toBeTruthy();
    }
  });
});

/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');
const readme = readFileSync(join(__dirname, '../../README.md'), 'utf8');

// Command lines only: comments and blank lines may differ between the page and the README.
const commands = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

function readmeCommands(): string[] {
  const start = readme.indexOf('## Run it');
  const end = readme.indexOf('\n## ', start + 1);
  const section = readme.slice(start, end === -1 ? undefined : end).replace(/\r\n/g, '\n');
  return [...section.matchAll(/```bash\n([\s\S]*?)```/g)].flatMap((block) =>
    commands(block[1] ?? ''),
  );
}

const sectionDetails = (id: string) => [
  ...document.querySelectorAll<HTMLDetailsElement>(`#${id} details`),
];

beforeEach(() => {
  document.documentElement.innerHTML = new DOMParser().parseFromString(
    html,
    'text/html',
  ).documentElement.innerHTML;
});

describe('explanatory sections', () => {
  test('known limitations list the five gateway findings, each with its fix', () => {
    const titles = [...document.querySelectorAll('#limitations h3')].map((h) => h.textContent);
    expect(titles).toHaveLength(5);
    const fixes = sectionDetails('limitations');
    expect(fixes).toHaveLength(5);
    for (const fix of fixes)
      expect(fix.querySelector('summary')?.textContent).toBe('How would it be fixed?');
  });

  test('design decisions are questions with an answer', () => {
    const decisions = sectionDetails('decisions');
    expect(decisions).toHaveLength(6);
    for (const decision of decisions)
      expect(decision.querySelector('summary')?.textContent).toMatch(/\?$/);
  });

  test('every <details> starts closed and opens from its summary', () => {
    const all = ['limitations', 'decisions', 'run'].flatMap(sectionDetails);
    expect(all.length).toBeGreaterThan(0);
    for (const details of all) {
      const summary = details.querySelector('summary');
      expect(details.open).toBe(false);
      expect(summary?.textContent?.trim()).not.toBe('');
      // The answer is real content after the summary, not an empty box.
      expect(details.textContent?.length).toBeGreaterThan((summary?.textContent?.length ?? 0) + 20);
      summary?.click();
      expect(details.open).toBe(true);
    }
  });

  test('"Run it for real" shows the same commands as the README', () => {
    const page = [...document.querySelectorAll('#run pre code')].flatMap((code) =>
      commands(code.textContent ?? ''),
    );
    const expected = readmeCommands();
    expect(expected.length).toBeGreaterThan(0);
    expect(page).toEqual(expected);
  });

  test('every box that can scroll sideways is a named region reachable with the keyboard', () => {
    const boxes = [...document.querySelectorAll('.table-scroll, #run pre')];
    expect(boxes.length).toBe(4);
    for (const box of boxes) {
      expect(box.getAttribute('tabindex')).toBe('0');
      expect(box.getAttribute('role')).toBe('region');
      expect(box.getAttribute('aria-label')).toBeTruthy();
    }
  });

  test('the footer says the page calls no service', () => {
    expect(document.querySelector('.site-footer')?.textContent).toMatch(
      /never calls a real service/,
    );
  });
});

import { formatDuration } from '../model/format';
import { DEFAULT_POLICY, type Policy } from '../model/policy';

function element(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`Retries: missing ${selector}`);
  return found;
}

/** Fills the backoff timeline of section 3 from the policy: retry n waits 2^(n-1) × the base delay. */
export function initRetries(policy: Policy = DEFAULT_POLICY): void {
  const timeline = element('#retries-timeline');
  const items: HTMLLIElement[] = [];
  let atMs = 0;
  let lastAtMs = 0;

  for (let attempt = 1; attempt <= policy.attempts; attempt++) {
    lastAtMs = atMs;
    const li = document.createElement('li');
    const last = attempt === policy.attempts;
    const waitMs = 2 ** (attempt - 1) * policy.backoff.delayMs;
    const label = document.createElement('strong');
    label.textContent = `Attempt ${attempt}`;
    const outcome = document.createElement('span');
    outcome.textContent = last ? 'FAILED' : `waits ${formatDuration(waitMs)}`;
    outcome.className = last ? 'status-failed' : 'status-retrying';
    li.append(label, ` at ${formatDuration(atMs)}, then `, outcome);
    items.push(li);
    atMs += waitMs;
  }
  timeline.replaceChildren(...items);

  element('#retries-summary').textContent =
    `A message gets ${policy.attempts} attempts. ` +
    `If every one fails, it ends FAILED ${formatDuration(lastAtMs)} after the first.`;
}

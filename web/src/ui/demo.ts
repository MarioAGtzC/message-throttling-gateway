import { formatDuration, formatNumber } from '../model/format';
import {
  FIELDS,
  defaultParams,
  isCustom,
  parseParams,
  parseValue,
  toHash,
  type Params,
} from '../model/params';
import { computeResult, type BurstResult } from '../model/result';

const ANNOUNCE_DELAY_MS = 1000;
const smallRate = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2 });

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Live demo: missing ${selector}`);
  return found;
}

function formatRate(perSec: number): string {
  return `${perSec >= 1 ? formatNumber(perSec) : smallRate.format(perSec)} msg/s`;
}

/** Wires the live demo panel in index.html: inputs, result card, badge, hash and announcements. */
export function initDemo(): void {
  const form = element<HTMLFormElement>('#demo form');
  const custom = element('#demo-custom');
  const ignoredNote = element('#demo-ignored');
  const estimated = element('#demo-estimated');
  const announce = element('#demo-announce');
  const inputs = new Map(
    FIELDS.map((field) => [field, element<HTMLInputElement>(`#demo input[name="${field.key}"]`)]),
  );
  let params: Params = defaultParams();
  let announceTimer: ReturnType<typeof setTimeout> | undefined;

  const out = (name: keyof BurstResult | 'time' | 'rate', text: string) => {
    element(`#demo [data-out="${name}"]`).textContent = text;
  };

  function render(): BurstResult {
    const result = computeResult(params);
    out('time', formatDuration(result.durationMs));
    out('rate', formatRate(result.ratePerSec));
    for (const key of ['sent', 'count429', 'retries', 'failed', 'lost', 'duplicated'] as const) {
      out(key, formatNumber(result[key]));
    }
    estimated.hidden = !result.estimated;
    custom.hidden = !isCustom(params);
    return result;
  }

  function fillInputs() {
    for (const [field, input] of inputs) {
      input.value = String(field.get(params));
      input.setAttribute('aria-invalid', 'false');
    }
  }

  function syncHash() {
    history.replaceState(null, '', toHash(params) || location.pathname + location.search);
  }

  function showIgnored(keys: string[]) {
    ignoredNote.hidden = keys.length === 0;
    // Keys come from the link: rendered as text only and capped.
    ignoredNote.textContent = `Ignored from the link (unknown or out of range): ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ', …' : ''}.`;
  }

  function loadFromHash() {
    const parsed = parseParams(location.hash);
    params = parsed.params;
    showIgnored(parsed.ignored);
    fillInputs();
    render();
  }

  // Debounced so a screen reader hears one summary per change, never more than once a second.
  function scheduleAnnouncement(result: BurstResult) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      announce.textContent =
        `${formatNumber(params.messages)} messages: sent ${formatNumber(result.sent)} in ` +
        `${formatDuration(result.durationMs)}, ${formatNumber(result.failed)} failed` +
        `${result.estimated ? ', estimated' : ''}.`;
    }, ANNOUNCE_DELAY_MS);
  }

  form.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement;
    const field = FIELDS.find((f) => f.key === input.name);
    if (!field) return;
    const value = parseValue(field, input.value);
    input.setAttribute('aria-invalid', String(value === undefined));
    if (value === undefined) return;
    field.set(params, value);
    syncHash();
    scheduleAnnouncement(render());
  });
  form.addEventListener('submit', (event) => event.preventDefault());

  element('#demo-reset').addEventListener('click', () => {
    params = defaultParams();
    showIgnored([]);
    fillInputs();
    syncHash();
    scheduleAnnouncement(render());
  });

  window.addEventListener('hashchange', loadFromHash);
  loadFromHash();
}

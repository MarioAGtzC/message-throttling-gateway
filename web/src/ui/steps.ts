import { formatNumber } from '../model/format';
import { SCENARIOS, type Scenario } from '../model/scenarios';
import { renderDiagram } from './diagram';

function element<T extends Element = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Step by step: missing ${selector}`);
  return found;
}

const ms = (value: number) => `${formatNumber(value)} ms`;

/** Wires the step-by-step section in index.html: scenario selector, buttons and side panel. */
export function initSteps(): void {
  const select = element<HTMLSelectElement>('#steps-scenario');
  const prev = element<HTMLButtonElement>('#steps-prev');
  const next = element<HTMLButtonElement>('#steps-next');
  const last = element<HTMLButtonElement>('#steps-last');
  const counter = element('#steps-counter');
  const clock = element('#steps-clock');
  const narration = element('#steps-narration');
  const waiting = element('#steps-waiting');
  const delayed = element('#steps-delayed');
  const worker = element('#steps-worker');
  const provider = element('#steps-provider');
  const rows = element('#steps-rows');
  const diagram = element<SVGSVGElement>('#steps-diagram');

  select.replaceChildren(...SCENARIOS.map((s) => new Option(s.title, s.id)));
  let scenario: Scenario = SCENARIOS[0] as Scenario;
  let index = 0;

  function render() {
    const step = scenario.steps[index];
    if (!step) return;
    const { max } = scenario.limit;
    const end = scenario.steps.length - 1;

    counter.textContent = `Step ${index + 1} of ${end + 1}`;
    clock.textContent = `t = ${ms(step.clockMs)}`;
    narration.textContent = step.narration;
    renderDiagram(diagram, step);
    waiting.textContent = step.waiting.join(', ') || 'empty';
    delayed.textContent =
      step.delayed
        .map((job) => `${job.id} until ${ms(job.dueMs)} (retry ${job.retry})`)
        .join(', ') || 'empty';
    worker.textContent = `${step.workerWindow} / ${max}`;
    provider.textContent = `${step.providerWindow} / ${max}`;
    rows.replaceChildren(
      ...Object.entries(step.rows).map(([id, row]) => {
        const tr = document.createElement('tr');
        for (const text of [id, row.status, String(row.retries), String(row.attempts)]) {
          tr.insertCell().textContent = text;
        }
        tr.cells[1]?.classList.add(`status-${row.status.toLowerCase()}`);
        return tr;
      }),
    );

    const focused = document.activeElement;
    prev.disabled = index === 0;
    next.disabled = last.disabled = index === end;
    // A disabled button drops keyboard focus to <body>; hand it to the button that still works.
    if (focused instanceof HTMLButtonElement && focused.disabled)
      (prev.disabled ? next : prev).focus();
  }

  function go(to: number) {
    index = Math.max(0, Math.min(to, scenario.steps.length - 1));
    render();
  }

  prev.addEventListener('click', () => go(index - 1));
  next.addEventListener('click', () => go(index + 1));
  last.addEventListener('click', () => go(scenario.steps.length - 1));
  select.addEventListener('change', () => {
    scenario = SCENARIOS.find((s) => s.id === select.value) ?? scenario;
    go(0);
  });

  render();
}

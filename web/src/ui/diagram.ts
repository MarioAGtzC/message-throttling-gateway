import type { Hop, Step } from '../model/scenarios';

const HOP_NAMES: Record<Hop, string> = {
  intake: 'Mock A to Service B',
  queue: 'Service B queue to Worker',
  provider: 'Worker to Mock C',
};

/** Highlights the step's hop in the flow diagram and updates its counters and text summary. */
export function renderDiagram(svg: SVGSVGElement, step: Step): void {
  const rows = Object.values(step.rows);
  const counts: Record<Hop, string> = {
    intake: `${rows.length} saved`,
    queue: `${step.waiting.length + step.delayed.length} queued`,
    provider: `${rows.filter((row) => row.status === 'SENT').length} sent`,
  };

  for (const group of svg.querySelectorAll<SVGGElement>('[data-hop]')) {
    const hop = group.dataset.hop as Hop;
    const isActive = hop === step.hop;
    group.setAttribute('data-active', String(isActive));
    const count = group.querySelector('.hop-count');
    if (count)
      count.textContent = counts[hop] + (isActive && step.call ? ` · ${step.call.status}` : '');
  }

  const summary = (Object.keys(HOP_NAMES) as Hop[]).map(
    (hop) => `${HOP_NAMES[hop]}: ${counts[hop]}`,
  );
  const activeText = step.hop
    ? `Active: ${HOP_NAMES[step.hop]}${step.call ? `, answer ${step.call.status}` : ''}.`
    : 'No request in flight.';
  svg.setAttribute('aria-label', `Flow diagram. ${summary.join('; ')}. ${activeText}`);
}

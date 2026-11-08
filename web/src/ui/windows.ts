import { TIMELINE, timelineRows, type TimeWindow } from '../model/windows';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LEFT = 20;
const WIDTH = 300;
const x = (ms: number) => LEFT + (Math.min(ms, TIMELINE.durationMs) / TIMELINE.durationMs) * WIDTH;

function svg(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function element<T extends Element = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Two limits: missing ${selector}`);
  return found;
}

function lane(name: string, label: string, y: number, windows: TimeWindow[]): SVGElement {
  const group = svg('g', { class: `lane lane-${name}` });
  group.append(svg('text', { x: LEFT, y: y - 6 }, label));
  for (const w of windows) {
    group.append(
      svg('rect', {
        class: 'window',
        x: x(w.startMs),
        y,
        width: x(w.endMs) - x(w.startMs),
        height: 22,
      }),
    );
  }
  return group;
}

/** Draws the two-windows timeline and fills its "Show data" table from the same dataset. */
export function initWindows(): void {
  const chart = element<SVGSVGElement>('#limits-chart');
  const body = element('#limits-rows');
  const rows = timelineRows(TIMELINE);
  const { limit } = TIMELINE;

  const sends = svg('g', { class: 'sends' });
  for (const row of rows) {
    const at = x(row.atMs);
    // One mark per request, drawn inside both lanes so it never crosses their labels.
    sends.append(svg('path', { class: `send send-${row.status}`, d: `M${at} 24V46M${at} 74V96` }));
    if (row.status === 429)
      sends.append(svg('text', { class: 'send-label', x: at, y: 110 }, '429'));
  }

  const axis = svg('g', { class: 'axis' });
  axis.append(svg('line', { x1: x(0), y1: 124, x2: x(TIMELINE.durationMs), y2: 124 }));
  for (let ms = 0; ms <= TIMELINE.durationMs; ms += TIMELINE.windowMs) {
    axis.append(svg('line', { x1: x(ms), y1: 120, x2: x(ms), y2: 128 }));
    axis.append(svg('text', { x: x(ms), y: 142 }, `${ms / 1000} s`));
  }

  chart.replaceChildren(
    lane('worker', `Worker: ${limit} jobs per window`, 24, TIMELINE.workerWindows),
    lane('provider', `Mock C: ${limit} requests per window`, 74, TIMELINE.providerWindows),
    sends,
    axis,
  );

  const rejected = rows
    .filter((row) => row.status === 429)
    .map((row) => `${row.id} at ${row.atMs} ms`);
  chart.setAttribute(
    'aria-label',
    `Timeline of ${TIMELINE.durationMs / 1000} seconds. The worker windows open at ` +
      TIMELINE.workerWindows.map((w) => `${w.startMs} ms`).join(', ') +
      '; Mock C windows open at ' +
      TIMELINE.providerWindows.map((w) => `${w.startMs} ms`).join(', ') +
      `. ${rows.length} requests, ${rejected.length} answered 429: ${rejected.join(' and ')}.`,
  );

  body.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement('tr');
      for (const text of [
        `${row.atMs} ms`,
        row.id,
        String(row.workerWindow),
        `${row.providerWindow} (${row.providerCount} / ${limit})`,
        String(row.status),
      ]) {
        tr.insertCell().textContent = text;
      }
      // A 429 leaves the message RETRYING, not FAILED.
      tr.cells[4]?.classList.add(row.status === 429 ? 'status-retrying' : 'status-sent');
      return tr;
    }),
  );
}

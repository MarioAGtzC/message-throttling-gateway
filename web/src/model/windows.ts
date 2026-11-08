export interface TimeWindow {
  startMs: number;
  endMs: number;
}

export interface Send {
  id: string;
  /** When the request reaches Mock C. */
  atMs: number;
  status: 200 | 429;
}

export interface Timeline {
  durationMs: number;
  /** Both limits, scaled down like the step-by-step scenarios. */
  limit: number;
  windowMs: number;
  workerWindows: TimeWindow[];
  providerWindows: TimeWindow[];
  sends: Send[];
}

/**
 * Three seconds of a backlog of nine messages, both limits at 3 per 1000 ms.
 * The worker opens a window every second; each job takes about 250 ms. Mock C opens its
 * window with the first request after the previous one ended, so a request that arrives
 * faster than the one that opened Mock C's window lands in a window that is already full.
 */
export const TIMELINE: Readonly<Timeline> = {
  durationMs: 3000,
  limit: 3,
  windowMs: 1000,
  workerWindows: [
    { startMs: 0, endMs: 1000 },
    { startMs: 1000, endMs: 2000 },
    { startMs: 2000, endMs: 3000 },
  ],
  providerWindows: [
    { startMs: 80, endMs: 1080 },
    { startMs: 1280, endMs: 2280 },
    { startMs: 2530, endMs: 3530 },
  ],
  sends: [
    { id: 'm1', atMs: 80, status: 200 },
    { id: 'm2', atMs: 300, status: 200 },
    { id: 'm3', atMs: 550, status: 200 },
    { id: 'm4', atMs: 1030, status: 429 },
    { id: 'm5', atMs: 1280, status: 200 },
    { id: 'm6', atMs: 1530, status: 200 },
    { id: 'm7', atMs: 2030, status: 200 },
    { id: 'm8', atMs: 2270, status: 429 },
    { id: 'm9', atMs: 2530, status: 200 },
  ],
};

export interface TimelineRow extends Send {
  /** 1-based; 0 when no window contains the send. */
  workerWindow: number;
  providerWindow: number;
  /** Requests Mock C has counted in that window, this one included (429s count too). */
  providerCount: number;
}

const windowOf = (windows: TimeWindow[], atMs: number) =>
  windows.findIndex((w) => atMs >= w.startMs && atMs < w.endMs) + 1;

export function timelineRows(timeline: Timeline): TimelineRow[] {
  const counts = new Map<number, number>();
  return timeline.sends.map((send) => {
    const providerWindow = windowOf(timeline.providerWindows, send.atMs);
    const providerCount = (counts.get(providerWindow) ?? 0) + 1;
    counts.set(providerWindow, providerCount);
    return {
      ...send,
      workerWindow: windowOf(timeline.workerWindows, send.atMs),
      providerWindow,
      providerCount,
    };
  });
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Policy } from '../../src/model/policy';

export const SOURCE_FILES = {
  queue: 'service-b/src/config/queue.ts',
  worker: 'service-b/src/config/worker.ts',
  provider: 'mock-c/src/index.ts',
  producer: 'mock-a/src/index.ts',
} as const;

export type Sources = Record<keyof typeof SOURCE_FILES, string>;

export function readSources(repoRoot = join(__dirname, '..', '..', '..')): Sources {
  const read = (path: string) => readFileSync(join(repoRoot, path), 'utf8');
  return {
    queue: read(SOURCE_FILES.queue),
    worker: read(SOURCE_FILES.worker),
    provider: read(SOURCE_FILES.provider),
    producer: read(SOURCE_FILES.producer),
  };
}

// Text from `marker` to the first closing brace after it.
function block(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const end = source.indexOf('}', start);
  return source.slice(start, end === -1 ? undefined : end);
}

function num(text: string, pattern: RegExp): number | undefined {
  const match = pattern.exec(text);
  return match?.[1] === undefined ? undefined : Number(match[1].replace(/_/g, ''));
}

type Value = number | string | undefined;
interface Check {
  file: string;
  name: string;
  actual: Value;
  expected: Value;
}

/** Lists every value in the real code that differs from the demo defaults; empty when they match. */
export function diffPolicy(sources: Sources, policy: Policy): string[] {
  const backoff = block(sources.queue, 'backoff:');
  const limiter = block(sources.worker, 'limiter:');
  const providerLimiter = block(sources.provider, 'rateLimit(');
  const simulate = sources.producer.slice(sources.producer.indexOf("app.post('/simulate',"));

  const checks: Check[] = [
    {
      file: SOURCE_FILES.queue,
      name: 'attempts',
      actual: num(sources.queue, /attempts:\s*([\d_]+)/),
      expected: policy.attempts,
    },
    {
      file: SOURCE_FILES.queue,
      name: 'backoff type',
      actual: /type:\s*'(\w+)'/.exec(backoff)?.[1],
      expected: policy.backoff.type,
    },
    {
      file: SOURCE_FILES.queue,
      name: 'backoff delay',
      actual: num(backoff, /delay:\s*([\d_]+)/),
      expected: policy.backoff.delayMs,
    },
    {
      file: SOURCE_FILES.worker,
      name: 'limiter max',
      actual: num(limiter, /max:\s*([\d_]+)/),
      expected: policy.workerLimit.max,
    },
    {
      file: SOURCE_FILES.worker,
      name: 'limiter duration',
      actual: num(limiter, /duration:\s*([\d_]+)/),
      expected: policy.workerLimit.windowMs,
    },
    {
      // BullMQ uses 1 when the worker does not set it.
      file: SOURCE_FILES.worker,
      name: 'concurrency',
      actual: num(sources.worker, /concurrency:\s*([\d_]+)/) ?? 1,
      expected: policy.concurrency,
    },
    {
      file: SOURCE_FILES.provider,
      name: 'rate limit max',
      actual: num(providerLimiter, /max:\s*([\d_]+)/),
      expected: policy.providerLimit.max,
    },
    {
      file: SOURCE_FILES.provider,
      name: 'rate limit windowMs',
      actual: num(providerLimiter, /windowMs:\s*([\d_]+)/),
      expected: policy.providerLimit.windowMs,
    },
    {
      file: SOURCE_FILES.producer,
      name: 'default burst size',
      actual: num(simulate, /\|\|\s*([\d_]+)/),
      expected: policy.messages,
    },
  ];

  return checks
    .filter((c) => c.actual !== c.expected)
    .map(
      (c) =>
        `${c.file}: ${c.name} is ${c.actual ?? 'not found'}, demo default is ${String(c.expected)}`,
    );
}

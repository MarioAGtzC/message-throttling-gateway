import { DEFAULT_POLICY } from '../src/model/policy';
import { diffPolicy, readSources, SOURCE_FILES } from './support/source-policy';

describe('DEFAULT_POLICY', () => {
  const sources = readSources();

  test('matches the numbers in the gateway and mock code', () => {
    expect(diffPolicy(sources, DEFAULT_POLICY)).toEqual([]);
  });

  test('reports the file and value when the code changes', () => {
    const changed = { ...sources, queue: sources.queue.replace('attempts: 5', 'attempts: 6') };

    expect(diffPolicy(changed, DEFAULT_POLICY)).toEqual([
      `${SOURCE_FILES.queue}: attempts is 6, demo default is 5`,
    ]);
  });

  test('reports a value it can no longer find', () => {
    const changed = { ...sources, worker: sources.worker.replace(/limiter:[^}]*}/, '') };

    expect(diffPolicy(changed, DEFAULT_POLICY)).toEqual([
      `${SOURCE_FILES.worker}: limiter max is not found, demo default is 100`,
      `${SOURCE_FILES.worker}: limiter duration is not found, demo default is 1000`,
    ]);
  });

  test('reports an explicit worker concurrency that differs', () => {
    const changed = {
      ...sources,
      worker: sources.worker.replace('connection,', 'connection, concurrency: 5,'),
    };

    expect(diffPolicy(changed, DEFAULT_POLICY)).toEqual([
      `${SOURCE_FILES.worker}: concurrency is 5, demo default is 1`,
    ]);
  });
});

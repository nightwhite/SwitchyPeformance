import { describe, expect, it, vi } from 'vitest';

import { createDiagnosticsRepository } from './diagnostics-repository.ts';

describe('createDiagnosticsRepository', () => {
  it('keeps only the newest bounded diagnostic events', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const repository = createDiagnosticsRepository(
      { read: vi.fn().mockResolvedValue([]), write },
      { clock: () => 1234, id: (sequence) => `event-${sequence}`, limit: 3 }
    );

    await repository.append({ level: 'info', message: 'one', scope: 'configuration' });
    await repository.append({ level: 'error', message: 'two', scope: 'proxy' });
    await repository.append({ level: 'error', message: 'three', scope: 'network' });
    const events = await repository.append({ level: 'info', message: 'four', scope: 'runtime' });

    expect(events.map((event) => event.message)).toEqual(['two', 'three', 'four']);
    expect(events[2]).toMatchObject({ id: 'event-4', timestamp: 1234 });
    expect(write).toHaveBeenLastCalledWith(events);
  });

  it('rejects corrupt persisted logs rather than treating them as healthy data', async () => {
    const repository = createDiagnosticsRepository({
      read: vi.fn().mockResolvedValue([{ message: 42 }]),
      write: vi.fn().mockResolvedValue(undefined)
    });

    await expect(repository.list()).rejects.toThrow('Stored diagnostics are invalid');
  });
});

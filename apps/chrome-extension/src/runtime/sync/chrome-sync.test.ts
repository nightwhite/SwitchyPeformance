import { describe, expect, it } from 'vitest';

import { createChromeSyncStore } from './chrome-sync.ts';
import { syncEnvelopeFixture } from './sync-test-fixture.ts';

describe('Chrome sync store', () => {
  it('splits a sync envelope into bounded chunks and restores it losslessly', async () => {
    const storage = memoryStorage();
    const store = createChromeSyncStore(storage, { chunkCharacterLimit: 64 });
    const envelope = syncEnvelopeFixture();

    await store.save(envelope);

    expect(
      Object.keys(storage.values).filter((key) => key.includes('.chunk.')).length
    ).toBeGreaterThan(1);
    await expect(store.load()).resolves.toEqual(envelope);
  });

  it('rejects an incomplete chunk set instead of reading a partial remote configuration', async () => {
    const storage = memoryStorage();
    const store = createChromeSyncStore(storage, { chunkCharacterLimit: 64 });

    await store.save(syncEnvelopeFixture());
    const chunk = Object.keys(storage.values).find((key) => key.includes('.chunk.'));
    if (!chunk) {
      throw new Error('测试没有写入同步分片');
    }
    delete storage.values[chunk];

    await expect(store.load()).rejects.toThrow('同步数据不完整');
  });
});

function memoryStorage() {
  const values: Record<string, unknown> = {};
  return {
    values,
    async get(keys: readonly string[]) {
      return Object.fromEntries(keys.map((key) => [key, values[key]]));
    },
    async remove(keys: readonly string[]) {
      for (const key of keys) {
        delete values[key];
      }
    },
    async set(next: Record<string, unknown>) {
      Object.assign(values, next);
    }
  };
}

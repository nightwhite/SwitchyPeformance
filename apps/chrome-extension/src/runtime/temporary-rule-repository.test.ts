import { describe, expect, it } from 'vitest';

import type { TemporaryRule } from './temporary-rule-service.ts';
import { createTemporaryRuleRepository } from './temporary-rule-repository.ts';

describe('temporary rule repository', () => {
  it('persists and returns independent temporary global rules', async () => {
    const storage = memoryStorage();
    const repository = createTemporaryRuleRepository(storage);
    const rule = temporaryRule();

    await repository.replace([rule]);
    const loaded = await repository.load();

    expect(loaded).toEqual([rule]);
    expect(loaded[0]).not.toBe(rule);
    expect(storage.writes).toEqual([[rule]]);
  });

  it('rejects invalid session data instead of passing it to the PAC compiler', async () => {
    const storage = memoryStorage([{ id: 'missing-required-fields' }]);
    const repository = createTemporaryRuleRepository(storage);

    await expect(repository.load()).rejects.toThrow('保存的临时规则无效');
  });
});

function temporaryRule(): TemporaryRule {
  return {
    automaticProfileId: 'automatic',
    createdAt: 100,
    expiresAt: 10_000,
    host: 'www.example.test',
    id: 'temporary-1',
    rule: {
      condition: { type: 'host-wildcard', pattern: '*.example.test' },
      enabled: true,
      id: 'temporary-1',
      target: { profileId: 'fixed' }
    },
    schemaVersion: 2,
    scope: 'global'
  };
}

function memoryStorage(initial: unknown = undefined) {
  let value = initial;
  const writes: unknown[] = [];
  return {
    writes,
    async read(): Promise<unknown> {
      return value;
    },
    async write(next: unknown): Promise<void> {
      writes.push(next);
      value = next;
    }
  };
}

import { describe, expect, it, vi } from 'vitest';

import { createSourceStatusRepository } from './source-status-repository.ts';

describe('source status repository', () => {
  it('keeps the last successful PAC content when a later refresh fails', async () => {
    const storage = memoryStorage();
    const repository = createSourceStatusRepository(storage);

    await repository.saveContent({
      byteLength: 44,
      etag: 'tag-1',
      fetchedAt: 1_000,
      sourceId: 'pac:company',
      text: 'function FindProxyForURL(){return "DIRECT";}',
      url: 'https://pac.example.test/proxy.pac'
    });
    await repository.saveFailure({
      error: '下载超时',
      failedAt: 2_000,
      sourceId: 'pac:company',
      url: 'https://pac.example.test/proxy.pac'
    });

    await expect(repository.get('pac:company')).resolves.toEqual({
      byteLength: 44,
      etag: 'tag-1',
      lastError: '下载超时',
      lastErrorAt: 2_000,
      lastSuccessAt: 1_000,
      sourceId: 'pac:company',
      text: 'function FindProxyForURL(){return "DIRECT";}',
      url: 'https://pac.example.test/proxy.pac'
    });
  });

  it('clears a prior error when fresh PAC content is saved', async () => {
    const storage = memoryStorage();
    const repository = createSourceStatusRepository(storage);
    await repository.saveFailure({
      error: 'HTTP 503',
      failedAt: 1_000,
      sourceId: 'pac:company',
      url: 'https://pac.example.test/proxy.pac'
    });

    await repository.saveContent({
      byteLength: 44,
      fetchedAt: 2_000,
      lastModified: 'Wed, 29 Jul 2026 00:00:00 GMT',
      sourceId: 'pac:company',
      text: 'function FindProxyForURL(){return "DIRECT";}',
      url: 'https://pac.example.test/proxy.pac'
    });

    await expect(repository.get('pac:company')).resolves.toEqual({
      byteLength: 44,
      lastModified: 'Wed, 29 Jul 2026 00:00:00 GMT',
      lastSuccessAt: 2_000,
      sourceId: 'pac:company',
      text: 'function FindProxyForURL(){return "DIRECT";}',
      url: 'https://pac.example.test/proxy.pac'
    });
  });

  it('updates the freshness time for a 304 response without replacing cached text', async () => {
    const storage = memoryStorage();
    const repository = createSourceStatusRepository(storage);
    await repository.saveContent({
      byteLength: 44,
      etag: 'tag-1',
      fetchedAt: 1_000,
      sourceId: 'pac:company',
      text: 'function FindProxyForURL(){return "DIRECT";}',
      url: 'https://pac.example.test/proxy.pac'
    });

    await repository.saveNotModified({
      etag: 'tag-2',
      fetchedAt: 2_000,
      sourceId: 'pac:company'
    });

    await expect(repository.get('pac:company')).resolves.toMatchObject({
      etag: 'tag-2',
      lastSuccessAt: 2_000,
      text: 'function FindProxyForURL(){return "DIRECT";}'
    });
  });

  it('ignores malformed stored records instead of exposing unknown data', async () => {
    const storage = memoryStorage({ 'pac:company': { sourceId: 42 } });
    const repository = createSourceStatusRepository(storage);

    await expect(repository.get('pac:company')).resolves.toBeUndefined();
    expect(storage.read).toHaveBeenCalled();
  });

  it('evicts the oldest cached source text before exceeding the configured cache budget', async () => {
    const storage = memoryStorage();
    const repository = createSourceStatusRepository(storage, { maxCacheBytes: 8 });

    await repository.saveContent({
      byteLength: 6,
      etag: 'old-tag',
      fetchedAt: 1_000,
      sourceId: 'rule-list:old',
      text: '123456',
      url: 'https://rules.example/old.txt'
    });
    await repository.saveContent({
      byteLength: 6,
      etag: 'new-tag',
      fetchedAt: 2_000,
      sourceId: 'rule-list:new',
      text: 'abcdef',
      url: 'https://rules.example/new.txt'
    });

    await expect(repository.get('rule-list:old')).resolves.toMatchObject({
      byteLength: 6,
      lastSuccessAt: 1_000,
      sourceId: 'rule-list:old',
      url: 'https://rules.example/old.txt'
    });
    await expect(repository.get('rule-list:old')).resolves.not.toHaveProperty('text');
    await expect(repository.get('rule-list:old')).resolves.not.toHaveProperty('etag');
    await expect(repository.get('rule-list:new')).resolves.toMatchObject({
      etag: 'new-tag',
      text: 'abcdef'
    });
  });

  it('stores parsed rule-list statistics next to the downloaded source status', async () => {
    const repository = createSourceStatusRepository(memoryStorage());
    await repository.saveContent({
      byteLength: 16,
      etag: 'private-cache-tag',
      fetchedAt: 1_000,
      sourceId: 'rule-list:company',
      text: '||company.example',
      url: 'https://rules.example/company.txt'
    });

    await repository.saveRuleListStats({
      ruleCount: 12,
      sourceId: 'rule-list:company',
      warningCount: 2
    });

    await expect(repository.get('rule-list:company')).resolves.toMatchObject({
      ruleCount: 12,
      warningCount: 2
    });
  });

  it('returns metadata lists without copying cached rule text into UI messages', async () => {
    const repository = createSourceStatusRepository(memoryStorage());
    await repository.saveContent({
      byteLength: 16,
      etag: 'private-cache-tag',
      fetchedAt: 1_000,
      sourceId: 'rule-list:company',
      text: '||company.example',
      url: 'https://rules.example/company.txt'
    });

    const statuses = await repository.list();
    expect(statuses).toEqual([
      {
        byteLength: 16,
        lastSuccessAt: 1_000,
        sourceId: 'rule-list:company',
        url: 'https://rules.example/company.txt'
      }
    ]);
    expect(statuses[0]).not.toHaveProperty('etag');
  });
});

function memoryStorage(initial: unknown = {}) {
  let value = initial;
  return {
    read: vi.fn(async () => value),
    write: vi.fn(async (next: unknown) => {
      value = next;
    })
  };
}

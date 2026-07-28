import { describe, expect, it, vi } from 'vitest';

import { createRemoteTextSourceService } from './remote-text-source-service.ts';
import { createSourceStatusRepository } from './source-status-repository.ts';

describe('remote text source service', () => {
  it('uses a same-address cache during application without fetching', async () => {
    const statuses = memoryStatusRepository();
    await statuses.saveContent({
      byteLength: 16,
      fetchedAt: 1_000,
      sourceId: 'rule-list:work',
      text: '||example.com',
      url: 'https://rules.example/work.txt'
    });
    const fetch = vi.fn();
    const service = createRemoteTextSourceService({
      contentKind: 'rule-list',
      fetcher: { fetch },
      statuses
    });

    await expect(service.resolveForApply(remoteSource())).resolves.toBe('||example.com');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses ETag on refresh and saves a new verified body', async () => {
    const statuses = memoryStatusRepository();
    await statuses.saveContent({
      byteLength: 16,
      etag: 'old-tag',
      fetchedAt: 1_000,
      sourceId: 'rule-list:work',
      text: '||old.example',
      url: 'https://rules.example/work.txt'
    });
    const fetch = vi.fn().mockResolvedValue({
      byteLength: 16,
      etag: 'new-tag',
      kind: 'content',
      text: '||new.example'
    });
    const service = createRemoteTextSourceService({
      clock: () => 2_000,
      contentKind: 'rule-list',
      fetcher: { fetch },
      statuses
    });

    await expect(service.refresh(remoteSource())).resolves.toBe('||new.example');
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ contentKind: 'rule-list', etag: 'old-tag' })
    );
    await expect(statuses.get('rule-list:work')).resolves.toMatchObject({
      etag: 'new-tag',
      lastSuccessAt: 2_000,
      text: '||new.example'
    });
  });

  it('keeps only a same-address cached version after a refresh failure', async () => {
    const statuses = memoryStatusRepository();
    await statuses.saveContent({
      byteLength: 16,
      fetchedAt: 1_000,
      sourceId: 'rule-list:work',
      text: '||old.example',
      url: 'https://rules.example/work.txt'
    });
    const service = createRemoteTextSourceService({
      clock: () => 2_000,
      contentKind: 'rule-list',
      fetcher: { fetch: vi.fn().mockRejectedValue(new Error('网络不可用')) },
      statuses
    });

    await expect(service.refresh(remoteSource())).resolves.toBe('||old.example');
    await expect(statuses.get('rule-list:work')).resolves.toMatchObject({
      lastError: '网络不可用',
      text: '||old.example'
    });
  });

  it('never uses a previous address cache for a new remote address', async () => {
    const statuses = memoryStatusRepository();
    await statuses.saveContent({
      byteLength: 16,
      fetchedAt: 1_000,
      sourceId: 'rule-list:work',
      text: '||old.example',
      url: 'https://old-rules.example/work.txt'
    });
    const service = createRemoteTextSourceService({
      contentKind: 'rule-list',
      fetcher: { fetch: vi.fn().mockRejectedValue(new Error('新地址不可用')) },
      statuses
    });

    await expect(service.resolveForApply(remoteSource())).rejects.toThrow('新地址不可用');
  });
});

function remoteSource() {
  return {
    headers: [{ name: 'Authorization', value: 'Bearer token' }],
    sourceId: 'rule-list:work',
    url: 'https://rules.example/work.txt'
  };
}

function memoryStatusRepository() {
  let value: unknown = {};
  return createSourceStatusRepository({
    async read() {
      return value;
    },
    async write(next) {
      value = next;
    }
  });
}

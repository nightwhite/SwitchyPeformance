import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { createPacSourceService, pacSourceStatusId } from './pac-source-service.ts';
import { createSourceStatusRepository } from './source-status-repository.ts';

describe('PAC source service', () => {
  it('downloads an uncached active remote PAC and applies it as inline text', async () => {
    const status = memoryStatusRepository();
    const fetch = vi.fn().mockResolvedValue({
      byteLength: 44,
      etag: 'tag-1',
      kind: 'content',
      text: 'function FindProxyForURL(){return "DIRECT";}'
    });
    const service = createPacSourceService({
      clock: () => 1_000,
      fetcher: { fetch },
      statuses: status
    });

    const resolved = await service.resolveForApply(remotePacDocument());

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: [{ name: 'Authorization', value: 'Bearer local-token' }],
        url: 'https://pac.example.test/company.pac'
      })
    );
    expect(activePacSource(resolved)).toEqual({
      kind: 'inline',
      text: 'function FindProxyForURL(){return "DIRECT";}'
    });
    await expect(status.get(pacSourceStatusId('pac-company'))).resolves.toMatchObject({
      etag: 'tag-1',
      lastSuccessAt: 1_000,
      url: 'https://pac.example.test/company.pac'
    });
  });

  it('uses a same-address cached PAC without requesting the network during application', async () => {
    const status = memoryStatusRepository();
    await status.saveContent({
      byteLength: 44,
      fetchedAt: 1_000,
      sourceId: pacSourceStatusId('pac-company'),
      text: 'function FindProxyForURL(){return "DIRECT";}',
      url: 'https://pac.example.test/company.pac'
    });
    const fetch = vi.fn();
    const service = createPacSourceService({
      clock: () => 2_000,
      fetcher: { fetch },
      statuses: status
    });

    const resolved = await service.resolveForApply(remotePacDocument());

    expect(fetch).not.toHaveBeenCalled();
    expect(activePacSource(resolved)).toEqual({
      kind: 'inline',
      text: 'function FindProxyForURL(){return "DIRECT";}'
    });
  });

  it('keeps a same-address cached PAC after an explicit refresh fails', async () => {
    const status = memoryStatusRepository();
    await status.saveContent({
      byteLength: 44,
      etag: 'tag-1',
      fetchedAt: 1_000,
      sourceId: pacSourceStatusId('pac-company'),
      text: 'function FindProxyForURL(){return "DIRECT";}',
      url: 'https://pac.example.test/company.pac'
    });
    const service = createPacSourceService({
      clock: () => 2_000,
      fetcher: { fetch: vi.fn().mockRejectedValue(new Error('网络超时')) },
      statuses: status
    });

    const resolved = await service.refreshAndResolve(remotePacDocument());

    expect(activePacSource(resolved)).toEqual({
      kind: 'inline',
      text: 'function FindProxyForURL(){return "DIRECT";}'
    });
    await expect(status.get(pacSourceStatusId('pac-company'))).resolves.toMatchObject({
      lastError: '网络超时',
      lastErrorAt: 2_000,
      text: 'function FindProxyForURL(){return "DIRECT";}'
    });
  });

  it('does not reuse a cached PAC from a different remote address', async () => {
    const status = memoryStatusRepository();
    await status.saveContent({
      byteLength: 44,
      fetchedAt: 1_000,
      sourceId: pacSourceStatusId('pac-company'),
      text: 'function FindProxyForURL(){return "DIRECT";}',
      url: 'https://old.example.test/company.pac'
    });
    const service = createPacSourceService({
      clock: () => 2_000,
      fetcher: { fetch: vi.fn().mockRejectedValue(new Error('新地址不可用')) },
      statuses: status
    });

    await expect(service.resolveForApply(remotePacDocument())).rejects.toThrow('新地址不可用');
    await expect(status.get(pacSourceStatusId('pac-company'))).resolves.toMatchObject({
      lastError: '新地址不可用',
      url: 'https://pac.example.test/company.pac'
    });
  });

  it('refreshes with ETag and keeps cached content for a 304 response', async () => {
    const status = memoryStatusRepository();
    await status.saveContent({
      byteLength: 44,
      etag: 'tag-1',
      fetchedAt: 1_000,
      sourceId: pacSourceStatusId('pac-company'),
      text: 'function FindProxyForURL(){return "DIRECT";}',
      url: 'https://pac.example.test/company.pac'
    });
    const fetch = vi.fn().mockResolvedValue({ etag: 'tag-2', kind: 'not-modified' });
    const service = createPacSourceService({
      clock: () => 2_000,
      fetcher: { fetch },
      statuses: status
    });

    const resolved = await service.refreshAndResolve(remotePacDocument());

    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ etag: 'tag-1' }));
    expect(activePacSource(resolved)).toEqual({
      kind: 'inline',
      text: 'function FindProxyForURL(){return "DIRECT";}'
    });
    await expect(status.get(pacSourceStatusId('pac-company'))).resolves.toMatchObject({
      etag: 'tag-2',
      lastSuccessAt: 2_000
    });
  });

  it('resolves the terminal PAC for a virtual active profile', async () => {
    const status = memoryStatusRepository();
    const service = createPacSourceService({
      clock: () => 1_000,
      fetcher: {
        fetch: vi.fn().mockResolvedValue({
          byteLength: 44,
          kind: 'content',
          text: 'function FindProxyForURL(){return "DIRECT";}'
        })
      },
      statuses: status
    });

    const resolved = await service.resolveForApply(remotePacDocument('company-entry'));

    expect(activePacSource(resolved)).toEqual({
      kind: 'inline',
      text: 'function FindProxyForURL(){return "DIRECT";}'
    });
  });

  it('refreshes a named inactive remote PAC without changing the active document', async () => {
    const status = memoryStatusRepository();
    const fetch = vi.fn().mockResolvedValue({
      byteLength: 44,
      kind: 'content',
      text: 'function FindProxyForURL(){return "DIRECT";}'
    });
    const service = createPacSourceService({
      clock: () => 3_000,
      fetcher: { fetch },
      statuses: status
    });
    const document = { ...remotePacDocument(), activeProfileId: 'direct' };

    await service.refreshSource(document, 'pac-company');

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://pac.example.test/company.pac' })
    );
    await expect(status.get(pacSourceStatusId('pac-company'))).resolves.toMatchObject({
      lastSuccessAt: 3_000,
      text: 'function FindProxyForURL(){return "DIRECT";}'
    });
    expect(document.activeProfileId).toBe('direct');
  });
});

function remotePacDocument(activeProfileId = 'pac-company'): ProfileDocumentV2 {
  return {
    activeProfileId,
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'pac-company',
        kind: 'pac',
        name: '公司 PAC',
        source: {
          headers: [{ name: 'Authorization', value: 'Bearer local-token' }],
          kind: 'url',
          refresh: { enabled: true, refreshMinutes: 60 },
          url: 'https://pac.example.test/company.pac'
        }
      },
      {
        id: 'company-entry',
        kind: 'virtual',
        name: '公司入口',
        target: { profileId: 'pac-company' }
      }
    ],
    proxyServers: [],
    ruleSources: [],
    schemaVersion: 2,
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: activeProfileId
    }
  };
}

function activePacSource(document: ProfileDocumentV2) {
  const profile = document.profiles.find((candidate) => candidate.id === 'pac-company');
  if (!profile || profile.kind !== 'pac') {
    throw new Error('测试数据缺少 PAC 配置');
  }
  return profile.source;
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

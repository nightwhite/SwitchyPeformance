import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import type { ConfigurationImportPreview } from '../configuration-import-service.ts';
import { createSyncEnvelope } from './sync-envelope.ts';
import {
  createSyncService,
  type SyncMetadata,
  type SyncProviderConfiguration,
  type SyncRemoteStore
} from './sync-service.ts';

describe('sync service', () => {
  it('shows a conflict preview and only overwrites the remote after the explicit keep-local action', async () => {
    const local = document('直连', 'direct');
    const remote = await createSyncEnvelope(document('远端代理', 'work'), 9, 1_000);
    const store = remoteStore({ envelope: remote, etag: '"remote-9"' });
    const preview = vi.fn((value: unknown) => previewFor(value));
    const { service, metadata } = createService({ local, preview, store });

    await expect(service.inspect()).resolves.toMatchObject({
      resolution: { action: 'require-user-choice' },
      remote: { digest: remote.digest }
    });
    expect(preview).toHaveBeenCalledWith(remote.document);

    await expect(service.keepLocal()).resolves.toMatchObject({ outcome: 'pushed-local' });
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ revision: 10 }), {
      etag: '"remote-9"'
    });
    expect(metadata.value.lastSyncedDigest).toBeDefined();
  });

  it('uses a remote configuration only after explicit confirmation and routes it through import preview', async () => {
    const local = document('直连', 'direct');
    const remote = await createSyncEnvelope(document('远端代理', 'work'), 4, 1_000);
    const store = remoteStore({ envelope: remote, etag: '"remote-4"' });
    const preview = vi.fn((value: unknown) => previewFor(value));
    const commit = vi.fn(async (value) => value);
    const { service } = createService({ commit, local, preview, store });

    await expect(service.useRemote()).resolves.toMatchObject({ outcome: 'applied-remote' });
    expect(preview).toHaveBeenCalledWith(remote.document);
    expect(commit).toHaveBeenCalledWith(remote.document);
    expect(store.save).not.toHaveBeenCalled();
  });

  it('never exposes a stored Gist token through status responses', async () => {
    const configuration: SyncProviderConfiguration = {
      fileName: 'switchypeformance.json',
      kind: 'gist'
    };
    const { service } = createService({
      local: document('直连', 'direct'),
      metadata: { provider: configuration, revision: 2 },
      secrets: { gistToken: 'private-github-token' },
      store: remoteStore(undefined)
    });

    const status = await service.status();

    expect(status).toMatchObject({ configured: true, credentialConfigured: true });
    expect(JSON.stringify(status)).not.toContain('private-github-token');
  });

  it('refuses an overwrite when a remote server has no version tag for concurrency protection', async () => {
    const remote = await createSyncEnvelope(document('远端代理', 'work'), 4, 1_000);
    const store = { ...remoteStore({ envelope: remote }), requiresVersionTagForOverwrite: true };
    const { service } = createService({ local: document('直连', 'direct'), store });

    await expect(service.keepLocal()).rejects.toThrow('远端没有提供版本标记');
    expect(store.save).not.toHaveBeenCalled();
  });
});

function createService({
  local,
  store,
  preview = (value: unknown) => previewFor(value),
  commit = async (value: unknown) => value,
  metadata = { provider: { kind: 'chrome-sync' }, revision: 1 },
  secrets = {}
}: {
  commit?: (value: unknown) => Promise<unknown>;
  local: ReturnType<typeof document>;
  metadata?: SyncMetadata;
  preview?: (value: unknown) => ConfigurationImportPreview;
  secrets?: { gistToken?: string; webDavPassword?: string };
  store: SyncRemoteStore;
}) {
  const metadataRepository = {
    value: structuredClone(metadata),
    async clear() {
      this.value = { revision: 0 };
    },
    async load() {
      return structuredClone(this.value);
    },
    async save(value: SyncMetadata) {
      this.value = structuredClone(value);
    }
  };
  const secretRepository = {
    value: structuredClone(secrets),
    async clear() {
      this.value = {};
    },
    async load() {
      return structuredClone(this.value);
    },
    async save(value: { gistToken?: string; webDavPassword?: string }) {
      this.value = structuredClone(value);
    }
  };
  return {
    metadata: metadataRepository,
    service: createSyncService({
      commit,
      loadConfiguration: async () => local,
      metadata: metadataRepository,
      now: () => 2_000,
      preview,
      remoteFactory: { create: () => store },
      secrets: secretRepository
    })
  };
}

function previewFor(value: unknown): ConfigurationImportPreview {
  return {
    counts: { profiles: 3, proxyServers: 1, rules: 0, skipped: 0 },
    document: value as ProfileDocumentV2,
    source: 'switchypeformance-v2',
    warnings: []
  };
}

function remoteStore(
  value: { envelope: Awaited<ReturnType<typeof createSyncEnvelope>>; etag?: string } | undefined
) {
  return {
    load: vi.fn(async () => value),
    save: vi.fn(async () => ({}))
  } satisfies SyncRemoteStore;
}

function document(name: string, activeProfileId: 'direct' | 'work') {
  return {
    activeProfileId,
    profiles: [
      { id: 'direct', kind: 'direct' as const, name },
      { id: 'system', kind: 'system' as const, name: '系统代理' },
      {
        bypassList: [],
        id: 'work',
        kind: 'fixed-proxy' as const,
        name: '工作代理',
        routes: { fallbackProxyId: 'proxy-work' }
      }
    ],
    proxyServers: [
      {
        host: 'proxy.example.test',
        id: 'proxy-work',
        name: '工作代理',
        port: 1080,
        scheme: 'socks5' as const
      }
    ],
    ruleSources: [],
    schemaVersion: 2 as const,
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last' as const,
      startupProfileId: activeProfileId
    }
  };
}

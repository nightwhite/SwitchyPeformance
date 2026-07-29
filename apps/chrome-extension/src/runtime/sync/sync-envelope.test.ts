import { describe, expect, it } from 'vitest';

import { createSyncEnvelope, verifySyncEnvelope } from './sync-envelope.ts';

describe('sync envelope integrity', () => {
  it('excludes local credential bindings before hashing and sharing a configuration', async () => {
    const envelope = await createSyncEnvelope(documentWithCredential(), 4, 1_000);

    expect(JSON.stringify(envelope)).not.toContain('credential-local-only');
    await expect(verifySyncEnvelope(envelope)).resolves.toEqual(envelope);
  });

  it('rejects a remotely altered document even when its outer shape is valid', async () => {
    const envelope = await createSyncEnvelope(documentWithCredential(), 4, 1_000);
    const altered = {
      ...envelope,
      document: { ...envelope.document, activeProfileId: 'system' }
    };

    await expect(verifySyncEnvelope(altered)).rejects.toThrow('同步数据摘要不匹配');
  });
});

function documentWithCredential() {
  return {
    activeProfileId: 'work',
    profiles: [
      { id: 'direct', kind: 'direct' as const, name: '直连' },
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
        credentialId: 'credential-local-only',
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
      startupProfileId: 'work'
    }
  };
}

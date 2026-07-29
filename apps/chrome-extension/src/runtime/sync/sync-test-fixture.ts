import type { SyncEnvelope } from '@switchypeformance/contracts';

export function syncEnvelopeFixture(): SyncEnvelope {
  return {
    digest: 'a'.repeat(64),
    document: {
      activeProfileId: 'direct',
      profiles: [
        { id: 'direct', kind: 'direct', name: '直连' },
        { id: 'system', kind: 'system', name: '系统代理' }
      ],
      proxyServers: [],
      ruleSources: [],
      schemaVersion: 2,
      settings: {
        networkMonitor: { enabled: false },
        reloadAfterProfileChange: false,
        ruleInsertPosition: 'last',
        startupProfileId: 'direct'
      }
    },
    revision: 3,
    schemaVersion: 2,
    updatedAt: 1_000
  };
}

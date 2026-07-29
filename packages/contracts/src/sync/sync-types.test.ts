import { describe, expect, it } from 'vitest';

import { parseSyncEnvelope } from './sync-types.ts';

describe('sync envelope', () => {
  it('accepts a validated V2 portable document with integrity metadata', () => {
    expect(parseSyncEnvelope(envelope())).toMatchObject({
      ok: true,
      value: { digest: 'a'.repeat(64), revision: 3, schemaVersion: 2 }
    });
  });

  it('rejects an invalid digest before remote configuration can be applied', () => {
    expect(parseSyncEnvelope({ ...envelope(), digest: 'not-a-sha256' })).toEqual({
      ok: false,
      error: '同步数据摘要无效'
    });
  });
});

function envelope() {
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

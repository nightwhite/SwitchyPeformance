import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { createTemporaryRoutingDocumentService } from './temporary-routing-document.ts';
import type { TemporaryRule } from './temporary-rule-service.ts';

describe('temporary routing document service', () => {
  it('creates an in-memory routing document without mutating saved configuration', async () => {
    const saved = v2Document();
    const temporaryRules = {
      list: vi.fn().mockResolvedValue([temporaryRule()])
    };
    const service = createTemporaryRoutingDocumentService({
      clock: () => 1_000,
      temporaryRules
    });

    const effective = await service.resolve(saved);

    expect(automatic(effective).rules.map((rule) => rule.id)).toEqual([
      'temporary-rule',
      'persistent-rule'
    ]);
    expect(automatic(saved).rules.map((rule) => rule.id)).toEqual(['persistent-rule']);
    expect(temporaryRules.list).toHaveBeenCalledWith(saved);
  });
});

function temporaryRule(): TemporaryRule {
  return {
    automaticProfileId: 'automatic',
    createdAt: 100,
    expiresAt: 10_000,
    host: 'temporary.example.test',
    id: 'temporary-rule',
    rule: {
      condition: { type: 'host-wildcard', pattern: '*.temporary.example.test' },
      enabled: true,
      id: 'temporary-rule',
      target: { profileId: 'fixed' }
    },
    schemaVersion: 2,
    scope: 'global'
  };
}

function automatic(document: ProfileDocumentV2) {
  const profile = document.profiles.find((candidate) => candidate.id === 'automatic');
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('测试数据缺少自动切换配置');
  }
  return profile;
}

function v2Document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'automatic',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'fixed',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'proxy-work' },
        bypassList: []
      },
      {
        id: 'automatic',
        kind: 'auto-switch',
        name: '自动切换',
        fallback: { profileId: 'direct' },
        loopbackPolicy: 'direct',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: [
          {
            id: 'persistent-rule',
            enabled: true,
            condition: { type: 'host-wildcard', pattern: '*.persistent.example.test' },
            target: { profileId: 'direct' }
          }
        ]
      }
    ],
    proxyServers: [
      {
        id: 'proxy-work',
        name: '工作节点',
        scheme: 'socks5',
        host: 'proxy.example.test',
        port: 1080
      }
    ],
    ruleSources: [],
    settings: {
      startupProfileId: 'automatic',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}

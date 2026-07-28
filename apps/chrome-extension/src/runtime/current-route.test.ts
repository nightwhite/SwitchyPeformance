import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocument, ProfileDocumentV2 } from '@switchypeformance/contracts';

import { createCurrentRouteExplainer } from './current-route.ts';

describe('current route explainer', () => {
  it('normalizes the V2 resolved route and matching rule for the popup', async () => {
    const explainV2 = vi.fn().mockResolvedValue({
      activeProfileId: 'virtual-work',
      activeResolvedProfileId: 'automatic',
      routeProfileId: 'fixed-work',
      resolvedRouteProfileId: 'fixed-work',
      routeKind: 'fixed-proxy',
      matchedRuleId: 'rule-x',
      reason: 'indexed-rule',
      definitive: true,
      warnings: [],
      metrics: {
        indexedRuleCount: 1,
        complexRuleCount: 0,
        indexBlockCount: 1,
        dnsSensitiveRuleCount: 0
      }
    });
    const explain = createCurrentRouteExplainer({ explainV1: vi.fn(), explainV2 });

    await expect(explain(v2Document(), 'https://x.com/home')).resolves.toEqual({
      activeProfileId: 'virtual-work',
      matchedRuleId: 'rule-x',
      reason: 'indexed-rule',
      resolvedProfileId: 'automatic',
      routeKind: 'fixed-proxy',
      routeTargetId: 'fixed-work',
      warnings: []
    });
    expect(explainV2).toHaveBeenCalledWith(v2Document(), 'https://x.com/home');
  });

  it('normalizes a legacy proxy target without pretending it is a profile', async () => {
    const explainV1 = vi.fn().mockResolvedValue({
      route: { kind: 'proxy', proxyId: 'proxy-work' },
      matchedRuleId: 'legacy-rule',
      reason: 'indexed-rule'
    });
    const explain = createCurrentRouteExplainer({ explainV1, explainV2: vi.fn() });

    await expect(explain(v1Document(), 'https://x.com/home')).resolves.toEqual({
      activeProfileId: 'automatic',
      matchedRuleId: 'legacy-rule',
      reason: 'indexed-rule',
      resolvedProfileId: 'automatic',
      routeKind: 'proxy',
      routeTargetId: 'proxy-work',
      warnings: []
    });
  });
});

function v2Document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'virtual-work',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'fixed-work',
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
        rules: []
      },
      {
        id: 'virtual-work',
        kind: 'virtual',
        name: '工作入口',
        target: { profileId: 'automatic' }
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
      startupProfileId: 'virtual-work',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}

function v1Document(): ProfileDocument {
  return {
    schemaVersion: 1,
    activeProfileId: 'automatic',
    credentials: {},
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      {
        id: 'automatic',
        kind: 'auto-switch',
        name: '自动切换',
        fallback: { kind: 'direct' },
        loopbackPolicy: 'direct',
        proxyFailurePolicy: 'direct',
        rules: []
      }
    ],
    proxies: [
      {
        id: 'proxy-work',
        name: '工作节点',
        scheme: 'socks5',
        host: 'proxy.example.test',
        port: 1080
      }
    ]
  };
}

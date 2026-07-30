import { describe, expect, it } from 'vitest';

import type { ProfileDocument, ProfileDocumentV2 } from '@switchypeformance/contracts';

import { addCurrentSiteRule } from './quick-site-rule.ts';

describe('quick site rule', () => {
  it('adds the selected domain rule to the selected automatic profile at the configured position', () => {
    const updated = addCurrentSiteRule(v2Document(), {
      automaticProfileId: 'automatic-secondary',
      condition: { type: 'host-wildcard', pattern: '*.example.co.uk' },
      host: 'sub.example.co.uk',
      ruleId: 'quick-example',
      scope: 'domain',
      target: { profileId: 'fixed-work' }
    });

    expect(v2Automatic(updated, 'automatic-secondary').rules).toEqual([
      {
        condition: { type: 'host-wildcard', pattern: '*.example.co.uk' },
        enabled: true,
        id: 'quick-example',
        target: { profileId: 'fixed-work' }
      },
      {
        condition: { type: 'host-wildcard', pattern: '*.existing.example' },
        enabled: true,
        id: 'existing-rule',
        target: { profileId: 'direct' }
      }
    ]);
    expect(v2Automatic(updated, 'automatic-primary').rules).toEqual([]);
  });

  it('updates an existing current-site rule instead of duplicating it', () => {
    const first = addCurrentSiteRule(v2Document(), {
      automaticProfileId: 'automatic-secondary',
      condition: { type: 'host-wildcard', pattern: 'sub.example.com' },
      host: 'sub.example.com',
      ruleId: 'quick-example',
      scope: 'host',
      target: { profileId: 'fixed-work' }
    });
    const updated = addCurrentSiteRule(first, {
      automaticProfileId: 'automatic-secondary',
      condition: { type: 'host-wildcard', pattern: 'sub.example.com' },
      host: 'sub.example.com',
      ruleId: 'ignored-rule-id',
      scope: 'host',
      target: { profileId: 'direct' }
    });

    expect(v2Automatic(updated, 'automatic-secondary').rules).toContainEqual({
      condition: { type: 'host-wildcard', pattern: 'sub.example.com' },
      enabled: true,
      id: 'quick-example',
      target: { profileId: 'direct' }
    });
    expect(
      v2Automatic(updated, 'automatic-secondary').rules.filter(
        (rule) =>
          rule.condition.type === 'host-wildcard' && rule.condition.pattern === 'sub.example.com'
      )
    ).toHaveLength(1);
  });

  it('stores an advanced popup condition in a V2 automatic profile', () => {
    const updated = addCurrentSiteRule(v2Document(), {
      automaticProfileId: 'automatic-secondary',
      condition: { type: 'url-regex', pattern: '://([^/.]+\\.)*example\\.com(:\\d+)?/' },
      host: 'sub.example.com',
      ruleId: 'quick-regex',
      scope: 'host',
      target: { profileId: 'fixed-work' }
    });

    expect(v2Automatic(updated, 'automatic-secondary').rules[0]).toMatchObject({
      condition: { type: 'url-regex', pattern: '://([^/.]+\\.)*example\\.com(:\\d+)?/' },
      id: 'quick-regex'
    });
  });

  it('puts a new popup rule ahead of existing rules even when manual rules append at the end', () => {
    const document = {
      ...v2Document(),
      settings: { ...v2Document().settings, ruleInsertPosition: 'last' as const }
    };

    const updated = addCurrentSiteRule(document, {
      automaticProfileId: 'automatic-secondary',
      condition: { type: 'host-wildcard', pattern: 'github.com' },
      host: 'github.com',
      ruleId: 'quick-github',
      scope: 'host',
      target: { profileId: 'fixed-work' }
    });

    expect(v2Automatic(updated, 'automatic-secondary').rules.map((rule) => rule.id)).toEqual([
      'quick-github',
      'existing-rule'
    ]);
  });

  it('only permits a loopback quick rule after a non-direct target was explicitly selected', () => {
    const proxied = addCurrentSiteRule(v2Document(), {
      automaticProfileId: 'automatic-secondary',
      condition: { type: 'host-wildcard', pattern: 'localhost' },
      host: 'localhost',
      ruleId: 'local-proxy',
      scope: 'host',
      target: { profileId: 'fixed-work' }
    });
    const direct = addCurrentSiteRule(v2Document(), {
      automaticProfileId: 'automatic-secondary',
      condition: { type: 'host-wildcard', pattern: 'localhost' },
      host: 'localhost',
      ruleId: 'local-direct',
      scope: 'host',
      target: { profileId: 'direct' }
    });

    expect(v2Automatic(proxied, 'automatic-secondary').loopbackPolicy).toBe('use-rules');
    expect(v2Automatic(direct, 'automatic-secondary').loopbackPolicy).toBe('direct');
  });

  it('preserves V1 page and host rule semantics', () => {
    const pageRule = addCurrentSiteRule(v1Document(), {
      automaticProfileId: 'automatic',
      condition: { type: 'url-wildcard', pattern: 'https://sub.example.com/path*' },
      host: 'sub.example.com',
      ruleId: 'legacy-page',
      scope: 'page',
      target: { kind: 'proxy', proxyId: 'proxy-work' }
    });
    const hostRule = addCurrentSiteRule(v1Document(), {
      automaticProfileId: 'automatic',
      condition: { type: 'host-wildcard', pattern: 'sub.example.com' },
      host: 'sub.example.com',
      ruleId: 'legacy-host',
      scope: 'host',
      target: { kind: 'direct' }
    });

    expect(v1Automatic(pageRule).rules[0]?.condition).toEqual({
      type: 'url-glob',
      value: 'https://sub.example.com/path*'
    });
    expect(v1Automatic(hostRule).rules[0]?.condition).toEqual({
      type: 'host-equals',
      value: 'sub.example.com'
    });
  });

  it('puts V1 popup rules ahead of existing rules', () => {
    const document = {
      ...v1Document(),
      profiles: v1Document().profiles.map((profile) =>
        profile.kind === 'auto-switch'
          ? {
              ...profile,
              rules: [
                {
                  id: 'existing-v1-rule',
                  enabled: true,
                  condition: { type: 'host-equals' as const, value: 'existing.example' },
                  target: { kind: 'direct' as const }
                }
              ]
            }
          : profile
      )
    };

    const updated = addCurrentSiteRule(document, {
      automaticProfileId: 'automatic',
      condition: { type: 'host-wildcard', pattern: 'github.com' },
      host: 'github.com',
      ruleId: 'quick-v1-github',
      scope: 'host',
      target: { kind: 'proxy', proxyId: 'proxy-work' }
    });

    expect(v1Automatic(updated).rules.map((rule) => rule.id)).toEqual([
      'quick-v1-github',
      'existing-v1-rule'
    ]);
  });

  it('rejects a V2 target that cannot be routed by Chrome PAC', () => {
    expect(() =>
      addCurrentSiteRule(v2Document(), {
        automaticProfileId: 'automatic-secondary',
        condition: { type: 'host-wildcard', pattern: 'sub.example.com' },
        host: 'sub.example.com',
        ruleId: 'invalid-target',
        scope: 'host',
        target: { profileId: 'system' }
      })
    ).toThrow('自动切换规则目标不能被 Chrome PAC 路由');
  });
});

function v2Automatic(document: ProfileDocumentV2, profileId: string) {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('测试数据缺少自动切换配置');
  }
  return profile;
}

function v1Automatic(document: ProfileDocument) {
  const profile = document.profiles.find((candidate) => candidate.id === 'automatic');
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('测试数据缺少自动切换配置');
  }
  return profile;
}

function v2Document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'direct',
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
        id: 'automatic-primary',
        kind: 'auto-switch',
        name: '主自动切换',
        fallback: { profileId: 'direct' },
        loopbackPolicy: 'direct',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: []
      },
      {
        id: 'automatic-secondary',
        kind: 'auto-switch',
        name: '次自动切换',
        fallback: { profileId: 'direct' },
        loopbackPolicy: 'direct',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: [
          {
            id: 'existing-rule',
            enabled: true,
            condition: { type: 'host-wildcard', pattern: '*.existing.example' },
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
      startupProfileId: 'direct',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'first',
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
      { id: 'system', kind: 'system', name: '系统代理' },
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

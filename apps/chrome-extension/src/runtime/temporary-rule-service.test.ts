import { describe, expect, it } from 'vitest';

import type { ProfileDocument, ProfileDocumentV2 } from '@switchypeformance/contracts';

import {
  activeTemporaryRules,
  createTemporaryRuleService,
  createTemporaryCurrentSiteRule,
  nextTemporaryRuleExpiry,
  overlayTemporaryRules,
  type TemporaryRuleV1,
  type TemporaryRuleV2
} from './temporary-rule-service.ts';

describe('temporary global rule service', () => {
  it('overlays newer live V2 temporary rules before persistent rules without changing saved config', () => {
    const saved = v2Document();
    const merged = overlayTemporaryRules(
      saved,
      [v2Rule('older', 100), v2Rule('newer', 200)],
      1_000
    );

    expect(v2Automatic(merged).rules.map((rule) => rule.id)).toEqual([
      'newer',
      'older',
      'persistent-rule'
    ]);
    expect(v2Automatic(saved).rules.map((rule) => rule.id)).toEqual(['persistent-rule']);
  });

  it('excludes expired, missing-profile, and non-routable temporary V2 rules', () => {
    const saved = v2Document();
    const expired = { ...v2Rule('expired', 300), expiresAt: 999 };
    const missingProfile = { ...v2Rule('missing-profile', 400), automaticProfileId: 'gone' };
    const invalidTarget = {
      ...v2Rule('invalid-target', 500),
      rule: { ...v2Rule('invalid-target', 500).rule, target: { profileId: 'system' } }
    };

    expect(
      activeTemporaryRules(
        [expired, missingProfile, invalidTarget, v2Rule('live', 600)],
        saved,
        1_000
      ).map((rule) => rule.id)
    ).toEqual(['live']);
  });

  it('overlays live V1 temporary rules without rewriting the persistent V1 rules', () => {
    const saved = v1Document();
    const merged = overlayTemporaryRules(saved, [v1Rule('temporary-v1')], 1_000);

    expect(v1Automatic(merged).rules.map((rule) => rule.id)).toEqual([
      'temporary-v1',
      'persistent-v1'
    ]);
    expect(v1Automatic(saved).rules.map((rule) => rule.id)).toEqual(['persistent-v1']);
  });

  it('reports the earliest usable temporary-rule expiry for alarm scheduling', () => {
    expect(
      nextTemporaryRuleExpiry([v2Rule('later', 1, 4_000), v2Rule('first', 2, 2_000)], 1_000)
    ).toBe(2_000);
  });

  it('creates a V2 temporary rule from the same selected current-site route input', () => {
    expect(
      createTemporaryCurrentSiteRule(v2Document(), {
        automaticProfileId: 'automatic',
        condition: { type: 'host-wildcard', pattern: '*.example.test' },
        createdAt: 1_000,
        expiresAt: 31_000,
        host: 'www.example.test',
        id: 'temporary-current-site',
        scope: 'domain',
        target: { profileId: 'fixed' }
      })
    ).toEqual({
      automaticProfileId: 'automatic',
      createdAt: 1_000,
      expiresAt: 31_000,
      host: 'www.example.test',
      id: 'temporary-current-site',
      rule: {
        condition: { type: 'host-wildcard', pattern: '*.example.test' },
        enabled: true,
        id: 'temporary-current-site',
        target: { profileId: 'fixed' }
      },
      schemaVersion: 2,
      scope: 'global'
    });
  });

  it('temporarily permits an explicit localhost proxy rule without changing saved loopback policy', () => {
    const saved = v2Document();
    const temporary = createTemporaryCurrentSiteRule(saved, {
      automaticProfileId: 'automatic',
      condition: { type: 'host-wildcard', pattern: 'localhost' },
      createdAt: 1_000,
      expiresAt: 31_000,
      host: 'localhost',
      id: 'temporary-localhost',
      scope: 'host',
      target: { profileId: 'fixed' }
    });
    const merged = overlayTemporaryRules(saved, [temporary], 2_000);

    expect(v2Automatic(merged).loopbackPolicy).toBe('use-rules');
    expect(v2Automatic(saved).loopbackPolicy).toBe('direct');
  });

  it('drops expired session rules before adding a new temporary global rule', async () => {
    const repository = memoryRepository([v2Rule('expired', 1, 999)]);
    const service = createTemporaryRuleService({
      clock: () => 1_000,
      createId: () => 'created-temporary',
      repository
    });

    const created = await service.add(v2Document(), {
      automaticProfileId: 'automatic',
      condition: { type: 'host-wildcard', pattern: '*.new.example.test' },
      expiresAt: 31_000,
      host: 'new.example.test',
      scope: 'domain',
      target: { profileId: 'fixed' }
    });

    expect(created.id).toBe('created-temporary');
    await expect(repository.load()).resolves.toEqual([created]);
  });

  it('replaces an existing temporary rule for the same automatic profile and condition', async () => {
    let now = 1_000;
    let sequence = 0;
    const repository = memoryRepository([]);
    const service = createTemporaryRuleService({
      clock: () => now,
      createId: () => `temporary-${++sequence}`,
      repository
    });
    const input = {
      automaticProfileId: 'automatic',
      condition: { type: 'host-wildcard' as const, pattern: '*.repeat.example.test' },
      expiresAt: 31_000,
      host: 'repeat.example.test',
      scope: 'domain' as const,
      target: { profileId: 'fixed' }
    };

    await service.add(v2Document(), input);
    now = 2_000;
    const replacement = await service.add(v2Document(), { ...input, expiresAt: 62_000 });

    await expect(repository.load()).resolves.toEqual([replacement]);
  });

  it('reports whether expiry cleanup changed the session rule collection', async () => {
    const repository = memoryRepository([v2Rule('expired', 1, 999)]);
    const service = createTemporaryRuleService({ clock: () => 1_000, repository });

    await expect(service.prune(v2Document())).resolves.toEqual({ changed: true, rules: [] });
    await expect(service.prune(v2Document())).resolves.toEqual({ changed: false, rules: [] });
  });
});

function v2Rule(id: string, createdAt: number, expiresAt = 10_000): TemporaryRuleV2 {
  return {
    automaticProfileId: 'automatic',
    createdAt,
    expiresAt,
    host: `${id}.example.test`,
    id,
    rule: {
      condition: { type: 'host-wildcard', pattern: `*.${id}.example.test` },
      enabled: true,
      id,
      target: { profileId: 'fixed' }
    },
    schemaVersion: 2,
    scope: 'global'
  };
}

function v1Rule(id: string): TemporaryRuleV1 {
  return {
    automaticProfileId: 'automatic',
    createdAt: 100,
    expiresAt: 10_000,
    host: 'temporary.example.test',
    id,
    rule: {
      condition: { type: 'host-suffix', value: 'temporary.example.test' },
      enabled: true,
      id,
      target: { kind: 'proxy', proxyId: 'proxy-work' }
    },
    schemaVersion: 1,
    scope: 'global'
  };
}

function v2Automatic(document: ProfileDocumentV2) {
  const profile = document.profiles.find((candidate) => candidate.id === 'automatic');
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('测试数据缺少 V2 自动切换配置');
  }
  return profile;
}

function v1Automatic(document: ProfileDocument) {
  const profile = document.profiles.find((candidate) => candidate.id === 'automatic');
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('测试数据缺少 V1 自动切换配置');
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
        rules: [
          {
            id: 'persistent-v1',
            enabled: true,
            condition: { type: 'host-suffix', value: 'persistent.example.test' },
            target: { kind: 'direct' }
          }
        ]
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

function memoryRepository(initial: readonly TemporaryRuleV2[]) {
  let rules = initial;
  return {
    async load() {
      return rules;
    },
    async replace(next: readonly TemporaryRuleV2[]) {
      rules = next;
    }
  };
}

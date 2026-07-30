import { describe, expect, it, vi } from 'vitest';

import {
  parseRuleList,
  type ProfileDocumentV2,
  type RuleListSource
} from '@switchypeformance/contracts';

import { createRuleListService, ruleListSourceStatusId } from './rule-list-service.ts';
import { createSourceStatusRepository } from './source-status-repository.ts';

describe('rule-list service', () => {
  it('turns an active inline list into ordered auto-switch rules and keeps exclusions direct', async () => {
    const fetch = vi.fn();
    const service = createRuleListService({ fetcher: { fetch }, statuses: memoryStatuses() });

    const resolved = await service.resolveForApply(inlineRuleListDocument());

    expect(fetch).not.toHaveBeenCalled();
    expect(resolved.activeProfileId).toBe('list');
    expect(activeAutoSwitch(resolved)).toMatchObject({
      fallback: { profileId: 'direct' },
      loopbackPolicy: 'direct',
      proxyFailurePolicy: 'direct',
      rules: [
        {
          condition: { type: 'host-wildcard', pattern: '*.example.com' },
          id: 'rule-list:company-source:1',
          target: { profileId: 'work' }
        },
        {
          condition: { type: 'host-wildcard', pattern: '*.internal.example.com' },
          id: 'rule-list:company-source:2',
          target: { profileId: 'direct' }
        }
      ]
    });
  });

  it('downloads an uncached remote list once, caches it, and compiles it as an active auto switch', async () => {
    const statuses = memoryStatuses();
    const fetch = vi.fn().mockResolvedValue({
      byteLength: 16,
      etag: 'list-tag',
      kind: 'content',
      text: '||remote.example'
    });
    const service = createRuleListService({
      clock: () => 1_000,
      fetcher: { fetch },
      statuses
    });

    const resolved = await service.resolveForApply(remoteRuleListDocument());

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        contentKind: 'rule-list',
        url: 'https://rules.example/company.txt'
      })
    );
    expect(activeAutoSwitch(resolved).rules).toMatchObject([
      {
        condition: { type: 'host-wildcard', pattern: '*.remote.example' },
        target: { profileId: 'work' }
      }
    ]);
    await expect(statuses.get(ruleListSourceStatusId('company-source'))).resolves.toMatchObject({
      etag: 'list-tag',
      lastSuccessAt: 1_000,
      text: '||remote.example',
      url: 'https://rules.example/company.txt'
    });
  });

  it('uses a matching remote cache without loading the network on reapplication', async () => {
    const statuses = memoryStatuses();
    await statuses.saveContent({
      byteLength: 16,
      fetchedAt: 1_000,
      sourceId: ruleListSourceStatusId('company-source'),
      text: '||cached.example',
      url: 'https://rules.example/company.txt'
    });
    const fetch = vi.fn();
    const service = createRuleListService({ fetcher: { fetch }, statuses });

    const resolved = await service.resolveForApply(remoteRuleListDocument());

    expect(fetch).not.toHaveBeenCalled();
    expect(activeAutoSwitch(resolved).rules[0]).toMatchObject({
      condition: { type: 'host-wildcard', pattern: '*.cached.example' }
    });
  });

  it('keeps a same-address list after refresh failure but never applies a cache from another address', async () => {
    const statuses = memoryStatuses();
    await statuses.saveContent({
      byteLength: 16,
      fetchedAt: 1_000,
      sourceId: ruleListSourceStatusId('company-source'),
      text: '||cached.example',
      url: 'https://rules.example/company.txt'
    });
    const service = createRuleListService({
      clock: () => 2_000,
      fetcher: { fetch: vi.fn().mockRejectedValue(new Error('来源不可用')) },
      statuses
    });

    const fallback = await service.refreshAndResolve(remoteRuleListDocument());
    expect(activeAutoSwitch(fallback).rules[0]).toMatchObject({
      condition: { type: 'host-wildcard', pattern: '*.cached.example' }
    });

    await expect(
      service.resolveForApply(remoteRuleListDocument('https://new-rules.example/company.txt'))
    ).rejects.toThrow('来源不可用');
  });

  it('uses @with result names for match rules and the final catch-all for exclusions and fallback', async () => {
    const document = inlineRuleListDocument({
      format: 'switchy',
      text: [
        '[SwitchyOmega Conditions]',
        '@with result',
        '*.example.com +工作代理',
        '!*.internal.example.com',
        '* +直连'
      ].join('\n')
    });
    const service = createRuleListService({
      fetcher: { fetch: vi.fn() },
      statuses: memoryStatuses()
    });

    const resolved = await service.resolveForApply(document);

    expect(activeAutoSwitch(resolved)).toMatchObject({
      fallback: { profileId: 'direct' },
      rules: [
        {
          condition: { type: 'host-wildcard', pattern: '*.example.com' },
          target: { profileId: 'work' }
        },
        {
          condition: { type: 'host-wildcard', pattern: '*.internal.example.com' },
          target: { profileId: 'direct' }
        }
      ]
    });
  });

  it('resolves a virtual active profile to the terminal rule-list profile before compiling', async () => {
    const document: ProfileDocumentV2 = {
      ...inlineRuleListDocument(),
      activeProfileId: 'list-entry',
      profiles: [
        ...inlineRuleListDocument().profiles,
        { id: 'list-entry', kind: 'virtual', name: '规则入口', target: { profileId: 'list' } }
      ],
      settings: { ...inlineRuleListDocument().settings, startupProfileId: 'list-entry' }
    };
    const service = createRuleListService({
      fetcher: { fetch: vi.fn() },
      statuses: memoryStatuses()
    });

    const resolved = await service.resolveForApply(document);

    expect(resolved.activeProfileId).toBe('list');
    expect(activeAutoSwitch(resolved).id).toBe('list');
  });

  it('compiles a rule list attached to an active auto-switch profile after its local rules', async () => {
    const service = createRuleListService({
      fetcher: { fetch: vi.fn() },
      statuses: memoryStatuses()
    });

    const resolved = await service.resolveForApply(autoSwitchWithAttachedRuleListDocument());

    expect(resolved.activeProfileId).toBe('automatic');
    expect(activeAutoSwitch(resolved)).toMatchObject({
      fallback: { profileId: 'direct' },
      ruleSourceIds: [],
      rules: [
        {
          condition: { pattern: '*.explicit.example', type: 'host-wildcard' },
          id: 'explicit-rule',
          target: { profileId: 'direct' }
        },
        {
          condition: { pattern: '*.attached.example', type: 'host-wildcard' },
          id: 'rule-list:attached-source:1',
          target: { profileId: 'work' }
        }
      ]
    });
  });

  it('refreshes an inactive remote list and stores its parsed rule statistics', async () => {
    const statuses = memoryStatuses();
    const fetch = vi.fn().mockResolvedValue({
      byteLength: 36,
      kind: 'content',
      text: '||one.example\n||two.example\n$unsupported'
    });
    const service = createRuleListService({
      clock: () => 3_000,
      fetcher: { fetch },
      statuses
    });
    const document = { ...remoteRuleListDocument(), activeProfileId: 'direct' };

    await service.refreshSource(document, 'company-source');

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://rules.example/company.txt' })
    );
    await expect(statuses.get(ruleListSourceStatusId('company-source'))).resolves.toMatchObject({
      lastSuccessAt: 3_000,
      ruleCount: 2,
      warningCount: 1
    });
    expect(document.activeProfileId).toBe('direct');
  });

  it('skips parsing an unchanged source after the first compiled application', async () => {
    const parse = vi.fn(parseRuleList);
    const document = inlineRuleListDocument();
    const service = createRuleListService({
      fetcher: { fetch: vi.fn() },
      parse,
      statuses: memoryStatuses()
    });

    await service.resolveForApply(document);
    await service.resolveForApply(document);

    expect(parse).toHaveBeenCalledOnce();
  });

  it('keeps a bounded parsed-list cache when a source receives many revisions', async () => {
    const parse = vi.fn(parseRuleList);
    const service = createRuleListService({
      fetcher: { fetch: vi.fn() },
      maxParsedCacheEntries: 1,
      parse,
      statuses: memoryStatuses()
    });

    await service.resolveForApply(inlineRuleListDocument({ text: '||first.example' }));
    await service.resolveForApply(inlineRuleListDocument({ text: '||second.example' }));
    await service.resolveForApply(inlineRuleListDocument({ text: '||first.example' }));

    expect(parse).toHaveBeenCalledTimes(3);
  });
});

function inlineRuleListDocument(
  options: {
    format?: RuleListSource['format'];
    source?: RuleListSource['source'];
    text?: string;
  } = {}
): ProfileDocumentV2 {
  const source: RuleListSource = {
    format: options.format ?? 'switchy',
    id: 'company-source',
    name: '公司规则',
    source:
      options.source ??
      ({ kind: 'inline', text: options.text ?? '*.example.com\n!*.internal.example.com' } as const)
  };
  return {
    activeProfileId: 'list',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'work',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'edge' },
        bypassList: []
      },
      {
        id: 'list',
        kind: 'rule-list',
        name: '公司规则列表',
        sourceId: 'company-source',
        matchTarget: { profileId: 'work' },
        fallback: { profileId: 'direct' }
      }
    ],
    proxyServers: [
      { id: 'edge', name: '边缘', scheme: 'socks5', host: 'proxy.example', port: 1080 }
    ],
    ruleSources: [source],
    schemaVersion: 2,
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'list'
    }
  };
}

function remoteRuleListDocument(url = 'https://rules.example/company.txt'): ProfileDocumentV2 {
  return inlineRuleListDocument({
    format: 'auto-proxy',
    source: {
      headers: [],
      kind: 'url',
      refresh: { enabled: true, refreshMinutes: 60 },
      url
    }
  });
}

function autoSwitchWithAttachedRuleListDocument(): ProfileDocumentV2 {
  const source: RuleListSource = {
    format: 'auto-proxy',
    id: 'attached-source',
    name: '附加规则',
    source: { kind: 'inline', text: '||attached.example' }
  };
  return {
    activeProfileId: 'automatic',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        bypassList: [],
        id: 'work',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'edge' }
      },
      {
        fallback: { profileId: 'work' },
        id: 'automatic',
        kind: 'auto-switch',
        loopbackPolicy: 'direct',
        name: '自动切换',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: ['attached-source'],
        rules: [
          {
            condition: { pattern: '*.explicit.example', type: 'host-wildcard' },
            enabled: true,
            id: 'explicit-rule',
            target: { profileId: 'direct' }
          }
        ]
      },
      {
        fallback: { profileId: 'direct' },
        id: 'attached-list',
        kind: 'rule-list',
        matchTarget: { profileId: 'work' },
        name: '自动切换规则列表',
        sourceId: 'attached-source'
      }
    ],
    proxyServers: [
      { host: 'proxy.example', id: 'edge', name: '边缘', port: 1080, scheme: 'socks5' }
    ],
    ruleSources: [source],
    schemaVersion: 2,
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'automatic'
    }
  };
}

function activeAutoSwitch(document: ProfileDocumentV2) {
  const profile = document.profiles.find((candidate) => candidate.id === document.activeProfileId);
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('测试结果不是自动切换配置');
  }
  return profile;
}

function memoryStatuses() {
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

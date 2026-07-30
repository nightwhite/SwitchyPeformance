import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import {
  setAutoSwitchFallback,
  setAutoSwitchRuleSourceIds
} from './auto-switch-draft.ts';

describe('auto switch draft actions', () => {
  it('updates the default target without changing any explicit rule', () => {
    const next = setAutoSwitchFallback(document(), 'automatic', { profileId: 'fixed' });
    const profile = automatic(next);

    expect(profile.fallback).toEqual({ profileId: 'fixed' });
    expect(profile.rules).toEqual(automatic(document()).rules);
  });

  it('stores selected rule sources once and rejects unknown source ids', () => {
    const next = setAutoSwitchRuleSourceIds(document(), 'automatic', ['source-a', 'source-a']);

    expect(automatic(next).ruleSourceIds).toEqual(['source-a']);
    expect(() =>
      setAutoSwitchRuleSourceIds(document(), 'automatic', ['missing-source'])
    ).toThrow('规则来源不存在');
  });
});

function automatic(document: ProfileDocumentV2) {
  const profile = document.profiles.find((candidate) => candidate.id === 'automatic');
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('测试配置缺少自动切换');
  }
  return profile;
}

function document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'automatic',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        bypassList: [],
        id: 'fixed',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'proxy' }
      },
      {
        fallback: { profileId: 'direct' },
        id: 'automatic',
        kind: 'auto-switch',
        loopbackPolicy: 'direct',
        name: '自动切换',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: [
          {
            condition: { pattern: '*.example.com', type: 'host-wildcard' },
            enabled: true,
            id: 'rule',
            target: { profileId: 'direct' }
          }
        ]
      }
    ],
    proxyServers: [
      { host: 'proxy.example', id: 'proxy', name: '代理', port: 1080, scheme: 'socks5' }
    ],
    ruleSources: [
      { format: 'auto-proxy', id: 'source-a', name: '公司规则', source: { kind: 'inline', text: '' } }
    ],
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'automatic'
    }
  };
}

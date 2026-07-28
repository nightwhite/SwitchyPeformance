import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import {
  updatePacProfile,
  updateRuleListProfile,
  updateVirtualProfile
} from './advanced-profile-actions.ts';

describe('advanced V2 profile actions', () => {
  it('saves a remote PAC only with HTTPS or explicit HTTP confirmation', () => {
    const secure = updatePacProfile(document(), 'pac', {
      allowInsecureHttp: false,
      source: {
        kind: 'url',
        url: 'https://config.example/proxy.pac',
        headers: [],
        refresh: { enabled: false, refreshMinutes: 60 }
      }
    });

    expect(profile(secure, 'pac')).toMatchObject({
      kind: 'pac',
      source: { kind: 'url', url: 'https://config.example/proxy.pac' }
    });
    expect(() =>
      updatePacProfile(document(), 'pac', {
        allowInsecureHttp: false,
        source: {
          kind: 'url',
          url: 'http://config.example/proxy.pac',
          headers: [],
          refresh: { enabled: false, refreshMinutes: 60 }
        }
      })
    ).toThrow('HTTP');
  });

  it('preserves custom request headers for a remote PAC fetched by the extension', () => {
    const updated = updatePacProfile(document(), 'pac', {
      allowInsecureHttp: false,
      source: {
        kind: 'url',
        url: 'https://config.example/private.pac',
        headers: [{ name: 'Authorization', value: 'Bearer local-token' }],
        refresh: { enabled: true, refreshMinutes: 60 }
      }
    });

    expect(profile(updated, 'pac')).toMatchObject({
      source: {
        kind: 'url',
        url: 'https://config.example/private.pac',
        headers: [{ name: 'Authorization', value: 'Bearer local-token' }]
      }
    });
  });

  it('updates a rule list source and its route targets as one valid document', () => {
    const updated = updateRuleListProfile(document(), 'list', {
      allowInsecureHttp: false,
      fallback: { profileId: 'direct' },
      matchTarget: { profileId: 'fixed' },
      source: {
        id: 'company-source',
        name: '公司订阅',
        format: 'switchy',
        source: {
          kind: 'url',
          url: 'https://rules.example/list.txt',
          headers: [{ name: 'X-Token', value: 'local-token' }],
          refresh: { enabled: true, refreshMinutes: 120 }
        }
      }
    });

    expect(profile(updated, 'list')).toMatchObject({
      kind: 'rule-list',
      sourceId: 'company-source',
      matchTarget: { profileId: 'fixed' }
    });
    expect(updated.ruleSources).toContainEqual({
      id: 'company-source',
      name: '公司订阅',
      format: 'switchy',
      source: {
        kind: 'url',
        url: 'https://rules.example/list.txt',
        headers: [{ name: 'X-Token', value: 'local-token' }],
        refresh: { enabled: true, refreshMinutes: 120 }
      }
    });
  });

  it('rejects a virtual profile that points back to itself', () => {
    expect(() => updateVirtualProfile(document(), 'alias', { profileId: 'alias' })).toThrow(
      '虚拟配置不能指向自身'
    );
  });
});

function profile(document: ProfileDocumentV2, profileId: string) {
  const value = document.profiles.find((candidate) => candidate.id === profileId);
  if (!value) {
    throw new Error(`测试数据缺少配置：${profileId}`);
  }
  return value;
}

function document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'direct',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'fixed',
        kind: 'fixed-proxy',
        name: '固定代理',
        routes: { fallbackProxyId: 'edge' },
        bypassList: []
      },
      {
        id: 'pac',
        kind: 'pac',
        name: '远程 PAC',
        source: { kind: 'inline', text: 'function FindProxyForURL(){return "DIRECT";}' }
      },
      { id: 'detect', kind: 'auto-detect', name: '自动检测' },
      {
        id: 'list',
        kind: 'rule-list',
        name: '规则列表',
        sourceId: 'company-source',
        matchTarget: { profileId: 'direct' },
        fallback: { profileId: 'direct' }
      },
      { id: 'alias', kind: 'virtual', name: '代理别名', target: { profileId: 'fixed' } }
    ],
    proxyServers: [
      { id: 'edge', name: '边缘代理', scheme: 'socks5', host: 'proxy.example', port: 1080 }
    ],
    ruleSources: [
      {
        id: 'company-source',
        name: '旧订阅',
        format: 'auto-proxy',
        source: { kind: 'inline', text: '' }
      }
    ],
    settings: {
      startupProfileId: 'direct',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}

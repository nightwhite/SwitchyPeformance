import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import {
  updatePacDraft,
  updateRuleListDraft,
  updateVirtualDraft
} from './advanced-profile-draft.ts';

describe('advanced profile draft actions', () => {
  it('updates PAC source in the returned draft only', () => {
    const next = updatePacDraft(document(), 'pac', {
      allowInsecureHttp: false,
      source: { kind: 'url', url: 'https://example.com/proxy.pac', headers: [], refresh: { enabled: true, refreshMinutes: 60 } }
    });

    expect(next.profiles.find((profile) => profile.id === 'pac')).toMatchObject({
      kind: 'pac',
      source: { kind: 'url', url: 'https://example.com/proxy.pac' }
    });
  });

  it('updates rule list targets and virtual target in the returned draft', () => {
    const listed = updateRuleListDraft(document(), 'list', {
      allowInsecureHttp: false,
      fallback: { profileId: 'direct' },
      matchTarget: { profileId: 'fixed' },
      source: {
        format: 'auto-proxy',
        id: 'source',
        name: '公司规则',
        source: { kind: 'inline', text: '*.company.example' }
      }
    });
    const virtual = updateVirtualDraft(listed, 'virtual', { profileId: 'fixed' });

    expect(virtual.profiles.find((profile) => profile.id === 'list')).toMatchObject({
      matchTarget: { profileId: 'fixed' }
    });
    expect(virtual.profiles.find((profile) => profile.id === 'virtual')).toMatchObject({
      target: { profileId: 'fixed' }
    });
  });
});

function document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'direct',
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
        id: 'pac',
        kind: 'pac',
        name: 'PAC',
        source: { kind: 'inline', text: 'function FindProxyForURL(){ return "DIRECT"; }' }
      },
      { id: 'auto-detect', kind: 'auto-detect', name: '自动检测' },
      {
        fallback: { profileId: 'direct' },
        id: 'list',
        kind: 'rule-list',
        matchTarget: { profileId: 'direct' },
        name: '规则列表',
        sourceId: 'source'
      },
      { id: 'virtual', kind: 'virtual', name: '虚拟', target: { profileId: 'direct' } }
    ],
    proxyServers: [
      { host: 'proxy.example', id: 'proxy', name: '代理', port: 1080, scheme: 'socks5' }
    ],
    ruleSources: [
      { format: 'auto-proxy', id: 'source', name: '公司规则', source: { kind: 'inline', text: '' } }
    ],
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'direct'
    }
  };
}

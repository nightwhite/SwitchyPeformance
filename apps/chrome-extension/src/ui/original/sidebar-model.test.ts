import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { originalSidebarGroups } from './sidebar-model.ts';

describe('original sidebar model', () => {
  it('keeps original setting, profile, and action groups in the expected order', () => {
    const groups = originalSidebarGroups(document());

    expect(groups.map((group) => group.label)).toEqual(['设置', '配置', '操作']);
    expect(groups[0]?.items.map((item) => item.label)).toEqual(['界面', '通用', '导入/导出', '主题']);
    expect(groups[1]?.items.map((item) => item.label)).toEqual([
      '内置配置',
      'a 固定',
      'z PAC',
      '虚拟',
      '自动切换',
      '规则列表',
      '新建配置'
    ]);
    expect(groups[2]?.items.map((item) => item.label)).toEqual(['应用', '放弃']);
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
        fallback: { profileId: 'direct' },
        id: 'switch',
        kind: 'auto-switch',
        loopbackPolicy: 'direct',
        name: '自动切换',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: []
      },
      { id: 'virtual', kind: 'virtual', name: '虚拟', target: { profileId: 'direct' } },
      {
        bypassList: [],
        id: 'fixed',
        kind: 'fixed-proxy',
        name: 'a 固定',
        routes: { fallbackProxyId: 'proxy' }
      },
      { id: 'pac', kind: 'pac', name: 'z PAC', source: { kind: 'inline', text: 'function FindProxyForURL() { return "DIRECT"; }' } },
      {
        fallback: { profileId: 'direct' },
        id: 'rules',
        kind: 'rule-list',
        matchTarget: { profileId: 'direct' },
        name: '规则列表',
        sourceId: 'source'
      }
    ],
    proxyServers: [{ host: '127.0.0.1', id: 'proxy', name: '本地', port: 1080, scheme: 'socks5' }],
    ruleSources: [
      { format: 'auto-proxy', id: 'source', name: '规则来源', source: { kind: 'inline', text: '' } }
    ],
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'direct'
    }
  };
}

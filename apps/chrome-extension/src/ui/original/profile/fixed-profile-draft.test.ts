import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import {
  addProxyServerToDraft,
  setFixedBypassList,
  setFixedRoute
} from './fixed-profile-draft.ts';

describe('fixed profile draft actions', () => {
  it('updates one protocol route without changing the applied profile shape', () => {
    const next = setFixedRoute(document(), 'work', 'httpsProxyId', 'backup');

    expect(findFixed(next).routes).toEqual({
      fallbackProxyId: 'primary',
      httpsProxyId: 'backup'
    });
  });

  it('removes an optional protocol override when it uses the default route again', () => {
    const next = setFixedRoute(
      {
        ...document(),
        profiles: [
          document().profiles[0]!,
          document().profiles[1]!,
          {
            ...findFixed(document()),
            routes: { fallbackProxyId: 'primary', httpProxyId: 'backup' }
          }
        ]
      },
      'work',
      'httpProxyId',
      ''
    );

    expect(findFixed(next).routes).toEqual({ fallbackProxyId: 'primary' });
  });

  it('normalizes bypass entries and appends a locally editable proxy server', () => {
    const bypassUpdated = setFixedBypassList(document(), 'work', [
      ' localhost ',
      '',
      '*.internal.example',
      '*.internal.example'
    ]);
    const next = addProxyServerToDraft(bypassUpdated, {
      host: 'tokyo.proxy.example',
      id: 'tokyo',
      name: '东京',
      port: 1080,
      scheme: 'socks5'
    });

    expect(findFixed(next).bypassList).toEqual(['localhost', '*.internal.example']);
    expect(next.proxyServers.at(-1)).toMatchObject({ id: 'tokyo', name: '东京' });
  });
});

function findFixed(document: ProfileDocumentV2) {
  const profile = document.profiles.find((candidate) => candidate.id === 'work');
  if (!profile || profile.kind !== 'fixed-proxy') {
    throw new Error('测试配置缺少固定代理');
  }
  return profile;
}

function document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'work',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        bypassList: [],
        id: 'work',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'primary' }
      }
    ],
    proxyServers: [
      { host: 'primary.proxy.example', id: 'primary', name: '主节点', port: 1080, scheme: 'socks5' },
      { host: 'backup.proxy.example', id: 'backup', name: '备用节点', port: 443, scheme: 'https' }
    ],
    ruleSources: [],
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'work'
    }
  };
}

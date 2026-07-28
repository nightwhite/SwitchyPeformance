import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { routeOptionsV2, targetFromValueV2 } from './background-client.ts';

describe('V2 路由选项', () => {
  it('uses profile ids rather than legacy proxy ids', () => {
    expect(routeOptionsV2(v2Document())).toEqual([
      { label: '直连', value: 'profile:direct', target: { profileId: 'direct' } },
      { label: '系统代理', value: 'profile:system', target: { profileId: 'system' } },
      { label: '工作代理', value: 'profile:work', target: { profileId: 'work' } }
    ]);
    expect(targetFromValueV2('profile:work')).toEqual({ profileId: 'work' });
  });
});

function v2Document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'auto',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'work',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'work-proxy' },
        bypassList: []
      },
      {
        id: 'auto',
        kind: 'auto-switch',
        name: '自动切换',
        fallback: { profileId: 'direct' },
        loopbackPolicy: 'direct',
        proxyFailurePolicy: 'direct',
        rules: [],
        ruleSourceIds: []
      }
    ],
    proxyServers: [
      { id: 'work-proxy', name: '工作', scheme: 'socks5', host: 'proxy.test', port: 1080 }
    ],
    ruleSources: [],
    settings: {
      startupProfileId: 'auto',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}

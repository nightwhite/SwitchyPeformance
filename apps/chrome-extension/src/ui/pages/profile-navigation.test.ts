import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { profileNavigationItems } from './profile-navigation.ts';

describe('profile navigation', () => {
  it('keeps built-in profiles first and preserves the user profile order', () => {
    expect(profileNavigationItems(document())).toEqual([
      { builtIn: true, id: 'direct', kind: 'direct', name: '直连' },
      { builtIn: true, id: 'system', kind: 'system', name: '系统代理' },
      { builtIn: false, id: 'work', kind: 'fixed-proxy', name: '工作代理' },
      { builtIn: false, id: 'automatic', kind: 'auto-switch', name: '自动切换' }
    ]);
  });
});

function document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'automatic',
    profiles: [
      {
        bypassList: [],
        id: 'work',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'work-server' }
      },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        fallback: { profileId: 'direct' },
        id: 'automatic',
        kind: 'auto-switch',
        loopbackPolicy: 'direct',
        name: '自动切换',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: []
      },
      { id: 'direct', kind: 'direct', name: '直连' }
    ],
    proxyServers: [
      { host: '127.0.0.1', id: 'work-server', name: '工作服务器', port: 1080, scheme: 'socks5' }
    ],
    ruleSources: [],
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'direct'
    }
  };
}

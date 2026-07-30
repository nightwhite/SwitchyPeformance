import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { setPopupDefaultTarget } from './default-target.ts';

describe('popup default target', () => {
  it('updates only the selected default target while preserving the rest of the profile', () => {
    const next = setPopupDefaultTarget(document(), 'switch', 'alias');

    expect(next.profiles.find((profile) => profile.id === 'switch')).toMatchObject({
      fallback: { profileId: 'alias' },
      loopbackPolicy: 'use-rules',
      proxyFailurePolicy: 'block'
    });
  });

  it('uses the same target contract for rule lists and virtual profiles', () => {
    const listed = setPopupDefaultTarget(document(), 'list', 'alias');
    const virtual = setPopupDefaultTarget(listed, 'alias', 'direct');

    expect(virtual.profiles.find((profile) => profile.id === 'list')).toMatchObject({
      fallback: { profileId: 'alias' }
    });
    expect(virtual.profiles.find((profile) => profile.id === 'alias')).toMatchObject({
      target: { profileId: 'direct' }
    });
  });

  it('rejects an unsupported default target instead of writing an invalid PAC route', () => {
    expect(() => setPopupDefaultTarget(document(), 'switch', 'system')).toThrow(
      '自动切换规则目标不能被 Chrome PAC 路由'
    );
  });
});

function document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'switch',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        bypassList: [],
        id: 'fixed',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'server' }
      },
      { id: 'alias', kind: 'virtual', name: '工作入口', target: { profileId: 'fixed' } },
      {
        fallback: { profileId: 'fixed' },
        id: 'switch',
        kind: 'auto-switch',
        loopbackPolicy: 'use-rules',
        name: '自动切换',
        proxyFailurePolicy: 'block',
        ruleSourceIds: [],
        rules: []
      },
      {
        fallback: { profileId: 'direct' },
        id: 'list',
        kind: 'rule-list',
        matchTarget: { profileId: 'fixed' },
        name: '规则列表',
        sourceId: 'source'
      }
    ],
    proxyServers: [
      { host: 'proxy.example', id: 'server', name: '服务器', port: 1080, scheme: 'socks5' }
    ],
    ruleSources: [
      { format: 'auto-proxy', id: 'source', name: '公司规则', source: { kind: 'inline', text: '' } }
    ],
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'switch'
    }
  };
}

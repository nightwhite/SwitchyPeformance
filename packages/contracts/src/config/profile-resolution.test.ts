import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from './document.ts';
import { isAutoSwitchRouteTargetV2, resolveProfileV2 } from './profile-resolution.ts';

describe('V2 配置解析', () => {
  it('解析活动虚拟配置最终指向的真实配置', () => {
    const document = documentWith([
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      { id: 'entry', kind: 'virtual', name: '入口', target: { profileId: 'fixed' } },
      {
        id: 'fixed',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'work' },
        bypassList: []
      }
    ]);

    expect(resolveProfileV2(document)).toMatchObject({
      profileId: 'fixed',
      profile: { kind: 'fixed-proxy', id: 'fixed' },
      virtualProfileIds: ['entry']
    });
  });

  it('明确拒绝虚拟配置循环', () => {
    const document = documentWith([
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      { id: 'entry', kind: 'virtual', name: '入口', target: { profileId: 'exit' } },
      { id: 'exit', kind: 'virtual', name: '出口', target: { profileId: 'entry' } }
    ]);

    expect(() => resolveProfileV2(document)).toThrow('虚拟配置存在循环引用');
  });

  it('只把最终落到直连或固定代理的配置作为自动切换目标', () => {
    const document = documentWith([
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'fixed',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'work' },
        bypassList: []
      },
      { id: 'fixed-alias', kind: 'virtual', name: '工作别名', target: { profileId: 'fixed' } }
    ]);

    expect(isAutoSwitchRouteTargetV2(document, 'direct')).toBe(true);
    expect(isAutoSwitchRouteTargetV2(document, 'fixed')).toBe(true);
    expect(isAutoSwitchRouteTargetV2(document, 'fixed-alias')).toBe(true);
    expect(isAutoSwitchRouteTargetV2(document, 'system')).toBe(false);
    expect(isAutoSwitchRouteTargetV2(document, 'missing')).toBe(false);
  });
});

function documentWith(profiles: ProfileDocumentV2['profiles']): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'entry',
    profiles,
    proxyServers: [{ id: 'work', name: '工作', scheme: 'socks5', host: 'proxy.test', port: 1080 }],
    ruleSources: [],
    settings: {
      startupProfileId: 'entry',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}

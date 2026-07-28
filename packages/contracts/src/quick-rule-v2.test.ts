import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from './config/document.ts';
import { addHostRuleToAutoSwitchV2 } from './quick-rule.ts';

describe('V2 快捷主机规则', () => {
  it('添加规则时保留配置目标，并更新同一主机的现有规则', () => {
    const first = addHostRuleToAutoSwitchV2(document(), {
      profileId: 'auto',
      host: 'github.com',
      ruleId: 'github-rule',
      target: { profileId: 'work' }
    });
    const updated = addHostRuleToAutoSwitchV2(first, {
      profileId: 'auto',
      host: 'github.com',
      ruleId: 'ignored-rule',
      target: { profileId: 'direct' }
    });

    expect(updated.profiles.find((profile) => profile.id === 'auto')).toMatchObject({
      rules: [
        {
          id: 'github-rule',
          enabled: true,
          condition: { type: 'host-wildcard', pattern: '*.github.com' },
          target: { profileId: 'direct' }
        }
      ]
    });
  });
});

function document(): ProfileDocumentV2 {
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

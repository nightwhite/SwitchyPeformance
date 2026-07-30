import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import {
  addRule,
  cloneRule,
  moveRule,
  removeRule,
  resetRuleTargets,
  toggleRule,
  updateAutoSwitchSettings,
  updateRule
} from './rule-actions.ts';

describe('V2 automatic rule actions', () => {
  it('adds advanced rules at the configured insertion position', () => {
    const first = addRule(document('first'), 'automatic', {
      condition: { type: 'url-regex', pattern: '^https://x\\.com/' },
      enabled: true,
      id: 'rule-x',
      target: { profileId: 'fixed-work' }
    });
    const last = addRule(document('last'), 'automatic', {
      condition: { type: 'weekday', days: [1, 2, 3, 4, 5] },
      enabled: true,
      id: 'rule-workdays',
      target: { profileId: 'direct' }
    });

    expect(automatic(first).rules.map((rule) => rule.id)).toEqual(['rule-x', 'existing-rule']);
    expect(automatic(last).rules.map((rule) => rule.id)).toEqual([
      'existing-rule',
      'rule-workdays'
    ]);
  });

  it('updates, toggles, moves and removes a stable rule id without touching other rules', () => {
    const added = addRule(document('last'), 'automatic', {
      condition: { type: 'host-wildcard', pattern: '*.x.com' },
      enabled: true,
      id: 'rule-x',
      target: { profileId: 'fixed-work' }
    });
    const changed = updateRule(added, 'automatic', {
      condition: { type: 'keyword', value: 'x.com' },
      enabled: true,
      id: 'rule-x',
      target: { profileId: 'direct' }
    });
    const toggled = toggleRule(changed, 'automatic', 'rule-x', false);
    const moved = moveRule(toggled, 'automatic', 'rule-x', 0);
    const removed = removeRule(moved, 'automatic', 'existing-rule');

    expect(automatic(removed).rules).toEqual([
      {
        id: 'rule-x',
        enabled: false,
        condition: { type: 'keyword', value: 'x.com' },
        target: { profileId: 'direct' }
      }
    ]);
  });

  it('rejects malformed conditions and rule targets that Chrome PAC cannot resolve', () => {
    expect(() =>
      addRule(document('last'), 'automatic', {
        condition: { type: 'host-regex', pattern: '(' },
        enabled: true,
        id: 'invalid-rule',
        target: { profileId: 'fixed-work' }
      })
    ).toThrow('规则条件不合法');
    expect(() =>
      addRule(document('last'), 'automatic', {
        condition: { type: 'host-wildcard', pattern: '*.example.com' },
        enabled: true,
        id: 'system-rule',
        target: { profileId: 'system' }
      })
    ).toThrow('自动切换规则目标不能被 Chrome PAC 路由');
  });

  it('keeps loopback direct unless the user explicitly changes automatic settings', () => {
    const updated = updateAutoSwitchSettings(document('last'), 'automatic', {
      fallback: { profileId: 'fixed-work' },
      loopbackPolicy: 'use-rules',
      proxyFailurePolicy: 'block'
    });

    expect(automatic(updated)).toMatchObject({
      fallback: { profileId: 'fixed-work' },
      loopbackPolicy: 'use-rules',
      proxyFailurePolicy: 'block'
    });
  });

  it('clones a rule beside its source and resets all targets to the current fallback', () => {
    const cloned = cloneRule(document('last'), 'automatic', 'existing-rule', 'copied-rule');

    expect(automatic(cloned).rules.map((rule) => rule.id)).toEqual([
      'existing-rule',
      'copied-rule'
    ]);

    const reset = resetRuleTargets(
      {
        ...cloned,
        profiles: cloned.profiles.map((profile) =>
          profile.id === 'automatic' && profile.kind === 'auto-switch'
            ? { ...profile, fallback: { profileId: 'direct' } }
            : profile
        )
      },
      'automatic'
    );

    expect(automatic(reset).rules.every((rule) => rule.target.profileId === 'direct')).toBe(true);
  });
});

function automatic(document: ProfileDocumentV2) {
  const profile = document.profiles.find((candidate) => candidate.id === 'automatic');
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('测试数据缺少自动切换配置');
  }
  return profile;
}

function document(ruleInsertPosition: 'first' | 'last'): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'automatic',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'fixed-work',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'proxy-work' },
        bypassList: []
      },
      {
        id: 'automatic',
        kind: 'auto-switch',
        name: '工作自动切换',
        fallback: { profileId: 'direct' },
        loopbackPolicy: 'direct',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: [
          {
            id: 'existing-rule',
            enabled: true,
            condition: { type: 'host-wildcard', pattern: '*.existing.example' },
            target: { profileId: 'fixed-work' }
          }
        ]
      }
    ],
    proxyServers: [
      {
        id: 'proxy-work',
        name: '工作节点',
        scheme: 'socks5',
        host: 'proxy.example.test',
        port: 1080
      }
    ],
    ruleSources: [],
    settings: {
      startupProfileId: 'automatic',
      reloadAfterProfileChange: false,
      ruleInsertPosition,
      networkMonitor: { enabled: false }
    }
  };
}

import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import {
  attachedRuleListForAutoSwitch,
  composeAutoSwitchText,
  createAttachedRuleList,
  removeAttachedRuleList,
  replaceAutoSwitchText,
  setAutoSwitchFallback,
  setAutoSwitchRuleSourceIds
} from './auto-switch-draft.ts';

describe('auto switch draft actions', () => {
  it('updates the default target without changing any explicit rule', () => {
    const next = setAutoSwitchFallback(document(), 'automatic', { profileId: 'fixed' });
    const profile = automatic(next);

    expect(profile.fallback).toEqual({ profileId: 'fixed' });
    expect(profile.rules).toEqual(automatic(document()).rules);
  });

  it('stores selected rule sources once and rejects unknown source ids', () => {
    const next = setAutoSwitchRuleSourceIds(document(), 'automatic', ['source-a', 'source-a']);

    expect(automatic(next).ruleSourceIds).toEqual(['source-a']);
    expect(() => setAutoSwitchRuleSourceIds(document(), 'automatic', ['missing-source'])).toThrow(
      '规则来源不存在'
    );
  });

  it('creates and removes the hidden rule-list configuration attached to automatic switching', () => {
    const attached = createAttachedRuleList(document(), 'automatic', 'attached-list');
    const attachment = attachedRuleListForAutoSwitch(attached, 'automatic');

    expect(automatic(attached).ruleSourceIds).toEqual(['rule-source-attached-list']);
    expect(attachment).toMatchObject({
      ownedByAutoSwitch: true,
      profile: {
        fallback: { profileId: 'direct' },
        id: 'attached-list',
        kind: 'rule-list',
        matchTarget: { profileId: 'direct' },
        name: '__ruleListOf_automatic'
      },
      source: { id: 'rule-source-attached-list', name: '自动切换 规则列表' }
    });

    const removed = removeAttachedRuleList(attached, 'automatic');
    expect(automatic(removed).ruleSourceIds).toEqual([]);
    expect(removed.profiles.some((profile) => profile.id === 'attached-list')).toBe(false);
    expect(removed.ruleSources.some((source) => source.id === 'rule-source-attached-list')).toBe(
      false
    );
  });

  it('uses the attached rule-list fallback for popup and text-source default targets', () => {
    const attached = createAttachedRuleList(document(), 'automatic', 'attached-list');
    const next = setAutoSwitchFallback(attached, 'automatic', { profileId: 'fixed' });

    expect(automatic(next).fallback).toEqual({ profileId: 'direct' });
    expect(attachedRuleListForAutoSwitch(next, 'automatic')?.profile.fallback).toEqual({
      profileId: 'fixed'
    });
    expect(composeAutoSwitchText(next, 'automatic')).toContain('true + 工作代理');
  });

  it('round-trips the original Switchy text source with rule targets and a default target', () => {
    const source = composeAutoSwitchText(document(), 'automatic');

    expect(source).toContain('[SwitchyOmega Conditions]');
    expect(source).toContain('@with result');
    expect(source).toContain('host: *.example.com + 直连');
    expect(source).toContain('true + 直连');

    const next = replaceAutoSwitchText(document(), 'automatic', source, () => 'new-rule');
    expect(automatic(next).fallback).toEqual({ profileId: 'direct' });
    expect(automatic(next).rules).toEqual([
      {
        condition: { pattern: '*.example.com', type: 'host-wildcard' },
        enabled: true,
        id: 'rule',
        target: { profileId: 'direct' }
      }
    ]);
  });

  it('rejects text source lines that point to a configuration that does not exist', () => {
    expect(() =>
      replaceAutoSwitchText(
        document(),
        'automatic',
        '[SwitchyOmega Conditions]\n@with result\nhost: *.example.com + 不存在\ntrue + 直连',
        () => 'new-rule'
      )
    ).toThrow('第 3 行引用的配置不存在：不存在');
  });
});

function automatic(document: ProfileDocumentV2) {
  const profile = document.profiles.find((candidate) => candidate.id === 'automatic');
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('测试配置缺少自动切换');
  }
  return profile;
}

function document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'automatic',
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
        fallback: { profileId: 'direct' },
        id: 'automatic',
        kind: 'auto-switch',
        loopbackPolicy: 'direct',
        name: '自动切换',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: [
          {
            condition: { pattern: '*.example.com', type: 'host-wildcard' },
            enabled: true,
            id: 'rule',
            target: { profileId: 'direct' }
          }
        ]
      }
    ],
    proxyServers: [
      { host: 'proxy.example', id: 'proxy', name: '代理', port: 1080, scheme: 'socks5' }
    ],
    ruleSources: [
      {
        format: 'auto-proxy',
        id: 'source-a',
        name: '公司规则',
        source: { kind: 'inline', text: '' }
      }
    ],
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'automatic'
    }
  };
}

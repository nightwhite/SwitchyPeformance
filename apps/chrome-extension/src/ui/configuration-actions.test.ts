import { describe, expect, it } from 'vitest';

import type { ProfileDocument } from '@switchypeformance/contracts';

import {
  addAutoSwitchProfile,
  addHostRuleToAutoSwitch,
  removeAutoSwitchProfile,
  removeProxyAndReferences
} from './configuration-actions.ts';

const document: ProfileDocument = {
  activeProfileId: 'fixed-edge',
  credentials: {},
  proxies: [{ host: '127.0.0.1', id: 'edge', name: 'Edge', port: 1080, scheme: 'socks5' }],
  profiles: [
    { id: 'direct', kind: 'direct', name: 'Direct' },
    { id: 'fixed-edge', kind: 'fixed-proxy', name: 'Edge', proxyId: 'edge' },
    {
      fallback: { kind: 'proxy', proxyId: 'edge' },
      id: 'auto',
      kind: 'auto-switch',
      loopbackPolicy: 'direct',
      proxyFailurePolicy: 'direct',
      name: 'Automatic',
      rules: [
        {
          condition: { type: 'host-suffix', value: 'x.test' },
          enabled: true,
          id: 'edge-rule',
          target: { kind: 'proxy', proxyId: 'edge' }
        }
      ]
    }
  ],
  schemaVersion: 1
};

describe('removeProxyAndReferences', () => {
  it('removes dependent profiles and automatic rules, then falls back to direct', () => {
    expect(removeProxyAndReferences(document, 'edge')).toMatchObject({
      activeProfileId: 'direct',
      proxies: [],
      profiles: [
        { id: 'direct', kind: 'direct' },
        {
          fallback: { kind: 'direct' },
          id: 'auto',
          kind: 'auto-switch',
          rules: []
        }
      ]
    });
  });
});

describe('addHostRuleToAutoSwitch', () => {
  it('adds a host rule and updates the existing host rule instead of shadowing it', () => {
    const withRule = addHostRuleToAutoSwitch(document, {
      host: 'github.com',
      profileId: 'auto',
      ruleId: 'quick-rule',
      target: { kind: 'proxy', proxyId: 'edge' }
    });
    const updated = addHostRuleToAutoSwitch(withRule, {
      host: 'github.com',
      profileId: 'auto',
      ruleId: 'ignored',
      target: { kind: 'direct' }
    });
    const automatic = updated.profiles.find((profile) => profile.id === 'auto');

    expect(automatic).toMatchObject({
      rules: [
        {
          id: 'edge-rule',
          condition: { type: 'host-suffix', value: 'x.test' }
        },
        {
          id: 'quick-rule',
          enabled: true,
          condition: { type: 'host-suffix', value: 'github.com' },
          target: { kind: 'direct' }
        }
      ]
    });
  });

  it('rejects an invalid host before creating a route that Chrome cannot match', () => {
    expect(() =>
      addHostRuleToAutoSwitch(document, {
        host: 'https://github.com/path',
        profileId: 'auto',
        ruleId: 'quick-rule',
        target: { kind: 'direct' }
      })
    ).toThrow('请输入主机名');
  });

  it('keeps loopback direct unless the user explicitly adds a loopback proxy rule', () => {
    const updated = addHostRuleToAutoSwitch(document, {
      host: 'localhost',
      profileId: 'auto',
      ruleId: 'local-proxy',
      target: { kind: 'proxy', proxyId: 'edge' }
    });

    expect(updated.profiles.find((profile) => profile.id === 'auto')).toMatchObject({
      loopbackPolicy: 'use-rules'
    });
  });
});

describe('automatic profile lifecycle', () => {
  it('adds a separate automatic profile with safe defaults', () => {
    expect(addAutoSwitchProfile(document, 'auto-work', 'Work routes')).toMatchObject({
      profiles: [
        expect.anything(),
        expect.anything(),
        expect.anything(),
        {
          id: 'auto-work',
          kind: 'auto-switch',
          name: 'Work routes',
          fallback: { kind: 'direct' },
          loopbackPolicy: 'direct',
          proxyFailurePolicy: 'direct',
          rules: []
        }
      ]
    });
  });

  it('deletes an automatic profile and returns an active deleted profile to direct', () => {
    const withProfile = {
      ...addAutoSwitchProfile(document, 'auto-work', 'Work routes'),
      activeProfileId: 'auto-work'
    };

    expect(removeAutoSwitchProfile(withProfile, 'auto-work')).toMatchObject({
      activeProfileId: 'direct',
      profiles: expect.not.arrayContaining([expect.objectContaining({ id: 'auto-work' })])
    });
  });

  it('does not delete the last automatic profile', () => {
    const onlyAutomatic: ProfileDocument = {
      ...document,
      profiles: [
        ...document.profiles.filter((profile) => profile.kind !== 'auto-switch'),
        {
          id: 'only-auto',
          kind: 'auto-switch',
          name: 'Only automatic',
          fallback: { kind: 'direct' },
          loopbackPolicy: 'direct',
          proxyFailurePolicy: 'direct',
          rules: []
        }
      ]
    };

    expect(() => removeAutoSwitchProfile(onlyAutomatic, 'only-auto')).toThrow(
      '至少需要保留一个自动切换配置'
    );
  });
});

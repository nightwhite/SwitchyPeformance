import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import {
  createOriginalProfile,
  renameOriginalProfile,
  replaceAndDeleteOriginalProfile,
  setOriginalProfileColor
} from './profile-actions.ts';

describe('original profile actions', () => {
  it('creates a profile in the draft without changing the current mode', () => {
    const result = createOriginalProfile(document(), {
      id: 'work-switch',
      kind: 'auto-switch',
      name: '工作自动切换'
    });

    expect(result.profileId).toBe('work-switch');
    expect(result.document.activeProfileId).toBe('automatic');
    expect(result.document.profiles.at(-1)).toMatchObject({
      id: 'work-switch',
      kind: 'auto-switch',
      name: '工作自动切换'
    });
  });

  it('creates a fixed profile with an explicitly selected proxy server', () => {
    const result = createOriginalProfile(document(), {
      id: 'work-proxy',
      kind: 'fixed-proxy',
      name: '工作代理',
      proxyId: 'edge'
    });

    expect(result.document.profiles.at(-1)).toMatchObject({
      id: 'work-proxy',
      kind: 'fixed-proxy',
      routes: { fallbackProxyId: 'edge' }
    });
  });

  it('does not allow ambiguous duplicate profile names', () => {
    expect(() =>
      createOriginalProfile(document(), {
        id: 'duplicate',
        kind: 'auto-switch',
        name: '自动切换'
      })
    ).toThrow('配置名称已存在');

    expect(() => renameOriginalProfile(document(), 'automatic', '直连')).toThrow('配置名称已存在');
  });

  it('keeps profile color changes in the returned draft document', () => {
    const next = setOriginalProfileColor(document(), 'automatic', '#3478b7');

    expect(next.profiles.find((profile) => profile.id === 'automatic')).toMatchObject({
      color: '#3478b7'
    });
  });

  it('replaces references before removing a profile from the draft', () => {
    const next = replaceAndDeleteOriginalProfile(document(), 'automatic', 'direct');

    expect(next.profiles.some((profile) => profile.id === 'automatic')).toBe(false);
    expect(next.activeProfileId).toBe('direct');
  });
});

function document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'automatic',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
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
      }
    ],
    proxyServers: [
      { host: '127.0.0.1', id: 'edge', name: '边缘节点', port: 1080, scheme: 'socks5' }
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

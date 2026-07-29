import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import {
  createProxyServerWithFixedProfile,
  deleteProxyServerWithDependentProfiles,
  planProxyServerDeletion,
  replaceAndDeleteProxyServer,
  updateFixedProxyProfile
} from './proxy-server-actions.ts';

describe('V2 proxy server actions', () => {
  it('creates a selectable fixed-proxy profile with each new server', () => {
    const result = createProxyServerWithFixedProfile(document(), {
      profileId: 'fixed-tokyo',
      proxy: {
        host: 'tokyo.proxy.example',
        id: 'proxy-tokyo',
        name: '东京节点',
        port: 1080,
        scheme: 'socks5'
      }
    });

    expect(result.proxyServers.at(-1)).toMatchObject({
      id: 'proxy-tokyo',
      name: '东京节点',
      scheme: 'socks5'
    });
    expect(result.profiles.at(-1)).toEqual({
      id: 'fixed-tokyo',
      kind: 'fixed-proxy',
      name: '东京节点',
      routes: { fallbackProxyId: 'proxy-tokyo' },
      bypassList: []
    });
  });

  it('updates protocol-specific routes and normalizes bypass rules', () => {
    const result = updateFixedProxyProfile(document(), 'fixed-work', {
      bypassList: [' *.internal.example ', '', 'localhost', '*.internal.example'],
      routes: {
        fallbackProxyId: 'proxy-primary',
        httpsProxyId: 'proxy-backup'
      }
    });

    expect(result.profiles.find((profile) => profile.id === 'fixed-work')).toMatchObject({
      kind: 'fixed-proxy',
      routes: { fallbackProxyId: 'proxy-primary', httpsProxyId: 'proxy-backup' },
      bypassList: ['*.internal.example', 'localhost']
    });
  });

  it('requires a replacement server before deleting a referenced server', () => {
    const plan = planProxyServerDeletion(document(), 'proxy-primary');
    expect(plan).toMatchObject({
      allowed: false,
      references: [
        { profileId: 'fixed-work', field: 'routes.fallbackProxyId' },
        { profileId: 'fixed-work', field: 'routes.httpProxyId' }
      ]
    });

    const result = replaceAndDeleteProxyServer(document(), 'proxy-primary', 'proxy-backup');
    expect(result.proxyServers.map((proxy) => proxy.id)).toEqual(['proxy-backup']);
    expect(result.profiles.find((profile) => profile.id === 'fixed-work')).toMatchObject({
      routes: {
        fallbackProxyId: 'proxy-backup',
        httpProxyId: 'proxy-backup'
      }
    });
  });

  it('allows deletion without a replacement only when nothing references the server', () => {
    const unused = createProxyServerWithFixedProfile(document(), {
      profileId: 'fixed-unused',
      proxy: {
        host: 'unused.proxy.example',
        id: 'proxy-unused',
        name: '未使用节点',
        port: 1080,
        scheme: 'http'
      }
    });
    const withoutProfile = {
      ...unused,
      profiles: unused.profiles.filter((profile) => profile.id !== 'fixed-unused')
    };

    expect(planProxyServerDeletion(withoutProfile, 'proxy-unused')).toMatchObject({
      allowed: true
    });
    expect(replaceAndDeleteProxyServer(withoutProfile, 'proxy-unused')).toMatchObject({
      proxyServers: [{ id: 'proxy-primary' }, { id: 'proxy-backup' }]
    });
  });

  it('removes a server and its dependent fixed profile while repairing profile references', () => {
    const source: ProfileDocumentV2 = {
      ...document(),
      activeProfileId: 'automatic',
      profiles: [
        ...document().profiles,
        {
          fallback: { profileId: 'direct' },
          id: 'automatic',
          kind: 'auto-switch',
          loopbackPolicy: 'use-rules',
          name: '自动切换',
          proxyFailurePolicy: 'direct',
          ruleSourceIds: [],
          rules: [
            {
              condition: { pattern: '*.example.com', type: 'host-wildcard' },
              enabled: true,
              id: 'work-rule',
              target: { profileId: 'fixed-work' }
            }
          ]
        }
      ],
      settings: { ...document().settings, startupProfileId: 'automatic' }
    };

    const result = deleteProxyServerWithDependentProfiles(source, 'proxy-primary', 'direct');

    expect(result.proxyServers.map((proxy) => proxy.id)).toEqual(['proxy-backup']);
    expect(result.profiles).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'fixed-work' })])
    );
    expect(result.profiles.find((profile) => profile.id === 'automatic')).toMatchObject({
      rules: [expect.objectContaining({ target: { profileId: 'direct' } })]
    });
  });
});

function document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'fixed-work',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'fixed-work',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: {
          fallbackProxyId: 'proxy-primary',
          httpProxyId: 'proxy-primary'
        },
        bypassList: ['localhost']
      }
    ],
    proxyServers: [
      {
        id: 'proxy-primary',
        name: '主节点',
        scheme: 'socks5',
        host: 'primary.proxy.example',
        port: 1080
      },
      {
        id: 'proxy-backup',
        name: '备用节点',
        scheme: 'https',
        host: 'backup.proxy.example',
        port: 443
      }
    ],
    ruleSources: [],
    settings: {
      startupProfileId: 'fixed-work',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}

import { describe, expect, it } from 'vitest';

import type { ProfileDocument } from '@switchypeformance/contracts';

import { buildChromeProxySetting } from './proxy-setting.ts';

const proxies = [
  {
    host: '127.0.0.1',
    id: 'edge',
    name: 'Edge gateway',
    port: 1080,
    scheme: 'socks5' as const
  }
];

function documentWith(profile: unknown): ProfileDocument {
  return {
    activeProfileId: 'active',
    credentials: {},
    profiles: [profile] as ProfileDocument['profiles'],
    proxies,
    schemaVersion: 1
  };
}

describe('buildChromeProxySetting', () => {
  it('uses Chrome direct mode for a direct profile', () => {
    expect(
      buildChromeProxySetting(documentWith({ id: 'active', kind: 'direct', name: 'Direct' }))
    ).toEqual({ mode: 'direct' });
  });

  it('uses the system setting without pretending it is direct mode', () => {
    expect(
      buildChromeProxySetting(documentWith({ id: 'active', kind: 'system', name: 'System' }))
    ).toEqual({ mode: 'system' });
  });

  it('builds a fixed server setting and bypasses loopback traffic', () => {
    expect(
      buildChromeProxySetting(
        documentWith({ id: 'active', kind: 'fixed-proxy', name: 'Edge', proxyId: 'edge' })
      )
    ).toEqual({
      mode: 'fixed_servers',
      rules: {
        bypassList: ['<local>', 'localhost', '127.0.0.1', '[::1]'],
        singleProxy: { host: '127.0.0.1', port: 1080, scheme: 'socks5' }
      }
    });
  });

  it('uses the precompiled PAC text for an auto-switch profile', () => {
    expect(
      buildChromeProxySetting(
        documentWith({
          fallback: { kind: 'direct' },
          id: 'active',
          kind: 'auto-switch',
          loopbackPolicy: 'direct',
          name: 'Automatic',
          rules: []
        }),
        'function FindProxyForURL(){return "DIRECT";}'
      )
    ).toEqual({
      mode: 'pac_script',
      pacScript: {
        data: 'function FindProxyForURL(){return "DIRECT";}',
        mandatory: true
      }
    });
  });
});

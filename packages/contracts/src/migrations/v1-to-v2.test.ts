import { describe, expect, it } from 'vitest';

import * as contracts from '../index.ts';

type PublicApi = Record<string, unknown>;

const api = contracts as PublicApi;

describe('V1 到 V2 配置迁移', () => {
  it('保留固定代理、自动切换规则顺序和配置目标', () => {
    expect(api.migrateV1Document).toBeTypeOf('function');
    const migrateV1Document = api.migrateV1Document as (value: unknown) => {
      value: Record<string, unknown>;
      warnings: readonly string[];
    };

    const result = migrateV1Document(v1Document());
    const auto = (result.value.profiles as Record<string, unknown>[]).find(
      (profile) => profile.id === 'auto-work'
    );

    expect(result.value).toMatchObject({ schemaVersion: 2, activeProfileId: 'auto-work' });
    expect(auto).toMatchObject({
      kind: 'auto-switch',
      rules: [
        {
          id: 'suffix-rule',
          condition: { type: 'host-wildcard', pattern: '*.example.com' },
          target: { profileId: 'fixed-work' }
        },
        {
          id: 'url-rule',
          condition: { type: 'url-wildcard', pattern: '*://api.example.com/*' },
          target: { profileId: 'direct' }
        }
      ]
    });
    expect(result.value.proxyServers).toEqual([
      {
        id: 'proxy-work',
        name: '工作代理',
        scheme: 'socks5',
        host: 'proxy.example.test',
        port: 1080,
        credentialId: 'credential-work'
      }
    ]);
    expect(JSON.stringify(result.value)).not.toContain('secret-password');
    expect(result.warnings).toEqual([]);
  });
});

function v1Document() {
  return {
    schemaVersion: 1,
    activeProfileId: 'auto-work',
    credentials: {},
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      { id: 'fixed-work', kind: 'fixed-proxy', name: '工作代理', proxyId: 'proxy-work' },
      {
        id: 'auto-work',
        kind: 'auto-switch',
        name: '自动切换',
        fallback: { kind: 'direct' },
        loopbackPolicy: 'direct',
        proxyFailurePolicy: 'direct',
        rules: [
          {
            id: 'suffix-rule',
            enabled: true,
            condition: { type: 'host-suffix', value: 'example.com' },
            target: { kind: 'proxy', proxyId: 'proxy-work' }
          },
          {
            id: 'url-rule',
            enabled: true,
            condition: { type: 'url-glob', value: '*://api.example.com/*' },
            target: { kind: 'direct' }
          }
        ]
      }
    ],
    proxies: [
      {
        id: 'proxy-work',
        name: '工作代理',
        scheme: 'socks5',
        host: 'proxy.example.test',
        port: 1080,
        credentialId: 'credential-work'
      }
    ]
  };
}

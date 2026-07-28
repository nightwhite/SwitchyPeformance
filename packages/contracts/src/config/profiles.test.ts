import { describe, expect, it } from 'vitest';

import * as contracts from '../index.ts';

type PublicApi = Record<string, unknown>;

const api = contracts as PublicApi;

describe('V2 配置公共契约', () => {
  it('公开内置配置和安全的配置目标判断', () => {
    expect(api.BUILTIN_PROFILE_IDS).toEqual({ direct: 'direct', system: 'system' });
    expect(api.isProfileTarget).toBeTypeOf('function');

    const isProfileTarget = api.isProfileTarget as (value: unknown) => boolean;
    expect(isProfileTarget({ profileId: 'proxy-work' })).toBe(true);
    expect(isProfileTarget({ kind: 'proxy', proxyId: 'old-shape' })).toBe(false);
    expect(isProfileTarget({ profileId: '  ' })).toBe(false);
  });

  it('公开八种可创建的配置类型', () => {
    expect(api.PROFILE_KINDS).toEqual([
      'direct',
      'system',
      'fixed-proxy',
      'pac',
      'auto-detect',
      'auto-switch',
      'rule-list',
      'virtual'
    ]);
    expect(api.isProfileKind).toBeTypeOf('function');

    const isProfileKind = api.isProfileKind as (value: unknown) => boolean;
    expect(isProfileKind('fixed-proxy')).toBe(true);
    expect(isProfileKind('virtual')).toBe(true);
    expect(isProfileKind('unknown-profile')).toBe(false);
  });

  it('区分代理服务器与浏览器配置目标', () => {
    expect(api.PROXY_SCHEMES).toEqual(['http', 'https', 'socks4', 'socks5']);
    expect(api.isProxyServer).toBeTypeOf('function');

    const isProxyServer = api.isProxyServer as (value: unknown) => boolean;
    expect(
      isProxyServer({
        id: 'proxy-work',
        name: '工作代理',
        host: 'proxy.example.test',
        port: 1080,
        scheme: 'socks5'
      })
    ).toBe(true);
    expect(
      isProxyServer({
        id: 'proxy-work',
        name: '工作代理',
        host: 'proxy.example.test',
        port: 1080,
        scheme: 'ftp'
      })
    ).toBe(false);
  });
});

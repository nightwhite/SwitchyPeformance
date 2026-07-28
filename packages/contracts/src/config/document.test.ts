import { describe, expect, it } from 'vitest';

import * as contracts from '../index.ts';

type ParseResult =
  | { ok: true; value: { schemaVersion: number; activeProfileId: string } }
  | { ok: false; issues: readonly { code: string; path: string }[] };

type PublicApi = Record<string, unknown>;

const api = contracts as PublicApi;

describe('V2 配置文档', () => {
  it('读取一个包含内置、固定和自动切换配置的有效文档', () => {
    expect(api.parseProfileDocumentV2).toBeTypeOf('function');
    const parseProfileDocumentV2 = api.parseProfileDocumentV2 as (value: unknown) => ParseResult;

    const result = parseProfileDocumentV2(validDocument());

    expect(result).toMatchObject({
      ok: true,
      value: { schemaVersion: 2, activeProfileId: 'auto-work' }
    });
  });

  it('拒绝引用不存在配置的自动切换规则', () => {
    expect(api.parseProfileDocumentV2).toBeTypeOf('function');
    const parseProfileDocumentV2 = api.parseProfileDocumentV2 as (value: unknown) => ParseResult;
    const document = validDocument();
    const auto = document.profiles.find((profile) => profile.id === 'auto-work') as Record<
      string,
      unknown
    >;
    auto.fallback = { profileId: 'missing-profile' };

    const result = parseProfileDocumentV2(document);

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'unknown-profile-reference', path: 'profiles[3].fallback.profileId' }]
    });
  });

  it('拒绝虚拟配置形成的循环', () => {
    expect(api.parseProfileDocumentV2).toBeTypeOf('function');
    const parseProfileDocumentV2 = api.parseProfileDocumentV2 as (value: unknown) => ParseResult;
    const document = validDocument();
    document.profiles.push(
      { id: 'virtual-a', kind: 'virtual', name: 'A', target: { profileId: 'virtual-b' } },
      { id: 'virtual-b', kind: 'virtual', name: 'B', target: { profileId: 'virtual-a' } }
    );

    const result = parseProfileDocumentV2(document);

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'profile-cycle' }] });
  });

  it('拒绝删除直连或系统内置配置后的不完整文档', () => {
    expect(api.parseProfileDocumentV2).toBeTypeOf('function');
    const parseProfileDocumentV2 = api.parseProfileDocumentV2 as (value: unknown) => ParseResult;
    const document = validDocument();
    document.profiles = document.profiles.filter((profile) => profile.id !== 'direct');

    const result = parseProfileDocumentV2(document);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual({ code: 'missing-builtin-profile', path: 'profiles' });
    }
  });

  it('拒绝固定配置和规则列表中的未知引用', () => {
    expect(api.parseProfileDocumentV2).toBeTypeOf('function');
    const parseProfileDocumentV2 = api.parseProfileDocumentV2 as (value: unknown) => ParseResult;
    const document = validDocument();
    const fixed = document.profiles.find((profile) => profile.id === 'fixed-work') as Record<
      string,
      unknown
    >;
    fixed.routes = { fallbackProxyId: 'missing-proxy' };
    document.profiles.push({
      id: 'list-work',
      kind: 'rule-list',
      name: '订阅规则',
      sourceId: 'missing-source',
      matchTarget: { profileId: 'fixed-work' },
      fallback: { profileId: 'direct' }
    });

    const result = parseProfileDocumentV2(document);

    expect(result).toMatchObject({
      ok: false,
      issues: [
        { code: 'unknown-proxy-reference', path: 'profiles[2].routes.fallbackProxyId' },
        { code: 'unknown-source-reference', path: 'profiles[4].sourceId' }
      ]
    });
  });
});

function validDocument(): {
  schemaVersion: number;
  activeProfileId: string;
  profiles: Record<string, unknown>[];
  proxyServers: Record<string, unknown>[];
  ruleSources: Record<string, unknown>[];
  settings: Record<string, unknown>;
} {
  return {
    schemaVersion: 2,
    activeProfileId: 'auto-work',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'fixed-work',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'proxy-work' },
        bypassList: ['localhost']
      },
      {
        id: 'auto-work',
        kind: 'auto-switch',
        name: '自动切换',
        fallback: { profileId: 'direct' },
        loopbackPolicy: 'direct',
        proxyFailurePolicy: 'direct',
        rules: [
          {
            id: 'work-domain',
            enabled: true,
            condition: { type: 'host-wildcard', pattern: '*.example.com' },
            target: { profileId: 'fixed-work' }
          }
        ],
        ruleSourceIds: []
      }
    ],
    proxyServers: [
      {
        id: 'proxy-work',
        name: '工作 SOCKS',
        scheme: 'socks5',
        host: 'proxy.example.test',
        port: 1080
      }
    ],
    ruleSources: [],
    settings: {
      startupProfileId: 'auto-work',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}

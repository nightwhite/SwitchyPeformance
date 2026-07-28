import { describe, expect, it } from 'vitest';

import * as contracts from './index.ts';

type ParseResult =
  | { ok: true; value: { schemaVersion: 1 | 2; activeProfileId: string } }
  | { ok: false; issues: readonly { code: string; path: string }[] };

type PublicApi = Record<string, unknown>;

const api = contracts as PublicApi;

describe('版本化配置文档', () => {
  it('按 schemaVersion 分流读取 V1 和 V2 配置', () => {
    expect(api.parseConfigurationDocument).toBeTypeOf('function');
    const parseConfigurationDocument = api.parseConfigurationDocument as (
      value: unknown
    ) => ParseResult;

    expect(parseConfigurationDocument(v1Document())).toMatchObject({
      ok: true,
      value: { schemaVersion: 1, activeProfileId: 'direct' }
    });
    expect(parseConfigurationDocument(v2Document())).toMatchObject({
      ok: true,
      value: { schemaVersion: 2, activeProfileId: 'direct' }
    });
  });

  it('拒绝未知版本而不尝试猜测配置形状', () => {
    expect(api.parseConfigurationDocument).toBeTypeOf('function');
    const parseConfigurationDocument = api.parseConfigurationDocument as (
      value: unknown
    ) => ParseResult;

    expect(parseConfigurationDocument({ schemaVersion: 3 })).toEqual({
      ok: false,
      issues: [{ code: 'unsupported-schema-version', path: 'schemaVersion' }]
    });
  });
});

function v1Document() {
  return {
    schemaVersion: 1,
    activeProfileId: 'direct',
    credentials: {},
    profiles: [{ id: 'direct', kind: 'direct', name: '直连' }],
    proxies: []
  };
}

function v2Document() {
  return {
    schemaVersion: 2,
    activeProfileId: 'direct',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' }
    ],
    proxyServers: [],
    ruleSources: [],
    settings: {
      startupProfileId: 'direct',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}

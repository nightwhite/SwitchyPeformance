import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocument, ProfileDocumentV2 } from '@switchypeformance/contracts';

import { createAutoSwitchCompiler, createRouteExplainer } from './wasm-runtime.ts';

const document: ProfileDocument = {
  activeProfileId: 'auto',
  credentials: {},
  profiles: [
    {
      fallback: { kind: 'direct' },
      id: 'auto',
      kind: 'auto-switch',
      loopbackPolicy: 'direct',
      proxyFailurePolicy: 'direct',
      name: 'Automatic',
      rules: []
    }
  ],
  proxies: [],
  schemaVersion: 1
};

describe('createAutoSwitchCompiler', () => {
  it('initializes the WASM module once and compiles each configuration request', async () => {
    const compileAutoSwitchJson = vi.fn().mockReturnValue(
      JSON.stringify({
        complex_rule_count: 0,
        dns_sensitive_rule_count: 0,
        index_block_count: 0,
        pac_source: 'function FindProxyForURL(){return "DIRECT";}',
        simple_rule_count: 0
      })
    );
    const loadModule = vi.fn().mockResolvedValue({ compileAutoSwitchJson });
    const compile = createAutoSwitchCompiler(loadModule);

    await compile(document);
    await compile(document);

    expect(loadModule).toHaveBeenCalledTimes(1);
    expect(compileAutoSwitchJson).toHaveBeenCalledTimes(2);
    expect(JSON.parse(compileAutoSwitchJson.mock.calls[0]?.[0] ?? '{}')).toMatchObject({
      activeProfileId: 'auto',
      schemaVersion: 1
    });
  });

  it('measures local compile work without putting timing on the page-load path', async () => {
    const compileAutoSwitchJson = vi.fn().mockReturnValue(
      JSON.stringify({
        complex_rule_count: 0,
        dns_sensitive_rule_count: 0,
        index_block_count: 1,
        pac_source: 'function FindProxyForURL(){return "DIRECT";}',
        simple_rule_count: 861
      })
    );
    const now = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(112.5);
    const compile = createAutoSwitchCompiler(vi.fn().mockResolvedValue({ compileAutoSwitchJson }), {
      now
    });

    const result = await compile(document);

    expect(result.metrics).toMatchObject({
      compileDurationMs: 12.5,
      pacByteLength: 44,
      simpleRuleCount: 861
    });
  });

  it('forwards a V2 document without converting it back into the old format', async () => {
    const compileAutoSwitchJson = vi.fn().mockReturnValue(
      JSON.stringify({
        complex_rule_count: 0,
        dns_sensitive_rule_count: 0,
        index_block_count: 0,
        pac_source: 'function FindProxyForURL(){return "DIRECT";}',
        simple_rule_count: 0
      })
    );
    const compile = createAutoSwitchCompiler(vi.fn().mockResolvedValue({ compileAutoSwitchJson }));
    const v2Document: ProfileDocumentV2 = {
      schemaVersion: 2,
      activeProfileId: 'auto',
      profiles: [
        { id: 'direct', kind: 'direct', name: '直连' },
        { id: 'system', kind: 'system', name: '系统代理' },
        {
          id: 'auto',
          kind: 'auto-switch',
          name: '自动切换',
          fallback: { profileId: 'direct' },
          loopbackPolicy: 'direct',
          proxyFailurePolicy: 'direct',
          rules: [],
          ruleSourceIds: []
        }
      ],
      proxyServers: [],
      ruleSources: [],
      settings: {
        startupProfileId: 'auto',
        reloadAfterProfileChange: false,
        ruleInsertPosition: 'last',
        networkMonitor: { enabled: false }
      }
    };

    await compile(v2Document);

    expect(JSON.parse(compileAutoSwitchJson.mock.calls[0]?.[0] ?? '{}')).toMatchObject({
      schemaVersion: 2,
      activeProfileId: 'auto'
    });
  });

  it('initializes the routing module once for route inspection', async () => {
    const explainRouteJson = vi.fn().mockReturnValue(
      JSON.stringify({
        matchedRuleId: 'proxy-example',
        reason: 'indexed-rule',
        route: { kind: 'proxy', proxyId: 'edge' }
      })
    );
    const loadModule = vi.fn().mockResolvedValue({ explainRouteJson });
    const explain = createRouteExplainer(loadModule);

    await expect(explain(document, 'https://api.example.test')).resolves.toEqual({
      matchedRuleId: 'proxy-example',
      reason: 'indexed-rule',
      route: { kind: 'proxy', proxyId: 'edge' }
    });
    await explain(document, 'https://www.example.test');

    expect(loadModule).toHaveBeenCalledTimes(1);
    expect(explainRouteJson).toHaveBeenCalledTimes(2);
  });
});

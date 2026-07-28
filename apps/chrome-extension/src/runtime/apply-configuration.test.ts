import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocument, ProfileDocumentV2 } from '@switchypeformance/contracts';

import { applyConfiguration } from './apply-configuration.ts';

const directDocument: ProfileDocument = {
  activeProfileId: 'direct',
  credentials: {},
  profiles: [{ id: 'direct', kind: 'direct', name: 'Direct' }],
  proxies: [],
  schemaVersion: 1
};

const automaticDocument: ProfileDocument = {
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

describe('applyConfiguration', () => {
  it('does not load the auto-switch compiler for a direct profile', async () => {
    const compileAutoSwitch = vi.fn();
    const setProxySetting = vi.fn().mockResolvedValue(undefined);

    const result = await applyConfiguration(directDocument, {
      compileAutoSwitch,
      setProxySetting
    });

    expect(compileAutoSwitch).not.toHaveBeenCalled();
    expect(setProxySetting).toHaveBeenCalledWith({ mode: 'direct' });
    expect(result).toEqual({ mode: 'direct' });
  });

  it('compiles PAC once before applying an auto-switch profile', async () => {
    const compileAutoSwitch = vi.fn().mockResolvedValue({
      pacSource: 'function FindProxyForURL(){return "DIRECT";}',
      metrics: {
        complexRuleCount: 0,
        dnsSensitiveRuleCount: 0,
        indexBlockCount: 1,
        simpleRuleCount: 4
      }
    });
    const setProxySetting = vi.fn().mockResolvedValue(undefined);

    const result = await applyConfiguration(automaticDocument, {
      compileAutoSwitch,
      setProxySetting
    });

    expect(compileAutoSwitch).toHaveBeenCalledTimes(1);
    expect(compileAutoSwitch).toHaveBeenCalledWith(automaticDocument);
    expect(setProxySetting).toHaveBeenCalledWith({
      mode: 'pac_script',
      pacScript: {
        data: 'function FindProxyForURL(){return "DIRECT";}',
        mandatory: true
      }
    });
    expect(result).toEqual({
      metrics: {
        complexRuleCount: 0,
        dnsSensitiveRuleCount: 0,
        indexBlockCount: 1,
        simpleRuleCount: 4
      },
      mode: 'pac_script'
    });
  });

  it('applies a V2 fixed proxy without invoking the PAC compiler', async () => {
    const compileAutoSwitch = vi.fn();
    const setProxySetting = vi.fn().mockResolvedValue(undefined);

    const result = await applyConfiguration(v2FixedDocument(), {
      compileAutoSwitch,
      setProxySetting
    });

    expect(compileAutoSwitch).not.toHaveBeenCalled();
    expect(setProxySetting).toHaveBeenCalledWith({
      mode: 'fixed_servers',
      rules: {
        bypassList: ['<local>', 'localhost', '127.0.0.1', '[::1]', '*.internal.test'],
        fallbackProxy: { host: 'proxy.test', port: 1080, scheme: 'socks5' }
      }
    });
    expect(result).toEqual({ mode: 'fixed_servers' });
  });

  it('compiles a V2 auto-switch profile once before applying its PAC', async () => {
    const compileAutoSwitch = vi.fn().mockResolvedValue(compilationResult());
    const setProxySetting = vi.fn().mockResolvedValue(undefined);
    const document = v2AutoSwitchDocument();

    const result = await applyConfiguration(document, {
      compileAutoSwitch,
      setProxySetting
    });

    expect(compileAutoSwitch).toHaveBeenCalledWith(document);
    expect(setProxySetting).toHaveBeenCalledWith({
      mode: 'pac_script',
      pacScript: { data: compilationResult().pacSource, mandatory: true }
    });
    expect(result).toEqual({ mode: 'pac_script', metrics: compilationResult().metrics });
  });

  it('compiles the resolved V2 auto-switch profile behind a virtual profile', async () => {
    const compileAutoSwitch = vi.fn().mockResolvedValue(compilationResult());
    const setProxySetting = vi.fn().mockResolvedValue(undefined);
    const document: ProfileDocumentV2 = {
      ...v2AutoSwitchDocument(),
      activeProfileId: 'work',
      profiles: [
        ...v2AutoSwitchDocument().profiles,
        { id: 'work', kind: 'virtual', name: '工作入口', target: { profileId: 'auto' } }
      ],
      settings: { ...v2AutoSwitchDocument().settings, startupProfileId: 'work' }
    };

    await applyConfiguration(document, { compileAutoSwitch, setProxySetting });

    expect(compileAutoSwitch).toHaveBeenCalledWith({ ...document, activeProfileId: 'auto' });
  });
});

function compilationResult() {
  return {
    pacSource: 'function FindProxyForURL(){return "DIRECT";}',
    metrics: {
      complexRuleCount: 0,
      dnsSensitiveRuleCount: 0,
      indexBlockCount: 1,
      simpleRuleCount: 4
    }
  };
}

function v2FixedDocument(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'fixed',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'fixed',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'work' },
        bypassList: ['*.internal.test']
      }
    ],
    proxyServers: [{ id: 'work', name: '工作', scheme: 'socks5', host: 'proxy.test', port: 1080 }],
    ruleSources: [],
    settings: {
      startupProfileId: 'fixed',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}

function v2AutoSwitchDocument(): ProfileDocumentV2 {
  return {
    ...v2FixedDocument(),
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
    settings: {
      startupProfileId: 'auto',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}

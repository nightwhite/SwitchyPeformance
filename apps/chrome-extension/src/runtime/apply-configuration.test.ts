import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocument } from '@switchypeformance/contracts';

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
});

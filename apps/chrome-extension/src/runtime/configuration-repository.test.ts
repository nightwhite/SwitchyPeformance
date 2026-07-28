import { describe, expect, it, vi } from 'vitest';

import { createConfigurationRepository } from './configuration-repository.ts';

describe('createConfigurationRepository', () => {
  it('creates and persists the baseline direct, system, and automatic profiles', async () => {
    const read = vi.fn().mockResolvedValue(undefined);
    const write = vi.fn().mockResolvedValue(undefined);
    const repository = createConfigurationRepository({ read, write });

    const document = await repository.load();

    expect(document.activeProfileId).toBe('direct');
    expect(document.profiles.map((profile) => profile.kind)).toEqual([
      'direct',
      'system',
      'auto-switch'
    ]);
    expect(document.profiles.map((profile) => profile.name)).toEqual([
      '直连',
      '系统代理',
      '自动切换'
    ]);
    expect(write).toHaveBeenCalledWith(document);
  });

  it('upgrades old built-in English profile names to Chinese', async () => {
    const stored = {
      activeProfileId: 'auto-switch',
      credentials: {},
      profiles: [
        { id: 'direct', kind: 'direct', name: 'Direct' },
        { id: 'system', kind: 'system', name: 'System proxy' },
        {
          fallback: { kind: 'direct' },
          id: 'auto-switch',
          kind: 'auto-switch',
          loopbackPolicy: 'direct',
          name: 'Automatic routing',
          proxyFailurePolicy: 'direct',
          rules: []
        }
      ],
      proxies: [],
      schemaVersion: 1
    };
    const write = vi.fn().mockResolvedValue(undefined);
    const repository = createConfigurationRepository({
      read: vi.fn().mockResolvedValue(stored),
      write
    });

    const document = await repository.load();

    expect(document.profiles.map((profile) => profile.name)).toEqual([
      '直连',
      '系统代理',
      '自动切换'
    ]);
    expect(write).toHaveBeenCalledWith(document);
  });

  it('does not overwrite a stored document that fails validation', async () => {
    const read = vi.fn().mockResolvedValue({ schemaVersion: 1 });
    const write = vi.fn().mockResolvedValue(undefined);
    const repository = createConfigurationRepository({ read, write });

    await expect(repository.load()).rejects.toThrow('保存的配置无效');
    expect(write).not.toHaveBeenCalled();
  });

  it('loads and preserves a valid V2 document instead of forcing it through the V1 parser', async () => {
    const stored = v2Document();
    const write = vi.fn().mockResolvedValue(undefined);
    const repository = createConfigurationRepository({
      read: vi.fn().mockResolvedValue(stored),
      write
    });

    const document = await repository.load();

    expect(document).toEqual(stored);
    expect(write).not.toHaveBeenCalled();
  });
});

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

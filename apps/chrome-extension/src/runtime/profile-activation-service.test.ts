import { describe, expect, it, vi } from 'vitest';

import type { ConfigurationDocument } from '@switchypeformance/contracts';

import { createProfileActivationService } from './profile-activation-service.ts';

describe('profile activation service', () => {
  it('activates before reloading the command tab when V2 refresh is enabled', async () => {
    const activate = vi.fn().mockResolvedValue(v2Document(true));
    const reloadTab = vi.fn().mockResolvedValue(undefined);
    const service = createProfileActivationService({
      activate,
      queryActiveTab: vi.fn(),
      reloadTab,
      reportRefreshFailure: vi.fn()
    });

    await service.activate('work', { id: 42, url: 'https://app.example.test/' });

    expect(activate).toHaveBeenCalledWith('work');
    expect(reloadTab).toHaveBeenCalledWith(42);
    expect(activate.mock.invocationCallOrder[0]).toBeLessThan(
      reloadTab.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('finds the active tab only when the V2 setting requests a refresh', async () => {
    const queryActiveTab = vi.fn().mockResolvedValue({ id: 43, url: 'https://app.example.test/' });
    const reloadTab = vi.fn().mockResolvedValue(undefined);
    const service = createProfileActivationService({
      activate: vi.fn().mockResolvedValue(v2Document(true)),
      queryActiveTab,
      reloadTab,
      reportRefreshFailure: vi.fn()
    });

    await service.activate('work');

    expect(queryActiveTab).toHaveBeenCalledTimes(1);
    expect(reloadTab).toHaveBeenCalledWith(43);
  });

  it('keeps a successful profile activation when reload fails', async () => {
    const reportRefreshFailure = vi.fn().mockResolvedValue(undefined);
    const service = createProfileActivationService({
      activate: vi.fn().mockResolvedValue(v2Document(true)),
      queryActiveTab: vi.fn().mockResolvedValue({ id: 44, url: 'https://app.example.test/' }),
      reloadTab: vi.fn().mockRejectedValue(new Error('tab closed')),
      reportRefreshFailure
    });

    await expect(service.activate('work')).resolves.toMatchObject({ activeProfileId: 'work' });
    expect(reportRefreshFailure).toHaveBeenCalledWith('刷新当前标签页失败', 'tab closed');
  });

  it('does not query or reload for V1 and disabled V2 configurations', async () => {
    const queryActiveTab = vi.fn();
    const reloadTab = vi.fn();
    const service = createProfileActivationService({
      activate: vi.fn().mockResolvedValue(v1Document()),
      queryActiveTab,
      reloadTab,
      reportRefreshFailure: vi.fn()
    });

    await service.activate('system');

    expect(queryActiveTab).not.toHaveBeenCalled();
    expect(reloadTab).not.toHaveBeenCalled();
  });
});

function v1Document(): ConfigurationDocument {
  return {
    activeProfileId: 'work',
    credentials: {},
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      { id: 'work', kind: 'fixed-proxy', name: '工作代理', proxyId: 'proxy-work' }
    ],
    proxies: [
      {
        id: 'proxy-work',
        name: '工作代理',
        scheme: 'http',
        host: 'proxy.example.test',
        port: 8080
      }
    ],
    schemaVersion: 1
  };
}

function v2Document(reloadAfterProfileChange: boolean): ConfigurationDocument {
  return {
    activeProfileId: 'work',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      { id: 'work', kind: 'virtual', name: '工作代理', target: { profileId: 'direct' } }
    ],
    proxyServers: [],
    ruleSources: [],
    schemaVersion: 2,
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange,
      ruleInsertPosition: 'last',
      startupProfileId: 'direct'
    }
  };
}

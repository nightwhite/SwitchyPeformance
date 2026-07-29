import { describe, expect, it, vi } from 'vitest';

import type { ConfigurationDocument, ProfileDocumentV2 } from '@switchypeformance/contracts';

import { createStartupProfileService } from './startup-profile-service.ts';

describe('startup profile service', () => {
  it('activates the configured V2 startup profile only after confirming Chrome is controllable', async () => {
    const activate = vi.fn().mockResolvedValue(startupDocument());
    const service = createStartupProfileService({
      activate,
      loadConfiguration: vi.fn().mockResolvedValue(startupDocument()),
      readProxyControl: vi.fn().mockResolvedValue({ controlledBy: 'this_extension' }),
      reportExternalControl: vi.fn()
    });

    await expect(service.applyStartupProfile()).resolves.toEqual({
      action: 'apply-startup-profile',
      profileId: 'work'
    });
    expect(activate).toHaveBeenCalledWith('work');
  });

  it('reports a conflict instead of applying a profile when another extension owns the proxy', async () => {
    const activate = vi.fn();
    const reportExternalControl = vi.fn().mockResolvedValue(undefined);
    const service = createStartupProfileService({
      activate,
      loadConfiguration: vi.fn().mockResolvedValue(startupDocument()),
      readProxyControl: vi.fn().mockResolvedValue({ controlledBy: 'other_extension' }),
      reportExternalControl
    });

    await expect(service.applyStartupProfile()).resolves.toEqual({ action: 'show-conflict' });
    expect(activate).not.toHaveBeenCalled();
    expect(reportExternalControl).toHaveBeenCalledWith('other_extension', 'show-conflict');
  });

  it('keeps legacy configurations on their current active profile', async () => {
    const activate = vi.fn().mockResolvedValue(v1Document());
    const service = createStartupProfileService({
      activate,
      loadConfiguration: vi.fn().mockResolvedValue(v1Document()),
      readProxyControl: vi.fn().mockResolvedValue({ controlledBy: 'uncontrolled' }),
      reportExternalControl: vi.fn()
    });

    await service.applyStartupProfile();

    expect(activate).toHaveBeenCalledWith('system');
  });
});

function startupDocument(): ProfileDocumentV2 {
  return {
    activeProfileId: 'direct',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      { id: 'work', kind: 'virtual', name: '工作配置', target: { profileId: 'direct' } }
    ],
    proxyServers: [],
    ruleSources: [],
    schemaVersion: 2,
    settings: {
      networkMonitor: { enabled: false },
      onExternalConflict: 'warn',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'work'
    }
  };
}

function v1Document(): ConfigurationDocument {
  return {
    activeProfileId: 'system',
    credentials: {},
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' }
    ],
    proxies: [],
    schemaVersion: 1
  };
}

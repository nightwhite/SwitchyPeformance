import { describe, expect, it } from 'vitest';

import {
  nextProfileId,
  profileCycleIds,
  profileSwitchRefreshTabId,
  shouldReloadAfterProfileChange
} from './shortcut-service.ts';
import type { ConfigurationDocument } from '@switchypeformance/contracts';

describe('profile shortcut service', () => {
  it('cycles to the next profile and wraps to the first profile', () => {
    expect(nextProfileId(['direct', 'system', 'work'], 'system')).toBe('work');
    expect(nextProfileId(['direct', 'system', 'work'], 'work')).toBe('direct');
  });

  it('returns no profile when the cycle is empty', () => {
    expect(nextProfileId([], 'direct')).toBeUndefined();
  });

  it('starts with the first profile when the active profile is outside the cycle', () => {
    expect(nextProfileId(['direct', 'work'], 'system')).toBe('direct');
  });

  it('uses the saved V2 shortcut order and falls back to profile order for V1', () => {
    expect(profileCycleIds(v2Document(['work', 'direct']))).toEqual(['work', 'direct', 'system']);
    expect(profileCycleIds(v1Document())).toEqual(['direct', 'system', 'work']);
  });

  it('refreshes only after an enabled V2 profile change with a usable tab id', () => {
    expect(shouldReloadAfterProfileChange(v2Document(['work'], true))).toBe(true);
    expect(shouldReloadAfterProfileChange(v2Document(['work'], false))).toBe(false);
    expect(shouldReloadAfterProfileChange(v1Document())).toBe(false);
    expect(profileSwitchRefreshTabId({ id: 42, url: 'https://app.example.test/' }, true)).toBe(42);
    expect(
      profileSwitchRefreshTabId({ id: 42, url: 'chrome://extensions/' }, true)
    ).toBeUndefined();
    expect(
      profileSwitchRefreshTabId({ id: 42, url: 'https://app.example.test/' }, false)
    ).toBeUndefined();
    expect(profileSwitchRefreshTabId(undefined, true)).toBeUndefined();
  });
});

function v1Document(): ConfigurationDocument {
  return {
    activeProfileId: 'direct',
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

function v2Document(
  shortcutProfileIds: readonly string[],
  reloadAfterProfileChange = false
): ConfigurationDocument {
  return {
    activeProfileId: 'direct',
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
      shortcutProfileIds,
      startupProfileId: 'direct'
    }
  };
}

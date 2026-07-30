import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import {
  originalProfileHash,
  originalToolHash,
  resolveOriginalRoute
} from './routes.ts';

describe('original options routes', () => {
  it('opens a profile by its display name like the original options page', () => {
    expect(resolveOriginalRoute('#!/profile/auto%20switch', document())).toEqual({
      kind: 'profile',
      profileId: 'automatic'
    });
    expect(originalProfileHash(document().profiles[3]!)).toBe('#!/profile/auto%20switch');
  });

  it('keeps prior internal profile URLs usable', () => {
    expect(resolveOriginalRoute('#/profile/automatic', document())).toEqual({
      kind: 'profile',
      profileId: 'automatic'
    });
  });

  it('uses original hash names for settings entries', () => {
    expect(originalToolHash('general')).toBe('#!/general');
    expect(resolveOriginalRoute('#!/io', document())).toEqual({ kind: 'tool', page: 'io' });
  });

  it('falls back to the built-in configuration page for an unknown route', () => {
    expect(resolveOriginalRoute('#!/not-a-page', document())).toEqual({ kind: 'tool', page: 'builtin' });
  });
});

function document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'automatic',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        bypassList: [],
        id: 'work',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'proxy-work' }
      },
      {
        fallback: { profileId: 'direct' },
        id: 'automatic',
        kind: 'auto-switch',
        loopbackPolicy: 'direct',
        name: 'auto switch',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: []
      }
    ],
    proxyServers: [
      { host: '127.0.0.1', id: 'proxy-work', name: '工作服务器', port: 1080, scheme: 'socks5' }
    ],
    ruleSources: [],
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'direct'
    }
  };
}

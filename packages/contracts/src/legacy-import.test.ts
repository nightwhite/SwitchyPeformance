import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import { importProfileDocument } from './legacy-import.ts';

describe('importProfileDocument', () => {
  it('returns an existing SwitchyPeformance document unchanged', () => {
    const document = {
      schemaVersion: 1,
      activeProfileId: 'direct',
      profiles: [{ id: 'direct', kind: 'direct', name: 'Direct' }],
      proxies: []
    };

    const result = importProfileDocument(document);

    expect(result).toEqual({
      ok: true,
      source: 'switchypeformance',
      value: { ...document, credentials: {} },
      warnings: []
    });
  });

  it('migrates independent legacy data without importing credentials', () => {
    const legacyBackup = {
      schemaVersion: 2,
      startupProfileName: 'automatic',
      '+edge': {
        name: 'edge',
        profileType: 'FixedProfile',
        fallbackProxy: { scheme: 'socks5', host: '127.0.0.1', port: 1080 },
        bypassList: [{ conditionType: 'HostWildcardCondition', pattern: '*.internal.example' }],
        auth: { fallbackProxy: { username: 'ignored', password: 'ignored' } }
      },
      '+automatic': {
        name: 'automatic',
        profileType: 'SwitchProfile',
        defaultProfileName: 'direct',
        rules: [
          {
            condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.com' },
            profileName: 'edge'
          },
          {
            condition: { conditionType: 'HostWildcardCondition', pattern: 'login.example.com' },
            profileName: 'direct'
          }
        ]
      }
    };

    const result = importProfileDocument(legacyBackup);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.source).toBe('legacy');
    expect(result.warnings).toEqual([
      'Credentials for edge were skipped; set them locally after import.'
    ]);
    expect(result.value.activeProfileId).toBe('legacy-profile-automatic');
    expect(result.value.proxies).toEqual([
      {
        id: 'legacy-proxy-edge',
        name: 'edge',
        scheme: 'socks5',
        host: '127.0.0.1',
        port: 1080,
        bypassList: ['*.internal.example']
      }
    ]);
    expect(result.value.credentials).toEqual({});
    expect(result.value.profiles).toContainEqual({
      id: 'legacy-profile-edge',
      kind: 'fixed-proxy',
      name: 'edge',
      proxyId: 'legacy-proxy-edge'
    });
    expect(result.value.profiles).toContainEqual({
      id: 'legacy-profile-automatic',
      kind: 'auto-switch',
      name: 'automatic',
      fallback: { kind: 'direct' },
      loopbackPolicy: 'direct',
      proxyFailurePolicy: 'direct',
      rules: [
        {
          id: 'legacy-rule-automatic-0',
          enabled: true,
          condition: { type: 'host-suffix', value: 'example.com' },
          target: { kind: 'proxy', proxyId: 'legacy-proxy-edge' }
        },
        {
          id: 'legacy-rule-automatic-1',
          enabled: true,
          condition: { type: 'host-equals', value: 'login.example.com' },
          target: { kind: 'direct' }
        }
      ]
    });
  });

  it('skips unsupported legacy rules instead of silently routing them', () => {
    const result = importProfileDocument({
      '+automatic': {
        name: 'automatic',
        profileType: 'SwitchProfile',
        defaultProfileName: 'system',
        rules: [
          {
            condition: { conditionType: 'RegexCondition', pattern: '^https://example.com' },
            profileName: 'missing'
          },
          {
            condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.com' },
            profileName: 'system'
          }
        ]
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const automatic = result.value.profiles.find(
      (profile) => profile.id === 'legacy-profile-automatic'
    );
    expect(automatic).toMatchObject({
      kind: 'auto-switch',
      fallback: { kind: 'direct' },
      proxyFailurePolicy: 'direct',
      rules: []
    });
    expect(result.warnings).toEqual([
      'Automatic profile automatic uses system proxy as its fallback; imported as direct.',
      'Rule 1 in automatic uses an unsupported condition and was skipped.',
      'Rule 2 in automatic routes to the system proxy and was skipped.'
    ]);
  });

  it('rejects an unrelated file', () => {
    expect(importProfileDocument({ unrelated: true })).toEqual({
      ok: false,
      error: 'This file is not a supported SwitchyPeformance configuration backup.'
    });
  });

  const suppliedBackup = process.env.SWITCHYPEFORMANCE_IMPORT_FIXTURE;
  if (suppliedBackup) {
    it('migrates a supplied backup without exposing credential data', async () => {
      const input = JSON.parse(await readFile(suppliedBackup, 'utf8')) as unknown;
      const result = importProfileDocument(input);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.source).toBe('legacy');
      expect(result.value.credentials).toEqual({});
      expect(result.value.proxies.length).toBeGreaterThan(0);
      expect(
        result.value.profiles
          .filter((profile) => profile.kind === 'auto-switch')
          .reduce((count, profile) => count + profile.rules.length, 0)
      ).toBeGreaterThan(0);
    });
  }
});

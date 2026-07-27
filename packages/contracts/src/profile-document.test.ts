import { describe, expect, it } from 'vitest';

import { parseProfileDocument } from './profile-document.ts';

describe('profile document contract', () => {
  it('keeps proxy credentials outside a synchronizable profile document', () => {
    const result = parseProfileDocument({
      schemaVersion: 1,
      activeProfileId: 'auto-work',
      profiles: [
        {
          id: 'auto-work',
          kind: 'auto-switch',
          name: 'Work routing',
          fallback: { kind: 'direct' },
          rules: []
        }
      ],
      proxies: [
        {
          host: 'proxy.example.test',
          id: 'work-gateway',
          name: 'Work gateway',
          port: 8443,
          scheme: 'https'
        }
      ]
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.credentials).toEqual({});
      expect(result.value.profiles[0]?.id).toBe('auto-work');
      expect(result.value.profiles[0]).toMatchObject({ proxyFailurePolicy: 'direct' });
    }
  });

  it('rejects a proxy with an invalid port before it can reach Chrome', () => {
    const result = parseProfileDocument({
      schemaVersion: 1,
      activeProfileId: 'direct',
      profiles: [{ id: 'direct', kind: 'direct', name: 'Direct' }],
      proxies: [
        {
          host: 'proxy.example.test',
          id: 'bad-port',
          name: 'Bad port',
          port: 70000,
          scheme: 'http'
        }
      ]
    });

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: 'invalid-proxy-port',
          path: 'proxies[0].port'
        }
      ]
    });
  });

  it('rejects a profile that references a proxy which does not exist', () => {
    const result = parseProfileDocument({
      schemaVersion: 1,
      activeProfileId: 'edge',
      profiles: [{ id: 'edge', kind: 'fixed-proxy', name: 'Edge', proxyId: 'missing' }],
      proxies: []
    });

    expect(result).toEqual({
      ok: false,
      issues: [
        {
          code: 'unknown-proxy-reference',
          path: 'profiles[0].proxyId'
        }
      ]
    });
  });

  it('keeps a local credential binding without accepting a credential secret', () => {
    const result = parseProfileDocument({
      schemaVersion: 1,
      activeProfileId: 'edge',
      profiles: [{ id: 'edge', kind: 'fixed-proxy', name: 'Edge', proxyId: 'edge-proxy' }],
      proxies: [
        {
          credentialId: 'credential-edge',
          host: 'proxy.example.test',
          id: 'edge-proxy',
          name: 'Edge proxy',
          port: 8443,
          scheme: 'https'
        }
      ]
    });

    expect(result).toEqual({
      ok: true,
      value: {
        schemaVersion: 1,
        activeProfileId: 'edge',
        credentials: {},
        profiles: [{ id: 'edge', kind: 'fixed-proxy', name: 'Edge', proxyId: 'edge-proxy' }],
        proxies: [
          {
            credentialId: 'credential-edge',
            host: 'proxy.example.test',
            id: 'edge-proxy',
            name: 'Edge proxy',
            port: 8443,
            scheme: 'https'
          }
        ]
      }
    });
  });
});

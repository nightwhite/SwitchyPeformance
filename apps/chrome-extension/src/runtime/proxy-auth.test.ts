import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocument, ProfileDocumentV2 } from '@switchypeformance/contracts';

import { createProxyAuthenticationHandler } from './proxy-auth.ts';

const document: ProfileDocument = {
  schemaVersion: 1,
  activeProfileId: 'edge',
  credentials: {},
  profiles: [{ id: 'edge', kind: 'fixed-proxy', name: 'Edge', proxyId: 'edge-proxy' }],
  proxies: [
    {
      id: 'edge-proxy',
      name: 'Edge proxy',
      scheme: 'https',
      host: 'proxy.example.test',
      port: 8443,
      credentialId: 'credential-edge'
    }
  ]
};

describe('createProxyAuthenticationHandler', () => {
  it('only supplies credentials to the configured proxy challenge', async () => {
    const configuration = { load: vi.fn().mockResolvedValue(document) };
    const credentials = {
      get: vi.fn().mockResolvedValue({
        id: 'credential-edge',
        username: 'operator',
        password: 'secret'
      })
    };
    const handler = createProxyAuthenticationHandler({ configuration, credentials });

    await expect(
      handler.handle({
        challenger: { host: 'proxy.example.test', port: 8443 },
        isProxy: true,
        requestId: 'request-1'
      })
    ).resolves.toEqual({ authCredentials: { username: 'operator', password: 'secret' } });
    expect(credentials.get).toHaveBeenCalledWith('credential-edge');

    await expect(
      handler.handle({
        challenger: { host: 'origin.example.test', port: 443 },
        isProxy: false,
        requestId: 'request-2'
      })
    ).resolves.toBeUndefined();
    expect(configuration.load).toHaveBeenCalledTimes(1);
  });

  it('cancels a repeated challenge after credentials have already been attempted', async () => {
    const handler = createProxyAuthenticationHandler({
      configuration: { load: vi.fn().mockResolvedValue(document) },
      credentials: {
        get: vi.fn().mockResolvedValue({
          id: 'credential-edge',
          username: 'operator',
          password: 'secret'
        })
      }
    });
    const challenge = {
      challenger: { host: 'proxy.example.test', port: 8443 },
      isProxy: true,
      requestId: 'request-1'
    };

    await expect(handler.handle(challenge)).resolves.toEqual({
      authCredentials: { username: 'operator', password: 'secret' }
    });
    await expect(handler.handle(challenge)).resolves.toEqual({ cancel: true });
  });

  it('does not invent credentials when no binding exists', async () => {
    const handler = createProxyAuthenticationHandler({
      configuration: { load: vi.fn().mockResolvedValue(document) },
      credentials: { get: vi.fn().mockResolvedValue(undefined) }
    });

    await expect(
      handler.handle({
        challenger: { host: 'other-proxy.example.test', port: 8443 },
        isProxy: true,
        requestId: 'request-1'
      })
    ).resolves.toBeUndefined();
  });

  it('uses a V2 proxy server credential for the matching proxy challenge', async () => {
    const configuration = { load: vi.fn().mockResolvedValue(v2Document()) };
    const credentials = {
      get: vi.fn().mockResolvedValue({
        id: 'credential-v2',
        username: 'v2-user',
        password: 'v2-secret'
      })
    };
    const handler = createProxyAuthenticationHandler({ configuration, credentials });

    await expect(
      handler.handle({
        challenger: { host: 'proxy-v2.example.test', port: 8080 },
        isProxy: true,
        requestId: 'request-v2'
      })
    ).resolves.toEqual({ authCredentials: { username: 'v2-user', password: 'v2-secret' } });
  });
});

function v2Document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'direct',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' }
    ],
    proxyServers: [
      {
        id: 'v2-proxy',
        name: 'V2 proxy',
        scheme: 'http',
        host: 'proxy-v2.example.test',
        port: 8080,
        credentialId: 'credential-v2'
      }
    ],
    ruleSources: [],
    settings: {
      startupProfileId: 'direct',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}

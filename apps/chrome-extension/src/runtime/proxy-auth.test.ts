import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocument } from '@switchypeformance/contracts';

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
});

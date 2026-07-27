import { describe, expect, it } from 'vitest';

import type { ProfileDocument } from '@switchypeformance/contracts';

import { bindProxyCredential, clearProxyCredential } from './proxy-credential-binding.ts';

const document: ProfileDocument = {
  schemaVersion: 1,
  activeProfileId: 'edge',
  credentials: {},
  profiles: [{ id: 'edge', kind: 'fixed-proxy', name: 'Edge', proxyId: 'edge-proxy' }],
  proxies: [
    {
      id: 'edge-proxy',
      name: 'Edge proxy',
      scheme: 'http',
      host: 'proxy.example.test',
      port: 8080
    }
  ]
};

describe('proxy credential binding', () => {
  it('stores only a credential id in the route configuration', () => {
    const bound = bindProxyCredential(document, 'edge-proxy', 'credential-edge');

    expect(bound.proxies[0]).toEqual({
      id: 'edge-proxy',
      name: 'Edge proxy',
      scheme: 'http',
      host: 'proxy.example.test',
      port: 8080,
      credentialId: 'credential-edge'
    });
    expect(clearProxyCredential(bound, 'edge-proxy').proxies[0]).not.toHaveProperty('credentialId');
  });

  it('does not silently bind credentials to an unknown proxy', () => {
    expect(() => bindProxyCredential(document, 'missing', 'credential-edge')).toThrow(
      'Proxy does not exist'
    );
  });
});

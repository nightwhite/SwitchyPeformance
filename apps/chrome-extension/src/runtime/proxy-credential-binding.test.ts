import { describe, expect, it } from 'vitest';

import type { ProfileDocument, ProfileDocumentV2 } from '@switchypeformance/contracts';

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
    expect(() => bindProxyCredential(document, 'missing', 'credential-edge')).toThrow('代理不存在');
  });

  it('binds a credential id to a V2 proxy server without changing its routes', () => {
    const bound = bindProxyCredential(v2Document(), 'v2-proxy', 'credential-v2');

    expect(bound).toMatchObject({
      schemaVersion: 2,
      proxyServers: [expect.objectContaining({ id: 'v2-proxy', credentialId: 'credential-v2' })]
    });
    expect(clearProxyCredential(bound, 'v2-proxy')).toMatchObject({
      schemaVersion: 2,
      proxyServers: [expect.not.objectContaining({ credentialId: expect.anything() })]
    });
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
        port: 8080
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

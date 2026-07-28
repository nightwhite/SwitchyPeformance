import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { createProxyCredentialService } from './proxy-credential-service.ts';

describe('proxy credential service', () => {
  it('binds a locally stored credential only after the target proxy is known', async () => {
    const document = v2Document();
    const replace = vi.fn().mockResolvedValue(document);
    const credentials = {
      get: vi.fn(),
      remove: vi.fn(),
      save: vi.fn()
    };
    const service = createProxyCredentialService({
      configuration: { load: vi.fn().mockResolvedValue(document) },
      createCredentialId: () => 'credential-new',
      credentials,
      replace
    });

    await service.save('proxy-work', 'operator', 'secret');

    expect(credentials.save).toHaveBeenCalledWith({
      id: 'credential-new',
      password: 'secret',
      username: 'operator'
    });
    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({
        proxyServers: [
          expect.objectContaining({ credentialId: 'credential-new', id: 'proxy-work' })
        ]
      })
    );
  });

  it('keeps the former secret untouched when binding the configuration fails', async () => {
    const document = v2Document('credential-existing');
    const credentials = {
      get: vi.fn().mockResolvedValue({
        id: 'credential-existing',
        password: 'old-secret',
        username: 'old-user'
      }),
      remove: vi.fn(),
      save: vi.fn()
    };
    const service = createProxyCredentialService({
      configuration: { load: vi.fn().mockResolvedValue(document) },
      createCredentialId: () => 'credential-new',
      credentials,
      replace: vi.fn().mockRejectedValue(new Error('Chrome 拒绝应用配置'))
    });

    await expect(service.save('proxy-work', 'new-user', 'new-secret')).rejects.toThrow(
      'Chrome 拒绝应用配置'
    );

    expect(credentials.save).toHaveBeenNthCalledWith(1, {
      id: 'credential-new',
      password: 'new-secret',
      username: 'new-user'
    });
    expect(credentials.remove).toHaveBeenCalledWith('credential-new');
    expect(credentials.save).toHaveBeenCalledTimes(1);
  });

  it('removes a newly written secret when its binding cannot be saved', async () => {
    const document = v2Document();
    const credentials = { get: vi.fn(), remove: vi.fn(), save: vi.fn() };
    const service = createProxyCredentialService({
      configuration: { load: vi.fn().mockResolvedValue(document) },
      createCredentialId: () => 'credential-new',
      credentials,
      replace: vi.fn().mockRejectedValue(new Error('Chrome 拒绝应用配置'))
    });

    await expect(service.save('proxy-work', 'operator', 'secret')).rejects.toThrow(
      'Chrome 拒绝应用配置'
    );
    expect(credentials.remove).toHaveBeenCalledWith('credential-new');
  });

  it('retires an unshared former secret only after the new binding succeeds', async () => {
    const document = v2Document('credential-existing');
    const credentials = { get: vi.fn(), remove: vi.fn(), save: vi.fn() };
    const replace = vi.fn().mockResolvedValue(document);
    const service = createProxyCredentialService({
      configuration: { load: vi.fn().mockResolvedValue(document) },
      createCredentialId: () => 'credential-new',
      credentials,
      replace
    });

    await service.save('proxy-work', 'new-user', 'new-secret');

    expect(replace).toHaveBeenCalledTimes(1);
    expect(credentials.remove).toHaveBeenCalledWith('credential-existing');
  });

  it('does not delete a saved secret if removing its configuration binding fails', async () => {
    const document = v2Document('credential-existing');
    const credentials = { get: vi.fn(), remove: vi.fn(), save: vi.fn() };
    const service = createProxyCredentialService({
      configuration: { load: vi.fn().mockResolvedValue(document) },
      createCredentialId: () => 'credential-new',
      credentials,
      replace: vi.fn().mockRejectedValue(new Error('Chrome 拒绝应用配置'))
    });

    await expect(service.clear('proxy-work')).rejects.toThrow('Chrome 拒绝应用配置');
    expect(credentials.remove).not.toHaveBeenCalled();
  });
});

function v2Document(credentialId?: string): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'fixed-work',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'fixed-work',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'proxy-work' },
        bypassList: []
      }
    ],
    proxyServers: [
      {
        id: 'proxy-work',
        name: '工作节点',
        scheme: 'http',
        host: 'proxy.example.test',
        port: 8080,
        ...(credentialId === undefined ? {} : { credentialId })
      }
    ],
    ruleSources: [],
    settings: {
      startupProfileId: 'fixed-work',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}

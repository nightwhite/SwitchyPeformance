import type { ConfigurationDocument } from '@switchypeformance/contracts';

import { bindProxyCredential, clearProxyCredential } from './proxy-credential-binding.ts';
import type { CredentialRepository, ProxyCredential } from './credential-repository.ts';

export interface ProxyCredentialServiceDependencies {
  configuration: { load(): Promise<ConfigurationDocument> };
  createCredentialId(): string;
  credentials: Pick<CredentialRepository, 'remove' | 'save'>;
  replace(document: ConfigurationDocument): Promise<unknown>;
}

export interface ProxyCredentialService {
  clear(proxyId: string): Promise<void>;
  save(proxyId: string, username: string, password: string): Promise<void>;
}

/**
 * Coordinates local credentials with configuration changes. A password change
 * is staged under a new credential ID, so a rejected Chrome configuration
 * application never overwrites the credential currently in use.
 */
export function createProxyCredentialService(
  dependencies: ProxyCredentialServiceDependencies
): ProxyCredentialService {
  return {
    async save(proxyId, username, password) {
      if (!username.trim()) {
        throw new Error('请填写代理用户名');
      }
      const document = await dependencies.configuration.load();
      const proxy = proxyById(document, proxyId);
      if (!proxy) {
        throw new Error('代理不存在');
      }

      const credential: ProxyCredential = {
        id: dependencies.createCredentialId(),
        password,
        username: username.trim()
      };
      await dependencies.credentials.save(credential);
      try {
        await dependencies.replace(bind(document, proxy.id, credential.id));
      } catch (cause) {
        await discardCredential(dependencies.credentials, credential.id);
        throw cause;
      }

      if (
        proxy.credentialId &&
        !credentialIsUsedElsewhere(document, proxy.id, proxy.credentialId)
      ) {
        await discardCredential(dependencies.credentials, proxy.credentialId);
      }
    },
    async clear(proxyId) {
      const document = await dependencies.configuration.load();
      const proxy = proxyById(document, proxyId);
      if (!proxy) {
        throw new Error('代理不存在');
      }

      await dependencies.replace(clear(document, proxy.id));
      if (
        proxy.credentialId &&
        !credentialIsUsedElsewhere(document, proxy.id, proxy.credentialId)
      ) {
        await discardCredential(dependencies.credentials, proxy.credentialId);
      }
    }
  };
}

function bind(
  document: ConfigurationDocument,
  proxyId: string,
  credentialId: string
): ConfigurationDocument {
  return document.schemaVersion === 1
    ? bindProxyCredential(document, proxyId, credentialId)
    : bindProxyCredential(document, proxyId, credentialId);
}

function clear(document: ConfigurationDocument, proxyId: string): ConfigurationDocument {
  return document.schemaVersion === 1
    ? clearProxyCredential(document, proxyId)
    : clearProxyCredential(document, proxyId);
}

function proxyById(document: ConfigurationDocument, proxyId: string) {
  const proxies = document.schemaVersion === 1 ? document.proxies : document.proxyServers;
  return proxies.find((proxy) => proxy.id === proxyId);
}

function credentialIsUsedElsewhere(
  document: ConfigurationDocument,
  proxyId: string,
  credentialId: string
): boolean {
  const proxies = document.schemaVersion === 1 ? document.proxies : document.proxyServers;
  return proxies.some((proxy) => proxy.id !== proxyId && proxy.credentialId === credentialId);
}

async function discardCredential(
  credentials: Pick<CredentialRepository, 'remove'>,
  credentialId: string
): Promise<void> {
  try {
    await credentials.remove(credentialId);
  } catch {
    // An orphaned local secret cannot affect routing and must not hide the
    // original configuration failure from the caller.
  }
}

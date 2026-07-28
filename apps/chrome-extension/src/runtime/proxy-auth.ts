import type { ConfigurationDocument } from '@switchypeformance/contracts';

import type { CredentialRepository } from './credential-repository.ts';
import type { ConfigurationRepository } from './configuration-repository.ts';

export interface ProxyAuthenticationChallenge {
  requestId: string;
  isProxy: boolean;
  challenger: { host: string; port: number };
}

export type ProxyAuthenticationResponse =
  { authCredentials: { username: string; password: string } } | { cancel: true } | undefined;

export interface ProxyAuthenticationDependencies {
  configuration: Pick<ConfigurationRepository, 'load'>;
  credentials: Pick<CredentialRepository, 'get'>;
}

export interface ProxyAuthenticationHandler {
  handle(challenge: ProxyAuthenticationChallenge): Promise<ProxyAuthenticationResponse>;
}

/**
 * Supplies a local credential only for a configured proxy endpoint. A repeated
 * authentication challenge is cancelled to stop bad credentials from causing a
 * retry loop that stalls navigation.
 */
export function createProxyAuthenticationHandler(
  dependencies: ProxyAuthenticationDependencies
): ProxyAuthenticationHandler {
  const attemptedRequestIds = new Set<string>();

  return {
    async handle(challenge) {
      if (!challenge.isProxy) {
        return undefined;
      }
      if (attemptedRequestIds.has(challenge.requestId)) {
        return { cancel: true };
      }

      const proxy = findChallengeProxy(await dependencies.configuration.load(), challenge);
      if (!proxy?.credentialId) {
        return undefined;
      }
      const credential = await dependencies.credentials.get(proxy.credentialId);
      if (!credential) {
        return undefined;
      }

      rememberAttempt(attemptedRequestIds, challenge.requestId);
      return {
        authCredentials: {
          username: credential.username,
          password: credential.password
        }
      };
    }
  };
}

function findChallengeProxy(
  document: ConfigurationDocument,
  challenge: ProxyAuthenticationChallenge
) {
  const challengeHost = normalizeHost(challenge.challenger.host);
  const proxies = document.schemaVersion === 1 ? document.proxies : document.proxyServers;
  return proxies.find(
    (proxy) =>
      normalizeHost(proxy.host) === challengeHost && proxy.port === challenge.challenger.port
  );
}

function rememberAttempt(attemptedRequestIds: Set<string>, requestId: string): void {
  if (attemptedRequestIds.size >= 512) {
    const oldest = attemptedRequestIds.values().next().value;
    if (oldest) {
      attemptedRequestIds.delete(oldest);
    }
  }
  attemptedRequestIds.add(requestId);
}

function normalizeHost(host: string): string {
  return host
    .trim()
    .replace(/^\[|\]$/g, '')
    .toLocaleLowerCase();
}

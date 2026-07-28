import type {
  ConfigurationDocument,
  ProfileDocument,
  ProfileDocumentV2,
  ProxyEndpoint,
  ProxyServer
} from '@switchypeformance/contracts';

export function bindProxyCredential(
  document: ProfileDocument,
  proxyId: string,
  credentialId: string
): ProfileDocument;
export function bindProxyCredential(
  document: ProfileDocumentV2,
  proxyId: string,
  credentialId: string
): ProfileDocumentV2;
export function bindProxyCredential(
  document: ConfigurationDocument,
  proxyId: string,
  credentialId: string
): ConfigurationDocument {
  return updateDocumentProxy(document, proxyId, (proxy) => ({ ...proxy, credentialId }));
}

export function clearProxyCredential(document: ProfileDocument, proxyId: string): ProfileDocument;
export function clearProxyCredential(
  document: ProfileDocumentV2,
  proxyId: string
): ProfileDocumentV2;
export function clearProxyCredential(
  document: ConfigurationDocument,
  proxyId: string
): ConfigurationDocument {
  return updateDocumentProxy(document, proxyId, (proxy) => {
    const { credentialId: _credentialId, ...withoutCredential } = proxy;
    return withoutCredential;
  });
}

function updateDocumentProxy(
  document: ConfigurationDocument,
  proxyId: string,
  update: (proxy: ProxyEndpoint | ProxyServer) => ProxyEndpoint | ProxyServer
): ConfigurationDocument {
  return document.schemaVersion === 1
    ? updateV1Proxy(document, proxyId, update)
    : updateV2Proxy(document, proxyId, update);
}

function updateV1Proxy(
  document: ProfileDocument,
  proxyId: string,
  update: (proxy: ProxyEndpoint) => ProxyEndpoint | ProxyServer
): ProfileDocument {
  let found = false;
  const proxies = document.proxies.map((proxy) => {
    if (proxy.id !== proxyId) {
      return proxy;
    }
    found = true;
    return update(proxy) as ProxyEndpoint;
  });
  if (!found) {
    throw new Error('代理不存在');
  }
  return { ...document, proxies };
}

function updateV2Proxy(
  document: ProfileDocumentV2,
  proxyId: string,
  update: (proxy: ProxyServer) => ProxyEndpoint | ProxyServer
): ProfileDocumentV2 {
  let found = false;
  const proxyServers = document.proxyServers.map((proxy) => {
    if (proxy.id !== proxyId) {
      return proxy;
    }
    found = true;
    return update(proxy) as ProxyServer;
  });
  if (!found) {
    throw new Error('代理不存在');
  }
  return { ...document, proxyServers };
}

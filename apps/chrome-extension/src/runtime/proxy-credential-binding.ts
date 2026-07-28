import type { ProfileDocument } from '@switchypeformance/contracts';

export function bindProxyCredential(
  document: ProfileDocument,
  proxyId: string,
  credentialId: string
): ProfileDocument {
  return updateProxy(document, proxyId, (proxy) => ({ ...proxy, credentialId }));
}

export function clearProxyCredential(document: ProfileDocument, proxyId: string): ProfileDocument {
  return updateProxy(document, proxyId, (proxy) => {
    const { credentialId: _credentialId, ...withoutCredential } = proxy;
    return withoutCredential;
  });
}

function updateProxy(
  document: ProfileDocument,
  proxyId: string,
  update: (proxy: ProfileDocument['proxies'][number]) => ProfileDocument['proxies'][number]
): ProfileDocument {
  let found = false;
  const proxies = document.proxies.map((proxy) => {
    if (proxy.id !== proxyId) {
      return proxy;
    }
    found = true;
    return update(proxy);
  });
  if (!found) {
    throw new Error('代理不存在');
  }
  return { ...document, proxies };
}

import type { ProfileDocumentV2, ProxyRoutes, ProxyServer } from '@switchypeformance/contracts';

import {
  addProxyServer,
  normalizeBypassList,
  updateFixedProxyProfile
} from '../../configuration/proxy-server-actions.ts';

export function setFixedRoute(
  document: ProfileDocumentV2,
  profileId: string,
  field: keyof ProxyRoutes,
  proxyId: string
): ProfileDocumentV2 {
  const profile = fixedProfile(document, profileId);
  const normalized = proxyId.trim();
  const routes = { ...profile.routes };
  if (field === 'fallbackProxyId') {
    routes.fallbackProxyId = normalized;
  } else if (normalized) {
    routes[field] = normalized;
  } else {
    delete routes[field];
  }
  return updateFixedProxyProfile(document, profileId, {
    bypassList: profile.bypassList,
    routes
  });
}

export function setFixedBypassList(
  document: ProfileDocumentV2,
  profileId: string,
  entries: readonly string[]
): ProfileDocumentV2 {
  const profile = fixedProfile(document, profileId);
  return updateFixedProxyProfile(document, profileId, {
    bypassList: normalizeBypassList(entries),
    routes: profile.routes
  });
}

export function addProxyServerToDraft(
  document: ProfileDocumentV2,
  server: ProxyServer
): ProfileDocumentV2 {
  return addProxyServer(document, server);
}

function fixedProfile(document: ProfileDocumentV2, profileId: string) {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  if (!profile || profile.kind !== 'fixed-proxy') {
    throw new Error('固定代理配置不存在');
  }
  return profile;
}

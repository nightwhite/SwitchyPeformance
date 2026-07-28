import {
  validateProfileDocumentV2,
  type FixedProxyProfileV2,
  type ProfileDocumentV2,
  type ProxyRoutes,
  type ProxySchemeV2,
  type ProxyServer
} from '@switchypeformance/contracts';

const PROXY_SCHEMES: readonly ProxySchemeV2[] = ['http', 'https', 'socks4', 'socks5'];

export interface CreateProxyServerOptions {
  profileId: string;
  proxy: ProxyServer;
}

export interface FixedProxyProfileUpdate {
  bypassList: readonly string[];
  routes: ProxyRoutes;
}

export interface ProxyServerReference {
  field: `routes.${keyof ProxyRoutes}`;
  profileId: string;
}

export type ProxyServerDeletionPlan =
  | { allowed: true; references: readonly ProxyServerReference[] }
  | { allowed: false; reason: string; references: readonly ProxyServerReference[] };

export function createProxyServerWithFixedProfile(
  document: ProfileDocumentV2,
  options: CreateProxyServerOptions
): ProfileDocumentV2 {
  const proxy = normalizeProxyServer(options.proxy);
  const profileId = options.profileId.trim();
  if (!profileId || document.profiles.some((profile) => profile.id === profileId)) {
    throw new Error('固定代理配置 ID 已存在');
  }
  if (document.proxyServers.some((server) => server.id === proxy.id)) {
    throw new Error('代理服务器 ID 已存在');
  }

  const next: ProfileDocumentV2 = {
    ...document,
    profiles: [
      ...document.profiles,
      {
        id: profileId,
        kind: 'fixed-proxy',
        name: proxy.name,
        routes: { fallbackProxyId: proxy.id },
        bypassList: []
      }
    ],
    proxyServers: [...document.proxyServers, proxy]
  };
  assertValid(next);
  return next;
}

export function updateProxyServer(
  document: ProfileDocumentV2,
  server: ProxyServer
): ProfileDocumentV2 {
  const normalized = normalizeProxyServer(server);
  let found = false;
  const next: ProfileDocumentV2 = {
    ...document,
    proxyServers: document.proxyServers.map((current) => {
      if (current.id !== normalized.id) {
        return current;
      }
      found = true;
      return normalized;
    })
  };
  if (!found) {
    throw new Error('代理服务器不存在');
  }
  assertValid(next);
  return next;
}

export function updateFixedProxyProfile(
  document: ProfileDocumentV2,
  profileId: string,
  update: FixedProxyProfileUpdate
): ProfileDocumentV2 {
  const profile = requiredFixedProxyProfile(document, profileId);
  const routes = normalizeRoutes(update.routes);
  const next: ProfileDocumentV2 = {
    ...document,
    profiles: document.profiles.map((candidate) =>
      candidate.id === profile.id
        ? { ...profile, routes, bypassList: normalizeBypassList(update.bypassList) }
        : candidate
    )
  };
  assertValid(next);
  return next;
}

export function planProxyServerDeletion(
  document: ProfileDocumentV2,
  proxyId: string
): ProxyServerDeletionPlan {
  requiredProxyServer(document, proxyId);
  const references = proxyServerReferences(document, proxyId);
  return references.length === 0
    ? { allowed: true, references }
    : { allowed: false, reason: '代理服务器仍被固定代理配置引用', references };
}

export function replaceAndDeleteProxyServer(
  document: ProfileDocumentV2,
  proxyId: string,
  replacementProxyId?: string
): ProfileDocumentV2 {
  const plan = planProxyServerDeletion(document, proxyId);
  if (!plan.allowed && !replacementProxyId) {
    throw new Error('请先选择替代代理服务器');
  }
  if (replacementProxyId === proxyId) {
    throw new Error('替代代理服务器不能是待删除的服务器');
  }
  if (replacementProxyId) {
    requiredProxyServer(document, replacementProxyId);
  }

  const next: ProfileDocumentV2 = {
    ...document,
    profiles: document.profiles.map((profile) =>
      profile.kind === 'fixed-proxy' && replacementProxyId
        ? {
            ...profile,
            routes: replaceProxyRoute(profile.routes, proxyId, replacementProxyId)
          }
        : profile
    ),
    proxyServers: document.proxyServers.filter((proxy) => proxy.id !== proxyId)
  };
  assertValid(next);
  return next;
}

export function normalizeBypassList(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeProxyServer(server: ProxyServer): ProxyServer {
  const id = server.id.trim();
  const name = server.name.trim();
  const host = server.host.trim();
  if (!id) {
    throw new Error('代理服务器 ID 不能为空');
  }
  if (!name) {
    throw new Error('请填写代理服务器名称');
  }
  if (!host || /\s/.test(host)) {
    throw new Error('请填写有效的代理服务器地址');
  }
  if (!Number.isInteger(server.port) || server.port < 1 || server.port > 65_535) {
    throw new Error('端口必须在 1 到 65535 之间');
  }
  if (!PROXY_SCHEMES.includes(server.scheme)) {
    throw new Error('不支持的代理协议');
  }
  return {
    id,
    name,
    host,
    port: server.port,
    scheme: server.scheme,
    ...(server.credentialId === undefined ? {} : { credentialId: server.credentialId })
  };
}

function normalizeRoutes(routes: ProxyRoutes): ProxyRoutes {
  const fallbackProxyId = routes.fallbackProxyId.trim();
  const httpProxyId = normalizeOptionalRoute(routes.httpProxyId);
  const httpsProxyId = normalizeOptionalRoute(routes.httpsProxyId);
  const ftpProxyId = normalizeOptionalRoute(routes.ftpProxyId);
  if (!fallbackProxyId) {
    throw new Error('请选择默认代理服务器');
  }
  return {
    fallbackProxyId,
    ...(httpProxyId === undefined ? {} : { httpProxyId }),
    ...(httpsProxyId === undefined ? {} : { httpsProxyId }),
    ...(ftpProxyId === undefined ? {} : { ftpProxyId })
  };
}

function normalizeOptionalRoute(proxyId: string | undefined): string | undefined {
  const normalized = proxyId?.trim();
  return normalized || undefined;
}

function proxyServerReferences(
  document: ProfileDocumentV2,
  proxyId: string
): ProxyServerReference[] {
  const references: ProxyServerReference[] = [];
  for (const profile of document.profiles) {
    if (profile.kind !== 'fixed-proxy') {
      continue;
    }
    for (const field of routeFields()) {
      if (profile.routes[field] === proxyId) {
        references.push({ profileId: profile.id, field: `routes.${field}` });
      }
    }
  }
  return references;
}

function replaceProxyRoute(
  routes: ProxyRoutes,
  proxyId: string,
  replacementProxyId: string
): ProxyRoutes {
  const httpProxyId = replaceOptionalRoute(routes.httpProxyId, proxyId, replacementProxyId);
  const httpsProxyId = replaceOptionalRoute(routes.httpsProxyId, proxyId, replacementProxyId);
  const ftpProxyId = replaceOptionalRoute(routes.ftpProxyId, proxyId, replacementProxyId);
  return {
    fallbackProxyId:
      routes.fallbackProxyId === proxyId ? replacementProxyId : routes.fallbackProxyId,
    ...(httpProxyId === undefined ? {} : { httpProxyId }),
    ...(httpsProxyId === undefined ? {} : { httpsProxyId }),
    ...(ftpProxyId === undefined ? {} : { ftpProxyId })
  };
}

function replaceOptionalRoute(
  route: string | undefined,
  proxyId: string,
  replacementProxyId: string
): string | undefined {
  return route === proxyId ? replacementProxyId : route;
}

function routeFields(): readonly (keyof ProxyRoutes)[] {
  return ['fallbackProxyId', 'httpProxyId', 'httpsProxyId', 'ftpProxyId'];
}

function requiredFixedProxyProfile(
  document: ProfileDocumentV2,
  profileId: string
): FixedProxyProfileV2 {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  if (!profile || profile.kind !== 'fixed-proxy') {
    throw new Error('固定代理配置不存在');
  }
  return profile;
}

function requiredProxyServer(document: ProfileDocumentV2, proxyId: string): ProxyServer {
  const proxy = document.proxyServers.find((candidate) => candidate.id === proxyId);
  if (!proxy) {
    throw new Error('代理服务器不存在');
  }
  return proxy;
}

function assertValid(document: ProfileDocumentV2): void {
  const issues = validateProfileDocumentV2(document);
  if (issues.length > 0) {
    throw new Error(`代理配置不合法：${issues[0]?.path ?? '未知位置'}`);
  }
}

import type {
  AutoSwitchProfile,
  ProfileDocument,
  ProxyEndpoint,
  RouteTarget,
  RuleCondition
} from '../profile-document.ts';
import {
  defaultRuntimeSettings,
  parseProfileDocumentV2,
  type ProfileDocumentV2
} from '../config/document.ts';
import type { ProfileTarget } from '../config/targets.ts';

export interface V1MigrationResult {
  value: ProfileDocumentV2;
  warnings: readonly string[];
}

export function migrateV1Document(input: ProfileDocument): V1MigrationResult {
  const warnings: string[] = [];
  const profileIdByProxyId = new Map<string, string>();
  for (const profile of input.profiles) {
    if (profile.kind === 'fixed-proxy' && !profileIdByProxyId.has(profile.proxyId)) {
      profileIdByProxyId.set(profile.proxyId, profile.id);
    }
  }

  const proxyServers = input.proxies.map(toProxyServer);
  const profiles = input.profiles.map((profile) => {
    switch (profile.kind) {
      case 'direct':
      case 'system':
        return { id: profile.id, kind: profile.kind, name: profile.name };
      case 'fixed-proxy':
        return {
          id: profile.id,
          kind: 'fixed-proxy' as const,
          name: profile.name,
          routes: { fallbackProxyId: profile.proxyId },
          bypassList: proxyById(input.proxies, profile.proxyId)?.bypassList ?? []
        };
      case 'auto-switch':
        return migrateAutoSwitchProfile(profile, profileIdByProxyId, warnings);
    }
  });

  const candidate = {
    schemaVersion: 2 as const,
    activeProfileId: input.activeProfileId,
    profiles,
    proxyServers,
    ruleSources: [],
    settings: { ...defaultRuntimeSettings(), startupProfileId: input.activeProfileId }
  };
  const parsed = parseProfileDocumentV2(candidate);
  if (!parsed.ok) {
    throw new Error(`无法迁移 V1 配置：${parsed.issues.map((issue) => issue.code).join(', ')}`);
  }

  return { value: parsed.value, warnings };
}

function toProxyServer(proxy: ProxyEndpoint) {
  return {
    id: proxy.id,
    name: proxy.name,
    scheme: proxy.scheme,
    host: proxy.host,
    port: proxy.port,
    ...(proxy.credentialId === undefined ? {} : { credentialId: proxy.credentialId })
  };
}

function migrateAutoSwitchProfile(
  profile: AutoSwitchProfile,
  profileIdByProxyId: ReadonlyMap<string, string>,
  warnings: string[]
) {
  return {
    id: profile.id,
    kind: 'auto-switch' as const,
    name: profile.name,
    fallback: migrateTarget(profile.fallback, profileIdByProxyId, warnings),
    loopbackPolicy: profile.loopbackPolicy,
    proxyFailurePolicy: profile.proxyFailurePolicy,
    rules: profile.rules.map((rule) => ({
      id: rule.id,
      enabled: rule.enabled,
      condition: migrateCondition(rule.condition),
      target: migrateTarget(rule.target, profileIdByProxyId, warnings)
    })),
    ruleSourceIds: []
  };
}

function migrateTarget(
  target: RouteTarget,
  profileIdByProxyId: ReadonlyMap<string, string>,
  warnings: string[]
): ProfileTarget {
  if (target.kind === 'direct') {
    return { profileId: 'direct' };
  }
  if (target.kind === 'system') {
    return { profileId: 'system' };
  }

  const profileId = profileIdByProxyId.get(target.proxyId);
  if (profileId) {
    return { profileId };
  }

  warnings.push(`未找到代理 ${target.proxyId} 对应的固定配置，已按直连迁移。`);
  return { profileId: 'direct' };
}

function migrateCondition(condition: RuleCondition) {
  switch (condition.type) {
    case 'host-equals':
      return { type: 'host-wildcard' as const, pattern: condition.value };
    case 'host-suffix':
      return { type: 'host-wildcard' as const, pattern: `*.${condition.value}` };
    case 'url-glob':
      return { type: 'url-wildcard' as const, pattern: condition.value };
  }
}

function proxyById(proxies: readonly ProxyEndpoint[], proxyId: string): ProxyEndpoint | undefined {
  return proxies.find((proxy) => proxy.id === proxyId);
}

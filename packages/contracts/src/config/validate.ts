import type { ProfileDocumentV2, ProfileDocumentV2Issue } from './document.ts';
import type { ProfileV2, ProxyRoutes } from './profiles.ts';
import type { ProfileTarget } from './targets.ts';

export function validateProfileDocumentV2(
  document: ProfileDocumentV2
): readonly ProfileDocumentV2Issue[] {
  const issues: ProfileDocumentV2Issue[] = [];
  const profileIds = new Set<string>();
  const proxyIds = new Set<string>();
  const sourceIds = new Set<string>();

  collectUniqueIds(document.profiles, 'profile', profileIds, issues);
  collectUniqueIds(document.proxyServers, 'proxy', proxyIds, issues);
  collectUniqueIds(document.ruleSources, 'source', sourceIds, issues);
  validateBuiltins(document.profiles, issues);
  validateProfileReference(
    document.activeProfileId,
    'activeProfileId',
    profileIds,
    'unknown-active-profile',
    issues
  );
  validateProfileReference(
    document.settings.startupProfileId,
    'settings.startupProfileId',
    profileIds,
    'unknown-startup-profile',
    issues
  );

  for (const [index, profile] of document.profiles.entries()) {
    validateProfileReferences(profile, index, profileIds, proxyIds, sourceIds, issues);
  }

  if (issues.length === 0 && hasProfileCycle(document.profiles)) {
    issues.push({ code: 'profile-cycle', path: 'profiles' });
  }

  return issues;
}

function collectUniqueIds(
  values: readonly { id: string }[],
  category: 'profile' | 'proxy' | 'source',
  ids: Set<string>,
  issues: ProfileDocumentV2Issue[]
): void {
  for (const [index, value] of values.entries()) {
    if (ids.has(value.id)) {
      issues.push({ code: `duplicate-${category}-id`, path: `${category}s[${index}].id` });
      continue;
    }
    ids.add(value.id);
  }
}

function validateBuiltins(profiles: readonly ProfileV2[], issues: ProfileDocumentV2Issue[]): void {
  const direct = profiles.find((profile) => profile.id === 'direct');
  const system = profiles.find((profile) => profile.id === 'system');
  if (!direct || direct.kind !== 'direct') {
    issues.push({ code: 'missing-builtin-profile', path: 'profiles' });
  }
  if (!system || system.kind !== 'system') {
    issues.push({ code: 'missing-builtin-profile', path: 'profiles' });
  }
}

function validateProfileReferences(
  profile: ProfileV2,
  index: number,
  profileIds: ReadonlySet<string>,
  proxyIds: ReadonlySet<string>,
  sourceIds: ReadonlySet<string>,
  issues: ProfileDocumentV2Issue[]
): void {
  const basePath = `profiles[${index}]`;
  switch (profile.kind) {
    case 'fixed-proxy':
      validateProxyRoutes(profile.routes, `${basePath}.routes`, proxyIds, issues);
      return;
    case 'auto-switch':
      validateTarget(profile.fallback, `${basePath}.fallback.profileId`, profileIds, issues);
      for (const [ruleIndex, rule] of profile.rules.entries()) {
        validateTarget(
          rule.target,
          `${basePath}.rules[${ruleIndex}].target.profileId`,
          profileIds,
          issues
        );
      }
      for (const [sourceIndex, sourceId] of profile.ruleSourceIds.entries()) {
        if (!sourceIds.has(sourceId)) {
          issues.push({
            code: 'unknown-source-reference',
            path: `${basePath}.ruleSourceIds[${sourceIndex}]`
          });
        }
      }
      return;
    case 'rule-list':
      if (!sourceIds.has(profile.sourceId)) {
        issues.push({ code: 'unknown-source-reference', path: `${basePath}.sourceId` });
      }
      validateTarget(profile.matchTarget, `${basePath}.matchTarget.profileId`, profileIds, issues);
      validateTarget(profile.fallback, `${basePath}.fallback.profileId`, profileIds, issues);
      return;
    case 'virtual':
      validateTarget(profile.target, `${basePath}.target.profileId`, profileIds, issues);
      return;
    case 'direct':
    case 'system':
    case 'pac':
    case 'auto-detect':
      return;
  }
}

function validateProxyRoutes(
  routes: ProxyRoutes,
  basePath: string,
  proxyIds: ReadonlySet<string>,
  issues: ProfileDocumentV2Issue[]
): void {
  const entries = [
    ['fallbackProxyId', routes.fallbackProxyId],
    ['httpProxyId', routes.httpProxyId],
    ['httpsProxyId', routes.httpsProxyId],
    ['ftpProxyId', routes.ftpProxyId]
  ] as const;

  for (const [field, proxyId] of entries) {
    if (proxyId !== undefined && !proxyIds.has(proxyId)) {
      issues.push({ code: 'unknown-proxy-reference', path: `${basePath}.${field}` });
    }
  }
}

function validateProfileReference(
  profileId: string,
  path: string,
  profileIds: ReadonlySet<string>,
  code: 'unknown-active-profile' | 'unknown-startup-profile',
  issues: ProfileDocumentV2Issue[]
): void {
  if (!profileIds.has(profileId)) {
    issues.push({ code, path });
  }
}

function validateTarget(
  target: ProfileTarget,
  path: string,
  profileIds: ReadonlySet<string>,
  issues: ProfileDocumentV2Issue[]
): void {
  if (!profileIds.has(target.profileId)) {
    issues.push({ code: 'unknown-profile-reference', path });
  }
}

function hasProfileCycle(profiles: readonly ProfileV2[]): boolean {
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(profileId: string): boolean {
    if (visiting.has(profileId)) {
      return true;
    }
    if (visited.has(profileId)) {
      return false;
    }

    const profile = profilesById.get(profileId);
    if (!profile) {
      return false;
    }

    visiting.add(profileId);
    for (const targetId of profileTargetIds(profile)) {
      if (visit(targetId)) {
        return true;
      }
    }
    visiting.delete(profileId);
    visited.add(profileId);
    return false;
  }

  return profiles.some((profile) => visit(profile.id));
}

function profileTargetIds(profile: ProfileV2): readonly string[] {
  switch (profile.kind) {
    case 'auto-switch':
      return [profile.fallback.profileId, ...profile.rules.map((rule) => rule.target.profileId)];
    case 'rule-list':
      return [profile.matchTarget.profileId, profile.fallback.profileId];
    case 'virtual':
      return [profile.target.profileId];
    case 'direct':
    case 'system':
    case 'fixed-proxy':
    case 'pac':
    case 'auto-detect':
      return [];
  }
}

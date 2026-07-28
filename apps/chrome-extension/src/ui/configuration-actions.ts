import type {
  AutoSwitchProfile,
  ProfileDocument,
  ProxyEndpoint,
  RouteTarget
} from '@switchypeformance/contracts';
export { addHostRuleToAutoSwitch } from '@switchypeformance/contracts';

import { createId } from './background-client.ts';

export interface NewProxyDraft {
  name: string;
  scheme: ProxyEndpoint['scheme'];
  host: string;
  port: number;
}

export function addProxyWithFixedProfile(
  document: ProfileDocument,
  draft: NewProxyDraft
): ProfileDocument {
  const proxyId = createId('proxy');
  const proxy: ProxyEndpoint = { ...draft, id: proxyId };
  const fixedProfile = {
    id: createId('profile'),
    kind: 'fixed-proxy' as const,
    name: draft.name,
    proxyId
  };

  return {
    ...document,
    proxies: [...document.proxies, proxy],
    profiles: [...document.profiles, fixedProfile]
  };
}

export function addAutoSwitchProfile(
  document: ProfileDocument,
  profileId: string,
  name: string
): ProfileDocument {
  if (!profileId.trim() || document.profiles.some((profile) => profile.id === profileId)) {
    throw new Error('自动切换配置 ID 已存在');
  }
  if (!name.trim()) {
    throw new Error('请填写自动切换配置名称');
  }
  const profile: AutoSwitchProfile = {
    id: profileId,
    kind: 'auto-switch',
    name: name.trim(),
    fallback: { kind: 'direct' },
    loopbackPolicy: 'direct',
    proxyFailurePolicy: 'direct',
    rules: []
  };
  return { ...document, profiles: [...document.profiles, profile] };
}

export function removeAutoSwitchProfile(
  document: ProfileDocument,
  profileId: string
): ProfileDocument {
  const automaticProfiles = document.profiles.filter(
    (profile): profile is AutoSwitchProfile => profile.kind === 'auto-switch'
  );
  if (!automaticProfiles.some((profile) => profile.id === profileId)) {
    throw new Error('自动切换配置不存在');
  }
  if (automaticProfiles.length <= 1) {
    throw new Error('至少需要保留一个自动切换配置');
  }
  const profiles = document.profiles.filter((profile) => profile.id !== profileId);
  const activeProfileId =
    document.activeProfileId === profileId
      ? (profiles.find((profile) => profile.kind === 'direct')?.id ?? profiles[0]?.id ?? 'direct')
      : document.activeProfileId;
  return { ...document, activeProfileId, profiles };
}

export function removeProxyAndReferences(
  document: ProfileDocument,
  proxyId: string
): ProfileDocument {
  const profiles = document.profiles
    .filter((profile) => profile.kind !== 'fixed-proxy' || profile.proxyId !== proxyId)
    .map((profile) => {
      if (profile.kind !== 'auto-switch') {
        return profile;
      }
      return removeAutoSwitchReferences(profile, proxyId);
    });
  const activeProfileExists = profiles.some((profile) => profile.id === document.activeProfileId);
  const activeProfileId = activeProfileExists
    ? document.activeProfileId
    : (profiles.find((profile) => profile.kind === 'direct')?.id ?? profiles[0]?.id ?? 'direct');

  return {
    ...document,
    activeProfileId,
    proxies: document.proxies.filter((proxy) => proxy.id !== proxyId),
    profiles
  };
}

export function replaceAutoSwitchProfile(
  document: ProfileDocument,
  replacement: AutoSwitchProfile
): ProfileDocument {
  return {
    ...document,
    profiles: document.profiles.map((profile) =>
      profile.id === replacement.id ? replacement : profile
    )
  };
}

function removeAutoSwitchReferences(
  profile: AutoSwitchProfile,
  proxyId: string
): AutoSwitchProfile {
  return {
    ...profile,
    fallback: referencesProxy(profile.fallback, proxyId) ? { kind: 'direct' } : profile.fallback,
    rules: profile.rules.filter((rule) => !referencesProxy(rule.target, proxyId))
  };
}

function referencesProxy(target: RouteTarget, proxyId: string): boolean {
  return target.kind === 'proxy' && target.proxyId === proxyId;
}

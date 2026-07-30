import type { ProfileDocumentV2, ProfileV2 } from '@switchypeformance/contracts';

import {
  createProfile,
  renameProfile,
  replaceAndDeleteProfile,
  type CreatableProfileKind
} from '../../configuration/profile-actions.ts';

export const ORIGINAL_CREATABLE_PROFILE_KINDS = [
  'fixed-proxy',
  'auto-switch',
  'pac',
  'auto-detect',
  'rule-list',
  'virtual'
] as const;

export type OriginalCreatableProfileKind = (typeof ORIGINAL_CREATABLE_PROFILE_KINDS)[number];

export interface CreateOriginalProfileOptions {
  id: string;
  kind: OriginalCreatableProfileKind;
  name: string;
  proxyId?: string;
}

export function createOriginalProfile(
  document: ProfileDocumentV2,
  options: CreateOriginalProfileOptions
): { document: ProfileDocumentV2; profileId: string } {
  const name = options.name.trim();
  assertUniqueProfileName(document, name);
  const id = options.id.trim();
  if (!id) {
    throw new Error('新配置 ID 不能为空');
  }

  if (options.kind === 'fixed-proxy') {
    const proxyId = options.proxyId?.trim();
    if (!proxyId || !document.proxyServers.some((proxy) => proxy.id === proxyId)) {
      throw new Error('请选择一个代理服务器');
    }
    const profile: Extract<ProfileV2, { kind: 'fixed-proxy' }> = {
      bypassList: [],
      id,
      kind: 'fixed-proxy',
      name,
      routes: { fallbackProxyId: proxyId }
    };
    return {
      document: { ...document, profiles: [...document.profiles, profile] },
      profileId: id
    };
  }

  return {
    document: createProfile(document, {
      id,
      kind: options.kind as CreatableProfileKind,
      name
    }),
    profileId: id
  };
}

export function renameOriginalProfile(
  document: ProfileDocumentV2,
  profileId: string,
  name: string
): ProfileDocumentV2 {
  assertUniqueProfileName(document, name.trim(), profileId);
  return renameProfile(document, profileId, name);
}

export function setOriginalProfileColor(
  document: ProfileDocumentV2,
  profileId: string,
  color: string | undefined
): ProfileDocumentV2 {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    throw new Error('配置不存在');
  }
  const normalizedColor = color?.trim();
  return {
    ...document,
    profiles: document.profiles.map((candidate) =>
      candidate.id === profileId ? withProfileColor(candidate, normalizedColor) : candidate
    )
  };
}

export function replaceAndDeleteOriginalProfile(
  document: ProfileDocumentV2,
  profileId: string,
  replacementProfileId: string
): ProfileDocumentV2 {
  return replaceAndDeleteProfile(document, profileId, replacementProfileId);
}

function withProfileColor(profile: ProfileV2, color: string | undefined): ProfileV2 {
  const { color: _previousColor, ...withoutColor } = profile;
  return color ? { ...withoutColor, color } : withoutColor;
}

function assertUniqueProfileName(
  document: ProfileDocumentV2,
  name: string,
  excludingProfileId?: string
): void {
  if (!name) {
    throw new Error('请填写配置名称');
  }
  if (
    document.profiles.some(
      (profile) => profile.id !== excludingProfileId && profile.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    )
  ) {
    throw new Error('配置名称已存在');
  }
}

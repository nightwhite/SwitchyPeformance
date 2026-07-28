import type { ProfileDocumentV2 } from './document.ts';
import type { ProfileV2 } from './profiles.ts';

export type ResolvedProfileV2 = Exclude<ProfileV2, { kind: 'virtual' }>;

export interface ProfileResolutionV2 {
  profileId: string;
  profile: ResolvedProfileV2;
  virtualProfileIds: readonly string[];
}

export function resolveProfileV2(
  document: ProfileDocumentV2,
  initialProfileId = document.activeProfileId
): ProfileResolutionV2 {
  const profilesById = new Map(document.profiles.map((profile) => [profile.id, profile]));
  const virtualProfileIds: string[] = [];
  const visitedProfileIds = new Set<string>();
  let profileId = initialProfileId;

  while (true) {
    if (visitedProfileIds.has(profileId)) {
      throw new Error(`虚拟配置存在循环引用：${[...virtualProfileIds, profileId].join(' -> ')}`);
    }
    visitedProfileIds.add(profileId);

    const profile = profilesById.get(profileId);
    if (!profile) {
      throw new Error(`当前配置不存在：${profileId}`);
    }
    if (profile.kind !== 'virtual') {
      return { profileId, profile, virtualProfileIds };
    }

    virtualProfileIds.push(profile.id);
    profileId = profile.target.profileId;
  }
}

export function isAutoSwitchRouteTargetV2(document: ProfileDocumentV2, profileId: string): boolean {
  try {
    const resolved = resolveProfileV2(document, profileId).profile;
    return resolved.kind === 'direct' || resolved.kind === 'fixed-proxy';
  } catch {
    return false;
  }
}

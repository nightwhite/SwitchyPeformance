import type { ProfileDocumentV2, ProfileKind, ProfileV2 } from '@switchypeformance/contracts';

export interface ProfileNavigationItem {
  builtIn: boolean;
  id: string;
  kind: ProfileKind;
  name: string;
}

export function profileNavigationItems(
  document: ProfileDocumentV2
): readonly ProfileNavigationItem[] {
  const builtIns = ['direct', 'system'].flatMap((profileId) => {
    const profile = document.profiles.find((candidate) => candidate.id === profileId);
    return profile ? [toNavigationItem(profile, true)] : [];
  });
  const customProfiles = document.profiles
    .filter((profile) => profile.id !== 'direct' && profile.id !== 'system')
    .map((profile) => toNavigationItem(profile, false));
  return [...builtIns, ...customProfiles];
}

function toNavigationItem(profile: ProfileV2, builtIn: boolean): ProfileNavigationItem {
  return { builtIn, id: profile.id, kind: profile.kind, name: profile.name };
}

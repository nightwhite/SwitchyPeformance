import { isAutoSwitchRouteTargetV2, type ProfileDocumentV2, type ProfileV2 } from '@switchypeformance/contracts';

export interface OriginalPopupTarget {
  label: string;
  profileId: string;
}

export interface OriginalPopupDefaultTarget {
  label: string;
  options: readonly OriginalPopupTarget[];
  profileId: string;
}

export interface OriginalPopupRow {
  defaultTarget?: OriginalPopupDefaultTarget;
  kind: ProfileV2['kind'];
  label: string;
  profileId: string;
  role: 'builtin' | 'profile';
}

const CUSTOM_PROFILE_ORDER: Readonly<Record<Exclude<ProfileV2['kind'], 'direct' | 'system'>, number>> = {
  'fixed-proxy': -2_000,
  pac: -1_000,
  'auto-detect': 0,
  virtual: 1_000,
  'auto-switch': 2_000,
  'rule-list': 3_000
};

export function originalPopupRows(document: ProfileDocumentV2): readonly OriginalPopupRow[] {
  const builtinRows = ['direct', 'system']
    .map((profileId) => document.profiles.find((profile) => profile.id === profileId))
    .filter((profile): profile is ProfileV2 => profile !== undefined)
    .map((profile) => rowFor(document, profile, 'builtin'));
  const customRows = document.profiles
    .filter((profile) => profile.kind !== 'direct' && profile.kind !== 'system')
    .slice()
    .sort(compareCustomProfiles)
    .map((profile) => rowFor(document, profile, 'profile'));
  return [...builtinRows, ...customRows];
}

function rowFor(
  document: ProfileDocumentV2,
  profile: ProfileV2,
  role: OriginalPopupRow['role']
): OriginalPopupRow {
  const target = defaultTargetFor(document, profile);
  return {
    kind: profile.kind,
    label: profile.name,
    profileId: profile.id,
    role,
    ...(target === undefined ? {} : { defaultTarget: target })
  };
}

function defaultTargetFor(
  document: ProfileDocumentV2,
  profile: ProfileV2
): OriginalPopupDefaultTarget | undefined {
  switch (profile.kind) {
    case 'auto-switch':
    case 'rule-list':
      return targetChoice(
        document,
        profile.fallback.profileId,
        document.profiles.filter((candidate) => isAutoSwitchRouteTargetV2(document, candidate.id))
      );
    case 'virtual':
      return targetChoice(
        document,
        profile.target.profileId,
        document.profiles.filter((candidate) => canUseAsVirtualTarget(document, profile.id, candidate))
      );
    default:
      return undefined;
  }
}

function targetChoice(
  document: ProfileDocumentV2,
  selectedProfileId: string,
  candidates: readonly ProfileV2[]
): OriginalPopupDefaultTarget {
  const options = candidates.slice().sort(comparePopupProfiles).map((candidate) => ({
    label: candidate.name,
    profileId: candidate.id
  }));
  const selected = document.profiles.find((candidate) => candidate.id === selectedProfileId);
  return {
    label: selected?.name ?? selectedProfileId,
    options,
    profileId: selectedProfileId
  };
}

function canUseAsVirtualTarget(
  document: ProfileDocumentV2,
  sourceProfileId: string,
  candidate: ProfileV2
): boolean {
  if (candidate.id === sourceProfileId) {
    return false;
  }
  const profiles = new Map(document.profiles.map((profile) => [profile.id, profile]));
  const visited = new Set<string>();
  let current: ProfileV2 | undefined = candidate;
  while (current?.kind === 'virtual') {
    if (current.id === sourceProfileId || visited.has(current.id)) {
      return false;
    }
    visited.add(current.id);
    current = profiles.get(current.target.profileId);
  }
  return current !== undefined;
}

function compareCustomProfiles(left: ProfileV2, right: ProfileV2): number {
  const order = CUSTOM_PROFILE_ORDER[left.kind as keyof typeof CUSTOM_PROFILE_ORDER] -
    CUSTOM_PROFILE_ORDER[right.kind as keyof typeof CUSTOM_PROFILE_ORDER];
  return order !== 0 ? order : left.name.localeCompare(right.name, 'zh-CN');
}

function comparePopupProfiles(left: ProfileV2, right: ProfileV2): number {
  const builtinOrder = builtinProfileOrder(left.id) - builtinProfileOrder(right.id);
  if (builtinOrder !== 0) {
    return builtinOrder;
  }
  if (left.kind === 'direct' || left.kind === 'system') {
    return left.name.localeCompare(right.name, 'zh-CN');
  }
  if (right.kind === 'direct' || right.kind === 'system') {
    return 1;
  }
  return compareCustomProfiles(left, right);
}

function builtinProfileOrder(profileId: string): number {
  if (profileId === 'direct') {
    return -20_000;
  }
  if (profileId === 'system') {
    return -19_000;
  }
  return 0;
}

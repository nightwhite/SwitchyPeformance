export const BUILTIN_PROFILE_IDS = {
  direct: 'direct',
  system: 'system'
} as const;

export type BuiltinProfileId = (typeof BUILTIN_PROFILE_IDS)[keyof typeof BUILTIN_PROFILE_IDS];

export interface ProfileTarget {
  profileId: string;
}

export function isProfileTarget(value: unknown): value is ProfileTarget {
  return (
    isRecord(value) &&
    typeof value.profileId === 'string' &&
    value.profileId.trim().length > 0 &&
    Object.keys(value).length === 1
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import type { ProfileDocumentV2, ProfileV2 } from '@switchypeformance/contracts';

export const ORIGINAL_TOOL_PAGES = [
  'ui',
  'general',
  'io',
  'theme',
  'builtin',
  'diagnostics'
] as const;

export type OriginalToolPage = (typeof ORIGINAL_TOOL_PAGES)[number];

export type OriginalRoute =
  | { kind: 'profile'; profileId: string }
  | { kind: 'tool'; page: OriginalToolPage }
  | { kind: 'new-profile' };

export function resolveOriginalRoute(hash: string, document: ProfileDocumentV2): OriginalRoute {
  const path = hashPath(hash);
  if (path === 'new-profile') {
    return { kind: 'new-profile' };
  }
  if (path.startsWith('profile/')) {
    const segment = decodeRouteSegment(path.slice('profile/'.length));
    const profile = profileForRouteSegment(document, segment);
    if (profile) {
      return { kind: 'profile', profileId: profile.id };
    }
  }
  if (isOriginalToolPage(path)) {
    return { kind: 'tool', page: path };
  }
  return { kind: 'tool', page: 'builtin' };
}

export function originalProfileHash(profile: Pick<ProfileV2, 'name'>): string {
  return `#!/profile/${encodeURIComponent(profile.name)}`;
}

export function originalToolHash(page: OriginalToolPage): string {
  return `#!/${page}`;
}

export function originalNewProfileHash(): string {
  return '#!/new-profile';
}

function hashPath(hash: string): string {
  return (
    hash
      .replace(/^#?!?\/?/, '')
      .split(/[?#]/, 1)[0]
      ?.trim() ?? ''
  );
}

function decodeRouteSegment(value: string): string {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return '';
  }
}

function profileForRouteSegment(
  document: ProfileDocumentV2,
  segment: string
): ProfileV2 | undefined {
  return (
    document.profiles.find((profile) => profile.name === segment) ??
    document.profiles.find((profile) => profile.id === segment)
  );
}

function isOriginalToolPage(value: string): value is OriginalToolPage {
  return ORIGINAL_TOOL_PAGES.includes(value as OriginalToolPage);
}

export const OPTION_PAGES = [
  'overview',
  'profiles',
  'proxy-servers',
  'rules',
  'temporary-rules',
  'diagnostics',
  'data',
  'sync',
  'settings'
] as const;

export type OptionPage = (typeof OPTION_PAGES)[number];

export type OptionRoute =
  { kind: 'profile'; profileId: string } | { kind: 'tool'; page: OptionPage };

export const OPTIONS_WORKSPACE_STYLE = {
  minWidth: '760px',
  overflowX: 'auto'
} as const;

export function pageFromOptionsHash(hash: string): OptionPage {
  const value = hash.replace(/^#\/?/, '');
  return isOptionPage(value) ? value : 'overview';
}

export function routeFromOptionsHash(hash: string): OptionRoute {
  const value = hash.replace(/^#\/?/, '');
  const profileMatch = /^profile\/([^/?#]+)$/.exec(value);
  if (profileMatch) {
    try {
      const profileId = decodeURIComponent(profileMatch[1] ?? '').trim();
      if (profileId) {
        return { kind: 'profile', profileId };
      }
    } catch {
      // A malformed URL must still leave the options page usable.
    }
  }
  return { kind: 'tool', page: pageFromOptionsHash(hash) };
}

export function optionsHash(page: OptionPage): string {
  return `#/${page}`;
}

export function optionsHashForProfile(profileId: string): string {
  return `#/profile/${encodeURIComponent(profileId)}`;
}

function isOptionPage(value: string): value is OptionPage {
  return OPTION_PAGES.includes(value as OptionPage);
}

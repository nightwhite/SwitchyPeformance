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

export const OPTIONS_WORKSPACE_STYLE = {
  minWidth: '760px',
  overflowX: 'auto'
} as const;

export function pageFromOptionsHash(hash: string): OptionPage {
  const value = hash.replace(/^#\/?/, '');
  return isOptionPage(value) ? value : 'overview';
}

export function optionsHash(page: OptionPage): string {
  return `#/${page}`;
}

function isOptionPage(value: string): value is OptionPage {
  return OPTION_PAGES.includes(value as OptionPage);
}

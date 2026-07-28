import type { RouteTarget } from '@switchypeformance/contracts';

const QUICK_RULE_MENU_PREFIX = 'switchypeformance.quick-rule:';

export const DIRECT_QUICK_RULE_MENU_ID = `${QUICK_RULE_MENU_PREFIX}direct`;

export type QuickRuleTarget = RouteTarget | { kind: 'profile'; profileId: string };

export const quickRuleMenuContexts = ['page', 'frame', 'link', 'image', 'video', 'audio'] as const;

export interface QuickRuleClickData {
  frameUrl?: string | undefined;
  linkUrl?: string | undefined;
  mediaType?: string | undefined;
  pageUrl?: string | undefined;
  srcUrl?: string | undefined;
}

export type QuickRuleClickTarget = {
  source: 'frame' | 'link' | 'media' | 'page';
  url: string;
};

export function proxyQuickRuleMenuId(proxyId: string): string {
  return `${QUICK_RULE_MENU_PREFIX}proxy:${encodeURIComponent(proxyId)}`;
}

export function profileQuickRuleMenuId(profileId: string): string {
  return `${QUICK_RULE_MENU_PREFIX}profile:${encodeURIComponent(profileId)}`;
}

export function quickRuleTargetFromMenuId(menuItemId: string): QuickRuleTarget | undefined {
  if (menuItemId === DIRECT_QUICK_RULE_MENU_ID) {
    return { kind: 'direct' };
  }
  const prefix = `${QUICK_RULE_MENU_PREFIX}proxy:`;
  if (menuItemId.startsWith(prefix)) {
    return decodedTarget(menuItemId.slice(prefix.length), (proxyId) => ({
      kind: 'proxy',
      proxyId
    }));
  }

  const profilePrefix = `${QUICK_RULE_MENU_PREFIX}profile:`;
  if (menuItemId.startsWith(profilePrefix)) {
    return decodedTarget(menuItemId.slice(profilePrefix.length), (profileId) => ({
      kind: 'profile',
      profileId
    }));
  }
  return undefined;
}

export function contextTargetFromClick(
  click: QuickRuleClickData
): QuickRuleClickTarget | undefined {
  const candidates: readonly QuickRuleClickTarget[] = [
    ...(click.srcUrl === undefined ? [] : [{ source: 'media' as const, url: click.srcUrl }]),
    ...(click.linkUrl === undefined ? [] : [{ source: 'link' as const, url: click.linkUrl }]),
    ...(click.frameUrl === undefined ? [] : [{ source: 'frame' as const, url: click.frameUrl }]),
    ...(click.pageUrl === undefined ? [] : [{ source: 'page' as const, url: click.pageUrl }])
  ];

  for (const candidate of candidates) {
    const url = validRuleUrl(candidate.url);
    if (url) {
      return { source: candidate.source, url };
    }
  }
  return undefined;
}

function decodedTarget<T extends QuickRuleTarget>(
  encodedId: string,
  createTarget: (id: string) => T
): T | undefined {
  try {
    const id = decodeURIComponent(encodedId);
    return id ? createTarget(id) : undefined;
  } catch {
    return undefined;
  }
}

function validRuleUrl(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

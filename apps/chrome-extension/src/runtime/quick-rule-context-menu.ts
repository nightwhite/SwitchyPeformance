import type { RouteTarget } from '@switchypeformance/contracts';

const QUICK_RULE_MENU_PREFIX = 'switchypeformance.quick-rule:';

export const DIRECT_QUICK_RULE_MENU_ID = `${QUICK_RULE_MENU_PREFIX}direct`;

export function proxyQuickRuleMenuId(proxyId: string): string {
  return `${QUICK_RULE_MENU_PREFIX}proxy:${encodeURIComponent(proxyId)}`;
}

export function quickRuleTargetFromMenuId(menuItemId: string): RouteTarget | undefined {
  if (menuItemId === DIRECT_QUICK_RULE_MENU_ID) {
    return { kind: 'direct' };
  }
  const prefix = `${QUICK_RULE_MENU_PREFIX}proxy:`;
  if (!menuItemId.startsWith(prefix)) {
    return undefined;
  }
  try {
    const proxyId = decodeURIComponent(menuItemId.slice(prefix.length));
    return proxyId ? { kind: 'proxy', proxyId } : undefined;
  } catch {
    return undefined;
  }
}

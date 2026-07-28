import type { RouteTarget } from '@switchypeformance/contracts';

const QUICK_RULE_MENU_PREFIX = 'switchypeformance.quick-rule:';

export const DIRECT_QUICK_RULE_MENU_ID = `${QUICK_RULE_MENU_PREFIX}direct`;

export type QuickRuleTarget = RouteTarget | { kind: 'profile'; profileId: string };

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

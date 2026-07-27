import { describe, expect, it } from 'vitest';

import {
  DIRECT_QUICK_RULE_MENU_ID,
  quickRuleTargetFromMenuId,
  proxyQuickRuleMenuId
} from './quick-rule-context-menu.ts';

describe('quick rule context-menu ids', () => {
  it('round-trips direct and proxy routing targets without relying on display names', () => {
    expect(quickRuleTargetFromMenuId(DIRECT_QUICK_RULE_MENU_ID)).toEqual({ kind: 'direct' });
    expect(quickRuleTargetFromMenuId(proxyQuickRuleMenuId('proxy/china:1'))).toEqual({
      kind: 'proxy',
      proxyId: 'proxy/china:1'
    });
  });

  it('ignores unrelated menu ids', () => {
    expect(quickRuleTargetFromMenuId('unrelated')).toBeUndefined();
  });
});

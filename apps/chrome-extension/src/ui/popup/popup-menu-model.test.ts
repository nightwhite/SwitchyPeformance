import { describe, expect, it } from 'vitest';

import { popupMenuActions } from './popup-menu-model.ts';

describe('popup menu model', () => {
  it('keeps rule controls behind menu actions until the user asks for them', () => {
    expect(
      popupMenuActions({
        canAddRule: true,
        canAddTemporaryRule: true,
        failureCount: 2,
        pageAvailable: true
      })
    ).toEqual([
      { id: 'add-rule', label: '为当前网站添加规则', view: 'rule-form' },
      { id: 'temporary-rule', label: '临时规则', view: 'temporary-form' },
      { id: 'failures', label: '失败资源 (2)', view: 'failure-list' },
      { id: 'route', label: '查看当前路由', view: 'route-info' }
    ]);
  });

  it('does not offer page actions for Chrome internal pages', () => {
    expect(
      popupMenuActions({
        canAddRule: false,
        canAddTemporaryRule: false,
        failureCount: 3,
        pageAvailable: false
      })
    ).toEqual([]);
  });
});

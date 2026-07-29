export type PopupView = 'failure-list' | 'menu' | 'route-info' | 'rule-form' | 'temporary-form';

export interface PopupMenuAction {
  id: 'add-rule' | 'failures' | 'route' | 'temporary-rule';
  label: string;
  view: Exclude<PopupView, 'menu'>;
}

export interface PopupMenuInput {
  canAddRule: boolean;
  canAddTemporaryRule: boolean;
  failureCount: number;
  pageAvailable: boolean;
}

export function popupMenuActions(input: PopupMenuInput): readonly PopupMenuAction[] {
  if (!input.pageAvailable) {
    return [];
  }

  const actions: PopupMenuAction[] = [];
  if (input.canAddRule) {
    actions.push({ id: 'add-rule', label: '为当前网站添加规则', view: 'rule-form' });
  }
  if (input.canAddTemporaryRule) {
    actions.push({ id: 'temporary-rule', label: '临时规则', view: 'temporary-form' });
  }
  if (input.failureCount > 0) {
    actions.push({
      id: 'failures',
      label: `失败资源 (${input.failureCount})`,
      view: 'failure-list'
    });
  }
  actions.push({ id: 'route', label: '查看当前路由', view: 'route-info' });
  return actions;
}

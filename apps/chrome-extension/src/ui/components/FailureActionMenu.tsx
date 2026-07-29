import { Clock3, Plus, Route, ShieldCheck, TriangleAlert } from 'lucide-react';

import {
  remediationView,
  type FailureAction,
  type FailureResource
} from '../diagnostics/failure-remediation.ts';

export interface FailureActionMenuProps {
  busy: boolean;
  failure: FailureResource;
  matchedRule?: string;
  onAction(action: FailureAction): void;
  proxyActionAvailable: boolean;
  ruleActionAvailable: boolean;
  routeLabel?: string;
}

export interface FailureActionMenuView {
  actions: readonly {
    action: FailureAction;
    disabled: boolean;
    label: string;
  }[];
  loopbackNotice?: string;
  matchedRule?: string;
  routeLabel?: string;
}

export function FailureActionMenu({
  busy,
  failure,
  matchedRule,
  onAction,
  proxyActionAvailable,
  ruleActionAvailable,
  routeLabel
}: FailureActionMenuProps) {
  const view = failureActionMenuView({
    failure,
    proxyActionAvailable,
    ruleActionAvailable,
    ...(matchedRule === undefined ? {} : { matchedRule }),
    ...(routeLabel === undefined ? {} : { routeLabel })
  });

  return (
    <div className="failure-action-menu">
      {view.routeLabel || view.matchedRule ? (
        <dl className="failure-route-details">
          {view.routeLabel ? (
            <div>
              <dt>当前路由</dt>
              <dd>{view.routeLabel}</dd>
            </div>
          ) : null}
          {view.matchedRule ? (
            <div>
              <dt>命中规则</dt>
              <dd>{view.matchedRule}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {view.loopbackNotice ? (
        <p className="failure-loopback-notice">
          <TriangleAlert size={14} />
          {view.loopbackNotice}
        </p>
      ) : null}
      <div className="failure-action-grid">
        {view.actions.map((option) => (
          <button
            className={option.action === 'inspect-route' ? 'outline-button' : 'command-button'}
            disabled={busy || option.disabled}
            key={option.action}
            onClick={() => onAction(option.action)}
            type="button"
          >
            <FailureActionIcon action={option.action} />
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function failureActionMenuView({
  failure,
  matchedRule,
  proxyActionAvailable,
  ruleActionAvailable,
  routeLabel
}: Omit<FailureActionMenuProps, 'busy' | 'onAction'>): FailureActionMenuView {
  const remediation = remediationView(failure);
  return {
    actions: remediation.options.map((option) => ({
      ...option,
      disabled:
        (isProxyAction(option.action) && !proxyActionAvailable) ||
        (isRuleAction(option.action) && !ruleActionAvailable)
    })),
    ...(routeLabel === undefined ? {} : { routeLabel }),
    ...(matchedRule === undefined ? {} : { matchedRule }),
    ...(remediation.loopbackNotice === undefined
      ? {}
      : { loopbackNotice: remediation.loopbackNotice })
  };
}

function FailureActionIcon({ action }: { action: FailureAction }) {
  switch (action) {
    case 'add-direct-rule':
      return <ShieldCheck size={15} />;
    case 'add-proxy-rule':
      return <Plus size={15} />;
    case 'add-temporary-direct-rule':
    case 'add-temporary-proxy-rule':
      return <Clock3 size={15} />;
    case 'inspect-route':
      return <Route size={15} />;
  }
}

function isProxyAction(action: FailureAction): boolean {
  return action === 'add-proxy-rule' || action === 'add-temporary-proxy-rule';
}

function isRuleAction(action: FailureAction): boolean {
  return action !== 'inspect-route';
}

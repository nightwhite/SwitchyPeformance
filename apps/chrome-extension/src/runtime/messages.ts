import type {
  ConfigurationDocument,
  ProfileTarget,
  RuleConditionV2,
  RouteTarget
} from '@switchypeformance/contracts';
import { validateCondition } from '@switchypeformance/contracts';

import type { CurrentSiteScope } from '../ui/popup/current-site-rule.ts';
import type { CurrentRouteStatus } from './current-route.ts';
import type { SourceStatus } from './source-status-repository.ts';
import type { TemporaryRule } from './temporary-rule-service.ts';

export type QuickRuleTarget = ProfileTarget | RouteTarget;
export type QuickRuleCondition = Extract<
  RuleConditionV2,
  { type: 'host-wildcard' | 'url-wildcard' }
>;

export type BackgroundRequest =
  | { type: 'state.get' }
  | { type: 'profile.activate'; profileId: string }
  | { type: 'configuration.replace'; document: unknown }
  | { type: 'route.explain'; url: string }
  | {
      type: 'quick-rule.add';
      automaticProfileId: string;
      condition: QuickRuleCondition;
      host: string;
      scope: CurrentSiteScope;
      target: QuickRuleTarget;
    }
  | {
      type: 'temporary-rule.add';
      automaticProfileId: string;
      condition: QuickRuleCondition;
      expiresAt: number;
      host: string;
      scope: CurrentSiteScope;
      target: QuickRuleTarget;
    }
  | { type: 'temporary-rule.remove'; ruleId: string }
  | { type: 'temporary-rule.clear' }
  | { type: 'source.refresh'; sourceId: string }
  | { type: 'diagnostics.clear' }
  | { type: 'options.open' }
  | { type: 'proxy.credentials.save'; proxyId: string; username: string; password: string }
  | { type: 'proxy.credentials.clear'; proxyId: string }
  | { type: 'proxy.credentials.delete'; credentialId: string };

export interface BackgroundState {
  configuration: ConfigurationDocument;
  diagnostics: readonly {
    id: string;
    timestamp: number;
    level: 'info' | 'error';
    scope: 'configuration' | 'proxy' | 'network' | 'runtime';
    message: string;
    target?: string;
    detail?: string;
  }[];
  sourceStatuses: readonly SourceStatus[];
  temporaryRules: readonly TemporaryRule[];
}

export type BackgroundResponse =
  | { ok: true; routeStatus?: CurrentRouteStatus; state?: BackgroundState }
  | { ok: false; error: string };

export function isBackgroundRequest(input: unknown): input is BackgroundRequest {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false;
  }
  const message = input as {
    type?: unknown;
    profileId?: unknown;
    document?: unknown;
    proxyId?: unknown;
    username?: unknown;
    password?: unknown;
    credentialId?: unknown;
    automaticProfileId?: unknown;
    scope?: unknown;
    target?: unknown;
    url?: unknown;
    condition?: unknown;
    host?: unknown;
    expiresAt?: unknown;
    ruleId?: unknown;
    sourceId?: unknown;
  };
  return (
    message.type === 'state.get' ||
    message.type === 'diagnostics.clear' ||
    message.type === 'options.open' ||
    (message.type === 'route.explain' && isNonEmptyString(message.url)) ||
    (message.type === 'profile.activate' && typeof message.profileId === 'string') ||
    (message.type === 'configuration.replace' && 'document' in message) ||
    (message.type === 'quick-rule.add' &&
      isNonEmptyString(message.automaticProfileId) &&
      isQuickRuleCondition(message.condition) &&
      isNonEmptyString(message.host) &&
      isCurrentSiteScope(message.scope) &&
      isQuickRuleTarget(message.target)) ||
    (message.type === 'temporary-rule.add' &&
      isNonEmptyString(message.automaticProfileId) &&
      isQuickRuleCondition(message.condition) &&
      isExpiryTimestamp(message.expiresAt) &&
      isNonEmptyString(message.host) &&
      isCurrentSiteScope(message.scope) &&
      isQuickRuleTarget(message.target)) ||
    (message.type === 'temporary-rule.remove' && isNonEmptyString(message.ruleId)) ||
    message.type === 'temporary-rule.clear' ||
    (message.type === 'source.refresh' && isNonEmptyString(message.sourceId)) ||
    (message.type === 'proxy.credentials.save' &&
      typeof message.proxyId === 'string' &&
      typeof message.username === 'string' &&
      typeof message.password === 'string') ||
    (message.type === 'proxy.credentials.clear' && typeof message.proxyId === 'string') ||
    (message.type === 'proxy.credentials.delete' && typeof message.credentialId === 'string')
  );
}

function isQuickRuleCondition(value: unknown): value is QuickRuleCondition {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const condition = value as RuleConditionV2;
  return (
    (condition.type === 'host-wildcard' || condition.type === 'url-wildcard') &&
    validateCondition(condition).ok
  );
}

function isCurrentSiteScope(value: unknown): value is CurrentSiteScope {
  return value === 'page' || value === 'host' || value === 'domain';
}

function isQuickRuleTarget(value: unknown): value is QuickRuleTarget {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const target = value as { kind?: unknown; profileId?: unknown; proxyId?: unknown };
  if (target.kind !== undefined) {
    return (
      target.kind === 'direct' ||
      target.kind === 'system' ||
      (target.kind === 'proxy' && isNonEmptyString(target.proxyId))
    );
  }
  return isNonEmptyString(target.profileId);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isExpiryTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

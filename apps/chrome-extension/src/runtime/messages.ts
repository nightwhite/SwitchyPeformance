import type {
  ConfigurationDocument,
  ProfileTarget,
  RuleConditionV2,
  RouteTarget
} from '@switchypeformance/contracts';
import { validateCondition } from '@switchypeformance/contracts';

import type { CurrentSiteRuleCondition, CurrentSiteScope } from '../ui/popup/current-site-rule.ts';
import type { CurrentRouteStatus } from './current-route.ts';
import type { ConfigurationImportPreview } from './configuration-import-service.ts';
import type { ProxyControlState } from './external-proxy-state.ts';
import type { NetworkEvent } from './network-event-repository.ts';
import type { SourceStatus } from './source-status-repository.ts';
import type { TabNetworkSummary } from './tab-network-summary.ts';
import type { TemporaryRule } from './temporary-rule-service.ts';
import type {
  SyncExportPair,
  SyncInspection,
  SyncProviderConfiguration,
  SyncStatus
} from './sync/sync-service.ts';
import { normalizeSyncProviderConfiguration } from './sync/sync-settings-repository.ts';

export type QuickRuleTarget = ProfileTarget | RouteTarget;
export type QuickRuleCondition = CurrentSiteRuleCondition;

export interface QuickRuleEntry {
  condition: QuickRuleCondition;
  host: string;
  scope: CurrentSiteScope;
}

export type BackgroundRequest =
  | { type: 'state.get' }
  | { type: 'profile.activate'; profileId: string }
  | { type: 'configuration.replace'; document: unknown }
  | { type: 'configuration.import.preview'; input: unknown }
  | { type: 'configuration.import.commit'; input: unknown }
  | { type: 'extension.reset' }
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
      type: 'quick-rule.add-many';
      automaticProfileId: string;
      entries: readonly QuickRuleEntry[];
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
  | { type: 'network.events.clear' }
  | { type: 'network.events.list'; tabId?: number }
  | { type: 'diagnostics.clear' }
  | { type: 'options.open' }
  | { type: 'proxy.credentials.save'; proxyId: string; username: string; password: string }
  | { type: 'proxy.credentials.clear'; proxyId: string }
  | { type: 'proxy.credentials.delete'; credentialId: string }
  | { type: 'sync.status.get' }
  | {
      type: 'sync.configure';
      configuration: SyncProviderConfiguration;
      secret?: string;
    }
  | { type: 'sync.inspect' }
  | { type: 'sync.keep-local' }
  | { type: 'sync.use-remote' }
  | { type: 'sync.export-both' }
  | { type: 'sync.disconnect' };

export interface BackgroundState {
  configuration: ConfigurationDocument;
  diagnostics: readonly {
    id: string;
    timestamp: number;
    level: 'info' | 'error';
    scope: 'configuration' | 'proxy' | 'network' | 'runtime';
    message: string;
    tabId?: number;
    target?: string;
    detail?: string;
  }[];
  sourceStatuses: readonly SourceStatus[];
  temporaryRules: readonly TemporaryRule[];
  networkSummary?: readonly TabNetworkSummary[];
  proxyControl?: ProxyControlState;
  sync?: SyncStatus;
}

export type BackgroundResponse =
  | {
      ok: true;
      importPreview?: ConfigurationImportPreview;
      networkEvents?: readonly NetworkEvent[];
      routeStatus?: CurrentRouteStatus;
      state?: BackgroundState;
      syncExport?: SyncExportPair;
      syncInspection?: SyncInspection;
      syncStatus?: SyncStatus;
    }
  | { ok: false; error: string };

export function isBackgroundRequest(input: unknown): input is BackgroundRequest {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false;
  }
  const message = input as {
    type?: unknown;
    profileId?: unknown;
    document?: unknown;
    input?: unknown;
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
    entries?: unknown;
    expiresAt?: unknown;
    ruleId?: unknown;
    sourceId?: unknown;
    tabId?: unknown;
    configuration?: unknown;
    secret?: unknown;
  };
  return (
    message.type === 'state.get' ||
    message.type === 'diagnostics.clear' ||
    message.type === 'extension.reset' ||
    message.type === 'options.open' ||
    (message.type === 'route.explain' && isNonEmptyString(message.url)) ||
    (message.type === 'profile.activate' && typeof message.profileId === 'string') ||
    (message.type === 'configuration.replace' && 'document' in message) ||
    ((message.type === 'configuration.import.preview' ||
      message.type === 'configuration.import.commit') &&
      Object.hasOwn(message, 'input')) ||
    (message.type === 'quick-rule.add' &&
      isNonEmptyString(message.automaticProfileId) &&
      isQuickRuleCondition(message.condition) &&
      isNonEmptyString(message.host) &&
      isCurrentSiteScope(message.scope) &&
      isQuickRuleTarget(message.target)) ||
    (message.type === 'quick-rule.add-many' &&
      isNonEmptyString(message.automaticProfileId) &&
      isQuickRuleEntries(message.entries) &&
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
    message.type === 'network.events.clear' ||
    (message.type === 'network.events.list' &&
      (message.tabId === undefined || isNetworkTabId(message.tabId))) ||
    (message.type === 'source.refresh' && isNonEmptyString(message.sourceId)) ||
    (message.type === 'proxy.credentials.save' &&
      typeof message.proxyId === 'string' &&
      typeof message.username === 'string' &&
      typeof message.password === 'string') ||
    (message.type === 'proxy.credentials.clear' && typeof message.proxyId === 'string') ||
    (message.type === 'proxy.credentials.delete' && typeof message.credentialId === 'string') ||
    message.type === 'sync.status.get' ||
    message.type === 'sync.inspect' ||
    message.type === 'sync.keep-local' ||
    message.type === 'sync.use-remote' ||
    message.type === 'sync.export-both' ||
    message.type === 'sync.disconnect' ||
    (message.type === 'sync.configure' &&
      isSyncProviderConfiguration(message.configuration) &&
      (message.secret === undefined || typeof message.secret === 'string'))
  );
}

function isSyncProviderConfiguration(value: unknown): value is SyncProviderConfiguration {
  try {
    normalizeSyncProviderConfiguration(value);
    return true;
  } catch {
    return false;
  }
}

function isQuickRuleCondition(value: unknown): value is QuickRuleCondition {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const condition = value as RuleConditionV2;
  return (
    (condition.type === 'host-wildcard' ||
      condition.type === 'host-regex' ||
      condition.type === 'url-wildcard' ||
      condition.type === 'url-regex' ||
      condition.type === 'keyword') &&
    validateCondition(condition).ok
  );
}

function isCurrentSiteScope(value: unknown): value is CurrentSiteScope {
  return value === 'page' || value === 'host' || value === 'domain';
}

function isQuickRuleEntries(value: unknown): value is readonly QuickRuleEntry[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 50 &&
    value.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        !Array.isArray(entry) &&
        isQuickRuleCondition((entry as QuickRuleEntry).condition) &&
        isNonEmptyString((entry as QuickRuleEntry).host) &&
        isCurrentSiteScope((entry as QuickRuleEntry).scope)
    )
  );
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

function isNetworkTabId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= -1;
}

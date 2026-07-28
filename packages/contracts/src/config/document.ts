import { validateCondition } from './condition-validation.ts';
import type { RuleConditionV2, SwitchRuleV2 } from './conditions.ts';
import {
  isProfileKind,
  isProxyServer,
  type AutoDetectProfileV2,
  type AutoSwitchProfileV2,
  type DirectProfileV2,
  type FixedProxyProfileV2,
  type PacProfileV2,
  type ProfileBaseV2,
  type ProfileV2,
  type ProxyRoutes,
  type ProxyServer,
  type RuleListProfileV2,
  type SystemProfileV2,
  type VirtualProfileV2
} from './profiles.ts';
import {
  isRuleListFormat,
  isSourceRequestHeader,
  type InlineSource,
  type PacSource,
  type RefreshPolicy,
  type RuleListSource,
  type UrlSource
} from './sources.ts';
import { isProfileTarget, type ProfileTarget } from './targets.ts';
import { validateProfileDocumentV2 } from './validate.ts';

export interface RuntimeSettingsV2 {
  startupProfileId: string;
  reloadAfterProfileChange: boolean;
  ruleInsertPosition: 'first' | 'last';
  networkMonitor: { enabled: boolean };
  shortcutProfileIds?: readonly string[];
}

export interface ProfileDocumentV2 {
  schemaVersion: 2;
  activeProfileId: string;
  profiles: readonly ProfileV2[];
  proxyServers: readonly ProxyServer[];
  ruleSources: readonly RuleListSource[];
  settings: RuntimeSettingsV2;
}

export type ProfileDocumentV2IssueCode =
  | 'invalid-document'
  | 'invalid-profile'
  | 'invalid-proxy-server'
  | 'invalid-rule-source'
  | 'invalid-settings'
  | 'duplicate-profile-id'
  | 'duplicate-proxy-id'
  | 'duplicate-source-id'
  | 'missing-builtin-profile'
  | 'unknown-active-profile'
  | 'unknown-startup-profile'
  | 'unknown-shortcut-profile'
  | 'duplicate-shortcut-profile'
  | 'unknown-profile-reference'
  | 'unknown-proxy-reference'
  | 'unknown-source-reference'
  | 'profile-cycle';

export interface ProfileDocumentV2Issue {
  code: ProfileDocumentV2IssueCode;
  path: string;
}

export type ProfileDocumentV2ParseResult =
  { ok: true; value: ProfileDocumentV2 } | { ok: false; issues: readonly ProfileDocumentV2Issue[] };

export function defaultRuntimeSettings(): RuntimeSettingsV2 {
  return {
    startupProfileId: 'direct',
    reloadAfterProfileChange: false,
    ruleInsertPosition: 'last',
    networkMonitor: { enabled: false },
    shortcutProfileIds: []
  };
}

export function parseProfileDocumentV2(input: unknown): ProfileDocumentV2ParseResult {
  if (!isRecord(input) || input.schemaVersion !== 2 || !isNonEmptyString(input.activeProfileId)) {
    return invalidDocument();
  }

  if (
    !Array.isArray(input.profiles) ||
    !Array.isArray(input.proxyServers) ||
    !Array.isArray(input.ruleSources)
  ) {
    return invalidDocument();
  }

  const issues: ProfileDocumentV2Issue[] = [];
  const profiles = input.profiles.map((profile, index) => parseProfile(profile, index, issues));
  const proxyServers = input.proxyServers.map((proxy, index) =>
    parseProxyServer(proxy, index, issues)
  );
  const ruleSources = input.ruleSources.map((source, index) =>
    parseRuleSource(source, index, issues)
  );
  const settings = parseRuntimeSettings(input.settings, issues);

  if (
    issues.length > 0 ||
    profiles.some(isAbsent) ||
    proxyServers.some(isAbsent) ||
    ruleSources.some(isAbsent) ||
    !settings
  ) {
    return { ok: false, issues };
  }

  const document: ProfileDocumentV2 = {
    schemaVersion: 2,
    activeProfileId: input.activeProfileId.trim(),
    profiles: profiles.filter(isPresent),
    proxyServers: proxyServers.filter(isPresent),
    ruleSources: ruleSources.filter(isPresent),
    settings
  };
  const validationIssues = validateProfileDocumentV2(document);
  return validationIssues.length > 0
    ? { ok: false, issues: validationIssues }
    : { ok: true, value: document };
}

function parseProfile(
  input: unknown,
  index: number,
  issues: ProfileDocumentV2Issue[]
): ProfileV2 | undefined {
  const base = parseProfileBase(input, index, issues);
  if (!base || !isRecord(input)) {
    return undefined;
  }

  switch (base.kind) {
    case 'direct':
      return base as DirectProfileV2;
    case 'system':
      return base as SystemProfileV2;
    case 'fixed-proxy':
      return parseFixedProxyProfile(input, base, index, issues);
    case 'pac':
      return parsePacProfile(input, base, index, issues);
    case 'auto-detect':
      return base as AutoDetectProfileV2;
    case 'auto-switch':
      return parseAutoSwitchProfile(input, base, index, issues);
    case 'rule-list':
      return parseRuleListProfile(input, base, index, issues);
    case 'virtual':
      return parseVirtualProfile(input, base, index, issues);
  }
}

function parseProfileBase(
  input: unknown,
  index: number,
  issues: ProfileDocumentV2Issue[]
): ProfileBaseV2 | undefined {
  if (
    !isRecord(input) ||
    !isNonEmptyString(input.id) ||
    !isNonEmptyString(input.name) ||
    !isProfileKind(input.kind) ||
    !isOptionalString(input.color) ||
    !isOptionalString(input.note)
  ) {
    issues.push({ code: 'invalid-profile', path: `profiles[${index}]` });
    return undefined;
  }

  return {
    id: input.id.trim(),
    kind: input.kind,
    name: input.name.trim(),
    ...(input.color === undefined ? {} : { color: input.color }),
    ...(input.note === undefined ? {} : { note: input.note })
  };
}

function parseFixedProxyProfile(
  input: Record<string, unknown>,
  base: ProfileBaseV2,
  index: number,
  issues: ProfileDocumentV2Issue[]
): FixedProxyProfileV2 | undefined {
  const routes = parseProxyRoutes(input.routes);
  const bypassList = readStringArray(input.bypassList);
  if (!routes || !bypassList) {
    issues.push({ code: 'invalid-profile', path: `profiles[${index}]` });
    return undefined;
  }

  return { ...base, kind: 'fixed-proxy', routes, bypassList };
}

function parsePacProfile(
  input: Record<string, unknown>,
  base: ProfileBaseV2,
  index: number,
  issues: ProfileDocumentV2Issue[]
): PacProfileV2 | undefined {
  const source = parseSource(input.source);
  if (!source) {
    issues.push({ code: 'invalid-profile', path: `profiles[${index}].source` });
    return undefined;
  }

  return { ...base, kind: 'pac', source };
}

function parseAutoSwitchProfile(
  input: Record<string, unknown>,
  base: ProfileBaseV2,
  index: number,
  issues: ProfileDocumentV2Issue[]
): AutoSwitchProfileV2 | undefined {
  const fallback = input.fallback;
  const rules = parseSwitchRules(input.rules, index, issues);
  const ruleSourceIds = readStringArray(input.ruleSourceIds);
  if (
    !isProfileTarget(fallback) ||
    !rules ||
    !ruleSourceIds ||
    !isLoopbackPolicy(input.loopbackPolicy) ||
    !isProxyFailurePolicy(input.proxyFailurePolicy)
  ) {
    issues.push({ code: 'invalid-profile', path: `profiles[${index}]` });
    return undefined;
  }

  return {
    ...base,
    kind: 'auto-switch',
    fallback,
    loopbackPolicy: input.loopbackPolicy,
    proxyFailurePolicy: input.proxyFailurePolicy,
    rules,
    ruleSourceIds
  };
}

function parseRuleListProfile(
  input: Record<string, unknown>,
  base: ProfileBaseV2,
  index: number,
  issues: ProfileDocumentV2Issue[]
): RuleListProfileV2 | undefined {
  if (
    !isNonEmptyString(input.sourceId) ||
    !isProfileTarget(input.matchTarget) ||
    !isProfileTarget(input.fallback)
  ) {
    issues.push({ code: 'invalid-profile', path: `profiles[${index}]` });
    return undefined;
  }

  return {
    ...base,
    kind: 'rule-list',
    sourceId: input.sourceId.trim(),
    matchTarget: input.matchTarget,
    fallback: input.fallback
  };
}

function parseVirtualProfile(
  input: Record<string, unknown>,
  base: ProfileBaseV2,
  index: number,
  issues: ProfileDocumentV2Issue[]
): VirtualProfileV2 | undefined {
  if (!isProfileTarget(input.target)) {
    issues.push({ code: 'invalid-profile', path: `profiles[${index}]` });
    return undefined;
  }

  return { ...base, kind: 'virtual', target: input.target };
}

function parseProxyServer(
  input: unknown,
  index: number,
  issues: ProfileDocumentV2Issue[]
): ProxyServer | undefined {
  if (!isProxyServer(input)) {
    issues.push({ code: 'invalid-proxy-server', path: `proxyServers[${index}]` });
    return undefined;
  }

  return input;
}

function parseRuleSource(
  input: unknown,
  index: number,
  issues: ProfileDocumentV2Issue[]
): RuleListSource | undefined {
  if (
    !isRecord(input) ||
    !isNonEmptyString(input.id) ||
    !isNonEmptyString(input.name) ||
    !isRuleListFormat(input.format)
  ) {
    issues.push({ code: 'invalid-rule-source', path: `ruleSources[${index}]` });
    return undefined;
  }

  const source = parseSource(input.source);
  if (!source) {
    issues.push({ code: 'invalid-rule-source', path: `ruleSources[${index}].source` });
    return undefined;
  }

  return {
    id: input.id.trim(),
    name: input.name.trim(),
    format: input.format,
    source
  };
}

function parseSource(input: unknown): PacSource | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  if (input.kind === 'inline' && typeof input.text === 'string') {
    return { kind: 'inline', text: input.text } satisfies InlineSource;
  }

  if (
    input.kind === 'url' &&
    isNonEmptyString(input.url) &&
    Array.isArray(input.headers) &&
    input.headers.every(isSourceRequestHeader) &&
    isRefreshPolicy(input.refresh)
  ) {
    return {
      kind: 'url',
      url: input.url.trim(),
      headers: input.headers,
      refresh: input.refresh
    } satisfies UrlSource;
  }

  return undefined;
}

function parseSwitchRules(
  input: unknown,
  profileIndex: number,
  issues: ProfileDocumentV2Issue[]
): readonly SwitchRuleV2[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }

  const rules = input.map((rule, ruleIndex) =>
    parseSwitchRule(rule, profileIndex, ruleIndex, issues)
  );
  return rules.some(isAbsent) ? undefined : rules.filter(isPresent);
}

function parseSwitchRule(
  input: unknown,
  profileIndex: number,
  ruleIndex: number,
  issues: ProfileDocumentV2Issue[]
): SwitchRuleV2 | undefined {
  if (
    !isRecord(input) ||
    !isNonEmptyString(input.id) ||
    typeof input.enabled !== 'boolean' ||
    !isProfileTarget(input.target) ||
    !validateCondition(input.condition).ok
  ) {
    issues.push({ code: 'invalid-profile', path: `profiles[${profileIndex}].rules[${ruleIndex}]` });
    return undefined;
  }

  return {
    id: input.id.trim(),
    enabled: input.enabled,
    condition: input.condition as RuleConditionV2,
    target: input.target
  };
}

function parseProxyRoutes(input: unknown): ProxyRoutes | undefined {
  if (!isRecord(input) || !isNonEmptyString(input.fallbackProxyId)) {
    return undefined;
  }

  const httpProxyId = normalizeOptionalId(input.httpProxyId);
  const httpsProxyId = normalizeOptionalId(input.httpsProxyId);
  const ftpProxyId = normalizeOptionalId(input.ftpProxyId);
  if (httpProxyId === null || httpsProxyId === null || ftpProxyId === null) {
    return undefined;
  }

  return {
    fallbackProxyId: input.fallbackProxyId.trim(),
    ...(httpProxyId === undefined ? {} : { httpProxyId }),
    ...(httpsProxyId === undefined ? {} : { httpsProxyId }),
    ...(ftpProxyId === undefined ? {} : { ftpProxyId })
  };
}

function parseRuntimeSettings(
  input: unknown,
  issues: ProfileDocumentV2Issue[]
): RuntimeSettingsV2 | undefined {
  const shortcutProfileIds = parseOptionalStringArray(
    isRecord(input) ? input.shortcutProfileIds : undefined
  );
  if (
    !isRecord(input) ||
    !isNonEmptyString(input.startupProfileId) ||
    typeof input.reloadAfterProfileChange !== 'boolean' ||
    !isRuleInsertPosition(input.ruleInsertPosition) ||
    !isRecord(input.networkMonitor) ||
    typeof input.networkMonitor.enabled !== 'boolean' ||
    shortcutProfileIds === null
  ) {
    issues.push({ code: 'invalid-settings', path: 'settings' });
    return undefined;
  }

  return {
    startupProfileId: input.startupProfileId.trim(),
    reloadAfterProfileChange: input.reloadAfterProfileChange,
    ruleInsertPosition: input.ruleInsertPosition,
    networkMonitor: { enabled: input.networkMonitor.enabled },
    ...(shortcutProfileIds === undefined ? {} : { shortcutProfileIds })
  };
}

function isRefreshPolicy(value: unknown): value is RefreshPolicy {
  return (
    isRecord(value) &&
    typeof value.enabled === 'boolean' &&
    typeof value.refreshMinutes === 'number' &&
    Number.isInteger(value.refreshMinutes) &&
    value.refreshMinutes >= 1
  );
}

function isRuleInsertPosition(value: unknown): value is RuntimeSettingsV2['ruleInsertPosition'] {
  return value === 'first' || value === 'last';
}

function isLoopbackPolicy(value: unknown): value is AutoSwitchProfileV2['loopbackPolicy'] {
  return value === 'direct' || value === 'use-rules';
}

function isProxyFailurePolicy(value: unknown): value is AutoSwitchProfileV2['proxyFailurePolicy'] {
  return value === 'direct' || value === 'block';
}

function readStringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every(isNonEmptyString)
    ? value.map((entry) => entry.trim())
    : undefined;
}

function parseOptionalStringArray(value: unknown): readonly string[] | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  return readStringArray(value) ?? null;
}

function normalizeOptionalId(value: unknown): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  return isNonEmptyString(value) ? value.trim() : null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbsent<T>(value: T | undefined): value is undefined {
  return value === undefined;
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function invalidDocument(): ProfileDocumentV2ParseResult {
  return { ok: false, issues: [{ code: 'invalid-document', path: '' }] };
}

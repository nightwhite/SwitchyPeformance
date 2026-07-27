export type ProxyScheme = 'http' | 'https' | 'socks4' | 'socks5';

export type RouteTarget =
  { kind: 'direct' } | { kind: 'system' } | { kind: 'proxy'; proxyId: string };

export interface ProxyEndpoint {
  id: string;
  name: string;
  scheme: ProxyScheme;
  host: string;
  port: number;
  bypassList?: readonly string[];
  credentialId?: string;
}

export interface DirectProfile {
  id: string;
  kind: 'direct';
  name: string;
}

export interface AutoSwitchProfile {
  id: string;
  kind: 'auto-switch';
  name: string;
  fallback: RouteTarget;
  loopbackPolicy: 'direct' | 'use-rules';
  proxyFailurePolicy: 'direct' | 'block';
  rules: readonly Rule[];
}

export interface SystemProfile {
  id: string;
  kind: 'system';
  name: string;
}

export interface FixedProxyProfile {
  id: string;
  kind: 'fixed-proxy';
  name: string;
  proxyId: string;
}

export type RuleCondition =
  | { type: 'host-equals'; value: string }
  | { type: 'host-suffix'; value: string }
  | { type: 'url-glob'; value: string };

export interface Rule {
  id: string;
  enabled: boolean;
  condition: RuleCondition;
  target: RouteTarget;
}

export type Profile = DirectProfile | SystemProfile | FixedProxyProfile | AutoSwitchProfile;

export interface ProfileDocument {
  schemaVersion: 1;
  activeProfileId: string;
  profiles: readonly Profile[];
  proxies: readonly ProxyEndpoint[];
  credentials: Record<string, never>;
}

export interface ProfileDocumentIssue {
  code:
    | 'invalid-document'
    | 'invalid-profile'
    | 'invalid-proxy-port'
    | 'unknown-active-profile'
    | 'unknown-proxy-reference';
  path: string;
}

export type ProfileDocumentParseResult =
  { ok: true; value: ProfileDocument } | { ok: false; issues: readonly ProfileDocumentIssue[] };

export function parseProfileDocument(input: unknown): ProfileDocumentParseResult {
  if (!isRecord(input)) {
    return invalidDocument();
  }

  const schemaVersion = input.schemaVersion;
  const activeProfileId = input.activeProfileId;
  const rawProfiles = input.profiles;
  const rawProxies = input.proxies;

  if (
    schemaVersion !== 1 ||
    !isNonEmptyString(activeProfileId) ||
    !Array.isArray(rawProfiles) ||
    !Array.isArray(rawProxies)
  ) {
    return invalidDocument();
  }

  const issues: ProfileDocumentIssue[] = [];
  const profiles = rawProfiles.map((profile, index) => parseProfile(profile, index, issues));
  const proxies = rawProxies.map((proxy, index) => parseProxy(proxy, index, issues));

  if (issues.length > 0 || profiles.some(isAbsent) || proxies.some(isAbsent)) {
    return { ok: false, issues };
  }

  const validProfiles = profiles.filter(isPresent);
  const validProxies = proxies.filter(isPresent);
  validateReferences(activeProfileId, validProfiles, validProxies, issues);
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      schemaVersion,
      activeProfileId,
      profiles: validProfiles,
      proxies: validProxies,
      credentials: {}
    }
  };
}

function validateReferences(
  activeProfileId: string,
  profiles: readonly Profile[],
  proxies: readonly ProxyEndpoint[],
  issues: ProfileDocumentIssue[]
): void {
  const proxyIds = new Set(proxies.map((proxy) => proxy.id));

  if (!profiles.some((profile) => profile.id === activeProfileId)) {
    issues.push({ code: 'unknown-active-profile', path: 'activeProfileId' });
  }

  for (const [index, profile] of profiles.entries()) {
    if (profile.kind === 'fixed-proxy') {
      validateProxyReference(profile.proxyId, `profiles[${index}].proxyId`, proxyIds, issues);
      continue;
    }
    if (profile.kind === 'auto-switch') {
      validateTargetReference(profile.fallback, `profiles[${index}].fallback`, proxyIds, issues);
      for (const [ruleIndex, rule] of profile.rules.entries()) {
        validateTargetReference(
          rule.target,
          `profiles[${index}].rules[${ruleIndex}].target`,
          proxyIds,
          issues
        );
      }
    }
  }
}

function validateTargetReference(
  target: RouteTarget,
  path: string,
  proxyIds: ReadonlySet<string>,
  issues: ProfileDocumentIssue[]
): void {
  if (target.kind === 'proxy') {
    validateProxyReference(target.proxyId, path, proxyIds, issues);
  }
}

function validateProxyReference(
  proxyId: string,
  path: string,
  proxyIds: ReadonlySet<string>,
  issues: ProfileDocumentIssue[]
): void {
  if (!proxyIds.has(proxyId)) {
    issues.push({ code: 'unknown-proxy-reference', path });
  }
}

function parseProfile(
  input: unknown,
  index: number,
  issues: ProfileDocumentIssue[]
): Profile | undefined {
  if (!isRecord(input) || !isNonEmptyString(input.id) || !isNonEmptyString(input.name)) {
    issues.push({ code: 'invalid-profile', path: `profiles[${index}]` });
    return undefined;
  }

  if (input.kind === 'direct') {
    return { id: input.id, kind: 'direct', name: input.name };
  }

  if (input.kind === 'system') {
    return { id: input.id, kind: 'system', name: input.name };
  }

  if (input.kind === 'fixed-proxy' && isNonEmptyString(input.proxyId)) {
    return { id: input.id, kind: 'fixed-proxy', name: input.name, proxyId: input.proxyId };
  }

  if (
    input.kind === 'auto-switch' &&
    isRouteTarget(input.fallback) &&
    Array.isArray(input.rules) &&
    input.rules.every(isRule) &&
    (input.loopbackPolicy === undefined || isLoopbackPolicy(input.loopbackPolicy)) &&
    (input.proxyFailurePolicy === undefined || isProxyFailurePolicy(input.proxyFailurePolicy))
  ) {
    return {
      id: input.id,
      kind: 'auto-switch',
      name: input.name,
      fallback: input.fallback,
      loopbackPolicy: input.loopbackPolicy ?? 'direct',
      proxyFailurePolicy: input.proxyFailurePolicy ?? 'direct',
      rules: input.rules
    };
  }

  issues.push({ code: 'invalid-profile', path: `profiles[${index}]` });
  return undefined;
}

function parseProxy(
  input: unknown,
  index: number,
  issues: ProfileDocumentIssue[]
): ProxyEndpoint | undefined {
  if (!isRecord(input)) {
    issues.push({ code: 'invalid-profile', path: `proxies[${index}]` });
    return undefined;
  }

  if (!isPort(input.port)) {
    issues.push({ code: 'invalid-proxy-port', path: `proxies[${index}].port` });
    return undefined;
  }

  if (
    !isNonEmptyString(input.id) ||
    !isNonEmptyString(input.name) ||
    !isNonEmptyString(input.host) ||
    !isProxyScheme(input.scheme) ||
    (input.credentialId !== undefined && !isNonEmptyString(input.credentialId))
  ) {
    issues.push({ code: 'invalid-profile', path: `proxies[${index}]` });
    return undefined;
  }

  const bypassList = Array.isArray(input.bypassList)
    ? input.bypassList.filter((value): value is string => typeof value === 'string')
    : undefined;

  return {
    id: input.id,
    name: input.name,
    scheme: input.scheme,
    host: input.host,
    port: input.port,
    ...(bypassList === undefined ? {} : { bypassList }),
    ...(input.credentialId === undefined ? {} : { credentialId: input.credentialId })
  };
}

function invalidDocument(): ProfileDocumentParseResult {
  return { ok: false, issues: [{ code: 'invalid-document', path: '' }] };
}

function isRouteTarget(input: unknown): input is RouteTarget {
  if (!isRecord(input)) {
    return false;
  }

  if (input.kind === 'direct' || input.kind === 'system') {
    return true;
  }

  return input.kind === 'proxy' && isNonEmptyString(input.proxyId);
}

function isRule(input: unknown): input is Rule {
  return (
    isRecord(input) &&
    isNonEmptyString(input.id) &&
    typeof input.enabled === 'boolean' &&
    isRuleCondition(input.condition) &&
    isRouteTarget(input.target)
  );
}

function isRuleCondition(input: unknown): input is RuleCondition {
  return (
    isRecord(input) &&
    isNonEmptyString(input.value) &&
    (input.type === 'host-equals' || input.type === 'host-suffix' || input.type === 'url-glob')
  );
}

function isLoopbackPolicy(input: unknown): input is AutoSwitchProfile['loopbackPolicy'] {
  return input === 'direct' || input === 'use-rules';
}

function isProxyFailurePolicy(input: unknown): input is AutoSwitchProfile['proxyFailurePolicy'] {
  return input === 'direct' || input === 'block';
}

function isProxyScheme(input: unknown): input is ProxyScheme {
  return input === 'http' || input === 'https' || input === 'socks4' || input === 'socks5';
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === 'string' && input.trim().length > 0;
}

function isPort(input: unknown): input is number {
  return typeof input === 'number' && Number.isInteger(input) && input >= 1 && input <= 65535;
}

function isAbsent<T>(input: T | undefined): input is undefined {
  return input === undefined;
}

function isPresent<T>(input: T | undefined): input is T {
  return input !== undefined;
}

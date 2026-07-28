import { isProfileKind, type ProfileKind, type RouteTarget } from '@switchypeformance/contracts';

export type RouteExplanationReason =
  'fixed-profile' | 'indexed-rule' | 'complex-rule' | 'loopback-default' | 'profile-default';

export interface RouteExplanation {
  route: RouteTarget;
  matchedRuleId?: string;
  reason: RouteExplanationReason;
}

export type V2RouteExplanationReason =
  | 'indexed-rule'
  | 'complex-rule'
  | 'browser-loopback-direct'
  | 'profile-default'
  | 'requires-pac-dns'
  | 'fixed-profile';

export type V2RouteWarning =
  | 'requires-pac-dns'
  | 'pac-url-may-be-sanitized'
  | 'unsupported-regex'
  | 'chrome-loopback-direct'
  | 'unsupported-auto-switch-target'
  | 'rule-list-not-applied';

export interface V2RouteExplanationMetrics {
  indexedRuleCount: number;
  complexRuleCount: number;
  indexBlockCount: number;
  dnsSensitiveRuleCount: number;
}

export interface V2RouteExplanation {
  activeProfileId: string;
  activeResolvedProfileId: string;
  routeProfileId?: string;
  resolvedRouteProfileId?: string;
  routeKind: ProfileKind;
  matchedRuleId?: string;
  pendingRuleId?: string;
  reason: V2RouteExplanationReason;
  definitive: boolean;
  warnings: readonly V2RouteWarning[];
  metrics: V2RouteExplanationMetrics;
}

export function parseRouteExplanation(rawResult: string): RouteExplanation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResult);
  } catch {
    throw new Error('WASM 路由结果无效');
  }
  if (!isRouteExplanation(parsed)) {
    throw new Error('WASM 路由结果无效');
  }
  return {
    route: parsed.route,
    reason: parsed.reason,
    ...(parsed.matchedRuleId === null ? {} : { matchedRuleId: parsed.matchedRuleId })
  };
}

export function parseV2RouteExplanation(rawResult: string): V2RouteExplanation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResult);
  } catch {
    throw new Error('WASM V2 路由结果无效');
  }
  if (!isV2RouteExplanation(parsed)) {
    throw new Error('WASM V2 路由结果无效');
  }
  return {
    activeProfileId: parsed.activeProfileId,
    activeResolvedProfileId: parsed.activeResolvedProfileId,
    ...(parsed.routeProfileId === null ? {} : { routeProfileId: parsed.routeProfileId }),
    ...(parsed.resolvedRouteProfileId === null
      ? {}
      : { resolvedRouteProfileId: parsed.resolvedRouteProfileId }),
    routeKind: parsed.routeKind,
    ...(parsed.matchedRuleId === null ? {} : { matchedRuleId: parsed.matchedRuleId }),
    ...(parsed.pendingRuleId === null ? {} : { pendingRuleId: parsed.pendingRuleId }),
    reason: parsed.reason,
    definitive: parsed.definitive,
    warnings: parsed.warnings,
    metrics: parsed.metrics
  };
}

function isRouteExplanation(input: unknown): input is {
  route: RouteTarget;
  matchedRuleId: string | null;
  reason: RouteExplanationReason;
} {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false;
  }
  const explanation = input as {
    route?: unknown;
    matchedRuleId?: unknown;
    reason?: unknown;
  };
  return (
    isRouteTarget(explanation.route) &&
    (typeof explanation.matchedRuleId === 'string' || explanation.matchedRuleId === null) &&
    (explanation.reason === 'fixed-profile' ||
      explanation.reason === 'indexed-rule' ||
      explanation.reason === 'complex-rule' ||
      explanation.reason === 'loopback-default' ||
      explanation.reason === 'profile-default')
  );
}

function isV2RouteExplanation(input: unknown): input is {
  activeProfileId: string;
  activeResolvedProfileId: string;
  routeProfileId: string | null;
  resolvedRouteProfileId: string | null;
  routeKind: ProfileKind;
  matchedRuleId: string | null;
  pendingRuleId: string | null;
  reason: V2RouteExplanationReason;
  definitive: boolean;
  warnings: V2RouteWarning[];
  metrics: V2RouteExplanationMetrics;
} {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false;
  }
  const explanation = input as {
    activeProfileId?: unknown;
    activeResolvedProfileId?: unknown;
    routeProfileId?: unknown;
    resolvedRouteProfileId?: unknown;
    routeKind?: unknown;
    matchedRuleId?: unknown;
    pendingRuleId?: unknown;
    reason?: unknown;
    definitive?: unknown;
    warnings?: unknown;
    metrics?: unknown;
  };
  return (
    isNonEmptyString(explanation.activeProfileId) &&
    isNonEmptyString(explanation.activeResolvedProfileId) &&
    isNullableNonEmptyString(explanation.routeProfileId) &&
    isNullableNonEmptyString(explanation.resolvedRouteProfileId) &&
    isProfileKind(explanation.routeKind) &&
    isNullableNonEmptyString(explanation.matchedRuleId) &&
    isNullableNonEmptyString(explanation.pendingRuleId) &&
    !(
      typeof explanation.matchedRuleId === 'string' && typeof explanation.pendingRuleId === 'string'
    ) &&
    isV2RouteExplanationReason(explanation.reason) &&
    typeof explanation.definitive === 'boolean' &&
    Array.isArray(explanation.warnings) &&
    explanation.warnings.every(isV2RouteWarning) &&
    isV2RouteExplanationMetrics(explanation.metrics)
  );
}

function isV2RouteExplanationReason(value: unknown): value is V2RouteExplanationReason {
  return (
    value === 'indexed-rule' ||
    value === 'complex-rule' ||
    value === 'browser-loopback-direct' ||
    value === 'profile-default' ||
    value === 'requires-pac-dns' ||
    value === 'fixed-profile'
  );
}

function isV2RouteWarning(value: unknown): value is V2RouteWarning {
  return (
    value === 'requires-pac-dns' ||
    value === 'pac-url-may-be-sanitized' ||
    value === 'unsupported-regex' ||
    value === 'chrome-loopback-direct' ||
    value === 'unsupported-auto-switch-target' ||
    value === 'rule-list-not-applied'
  );
}

function isV2RouteExplanationMetrics(value: unknown): value is V2RouteExplanationMetrics {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const metrics = value as {
    indexedRuleCount?: unknown;
    complexRuleCount?: unknown;
    indexBlockCount?: unknown;
    dnsSensitiveRuleCount?: unknown;
  };
  return (
    isNonNegativeInteger(metrics.indexedRuleCount) &&
    isNonNegativeInteger(metrics.complexRuleCount) &&
    isNonNegativeInteger(metrics.indexBlockCount) &&
    isNonNegativeInteger(metrics.dnsSensitiveRuleCount)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRouteTarget(input: unknown): input is RouteTarget {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false;
  }
  const target = input as { kind?: unknown; proxyId?: unknown };
  return (
    target.kind === 'direct' ||
    target.kind === 'system' ||
    (target.kind === 'proxy' && typeof target.proxyId === 'string' && target.proxyId.length > 0)
  );
}

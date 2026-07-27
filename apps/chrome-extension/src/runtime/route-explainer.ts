import type { RouteTarget } from '@switchypeformance/contracts';

export type RouteExplanationReason =
  'fixed-profile' | 'indexed-rule' | 'complex-rule' | 'loopback-default' | 'profile-default';

export interface RouteExplanation {
  route: RouteTarget;
  matchedRuleId?: string;
  reason: RouteExplanationReason;
}

export function parseRouteExplanation(rawResult: string): RouteExplanation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResult);
  } catch {
    throw new Error('WASM route explanation is invalid');
  }
  if (!isRouteExplanation(parsed)) {
    throw new Error('WASM route explanation is invalid');
  }
  return {
    route: parsed.route,
    reason: parsed.reason,
    ...(parsed.matchedRuleId === null ? {} : { matchedRuleId: parsed.matchedRuleId })
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

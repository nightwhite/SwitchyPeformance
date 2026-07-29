import type { NetworkEvent } from '../../runtime/network-event-repository.ts';

export type FailureAction =
  | 'add-proxy-rule'
  | 'add-direct-rule'
  | 'add-temporary-proxy-rule'
  | 'add-temporary-direct-rule'
  | 'inspect-route';

export interface FailureRemediationInput {
  error: string;
  host: string;
}

export interface FailureRemediationOption {
  action: FailureAction;
  label: string;
}

export interface FailureRemediationView {
  loopbackNotice?: string;
  options: readonly FailureRemediationOption[];
}

export interface FailureResource {
  error: string;
  host: string;
  key: string;
  timestamp: number;
  url: string;
}

export interface FailureDiagnosticEvent {
  detail?: string;
  message?: string;
  scope: string;
  tabId?: number;
  target?: string;
  timestamp: number;
}

const LOOPBACK_NOTICE = 'localhost 和本地回环地址通常由 Chrome 强制直连，请先查看路由判断。';

const PROXY_CONNECTION_ERRORS = new Set([
  'net::ERR_PROXY_AUTH_REQUESTED',
  'net::ERR_PROXY_CERTIFICATE_INVALID',
  'net::ERR_PROXY_CONNECTION_FAILED',
  'net::ERR_SOCKS_CONNECTION_FAILED',
  'net::ERR_TUNNEL_CONNECTION_FAILED'
]);

const DIRECT_RULE: FailureRemediationOption = {
  action: 'add-direct-rule',
  label: '将此域名设为直连'
};

const INSPECT_ROUTE: FailureRemediationOption = {
  action: 'inspect-route',
  label: '查看路由判断'
};

const PROXY_RULE: FailureRemediationOption = {
  action: 'add-proxy-rule',
  label: '将此域名设为代理'
};

const TEMPORARY_DIRECT_RULE: FailureRemediationOption = {
  action: 'add-temporary-direct-rule',
  label: '临时设为直连'
};

const TEMPORARY_PROXY_RULE: FailureRemediationOption = {
  action: 'add-temporary-proxy-rule',
  label: '临时设为代理'
};

export function remediationOptions(
  input: FailureRemediationInput
): readonly FailureRemediationOption[] {
  if (isLoopbackHost(input.host)) {
    return [INSPECT_ROUTE, DIRECT_RULE, TEMPORARY_DIRECT_RULE, PROXY_RULE, TEMPORARY_PROXY_RULE];
  }
  if (PROXY_CONNECTION_ERRORS.has(input.error)) {
    return [DIRECT_RULE, INSPECT_ROUTE, PROXY_RULE, TEMPORARY_DIRECT_RULE, TEMPORARY_PROXY_RULE];
  }
  return [INSPECT_ROUTE, PROXY_RULE, DIRECT_RULE, TEMPORARY_PROXY_RULE, TEMPORARY_DIRECT_RULE];
}

export function remediationView(input: FailureRemediationInput): FailureRemediationView {
  return {
    options: remediationOptions(input),
    ...(isLoopbackHost(input.host) ? { loopbackNotice: LOOPBACK_NOTICE } : {})
  };
}

export function recentNetworkFailures(
  events: readonly NetworkEvent[],
  limit = 6
): readonly FailureResource[] {
  return recentFailures(
    events
      .filter((event) => event.phase === 'failed' && event.error !== undefined)
      .map((event) => ({
        error: event.error as string,
        timestamp: event.timestamp,
        url: event.url
      })),
    limit
  );
}

export function recentDiagnosticFailures(
  events: readonly FailureDiagnosticEvent[],
  limit = 6,
  tabId?: number
): readonly FailureResource[] {
  return recentFailures(
    events
      .filter(
        (event) =>
          event.scope === 'network' &&
          event.target !== undefined &&
          (tabId === undefined || event.tabId === tabId)
      )
      .map((event) => ({
        error: event.detail ?? event.message ?? '网络请求失败',
        timestamp: event.timestamp,
        url: event.target as string
      })),
    limit
  );
}

function recentFailures(
  candidates: readonly { error: string; timestamp: number; url: string }[],
  limit: number
): readonly FailureResource[] {
  const failures: FailureResource[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates.slice().reverse()) {
    const host = hostFromUrl(candidate.url);
    if (!host) {
      continue;
    }
    const key = `${host}\u0000${candidate.error}`;
    if (seen.has(key)) {
      continue;
    }
    failures.push({
      error: candidate.error,
      host,
      key,
      timestamp: candidate.timestamp,
      url: candidate.url
    });
    seen.add(key);
    if (failures.length >= Math.max(1, limit)) {
      break;
    }
  }
  return failures;
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::1' ||
    normalized.startsWith('127.')
  );
}

function hostFromUrl(value: string): string | undefined {
  try {
    return new URL(value).hostname || undefined;
  } catch {
    return undefined;
  }
}

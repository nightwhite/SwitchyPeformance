import type { NetworkEvent, NetworkEventRepository } from './network-event-repository.ts';

export interface NetworkRequestDetails {
  error?: string;
  requestId: string;
  statusCode?: number;
  tabId: number;
  timestamp?: number;
  url: string;
}

export interface NetworkMonitorDependencies {
  clock?: () => number;
  dedupeWindowMs?: number;
  enabled?: boolean;
  maxRememberedFailures?: number;
  repository: Pick<NetworkEventRepository, 'append'>;
}

export interface NetworkMonitor {
  isEnabled(): boolean;
  onCompleted(details: NetworkRequestDetails): Promise<void> | undefined;
  onFailed(details: NetworkRequestDetails): Promise<void> | undefined;
  onHeaders(details: NetworkRequestDetails): Promise<void> | undefined;
  onRedirected(details: NetworkRequestDetails): Promise<void> | undefined;
  onStarted(details: NetworkRequestDetails): Promise<void> | undefined;
  setEnabled(enabled: boolean): void;
}

const SAFE_QUERY_PARAMETERS = new Set([
  'format',
  'lang',
  'limit',
  'locale',
  'offset',
  'page',
  'page_size',
  'version'
]);

export function createNetworkMonitor(dependencies: NetworkMonitorDependencies): NetworkMonitor {
  const clock = dependencies.clock ?? Date.now;
  const dedupeWindowMs = Math.max(0, dependencies.dedupeWindowMs ?? 60_000);
  const maxRememberedFailures = Math.max(1, dependencies.maxRememberedFailures ?? 512);
  const recentFailures = new Map<string, number>();
  let enabled = dependencies.enabled ?? false;

  return {
    isEnabled: () => enabled,
    onCompleted: (details) => record('completed', details),
    onFailed: (details) => record('failed', details),
    onHeaders: (details) => record('headers', details),
    onRedirected: (details) => record('redirected', details),
    onStarted: (details) => record('started', details),
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      if (!enabled) {
        recentFailures.clear();
      }
    }
  };

  function record(
    phase: NetworkEvent['phase'],
    details: NetworkRequestDetails
  ): Promise<void> | undefined {
    if (!enabled || !isRequestDetails(details)) {
      return;
    }
    if (phase === 'failed' && details.error === 'net::ERR_ABORTED') {
      return;
    }
    if (phase === 'failed' && details.error === undefined) {
      return;
    }

    const event = eventFromDetails(phase, details, clock());
    if (phase === 'failed' && shouldFoldFailure(event)) {
      return;
    }
    return dependencies.repository.append(event).then(() => undefined);
  }

  function shouldFoldFailure(event: NetworkEvent): boolean {
    const key = failureKey(event);
    const now = clock();
    const previous = recentFailures.get(key);
    if (previous !== undefined && now - previous < dedupeWindowMs) {
      return true;
    }
    if (recentFailures.size >= maxRememberedFailures) {
      const oldest = recentFailures.keys().next().value;
      if (oldest !== undefined) {
        recentFailures.delete(oldest);
      }
    }
    recentFailures.set(key, now);
    return false;
  }
}

export function sanitizeNetworkUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.username = '';
    url.password = '';
    const safeParameters = new URLSearchParams();
    for (const [name, value] of url.searchParams) {
      if (SAFE_QUERY_PARAMETERS.has(name.toLowerCase())) {
        safeParameters.append(name, value);
      }
    }
    url.search = safeParameters.toString();
    url.hash = '';
    return url.toString();
  } catch {
    return 'about:invalid#network-request';
  }
}

function eventFromDetails(
  phase: NetworkEvent['phase'],
  details: NetworkRequestDetails,
  fallbackTimestamp: number
): NetworkEvent {
  return {
    phase,
    requestId: details.requestId,
    tabId: details.tabId,
    timestamp: details.timestamp ?? fallbackTimestamp,
    url: sanitizeNetworkUrl(details.url),
    ...(details.statusCode === undefined ? {} : { statusCode: details.statusCode }),
    ...(phase !== 'failed' || details.error === undefined ? {} : { error: details.error })
  };
}

function failureKey(event: NetworkEvent): string {
  try {
    const url = new URL(event.url);
    return `${event.tabId}\u0000${url.protocol}//${url.host}${url.pathname}\u0000${event.error}`;
  } catch {
    return `${event.tabId}\u0000${event.url}\u0000${event.error}`;
  }
}

function isRequestDetails(value: NetworkRequestDetails): boolean {
  return (
    typeof value.requestId === 'string' &&
    value.requestId.trim().length > 0 &&
    Number.isInteger(value.tabId) &&
    typeof value.url === 'string' &&
    value.url.trim().length > 0 &&
    (value.timestamp === undefined || isTimestamp(value.timestamp)) &&
    (value.statusCode === undefined || isStatusCode(value.statusCode)) &&
    (value.error === undefined ||
      (typeof value.error === 'string' && value.error.trim().length > 0))
  );
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isStatusCode(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

import type { DiagnosticEvent } from './diagnostics-repository.ts';
import { sanitizeNetworkUrl } from './network-monitor.ts';

export interface NetworkFailure {
  url: string;
  error: string;
  tabId?: number;
}

export interface NetworkFailureRecorderOptions {
  clock?: () => number;
  dedupeWindowMs?: number;
  maxRememberedFailures?: number;
}

export interface NetworkFailureRecorder {
  record(failure: NetworkFailure): Promise<void>;
}

type NetworkFailureReport = Omit<DiagnosticEvent, 'id' | 'timestamp'>;

/**
 * Records request failures without observing successful requests. Repeated
 * resource failures are folded for a short interval so diagnostics stay useful.
 */
export function createNetworkFailureRecorder(
  report: (event: NetworkFailureReport) => Promise<unknown>,
  options: NetworkFailureRecorderOptions = {}
): NetworkFailureRecorder {
  const clock = options.clock ?? Date.now;
  const dedupeWindowMs = Math.max(0, options.dedupeWindowMs ?? 60_000);
  const maxRememberedFailures = Math.max(1, options.maxRememberedFailures ?? 512);
  const recentFailures = new Map<string, number>();

  return {
    async record(failure) {
      if (failure.error === 'net::ERR_ABORTED') {
        return;
      }
      const now = clock();
      const target = sanitizeNetworkUrl(failure.url);
      const key = failureKey(target, failure.error);
      const previous = recentFailures.get(key);
      if (previous !== undefined && now - previous < dedupeWindowMs) {
        return;
      }
      if (recentFailures.size >= maxRememberedFailures) {
        const oldest = recentFailures.keys().next().value;
        if (oldest) {
          recentFailures.delete(oldest);
        }
      }
      recentFailures.set(key, now);
      await report({
        level: 'error',
        scope: 'network',
        message: '网络请求失败',
        target,
        detail: failure.error,
        ...(failure.tabId === undefined ? {} : { tabId: failure.tabId })
      });
    }
  };
}

function failureKey(target: string, error: string): string {
  try {
    const url = new URL(target);
    return `${url.protocol}//${url.host}\u0000${error}`;
  } catch {
    return `${target}\u0000${error}`;
  }
}

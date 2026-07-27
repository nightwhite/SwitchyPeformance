import type { DiagnosticEvent } from './diagnostics-repository.ts';

export interface NetworkFailure {
  url: string;
  error: string;
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
      const key = failureKey(failure);
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
        message: 'Network request failed',
        target: failure.url,
        detail: failure.error
      });
    }
  };
}

function failureKey(failure: NetworkFailure): string {
  try {
    const url = new URL(failure.url);
    return `${url.protocol}//${url.host}${url.pathname}\u0000${failure.error}`;
  } catch {
    return `${failure.url}\u0000${failure.error}`;
  }
}

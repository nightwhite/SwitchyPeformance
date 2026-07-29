import { describe, expect, it, vi } from 'vitest';

import { createNetworkMonitor } from './network-monitor.ts';

describe('createNetworkMonitor', () => {
  it('does not write network events while collection is disabled', async () => {
    const append = vi.fn().mockResolvedValue([]);
    const monitor = createNetworkMonitor({
      enabled: false,
      repository: { append }
    });

    await monitor.onStarted({
      requestId: 'request-1',
      tabId: 12,
      timestamp: 1_000,
      url: 'https://x.example.test/home'
    });
    await monitor.onFailed({
      error: 'net::ERR_CONNECTION_TIMED_OUT',
      requestId: 'request-1',
      tabId: 12,
      timestamp: 1_010,
      url: 'https://x.example.test/home'
    });

    expect(append).not.toHaveBeenCalled();
  });

  it('records a sanitized timeline and folds repeated resource failures', async () => {
    const append = vi.fn().mockResolvedValue([]);
    let now = 10_000;
    const monitor = createNetworkMonitor({
      clock: () => now,
      dedupeWindowMs: 60_000,
      enabled: true,
      repository: { append }
    });
    const request = {
      requestId: 'request-2',
      tabId: 42,
      timestamp: 1_000,
      url: 'https://user:password@x.example.test/api?token=secret&page=2'
    };

    await monitor.onStarted(request);
    await monitor.onHeaders({ ...request, statusCode: 502, timestamp: 1_005 });
    await monitor.onFailed({
      ...request,
      error: 'net::ERR_CONNECTION_TIMED_OUT',
      timestamp: 1_010
    });
    now += 1;
    await monitor.onFailed({
      ...request,
      error: 'net::ERR_CONNECTION_TIMED_OUT',
      requestId: 'request-3',
      timestamp: 1_011,
      url: 'https://x.example.test/api?token=another-secret&page=2'
    });

    expect(append).toHaveBeenCalledTimes(3);
    expect(append).toHaveBeenNthCalledWith(1, {
      phase: 'started',
      requestId: 'request-2',
      tabId: 42,
      timestamp: 1_000,
      url: 'https://x.example.test/api?page=2'
    });
    expect(append).toHaveBeenLastCalledWith({
      error: 'net::ERR_CONNECTION_TIMED_OUT',
      phase: 'failed',
      requestId: 'request-2',
      tabId: 42,
      timestamp: 1_010,
      url: 'https://x.example.test/api?page=2'
    });
  });

  it('starts recording immediately after the setting is enabled', async () => {
    const append = vi.fn().mockResolvedValue([]);
    const monitor = createNetworkMonitor({ enabled: false, repository: { append } });

    expect(monitor.isEnabled()).toBe(false);
    monitor.setEnabled(true);
    expect(monitor.isEnabled()).toBe(true);
    await monitor.onCompleted({
      requestId: 'request-4',
      statusCode: 204,
      tabId: 7,
      timestamp: 2_000,
      url: 'https://x.example.test/ping'
    });

    expect(append).toHaveBeenCalledWith({
      phase: 'completed',
      requestId: 'request-4',
      statusCode: 204,
      tabId: 7,
      timestamp: 2_000,
      url: 'https://x.example.test/ping'
    });
  });
});

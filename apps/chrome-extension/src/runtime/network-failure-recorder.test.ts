import { describe, expect, it, vi } from 'vitest';

import { createNetworkFailureRecorder } from './network-failure-recorder.ts';

describe('createNetworkFailureRecorder', () => {
  it('records meaningful failures once per short interval and ignores cancelled work', async () => {
    const report = vi.fn().mockResolvedValue(undefined);
    let now = 10_000;
    const recorder = createNetworkFailureRecorder(report, {
      clock: () => now,
      dedupeWindowMs: 5_000
    });

    await recorder.record({
      error: 'net::ERR_CONNECTION_TIMED_OUT',
      tabId: 12,
      url: 'https://x.example.test/api?attempt=1'
    });
    await recorder.record({
      error: 'net::ERR_CONNECTION_TIMED_OUT',
      url: 'https://x.example.test/other-resource?attempt=2'
    });
    await recorder.record({ error: 'net::ERR_ABORTED', url: 'https://x.example.test/cancelled' });

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({
      detail: 'net::ERR_CONNECTION_TIMED_OUT',
      level: 'error',
      message: '网络请求失败',
      scope: 'network',
      tabId: 12,
      target: 'https://x.example.test/api'
    });

    now += 5_001;
    await recorder.record({
      error: 'net::ERR_CONNECTION_TIMED_OUT',
      url: 'https://x.example.test/api?attempt=3'
    });
    expect(report).toHaveBeenCalledTimes(2);
  });
});

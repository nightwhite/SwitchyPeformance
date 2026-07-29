import { describe, expect, it } from 'vitest';

import { summarizeTabNetworkEvents } from './tab-network-summary.ts';

describe('summarizeTabNetworkEvents', () => {
  it('groups request progress by tab and counts each terminal request once', () => {
    const summaries = summarizeTabNetworkEvents([
      {
        phase: 'started',
        requestId: 'first',
        tabId: 10,
        timestamp: 100,
        url: 'https://x.example.test/one'
      },
      {
        phase: 'completed',
        requestId: 'first',
        statusCode: 200,
        tabId: 10,
        timestamp: 120,
        url: 'https://x.example.test/one'
      },
      {
        error: 'net::ERR_PROXY_CONNECTION_FAILED',
        phase: 'failed',
        requestId: 'second',
        tabId: 10,
        timestamp: 130,
        url: 'https://x.example.test/two'
      },
      {
        phase: 'completed',
        requestId: 'third',
        statusCode: 204,
        tabId: 11,
        timestamp: 140,
        url: 'https://y.example.test/health'
      }
    ]);

    expect(summaries).toEqual([
      {
        completedRequestCount: 1,
        eventCount: 1,
        failedRequestCount: 0,
        lastActivityAt: 140,
        latestUrl: 'https://y.example.test/health',
        requestCount: 1,
        tabId: 11
      },
      {
        completedRequestCount: 1,
        eventCount: 3,
        failedRequestCount: 1,
        lastActivityAt: 130,
        latestUrl: 'https://x.example.test/two',
        requestCount: 2,
        tabId: 10
      }
    ]);
  });
});

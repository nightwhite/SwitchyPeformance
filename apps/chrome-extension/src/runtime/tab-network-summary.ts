import type { NetworkEvent } from './network-event-repository.ts';

export interface TabNetworkSummary {
  completedRequestCount: number;
  eventCount: number;
  failedRequestCount: number;
  lastActivityAt: number;
  latestUrl: string;
  requestCount: number;
  tabId: number;
}

interface MutableTabNetworkSummary {
  completedRequestIds: Set<string>;
  eventCount: number;
  failedRequestIds: Set<string>;
  lastActivityAt: number;
  latestUrl: string;
  requestIds: Set<string>;
  tabId: number;
}

export function summarizeTabNetworkEvents(
  events: readonly NetworkEvent[]
): readonly TabNetworkSummary[] {
  const summaries = new Map<number, MutableTabNetworkSummary>();
  for (const event of events) {
    const summary = summaries.get(event.tabId) ?? createSummary(event);
    summaries.set(event.tabId, summary);
    summary.eventCount += 1;
    summary.requestIds.add(event.requestId);
    if (event.phase === 'completed') {
      summary.completedRequestIds.add(event.requestId);
    }
    if (event.phase === 'failed') {
      summary.failedRequestIds.add(event.requestId);
    }
    if (event.timestamp >= summary.lastActivityAt) {
      summary.lastActivityAt = event.timestamp;
      summary.latestUrl = event.url;
    }
  }
  return [...summaries.values()]
    .map(toReadonlySummary)
    .sort((left, right) => right.lastActivityAt - left.lastActivityAt || right.tabId - left.tabId);
}

function createSummary(event: NetworkEvent): MutableTabNetworkSummary {
  return {
    completedRequestIds: new Set(),
    eventCount: 0,
    failedRequestIds: new Set(),
    lastActivityAt: event.timestamp,
    latestUrl: event.url,
    requestIds: new Set(),
    tabId: event.tabId
  };
}

function toReadonlySummary(summary: MutableTabNetworkSummary): TabNetworkSummary {
  return {
    completedRequestCount: summary.completedRequestIds.size,
    eventCount: summary.eventCount,
    failedRequestCount: summary.failedRequestIds.size,
    lastActivityAt: summary.lastActivityAt,
    latestUrl: summary.latestUrl,
    requestCount: summary.requestIds.size,
    tabId: summary.tabId
  };
}

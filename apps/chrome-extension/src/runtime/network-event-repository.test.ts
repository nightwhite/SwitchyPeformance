import { describe, expect, it, vi } from 'vitest';

import {
  capNetworkEvents,
  createNetworkEventRepository,
  type NetworkEvent
} from './network-event-repository.ts';

describe('capNetworkEvents', () => {
  it('keeps the newest 500 records for one tab', () => {
    const events = Array.from({ length: 501 }, (_, index) => event(`first-${index}`, 1, index));

    const capped = capNetworkEvents(events);

    expect(capped).toHaveLength(500);
    expect(capped.some((candidate) => candidate.requestId === 'first-0')).toBe(false);
    expect(capped.some((candidate) => candidate.requestId === 'first-500')).toBe(true);
    expect(capped[0]?.requestId).toBe('first-1');
  });

  it('applies the global cap after independent tab limits', () => {
    const events = Array.from({ length: 11 }, (_, tabOffset) =>
      Array.from({ length: 500 }, (_, index) =>
        event(`tab-${tabOffset}-${index}`, tabOffset, tabOffset * 500 + index)
      )
    ).flat();

    const capped = capNetworkEvents(events);

    expect(capped).toHaveLength(5_000);
    expect(capped.some((candidate) => candidate.requestId === 'tab-0-499')).toBe(false);
    expect(capped.some((candidate) => candidate.requestId === 'tab-1-0')).toBe(true);
  });

  it('drops oldest records until the serialized event store fits its byte limit', () => {
    const capped = capNetworkEvents(
      [event('oldest', 1, 1, '/'.repeat(256)), event('newest', 1, 2, '/'.repeat(256))],
      { maxBytes: 400, maxEvents: 10, maxEventsPerTab: 10 }
    );

    expect(capped.map((candidate) => candidate.requestId)).toEqual(['newest']);
  });
});

describe('createNetworkEventRepository', () => {
  it('serializes writes and returns cloned, bounded events', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const repository = createNetworkEventRepository(
      { read: vi.fn().mockResolvedValue([]), write },
      { maxBytes: 1_024, maxEvents: 2, maxEventsPerTab: 2 }
    );

    await Promise.all([
      repository.append(event('one', 1, 1)),
      repository.append(event('two', 1, 2)),
      repository.append(event('three', 1, 3))
    ]);

    const events = await repository.list();
    expect(events.map((candidate) => candidate.requestId)).toEqual(['two', 'three']);
    expect(write).toHaveBeenLastCalledWith(events);
    expect(events).not.toBe(await repository.list());
  });
});

function event(
  requestId: string,
  tabId: number,
  timestamp: number,
  path = '/resource'
): NetworkEvent {
  return {
    phase: 'completed',
    requestId,
    statusCode: 200,
    tabId,
    timestamp,
    url: `https://x.example.test${path}`
  };
}

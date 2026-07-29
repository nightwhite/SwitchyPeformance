import { describe, expect, it, vi } from 'vitest';

import { createProxyControlTracker } from './proxy-control-tracker.ts';

describe('proxy control tracker', () => {
  it('keeps the last external owner across a service worker restart', async () => {
    let stored: unknown;
    const write = vi.fn(async (value: unknown) => {
      stored = value;
    });
    const tracker = createProxyControlTracker({
      read: async () => stored,
      write
    });

    await tracker.remember({
      controlledBy: 'other_extension',
      levelOfControl: 'controlled_by_other_extensions'
    });

    const restartedTracker = createProxyControlTracker({
      read: async () => stored,
      write: vi.fn()
    });
    await expect(restartedTracker.load()).resolves.toEqual({
      controlledBy: 'other_extension',
      levelOfControl: 'controlled_by_other_extensions'
    });
    expect(write).toHaveBeenCalledOnce();
  });

  it('ignores corrupted session state instead of treating it as proxy ownership', async () => {
    const tracker = createProxyControlTracker({
      read: async () => ({ controlledBy: 'unknown' }),
      write: vi.fn()
    });

    await expect(tracker.load()).resolves.toBeUndefined();
  });
});

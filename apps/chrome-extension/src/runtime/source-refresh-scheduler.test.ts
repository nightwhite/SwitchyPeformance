import { describe, expect, it, vi } from 'vitest';

import type { SourceStatus } from './source-status-repository.ts';
import {
  SOURCE_REFRESH_ALARM,
  nextSourceRefreshAt,
  scheduleSourceRefresh,
  sourcesDueForRefresh,
  type RefreshableSource
} from './source-refresh-scheduler.ts';

describe('source refresh scheduler', () => {
  it('selects only enabled sources that have reached their refresh time', () => {
    const due = sourcesDueForRefresh(
      [
        source('daily-source', 60),
        source('not-due', 60),
        source('disabled', 60, false),
        source('first-download', 60)
      ],
      [status('daily-source', 6_300_000), status('not-due', 9_970_000)],
      10_000_000
    );

    expect(due.map((source) => source.id)).toEqual(['daily-source', 'first-download']);
  });

  it('uses the most recent failed attempt to avoid a tight retry loop', () => {
    const sources = [source('failing-source', 60)];

    expect(
      nextSourceRefreshAt(sources, [status('failing-source', undefined, 980_000)], 1_000_000)
    ).toBe(4_580_000);
  });

  it('schedules the earliest enabled source and clears the alarm when none remain', async () => {
    const alarms = { clear: vi.fn(), create: vi.fn() };

    await scheduleSourceRefresh(
      alarms,
      [source('later', 60), source('first', 1)],
      [status('later', 900_000), status('first', 945_000)],
      1_000_000
    );

    expect(alarms.create).toHaveBeenCalledWith(SOURCE_REFRESH_ALARM, { when: 1_005_000 });
    expect(alarms.clear).not.toHaveBeenCalled();

    await scheduleSourceRefresh(alarms, [], [], 1_000_000);
    expect(alarms.clear).toHaveBeenCalledWith(SOURCE_REFRESH_ALARM);
  });
});

function source(id: string, refreshMinutes: number, enabled = true): RefreshableSource {
  return { id, kind: 'rule-list', name: id, refreshMinutes, enabled };
}

function status(sourceId: string, lastSuccessAt?: number, lastErrorAt?: number): SourceStatus {
  return {
    sourceId,
    url: `https://${sourceId}.example/list.txt`,
    ...(lastSuccessAt === undefined ? {} : { lastSuccessAt }),
    ...(lastErrorAt === undefined ? {} : { lastErrorAt })
  };
}

import type { SourceStatus } from './source-status-repository.ts';

const MIN_ALARM_DELAY_MS = 1_000;
const MINUTE_MS = 60_000;

export const SOURCE_REFRESH_ALARM = 'switchypeformance.source-refresh';

export interface RefreshableSource {
  enabled: boolean;
  id: string;
  kind: 'pac' | 'rule-list';
  name: string;
  refreshMinutes: number;
}

export interface SourceRefreshAlarmScheduler {
  clear(name: string): Promise<void | boolean> | void | boolean;
  create(name: string, info: { when: number }): Promise<void> | void;
}

export function sourcesDueForRefresh<T extends RefreshableSource>(
  sources: readonly T[],
  statuses: readonly SourceStatus[],
  now: number
): readonly T[] {
  const statusById = new Map(statuses.map((status) => [status.sourceId, status]));
  return sources.filter((source) => {
    const refreshAt = sourceRefreshAt(source, statusById.get(source.id), now);
    return refreshAt !== undefined && refreshAt <= now;
  });
}

export function nextSourceRefreshAt(
  sources: readonly RefreshableSource[],
  statuses: readonly SourceStatus[],
  now: number
): number | undefined {
  const statusById = new Map(statuses.map((status) => [status.sourceId, status]));
  const scheduled = sources
    .map((source) => sourceRefreshAt(source, statusById.get(source.id), now))
    .filter((refreshAt): refreshAt is number => refreshAt !== undefined);
  return scheduled.length === 0 ? undefined : Math.min(...scheduled);
}

export async function scheduleSourceRefresh(
  alarms: SourceRefreshAlarmScheduler,
  sources: readonly RefreshableSource[],
  statuses: readonly SourceStatus[],
  now: number
): Promise<void> {
  const refreshAt = nextSourceRefreshAt(sources, statuses, now);
  if (refreshAt === undefined) {
    await alarms.clear(SOURCE_REFRESH_ALARM);
    return;
  }
  await alarms.create(SOURCE_REFRESH_ALARM, {
    when: Math.max(now + MIN_ALARM_DELAY_MS, refreshAt)
  });
}

function sourceRefreshAt(
  source: RefreshableSource,
  status: SourceStatus | undefined,
  now: number
): number | undefined {
  if (!source.enabled || !Number.isInteger(source.refreshMinutes) || source.refreshMinutes < 1) {
    return undefined;
  }
  const lastAttemptAt = Math.max(status?.lastSuccessAt ?? 0, status?.lastErrorAt ?? 0);
  return lastAttemptAt > 0 ? lastAttemptAt + source.refreshMinutes * MINUTE_MS : now;
}

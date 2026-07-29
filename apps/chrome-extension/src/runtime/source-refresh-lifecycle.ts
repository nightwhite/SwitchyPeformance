import type { ConfigurationDocument } from '@switchypeformance/contracts';

import {
  isActiveSourceTarget,
  remoteSourceTargets,
  type RemoteSourceTarget
} from './source-refresh-catalog.ts';
import {
  scheduleSourceRefresh,
  sourcesDueForRefresh,
  type SourceRefreshAlarmScheduler
} from './source-refresh-scheduler.ts';
import type { SourceStatus } from './source-status-repository.ts';

export interface SourceRefreshLifecycleDependencies {
  alarms: SourceRefreshAlarmScheduler;
  listStatuses(): Promise<readonly SourceStatus[]>;
  loadConfiguration(): Promise<ConfigurationDocument>;
  now?: () => number;
  reapply(): Promise<unknown>;
  refresh(document: ConfigurationDocument, target: RemoteSourceTarget): Promise<void>;
  reportFailure?(target: RemoteSourceTarget, error: unknown): Promise<void>;
}

export interface SourceRefreshLifecycle {
  refresh(sourceId: string): Promise<void>;
  refreshDue(): Promise<void>;
  synchronize(): Promise<void>;
}

export function createSourceRefreshLifecycle(
  dependencies: SourceRefreshLifecycleDependencies
): SourceRefreshLifecycle {
  const now = dependencies.now ?? Date.now;
  let pending = Promise.resolve();

  return {
    refresh(sourceId) {
      return serialize(async () => {
        const document = await dependencies.loadConfiguration();
        const target = remoteSourceTargets(document).find((candidate) => candidate.id === sourceId);
        if (!target) {
          throw new Error(`来源不存在或不可刷新：${sourceId}`);
        }

        try {
          await dependencies.refresh(document, target);
          if (isActiveSourceTarget(document, target)) {
            await dependencies.reapply();
          }
        } finally {
          await scheduleCurrent(document);
        }
      });
    },
    refreshDue() {
      return serialize(async () => {
        const document = await dependencies.loadConfiguration();
        const statuses = await dependencies.listStatuses();
        const due = sourcesDueForRefresh(remoteSourceTargets(document), statuses, now());
        let activeSourceRefreshed = false;
        try {
          for (const target of due) {
            try {
              await dependencies.refresh(document, target);
              activeSourceRefreshed ||= isActiveSourceTarget(document, target);
            } catch (error) {
              await reportFailure(target, error);
            }
          }
          if (activeSourceRefreshed) {
            await dependencies.reapply();
          }
        } finally {
          await scheduleCurrent(document);
        }
      });
    },
    synchronize() {
      return serialize(async () => {
        await scheduleCurrent(await dependencies.loadConfiguration());
      });
    }
  };

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation, operation);
    pending = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async function scheduleCurrent(document: ConfigurationDocument): Promise<void> {
    await scheduleSourceRefresh(
      dependencies.alarms,
      remoteSourceTargets(document),
      await dependencies.listStatuses(),
      now()
    );
  }

  async function reportFailure(target: RemoteSourceTarget, error: unknown): Promise<void> {
    try {
      await dependencies.reportFailure?.(target, error);
    } catch {
      // A diagnostic write must not stop other sources from refreshing.
    }
  }
}

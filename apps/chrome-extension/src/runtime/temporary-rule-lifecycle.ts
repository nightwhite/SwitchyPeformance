import type { ConfigurationDocument } from '@switchypeformance/contracts';

import {
  scheduleTemporaryRuleExpiry,
  type TemporaryRuleAlarmScheduler
} from './temporary-rule-alarm.ts';
import type { TemporaryRuleService } from './temporary-rule-service.ts';

export interface TemporaryRuleLifecycleDependencies {
  alarms: TemporaryRuleAlarmScheduler;
  loadConfiguration(): Promise<ConfigurationDocument>;
  now?: () => number;
  reapply(): Promise<unknown>;
  temporaryRules: Pick<TemporaryRuleService, 'prune'>;
}

export interface TemporaryRuleLifecycle {
  reapplyAndSchedule(): Promise<void>;
  synchronize(): Promise<void>;
}

export function createTemporaryRuleLifecycle(
  dependencies: TemporaryRuleLifecycleDependencies
): TemporaryRuleLifecycle {
  const now = dependencies.now ?? Date.now;

  return {
    async reapplyAndSchedule() {
      const { rules } = await pruneCurrentDocument();
      await dependencies.reapply();
      await scheduleTemporaryRuleExpiry(dependencies.alarms, rules, now());
    },
    async synchronize() {
      const { changed, rules } = await pruneCurrentDocument();
      if (changed) {
        await dependencies.reapply();
      }
      await scheduleTemporaryRuleExpiry(dependencies.alarms, rules, now());
    }
  };

  async function pruneCurrentDocument() {
    return dependencies.temporaryRules.prune(await dependencies.loadConfiguration());
  }
}

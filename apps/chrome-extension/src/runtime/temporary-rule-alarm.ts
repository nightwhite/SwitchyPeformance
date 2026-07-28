import { nextTemporaryRuleExpiry, type TemporaryRule } from './temporary-rule-service.ts';

export const TEMPORARY_RULE_EXPIRY_ALARM = 'switchypeformance.temporary-rule-expiry';

export interface TemporaryRuleAlarmScheduler {
  clear(name: string): Promise<void | boolean> | void | boolean;
  create(name: string, info: { when: number }): Promise<void> | void;
}

export async function scheduleTemporaryRuleExpiry(
  alarms: TemporaryRuleAlarmScheduler,
  rules: readonly TemporaryRule[],
  now: number
): Promise<void> {
  const expiresAt = nextTemporaryRuleExpiry(rules, now);
  if (expiresAt === undefined) {
    await alarms.clear(TEMPORARY_RULE_EXPIRY_ALARM);
    return;
  }
  await alarms.create(TEMPORARY_RULE_EXPIRY_ALARM, { when: expiresAt });
}

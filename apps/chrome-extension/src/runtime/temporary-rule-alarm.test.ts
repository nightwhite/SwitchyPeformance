import { describe, expect, it, vi } from 'vitest';

import {
  TEMPORARY_RULE_EXPIRY_ALARM,
  scheduleTemporaryRuleExpiry
} from './temporary-rule-alarm.ts';
import type { TemporaryRuleAlarmScheduler } from './temporary-rule-alarm.ts';
import type { TemporaryRule } from './temporary-rule-service.ts';

describe('temporary rule expiry alarm', () => {
  it('schedules the earliest live rule expiry', async () => {
    const alarms = { clear: vi.fn(), create: vi.fn() };

    await scheduleTemporaryRuleExpiry(alarms, [rule('later', 4_000), rule('first', 2_000)], 1_000);

    expect(alarms.create).toHaveBeenCalledWith(TEMPORARY_RULE_EXPIRY_ALARM, { when: 2_000 });
    expect(alarms.clear).not.toHaveBeenCalled();
  });

  it('clears the expiry alarm when no live rules remain', async () => {
    const alarms = { clear: vi.fn(), create: vi.fn() };

    await scheduleTemporaryRuleExpiry(alarms, [rule('expired', 999)], 1_000);

    expect(alarms.clear).toHaveBeenCalledWith(TEMPORARY_RULE_EXPIRY_ALARM);
    expect(alarms.create).not.toHaveBeenCalled();
  });

  it('accepts the boolean result returned by Chrome when clearing an alarm', async () => {
    const alarms: TemporaryRuleAlarmScheduler = {
      async clear() {
        return true;
      },
      async create() {}
    };

    await expect(scheduleTemporaryRuleExpiry(alarms, [], 1_000)).resolves.toBeUndefined();
  });
});

function rule(id: string, expiresAt: number): TemporaryRule {
  return {
    automaticProfileId: 'automatic',
    createdAt: 1,
    expiresAt,
    host: `${id}.example.test`,
    id,
    rule: {
      condition: { type: 'host-wildcard', pattern: `*.${id}.example.test` },
      enabled: true,
      id,
      target: { profileId: 'fixed' }
    },
    schemaVersion: 2,
    scope: 'global'
  };
}

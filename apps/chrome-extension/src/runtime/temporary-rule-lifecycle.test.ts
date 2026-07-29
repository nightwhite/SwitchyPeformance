import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocument } from '@switchypeformance/contracts';

import { createTemporaryRuleLifecycle } from './temporary-rule-lifecycle.ts';
import type { TemporaryRule } from './temporary-rule-service.ts';

const document: ProfileDocument = {
  activeProfileId: 'direct',
  credentials: {},
  profiles: [
    { id: 'direct', kind: 'direct', name: '直连' },
    { id: 'system', kind: 'system', name: '系统代理' }
  ],
  proxies: [],
  schemaVersion: 1
};

describe('temporary rule lifecycle', () => {
  it('reapplies persisted temporary rules and schedules their earliest expiry on startup', async () => {
    const alarms = { clear: vi.fn(), create: vi.fn() };
    const reapply = vi.fn().mockResolvedValue(undefined);
    const temporaryRules = {
      prune: vi
        .fn()
        .mockResolvedValue({ changed: false, rules: [rule('later', 4_000), rule('first', 2_000)] })
    };
    const lifecycle = createTemporaryRuleLifecycle({
      alarms,
      loadConfiguration: vi.fn().mockResolvedValue(document),
      now: () => 1_000,
      reapply,
      temporaryRules
    });

    await lifecycle.reapplyAndSchedule();

    expect(reapply).toHaveBeenCalledOnce();
    expect(alarms.create).toHaveBeenCalledWith('switchypeformance.temporary-rule-expiry', {
      when: 2_000
    });
  });

  it('reapplies only when cleanup changed the active temporary rules', async () => {
    const alarms = { clear: vi.fn(), create: vi.fn() };
    const reapply = vi.fn().mockResolvedValue(undefined);
    const temporaryRules = {
      prune: vi
        .fn()
        .mockResolvedValueOnce({ changed: false, rules: [rule('active', 2_000)] })
        .mockResolvedValueOnce({ changed: true, rules: [] })
    };
    const lifecycle = createTemporaryRuleLifecycle({
      alarms,
      loadConfiguration: vi.fn().mockResolvedValue(document),
      now: () => 1_000,
      reapply,
      temporaryRules
    });

    await lifecycle.synchronize();
    await lifecycle.synchronize();

    expect(reapply).toHaveBeenCalledOnce();
    expect(alarms.create).toHaveBeenCalledWith('switchypeformance.temporary-rule-expiry', {
      when: 2_000
    });
    expect(alarms.clear).toHaveBeenCalledWith('switchypeformance.temporary-rule-expiry');
  });

  it('can prune and schedule without reapplying when Chrome proxy control belongs elsewhere', async () => {
    const alarms = { clear: vi.fn(), create: vi.fn() };
    const reapply = vi.fn();
    const lifecycle = createTemporaryRuleLifecycle({
      alarms,
      loadConfiguration: vi.fn().mockResolvedValue(document),
      now: () => 1_000,
      reapply,
      temporaryRules: {
        prune: vi.fn().mockResolvedValue({ changed: true, rules: [rule('safe', 2_000)] })
      }
    });

    await lifecycle.schedule();

    expect(reapply).not.toHaveBeenCalled();
    expect(alarms.create).toHaveBeenCalledWith('switchypeformance.temporary-rule-expiry', {
      when: 2_000
    });
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
      condition: { type: 'host-suffix', value: `${id}.example.test` },
      enabled: true,
      id,
      target: { kind: 'direct' }
    },
    schemaVersion: 1,
    scope: 'global'
  };
}

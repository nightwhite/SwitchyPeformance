import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { SOURCE_REFRESH_ALARM } from './source-refresh-scheduler.ts';
import { createSourceRefreshLifecycle } from './source-refresh-lifecycle.ts';

describe('source refresh lifecycle', () => {
  it('schedules enabled remote sources without downloading them during startup synchronization', async () => {
    const alarms = { clear: vi.fn(), create: vi.fn() };
    const refresh = vi.fn();
    const lifecycle = createSourceRefreshLifecycle({
      alarms,
      listStatuses: vi.fn().mockResolvedValue([
        { sourceId: 'pac:work-pac', lastSuccessAt: 1_000 },
        { sourceId: 'rule-list:company-rules', lastSuccessAt: 1_000 }
      ]),
      loadConfiguration: vi.fn().mockResolvedValue(document()),
      now: () => 2_000,
      reapply: vi.fn(),
      refresh
    });

    await lifecycle.synchronize();

    expect(refresh).not.toHaveBeenCalled();
    expect(alarms.create).toHaveBeenCalledWith(SOURCE_REFRESH_ALARM, { when: 3_601_000 });
  });

  it('refreshes due sources, continues after an error, and reapplies only when the active source changed', async () => {
    const active = document();
    const alarms = { clear: vi.fn(), create: vi.fn() };
    const reapply = vi.fn().mockResolvedValue(undefined);
    const refresh = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('规则来源不可用'));
    const reportFailure = vi.fn().mockResolvedValue(undefined);
    const lifecycle = createSourceRefreshLifecycle({
      alarms,
      listStatuses: vi.fn().mockResolvedValue([]),
      loadConfiguration: vi.fn().mockResolvedValue(active),
      now: () => 1_000,
      reapply,
      refresh,
      reportFailure
    });

    await lifecycle.refreshDue();

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenNthCalledWith(
      1,
      active,
      expect.objectContaining({ id: 'pac:work-pac' })
    );
    expect(refresh).toHaveBeenNthCalledWith(
      2,
      active,
      expect.objectContaining({ id: 'rule-list:company-rules' })
    );
    expect(reapply).toHaveBeenCalledOnce();
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rule-list:company-rules' }),
      expect.any(Error)
    );
  });

  it('allows manual refresh for a disabled source and rejects an unknown source', async () => {
    const base = document();
    const active: ProfileDocumentV2 = {
      ...base,
      activeProfileId: 'company-list',
      ruleSources: base.ruleSources.map((source) =>
        source.id === 'company-rules' && source.source.kind === 'url'
          ? {
              ...source,
              source: { ...source.source, refresh: { ...source.source.refresh, enabled: false } }
            }
          : source
      )
    };
    const refresh = vi.fn().mockResolvedValue(undefined);
    const reapply = vi.fn().mockResolvedValue(undefined);
    const lifecycle = createSourceRefreshLifecycle({
      alarms: { clear: vi.fn(), create: vi.fn() },
      listStatuses: vi.fn().mockResolvedValue([]),
      loadConfiguration: vi.fn().mockResolvedValue(active),
      now: () => 1_000,
      reapply,
      refresh
    });

    await lifecycle.refresh('rule-list:company-rules');

    expect(refresh).toHaveBeenCalledWith(
      active,
      expect.objectContaining({ enabled: false, id: 'rule-list:company-rules' })
    );
    expect(reapply).toHaveBeenCalledOnce();
    await expect(lifecycle.refresh('rule-list:missing')).rejects.toThrow('来源不存在或不可刷新');
  });
});

function document(): ProfileDocumentV2 {
  return {
    activeProfileId: 'work-pac',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统' },
      {
        id: 'work-pac',
        kind: 'pac',
        name: '工作 PAC',
        source: {
          headers: [],
          kind: 'url',
          refresh: { enabled: true, refreshMinutes: 60 },
          url: 'https://pac.example/work.pac'
        }
      },
      {
        fallback: { profileId: 'direct' },
        id: 'company-list',
        kind: 'rule-list',
        matchTarget: { profileId: 'direct' },
        name: '公司规则列表',
        sourceId: 'company-rules'
      }
    ],
    proxyServers: [],
    ruleSources: [
      {
        format: 'auto-proxy',
        id: 'company-rules',
        name: '公司规则',
        source: {
          headers: [],
          kind: 'url',
          refresh: { enabled: true, refreshMinutes: 60 },
          url: 'https://rules.example/company.txt'
        }
      }
    ],
    schemaVersion: 2,
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'work-pac'
    }
  };
}

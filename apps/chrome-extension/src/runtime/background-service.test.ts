import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocument } from '@switchypeformance/contracts';

import { createBackgroundService } from './background-service.ts';

const document: ProfileDocument = {
  activeProfileId: 'direct',
  credentials: {},
  profiles: [
    { id: 'direct', kind: 'direct', name: 'Direct' },
    { id: 'system', kind: 'system', name: 'System' }
  ],
  proxies: [],
  schemaVersion: 1
};

describe('createBackgroundService', () => {
  it('applies a selected profile before saving it as active', async () => {
    const apply = vi.fn().mockResolvedValue({ mode: 'system' });
    const replace = vi.fn().mockResolvedValue({ ...document, activeProfileId: 'system' });
    const diagnostics = { append: vi.fn().mockResolvedValue([]), clear: vi.fn(), list: vi.fn() };
    const service = createBackgroundService({
      apply,
      configuration: { load: vi.fn().mockResolvedValue(document), replace },
      diagnostics
    });

    await service.activateProfile('system');

    expect(apply).toHaveBeenCalledWith({ ...document, activeProfileId: 'system' });
    expect(replace).toHaveBeenCalledWith({ ...document, activeProfileId: 'system' });
    expect(apply.mock.invocationCallOrder[0]).toBeLessThan(
      replace.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('records an error when a reapply fails without writing configuration', async () => {
    const replace = vi.fn();
    const diagnostics = { append: vi.fn().mockResolvedValue([]), clear: vi.fn(), list: vi.fn() };
    const service = createBackgroundService({
      apply: vi.fn().mockRejectedValue(new Error('PAC is invalid')),
      configuration: { load: vi.fn().mockResolvedValue(document), replace },
      diagnostics
    });

    await expect(service.reapplyCurrent()).rejects.toThrow('PAC is invalid');
    expect(replace).not.toHaveBeenCalled();
    expect(diagnostics.append).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', scope: 'configuration' })
    );
  });

  it('records auto-switch compilation metrics after a successful apply', async () => {
    const diagnostics = { append: vi.fn().mockResolvedValue([]), clear: vi.fn(), list: vi.fn() };
    const service = createBackgroundService({
      apply: vi.fn().mockResolvedValue({
        mode: 'pac_script',
        metrics: {
          complexRuleCount: 0,
          compileDurationMs: 12.5,
          dnsSensitiveRuleCount: 1,
          indexBlockCount: 1,
          pacByteLength: 42_000,
          simpleRuleCount: 861
        }
      }),
      configuration: { load: vi.fn().mockResolvedValue(document), replace: vi.fn() },
      diagnostics
    });

    await service.reapplyCurrent();

    expect(diagnostics.append).toHaveBeenCalledWith({
      level: 'info',
      message:
        '已应用自动切换：861 条索引规则，0 条复杂规则，1 条可能触发 DNS 的规则；42000 字节；12.5 毫秒。',
      scope: 'configuration'
    });
  });

  it('records that a configuration was saved while Chrome proxy control is external', async () => {
    const diagnostics = { append: vi.fn().mockResolvedValue([]), clear: vi.fn(), list: vi.fn() };
    const service = createBackgroundService({
      apply: vi.fn().mockResolvedValue({
        control: {
          controlledBy: 'other_extension',
          levelOfControl: 'controlled_by_other_extensions'
        },
        mode: 'deferred'
      }),
      configuration: { load: vi.fn().mockResolvedValue(document), replace: vi.fn() },
      diagnostics
    });

    await service.reapplyCurrent();

    expect(diagnostics.append).toHaveBeenCalledWith({
      level: 'info',
      message: '已保存配置，但 Chrome 代理正由其他扩展控制。恢复控制权后，请重新应用当前配置。',
      scope: 'configuration'
    });
  });

  it('includes source metadata in a snapshot without requiring every caller to read storage', async () => {
    const sources = {
      list: vi.fn().mockResolvedValue([
        {
          byteLength: 128,
          lastSuccessAt: 1_000,
          sourceId: 'rule-list:company',
          url: 'https://rules.example/company.txt'
        }
      ])
    };
    const service = createBackgroundService({
      apply: vi.fn().mockResolvedValue({ mode: 'direct' }),
      configuration: { load: vi.fn().mockResolvedValue(document), replace: vi.fn() },
      diagnostics: { append: vi.fn(), clear: vi.fn(), list: vi.fn().mockResolvedValue([]) },
      sources
    });

    await expect(service.snapshot()).resolves.toMatchObject({
      sourceStatuses: [
        {
          byteLength: 128,
          sourceId: 'rule-list:company'
        }
      ]
    });
  });
});

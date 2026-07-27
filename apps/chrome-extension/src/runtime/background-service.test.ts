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
        'Applied automatic routing: 861 indexed rules, 0 complex rules; 42000 bytes; 12.5 ms.',
      scope: 'configuration'
    });
  });
});

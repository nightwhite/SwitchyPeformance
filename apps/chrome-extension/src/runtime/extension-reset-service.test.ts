import { describe, expect, it, vi } from 'vitest';

import { createExtensionResetService } from './extension-reset-service.ts';

describe('extension reset service', () => {
  it('clears only extension-owned state and records when Chrome proxy was left untouched', async () => {
    const clearChromeProxy = vi.fn().mockResolvedValue({ cleared: false });
    const clearCredentials = vi.fn().mockResolvedValue(undefined);
    const clearDiagnostics = vi.fn().mockResolvedValue(undefined);
    const clearNetworkEvents = vi.fn().mockResolvedValue(undefined);
    const clearSourceStatuses = vi.fn().mockResolvedValue(undefined);
    const clearTemporaryRules = vi.fn().mockResolvedValue(undefined);
    const replaceConfiguration = vi.fn().mockResolvedValue(undefined);
    const appendDiagnostic = vi.fn().mockResolvedValue(undefined);
    const document = { schemaVersion: 2 };
    const service = createExtensionResetService({
      appendDiagnostic,
      clearChromeProxy,
      clearCredentials,
      clearDiagnostics,
      clearNetworkEvents,
      clearSourceStatuses,
      clearTemporaryRules,
      createDefaultDocument: () => document,
      replaceConfiguration
    });

    await service.reset();

    expect(clearChromeProxy).toHaveBeenCalledOnce();
    expect(clearCredentials).toHaveBeenCalledOnce();
    expect(clearDiagnostics).toHaveBeenCalledOnce();
    expect(clearNetworkEvents).toHaveBeenCalledOnce();
    expect(clearSourceStatuses).toHaveBeenCalledOnce();
    expect(clearTemporaryRules).toHaveBeenCalledOnce();
    expect(replaceConfiguration).toHaveBeenCalledWith(document);
    expect(appendDiagnostic).toHaveBeenCalledWith({
      detail: 'Chrome 代理并非本扩展控制，未修改外部设置。',
      level: 'info',
      message: '已重置 SwitchyPeformance 本地数据',
      scope: 'configuration'
    });
  });

  it('explains that it cleared Chrome proxy only when the extension owned it', async () => {
    const appendDiagnostic = vi.fn().mockResolvedValue(undefined);
    const service = createExtensionResetService({
      appendDiagnostic,
      clearChromeProxy: vi.fn().mockResolvedValue({ cleared: true }),
      clearCredentials: vi.fn().mockResolvedValue(undefined),
      clearDiagnostics: vi.fn().mockResolvedValue(undefined),
      clearNetworkEvents: vi.fn().mockResolvedValue(undefined),
      clearSourceStatuses: vi.fn().mockResolvedValue(undefined),
      clearTemporaryRules: vi.fn().mockResolvedValue(undefined),
      createDefaultDocument: () => ({ schemaVersion: 2 }),
      replaceConfiguration: vi.fn().mockResolvedValue(undefined)
    });

    await service.reset();

    expect(appendDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ detail: '已清除本扩展写入的 Chrome 代理配置。' })
    );
  });
});

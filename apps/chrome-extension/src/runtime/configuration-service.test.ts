import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocument } from '@switchypeformance/contracts';

import { createConfigurationService } from './configuration-service.ts';

const current: ProfileDocument = {
  schemaVersion: 1,
  activeProfileId: 'direct',
  credentials: {},
  profiles: [{ id: 'direct', kind: 'direct', name: '直连' }],
  proxies: []
};

const candidate: ProfileDocument = {
  ...current,
  activeProfileId: 'system',
  profiles: [...current.profiles, { id: 'system', kind: 'system', name: '系统代理' }]
};

describe('createConfigurationService', () => {
  it('编译或应用失败时不写入候选配置', async () => {
    const apply = vi.fn().mockRejectedValue(new Error('PAC 编译失败'));
    const replace = vi.fn();
    const service = createConfigurationService({
      apply,
      configuration: { load: vi.fn().mockResolvedValue(current), replace }
    });

    await expect(service.replace(candidate)).rejects.toThrow('PAC 编译失败');

    expect(apply).toHaveBeenCalledWith(candidate);
    expect(replace).not.toHaveBeenCalled();
  });

  it('持久化失败时恢复之前已经生效的 Chrome 配置', async () => {
    const apply = vi.fn().mockResolvedValue({ mode: 'system' });
    const replace = vi.fn().mockRejectedValue(new Error('存储写入失败'));
    const service = createConfigurationService({
      apply,
      configuration: { load: vi.fn().mockResolvedValue(current), replace }
    });

    await expect(service.replace(candidate)).rejects.toThrow('存储写入失败');

    expect(apply).toHaveBeenNthCalledWith(1, candidate);
    expect(apply).toHaveBeenNthCalledWith(2, current);
    expect(replace).toHaveBeenCalledWith(candidate);
  });
});

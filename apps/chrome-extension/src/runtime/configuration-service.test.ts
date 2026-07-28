import { describe, expect, it, vi } from 'vitest';

import type {
  ConfigurationDocument,
  ProfileDocument,
  ProfileDocumentV2
} from '@switchypeformance/contracts';

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

  it('applies a V2 candidate before making it persistent', async () => {
    const v2Candidate = v2Document();
    const apply = vi.fn().mockResolvedValue({ mode: 'direct' });
    const replace = vi.fn().mockResolvedValue(v2Candidate);
    const service = createConfigurationService({
      apply,
      configuration: { load: vi.fn().mockResolvedValue(current), replace }
    });

    await expect(service.replace(v2Candidate)).resolves.toEqual(v2Candidate);
    expect(apply).toHaveBeenCalledWith(v2Candidate);
    expect(replace).toHaveBeenCalledWith(v2Candidate);
  });

  it('derives a mutation from the configuration loaded at save time', async () => {
    const latest = { ...candidate, activeProfileId: 'direct' };
    const apply = vi.fn().mockResolvedValue({ mode: 'direct' });
    const replace = vi.fn().mockResolvedValue(candidate);
    const mutate = vi.fn((document: ConfigurationDocument) => ({
      ...document,
      activeProfileId: 'system'
    }));
    const service = createConfigurationService({
      apply,
      configuration: { load: vi.fn().mockResolvedValue(latest), replace }
    });

    await expect(service.mutate(mutate)).resolves.toEqual(candidate);

    expect(mutate).toHaveBeenCalledWith(latest);
    expect(apply).toHaveBeenCalledWith(candidate);
    expect(replace).toHaveBeenCalledWith(candidate);
  });
});

function v2Document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'direct',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' }
    ],
    proxyServers: [],
    ruleSources: [],
    settings: {
      startupProfileId: 'direct',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}

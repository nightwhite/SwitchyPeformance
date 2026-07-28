import { describe, expect, it, vi } from 'vitest';

import type { ConfigurationDocument } from '@switchypeformance/contracts';

import { createRoutingApplicationService } from './routing-application-service.ts';

describe('routing application service', () => {
  it('uses the same effective document for applying Chrome proxy settings and route inspection', async () => {
    const saved = document('saved');
    const effective = document('effective');
    const applyEffective = vi.fn().mockResolvedValue({ mode: 'direct' });
    const explainEffective = vi.fn().mockResolvedValue({ routeKind: 'direct' });
    const resolve = vi.fn().mockResolvedValue(effective);
    const service = createRoutingApplicationService({
      applyEffective,
      explainEffective,
      routingDocuments: { resolve }
    });

    await service.apply(saved);
    await service.explain(saved, 'https://example.com');

    expect(resolve).toHaveBeenNthCalledWith(1, saved);
    expect(resolve).toHaveBeenNthCalledWith(2, saved);
    expect(applyEffective).toHaveBeenCalledWith(effective);
    expect(explainEffective).toHaveBeenCalledWith(effective, 'https://example.com');
  });

  it('does not call an operation after effective routing resolution fails', async () => {
    const applyEffective = vi.fn();
    const service = createRoutingApplicationService({
      applyEffective,
      explainEffective: vi.fn(),
      routingDocuments: { resolve: vi.fn().mockRejectedValue(new Error('规则列表下载失败')) }
    });

    await expect(service.apply(document('saved'))).rejects.toThrow('规则列表下载失败');
    expect(applyEffective).not.toHaveBeenCalled();
  });
});

function document(activeProfileId: string): ConfigurationDocument {
  return {
    activeProfileId,
    credentials: {},
    profiles: [
      { id: activeProfileId, kind: 'direct', name: activeProfileId },
      { id: 'system', kind: 'system', name: '系统' }
    ],
    proxies: [],
    schemaVersion: 1
  };
}

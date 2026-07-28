import { describe, expect, it, vi } from 'vitest';

import type { ConfigurationDocument } from '@switchypeformance/contracts';

import { createRoutingDocumentPipeline } from './routing-document-pipeline.ts';

describe('routing document pipeline', () => {
  it('resolves temporary rules, PAC text, and rule-list text in the required order', async () => {
    const saved = document('saved');
    const withTemporaryRules = document('temporary');
    const withPac = document('pac');
    const compiledRuleList = document('rule-list');
    const calls: string[] = [];
    const pipeline = createRoutingDocumentPipeline({
      pacSources: {
        resolveForApply: vi.fn(async (current: ConfigurationDocument) => {
          calls.push(`pac:${current.activeProfileId}`);
          return withPac;
        })
      },
      ruleLists: {
        resolveForApply: vi.fn(async (current: ConfigurationDocument) => {
          calls.push(`rule-list:${current.activeProfileId}`);
          return compiledRuleList;
        })
      },
      temporaryRules: {
        resolve: vi.fn(async (current: ConfigurationDocument) => {
          calls.push(`temporary:${current.activeProfileId}`);
          return withTemporaryRules;
        })
      }
    });

    const result = await pipeline.resolve(saved);

    expect(result).toBe(compiledRuleList);
    expect(calls).toEqual(['temporary:saved', 'pac:temporary', 'rule-list:pac']);
  });

  it('stops before Chrome compilation input when a source resolver fails', async () => {
    const ruleLists = { resolveForApply: vi.fn() };
    const pipeline = createRoutingDocumentPipeline({
      pacSources: { resolveForApply: vi.fn().mockRejectedValue(new Error('规则来源不可用')) },
      ruleLists,
      temporaryRules: { resolve: vi.fn(async (current: ConfigurationDocument) => current) }
    });

    await expect(pipeline.resolve(document('saved'))).rejects.toThrow('规则来源不可用');
    expect(ruleLists.resolveForApply).not.toHaveBeenCalled();
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

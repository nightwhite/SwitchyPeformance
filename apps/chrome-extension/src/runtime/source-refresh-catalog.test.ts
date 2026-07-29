import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { isActiveSourceTarget, remoteSourceTargets } from './source-refresh-catalog.ts';

describe('source refresh catalog', () => {
  it('lists every remote PAC and rule-list source while preserving its refresh policy', () => {
    const document = refreshDocument();

    expect(remoteSourceTargets(document)).toEqual([
      {
        enabled: true,
        id: 'pac:work-pac',
        kind: 'pac',
        name: '工作 PAC',
        ownerId: 'work-pac',
        refreshMinutes: 60
      },
      {
        enabled: false,
        id: 'rule-list:company-rules',
        kind: 'rule-list',
        name: '公司规则',
        ownerId: 'company-rules',
        refreshMinutes: 30
      }
    ]);
  });

  it('recognizes a source selected through a virtual active profile', () => {
    const document = { ...refreshDocument(), activeProfileId: 'pac-entry' };
    const [pac, ruleList] = remoteSourceTargets(document);

    expect(pac && isActiveSourceTarget(document, pac)).toBe(true);
    expect(ruleList && isActiveSourceTarget(document, ruleList)).toBe(false);
  });
});

function refreshDocument(): ProfileDocumentV2 {
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
      },
      {
        id: 'pac-entry',
        kind: 'virtual',
        name: 'PAC 入口',
        target: { profileId: 'work-pac' }
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
          refresh: { enabled: false, refreshMinutes: 30 },
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

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { OriginalProfileWorkspace } from './OriginalProfileWorkspace.tsx';

describe('OriginalProfileWorkspace', () => {
  it.each([
    ['pac', 'PAC 脚本或地址'],
    ['rule-list', '规则来源与目标'],
    ['auto-detect', '自动检测代理'],
    ['virtual', '虚拟配置目标']
  ] as const)('uses the original workspace for %s profiles', (profileId, expectedText) => {
    const document = fixture();
    const markup = renderToStaticMarkup(
      createElement(OriginalProfileWorkspace, {
        busy: false,
        dirty: false,
        document,
        onBackgroundState: vi.fn(),
        onOpenCreatedProfile: vi.fn(),
        onReplace: vi.fn(async () => ({
          configuration: document,
          diagnostics: [],
          sourceStatuses: [],
          temporaryRules: []
        })),
        profileId,
        sourceStatuses: []
      })
    );

    expect(markup).toContain(expectedText);
  });
});

function fixture(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'direct',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'pac',
        kind: 'pac',
        name: 'PAC',
        source: { kind: 'inline', text: 'function FindProxyForURL(){ return "DIRECT"; }' }
      },
      { id: 'auto-detect', kind: 'auto-detect', name: '自动检测' },
      {
        fallback: { profileId: 'direct' },
        id: 'rule-list',
        kind: 'rule-list',
        matchTarget: { profileId: 'direct' },
        name: '公司规则',
        sourceId: 'source'
      },
      {
        id: 'virtual',
        kind: 'virtual',
        name: '虚拟配置',
        target: { profileId: 'direct' }
      }
    ],
    proxyServers: [],
    ruleSources: [
      {
        format: 'auto-proxy',
        id: 'source',
        name: '公司规则',
        source: { kind: 'inline', text: '*.company.example' }
      }
    ],
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'direct'
    }
  };
}

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { OriginalOptionsApp } from './OriginalOptionsApp.tsx';

describe('OriginalOptionsApp', () => {
  it('renders the original-style configuration navigation around the active draft', () => {
    const document = fixture();
    const markup = renderToStaticMarkup(
      createElement(OriginalOptionsApp, {
        busy: false,
        dirty: false,
        document,
        error: undefined,
        onApply: vi.fn(),
        onBackgroundState: vi.fn(),
        onDiscard: vi.fn(),
        onDraftChange: vi.fn(),
        state: {
          configuration: document,
          diagnostics: [],
          sourceStatuses: [],
          temporaryRules: []
        }
      })
    );

    expect(markup).toContain('原版配置导航');
    expect(markup).toContain('内置配置');
    expect(markup).toContain('直连');
    expect(markup).toContain('应用');
    expect(markup).toContain('放弃');
  });
});

function fixture(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'automatic',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        fallback: { profileId: 'direct' },
        id: 'automatic',
        kind: 'auto-switch',
        loopbackPolicy: 'direct',
        name: '自动切换',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: []
      }
    ],
    proxyServers: [],
    ruleSources: [],
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'direct'
    }
  };
}

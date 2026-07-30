import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { GeneralSettingsPage } from './GeneralSettingsPage.tsx';

describe('GeneralSettingsPage', () => {
  it('keeps network monitoring and detailed diagnostics together on the general page', () => {
    const markup = renderToStaticMarkup(
      createElement(GeneralSettingsPage, {
        busy: false,
        document: fixture(),
        onOpenDiagnostics: vi.fn(),
        onReplace: vi.fn(),
        onState: vi.fn(),
        proxyControl: { controlledBy: 'this_extension' }
      })
    );

    expect(markup).toContain('通用设置');
    expect(markup).toContain('记录网页网络时间线');
    expect(markup).toContain('打开详细排查');
    expect(markup).toContain('Chrome 代理控制权');
  });
});

function fixture(): ProfileDocumentV2 {
  return {
    activeProfileId: 'direct',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' }
    ],
    proxyServers: [],
    ruleSources: [],
    schemaVersion: 2,
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'direct'
    }
  };
}

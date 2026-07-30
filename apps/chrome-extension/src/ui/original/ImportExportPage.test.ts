import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { ImportExportPage } from './ImportExportPage.tsx';

describe('ImportExportPage', () => {
  it('puts backup, restore, and sync in the original import/export workspace', () => {
    const markup = renderToStaticMarkup(
      createElement(ImportExportPage, {
        busy: false,
        document: fixture(),
        onState: vi.fn(),
        sourceStatuses: []
      })
    );

    expect(markup).toContain('导入/导出');
    expect(markup).toContain('导出备份（.bak）');
    expect(markup).toContain('在线备份地址');
    expect(markup).toContain('配置同步');
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

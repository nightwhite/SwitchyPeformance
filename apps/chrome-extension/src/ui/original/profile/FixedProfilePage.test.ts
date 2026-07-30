import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { BackgroundState } from '../../../runtime/messages.ts';
import type { FixedProxyProfileV2, ProfileDocumentV2 } from '@switchypeformance/contracts';

import { FixedProfilePage } from './FixedProfilePage.tsx';

describe('FixedProfilePage', () => {
  it('renders the original protocol route table and local proxy controls', () => {
    const document = fixture();
    const profile = document.profiles.find((candidate) => candidate.id === 'work') as FixedProxyProfileV2;
    const state: BackgroundState = {
      configuration: document,
      diagnostics: [],
      sourceStatuses: [],
      temporaryRules: []
    };
    const markup = renderToStaticMarkup(
      createElement(FixedProfilePage, {
        busy: false,
        dirty: false,
        document,
        onBackgroundState: vi.fn(),
        onReplace: vi.fn(async () => state),
        profile
      })
    );

    expect(markup).toContain('默认代理');
    expect(markup).toContain('HTTP 代理');
    expect(markup).toContain('HTTPS 代理');
    expect(markup).toContain('FTP 代理');
    expect(markup).toContain('添加代理服务器');
    expect(markup).toContain('绕过列表');
  });
});

function fixture(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'work',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        bypassList: ['localhost'],
        id: 'work',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'primary', httpsProxyId: 'primary' }
      }
    ],
    proxyServers: [
      { host: 'primary.example', id: 'primary', name: '主节点', port: 1080, scheme: 'socks5' }
    ],
    ruleSources: [],
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'work'
    }
  };
}

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { OriginalPopupMenu } from './OriginalPopupMenu.tsx';

describe('OriginalPopupMenu', () => {
  it('renders the compact original menu with a separate default target trigger', () => {
    const document = fixture();
    const markup = renderToStaticMarkup(
      createElement(OriginalPopupMenu, {
        busy: false,
        currentHost: 'github.com',
        document,
        failureCount: 2,
        onActivate: vi.fn(async () => undefined),
        onChangeDefaultTarget: vi.fn(async () => undefined),
        onOpenFailures: vi.fn(),
        onOpenOptions: vi.fn(),
        onOpenPermanentRule: vi.fn(),
        onOpenRoute: vi.fn(),
        onOpenTemporaryRule: vi.fn(),
        onRefresh: vi.fn()
      })
    );

    expect(markup).toContain('直连');
    expect(markup).toContain('系统代理');
    expect(markup).toContain('工作代理');
    expect(markup).toContain('自动切换');
    expect(markup).toContain('默认目标：工作代理');
    expect(markup).toContain('为 github.com 添加规则');
    expect(markup).toContain('失败资源 (2)');
  });
});

function fixture(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'switch',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        bypassList: [],
        id: 'fixed',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'server' }
      },
      {
        fallback: { profileId: 'fixed' },
        id: 'switch',
        kind: 'auto-switch',
        loopbackPolicy: 'direct',
        name: '自动切换',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: []
      }
    ],
    proxyServers: [
      { host: 'proxy.example', id: 'server', name: '服务器', port: 1080, scheme: 'socks5' }
    ],
    ruleSources: [],
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'switch'
    }
  };
}

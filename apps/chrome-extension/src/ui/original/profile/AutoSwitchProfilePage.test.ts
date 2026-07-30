import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { AutoSwitchProfileV2, ProfileDocumentV2 } from '@switchypeformance/contracts';

import { AutoSwitchProfilePage } from './AutoSwitchProfilePage.tsx';

describe('AutoSwitchProfilePage', () => {
  it('renders default routing, the original attached rule-list editor, and the virtualized rule workspace together', () => {
    const document = fixture();
    const profile = document.profiles.find(
      (candidate) => candidate.id === 'automatic'
    ) as AutoSwitchProfileV2;
    const markup = renderToStaticMarkup(
      createElement(AutoSwitchProfilePage, {
        busy: false,
        document,
        onReplace: vi.fn(async () => undefined),
        profile
      })
    );

    expect(markup).toContain('当前表格规则未命中时，继续由下方规则列表判断。');
    expect(markup).toContain('附加规则列表');
    expect(markup).toContain('公司规则');
    expect(markup).toContain('更新附加规则列表');
    expect(markup).toContain('添加规则');
    expect(markup).toContain('编辑规则文本');
    expect(markup).toContain('*.example.com');
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
        bypassList: [],
        id: 'fixed',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'proxy' }
      },
      {
        fallback: { profileId: 'direct' },
        id: 'automatic',
        kind: 'auto-switch',
        loopbackPolicy: 'direct',
        name: '自动切换',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: ['source'],
        rules: [
          {
            condition: { pattern: '*.example.com', type: 'host-wildcard' },
            enabled: true,
            id: 'rule',
            target: { profileId: 'fixed' }
          }
        ]
      },
      {
        fallback: { profileId: 'direct' },
        id: 'source-profile',
        kind: 'rule-list',
        matchTarget: { profileId: 'fixed' },
        name: '公司规则列表',
        sourceId: 'source'
      }
    ],
    proxyServers: [
      { host: 'proxy.example', id: 'proxy', name: '代理', port: 1080, scheme: 'socks5' }
    ],
    ruleSources: [
      { format: 'auto-proxy', id: 'source', name: '公司规则', source: { kind: 'inline', text: '' } }
    ],
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'automatic'
    }
  };
}

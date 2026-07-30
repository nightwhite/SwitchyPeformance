import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { originalPopupRows } from './menu-model.ts';

describe('original popup menu model', () => {
  it('keeps builtin profiles at the top and sorts custom profiles like the original menu', () => {
    expect(originalPopupRows(document()).map((row) => row.profileId)).toEqual([
      'direct',
      'system',
      'fixed',
      'pac',
      'detect',
      'alias',
      'switch',
      'list'
    ]);
  });

  it('exposes a separate default target control only for profiles that have one', () => {
    const rows = originalPopupRows(document());
    const automatic = rows.find((row) => row.profileId === 'switch');
    const fixed = rows.find((row) => row.profileId === 'fixed');
    const alias = rows.find((row) => row.profileId === 'alias');

    expect(automatic?.defaultTarget).toMatchObject({ profileId: 'fixed', label: '工作代理' });
    expect(automatic?.defaultTarget?.options.map((option) => option.profileId)).toEqual([
      'direct',
      'fixed',
      'alias'
    ]);
    expect(alias?.defaultTarget).toMatchObject({ profileId: 'fixed', label: '工作代理' });
    expect(fixed?.defaultTarget).toBeUndefined();
  });
});

function document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'switch',
    profiles: [
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        fallback: { profileId: 'fixed' },
        id: 'switch',
        kind: 'auto-switch',
        loopbackPolicy: 'direct',
        name: '自动切换',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: []
      },
      {
        bypassList: [],
        id: 'fixed',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'server' }
      },
      { id: 'detect', kind: 'auto-detect', name: '自动检测' },
      {
        id: 'pac',
        kind: 'pac',
        name: 'PAC',
        source: { kind: 'inline', text: 'function FindProxyForURL(){ return "DIRECT"; }' }
      },
      { id: 'alias', kind: 'virtual', name: '工作入口', target: { profileId: 'fixed' } },
      {
        fallback: { profileId: 'direct' },
        id: 'list',
        kind: 'rule-list',
        matchTarget: { profileId: 'fixed' },
        name: '规则列表',
        sourceId: 'source'
      },
      { id: 'direct', kind: 'direct', name: '直连' }
    ],
    proxyServers: [
      { host: 'proxy.example', id: 'server', name: '服务器', port: 1080, scheme: 'socks5' }
    ],
    ruleSources: [
      { format: 'auto-proxy', id: 'source', name: '公司规则', source: { kind: 'inline', text: '' } }
    ],
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'direct'
    }
  };
}

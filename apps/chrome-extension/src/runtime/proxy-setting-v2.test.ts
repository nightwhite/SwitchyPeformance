import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { buildChromeProxySettingV2 } from './proxy-setting-v2.ts';

describe('buildChromeProxySettingV2', () => {
  it('maps protocol-specific fixed proxy routes to Chrome rules', () => {
    const document = documentWith({
      id: 'fixed',
      kind: 'fixed-proxy',
      name: '多协议代理',
      routes: {
        fallbackProxyId: 'fallback',
        ftpProxyId: 'ftp',
        httpProxyId: 'http',
        httpsProxyId: 'https'
      },
      bypassList: ['*.internal.example']
    });

    expect(buildChromeProxySettingV2(document)).toEqual({
      mode: 'fixed_servers',
      rules: {
        bypassList: ['<local>', 'localhost', '127.0.0.1', '[::1]', '*.internal.example'],
        fallbackProxy: { host: 'fallback.example', port: 1080, scheme: 'socks5' },
        proxyForFtp: { host: 'ftp.example', port: 2121, scheme: 'socks4' },
        proxyForHttp: { host: 'http.example', port: 8080, scheme: 'http' },
        proxyForHttps: { host: 'https.example', port: 8443, scheme: 'https' }
      }
    });
  });

  it('resolves a virtual profile before applying its target profile', () => {
    const document = documentWith({
      id: 'virtual',
      kind: 'virtual',
      name: '工作入口',
      target: { profileId: 'direct' }
    });

    expect(buildChromeProxySettingV2(document)).toEqual({ mode: 'direct' });
  });

  it('uses inline PAC data and Chrome automatic detection directly', () => {
    const pacDocument = documentWith({
      id: 'pac',
      kind: 'pac',
      name: 'PAC',
      source: { kind: 'inline', text: 'function FindProxyForURL(){return "DIRECT";}' }
    });
    const automaticDocument = documentWith({
      id: 'detect',
      kind: 'auto-detect',
      name: '自动检测'
    });

    expect(buildChromeProxySettingV2(pacDocument)).toEqual({
      mode: 'pac_script',
      pacScript: { data: 'function FindProxyForURL(){return "DIRECT";}', mandatory: true }
    });
    expect(buildChromeProxySettingV2(automaticDocument)).toEqual({ mode: 'auto_detect' });
  });

  it('requires a remote PAC to be resolved into cached inline text before Chrome application', () => {
    const document = documentWith({
      id: 'pac-url',
      kind: 'pac',
      name: '远程 PAC',
      source: {
        kind: 'url',
        url: 'https://example.test/proxy.pac',
        headers: [],
        refresh: { enabled: true, refreshMinutes: 60 }
      }
    });

    expect(() => buildChromeProxySettingV2(document)).toThrow('缓存');
  });

  it('rejects virtual profile cycles instead of recursing forever', () => {
    const document = documentWith({
      id: 'first',
      kind: 'virtual',
      name: '入口',
      target: { profileId: 'second' }
    });
    const cyclicDocument: ProfileDocumentV2 = {
      ...document,
      profiles: [
        ...document.profiles,
        { id: 'second', kind: 'virtual', name: '出口', target: { profileId: 'first' } }
      ]
    };

    expect(() => buildChromeProxySettingV2(cyclicDocument)).toThrow('虚拟配置存在循环引用');
  });
});

function documentWith(activeProfile: ProfileDocumentV2['profiles'][number]): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: activeProfile.id,
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统' },
      activeProfile
    ],
    proxyServers: [
      { id: 'fallback', name: '兜底', scheme: 'socks5', host: 'fallback.example', port: 1080 },
      { id: 'http', name: 'HTTP', scheme: 'http', host: 'http.example', port: 8080 },
      { id: 'https', name: 'HTTPS', scheme: 'https', host: 'https.example', port: 8443 },
      { id: 'ftp', name: 'FTP', scheme: 'socks4', host: 'ftp.example', port: 2121 }
    ],
    ruleSources: [],
    settings: {
      startupProfileId: activeProfile.id,
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}

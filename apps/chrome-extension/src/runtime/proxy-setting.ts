import type { ProfileDocument, ProxyEndpoint } from '@switchypeformance/contracts';

export type ChromeProxySetting =
  | { mode: 'direct' | 'system' }
  | {
      mode: 'fixed_servers';
      rules: {
        bypassList: readonly string[];
        singleProxy: ChromeProxyServer;
      };
    }
  | {
      mode: 'pac_script';
      pacScript: {
        data: string;
        mandatory: true;
      };
    };

export interface ChromeProxyServer {
  scheme: ProxyEndpoint['scheme'];
  host: string;
  port: number;
}

const DEFAULT_LOOPBACK_BYPASSES = ['<local>', 'localhost', '127.0.0.1', '[::1]'] as const;

export function buildChromeProxySetting(
  document: ProfileDocument,
  autoSwitchPac?: string
): ChromeProxySetting {
  const profile = document.profiles.find((candidate) => candidate.id === document.activeProfileId);
  if (!profile) {
    throw new Error(`当前配置不存在：${document.activeProfileId}`);
  }

  switch (profile.kind) {
    case 'direct':
      return { mode: 'direct' };
    case 'system':
      return { mode: 'system' };
    case 'fixed-proxy':
      return fixedProxySetting(profile.proxyId, document.proxies);
    case 'auto-switch':
      if (!autoSwitchPac?.trim()) {
        throw new Error('自动切换配置需要已编译的 PAC 规则');
      }
      return {
        mode: 'pac_script',
        pacScript: {
          data: autoSwitchPac,
          mandatory: true
        }
      };
  }
}

function fixedProxySetting(proxyId: string, proxies: readonly ProxyEndpoint[]): ChromeProxySetting {
  const proxy = proxies.find((candidate) => candidate.id === proxyId);
  if (!proxy) {
    throw new Error(`固定代理配置引用了未知代理：${proxyId}`);
  }

  return {
    mode: 'fixed_servers',
    rules: {
      bypassList: uniqueBypassList(proxy.bypassList),
      singleProxy: {
        scheme: proxy.scheme,
        host: proxy.host,
        port: proxy.port
      }
    }
  };
}

function uniqueBypassList(extraBypasses: readonly string[] | undefined): readonly string[] {
  return [...new Set([...DEFAULT_LOOPBACK_BYPASSES, ...(extraBypasses ?? [])])];
}

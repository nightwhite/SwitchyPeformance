import type { PacSource, ProfileDocumentV2, ProxyServer } from '@switchypeformance/contracts';
import { resolveProfileV2 } from '@switchypeformance/contracts';

import {
  type ChromeProxyServer,
  type ChromeProxySetting,
  uniqueBypassList
} from './proxy-setting.ts';

export function buildChromeProxySettingV2(
  document: ProfileDocumentV2,
  autoSwitchPac?: string
): ChromeProxySetting {
  const proxiesById = new Map(document.proxyServers.map((proxy) => [proxy.id, proxy]));
  const { profile } = resolveProfileV2(document);
  return buildProfileSetting(profile, proxiesById, autoSwitchPac);
}

function buildProfileSetting(
  profile: ReturnType<typeof resolveProfileV2>['profile'],
  proxiesById: ReadonlyMap<string, ProxyServer>,
  autoSwitchPac: string | undefined
): ChromeProxySetting {
  switch (profile.kind) {
    case 'direct':
      return { mode: 'direct' };
    case 'system':
      return { mode: 'system' };
    case 'fixed-proxy':
      return fixedProxySetting(profile, proxiesById);
    case 'pac':
      return pacSetting(profile.source);
    case 'auto-detect':
      return { mode: 'auto_detect' };
    case 'auto-switch':
      return autoSwitchSetting(autoSwitchPac);
    case 'rule-list':
      throw new Error('规则列表配置尚未编译为 PAC，不能直接应用到 Chrome');
  }
}

function fixedProxySetting(
  profile: Extract<ReturnType<typeof resolveProfileV2>['profile'], { kind: 'fixed-proxy' }>,
  proxiesById: ReadonlyMap<string, ProxyServer>
): ChromeProxySetting {
  return {
    mode: 'fixed_servers',
    rules: {
      bypassList: uniqueBypassList(profile.bypassList),
      fallbackProxy: requiredProxy(profile.routes.fallbackProxyId, proxiesById),
      ...(profile.routes.httpProxyId === undefined
        ? {}
        : { proxyForHttp: requiredProxy(profile.routes.httpProxyId, proxiesById) }),
      ...(profile.routes.httpsProxyId === undefined
        ? {}
        : { proxyForHttps: requiredProxy(profile.routes.httpsProxyId, proxiesById) }),
      ...(profile.routes.ftpProxyId === undefined
        ? {}
        : { proxyForFtp: requiredProxy(profile.routes.ftpProxyId, proxiesById) })
    }
  };
}

function requiredProxy(
  proxyId: string,
  proxiesById: ReadonlyMap<string, ProxyServer>
): ChromeProxyServer {
  const proxy = proxiesById.get(proxyId);
  if (!proxy) {
    throw new Error(`固定代理配置引用了未知代理：${proxyId}`);
  }
  return { scheme: proxy.scheme, host: proxy.host, port: proxy.port };
}

function pacSetting(source: PacSource): ChromeProxySetting {
  if (source.kind === 'inline') {
    return {
      mode: 'pac_script',
      pacScript: { data: source.text, mandatory: true }
    };
  }

  throw new Error('远程 PAC 必须先下载到本地缓存后才能应用');
}

function autoSwitchSetting(autoSwitchPac: string | undefined): ChromeProxySetting {
  if (!autoSwitchPac?.trim()) {
    throw new Error('自动切换配置需要已编译的 PAC 规则');
  }
  return {
    mode: 'pac_script',
    pacScript: { data: autoSwitchPac, mandatory: true }
  };
}

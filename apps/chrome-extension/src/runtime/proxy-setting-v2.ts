import type {
  PacSource,
  ProfileDocumentV2,
  ProfileV2,
  ProxyServer
} from '@switchypeformance/contracts';

import {
  type ChromeProxyServer,
  type ChromeProxySetting,
  uniqueBypassList
} from './proxy-setting.ts';

export function buildChromeProxySettingV2(
  document: ProfileDocumentV2,
  autoSwitchPac?: string
): ChromeProxySetting {
  const profilesById = new Map(document.profiles.map((profile) => [profile.id, profile]));
  const proxiesById = new Map(document.proxyServers.map((proxy) => [proxy.id, proxy]));
  return buildProfileSetting(
    document.activeProfileId,
    profilesById,
    proxiesById,
    autoSwitchPac,
    new Set()
  );
}

function buildProfileSetting(
  profileId: string,
  profilesById: ReadonlyMap<string, ProfileV2>,
  proxiesById: ReadonlyMap<string, ProxyServer>,
  autoSwitchPac: string | undefined,
  resolvingProfileIds: ReadonlySet<string>
): ChromeProxySetting {
  if (resolvingProfileIds.has(profileId)) {
    throw new Error(`虚拟配置存在循环引用：${profileId}`);
  }

  const profile = profilesById.get(profileId);
  if (!profile) {
    throw new Error(`当前配置不存在：${profileId}`);
  }

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
    case 'virtual':
      return buildProfileSetting(
        profile.target.profileId,
        profilesById,
        proxiesById,
        autoSwitchPac,
        new Set([...resolvingProfileIds, profileId])
      );
  }
}

function fixedProxySetting(
  profile: Extract<ProfileV2, { kind: 'fixed-proxy' }>,
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

  if (source.headers.length > 0) {
    throw new Error('PAC 地址不能附带自定义请求头；请改用内嵌 PAC 或移除请求头');
  }

  return {
    mode: 'pac_script',
    pacScript: { url: source.url, mandatory: true }
  };
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

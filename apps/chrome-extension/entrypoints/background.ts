import { applyConfiguration } from '../src/runtime/apply-configuration.ts';
import { createBackgroundService } from '../src/runtime/background-service.ts';
import {
  chromeCredentialRepository,
  chromeConfigurationRepository,
  chromeDiagnosticsRepository
} from '../src/runtime/chrome-repositories.ts';
import { createNetworkFailureRecorder } from '../src/runtime/network-failure-recorder.ts';
import { createProxyAuthenticationHandler } from '../src/runtime/proxy-auth.ts';
import { createProxyCredentialService } from '../src/runtime/proxy-credential-service.ts';
import {
  DIRECT_QUICK_RULE_MENU_ID,
  profileQuickRuleMenuId,
  proxyQuickRuleMenuId,
  quickRuleTargetFromMenuId
} from '../src/runtime/quick-rule-context-menu.ts';
import { setChromeProxySetting } from '../src/runtime/chrome-proxy.ts';
import {
  isBackgroundRequest,
  type BackgroundRequest,
  type BackgroundResponse
} from '../src/runtime/messages.ts';
import { compileAutoSwitchWithWasm } from '../src/runtime/wasm-runtime.ts';
import {
  addHostRuleToAutoSwitch,
  addHostRuleToAutoSwitchV2,
  resolveProfileV2,
  type ConfigurationDocument,
  type ProfileDocumentV2
} from '@switchypeformance/contracts';

export default defineBackground(() => {
  const service = createBackgroundService({
    apply: (document) =>
      applyConfiguration(document, {
        compileAutoSwitch: compileAutoSwitchWithWasm,
        setProxySetting: setChromeProxySetting
      }),
    configuration: chromeConfigurationRepository,
    diagnostics: chromeDiagnosticsRepository
  });

  const reapply = () => {
    void service.reapplyCurrent().catch(() => undefined);
    void rebuildQuickRuleMenus();
  };
  const authenticate = createProxyAuthenticationHandler({
    configuration: chromeConfigurationRepository,
    credentials: chromeCredentialRepository
  });
  const proxyCredentials = createProxyCredentialService({
    configuration: chromeConfigurationRepository,
    createCredentialId: () => `credential-${crypto.randomUUID()}`,
    credentials: chromeCredentialRepository,
    replace: (document) => service.replaceConfiguration(document)
  });
  const recordNetworkFailure = createNetworkFailureRecorder((event) =>
    chromeDiagnosticsRepository.append(event)
  );

  chrome.runtime.onInstalled.addListener(reapply);
  chrome.runtime.onStartup.addListener(reapply);
  chrome.proxy.onProxyError.addListener((details) => {
    void service.recordProxyError(details.error, details.details);
  });
  chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
      void recordNetworkFailure.record({ error: details.error, url: details.url });
    },
    { urls: ['<all_urls>'] }
  );
  chrome.webRequest.onAuthRequired.addListener(
    (details, callback) => {
      void authenticate
        .handle({
          challenger: details.challenger,
          isProxy: details.isProxy,
          requestId: details.requestId
        })
        .then((response) => {
          if (response && 'cancel' in response && response.cancel) {
            void service.recordProxyError(
              '代理认证在一次凭据尝试后被拒绝',
              `${details.challenger.host}:${details.challenger.port}`
            );
          }
          callback?.(response ?? {});
        })
        .catch((error: unknown) => {
          void service.recordProxyError('代理认证处理失败', errorMessage(error));
          callback?.({});
        });
      return undefined;
    },
    { urls: ['<all_urls>'] },
    ['asyncBlocking']
  );
  chrome.contextMenus.onClicked.addListener((info) => {
    const target = quickRuleTargetFromMenuId(String(info.menuItemId));
    if (!target) {
      return;
    }
    void addContextMenuRule(service, info.pageUrl ?? info.frameUrl, target);
  });
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    void handleMessage(service, proxyCredentials, message)
      .then(async (response) => {
        if (messageChangesProxyList(message)) {
          await rebuildQuickRuleMenus();
        }
        sendResponse(response);
      })
      .catch((error: unknown) => sendResponse({ ok: false, error: errorMessage(error) }));
    return true;
  });

  async function rebuildQuickRuleMenus(): Promise<void> {
    try {
      await chrome.contextMenus.removeAll();
      const document = await chromeConfigurationRepository.load();
      chrome.contextMenus.create({
        contexts: ['page'],
        id: DIRECT_QUICK_RULE_MENU_ID,
        title: '将此网站通过以下方式访问：直连'
      });
      if (document.schemaVersion === 1) {
        for (const proxy of document.proxies) {
          chrome.contextMenus.create({
            contexts: ['page'],
            id: proxyQuickRuleMenuId(proxy.id),
            title: `将此网站通过以下方式访问：${proxy.name}`
          });
        }
      } else {
        for (const profile of document.profiles) {
          if (profile.kind !== 'fixed-proxy') {
            continue;
          }
          chrome.contextMenus.create({
            contexts: ['page'],
            id: profileQuickRuleMenuId(profile.id),
            title: `将此网站通过以下方式访问：${profile.name}`
          });
        }
      }
    } catch (error) {
      await chromeDiagnosticsRepository.append({
        detail: errorMessage(error),
        level: 'error',
        message: '无法重建快捷规则菜单',
        scope: 'runtime'
      });
    }
  }

  async function addContextMenuRule(
    service: ReturnType<typeof createBackgroundService>,
    rawUrl: string | undefined,
    target: ReturnType<typeof quickRuleTargetFromMenuId>
  ): Promise<void> {
    if (!rawUrl || !target) {
      return;
    }
    try {
      const host = new URL(rawUrl).hostname;
      const document = await chromeConfigurationRepository.load();
      await service.replaceConfiguration(addQuickRule(document, host, target));
      await rebuildQuickRuleMenus();
    } catch (error) {
      await chromeDiagnosticsRepository.append({
        detail: errorMessage(error),
        level: 'error',
        message: '无法添加右键菜单规则',
        scope: 'runtime'
      });
    }
  }
});

async function handleMessage(
  service: ReturnType<typeof createBackgroundService>,
  proxyCredentials: ReturnType<typeof createProxyCredentialService>,
  message: unknown
): Promise<BackgroundResponse> {
  if (!isBackgroundRequest(message)) {
    return { ok: false, error: '不支持的后台请求' };
  }

  await dispatch(service, proxyCredentials, message);
  if (message.type === 'options.open') {
    return { ok: true };
  }
  return { ok: true, state: await service.snapshot() };
}

async function dispatch(
  service: ReturnType<typeof createBackgroundService>,
  proxyCredentials: ReturnType<typeof createProxyCredentialService>,
  message: BackgroundRequest
): Promise<void> {
  switch (message.type) {
    case 'state.get':
      return;
    case 'profile.activate':
      await service.activateProfile(message.profileId);
      return;
    case 'configuration.replace':
      await service.replaceConfiguration(message.document);
      return;
    case 'diagnostics.clear':
      await service.clearDiagnostics();
      return;
    case 'options.open':
      await chrome.runtime.openOptionsPage();
      return;
    case 'proxy.credentials.save':
      await proxyCredentials.save(message.proxyId, message.username, message.password);
      return;
    case 'proxy.credentials.clear':
      await proxyCredentials.clear(message.proxyId);
      return;
    case 'proxy.credentials.delete':
      await chromeCredentialRepository.remove(message.credentialId);
      return;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function messageChangesProxyList(message: unknown): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    !Array.isArray(message) &&
    (message as { type?: unknown }).type === 'configuration.replace'
  );
}

function addQuickRule(
  document: ConfigurationDocument,
  host: string,
  target: NonNullable<ReturnType<typeof quickRuleTargetFromMenuId>>
): ConfigurationDocument {
  const ruleId = `rule-${crypto.randomUUID()}`;
  if (document.schemaVersion === 1) {
    if (target.kind === 'profile') {
      throw new Error('旧配置不能把规则目标设为 V2 配置');
    }
    const automatic = v1AutomaticProfile(document);
    return addHostRuleToAutoSwitch(document, {
      host,
      profileId: automatic.id,
      ruleId,
      target
    });
  }

  const automatic = v2AutomaticProfile(document);
  const profileId =
    target.kind === 'direct'
      ? 'direct'
      : target.kind === 'system'
        ? 'system'
        : target.kind === 'profile'
          ? target.profileId
          : fixedProfileIdForLegacyProxy(document, target.proxyId);
  return addHostRuleToAutoSwitchV2(document, {
    host,
    profileId: automatic.id,
    ruleId,
    target: { profileId }
  });
}

function v1AutomaticProfile(document: Extract<ConfigurationDocument, { schemaVersion: 1 }>) {
  const active = document.profiles.find(
    (profile) => profile.kind === 'auto-switch' && profile.id === document.activeProfileId
  );
  const automatic = active ?? document.profiles.find((profile) => profile.kind === 'auto-switch');
  if (!automatic || automatic.kind !== 'auto-switch') {
    throw new Error('自动切换配置不存在');
  }
  return automatic;
}

function v2AutomaticProfile(document: ProfileDocumentV2) {
  const active = resolveProfileV2(document).profile;
  const automatic =
    active.kind === 'auto-switch'
      ? active
      : document.profiles.find((profile) => profile.kind === 'auto-switch');
  if (!automatic || automatic.kind !== 'auto-switch') {
    throw new Error('自动切换配置不存在');
  }
  return automatic;
}

function fixedProfileIdForLegacyProxy(document: ProfileDocumentV2, proxyId: string): string {
  const profile = document.profiles.find(
    (candidate) =>
      candidate.kind === 'fixed-proxy' &&
      (candidate.routes.fallbackProxyId === proxyId ||
        candidate.routes.httpProxyId === proxyId ||
        candidate.routes.httpsProxyId === proxyId ||
        candidate.routes.ftpProxyId === proxyId)
  );
  if (!profile) {
    throw new Error('V2 快捷规则需要选择固定代理配置');
  }
  return profile.id;
}

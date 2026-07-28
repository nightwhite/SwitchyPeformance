import { applyConfiguration } from '../src/runtime/apply-configuration.ts';
import { createBackgroundService } from '../src/runtime/background-service.ts';
import {
  chromeCredentialRepository,
  chromeConfigurationRepository,
  chromeDiagnosticsRepository
} from '../src/runtime/chrome-repositories.ts';
import { createNetworkFailureRecorder } from '../src/runtime/network-failure-recorder.ts';
import { createProxyAuthenticationHandler } from '../src/runtime/proxy-auth.ts';
import {
  bindProxyCredential,
  clearProxyCredential
} from '../src/runtime/proxy-credential-binding.ts';
import {
  DIRECT_QUICK_RULE_MENU_ID,
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
import { addHostRuleToAutoSwitch } from '@switchypeformance/contracts';

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
    void handleMessage(service, message)
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
      for (const proxy of document.proxies) {
        chrome.contextMenus.create({
          contexts: ['page'],
          id: proxyQuickRuleMenuId(proxy.id),
          title: `将此网站通过以下方式访问：${proxy.name}`
        });
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
      const automatic =
        document.profiles.find(
          (profile) => profile.kind === 'auto-switch' && profile.id === document.activeProfileId
        ) ?? document.profiles.find((profile) => profile.kind === 'auto-switch');
      if (!automatic || automatic.kind !== 'auto-switch') {
        throw new Error('自动切换配置不存在');
      }
      await service.replaceConfiguration(
        addHostRuleToAutoSwitch(document, {
          host,
          profileId: automatic.id,
          ruleId: `rule-${crypto.randomUUID()}`,
          target
        })
      );
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
  message: unknown
): Promise<BackgroundResponse> {
  if (!isBackgroundRequest(message)) {
    return { ok: false, error: '不支持的后台请求' };
  }

  await dispatch(service, message);
  if (message.type === 'options.open') {
    return { ok: true };
  }
  return { ok: true, state: await service.snapshot() };
}

async function dispatch(
  service: ReturnType<typeof createBackgroundService>,
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
      await saveProxyCredentials(service, message);
      return;
    case 'proxy.credentials.clear':
      await clearProxyCredentials(service, message.proxyId);
      return;
    case 'proxy.credentials.delete':
      await chromeCredentialRepository.remove(message.credentialId);
      return;
  }
}

async function saveProxyCredentials(
  service: ReturnType<typeof createBackgroundService>,
  message: Extract<BackgroundRequest, { type: 'proxy.credentials.save' }>
): Promise<void> {
  const document = await chromeConfigurationRepository.load();
  const proxy = document.proxies.find((candidate) => candidate.id === message.proxyId);
  if (!proxy) {
    throw new Error('代理不存在');
  }
  const credentialId = proxy.credentialId ?? `credential-${crypto.randomUUID()}`;
  await chromeCredentialRepository.save({
    id: credentialId,
    username: message.username,
    password: message.password
  });
  await service.replaceConfiguration(bindProxyCredential(document, proxy.id, credentialId));
}

async function clearProxyCredentials(
  service: ReturnType<typeof createBackgroundService>,
  proxyId: string
): Promise<void> {
  const document = await chromeConfigurationRepository.load();
  const proxy = document.proxies.find((candidate) => candidate.id === proxyId);
  if (!proxy) {
    throw new Error('代理不存在');
  }
  await service.replaceConfiguration(clearProxyCredential(document, proxy.id));
  if (proxy.credentialId) {
    await chromeCredentialRepository.remove(proxy.credentialId);
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

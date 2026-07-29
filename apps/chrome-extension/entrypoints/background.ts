import { applyConfiguration } from '../src/runtime/apply-configuration.ts';
import { createBackgroundService } from '../src/runtime/background-service.ts';
import {
  chromeCredentialRepository,
  chromeConfigurationRepository,
  chromeDiagnosticsRepository,
  chromeNetworkEventRepository,
  chromeSourceStatusRepository,
  chromeTemporaryRuleRepository
} from '../src/runtime/chrome-repositories.ts';
import { createNetworkMonitor } from '../src/runtime/network-monitor.ts';
import type { NetworkEventRepository } from '../src/runtime/network-event-repository.ts';
import { createPacSourceService } from '../src/runtime/pac-source-service.ts';
import { createRuleListService } from '../src/runtime/rule-list-service.ts';
import { createRoutingApplicationService } from '../src/runtime/routing-application-service.ts';
import { createRoutingDocumentPipeline } from '../src/runtime/routing-document-pipeline.ts';
import { createSourceRefreshLifecycle } from '../src/runtime/source-refresh-lifecycle.ts';
import { SOURCE_REFRESH_ALARM } from '../src/runtime/source-refresh-scheduler.ts';
import { createProxyAuthenticationHandler } from '../src/runtime/proxy-auth.ts';
import { createProxyCredentialService } from '../src/runtime/proxy-credential-service.ts';
import { createProfileActivationService } from '../src/runtime/profile-activation-service.ts';
import { explainCurrentRoute, type CurrentRouteStatus } from '../src/runtime/current-route.ts';
import { addCurrentSiteRule } from '../src/runtime/quick-site-rule.ts';
import { TEMPORARY_RULE_EXPIRY_ALARM } from '../src/runtime/temporary-rule-alarm.ts';
import { createTemporaryRuleLifecycle } from '../src/runtime/temporary-rule-lifecycle.ts';
import {
  createTemporaryRuleService,
  type TemporaryRuleService
} from '../src/runtime/temporary-rule-service.ts';
import { createTemporaryRoutingDocumentService } from '../src/runtime/temporary-routing-document.ts';
import {
  DIRECT_QUICK_RULE_MENU_ID,
  contextTargetFromClick,
  profileQuickRuleMenuId,
  proxyQuickRuleMenuId,
  quickRuleMenuContexts,
  quickRuleTargetFromMenuId
} from '../src/runtime/quick-rule-context-menu.ts';
import { nextProfileId, profileCycleIds } from '../src/runtime/shortcut-service.ts';
import { createSourceFetcher } from '../src/runtime/source-fetcher.ts';
import { summarizeTabNetworkEvents } from '../src/runtime/tab-network-summary.ts';
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
  const temporaryRules = createTemporaryRuleService({
    repository: chromeTemporaryRuleRepository
  });
  const routingDocuments = createTemporaryRoutingDocumentService({ temporaryRules });
  const sourceFetcher = createSourceFetcher({ fetch: (url, request) => fetch(url, request) });
  const pacSources = createPacSourceService({
    fetcher: sourceFetcher,
    statuses: chromeSourceStatusRepository
  });
  const ruleLists = createRuleListService({
    fetcher: sourceFetcher,
    statuses: chromeSourceStatusRepository
  });
  const routingPipeline = createRoutingDocumentPipeline({
    pacSources,
    ruleLists,
    temporaryRules: routingDocuments
  });
  const routingApplication = createRoutingApplicationService({
    applyEffective: (document) =>
      applyConfiguration(document, {
        compileAutoSwitch: compileAutoSwitchWithWasm,
        setProxySetting: setChromeProxySetting
      }),
    explainEffective: explainCurrentRoute,
    routingDocuments: routingPipeline
  });
  const service = createBackgroundService({
    apply: routingApplication.apply,
    configuration: chromeConfigurationRepository,
    diagnostics: chromeDiagnosticsRepository,
    sources: chromeSourceStatusRepository
  });
  const profileActivation = createProfileActivationService({
    activate: (profileId) => service.activateProfile(profileId),
    async queryActiveTab() {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return tab;
    },
    reloadTab: (tabId) => chrome.tabs.reload(tabId),
    reportRefreshFailure: (message, detail) =>
      chromeDiagnosticsRepository.append({
        detail,
        level: 'error',
        message,
        scope: 'runtime'
      })
  });
  const temporaryRuleLifecycle = createTemporaryRuleLifecycle({
    alarms: chrome.alarms,
    loadConfiguration: () => chromeConfigurationRepository.load(),
    reapply: () => service.reapplyCurrent(),
    temporaryRules
  });
  const sourceRefreshLifecycle = createSourceRefreshLifecycle({
    alarms: chrome.alarms,
    listStatuses: () => chromeSourceStatusRepository.list(),
    loadConfiguration: () => chromeConfigurationRepository.load(),
    reapply: () => service.reapplyCurrent(),
    refresh: (document, target) =>
      target.kind === 'pac'
        ? pacSources.refreshSource(document, target.ownerId)
        : ruleLists.refreshSource(document, target.ownerId),
    async reportFailure(target, error) {
      await chromeDiagnosticsRepository.append({
        detail: errorMessage(error),
        level: 'error',
        message: `刷新${target.kind === 'pac' ? 'PAC' : '规则列表'}来源失败：${target.name}`,
        scope: 'runtime'
      });
    }
  });

  const reapply = () => {
    void reapplyAndSchedule();
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
  const networkMonitor = createNetworkMonitor({ repository: chromeNetworkEventRepository });
  const networkRequestFilter = { urls: ['<all_urls>'] };
  let networkMonitoringListenersAttached = false;

  chrome.runtime.onInstalled.addListener(reapply);
  chrome.runtime.onStartup.addListener(reapply);
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === TEMPORARY_RULE_EXPIRY_ALARM) {
      void temporaryRuleLifecycle.synchronize().catch(() => undefined);
    }
    if (alarm.name === SOURCE_REFRESH_ALARM) {
      void sourceRefreshLifecycle.refreshDue().catch((error: unknown) => {
        void chromeDiagnosticsRepository.append({
          detail: errorMessage(error),
          level: 'error',
          message: '定时刷新来源失败',
          scope: 'runtime'
        });
      });
    }
  });
  chrome.proxy.onProxyError.addListener((details) => {
    void service.recordProxyError(details.error, details.details);
  });
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
    const clickTarget = contextTargetFromClick(info);
    if (!target || !clickTarget) {
      return;
    }
    void addContextMenuRule(service, clickTarget.url, clickTarget.source, target);
  });
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command !== 'switch-profile-next') {
      return;
    }
    void activateNextProfile(tab).catch((error: unknown) => {
      void chromeDiagnosticsRepository.append({
        detail: errorMessage(error),
        level: 'error',
        message: '快捷切换配置失败',
        scope: 'runtime'
      });
    });
  });
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    void temporaryRuleLifecycle
      .synchronize()
      .then(() =>
        handleMessage(
          service,
          proxyCredentials,
          profileActivation,
          temporaryRules,
          routingApplication,
          temporaryRuleLifecycle,
          sourceRefreshLifecycle,
          chromeNetworkEventRepository,
          message
        )
      )
      .then(async (response) => {
        if (messageChangesProxyList(message)) {
          await synchronizeNetworkMonitor();
          void synchronizeSourceRefresh();
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
        contexts: [...quickRuleMenuContexts],
        id: DIRECT_QUICK_RULE_MENU_ID,
        title: '将此网址加入自动切换：直连'
      });
      if (document.schemaVersion === 1) {
        for (const proxy of document.proxies) {
          chrome.contextMenus.create({
            contexts: [...quickRuleMenuContexts],
            id: proxyQuickRuleMenuId(proxy.id),
            title: `将此网址加入自动切换：${proxy.name}`
          });
        }
      } else {
        for (const profile of document.profiles) {
          if (profile.kind !== 'fixed-proxy') {
            continue;
          }
          chrome.contextMenus.create({
            contexts: [...quickRuleMenuContexts],
            id: profileQuickRuleMenuId(profile.id),
            title: `将此网址加入自动切换：${profile.name}`
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

  async function reapplyAndSchedule(): Promise<void> {
    try {
      await temporaryRuleLifecycle.reapplyAndSchedule();
    } catch (error) {
      await reportRuntimeFailure('应用启动代理配置失败', error);
    }
    try {
      await synchronizeNetworkMonitor();
    } catch (error) {
      await reportRuntimeFailure('无法读取网络监控设置', error);
    }
    await synchronizeSourceRefresh();
    await rebuildQuickRuleMenus();
  }

  async function synchronizeSourceRefresh(): Promise<void> {
    try {
      await sourceRefreshLifecycle.synchronize();
    } catch (error) {
      await reportRuntimeFailure('无法安排来源刷新', error);
    }
  }

  async function synchronizeNetworkMonitor(): Promise<void> {
    const document = await chromeConfigurationRepository.load();
    const enabled = document.schemaVersion === 2 && document.settings.networkMonitor.enabled;
    networkMonitor.setEnabled(enabled);
    if (enabled) {
      attachNetworkMonitoringListeners();
      return;
    }
    detachNetworkMonitoringListeners();
  }

  function attachNetworkMonitoringListeners(): void {
    if (networkMonitoringListenersAttached) {
      return;
    }
    chrome.webRequest.onBeforeRequest.addListener(onNetworkStarted, networkRequestFilter);
    chrome.webRequest.onHeadersReceived.addListener(onNetworkHeaders, networkRequestFilter);
    chrome.webRequest.onBeforeRedirect.addListener(onNetworkRedirected, networkRequestFilter);
    chrome.webRequest.onCompleted.addListener(onNetworkCompleted, networkRequestFilter);
    chrome.webRequest.onErrorOccurred.addListener(onNetworkFailed, networkRequestFilter);
    networkMonitoringListenersAttached = true;
  }

  function detachNetworkMonitoringListeners(): void {
    if (!networkMonitoringListenersAttached) {
      return;
    }
    chrome.webRequest.onBeforeRequest.removeListener(onNetworkStarted);
    chrome.webRequest.onHeadersReceived.removeListener(onNetworkHeaders);
    chrome.webRequest.onBeforeRedirect.removeListener(onNetworkRedirected);
    chrome.webRequest.onCompleted.removeListener(onNetworkCompleted);
    chrome.webRequest.onErrorOccurred.removeListener(onNetworkFailed);
    networkMonitoringListenersAttached = false;
  }

  function onNetworkStarted(details: chrome.webRequest.OnBeforeRequestDetails): undefined {
    if (!networkMonitor.isEnabled()) {
      return undefined;
    }
    recordNetworkEvent(
      networkMonitor.onStarted({
        requestId: details.requestId,
        tabId: details.tabId,
        timestamp: details.timeStamp,
        url: details.url
      })
    );
    return undefined;
  }

  function onNetworkHeaders(details: chrome.webRequest.OnHeadersReceivedDetails): undefined {
    if (!networkMonitor.isEnabled()) {
      return undefined;
    }
    recordNetworkEvent(
      networkMonitor.onHeaders({
        requestId: details.requestId,
        statusCode: details.statusCode,
        tabId: details.tabId,
        timestamp: details.timeStamp,
        url: details.url
      })
    );
    return undefined;
  }

  function onNetworkRedirected(details: chrome.webRequest.OnBeforeRedirectDetails): void {
    if (!networkMonitor.isEnabled()) {
      return;
    }
    recordNetworkEvent(
      networkMonitor.onRedirected({
        requestId: details.requestId,
        statusCode: details.statusCode,
        tabId: details.tabId,
        timestamp: details.timeStamp,
        url: details.url
      })
    );
  }

  function onNetworkCompleted(details: chrome.webRequest.OnCompletedDetails): void {
    if (!networkMonitor.isEnabled()) {
      return;
    }
    recordNetworkEvent(
      networkMonitor.onCompleted({
        requestId: details.requestId,
        statusCode: details.statusCode,
        tabId: details.tabId,
        timestamp: details.timeStamp,
        url: details.url
      })
    );
  }

  function onNetworkFailed(details: chrome.webRequest.OnErrorOccurredDetails): void {
    if (!networkMonitor.isEnabled()) {
      return;
    }
    recordNetworkEvent(
      networkMonitor.onFailed({
        error: details.error,
        requestId: details.requestId,
        tabId: details.tabId,
        timestamp: details.timeStamp,
        url: details.url
      })
    );
  }

  function recordNetworkEvent(recording: Promise<void> | undefined): void {
    if (recording) {
      void recording.catch(() => undefined);
    }
  }

  async function reportRuntimeFailure(message: string, error: unknown): Promise<void> {
    try {
      await chromeDiagnosticsRepository.append({
        detail: errorMessage(error),
        level: 'error',
        message,
        scope: 'runtime'
      });
    } catch {
      // A diagnostics failure must never stop Chrome proxy recovery.
    }
  }

  async function addContextMenuRule(
    service: ReturnType<typeof createBackgroundService>,
    rawUrl: string,
    source: 'frame' | 'link' | 'media' | 'page',
    target: ReturnType<typeof quickRuleTargetFromMenuId>
  ): Promise<void> {
    if (!target) {
      return;
    }
    try {
      const host = new URL(rawUrl).hostname;
      const document = await chromeConfigurationRepository.load();
      await service.replaceConfiguration(addQuickRule(document, host, target));
      await rebuildQuickRuleMenus();
      await chromeDiagnosticsRepository.append({
        detail: `右键目标：${quickRuleSourceLabel(source)}`,
        level: 'info',
        message: '已添加自动切换规则',
        scope: 'configuration',
        target: rawUrl
      });
    } catch (error) {
      await chromeDiagnosticsRepository.append({
        detail: errorMessage(error),
        level: 'error',
        message: '无法添加右键菜单规则',
        scope: 'runtime'
      });
    }
  }

  async function activateNextProfile(
    tab: { id?: number | undefined; url?: string | undefined } | undefined
  ): Promise<void> {
    const document = await chromeConfigurationRepository.load();
    const nextProfile = nextProfileId(profileCycleIds(document), document.activeProfileId);
    if (!nextProfile || nextProfile === document.activeProfileId) {
      return;
    }
    await profileActivation.activate(nextProfile, tab);
  }

  void synchronizeNetworkMonitor().catch(() => undefined);
});

async function handleMessage(
  service: ReturnType<typeof createBackgroundService>,
  proxyCredentials: ReturnType<typeof createProxyCredentialService>,
  profileActivation: ReturnType<typeof createProfileActivationService>,
  temporaryRules: TemporaryRuleService,
  routingApplication: ReturnType<typeof createRoutingApplicationService>,
  temporaryRuleLifecycle: ReturnType<typeof createTemporaryRuleLifecycle>,
  sourceRefreshLifecycle: ReturnType<typeof createSourceRefreshLifecycle>,
  networkEvents: Pick<NetworkEventRepository, 'clear' | 'list'>,
  message: unknown
): Promise<BackgroundResponse> {
  if (!isBackgroundRequest(message)) {
    return { ok: false, error: '不支持的后台请求' };
  }

  const routeStatus = await dispatch(
    service,
    proxyCredentials,
    profileActivation,
    temporaryRules,
    routingApplication,
    sourceRefreshLifecycle,
    networkEvents,
    message
  );
  await temporaryRuleLifecycle.synchronize();
  if (message.type === 'options.open') {
    return { ok: true };
  }
  const snapshot = await service.snapshot();
  const allNetworkEvents =
    message.type === 'state.get' || message.type === 'network.events.list'
      ? await networkEvents.list()
      : undefined;
  const requestedNetworkEvents =
    message.type === 'network.events.list' && allNetworkEvents !== undefined
      ? filterNetworkEvents(allNetworkEvents, message.tabId)
      : undefined;
  return {
    ok: true,
    ...(routeStatus === undefined ? {} : { routeStatus }),
    ...(requestedNetworkEvents === undefined ? {} : { networkEvents: requestedNetworkEvents }),
    state: {
      ...snapshot,
      temporaryRules: await temporaryRules.list(snapshot.configuration),
      ...(allNetworkEvents === undefined
        ? {}
        : { networkSummary: summarizeTabNetworkEvents(allNetworkEvents) })
    }
  };
}

async function dispatch(
  service: ReturnType<typeof createBackgroundService>,
  proxyCredentials: ReturnType<typeof createProxyCredentialService>,
  profileActivation: ReturnType<typeof createProfileActivationService>,
  temporaryRules: TemporaryRuleService,
  routingApplication: ReturnType<typeof createRoutingApplicationService>,
  sourceRefreshLifecycle: ReturnType<typeof createSourceRefreshLifecycle>,
  networkEvents: Pick<NetworkEventRepository, 'clear'>,
  message: BackgroundRequest
): Promise<CurrentRouteStatus | undefined> {
  switch (message.type) {
    case 'state.get':
      return undefined;
    case 'profile.activate':
      await profileActivation.activate(message.profileId);
      return undefined;
    case 'configuration.replace':
      await service.replaceConfiguration(message.document);
      return undefined;
    case 'route.explain':
      return routingApplication.explain(await chromeConfigurationRepository.load(), message.url);
    case 'quick-rule.add':
      await service.mutateConfiguration((document) =>
        addCurrentSiteRule(document, {
          automaticProfileId: message.automaticProfileId,
          condition: message.condition,
          host: message.host,
          ruleId: `rule-${crypto.randomUUID()}`,
          scope: message.scope,
          target: message.target
        })
      );
      return undefined;
    case 'temporary-rule.add': {
      const document = await chromeConfigurationRepository.load();
      await temporaryRules.add(document, {
        automaticProfileId: message.automaticProfileId,
        condition: message.condition,
        expiresAt: message.expiresAt,
        host: message.host,
        scope: message.scope,
        target: message.target
      });
      await service.reapplyCurrent();
      return undefined;
    }
    case 'temporary-rule.remove':
      if (await temporaryRules.remove(message.ruleId)) {
        await service.reapplyCurrent();
      }
      return undefined;
    case 'temporary-rule.clear':
      if (await temporaryRules.clear()) {
        await service.reapplyCurrent();
      }
      return undefined;
    case 'network.events.clear':
      await networkEvents.clear();
      return undefined;
    case 'network.events.list':
      return undefined;
    case 'source.refresh':
      await sourceRefreshLifecycle.refresh(message.sourceId);
      return undefined;
    case 'diagnostics.clear':
      await service.clearDiagnostics();
      return undefined;
    case 'options.open':
      await chrome.runtime.openOptionsPage();
      return undefined;
    case 'proxy.credentials.save':
      await proxyCredentials.save(message.proxyId, message.username, message.password);
      return undefined;
    case 'proxy.credentials.clear':
      await proxyCredentials.clear(message.proxyId);
      return undefined;
    case 'proxy.credentials.delete':
      await chromeCredentialRepository.remove(message.credentialId);
      return undefined;
  }
}

function filterNetworkEvents(
  events: readonly import('../src/runtime/network-event-repository.ts').NetworkEvent[],
  tabId: number | undefined
) {
  return tabId === undefined ? events : events.filter((event) => event.tabId === tabId);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function quickRuleSourceLabel(source: 'frame' | 'link' | 'media' | 'page'): string {
  switch (source) {
    case 'link':
      return '链接';
    case 'media':
      return '媒体资源';
    case 'frame':
      return '框架';
    case 'page':
      return '网页';
  }
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

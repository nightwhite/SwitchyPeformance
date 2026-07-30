import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  Plus,
  RefreshCw,
  Route,
  Settings2,
  TriangleAlert,
  Zap
} from 'lucide-react';

import type { ConfigurationDocument } from '@switchypeformance/contracts';

import {
  requestBackgroundState,
  requestCurrentRoute,
  requestNetworkEvents,
  routeOptions,
  routeOptionsV2,
  sendBackgroundCommand,
  targetFromValue,
  targetFromValueV2
} from '../../src/ui/background-client.ts';
import { toUserFacingMessage } from '../../src/ui/error-message.ts';
import { FailureActionMenu } from '../../src/ui/components/FailureActionMenu.tsx';
import {
  recentDiagnosticFailures,
  recentNetworkFailures,
  type FailureAction,
  type FailureResource
} from '../../src/ui/diagnostics/failure-remediation.ts';
import {
  temporaryRuleExpiry,
  type TemporaryRuleDuration
} from '../../src/ui/components/temporary-rule-form.ts';
import {
  automaticProfileOptions,
  buildCurrentSiteRule,
  defaultAutomaticProfileId,
  type CurrentSiteScope
} from '../../src/ui/popup/current-site-rule.ts';
import { loadCurrentTab, type CurrentTab } from '../../src/ui/popup/current-tab.ts';
import { popupMenuActions, type PopupView } from '../../src/ui/popup/popup-menu-model.ts';
import { PopupRuleForm } from '../../src/ui/popup/PopupRuleForm.tsx';
import { setPopupDefaultTarget } from '../../src/ui/original/popup/default-target.ts';
import { OriginalPopupMenu } from '../../src/ui/original/popup/OriginalPopupMenu.tsx';
import type { CurrentRouteStatus } from '../../src/runtime/current-route.ts';
import type { BackgroundState, QuickRuleTarget } from '../../src/runtime/messages.ts';

export function PopupApp() {
  const [state, setState] = useState<BackgroundState>();
  const [currentTab, setCurrentTab] = useState<CurrentTab>();
  const [routeStatus, setRouteStatus] = useState<CurrentRouteStatus>();
  const [automaticProfileId, setAutomaticProfileId] = useState<string>();
  const [ruleScope, setRuleScope] = useState<CurrentSiteScope>('domain');
  const [ruleTarget, setRuleTarget] = useState('');
  const [temporaryDuration, setTemporaryDuration] = useState<TemporaryRuleDuration>('30m');
  const [failures, setFailures] = useState<readonly FailureResource[]>([]);
  const [failureRoutes, setFailureRoutes] = useState<Record<string, CurrentRouteStatus>>({});
  const [expandedFailureKey, setExpandedFailureKey] = useState<string>();
  const [view, setView] = useState<PopupView>('menu');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const document = state?.configuration;
  const targetOptions = useMemo(() => {
    if (!document) {
      return [];
    }
    return document.schemaVersion === 1 ? routeOptions(document) : routeOptionsV2(document);
  }, [document]);
  const automaticProfiles = useMemo(
    () => (document ? automaticProfileOptions(document) : []),
    [document]
  );
  const availableTab = currentTab?.available ? currentTab : undefined;
  const effectiveAutomaticProfileId = automaticProfiles.some(
    (profile) => profile.id === automaticProfileId
  )
    ? automaticProfileId
    : defaultAutomaticProfileIdOrUndefined(document);
  const effectiveRuleTarget = targetOptions.some((option) => option.value === ruleTarget)
    ? ruleTarget
    : targetOptions[0]?.value;
  const rulePreview = useMemo(() => {
    if (!availableTab) {
      return undefined;
    }
    try {
      const condition = buildCurrentSiteRule(availableTab.url, ruleScope).condition;
      return condition.pattern;
    } catch {
      return undefined;
    }
  }, [availableTab, ruleScope]);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!document) {
      return;
    }
    setAutomaticProfileId((current) =>
      automaticProfiles.some((profile) => profile.id === current)
        ? current
        : defaultAutomaticProfileId(document)
    );
    setRuleTarget((current) =>
      targetOptions.some((option) => option.value === current)
        ? current
        : (targetOptions[0]?.value ?? '')
    );
  }, [automaticProfiles, document, targetOptions]);

  async function refresh(): Promise<void> {
    setError(undefined);
    try {
      const [nextState, nextTab] = await Promise.all([
        requestBackgroundState({ type: 'state.get' }),
        loadCurrentTab()
      ]);
      await applyPopupState(nextState, nextTab);
    } catch (cause) {
      setError(messageFor(cause));
    }
  }

  async function activate(profileId: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const nextState = await requestBackgroundState({ type: 'profile.activate', profileId });
      await applyPopupState(nextState, currentTab ?? (await loadCurrentTab()));
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function changeDefaultTarget(profileId: string, targetProfileId: string): Promise<void> {
    if (!document || document.schemaVersion !== 2) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const nextDocument = setPopupDefaultTarget(document, profileId, targetProfileId);
      const nextState = await requestBackgroundState({
        type: 'configuration.replace',
        document: nextDocument
      });
      await applyPopupState(nextState, currentTab ?? (await loadCurrentTab()));
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function addQuickRule(url: string, scope: CurrentSiteScope): Promise<void> {
    await applyRule(url, scope, effectiveRuleTarget, false);
  }

  async function addTemporaryRule(url: string, scope: CurrentSiteScope): Promise<void> {
    await applyRule(url, scope, effectiveRuleTarget, true);
  }

  async function applyRule(
    url: string,
    scope: CurrentSiteScope,
    targetValue: string | undefined,
    temporary: boolean
  ): Promise<void> {
    if (!document || !effectiveAutomaticProfileId || !targetValue) {
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      const siteRule = buildCurrentSiteRule(url, scope);
      const target = quickRuleTarget(document, targetValue);
      const nextState = temporary
        ? await requestBackgroundState({
            type: 'temporary-rule.add',
            automaticProfileId: effectiveAutomaticProfileId,
            condition: siteRule.condition,
            expiresAt: temporaryRuleExpiry(temporaryDuration, Date.now()),
            host: siteRule.host,
            scope,
            target
          })
        : await requestBackgroundState({
            type: 'quick-rule.add',
            automaticProfileId: effectiveAutomaticProfileId,
            condition: siteRule.condition,
            host: siteRule.host,
            scope,
            target
          });
      await applyPopupState(nextState, currentTab ?? (await loadCurrentTab()));
      setView('menu');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function applyPopupState(nextState: BackgroundState, tab: CurrentTab): Promise<void> {
    setState(nextState);
    setCurrentTab(tab);
    if (!tab.available) {
      setRouteStatus(undefined);
      setFailures([]);
      setFailureRoutes({});
      setExpandedFailureKey(undefined);
      return;
    }
    void refreshFailureResources(tab, nextState.diagnostics);
    try {
      setRouteStatus(await requestCurrentRoute(tab.url));
    } catch (cause) {
      setRouteStatus(undefined);
      setError(messageFor(cause));
    }
  }

  async function refreshFailureResources(
    tab: Extract<CurrentTab, { available: true }>,
    diagnostics: BackgroundState['diagnostics']
  ): Promise<void> {
    if (tab.tabId === undefined) {
      await setFailureResources(recentDiagnosticFailures(diagnostics));
      return;
    }
    try {
      const networkFailures = recentNetworkFailures(await requestNetworkEvents(tab.tabId));
      await setFailureResources(
        networkFailures.length > 0
          ? networkFailures
          : recentDiagnosticFailures(diagnostics, 6, tab.tabId)
      );
    } catch {
      await setFailureResources(recentDiagnosticFailures(diagnostics, 6, tab.tabId));
    }
  }

  async function setFailureResources(nextFailures: readonly FailureResource[]): Promise<void> {
    setFailures(nextFailures);
    setExpandedFailureKey((current) =>
      current && nextFailures.some((failure) => failure.key === current) ? current : undefined
    );
    const routes = await Promise.all(
      nextFailures.map(async (failure) => {
        try {
          return [failure.key, await requestCurrentRoute(failure.url)] as const;
        } catch {
          return undefined;
        }
      })
    );
    setFailureRoutes(
      Object.fromEntries(
        routes.filter(
          (route): route is readonly [string, CurrentRouteStatus] => route !== undefined
        )
      )
    );
  }

  async function handleFailureAction(
    failure: FailureResource,
    action: FailureAction
  ): Promise<void> {
    if (action === 'inspect-route') {
      setBusy(true);
      setError(undefined);
      try {
        const status = await requestCurrentRoute(failure.url);
        setFailureRoutes((current) => ({ ...current, [failure.key]: status }));
      } catch (cause) {
        setError(messageFor(cause));
      } finally {
        setBusy(false);
      }
      return;
    }
    const target =
      action === 'add-direct-rule' || action === 'add-temporary-direct-rule'
        ? document && directRouteValue(document)
        : effectiveRuleTarget;
    await applyRule(
      failure.url,
      'host',
      target,
      action === 'add-temporary-direct-rule' || action === 'add-temporary-proxy-rule'
    );
  }

  async function openOptions(): Promise<void> {
    setError(undefined);
    try {
      await sendBackgroundCommand({ type: 'options.open' });
    } catch (cause) {
      setError(messageFor(cause));
    }
  }

  const ruleActionAvailable = Boolean(
    availableTab && effectiveAutomaticProfileId && effectiveRuleTarget
  );
  const canAddRule = ruleActionAvailable && !busy;
  const proxyActionAvailable = Boolean(
    document && effectiveRuleTarget && effectiveRuleTarget !== directRouteValue(document)
  );
  const menuActions = popupMenuActions({
    canAddRule: ruleActionAvailable,
    canAddTemporaryRule: ruleActionAvailable,
    failureCount: failures.length,
    pageAvailable: availableTab !== undefined
  });
  const builtinProfiles = document?.profiles.filter(
    (profile) => profile.kind === 'direct' || profile.kind === 'system'
  );
  const customProfiles = document?.profiles.filter(
    (profile) => profile.kind !== 'direct' && profile.kind !== 'system'
  );

  return (
    <main className="popup-shell">
      {view === 'menu' && document?.schemaVersion !== 2 ? (
        <header className="popup-header">
          <div className="brand-mark" aria-hidden="true">
            <Zap size={17} strokeWidth={2.5} />
          </div>
          <div className="brand-copy">
            <strong>SwitchyPeformance</strong>
            <span>Chrome 代理路由</span>
          </div>
          <button className="icon-button" onClick={() => void refresh()} title="刷新" type="button">
            <RefreshCw size={16} />
          </button>
          <button
            className="icon-button"
            onClick={() => void openOptions()}
            title="打开设置"
            type="button"
          >
            <Settings2 size={16} />
          </button>
        </header>
      ) : null}

      {error ? <p className="popup-error">{error}</p> : null}

      {view === 'menu' && document?.schemaVersion === 2 ? (
        <OriginalPopupMenu
          busy={busy}
          currentHost={availableTab?.host}
          document={document}
          failureCount={failures.length}
          onActivate={activate}
          onChangeDefaultTarget={changeDefaultTarget}
          onOpenFailures={() => setView('failure-list')}
          onOpenOptions={() => void openOptions()}
          onOpenPermanentRule={() => setView('rule-form')}
          onOpenRoute={() => setView('route-info')}
          onOpenTemporaryRule={() => setView('temporary-form')}
          onRefresh={() => void refresh()}
        />
      ) : null}

      {view === 'menu' && document?.schemaVersion !== 2 ? (
        <>
          <section className="popup-menu" aria-label="代理配置">
            <div className="profile-list">
              {builtinProfiles?.map((profile) => (
                <ProfileChoice
                  active={profile.id === document?.activeProfileId}
                  busy={busy}
                  key={profile.id}
                  onActivate={activate}
                  profile={profile}
                />
              ))}
              {builtinProfiles?.length && customProfiles?.length ? (
                <div className="popup-menu-divider" role="separator" />
              ) : null}
              {customProfiles?.map((profile) => (
                <ProfileChoice
                  active={profile.id === document?.activeProfileId}
                  busy={busy}
                  key={profile.id}
                  onActivate={activate}
                  profile={profile}
                />
              ))}
              {!document ? <p className="popup-loading">正在读取代理配置。</p> : null}
            </div>
          </section>

          {menuActions.length > 0 ? (
            <nav className="popup-menu-actions" aria-label="当前网站操作">
              {menuActions.map((action) => (
                <button
                  className="popup-menu-action"
                  disabled={busy}
                  key={action.id}
                  onClick={() => setView(action.view)}
                  type="button"
                >
                  <PopupMenuActionIcon id={action.id} />
                  <span>{action.label}</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              ))}
            </nav>
          ) : (
            <p className="popup-hint popup-menu-hint">当前页面不能添加规则。</p>
          )}

          <footer className="popup-footer">
            <span>
              {state?.diagnostics.filter((event) => event.level === 'error').length ?? 0} 条近期错误
            </span>
            <button className="link-button" onClick={() => void openOptions()} type="button">
              选项
              <ExternalLink size={14} />
            </button>
          </footer>
        </>
      ) : null}

      {view === 'rule-form' ? (
        <section className="popup-workspace" aria-label="添加当前网站规则">
          <PopupViewHeading onBack={() => setView('menu')} title="为当前网站添加规则" />
          <PopupRuleForm
            automaticProfileId={effectiveAutomaticProfileId}
            automaticProfiles={automaticProfiles}
            busy={busy}
            canSubmit={canAddRule}
            mode="permanent"
            onAutomaticProfileChange={setAutomaticProfileId}
            onRuleScopeChange={setRuleScope}
            onRouteChange={setRuleTarget}
            onSubmit={(url, scope) => void addQuickRule(url, scope)}
            onTemporaryDurationChange={setTemporaryDuration}
            rulePreview={rulePreview}
            ruleScope={ruleScope}
            routeOptions={targetOptions}
            routeValue={effectiveRuleTarget}
            tab={availableTab}
            temporaryDuration={temporaryDuration}
          />
        </section>
      ) : null}

      {view === 'temporary-form' ? (
        <section className="popup-workspace" aria-label="添加临时规则">
          <PopupViewHeading onBack={() => setView('menu')} title="临时规则" />
          <PopupRuleForm
            automaticProfileId={effectiveAutomaticProfileId}
            automaticProfiles={automaticProfiles}
            busy={busy}
            canSubmit={canAddRule}
            mode="temporary"
            onAutomaticProfileChange={setAutomaticProfileId}
            onRuleScopeChange={setRuleScope}
            onRouteChange={setRuleTarget}
            onSubmit={(url, scope) => void addTemporaryRule(url, scope)}
            onTemporaryDurationChange={setTemporaryDuration}
            rulePreview={rulePreview}
            ruleScope={ruleScope}
            routeOptions={targetOptions}
            routeValue={effectiveRuleTarget}
            tab={availableTab}
            temporaryDuration={temporaryDuration}
          />
        </section>
      ) : null}

      {view === 'route-info' ? (
        <section className="popup-workspace" aria-label="当前路由说明">
          <PopupViewHeading onBack={() => setView('menu')} title="当前路由" />
          {availableTab && routeStatus ? (
            <>
              <dl className="route-details">
                <div>
                  <dt>实际配置</dt>
                  <dd>{profileLabel(document, routeStatus.resolvedProfileId)}</dd>
                </div>
                <div>
                  <dt>本页结果</dt>
                  <dd>{routeTargetLabel(document, routeStatus)}</dd>
                </div>
                <div>
                  <dt>匹配来源</dt>
                  <dd>{routeStatus.matchedRuleId ?? routeReasonLabel(routeStatus.reason)}</dd>
                </div>
              </dl>
              {routeStatus.warnings.length ? (
                <p className="route-warning">
                  <TriangleAlert size={14} />
                  {routeStatus.warnings.map(routeWarningLabel).join('；')}
                </p>
              ) : null}
            </>
          ) : (
            <p className="popup-hint">正在计算当前页面的路由结果。</p>
          )}
        </section>
      ) : null}

      {view === 'failure-list' ? (
        <section className="popup-workspace" aria-label="失败资源">
          <PopupViewHeading
            onBack={() => setView('menu')}
            title={failures.length > 0 ? `失败资源 (${failures.length})` : '失败资源'}
          />
          {failures.length > 0 ? (
            <div className="failure-list">
              {failures.map((failure) => {
                const failureRoute = failureRoutes[failure.key];
                const expanded = expandedFailureKey === failure.key;
                return (
                  <div className="failure-entry" key={failure.key}>
                    <div className="failure-row" title={failure.url}>
                      <span className="failure-resource">
                        <strong className="failure-host">{failure.host}</strong>
                        <small className="failure-error">{failure.error}</small>
                      </span>
                      <button
                        aria-expanded={expanded}
                        aria-label={`处理 ${failure.host} 的失败资源`}
                        className="icon-button"
                        onClick={() =>
                          setExpandedFailureKey((current) =>
                            current === failure.key ? undefined : failure.key
                          )
                        }
                        title="处理失败资源"
                        type="button"
                      >
                        {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                    </div>
                    {expanded ? (
                      <FailureActionMenu
                        busy={busy}
                        failure={failure}
                        onAction={(action) => void handleFailureAction(failure, action)}
                        proxyActionAvailable={proxyActionAvailable}
                        ruleActionAvailable={Boolean(effectiveAutomaticProfileId)}
                        matchedRule={
                          failureRoute?.matchedRuleId ??
                          (failureRoute ? routeReasonLabel(failureRoute.reason) : '正在读取')
                        }
                        routeLabel={
                          failureRoute
                            ? `${profileLabel(
                                document,
                                failureRoute.resolvedProfileId
                              )} / ${routeTargetLabel(document, failureRoute)}`
                            : '正在检查路由'
                        }
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="popup-hint">没有近期失败资源。</p>
          )}
        </section>
      ) : null}
    </main>
  );
}

function ProfileChoice({
  active,
  busy,
  onActivate,
  profile
}: {
  active: boolean;
  busy: boolean;
  onActivate(profileId: string): Promise<void>;
  profile: ConfigurationDocument['profiles'][number];
}) {
  return (
    <button
      aria-pressed={active}
      className={active ? 'profile-row profile-row-active' : 'profile-row'}
      disabled={busy}
      onClick={() => void onActivate(profile.id)}
      type="button"
    >
      <span className="profile-kind">{profileGlyph(profile.kind)}</span>
      <span className="profile-name">{profile.name}</span>
      {active ? <Check size={16} aria-label="当前启用" /> : <ChevronRight size={16} />}
    </button>
  );
}

function PopupViewHeading({ onBack, title }: { onBack(): void; title: string }) {
  return (
    <div className="popup-view-heading">
      <button className="icon-button" onClick={onBack} title="返回" type="button">
        <ArrowLeft size={17} />
      </button>
      <strong>{title}</strong>
    </div>
  );
}

function PopupMenuActionIcon({ id }: { id: 'add-rule' | 'failures' | 'route' | 'temporary-rule' }) {
  switch (id) {
    case 'add-rule':
      return <Plus size={16} aria-hidden="true" />;
    case 'temporary-rule':
      return <Clock3 size={16} aria-hidden="true" />;
    case 'failures':
      return <TriangleAlert size={16} aria-hidden="true" />;
    case 'route':
      return <Route size={16} aria-hidden="true" />;
  }
}

function quickRuleTarget(document: ConfigurationDocument, value: string): QuickRuleTarget {
  return document.schemaVersion === 1 ? targetFromValue(value) : targetFromValueV2(value);
}

function directRouteValue(document: ConfigurationDocument): string {
  return document.schemaVersion === 1 ? 'direct' : 'profile:direct';
}

function defaultAutomaticProfileIdOrUndefined(
  document: ConfigurationDocument | undefined
): string | undefined {
  return document ? defaultAutomaticProfileId(document) : undefined;
}

function profileGlyph(kind: ConfigurationDocument['profiles'][number]['kind']): string {
  switch (kind) {
    case 'direct':
      return '直';
    case 'system':
      return '系';
    case 'fixed-proxy':
      return '代';
    case 'auto-switch':
      return '自';
    case 'pac':
      return 'P';
    case 'auto-detect':
      return '检';
    case 'rule-list':
      return '规';
    case 'virtual':
      return '虚';
  }
}

function profileLabel(document: ConfigurationDocument | undefined, profileId: string): string {
  const profile = document?.profiles.find((candidate) => candidate.id === profileId);
  return profile?.name ?? profileId;
}

function routeTargetLabel(
  document: ConfigurationDocument | undefined,
  status: CurrentRouteStatus
): string {
  if (status.routeKind === 'proxy' && document?.schemaVersion === 1 && status.routeTargetId) {
    return (
      document.proxies.find((proxy) => proxy.id === status.routeTargetId)?.name ??
      status.routeTargetId
    );
  }
  if (status.routeTargetId) {
    return profileLabel(document, status.routeTargetId);
  }
  return routeKindLabel(status.routeKind);
}

function routeKindLabel(kind: string): string {
  switch (kind) {
    case 'direct':
      return '直连';
    case 'system':
      return '系统代理';
    case 'fixed-proxy':
    case 'proxy':
      return '固定代理';
    case 'auto-detect':
      return '自动检测';
    case 'pac':
      return 'PAC';
    case 'auto-switch':
      return '自动切换';
    case 'rule-list':
      return '规则列表';
    default:
      return kind;
  }
}

function routeReasonLabel(reason: string): string {
  switch (reason) {
    case 'indexed-rule':
      return '自动规则';
    case 'complex-rule':
      return '高级规则';
    case 'profile-default':
      return '配置默认值';
    case 'browser-loopback-direct':
    case 'loopback-default':
      return '本地地址默认直连';
    case 'requires-pac-dns':
      return '等待 PAC DNS 判断';
    default:
      return reason;
  }
}

function routeWarningLabel(warning: string): string {
  switch (warning) {
    case 'requires-pac-dns':
      return '该规则可能触发 DNS 查询';
    case 'pac-url-may-be-sanitized':
      return 'Chrome 可能会简化 URL 后再交给 PAC';
    case 'unsupported-regex':
      return '此正则只能由 Chrome PAC 最终判断';
    case 'chrome-loopback-direct':
      return 'Chrome 可能保持本地地址直连';
    case 'unsupported-auto-switch-target':
      return '此目标不能由自动切换 PAC 路由';
    case 'rule-list-not-applied':
      return '规则列表还没有完成来源编译';
    default:
      return warning;
  }
}

function messageFor(cause: unknown): string {
  return toUserFacingMessage(cause);
}

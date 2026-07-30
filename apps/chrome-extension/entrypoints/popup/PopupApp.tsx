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
  defaultFailureRuleTarget,
  selectedFailureRuleEntries
} from '../../src/ui/diagnostics/failure-rule-batch.ts';
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
import { QuickRuleForm } from '../../src/ui/original/popup/QuickRuleForm.tsx';
import type { QuickRuleCondition } from '../../src/ui/original/popup/quick-rule-suggestion.ts';
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
  const [failureScope, setFailureScope] =
    useState<Extract<CurrentSiteScope, 'host' | 'domain'>>('host');
  const [failureTarget, setFailureTarget] = useState('');
  const [failureSelection, setFailureSelection] = useState<ReadonlySet<string>>();
  const [failureRoutes, setFailureRoutes] = useState<Record<string, CurrentRouteStatus>>({});
  const [expandedFailureKey, setExpandedFailureKey] = useState<string>();
  const [view, setView] = useState<PopupView>('menu');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

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
  const effectiveFailureTarget = document
    ? targetOptions.some((option) => option.value === failureTarget)
      ? failureTarget
      : defaultFailureRuleTarget(targetOptions, directRouteValue(document))
    : undefined;
  const effectiveFailureSelection = useMemo(
    () => failureSelection ?? new Set(failures.map((failure) => failure.key)),
    [failureSelection, failures]
  );
  const selectedFailureEntries = useMemo(
    () => selectedFailureRuleEntries(failures, effectiveFailureSelection, failureScope),
    [effectiveFailureSelection, failureScope, failures]
  );
  const rulePreview = useMemo(() => {
    if (!availableTab) {
      return undefined;
    }
    try {
      const condition = buildCurrentSiteRule(availableTab.url, ruleScope).condition;
      return condition.type === 'keyword' ? condition.value : condition.pattern;
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
    setFailureTarget((current) =>
      targetOptions.some((option) => option.value === current)
        ? current
        : (defaultFailureRuleTarget(targetOptions, directRouteValue(document)) ?? '')
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
    temporary: boolean,
    successNotice?: string
  ): Promise<boolean> {
    if (!document || !effectiveAutomaticProfileId || !targetValue) {
      setError('当前没有可用的自动切换配置或规则目标');
      return false;
    }

    setBusy(true);
    setError(undefined);
    setNotice(undefined);
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
      if (successNotice) {
        setNotice(successNotice);
      }
      return true;
    } catch (cause) {
      setError(messageFor(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function applyAdvancedRule(
    condition: QuickRuleCondition,
    host: string,
    temporary: boolean
  ): Promise<void> {
    if (
      !document ||
      document.schemaVersion !== 2 ||
      !effectiveAutomaticProfileId ||
      !effectiveRuleTarget
    ) {
      throw new Error('当前没有可用的自动切换配置或规则目标');
    }

    setBusy(true);
    setError(undefined);
    try {
      const target = targetFromValueV2(effectiveRuleTarget);
      const nextState = temporary
        ? await requestBackgroundState({
            type: 'temporary-rule.add',
            automaticProfileId: effectiveAutomaticProfileId,
            condition,
            expiresAt: temporaryRuleExpiry(temporaryDuration, Date.now()),
            host,
            scope: 'host',
            target
          })
        : await requestBackgroundState({
            type: 'quick-rule.add',
            automaticProfileId: effectiveAutomaticProfileId,
            condition,
            host,
            scope: 'host',
            target
          });
      await applyPopupState(nextState, currentTab ?? (await loadCurrentTab()));
      setView('menu');
    } catch (cause) {
      setError(messageFor(cause));
      throw cause;
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
      setFailureSelection(undefined);
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
    setFailureSelection((current) => {
      if (!current) {
        return new Set(nextFailures.map((failure) => failure.key));
      }
      const availableKeys = new Set(nextFailures.map((failure) => failure.key));
      return new Set([...current].filter((key) => availableKeys.has(key)));
    });
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
        : effectiveFailureTarget;
    await applyRule(
      failure.url,
      failureScope,
      target,
      action === 'add-temporary-direct-rule' || action === 'add-temporary-proxy-rule',
      `已将 ${failure.host} 加入自动切换，目标：${
        targetOptions.find((option) => option.value === target)?.label ?? '所选目标'
      }。`
    );
  }

  async function addSelectedFailureRules(): Promise<void> {
    if (!document || !effectiveAutomaticProfileId || !effectiveFailureTarget) {
      setError('当前没有可用的自动切换配置或规则目标');
      return;
    }
    if (selectedFailureEntries.length === 0) {
      setError('请至少选择一个可加入规则的失败域名');
      return;
    }

    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const nextState = await requestBackgroundState({
        type: 'quick-rule.add-many',
        automaticProfileId: effectiveAutomaticProfileId,
        entries: selectedFailureEntries,
        target: quickRuleTarget(document, effectiveFailureTarget)
      });
      await applyPopupState(nextState, currentTab ?? (await loadCurrentTab()));
      setView('menu');
      setNotice(
        `已将 ${selectedFailureEntries.length} 个域名加入自动切换，目标：${
          targetOptions.find((option) => option.value === effectiveFailureTarget)?.label ??
          '所选目标'
        }。`
      );
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  function toggleFailureSelection(key: string): void {
    setFailureSelection((current) => {
      const next = new Set(current ?? failures.map((failure) => failure.key));
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function selectAllFailures(selectAll: boolean): void {
    setFailureSelection(selectAll ? new Set(failures.map((failure) => failure.key)) : new Set());
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
    document && effectiveFailureTarget && effectiveFailureTarget !== directRouteValue(document)
  );
  const allFailuresSelected =
    failures.length > 0 && effectiveFailureSelection.size === failures.length;
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
      {notice ? (
        <p className="popup-notice" role="status">
          {notice}
        </p>
      ) : null}

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
          onOpenTemporaryRule={() => setView('rule-form')}
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

      {view === 'rule-form' && document?.schemaVersion === 2 ? (
        <section
          className="popup-workspace original-popup-rule-workspace"
          aria-label="添加当前网站规则"
        >
          <PopupViewHeading onBack={() => setView('menu')} title="为当前网站添加规则" />
          <QuickRuleForm
            automaticProfileId={effectiveAutomaticProfileId}
            automaticProfiles={automaticProfiles}
            busy={busy}
            onAutomaticProfileChange={setAutomaticProfileId}
            onCancel={() => setView('menu')}
            onRouteChange={setRuleTarget}
            onSubmit={({ condition, host, temporary }) =>
              applyAdvancedRule(condition, host, temporary)
            }
            onTemporaryDurationChange={setTemporaryDuration}
            routeOptions={targetOptions}
            routeValue={effectiveRuleTarget}
            tab={availableTab}
            temporaryDuration={temporaryDuration}
          />
        </section>
      ) : null}

      {view === 'rule-form' && document?.schemaVersion !== 2 ? (
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
            <>
              <div className="failure-bulk-controls">
                <div className="failure-bulk-heading">
                  <strong>已选择 {selectedFailureEntries.length} 个域名</strong>
                  <button
                    className="link-button"
                    disabled={busy}
                    onClick={() => selectAllFailures(!allFailuresSelected)}
                    type="button"
                  >
                    {allFailuresSelected ? '取消全选' : '全选'}
                  </button>
                </div>
                <div className="failure-bulk-fields">
                  <label>
                    <span>自动切换</span>
                    <select
                      aria-label="失败资源的自动切换配置"
                      disabled={busy || automaticProfiles.length === 0}
                      onChange={(event) => setAutomaticProfileId(event.target.value)}
                      value={effectiveAutomaticProfileId ?? ''}
                    >
                      {automaticProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>匹配范围</span>
                    <select
                      aria-label="失败资源的匹配范围"
                      disabled={busy}
                      onChange={(event) =>
                        setFailureScope(
                          event.target.value as Extract<CurrentSiteScope, 'host' | 'domain'>
                        )
                      }
                      value={failureScope}
                    >
                      <option value="host">精确域名</option>
                      <option value="domain">整个主域名</option>
                    </select>
                  </label>
                  <label>
                    <span>规则目标</span>
                    <select
                      aria-label="失败资源的规则目标"
                      disabled={busy || targetOptions.length === 0}
                      onChange={(event) => setFailureTarget(event.target.value)}
                      value={effectiveFailureTarget ?? ''}
                    >
                      {targetOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  className="command-button failure-bulk-submit"
                  disabled={
                    busy ||
                    !effectiveAutomaticProfileId ||
                    !effectiveFailureTarget ||
                    selectedFailureEntries.length === 0
                  }
                  onClick={() => void addSelectedFailureRules()}
                  type="button"
                >
                  <Plus size={15} />
                  加入自动切换
                </button>
              </div>
              <div className="failure-list">
                {failures.map((failure) => {
                  const failureRoute = failureRoutes[failure.key];
                  const expanded = expandedFailureKey === failure.key;
                  const selected = effectiveFailureSelection.has(failure.key);
                  return (
                    <div className="failure-entry" key={failure.key}>
                      <div className="failure-row" title={failure.url}>
                        <label className="failure-select" title={`选择 ${failure.host}`}>
                          <input
                            aria-label={`选择 ${failure.host}`}
                            checked={selected}
                            disabled={busy}
                            onChange={() => toggleFailureSelection(failure.key)}
                            type="checkbox"
                          />
                        </label>
                        <span className="failure-resource">
                          <strong className="failure-host">
                            {failure.host}
                            {failure.occurrences > 1 ? (
                              <small>{failure.occurrences} 次</small>
                            ) : null}
                          </strong>
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
            </>
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

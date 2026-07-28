import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  ExternalLink,
  Globe2,
  Plus,
  RefreshCw,
  Route,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  Zap
} from 'lucide-react';

import type { ConfigurationDocument } from '@switchypeformance/contracts';

import {
  requestBackgroundState,
  requestCurrentRoute,
  routeOptions,
  routeOptionsV2,
  sendBackgroundCommand,
  targetFromValue,
  targetFromValueV2
} from '../../src/ui/background-client.ts';
import { toUserFacingMessage } from '../../src/ui/error-message.ts';
import { recentFailureHosts } from '../../src/ui/failure-hosts.ts';
import {
  automaticProfileOptions,
  buildCurrentSiteRule,
  defaultAutomaticProfileId,
  type CurrentSiteScope
} from '../../src/ui/popup/current-site-rule.ts';
import { loadCurrentTab, type CurrentTab } from '../../src/ui/popup/current-tab.ts';
import type { CurrentRouteStatus } from '../../src/runtime/current-route.ts';
import type { BackgroundState, QuickRuleTarget } from '../../src/runtime/messages.ts';

const CURRENT_SITE_SCOPES: readonly { label: string; value: CurrentSiteScope }[] = [
  { label: '主域', value: 'domain' },
  { label: '主机', value: 'host' },
  { label: '当前页', value: 'page' }
];

export function PopupApp() {
  const [state, setState] = useState<BackgroundState>();
  const [currentTab, setCurrentTab] = useState<CurrentTab>();
  const [routeStatus, setRouteStatus] = useState<CurrentRouteStatus>();
  const [automaticProfileId, setAutomaticProfileId] = useState<string>();
  const [ruleScope, setRuleScope] = useState<CurrentSiteScope>('domain');
  const [ruleTarget, setRuleTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const document = state?.configuration;
  const activeProfile = useMemo(
    () => document?.profiles.find((profile) => profile.id === document.activeProfileId),
    [document]
  );
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
  const failedHosts = useMemo(
    () => recentFailureHosts(state?.diagnostics ?? []),
    [state?.diagnostics]
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

  async function addQuickRule(url: string, scope: CurrentSiteScope): Promise<void> {
    if (!document || !effectiveAutomaticProfileId || !effectiveRuleTarget) {
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      const siteRule = buildCurrentSiteRule(url, scope);
      const nextState = await requestBackgroundState({
        type: 'quick-rule.add',
        automaticProfileId: effectiveAutomaticProfileId,
        condition: siteRule.condition,
        host: siteRule.host,
        scope,
        target: quickRuleTarget(document, effectiveRuleTarget)
      });
      await applyPopupState(nextState, currentTab ?? (await loadCurrentTab()));
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
      return;
    }
    try {
      setRouteStatus(await requestCurrentRoute(tab.url));
    } catch (cause) {
      setRouteStatus(undefined);
      setError(messageFor(cause));
    }
  }

  async function openOptions(): Promise<void> {
    setError(undefined);
    try {
      await sendBackgroundCommand({ type: 'options.open' });
    } catch (cause) {
      setError(messageFor(cause));
    }
  }

  const canAddRule = Boolean(
    availableTab && effectiveAutomaticProfileId && effectiveRuleTarget && !busy
  );

  return (
    <main className="popup-shell">
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

      <section className="popup-status" aria-live="polite">
        <span className={error ? 'status-dot status-dot-error' : 'status-dot'} />
        <div>
          <span className="eyebrow">当前模式</span>
          <strong>{activeProfile?.name ?? '正在加载配置'}</strong>
        </div>
        <ShieldCheck size={20} aria-hidden="true" />
      </section>

      {error ? <p className="popup-error">{error}</p> : null}

      <section className="popup-section" aria-label="代理配置">
        <div className="section-label">
          <span>代理配置</span>
          <span>{document?.profiles.length ?? 0}</span>
        </div>
        <div className="profile-list">
          {document?.profiles.map((profile) => {
            const active = profile.id === document.activeProfileId;
            return (
              <button
                aria-pressed={active}
                className={active ? 'profile-row profile-row-active' : 'profile-row'}
                disabled={busy}
                key={profile.id}
                onClick={() => void activate(profile.id)}
                type="button"
              >
                <span className="profile-kind">{profileGlyph(profile.kind)}</span>
                <span className="profile-name">{profile.name}</span>
                {active ? <Check size={16} aria-label="当前启用" /> : <ChevronRight size={16} />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="popup-section current-site-panel" aria-label="当前网站规则">
        <div className="section-label">
          <span>当前网站规则</span>
          <Globe2 size={14} aria-hidden="true" />
        </div>
        <strong className="host-value">{currentTabLabel(currentTab)}</strong>

        {availableTab ? (
          <>
            <div className="scope-control" aria-label="规则范围" role="group">
              {CURRENT_SITE_SCOPES.map((option) => (
                <button
                  aria-pressed={ruleScope === option.value}
                  className={
                    ruleScope === option.value ? 'scope-button scope-button-active' : 'scope-button'
                  }
                  disabled={busy}
                  key={option.value}
                  onClick={() => setRuleScope(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            {rulePreview ? <p className="rule-preview">{rulePreview}</p> : null}
            <label className="field-label">
              <span>加入配置</span>
              <select
                aria-label="要添加到的自动切换配置"
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
            <label className="field-label">
              <span>访问方式</span>
              <select
                aria-label="当前网站的路由"
                disabled={busy || targetOptions.length === 0}
                onChange={(event) => setRuleTarget(event.target.value)}
                value={effectiveRuleTarget ?? ''}
              >
                {targetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="command-button command-button-full"
              disabled={!canAddRule}
              onClick={() => void addQuickRule(availableTab.url, ruleScope)}
              type="button"
            >
              <Plus size={15} />
              加入自动切换
            </button>
            {automaticProfiles.length === 0 ? (
              <p className="popup-hint">请先在设置中创建自动切换配置。</p>
            ) : null}
          </>
        ) : (
          <p className="popup-hint">Chrome 内部页、扩展页和本地文件不能添加代理规则。</p>
        )}
      </section>

      {availableTab ? (
        <section className="popup-section route-panel" aria-label="当前路由说明">
          <div className="section-label">
            <span>当前路由</span>
            <Route size={14} aria-hidden="true" />
          </div>
          {routeStatus ? (
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
          ) : (
            <p className="popup-hint">正在计算当前页面的路由结果。</p>
          )}
          {routeStatus?.warnings.length ? (
            <p className="route-warning">
              <TriangleAlert size={14} />
              {routeStatus.warnings.map(routeWarningLabel).join('；')}
            </p>
          ) : null}
        </section>
      ) : null}

      {failedHosts.length > 0 ? (
        <section className="popup-section" aria-label="失败资源">
          <div className="section-label">
            <span>失败资源</span>
            <span>{failedHosts.length}</span>
          </div>
          <div className="failure-list">
            {failedHosts.map((failure) => (
              <div className="failure-row" key={failure.host} title={failure.target}>
                <span className="failure-host">{failure.host}</span>
                <button
                  aria-label={`将 ${failure.host} 按当前选择加入自动切换`}
                  className="icon-button"
                  disabled={!canAddRule}
                  onClick={() => void addQuickRule(failure.target, 'host')}
                  title="按当前选择加入自动切换"
                  type="button"
                >
                  <Plus size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="popup-footer">
        <span>
          {state?.diagnostics.filter((event) => event.level === 'error').length ?? 0} 条近期错误
        </span>
        <button className="link-button" onClick={() => void openOptions()} type="button">
          打开设置
          <ExternalLink size={14} />
        </button>
      </footer>
    </main>
  );
}

function quickRuleTarget(document: ConfigurationDocument, value: string): QuickRuleTarget {
  return document.schemaVersion === 1 ? targetFromValue(value) : targetFromValueV2(value);
}

function defaultAutomaticProfileIdOrUndefined(
  document: ConfigurationDocument | undefined
): string | undefined {
  return document ? defaultAutomaticProfileId(document) : undefined;
}

function currentTabLabel(tab: CurrentTab | undefined): string {
  if (!tab) {
    return '正在读取当前页面';
  }
  return tab.available ? tab.host : tab.reason;
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

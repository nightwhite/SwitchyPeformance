import { Activity, ChevronDown, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import type { CurrentRouteStatus } from '../../runtime/current-route.ts';
import type { BackgroundState } from '../../runtime/messages.ts';
import { FailureActionMenu } from '../components/FailureActionMenu.tsx';
import {
  TEMPORARY_RULE_DURATION_OPTIONS,
  temporaryRuleExpiry,
  type TemporaryRuleDuration
} from '../components/temporary-rule-form.ts';
import {
  requestBackgroundState,
  requestCurrentRoute,
  requestNetworkEvents,
  routeOptionsV2,
  targetFromValueV2
} from '../background-client.ts';
import {
  recentDiagnosticFailures,
  recentNetworkFailures,
  type FailureAction,
  type FailureResource
} from '../diagnostics/failure-remediation.ts';
import { toUserFacingMessage } from '../error-message.ts';
import {
  automaticProfileOptions,
  buildCurrentSiteRule,
  defaultAutomaticProfileId
} from '../popup/current-site-rule.ts';

interface DiagnosticsPageProps {
  busy: boolean;
  document: ProfileDocumentV2;
  events: BackgroundState['diagnostics'];
  networkSummary: BackgroundState['networkSummary'];
  onState(state: BackgroundState): void;
}

export function DiagnosticsPage({
  busy,
  document,
  events,
  networkSummary,
  onState
}: DiagnosticsPageProps) {
  const [error, setError] = useState<string>();
  const [failures, setFailures] = useState<readonly FailureResource[]>([]);
  const [failureRoutes, setFailureRoutes] = useState<Record<string, CurrentRouteStatus>>({});
  const [expandedFailureKey, setExpandedFailureKey] = useState<string>();
  const [automaticProfileId, setAutomaticProfileId] = useState<string>();
  const [ruleTarget, setRuleTarget] = useState('');
  const [temporaryDuration, setTemporaryDuration] = useState<TemporaryRuleDuration>('30m');
  const [localBusy, setLocalBusy] = useState(false);
  const automaticProfiles = useMemo(() => automaticProfileOptions(document), [document]);
  const targetOptions = useMemo(() => routeOptionsV2(document), [document]);
  const effectiveAutomaticProfileId = automaticProfiles.some(
    (profile) => profile.id === automaticProfileId
  )
    ? automaticProfileId
    : defaultAutomaticProfileId(document);
  const effectiveRuleTarget = targetOptions.some((option) => option.value === ruleTarget)
    ? ruleTarget
    : targetOptions[0]?.value;
  const interactionBusy = busy || localBusy;
  const monitorEnabled = document.settings.networkMonitor.enabled;
  const proxyActionAvailable = Boolean(
    effectiveRuleTarget && effectiveRuleTarget !== 'profile:direct'
  );

  useEffect(() => {
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

  useEffect(() => {
    void refreshNetworkFailures();
  }, [events, monitorEnabled]);

  async function clearDiagnostics(): Promise<void> {
    if (!window.confirm('要清空排查日志吗？')) {
      return;
    }
    try {
      setError(undefined);
      onState(await requestBackgroundState({ type: 'diagnostics.clear' }));
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  async function clearNetworkEvents(): Promise<void> {
    if (!window.confirm('要清空本次浏览器会话的网络时间线吗？')) {
      return;
    }
    try {
      setError(undefined);
      await requestBackgroundState({ type: 'network.events.clear' });
      setFailures([]);
      setFailureRoutes({});
      setExpandedFailureKey(undefined);
      onState(await requestBackgroundState({ type: 'state.get' }));
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  async function refreshNetworkFailures(): Promise<void> {
    try {
      const detailedFailures = monitorEnabled
        ? recentNetworkFailures(await requestNetworkEvents())
        : [];
      await setFailureResources(
        detailedFailures.length > 0 ? detailedFailures : recentDiagnosticFailures(events)
      );
    } catch (cause) {
      await setFailureResources(recentDiagnosticFailures(events));
      if (monitorEnabled) {
        setError(toUserFacingMessage(cause));
      }
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
      setLocalBusy(true);
      setError(undefined);
      try {
        const route = await requestCurrentRoute(failure.url);
        setFailureRoutes((current) => ({ ...current, [failure.key]: route }));
      } catch (cause) {
        setError(toUserFacingMessage(cause));
      } finally {
        setLocalBusy(false);
      }
      return;
    }
    if (!effectiveAutomaticProfileId || !effectiveRuleTarget) {
      return;
    }
    const targetValue =
      action === 'add-direct-rule' || action === 'add-temporary-direct-rule'
        ? 'profile:direct'
        : effectiveRuleTarget;
    const temporary =
      action === 'add-temporary-direct-rule' || action === 'add-temporary-proxy-rule';
    setLocalBusy(true);
    setError(undefined);
    try {
      const rule = buildCurrentSiteRule(failure.url, 'host');
      const target = targetFromValueV2(targetValue);
      const nextState = temporary
        ? await requestBackgroundState({
            type: 'temporary-rule.add',
            automaticProfileId: effectiveAutomaticProfileId,
            condition: rule.condition,
            expiresAt: temporaryRuleExpiry(temporaryDuration, Date.now()),
            host: rule.host,
            scope: 'host',
            target
          })
        : await requestBackgroundState({
            type: 'quick-rule.add',
            automaticProfileId: effectiveAutomaticProfileId,
            condition: rule.condition,
            host: rule.host,
            scope: 'host',
            target
          });
      onState(nextState);
      await refreshNetworkFailures();
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <>
      <section className="page-panel diagnostics-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">本地事件</p>
            <h2>{events.length} 条事件</h2>
          </div>
          <button
            className="outline-button"
            disabled={interactionBusy}
            onClick={() => void clearDiagnostics()}
            type="button"
          >
            <Trash2 size={16} />
            清空日志
          </button>
        </div>
        {events.length === 0 ? (
          <div className="empty-state">没有排查事件</div>
        ) : (
          <div className="diagnostic-list">
            {events
              .slice()
              .reverse()
              .map((event) => (
                <article
                  className={
                    event.level === 'error'
                      ? 'diagnostic-event diagnostic-error'
                      : 'diagnostic-event'
                  }
                  key={event.id}
                >
                  <time>{new Date(event.timestamp).toLocaleString()}</time>
                  <span className="event-scope">{event.scope}</span>
                  <strong>{event.message}</strong>
                  <span />
                  {event.target ? <p className="diagnostic-target">{event.target}</p> : null}
                  {event.detail ? <p>{event.detail}</p> : null}
                </article>
              ))}
          </div>
        )}
      </section>

      <section className="page-panel network-diagnostics-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">网页请求</p>
            <h2>网络时间线</h2>
          </div>
          <div className="toolbar-actions">
            <button
              className="icon-button"
              disabled={interactionBusy}
              onClick={() => void refreshNetworkFailures()}
              title="刷新失败记录"
              type="button"
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="outline-button"
              disabled={interactionBusy || !monitorEnabled}
              onClick={() => void clearNetworkEvents()}
              type="button"
            >
              <Trash2 size={16} />
              清空时间线
            </button>
          </div>
        </div>
        {!monitorEnabled ? (
          <p className="network-monitor-notice">
            完整网络时间线已关闭；当前只保留合并后的失败记录，不记录正常请求。
          </p>
        ) : (
          <>
            <div className="network-summary-grid" aria-label="标签页网络汇总">
              {(networkSummary ?? []).map((summary) => (
                <div className="network-summary-row" key={summary.tabId}>
                  <Activity size={15} />
                  <span>{networkSummaryLabel(summary.tabId)}</span>
                  <strong>{summary.requestCount} 请求</strong>
                  <span
                    className={summary.failedRequestCount > 0 ? 'network-failure-count' : undefined}
                  >
                    {summary.failedRequestCount} 失败
                  </span>
                  <small>{summary.latestUrl}</small>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="failure-config-controls">
          <label>
            写入自动切换配置
            <select
              disabled={interactionBusy || automaticProfiles.length === 0}
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
            代理目标
            <select
              disabled={interactionBusy || targetOptions.length === 0}
              onChange={(event) => setRuleTarget(event.target.value)}
              value={effectiveRuleTarget ?? ''}
            >
              {targetOptions.map((target) => (
                <option key={target.value} value={target.value}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            临时规则时长
            <select
              disabled={interactionBusy}
              onChange={(event) =>
                setTemporaryDuration(event.target.value as TemporaryRuleDuration)
              }
              value={temporaryDuration}
            >
              {TEMPORARY_RULE_DURATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {failures.length === 0 ? (
          <div className="empty-state">这次浏览器会话还没有记录网络失败。</div>
        ) : (
          <div className="network-failure-list">
            {failures.map((failure) => {
              const route = failureRoutes[failure.key];
              const expanded = expandedFailureKey === failure.key;
              return (
                <article className="network-failure-entry" key={failure.key}>
                  <div className="network-failure-row">
                    <div>
                      <strong>{failure.host}</strong>
                      <span>{failure.error}</span>
                    </div>
                    <time>{new Date(failure.timestamp).toLocaleTimeString()}</time>
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
                      {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  </div>
                  {expanded ? (
                    <FailureActionMenu
                      busy={interactionBusy}
                      failure={failure}
                      matchedRule={
                        route?.matchedRuleId ??
                        (route ? routeReasonLabel(route.reason) : '正在读取')
                      }
                      onAction={(action) => void handleFailureAction(failure, action)}
                      proxyActionAvailable={proxyActionAvailable}
                      routeLabel={
                        route
                          ? `${profileLabel(document, route.resolvedProfileId)} / ${routeTargetLabel(
                              document,
                              route
                            )}`
                          : '正在检查路由'
                      }
                      ruleActionAvailable={Boolean(effectiveAutomaticProfileId)}
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
        {error ? <p className="inline-error">{error}</p> : null}
      </section>
    </>
  );
}

function profileLabel(document: ProfileDocumentV2, profileId: string): string {
  return document.profiles.find((profile) => profile.id === profileId)?.name ?? profileId;
}

function routeTargetLabel(document: ProfileDocumentV2, status: CurrentRouteStatus): string {
  return status.routeTargetId ? profileLabel(document, status.routeTargetId) : status.routeKind;
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
      return '本地地址默认直连';
    case 'requires-pac-dns':
      return '等待 PAC DNS 判断';
    default:
      return reason;
  }
}

function networkSummaryLabel(tabId: number): string {
  return tabId === -1 ? '后台请求' : `标签页 ${tabId}`;
}

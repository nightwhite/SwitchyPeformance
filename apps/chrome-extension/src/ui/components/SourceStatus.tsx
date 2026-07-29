import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

import type { RefreshPolicy } from '@switchypeformance/contracts';

import type { SourceStatus as SourceStatusRecord } from '../../runtime/source-status-repository.ts';

export interface SourceStatusView {
  byteLength?: number;
  lastError?: string;
  lastSuccessAt?: number;
  nextRefreshAt?: number;
  ruleCount?: number;
  state: 'error' | 'idle' | 'success';
  warningCount?: number;
}

interface SourceStatusProps {
  busy: boolean;
  onRefresh(): Promise<void>;
  policy: RefreshPolicy;
  status: SourceStatusRecord | undefined;
}

export function SourceStatus({ busy, onRefresh, policy, status }: SourceStatusProps) {
  const view = sourceStatusView(status, policy, Date.now());

  return (
    <section aria-label="来源状态" className="source-status">
      <div className="source-status-heading">
        <div>
          <p className="panel-kicker">来源状态</p>
          <strong className={`source-status-result source-status-${view.state}`}>
            {view.state === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {stateLabel(view.state)}
          </strong>
        </div>
        <button
          className="outline-button source-refresh-button"
          disabled={busy}
          onClick={() => void onRefresh()}
          type="button"
        >
          <RefreshCw size={16} />
          立即刷新
        </button>
      </div>
      <dl className="source-status-details">
        {view.lastSuccessAt === undefined ? null : (
          <div>
            <dt>上次成功</dt>
            <dd>{formatTimestamp(view.lastSuccessAt)}</dd>
          </div>
        )}
        {view.nextRefreshAt === undefined ? null : (
          <div>
            <dt>下次刷新</dt>
            <dd>{formatTimestamp(view.nextRefreshAt)}</dd>
          </div>
        )}
        {view.byteLength === undefined ? null : (
          <div>
            <dt>下载大小</dt>
            <dd>{formatByteLength(view.byteLength)}</dd>
          </div>
        )}
        {view.ruleCount === undefined ? null : (
          <div>
            <dt>规则数量</dt>
            <dd>{view.ruleCount.toLocaleString('zh-CN')} 条</dd>
          </div>
        )}
      </dl>
      {view.warningCount && view.warningCount > 0 ? (
        <p className="source-status-warning">解析时跳过 {view.warningCount} 条不支持的规则。</p>
      ) : null}
      {view.lastError ? <p className="source-status-error">最近错误：{view.lastError}</p> : null}
    </section>
  );
}

export function sourceStatusView(
  status: SourceStatusRecord | undefined,
  policy: RefreshPolicy,
  now: number
): SourceStatusView {
  const lastSuccessAt = status?.lastSuccessAt;
  const lastErrorAt = status?.lastErrorAt;
  const lastAttemptAt = Math.max(lastSuccessAt ?? 0, lastErrorAt ?? 0);
  const state =
    status?.lastError && (lastErrorAt ?? 0) >= (lastSuccessAt ?? 0)
      ? 'error'
      : lastSuccessAt === undefined
        ? 'idle'
        : 'success';
  const nextRefreshAt =
    policy.enabled && lastAttemptAt > 0
      ? lastAttemptAt + policy.refreshMinutes * 60_000
      : undefined;

  return {
    state,
    ...(lastSuccessAt === undefined ? {} : { lastSuccessAt }),
    ...(nextRefreshAt === undefined ? {} : { nextRefreshAt: Math.max(now, nextRefreshAt) }),
    ...(status?.byteLength === undefined ? {} : { byteLength: status.byteLength }),
    ...(status?.ruleCount === undefined ? {} : { ruleCount: status.ruleCount }),
    ...(status?.warningCount === undefined ? {} : { warningCount: status.warningCount }),
    ...(state !== 'error' || !status?.lastError ? {} : { lastError: status.lastError })
  };
}

function stateLabel(state: SourceStatusView['state']): string {
  switch (state) {
    case 'success':
      return '来源可用';
    case 'error':
      return '保留上次可用版本';
    case 'idle':
      return '尚未下载';
  }
}

function formatTimestamp(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    hour12: false,
    timeStyle: 'medium'
  }).format(new Date(value));
}

function formatByteLength(value: number): string {
  if (value < 1_024) {
    return `${value} B`;
  }
  if (value < 1_024 * 1_024) {
    return `${(value / 1_024).toFixed(1)} KB`;
  }
  return `${(value / (1_024 * 1_024)).toFixed(1)} MB`;
}

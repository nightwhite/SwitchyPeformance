import { Search, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { explainV2RouteWithWasm } from '../../runtime/wasm-runtime.ts';
import type { V2RouteExplanation } from '../../runtime/route-explainer.ts';
import { toUserFacingMessage } from '../error-message.ts';
import { profileKindLabel, profileName } from '../v2-labels.ts';

interface V2OverviewPageProps {
  document: ProfileDocumentV2;
}

export function V2OverviewPage({ document }: V2OverviewPageProps) {
  const [inspectionUrl, setInspectionUrl] = useState('');
  const [inspection, setInspection] = useState<V2RouteExplanation>();
  const [inspectionBusy, setInspectionBusy] = useState(false);
  const [inspectionError, setInspectionError] = useState<string>();
  const activeProfile = document.profiles.find(
    (profile) => profile.id === document.activeProfileId
  );
  const ruleCount = document.profiles.reduce(
    (total, profile) => (profile.kind === 'auto-switch' ? total + profile.rules.length : total),
    0
  );

  async function inspectRoute(): Promise<void> {
    try {
      const url = new URL(inspectionUrl.trim()).toString();
      setInspectionBusy(true);
      setInspectionError(undefined);
      setInspection(await explainV2RouteWithWasm(document, url));
    } catch (cause) {
      setInspection(undefined);
      setInspectionError(toUserFacingMessage(cause));
    } finally {
      setInspectionBusy(false);
    }
  }

  return (
    <>
      <section className="control-band">
        <div className="control-signal">
          <span className="signal-dot" />
          <span>当前模式</span>
        </div>
        <strong>{activeProfile?.name ?? '未知配置'}</strong>
        <ShieldCheck size={28} aria-hidden="true" />
      </section>
      <section className="metric-grid" aria-label="当前配置指标">
        <Metric value={document.proxyServers.length} label="代理服务器" />
        <Metric
          value={document.profiles.filter((profile) => profile.kind === 'auto-switch').length}
          label="自动切换配置"
        />
        <Metric value={ruleCount} label="自动切换规则" />
      </section>
      <section className="page-panel route-inspector">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">路由排查</p>
            <h2>检查网址</h2>
          </div>
          <Search size={20} />
        </div>
        <div className="inspection-form">
          <label>
            网址
            <input
              inputMode="url"
              onChange={(event) => setInspectionUrl(event.target.value)}
              placeholder="https://example.com"
              value={inspectionUrl}
            />
          </label>
          <button
            className="primary-button form-command"
            disabled={inspectionBusy || !inspectionUrl.trim()}
            onClick={() => void inspectRoute()}
            type="button"
          >
            <Search size={16} />
            检查路由
          </button>
        </div>
        {inspectionError ? <p className="inline-error">{inspectionError}</p> : null}
        {inspection ? <InspectionResult document={document} explanation={inspection} /> : null}
      </section>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </div>
  );
}

function InspectionResult({
  document,
  explanation
}: {
  document: ProfileDocumentV2;
  explanation: V2RouteExplanation;
}) {
  return (
    <div
      className={
        explanation.definitive
          ? 'inspection-result inspection-result-v2'
          : 'inspection-result inspection-result-v2 inspection-result-warning'
      }
    >
      <span className="mono-chip">{routeDescription(document, explanation)}</span>
      <span>{ruleDescription(explanation)}</span>
      <span>{reasonDescription(explanation.reason)}</span>
      <span>
        {explanation.metrics.indexedRuleCount} 条快速规则 / {explanation.metrics.complexRuleCount}{' '}
        条复杂规则
      </span>
      {explanation.warnings.length > 0 ? (
        <span>{explanation.warnings.map(warningDescription).join('；')}</span>
      ) : null}
    </div>
  );
}

function routeDescription(document: ProfileDocumentV2, explanation: V2RouteExplanation): string {
  if (!explanation.routeProfileId) {
    return '浏览器强制直连';
  }
  const routeName = profileName(document, explanation.routeProfileId);
  const resolvedName = explanation.resolvedRouteProfileId
    ? profileName(document, explanation.resolvedRouteProfileId)
    : undefined;
  if (resolvedName && resolvedName !== routeName) {
    return `${routeName} -> ${resolvedName}`;
  }
  return `${profileKindLabel(explanation.routeKind)}：${routeName}`;
}

function ruleDescription(explanation: V2RouteExplanation): string {
  if (explanation.matchedRuleId) {
    return `命中规则 ${explanation.matchedRuleId}`;
  }
  if (explanation.pendingRuleId) {
    return `待 DNS 判断：${explanation.pendingRuleId}`;
  }
  return '配置兜底';
}

function reasonDescription(reason: V2RouteExplanation['reason']): string {
  switch (reason) {
    case 'fixed-profile':
      return '固定配置';
    case 'indexed-rule':
      return '快速主机规则';
    case 'complex-rule':
      return '复杂条件规则';
    case 'browser-loopback-direct':
      return '本地地址强制直连';
    case 'profile-default':
      return '配置兜底';
    case 'requires-pac-dns':
      return '等待 PAC/DNS 判断';
  }
}

function warningDescription(warning: V2RouteExplanation['warnings'][number]): string {
  switch (warning) {
    case 'requires-pac-dns':
      return '域名 IP 网段需要 Chrome 的 PAC/DNS 判断';
    case 'pac-url-may-be-sanitized':
      return 'HTTPS 网址路径在 PAC 中可能被浏览器裁剪';
    case 'unsupported-regex':
      return '该正则无法在本地排查器中复现';
    case 'chrome-loopback-direct':
      return 'localhost 和 127.* 由浏览器强制直连';
    case 'unsupported-auto-switch-target':
      return '该规则目标不能直接编译为自动切换 PAC';
    case 'rule-list-not-applied':
      return '规则列表尚未编译为 Chrome PAC';
  }
}

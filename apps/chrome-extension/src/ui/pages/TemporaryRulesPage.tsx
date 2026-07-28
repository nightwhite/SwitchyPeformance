import { Clock3, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { ConfigurationDocument } from '@switchypeformance/contracts';

import type { BackgroundState } from '../../runtime/messages.ts';
import type { TemporaryRule } from '../../runtime/temporary-rule-service.ts';
import { requestBackgroundState } from '../background-client.ts';
import { temporaryRuleRemainingLabel } from '../components/temporary-rule-form.ts';
import { toUserFacingMessage } from '../error-message.ts';

interface TemporaryRulesPageProps {
  busy: boolean;
  document: ConfigurationDocument;
  rules: readonly TemporaryRule[];
  onState(state: BackgroundState): void;
}

export function TemporaryRulesPage({ busy, document, rules, onState }: TemporaryRulesPageProps) {
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  const orderedRules = useMemo(
    () => rules.toSorted((left, right) => left.expiresAt - right.expiresAt),
    [rules]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function remove(ruleId: string): Promise<void> {
    try {
      setError(undefined);
      onState(await requestBackgroundState({ type: 'temporary-rule.remove', ruleId }));
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  async function clear(): Promise<void> {
    if (!window.confirm('要移除全部临时规则吗？')) {
      return;
    }
    try {
      setError(undefined);
      onState(await requestBackgroundState({ type: 'temporary-rule.clear' }));
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  return (
    <>
      <section className="page-panel temporary-rule-summary">
        <div>
          <p className="panel-kicker">会话规则</p>
          <h2>{orderedRules.length} 条正在生效</h2>
          <p>临时规则影响所有普通窗口标签页；关闭或重载扩展、到期后都会自动移除。</p>
        </div>
        <button
          className="danger-outline"
          disabled={busy || orderedRules.length === 0}
          onClick={() => void clear()}
          type="button"
        >
          <Trash2 size={16} />
          全部移除
        </button>
      </section>
      {error ? <p className="inline-error temporary-rule-page-notice">{error}</p> : null}
      {orderedRules.length === 0 ? (
        <section className="page-panel empty-state">
          <Clock3 size={25} />
          <span>没有正在生效的临时规则</span>
        </section>
      ) : (
        <section className="page-panel table-panel temporary-rule-table-panel">
          <div className="temporary-rule-row temporary-rule-head">
            <span>匹配内容</span>
            <span>加入配置</span>
            <span>访问方式</span>
            <span>剩余时间</span>
            <span aria-label="操作" />
          </div>
          {orderedRules.map((rule) => (
            <article className="temporary-rule-row" key={rule.id}>
              <strong
                className="temporary-rule-condition"
                title={temporaryRuleConditionLabel(rule)}
              >
                {temporaryRuleConditionLabel(rule)}
              </strong>
              <span title={profileName(document, rule.automaticProfileId)}>
                {profileName(document, rule.automaticProfileId)}
              </span>
              <span title={temporaryRuleTargetLabel(document, rule)}>
                {temporaryRuleTargetLabel(document, rule)}
              </span>
              <span className="temporary-rule-expiry">
                {temporaryRuleRemainingLabel(rule.expiresAt, now)}
              </span>
              <button
                aria-label={`移除 ${temporaryRuleConditionLabel(rule)} 的临时规则`}
                className="icon-danger"
                disabled={busy}
                onClick={() => void remove(rule.id)}
                title="移除临时规则"
                type="button"
              >
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

function profileName(document: ConfigurationDocument, profileId: string): string {
  return document.profiles.find((profile) => profile.id === profileId)?.name ?? profileId;
}

function temporaryRuleConditionLabel(rule: TemporaryRule): string {
  const condition = rule.rule.condition;
  if ('pattern' in condition && typeof condition.pattern === 'string') {
    return condition.pattern;
  }
  if ('value' in condition) {
    return String(condition.value);
  }
  return condition.type;
}

function temporaryRuleTargetLabel(document: ConfigurationDocument, rule: TemporaryRule): string {
  if (rule.schemaVersion === 2) {
    return profileName(document, rule.rule.target.profileId);
  }
  if (document.schemaVersion !== 1) {
    return '已失效的旧规则';
  }
  const target = rule.rule.target;
  switch (target.kind) {
    case 'direct':
      return '直连';
    case 'system':
      return '系统代理';
    case 'proxy':
      return document.proxies.find((proxy) => proxy.id === target.proxyId)?.name ?? '未知代理';
  }
}

import { Clock3, Repeat2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { validateCondition } from '@switchypeformance/contracts';

import type { AutomaticProfileOption } from '../../popup/current-site-rule.ts';
import type { CurrentTab } from '../../popup/current-tab.ts';
import {
  TEMPORARY_RULE_DURATION_OPTIONS,
  type TemporaryRuleDuration
} from '../../components/temporary-rule-form.ts';
import { toUserFacingMessage } from '../../error-message.ts';
import {
  QUICK_RULE_CONDITION_TYPES,
  suggestQuickRules,
  type QuickRuleCondition,
  type QuickRuleConditionType
} from './quick-rule-suggestion.ts';

export interface QuickRuleRouteOption {
  label: string;
  value: string;
}

export interface QuickRuleFormProps {
  automaticProfileId: string | undefined;
  automaticProfiles: readonly AutomaticProfileOption[];
  busy: boolean;
  onAutomaticProfileChange(profileId: string): void;
  onCancel(): void;
  onRouteChange(value: string): void;
  onSubmit(input: { condition: QuickRuleCondition; host: string; temporary: boolean }): Promise<void>;
  onTemporaryDurationChange(duration: TemporaryRuleDuration): void;
  routeOptions: readonly QuickRuleRouteOption[];
  routeValue: string | undefined;
  tab: Extract<CurrentTab, { available: true }> | undefined;
  temporaryDuration: TemporaryRuleDuration;
}

const CONDITION_LABELS: Readonly<Record<QuickRuleConditionType, string>> = {
  'host-wildcard': '主机通配符',
  'host-regex': '主机正则',
  'url-wildcard': '网址通配符',
  'url-regex': '网址正则',
  keyword: '关键词'
};

export function QuickRuleForm({
  automaticProfileId,
  automaticProfiles,
  busy,
  onAutomaticProfileChange,
  onCancel,
  onRouteChange,
  onSubmit,
  onTemporaryDurationChange,
  routeOptions,
  routeValue,
  tab,
  temporaryDuration
}: QuickRuleFormProps) {
  const [conditionType, setConditionType] = useState<QuickRuleConditionType>('host-wildcard');
  const [domainLevel, setDomainLevel] = useState(0);
  const [conditionValue, setConditionValue] = useState('');
  const [error, setError] = useState<string>();
  const suggestion = useMemo(
    () => (tab ? suggestQuickRules(tab.url, domainLevel) : undefined),
    [domainLevel, tab]
  );

  useEffect(() => {
    if (!suggestion) {
      setConditionValue('');
      return;
    }
    setDomainLevel(suggestion.level);
    setConditionValue(conditionText(suggestion.conditions[conditionType]));
  }, [conditionType, suggestion]);

  if (!tab || !suggestion) {
    return <p className="popup-hint">当前页面不能添加代理规则。</p>;
  }
  const currentSuggestion = suggestion;

  const canSubmit =
    !busy &&
    automaticProfileId !== undefined &&
    routeValue !== undefined &&
    automaticProfiles.length > 0 &&
    routeOptions.length > 0;

  async function submit(temporary: boolean): Promise<void> {
    const condition = conditionFromText(conditionType, conditionValue);
    if (!validateCondition(condition).ok) {
      setError('匹配条件无效，请检查输入内容。');
      return;
    }
    try {
      setError(undefined);
      await onSubmit({ condition, host: currentSuggestion.host, temporary });
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  return (
    <form
      className="original-quick-rule-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
    >
      <p className="original-quick-rule-host" title={tab.url}>
        当前网站：<strong>{currentSuggestion.host}</strong>
      </p>

      <label>
        当前网站规则条件类型
        <select
          aria-label="当前网站规则条件类型"
          disabled={busy}
          onChange={(event) => setConditionType(event.target.value as QuickRuleConditionType)}
          value={conditionType}
        >
          {QUICK_RULE_CONDITION_TYPES.map((type) => (
            <option key={type} value={type}>
              {CONDITION_LABELS[type]}
            </option>
          ))}
        </select>
      </label>

      <label>
        匹配内容
        <span className="original-quick-rule-condition-input">
          <input
            aria-label="当前网站规则条件"
            disabled={busy}
            onChange={(event) => setConditionValue(event.target.value)}
            value={conditionValue}
          />
          <button
            aria-label="切换网站域名层级"
            disabled={busy || currentSuggestion.levelCount < 2}
            onClick={() =>
              setDomainLevel((level) => (level + 1) % currentSuggestion.levelCount)
            }
            title="切换域名层级"
            type="button"
          >
            <Repeat2 size={16} />
          </button>
        </span>
      </label>

      <label>
        加入自动切换配置
        <select
          aria-label="要添加到的自动切换配置"
          disabled={busy || automaticProfiles.length === 0}
          onChange={(event) => onAutomaticProfileChange(event.target.value)}
          value={automaticProfileId ?? ''}
        >
          {automaticProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        当前网站规则目标
        <select
          aria-label="当前网站规则目标"
          disabled={busy || routeOptions.length === 0}
          onChange={(event) => onRouteChange(event.target.value)}
          value={routeValue ?? ''}
        >
          {routeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        临时规则时长
        <select
          aria-label="临时规则持续时间"
          disabled={busy}
          onChange={(event) => onTemporaryDurationChange(event.target.value as TemporaryRuleDuration)}
          value={temporaryDuration}
        >
          {TEMPORARY_RULE_DURATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {automaticProfiles.length === 0 ? (
        <p className="popup-hint">请先创建自动切换配置。</p>
      ) : null}
      {error ? <p className="popup-error original-quick-rule-error">{error}</p> : null}

      <div className="original-quick-rule-actions">
        <button disabled={busy} onClick={onCancel} type="button">
          取消
        </button>
        <button disabled={!canSubmit} onClick={() => void submit(true)} type="button">
          <Clock3 size={15} />
          临时加入
        </button>
        <button disabled={!canSubmit} type="submit">
          添加到自动切换
        </button>
      </div>
    </form>
  );
}

function conditionText(condition: QuickRuleCondition): string {
  return condition.type === 'keyword' ? condition.value : condition.pattern;
}

function conditionFromText(
  type: QuickRuleConditionType,
  value: string
): QuickRuleCondition {
  if (type === 'keyword') {
    return { type, value };
  }
  return { type, pattern: value } as QuickRuleCondition;
}

import { Clock3, Globe2, Plus } from 'lucide-react';

import type { AutomaticProfileOption, CurrentSiteScope } from './current-site-rule.ts';
import type { CurrentTab } from './current-tab.ts';
import {
  TEMPORARY_RULE_DURATION_OPTIONS,
  type TemporaryRuleDuration
} from '../components/temporary-rule-form.ts';

export interface PopupRouteOption {
  label: string;
  value: string;
}

export interface PopupRuleFormProps {
  automaticProfileId: string | undefined;
  automaticProfiles: readonly AutomaticProfileOption[];
  busy: boolean;
  canSubmit: boolean;
  mode: 'permanent' | 'temporary';
  onAutomaticProfileChange(profileId: string): void;
  onRuleScopeChange(scope: CurrentSiteScope): void;
  onRouteChange(route: string): void;
  onSubmit(url: string, scope: CurrentSiteScope): void;
  onTemporaryDurationChange(duration: TemporaryRuleDuration): void;
  rulePreview: string | undefined;
  ruleScope: CurrentSiteScope;
  routeOptions: readonly PopupRouteOption[];
  routeValue: string | undefined;
  tab: Extract<CurrentTab, { available: true }> | undefined;
  temporaryDuration: TemporaryRuleDuration;
}

const SCOPE_OPTIONS: readonly { label: string; value: CurrentSiteScope }[] = [
  { label: '主域', value: 'domain' },
  { label: '主机', value: 'host' },
  { label: '当前页', value: 'page' }
];

export function PopupRuleForm({
  automaticProfileId,
  automaticProfiles,
  busy,
  canSubmit,
  mode,
  onAutomaticProfileChange,
  onRuleScopeChange,
  onRouteChange,
  onSubmit,
  onTemporaryDurationChange,
  rulePreview,
  ruleScope,
  routeOptions,
  routeValue,
  tab,
  temporaryDuration
}: PopupRuleFormProps) {
  if (!tab) {
    return <p className="popup-hint">当前页面不能添加代理规则。</p>;
  }

  const temporary = mode === 'temporary';
  return (
    <>
      <p className="popup-current-host" title={tab.url}>
        <Globe2 size={15} aria-hidden="true" />
        <span>{tab.host}</span>
      </p>

      <div className="popup-form-field">
        <span className="field-caption">匹配范围</span>
        <div className="scope-control" aria-label="规则范围" role="group">
          {SCOPE_OPTIONS.map((option) => (
            <button
              aria-pressed={ruleScope === option.value}
              className={
                ruleScope === option.value ? 'scope-button scope-button-active' : 'scope-button'
              }
              disabled={busy}
              key={option.value}
              onClick={() => onRuleScopeChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {rulePreview ? <p className="rule-preview">{rulePreview}</p> : null}

      <label className="field-label">
        <span>加入配置</span>
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

      <label className="field-label">
        <span>访问方式</span>
        <select
          aria-label="当前网站的路由"
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

      {temporary ? (
        <label className="field-label">
          <span>生效时间</span>
          <select
            aria-label="临时规则持续时间"
            disabled={busy}
            onChange={(event) =>
              onTemporaryDurationChange(event.target.value as TemporaryRuleDuration)
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
      ) : null}

      <div className="popup-form-actions">
        <button
          className="command-button"
          disabled={!canSubmit}
          onClick={() => onSubmit(tab.url, ruleScope)}
          type="button"
        >
          {temporary ? <Clock3 size={15} /> : <Plus size={15} />}
          {temporary ? '临时加入自动切换' : '加入自动切换'}
        </button>
      </div>

      {automaticProfiles.length === 0 ? (
        <p className="popup-hint">请先在设置中创建自动切换配置。</p>
      ) : null}
    </>
  );
}

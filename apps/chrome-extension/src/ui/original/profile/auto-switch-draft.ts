import {
  isAutoSwitchRouteTargetV2,
  parseRuleList,
  validateProfileDocumentV2,
  type AutoSwitchProfileV2,
  type ProfileDocumentV2,
  type ProfileTarget,
  type RuleListProfileV2,
  type RuleListSource
} from '@switchypeformance/contracts';

import { updateAutoSwitchSettings } from '../../configuration/rule-actions.ts';
import { createOriginalProfile } from './profile-actions.ts';

export interface AttachedRuleList {
  ownedByAutoSwitch: boolean;
  profile: RuleListProfileV2;
  source: RuleListSource;
}

export function setAutoSwitchFallback(
  document: ProfileDocumentV2,
  profileId: string,
  fallback: ProfileTarget
): ProfileDocumentV2 {
  const profile = automaticProfile(document, profileId);
  const attached = attachedRuleListForAutoSwitch(document, profileId);
  if (attached) {
    const next: ProfileDocumentV2 = {
      ...document,
      profiles: document.profiles.map((candidate) =>
        candidate.kind === 'rule-list' && candidate.id === attached.profile.id
          ? { ...candidate, fallback }
          : candidate
      )
    };
    assertValidAutoSwitchDocument(next);
    return next;
  }
  return updateAutoSwitchSettings(document, profileId, {
    fallback,
    loopbackPolicy: profile.loopbackPolicy,
    proxyFailurePolicy: profile.proxyFailurePolicy
  });
}

export function setAutoSwitchRuleSourceIds(
  document: ProfileDocumentV2,
  profileId: string,
  sourceIds: readonly string[]
): ProfileDocumentV2 {
  const profile = automaticProfile(document, profileId);
  const normalized = [...new Set(sourceIds.map((sourceId) => sourceId.trim()).filter(Boolean))];
  for (const sourceId of normalized) {
    if (!document.ruleSources.some((source) => source.id === sourceId)) {
      throw new Error('规则来源不存在');
    }
  }
  const next: ProfileDocumentV2 = {
    ...document,
    profiles: document.profiles.map((candidate) =>
      candidate.id === profile.id ? { ...profile, ruleSourceIds: normalized } : candidate
    )
  };
  const issue = validateProfileDocumentV2(next)[0];
  if (issue) {
    throw new Error(`自动切换配置无效：${issue.path}`);
  }
  return next;
}

export function attachedRuleListForAutoSwitch(
  document: ProfileDocumentV2,
  profileId: string
): AttachedRuleList | undefined {
  const profile = automaticProfile(document, profileId);
  const sourceId = profile.ruleSourceIds[0];
  if (!sourceId) {
    return undefined;
  }
  const source = document.ruleSources.find((candidate) => candidate.id === sourceId);
  const ruleListProfile = document.profiles.find(
    (candidate): candidate is RuleListProfileV2 =>
      candidate.kind === 'rule-list' && candidate.sourceId === sourceId
  );
  if (!source || !ruleListProfile) {
    return undefined;
  }
  return {
    ownedByAutoSwitch: ruleListProfile.name === attachedRuleListProfileName(profile.id),
    profile: ruleListProfile,
    source
  };
}

export function createAttachedRuleList(
  document: ProfileDocumentV2,
  profileId: string,
  ruleListProfileId: string
): ProfileDocumentV2 {
  const profile = automaticProfile(document, profileId);
  if (profile.ruleSourceIds.length > 0) {
    throw new Error('当前自动切换已经附加了规则列表');
  }
  const created = createOriginalProfile(document, {
    id: ruleListProfileId,
    kind: 'rule-list',
    name: attachedRuleListProfileName(profile.id)
  });
  const ruleList = created.document.profiles.find(
    (candidate): candidate is RuleListProfileV2 =>
      candidate.id === created.profileId && candidate.kind === 'rule-list'
  );
  if (!ruleList) {
    throw new Error('无法创建附加规则列表');
  }
  const prepared: ProfileDocumentV2 = {
    ...created.document,
    profiles: created.document.profiles.map((candidate) =>
      candidate.id === ruleList.id
        ? {
            ...candidate,
            fallback: profile.fallback,
            matchTarget: profile.fallback,
            ...(profile.color === undefined ? {} : { color: profile.color })
          }
        : candidate
    ),
    ruleSources: created.document.ruleSources.map((source) =>
      source.id === ruleList.sourceId ? { ...source, name: `${profile.name} 规则列表` } : source
    )
  };
  return setAutoSwitchRuleSourceIds(prepared, profile.id, [ruleList.sourceId]);
}

export function removeAttachedRuleList(
  document: ProfileDocumentV2,
  profileId: string
): ProfileDocumentV2 {
  const profile = automaticProfile(document, profileId);
  const attached = attachedRuleListForAutoSwitch(document, profileId);
  if (!attached) {
    if (profile.ruleSourceIds.length === 0) {
      return document;
    }
    return setAutoSwitchRuleSourceIds(document, profile.id, []);
  }
  const detached = setAutoSwitchRuleSourceIds(
    document,
    profile.id,
    profile.ruleSourceIds.filter((sourceId) => sourceId !== attached.source.id)
  );
  if (!attached.ownedByAutoSwitch) {
    return detached;
  }
  const profiles = detached.profiles.filter((candidate) => candidate.id !== attached.profile.id);
  const sourceStillUsed = profiles.some(
    (candidate) => candidate.kind === 'rule-list' && candidate.sourceId === attached.source.id
  );
  const next: ProfileDocumentV2 = {
    ...detached,
    profiles,
    ruleSources: sourceStillUsed
      ? detached.ruleSources
      : detached.ruleSources.filter((source) => source.id !== attached.source.id)
  };
  const issue = validateProfileDocumentV2(next)[0];
  if (issue) {
    throw new Error(`自动切换配置无效：${issue.path}`);
  }
  return next;
}

/** Composes the same Switchy conditions text shape the original editor exposes. */
export function composeAutoSwitchText(document: ProfileDocumentV2, profileId: string): string {
  const profile = automaticProfile(document, profileId);
  const fallback = effectiveAutoSwitchFallback(document, profile);
  const lines = ['[SwitchyOmega Conditions]', '@with result'];
  for (const rule of profile.rules) {
    const target = requiredTargetName(document, rule.target, '规则目标');
    lines.push(`${conditionToText(rule.condition)} + ${target}`);
  }
  lines.push(`true + ${requiredTargetName(document, fallback, '默认目标')}`);
  return lines.join('\n');
}

/**
 * Parses source text before it reaches the draft. This is deliberately strict:
 * a malformed or unknown target must never silently become a direct rule.
 */
export function replaceAutoSwitchText(
  document: ProfileDocumentV2,
  profileId: string,
  source: string,
  createRuleId: () => string
): ProfileDocumentV2 {
  const profile = automaticProfile(document, profileId);
  const attached = attachedRuleListForAutoSwitch(document, profileId);
  const parsed = parseRuleList(source, 'switchy');
  if (!parsed.resultProfilesEnabled) {
    throw new Error('规则文本缺少 @with result，无法读取每条规则的目标配置');
  }
  const firstWarning = parsed.warnings[0];
  if (firstWarning) {
    throw new Error(`第 ${firstWarning.line} 行规则文本无效：${warningMessage(firstWarning.code)}`);
  }
  if (parsed.rules.length === 0) {
    throw new Error('规则文本至少需要一行默认目标，例如：true + 直连');
  }

  const defaultRule = parsed.rules.at(-1);
  if (!defaultRule || defaultRule.exclusive || defaultRule.condition.type !== 'always') {
    throw new Error('规则文本最后一行必须是默认目标，例如：true + 直连');
  }
  const fallback = targetFromSourceName(document, defaultRule.resultProfileName, defaultRule.line);
  const existingIds = reusableRuleIds(profile);
  const rules = parsed.rules.slice(0, -1).map((sourceRule) => {
    if (sourceRule.exclusive) {
      throw new Error(`第 ${sourceRule.line} 行不能使用 ! 排他规则`);
    }
    const target = targetFromSourceName(document, sourceRule.resultProfileName, sourceRule.line);
    const enabled = sourceRule.condition.type !== 'never';
    const key = ruleKey(sourceRule.condition, target, enabled);
    const reusable = existingIds.get(key)?.shift();
    return {
      condition: sourceRule.condition,
      enabled,
      id: reusable ?? createRuleId(),
      target
    };
  });
  const next: ProfileDocumentV2 = {
    ...document,
    profiles: document.profiles.map((candidate) => {
      if (candidate.id === profile.id) {
        return attached ? { ...profile, rules } : { ...profile, fallback, rules };
      }
      if (attached && candidate.kind === 'rule-list' && candidate.id === attached.profile.id) {
        return { ...candidate, fallback };
      }
      return candidate;
    })
  };
  assertValidAutoSwitchDocument(next, '自动切换规则无效');
  return next;
}

function automaticProfile(document: ProfileDocumentV2, profileId: string): AutoSwitchProfileV2 {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('自动切换配置不存在');
  }
  return profile;
}

function attachedRuleListProfileName(profileId: string): string {
  return `__ruleListOf_${profileId}`;
}

function effectiveAutoSwitchFallback(
  document: ProfileDocumentV2,
  profile: AutoSwitchProfileV2
): ProfileTarget {
  return attachedRuleListForAutoSwitch(document, profile.id)?.profile.fallback ?? profile.fallback;
}

function assertValidAutoSwitchDocument(
  document: ProfileDocumentV2,
  prefix = '自动切换配置无效'
): void {
  const issue = validateProfileDocumentV2(document)[0];
  if (issue) {
    throw new Error(`${prefix}：${issue.path}`);
  }
}

function requiredTargetName(
  document: ProfileDocumentV2,
  target: ProfileTarget,
  label: string
): string {
  const profile = document.profiles.find((candidate) => candidate.id === target.profileId);
  if (!profile) {
    throw new Error(`${label}引用的配置不存在`);
  }
  if (profile.name.includes('\n') || profile.name.includes('\r') || profile.name.includes(' +')) {
    throw new Error(`${label}名称不能在规则文本模式中使用：${profile.name}`);
  }
  return profile.name;
}

function targetFromSourceName(
  document: ProfileDocumentV2,
  name: string | undefined,
  line: number
): ProfileTarget {
  if (!name) {
    throw new Error(`第 ${line} 行缺少目标配置`);
  }
  const profile = document.profiles.find((candidate) => candidate.name === name);
  if (!profile) {
    throw new Error(`第 ${line} 行引用的配置不存在：${name}`);
  }
  if (!isAutoSwitchRouteTargetV2(document, profile.id)) {
    throw new Error(`第 ${line} 行的目标配置不能用于自动切换：${name}`);
  }
  return { profileId: profile.id };
}

function reusableRuleIds(profile: AutoSwitchProfileV2): Map<string, string[]> {
  const ids = new Map<string, string[]>();
  for (const rule of profile.rules) {
    const key = ruleKey(rule.condition, rule.target, rule.enabled);
    const matching = ids.get(key) ?? [];
    matching.push(rule.id);
    ids.set(key, matching);
  }
  return ids;
}

function ruleKey(condition: unknown, target: ProfileTarget, enabled: boolean): string {
  return `${stableJson(condition)}|${target.profileId}|${enabled}`;
}

function conditionToText(condition: AutoSwitchProfileV2['rules'][number]['condition']): string {
  switch (condition.type) {
    case 'host-wildcard':
      return `host: ${condition.pattern}`;
    case 'host-regex':
      return `regex: ${condition.pattern}`;
    case 'host-levels':
      return `levels: ${condition.max === undefined ? `>=${condition.min}` : `${condition.min}-${condition.max}`}`;
    case 'ip-cidr':
      return `ip: ${condition.address}/${condition.prefixLength}`;
    case 'url-wildcard':
      return `url: ${condition.pattern}`;
    case 'url-regex':
      return `urlregex: ${condition.pattern}`;
    case 'keyword':
      return `keyword: ${condition.value}`;
    case 'always':
      return 'true';
    case 'bypass':
      return `bypass: ${condition.pattern}`;
    case 'time-range':
      return `time: ${formatMinute(condition.startMinute)}-${formatMinute(condition.endMinute)}`;
    case 'weekday':
      return `weekday: ${condition.days.join(',')}`;
    case 'never':
      return 'false';
  }
}

function formatMinute(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function warningMessage(code: string): string {
  switch (code) {
    case 'invalid-condition':
      return '匹配条件不合法';
    case 'missing-result-profile':
      return '缺少目标配置';
    default:
      return '不支持的规则写法';
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

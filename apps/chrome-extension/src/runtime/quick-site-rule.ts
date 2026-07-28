import {
  isAutoSwitchRouteTargetV2,
  resolveProfileV2,
  validateCondition,
  validateProfileDocumentV2,
  type ConfigurationDocument,
  type ProfileDocument,
  type ProfileDocumentV2,
  type ProfileTarget,
  type RuleConditionV2,
  type RouteTarget
} from '@switchypeformance/contracts';

import type { CurrentSiteRule, CurrentSiteScope } from '../ui/popup/current-site-rule.ts';

interface CurrentSiteRuleInputBase {
  automaticProfileId: string;
  condition: CurrentSiteRule['condition'];
  host: string;
  ruleId: string;
  scope: CurrentSiteScope;
}

export interface CurrentSiteRuleInput extends CurrentSiteRuleInputBase {
  target: ProfileTarget | RouteTarget;
}

export interface V1CurrentSiteRuleInput extends CurrentSiteRuleInputBase {
  target: RouteTarget;
}

export interface V2CurrentSiteRuleInput extends CurrentSiteRuleInputBase {
  target: ProfileTarget;
}

export function addCurrentSiteRule(
  document: ProfileDocument,
  input: V1CurrentSiteRuleInput
): ProfileDocument;
export function addCurrentSiteRule(
  document: ProfileDocumentV2,
  input: V2CurrentSiteRuleInput
): ProfileDocumentV2;
export function addCurrentSiteRule(
  document: ConfigurationDocument,
  input: CurrentSiteRuleInput
): ConfigurationDocument;
export function addCurrentSiteRule(
  document: ConfigurationDocument,
  input: CurrentSiteRuleInput
): ConfigurationDocument {
  if (document.schemaVersion === 1) {
    if (!isRouteTarget(input.target)) {
      throw new Error('旧配置不能使用 V2 配置目标');
    }
    return addV1CurrentSiteRule(document, { ...input, target: input.target });
  }
  if (!isProfileTarget(input.target)) {
    throw new Error('V2 配置需要选择配置目标');
  }
  return addV2CurrentSiteRule(document, { ...input, target: input.target });
}

function addV1CurrentSiteRule(
  document: ProfileDocument,
  input: V1CurrentSiteRuleInput
): ProfileDocument {
  const target = input.target;
  if (target.kind === 'proxy' && !document.proxies.some((proxy) => proxy.id === target.proxyId)) {
    throw new Error('代理服务器不存在');
  }

  const profile = requiredV1AutomaticProfile(document, input.automaticProfileId);
  const siteCondition = requiredQuickRuleCondition(input.condition);
  const condition = v1Condition(input.scope, siteCondition);
  const existingIndex = profile.rules.findIndex(
    (rule) => rule.condition.type === condition.type && rule.condition.value === condition.value
  );
  const rules =
    existingIndex < 0
      ? [...profile.rules, { condition, enabled: true, id: requiredRuleId(input.ruleId), target }]
      : profile.rules.map((rule, index) =>
          index === existingIndex ? { ...rule, enabled: true, target } : rule
        );
  const replacement = {
    ...profile,
    loopbackPolicy:
      isLoopbackHost(input.host) && target.kind !== 'direct'
        ? ('use-rules' as const)
        : profile.loopbackPolicy,
    rules
  };
  return {
    ...document,
    profiles: document.profiles.map((candidate) =>
      candidate.id === replacement.id ? replacement : candidate
    )
  };
}

function addV2CurrentSiteRule(
  document: ProfileDocumentV2,
  input: V2CurrentSiteRuleInput
): ProfileDocumentV2 {
  const target = input.target;
  if (!isAutoSwitchRouteTargetV2(document, target.profileId)) {
    throw new Error('自动切换规则目标不能被 Chrome PAC 路由');
  }

  const profile = requiredV2AutomaticProfile(document, input.automaticProfileId);
  const siteCondition = requiredQuickRuleCondition(input.condition);
  const existingIndex = profile.rules.findIndex((rule) =>
    sameV2Condition(rule.condition, siteCondition)
  );
  const rules =
    existingIndex < 0
      ? document.settings.ruleInsertPosition === 'first'
        ? [
            {
              condition: siteCondition,
              enabled: true,
              id: requiredRuleId(input.ruleId),
              target
            },
            ...profile.rules
          ]
        : [
            ...profile.rules,
            {
              condition: siteCondition,
              enabled: true,
              id: requiredRuleId(input.ruleId),
              target
            }
          ]
      : profile.rules.map((rule, index) =>
          index === existingIndex ? { ...rule, enabled: true, target } : rule
        );
  const resolvedTarget = resolveProfileV2(document, target.profileId).profile;
  const replacement = {
    ...profile,
    loopbackPolicy:
      isLoopbackHost(input.host) && resolvedTarget.kind !== 'direct'
        ? ('use-rules' as const)
        : profile.loopbackPolicy,
    rules
  };
  const next = {
    ...document,
    profiles: document.profiles.map((candidate) =>
      candidate.id === replacement.id ? replacement : candidate
    )
  };
  const issues = validateProfileDocumentV2(next);
  if (issues.length > 0) {
    throw new Error(`代理配置不合法：${issues[0]?.path ?? '未知位置'}`);
  }
  return next;
}

function v1Condition(
  scope: CurrentSiteScope,
  condition: CurrentSiteRule['condition']
): Extract<
  ProfileDocument['profiles'][number],
  { kind: 'auto-switch' }
>['rules'][number]['condition'] {
  if (condition.type === 'url-wildcard') {
    return { type: 'url-glob', value: condition.pattern };
  }
  if (scope === 'domain' && condition.pattern.startsWith('*.')) {
    return { type: 'host-suffix', value: condition.pattern.slice(2) };
  }
  return { type: 'host-equals', value: condition.pattern };
}

function sameV2Condition(left: RuleConditionV2, right: CurrentSiteRule['condition']): boolean {
  if (left.type === 'host-wildcard' && right.type === 'host-wildcard') {
    return left.pattern === right.pattern;
  }
  return (
    left.type === 'url-wildcard' && right.type === 'url-wildcard' && left.pattern === right.pattern
  );
}

function requiredQuickRuleCondition(
  condition: CurrentSiteRule['condition']
): CurrentSiteRule['condition'] {
  if (!validateCondition(condition).ok) {
    throw new Error('当前网站规则条件无效');
  }
  return condition;
}

function requiredV1AutomaticProfile(document: ProfileDocument, profileId: string) {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('自动切换配置不存在');
  }
  return profile;
}

function requiredV2AutomaticProfile(document: ProfileDocumentV2, profileId: string) {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('自动切换配置不存在');
  }
  return profile;
}

function requiredRuleId(ruleId: string): string {
  const normalized = ruleId.trim();
  if (!normalized) {
    throw new Error('规则 ID 不能为空');
  }
  return normalized;
}

function isRouteTarget(value: CurrentSiteRuleInput['target']): value is RouteTarget {
  if (!('kind' in value)) {
    return false;
  }
  return (
    value.kind === 'direct' ||
    value.kind === 'system' ||
    (value.kind === 'proxy' && typeof value.proxyId === 'string' && value.proxyId.trim().length > 0)
  );
}

function isProfileTarget(value: CurrentSiteRuleInput['target']): value is ProfileTarget {
  return 'profileId' in value;
}

function isLoopbackHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0' ||
    host === '::' ||
    host === '[::]' ||
    host === '::1' ||
    host === '[::1]' ||
    host.startsWith('127.')
  );
}

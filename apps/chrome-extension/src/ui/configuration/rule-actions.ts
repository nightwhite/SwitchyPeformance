import {
  isAutoSwitchRouteTargetV2,
  validateCondition,
  validateProfileDocumentV2,
  type AutoSwitchProfileV2,
  type ProfileDocumentV2,
  type ProfileTarget,
  type SwitchRuleV2
} from '@switchypeformance/contracts';

export interface AutoSwitchSettingsUpdate {
  fallback: ProfileTarget;
  loopbackPolicy: AutoSwitchProfileV2['loopbackPolicy'];
  proxyFailurePolicy: AutoSwitchProfileV2['proxyFailurePolicy'];
}

export function addRule(
  document: ProfileDocumentV2,
  profileId: string,
  rule: SwitchRuleV2
): ProfileDocumentV2 {
  const profile = requiredAutoSwitchProfile(document, profileId);
  validateRule(document, rule);
  if (profile.rules.some((candidate) => candidate.id === rule.id)) {
    throw new Error('规则 ID 已存在');
  }
  const rules =
    document.settings.ruleInsertPosition === 'first'
      ? [rule, ...profile.rules]
      : [...profile.rules, rule];
  return replaceAutoSwitchProfile(document, { ...profile, rules });
}

export function updateRule(
  document: ProfileDocumentV2,
  profileId: string,
  replacement: SwitchRuleV2
): ProfileDocumentV2 {
  const profile = requiredAutoSwitchProfile(document, profileId);
  validateRule(document, replacement);
  let found = false;
  const rules = profile.rules.map((rule) => {
    if (rule.id !== replacement.id) {
      return rule;
    }
    found = true;
    return replacement;
  });
  if (!found) {
    throw new Error('自动切换规则不存在');
  }
  return replaceAutoSwitchProfile(document, { ...profile, rules });
}

export function cloneRule(
  document: ProfileDocumentV2,
  profileId: string,
  ruleId: string,
  copyId: string
): ProfileDocumentV2 {
  const profile = requiredAutoSwitchProfile(document, profileId);
  const sourceIndex = profile.rules.findIndex((rule) => rule.id === ruleId);
  if (sourceIndex < 0) {
    throw new Error('自动切换规则不存在');
  }
  const source = profile.rules[sourceIndex];
  if (!source) {
    throw new Error('自动切换规则不存在');
  }
  const id = copyId.trim();
  if (!id || profile.rules.some((rule) => rule.id === id)) {
    throw new Error('规则 ID 已存在');
  }
  const copy: SwitchRuleV2 = { ...source, id };
  const rules = [...profile.rules.slice(0, sourceIndex + 1), copy, ...profile.rules.slice(sourceIndex + 1)];
  return replaceAutoSwitchProfile(document, { ...profile, rules });
}

export function toggleRule(
  document: ProfileDocumentV2,
  profileId: string,
  ruleId: string,
  enabled: boolean
): ProfileDocumentV2 {
  const profile = requiredAutoSwitchProfile(document, profileId);
  let found = false;
  const rules = profile.rules.map((rule) => {
    if (rule.id !== ruleId) {
      return rule;
    }
    found = true;
    return { ...rule, enabled };
  });
  if (!found) {
    throw new Error('自动切换规则不存在');
  }
  return replaceAutoSwitchProfile(document, { ...profile, rules });
}

export function moveRule(
  document: ProfileDocumentV2,
  profileId: string,
  ruleId: string,
  toIndex: number
): ProfileDocumentV2 {
  const profile = requiredAutoSwitchProfile(document, profileId);
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= profile.rules.length) {
    throw new Error('规则排序位置无效');
  }
  const fromIndex = profile.rules.findIndex((rule) => rule.id === ruleId);
  if (fromIndex < 0) {
    throw new Error('自动切换规则不存在');
  }
  if (fromIndex === toIndex) {
    return document;
  }
  const rule = profile.rules[fromIndex];
  if (!rule) {
    throw new Error('自动切换规则不存在');
  }
  const rules = profile.rules.filter((rule) => rule.id !== ruleId);
  rules.splice(toIndex, 0, rule);
  return replaceAutoSwitchProfile(document, { ...profile, rules });
}

export function removeRule(
  document: ProfileDocumentV2,
  profileId: string,
  ruleId: string
): ProfileDocumentV2 {
  const profile = requiredAutoSwitchProfile(document, profileId);
  const rules = profile.rules.filter((rule) => rule.id !== ruleId);
  if (rules.length === profile.rules.length) {
    throw new Error('自动切换规则不存在');
  }
  return replaceAutoSwitchProfile(document, { ...profile, rules });
}

export function resetRuleTargets(
  document: ProfileDocumentV2,
  profileId: string
): ProfileDocumentV2 {
  const profile = requiredAutoSwitchProfile(document, profileId);
  return replaceAutoSwitchProfile(document, {
    ...profile,
    rules: profile.rules.map((rule) => ({ ...rule, target: profile.fallback }))
  });
}

export function updateAutoSwitchSettings(
  document: ProfileDocumentV2,
  profileId: string,
  update: AutoSwitchSettingsUpdate
): ProfileDocumentV2 {
  const profile = requiredAutoSwitchProfile(document, profileId);
  validateRuleTarget(document, update.fallback);
  if (update.loopbackPolicy !== 'direct' && update.loopbackPolicy !== 'use-rules') {
    throw new Error('本地地址策略无效');
  }
  if (update.proxyFailurePolicy !== 'direct' && update.proxyFailurePolicy !== 'block') {
    throw new Error('代理失败策略无效');
  }
  return replaceAutoSwitchProfile(document, { ...profile, ...update });
}

function validateRule(document: ProfileDocumentV2, rule: SwitchRuleV2): void {
  if (!rule.id.trim()) {
    throw new Error('规则 ID 不能为空');
  }
  if (!validateCondition(rule.condition).ok) {
    throw new Error('规则条件不合法');
  }
  validateRuleTarget(document, rule.target);
}

function validateRuleTarget(document: ProfileDocumentV2, target: ProfileTarget): void {
  if (!isAutoSwitchRouteTargetV2(document, target.profileId)) {
    throw new Error('自动切换规则目标不能被 Chrome PAC 路由');
  }
}

function requiredAutoSwitchProfile(
  document: ProfileDocumentV2,
  profileId: string
): AutoSwitchProfileV2 {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('自动切换配置不存在');
  }
  return profile;
}

function replaceAutoSwitchProfile(
  document: ProfileDocumentV2,
  replacement: AutoSwitchProfileV2
): ProfileDocumentV2 {
  const next: ProfileDocumentV2 = {
    ...document,
    profiles: document.profiles.map((profile) =>
      profile.id === replacement.id ? replacement : profile
    )
  };
  const issues = validateProfileDocumentV2(next);
  if (issues.length > 0) {
    throw new Error(`代理配置不合法：${issues[0]?.path ?? '未知位置'}`);
  }
  return next;
}

import {
  validateProfileDocumentV2,
  type AutoSwitchProfileV2,
  type ProfileDocumentV2,
  type ProfileTarget
} from '@switchypeformance/contracts';

import { updateAutoSwitchSettings } from '../../configuration/rule-actions.ts';

export function setAutoSwitchFallback(
  document: ProfileDocumentV2,
  profileId: string,
  fallback: ProfileTarget
): ProfileDocumentV2 {
  const profile = automaticProfile(document, profileId);
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

function automaticProfile(document: ProfileDocumentV2, profileId: string): AutoSwitchProfileV2 {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('自动切换配置不存在');
  }
  return profile;
}

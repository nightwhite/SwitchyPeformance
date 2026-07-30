import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { updateRuleListProfile, updateVirtualProfile } from '../../configuration/advanced-profile-actions.ts';
import { updateAutoSwitchSettings } from '../../configuration/rule-actions.ts';

export function setPopupDefaultTarget(
  document: ProfileDocumentV2,
  profileId: string,
  targetProfileId: string
): ProfileDocumentV2 {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    throw new Error('配置不存在');
  }
  switch (profile.kind) {
    case 'auto-switch':
      return updateAutoSwitchSettings(document, profile.id, {
        fallback: { profileId: targetProfileId },
        loopbackPolicy: profile.loopbackPolicy,
        proxyFailurePolicy: profile.proxyFailurePolicy
      });
    case 'rule-list': {
      const source = document.ruleSources.find((candidate) => candidate.id === profile.sourceId);
      if (!source) {
        throw new Error('规则列表引用的来源不存在');
      }
      return updateRuleListProfile(document, profile.id, {
        allowInsecureHttp: isHttpSource(source.source),
        fallback: { profileId: targetProfileId },
        matchTarget: profile.matchTarget,
        source
      });
    }
    case 'virtual':
      return updateVirtualProfile(document, profile.id, { profileId: targetProfileId });
    default:
      throw new Error('这个配置没有可修改的默认目标');
  }
}

function isHttpSource(source: { kind: 'inline'; text: string } | { kind: 'url'; url: string }): boolean {
  return source.kind === 'url' && source.url.trim().startsWith('http:');
}

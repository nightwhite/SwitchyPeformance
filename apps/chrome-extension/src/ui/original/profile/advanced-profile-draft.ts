import type {
  PacProfileV2,
  ProfileDocumentV2,
  ProfileTarget,
  RuleListProfileV2,
  RuleListSource
} from '@switchypeformance/contracts';

import {
  updatePacProfile,
  updateRuleListProfile,
  updateVirtualProfile,
  type PacProfileUpdate,
  type RuleListProfileUpdate
} from '../../configuration/advanced-profile-actions.ts';

export function updatePacDraft(
  document: ProfileDocumentV2,
  profileId: string,
  update: PacProfileUpdate
): ProfileDocumentV2 {
  return updatePacProfile(document, profileId, update);
}

export function updateRuleListDraft(
  document: ProfileDocumentV2,
  profileId: string,
  update: RuleListProfileUpdate
): ProfileDocumentV2 {
  return updateRuleListProfile(document, profileId, update);
}

export function updateVirtualDraft(
  document: ProfileDocumentV2,
  profileId: string,
  target: ProfileTarget
): ProfileDocumentV2 {
  return updateVirtualProfile(document, profileId, target);
}

export type { PacProfileUpdate, RuleListProfileUpdate };
export type { PacProfileV2, RuleListProfileV2, RuleListSource };

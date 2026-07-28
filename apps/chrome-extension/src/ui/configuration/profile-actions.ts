import {
  validateProfileDocumentV2,
  type ProfileDocumentV2,
  type ProfileKind,
  type ProfileV2
} from '@switchypeformance/contracts';

export const CREATABLE_PROFILE_KINDS = [
  'auto-switch',
  'auto-detect',
  'pac',
  'rule-list',
  'virtual'
] as const;

export type CreatableProfileKind = (typeof CREATABLE_PROFILE_KINDS)[number];

export interface ProfileReference {
  ownerProfileId: string;
  field: string;
}

export type ProfileDeletionPlan =
  | { allowed: true; references: readonly ProfileReference[] }
  | { allowed: false; reason: string; references: readonly ProfileReference[] };

export interface CloneProfileOptions {
  id: string;
  name: string;
  ruleId(index: number): string;
}

export interface CreateProfileOptions {
  id: string;
  kind: CreatableProfileKind;
  name: string;
}

export function planProfileDeletion(
  document: ProfileDocumentV2,
  profileId: string
): ProfileDeletionPlan {
  const profile = requiredProfile(document, profileId);
  if (isBuiltinProfile(profile)) {
    return { allowed: false, reason: '内置配置不能删除', references: [] };
  }
  const references = profileReferences(document, profileId);
  return references.length === 0
    ? { allowed: true, references }
    : { allowed: false, reason: '该配置仍被引用', references };
}

export function replaceAndDeleteProfile(
  document: ProfileDocumentV2,
  profileId: string,
  replacementProfileId: string
): ProfileDocumentV2 {
  const profile = requiredProfile(document, profileId);
  const plan = planProfileDeletion(document, profileId);
  if (!plan.allowed && plan.reason === '内置配置不能删除') {
    throw new Error(plan.reason);
  }
  if (profileId === replacementProfileId) {
    throw new Error('替代配置不能是待删除配置本身');
  }
  requiredProfile(document, replacementProfileId);
  const profiles = document.profiles
    .filter((candidate) => candidate.id !== profileId)
    .map((candidate) => replaceProfileReference(candidate, profileId, replacementProfileId));
  const next: ProfileDocumentV2 = {
    ...document,
    activeProfileId:
      document.activeProfileId === profileId ? replacementProfileId : document.activeProfileId,
    profiles,
    ruleSources:
      profile.kind === 'rule-list' && !hasRuleSourceReference(profiles, profile.sourceId)
        ? document.ruleSources.filter((source) => source.id !== profile.sourceId)
        : document.ruleSources,
    settings: {
      ...document.settings,
      startupProfileId:
        document.settings.startupProfileId === profileId
          ? replacementProfileId
          : document.settings.startupProfileId
    }
  };
  assertValidProfileDocument(next);
  return next;
}

function hasRuleSourceReference(profiles: readonly ProfileV2[], sourceId: string): boolean {
  return profiles.some((profile) => {
    if (profile.kind === 'auto-switch') {
      return profile.ruleSourceIds.includes(sourceId);
    }
    return profile.kind === 'rule-list' && profile.sourceId === sourceId;
  });
}

export function renameProfile(
  document: ProfileDocumentV2,
  profileId: string,
  name: string
): ProfileDocumentV2 {
  const profile = requiredProfile(document, profileId);
  if (isBuiltinProfile(profile)) {
    throw new Error('内置配置不能重命名');
  }
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error('请填写配置名称');
  }
  return {
    ...document,
    profiles: document.profiles.map((candidate) =>
      candidate.id === profileId ? { ...candidate, name: normalizedName } : candidate
    )
  };
}

export function cloneProfile(
  document: ProfileDocumentV2,
  profileId: string,
  options: CloneProfileOptions
): ProfileDocumentV2 {
  const profile = requiredProfile(document, profileId);
  if (isBuiltinProfile(profile)) {
    throw new Error('内置配置不能复制');
  }
  if (!options.id.trim() || document.profiles.some((candidate) => candidate.id === options.id)) {
    throw new Error('新配置 ID 已存在');
  }
  const name = options.name.trim();
  if (!name) {
    throw new Error('请填写复制后的配置名称');
  }
  if (profile.kind === 'rule-list') {
    return cloneRuleListProfile(document, profile, options, name);
  }
  const copy =
    profile.kind === 'auto-switch'
      ? {
          ...profile,
          id: options.id,
          name,
          rules: profile.rules.map((rule, index) => ({ ...rule, id: options.ruleId(index) }))
        }
      : { ...profile, id: options.id, name };
  return { ...document, profiles: [...document.profiles, copy] };
}

function cloneRuleListProfile(
  document: ProfileDocumentV2,
  profile: Extract<ProfileV2, { kind: 'rule-list' }>,
  options: CloneProfileOptions,
  name: string
): ProfileDocumentV2 {
  const source = document.ruleSources.find((candidate) => candidate.id === profile.sourceId);
  if (!source) {
    throw new Error('规则列表来源不存在');
  }
  const sourceId = `rule-source-${options.id}`;
  if (document.ruleSources.some((candidate) => candidate.id === sourceId)) {
    throw new Error('规则列表来源 ID 已存在');
  }
  const next: ProfileDocumentV2 = {
    ...document,
    profiles: [...document.profiles, { ...profile, id: options.id, name, sourceId }],
    ruleSources: [...document.ruleSources, { ...source, id: sourceId, name: `${source.name} 副本` }]
  };
  assertValidProfileDocument(next);
  return next;
}

export function moveProfile(
  document: ProfileDocumentV2,
  profileId: string,
  beforeProfileId: string | undefined
): ProfileDocumentV2 {
  const profile = requiredProfile(document, profileId);
  if (isBuiltinProfile(profile)) {
    throw new Error('内置配置不能排序');
  }
  if (
    beforeProfileId !== undefined &&
    isBuiltinProfile(requiredProfile(document, beforeProfileId))
  ) {
    throw new Error('不能排到内置配置之前');
  }
  const remaining = document.profiles.filter((candidate) => candidate.id !== profileId);
  const targetIndex =
    beforeProfileId === undefined
      ? remaining.length
      : remaining.findIndex((candidate) => candidate.id === beforeProfileId);
  if (targetIndex < 0) {
    throw new Error('排序目标配置不存在');
  }
  return {
    ...document,
    profiles: [...remaining.slice(0, targetIndex), profile, ...remaining.slice(targetIndex)]
  };
}

export function createProfile(
  document: ProfileDocumentV2,
  options: CreateProfileOptions
): ProfileDocumentV2 {
  const id = options.id.trim();
  const name = options.name.trim();
  if (!id || document.profiles.some((profile) => profile.id === id)) {
    throw new Error('新配置 ID 已存在');
  }
  if (!name) {
    throw new Error('请填写配置名称');
  }
  const profile = createProfileTemplate(options.kind, id, name);
  const next: ProfileDocumentV2 = {
    ...document,
    profiles: [...document.profiles, profile],
    ruleSources:
      profile.kind === 'rule-list'
        ? [
            ...document.ruleSources,
            {
              id: profile.sourceId,
              name: `${name} 来源`,
              format: 'auto-proxy',
              source: { kind: 'inline', text: '' }
            }
          ]
        : document.ruleSources
  };
  assertValidProfileDocument(next);
  return next;
}

function createProfileTemplate(kind: CreatableProfileKind, id: string, name: string): ProfileV2 {
  switch (kind) {
    case 'auto-switch':
      return {
        id,
        kind,
        name,
        fallback: { profileId: 'direct' },
        loopbackPolicy: 'direct',
        proxyFailurePolicy: 'direct',
        rules: [],
        ruleSourceIds: []
      };
    case 'auto-detect':
      return { id, kind, name };
    case 'pac':
      return {
        id,
        kind,
        name,
        source: { kind: 'inline', text: "function FindProxyForURL(){return 'DIRECT';}" }
      };
    case 'rule-list':
      return {
        id,
        kind,
        name,
        sourceId: `rule-source-${id}`,
        matchTarget: { profileId: 'direct' },
        fallback: { profileId: 'direct' }
      };
    case 'virtual':
      return { id, kind, name, target: { profileId: 'direct' } };
  }
}

function profileReferences(document: ProfileDocumentV2, profileId: string): ProfileReference[] {
  const references: ProfileReference[] = [];
  if (document.activeProfileId === profileId) {
    references.push({ ownerProfileId: 'active', field: 'activeProfileId' });
  }
  if (document.settings.startupProfileId === profileId) {
    references.push({ ownerProfileId: 'settings', field: 'settings.startupProfileId' });
  }
  for (const profile of document.profiles) {
    switch (profile.kind) {
      case 'auto-switch':
        if (profile.fallback.profileId === profileId) {
          references.push({ ownerProfileId: profile.id, field: 'fallback.profileId' });
        }
        for (const [index, rule] of profile.rules.entries()) {
          if (rule.target.profileId === profileId) {
            references.push({
              ownerProfileId: profile.id,
              field: `rules[${index}].target.profileId`
            });
          }
        }
        break;
      case 'rule-list':
        if (profile.matchTarget.profileId === profileId) {
          references.push({ ownerProfileId: profile.id, field: 'matchTarget.profileId' });
        }
        if (profile.fallback.profileId === profileId) {
          references.push({ ownerProfileId: profile.id, field: 'fallback.profileId' });
        }
        break;
      case 'virtual':
        if (profile.target.profileId === profileId) {
          references.push({ ownerProfileId: profile.id, field: 'target.profileId' });
        }
        break;
      case 'direct':
      case 'system':
      case 'fixed-proxy':
      case 'pac':
      case 'auto-detect':
        break;
    }
  }
  return references;
}

function replaceProfileReference(
  profile: ProfileV2,
  profileId: string,
  replacementProfileId: string
): ProfileV2 {
  switch (profile.kind) {
    case 'auto-switch':
      return {
        ...profile,
        fallback: replaceTarget(profile.fallback, profileId, replacementProfileId),
        rules: profile.rules.map((rule) => ({
          ...rule,
          target: replaceTarget(rule.target, profileId, replacementProfileId)
        }))
      };
    case 'rule-list':
      return {
        ...profile,
        matchTarget: replaceTarget(profile.matchTarget, profileId, replacementProfileId),
        fallback: replaceTarget(profile.fallback, profileId, replacementProfileId)
      };
    case 'virtual':
      return {
        ...profile,
        target: replaceTarget(profile.target, profileId, replacementProfileId)
      };
    case 'direct':
    case 'system':
    case 'fixed-proxy':
    case 'pac':
    case 'auto-detect':
      return profile;
  }
}

function replaceTarget(
  target: { profileId: string },
  profileId: string,
  replacementProfileId: string
) {
  return target.profileId === profileId ? { profileId: replacementProfileId } : target;
}

function requiredProfile(document: ProfileDocumentV2, profileId: string): ProfileV2 {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    throw new Error('配置不存在');
  }
  return profile;
}

function isBuiltinProfile(profile: ProfileV2): boolean {
  return profile.id === 'direct' || profile.id === 'system';
}

function assertValidProfileDocument(document: ProfileDocumentV2): void {
  const issue = validateProfileDocumentV2(document)[0];
  if (issue) {
    throw new Error(`替换后配置无效：${issue.path}`);
  }
}

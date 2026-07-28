import {
  isAutoSwitchRouteTargetV2,
  resolveProfileV2,
  validateCondition,
  type ConfigurationDocument,
  type ProfileDocument,
  type ProfileDocumentV2,
  type Rule,
  type SwitchRuleV2
} from '@switchypeformance/contracts';
import {
  createCurrentSiteRuleEntry,
  isChromeLoopbackHost,
  type CurrentSiteRuleInput
} from './quick-site-rule.ts';
import type { TemporaryRuleRepository } from './temporary-rule-repository.ts';

export interface TemporaryRuleV1 {
  automaticProfileId: string;
  createdAt: number;
  expiresAt: number;
  host: string;
  id: string;
  rule: Rule;
  schemaVersion: 1;
  scope: 'global';
}

export interface TemporaryRuleV2 {
  automaticProfileId: string;
  createdAt: number;
  expiresAt: number;
  host: string;
  id: string;
  rule: SwitchRuleV2;
  schemaVersion: 2;
  scope: 'global';
}

export type TemporaryRule = TemporaryRuleV1 | TemporaryRuleV2;

export interface TemporaryCurrentSiteRuleInput extends Omit<CurrentSiteRuleInput, 'ruleId'> {
  createdAt: number;
  expiresAt: number;
  id: string;
}

export type TemporaryCurrentSiteRuleDraft = Omit<TemporaryCurrentSiteRuleInput, 'createdAt' | 'id'>;

export interface TemporaryRuleServiceDependencies {
  clock?: () => number;
  createId?: () => string;
  repository: TemporaryRuleRepository;
}

export interface TemporaryRuleService {
  add(
    document: ConfigurationDocument,
    input: TemporaryCurrentSiteRuleDraft
  ): Promise<TemporaryRule>;
  clear(): Promise<boolean>;
  list(document: ConfigurationDocument): Promise<readonly TemporaryRule[]>;
  prune(document: ConfigurationDocument): Promise<TemporaryRulePruneResult>;
  remove(ruleId: string): Promise<boolean>;
}

export interface TemporaryRulePruneResult {
  changed: boolean;
  rules: readonly TemporaryRule[];
}

export function createTemporaryRuleService(
  dependencies: TemporaryRuleServiceDependencies
): TemporaryRuleService {
  const clock = dependencies.clock ?? Date.now;
  const createId = dependencies.createId ?? (() => `temporary-${crypto.randomUUID()}`);
  let pendingOperation = Promise.resolve();

  return {
    add(document, input) {
      return serialize(async () => {
        const now = clock();
        const active = activeTemporaryRules(await dependencies.repository.load(), document, now);
        const created = createTemporaryCurrentSiteRule(document, {
          ...input,
          createdAt: now,
          id: createId()
        });
        const retained = active.filter((rule) => !sameTemporaryRuleLocation(rule, created));
        await dependencies.repository.replace([created, ...retained]);
        return created;
      });
    },
    clear() {
      return serialize(async () => {
        const current = await dependencies.repository.load();
        if (current.length === 0) {
          return false;
        }
        await dependencies.repository.replace([]);
        return true;
      });
    },
    list(document) {
      return prune(document).then((result) => result.rules);
    },
    prune,
    remove(ruleId) {
      return serialize(async () => {
        const normalizedRuleId = ruleId.trim();
        if (!normalizedRuleId) {
          return false;
        }
        const current = await dependencies.repository.load();
        const next = current.filter((rule) => rule.id !== normalizedRuleId);
        if (next.length === current.length) {
          return false;
        }
        await dependencies.repository.replace(next);
        return true;
      });
    }
  };

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pendingOperation.then(operation, operation);
    pendingOperation = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  function prune(document: ConfigurationDocument): Promise<TemporaryRulePruneResult> {
    return serialize(async () => {
      const current = await dependencies.repository.load();
      const rules = activeTemporaryRules(current, document, clock());
      const changed = !sameTemporaryRules(current, rules);
      if (changed) {
        await dependencies.repository.replace(rules);
      }
      return { changed, rules };
    });
  }
}

export function createTemporaryCurrentSiteRule(
  document: ProfileDocument,
  input: TemporaryCurrentSiteRuleInput
): TemporaryRuleV1;
export function createTemporaryCurrentSiteRule(
  document: ProfileDocumentV2,
  input: TemporaryCurrentSiteRuleInput
): TemporaryRuleV2;
export function createTemporaryCurrentSiteRule(
  document: ConfigurationDocument,
  input: TemporaryCurrentSiteRuleInput
): TemporaryRule;
export function createTemporaryCurrentSiteRule(
  document: ConfigurationDocument,
  input: TemporaryCurrentSiteRuleInput
): TemporaryRule {
  if (!isTemporaryInput(input)) {
    throw new Error('临时规则到期时间无效');
  }
  const rule = createCurrentSiteRuleEntry(document, { ...input, ruleId: input.id });
  if (document.schemaVersion === 1) {
    return {
      automaticProfileId: input.automaticProfileId,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      host: input.host,
      id: input.id,
      rule: rule as Rule,
      schemaVersion: 1,
      scope: 'global'
    };
  }
  return {
    automaticProfileId: input.automaticProfileId,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    host: input.host,
    id: input.id,
    rule: rule as SwitchRuleV2,
    schemaVersion: 2,
    scope: 'global'
  };
}

export function isTemporaryRule(value: unknown): value is TemporaryRule {
  if (!isTemporaryRuleEnvelope(value)) {
    return false;
  }
  if (value.schemaVersion === 1) {
    return isV1Rule(value.rule);
  }
  return value.schemaVersion === 2 && isV2Rule(value.rule);
}

export function activeTemporaryRules(
  rules: readonly TemporaryRule[],
  document: ConfigurationDocument,
  now: number
): readonly TemporaryRule[] {
  return rules
    .filter((rule) => isActiveTemporaryRule(rule, document, now))
    .slice()
    .sort(compareTemporaryRules);
}

export function overlayTemporaryRules(
  document: ProfileDocument,
  rules: readonly TemporaryRule[],
  now: number
): ProfileDocument;
export function overlayTemporaryRules(
  document: ProfileDocumentV2,
  rules: readonly TemporaryRule[],
  now: number
): ProfileDocumentV2;
export function overlayTemporaryRules(
  document: ConfigurationDocument,
  rules: readonly TemporaryRule[],
  now: number
): ConfigurationDocument;
export function overlayTemporaryRules(
  document: ConfigurationDocument,
  rules: readonly TemporaryRule[],
  now: number
): ConfigurationDocument {
  const active = activeTemporaryRules(rules, document, now);
  return document.schemaVersion === 1 ? overlayV1(document, active) : overlayV2(document, active);
}

export function nextTemporaryRuleExpiry(
  rules: readonly TemporaryRule[],
  now: number
): number | undefined {
  return rules.reduce<number | undefined>((earliest, rule) => {
    if (!isTemporaryRuleEnvelope(rule) || rule.expiresAt <= now) {
      return earliest;
    }
    return earliest === undefined || rule.expiresAt < earliest ? rule.expiresAt : earliest;
  }, undefined);
}

function overlayV1(document: ProfileDocument, active: readonly TemporaryRule[]): ProfileDocument {
  const rulesByProfile = new Map<string, TemporaryRuleV1[]>();
  for (const temporary of active) {
    if (temporary.schemaVersion !== 1) {
      continue;
    }
    const profileRules = rulesByProfile.get(temporary.automaticProfileId) ?? [];
    profileRules.push(temporary);
    rulesByProfile.set(temporary.automaticProfileId, profileRules);
  }
  if (rulesByProfile.size === 0) {
    return document;
  }
  return {
    ...document,
    profiles: document.profiles.map((profile) => {
      if (profile.kind !== 'auto-switch') {
        return profile;
      }
      const temporary = rulesByProfile.get(profile.id);
      return temporary === undefined
        ? profile
        : {
            ...profile,
            loopbackPolicy: allowsV1LoopbackRouting(temporary)
              ? 'use-rules'
              : profile.loopbackPolicy,
            rules: [...temporary.map((rule) => rule.rule), ...profile.rules]
          };
    })
  };
}

function overlayV2(
  document: ProfileDocumentV2,
  active: readonly TemporaryRule[]
): ProfileDocumentV2 {
  const rulesByProfile = new Map<string, TemporaryRuleV2[]>();
  for (const temporary of active) {
    if (temporary.schemaVersion !== 2) {
      continue;
    }
    const profileRules = rulesByProfile.get(temporary.automaticProfileId) ?? [];
    profileRules.push(temporary);
    rulesByProfile.set(temporary.automaticProfileId, profileRules);
  }
  if (rulesByProfile.size === 0) {
    return document;
  }
  return {
    ...document,
    profiles: document.profiles.map((profile) => {
      if (profile.kind !== 'auto-switch') {
        return profile;
      }
      const temporary = rulesByProfile.get(profile.id);
      return temporary === undefined
        ? profile
        : {
            ...profile,
            loopbackPolicy: allowsV2LoopbackRouting(document, temporary)
              ? 'use-rules'
              : profile.loopbackPolicy,
            rules: [...temporary.map((rule) => rule.rule), ...profile.rules]
          };
    })
  };
}

function isActiveTemporaryRule(
  rule: TemporaryRule,
  document: ConfigurationDocument,
  now: number
): boolean {
  if (
    !isTemporaryRuleEnvelope(rule) ||
    rule.expiresAt <= now ||
    rule.schemaVersion !== document.schemaVersion
  ) {
    return false;
  }
  return document.schemaVersion === 1
    ? isActiveV1TemporaryRule(rule, document)
    : isActiveV2TemporaryRule(rule, document);
}

function isActiveV1TemporaryRule(
  rule: TemporaryRule,
  document: ProfileDocument
): rule is TemporaryRuleV1 {
  if (rule.schemaVersion !== 1) {
    return false;
  }
  const profile = document.profiles.find((candidate) => candidate.id === rule.automaticProfileId);
  if (!profile || profile.kind !== 'auto-switch') {
    return false;
  }
  if (!isV1Rule(rule.rule)) {
    return false;
  }
  if (rule.rule.target.kind === 'system') {
    return false;
  }
  const target = rule.rule.target;
  if (target.kind !== 'proxy') {
    return true;
  }
  return document.proxies.some((proxy) => proxy.id === target.proxyId);
}

function isActiveV2TemporaryRule(
  rule: TemporaryRule,
  document: ProfileDocumentV2
): rule is TemporaryRuleV2 {
  if (rule.schemaVersion !== 2) {
    return false;
  }
  const profile = document.profiles.find((candidate) => candidate.id === rule.automaticProfileId);
  return (
    profile?.kind === 'auto-switch' &&
    isV2Rule(rule.rule) &&
    isAutoSwitchRouteTargetV2(document, rule.rule.target.profileId)
  );
}

function isTemporaryRuleEnvelope(value: unknown): value is {
  automaticProfileId: string;
  createdAt: number;
  expiresAt: number;
  id: string;
  host: string;
  rule: unknown;
  schemaVersion: 1 | 2;
  scope: 'global';
} {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.scope === 'global' &&
    (value.schemaVersion === 1 || value.schemaVersion === 2) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.automaticProfileId) &&
    isNonEmptyString(value.host) &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    typeof value.expiresAt === 'number' &&
    Number.isFinite(value.expiresAt) &&
    value.expiresAt > value.createdAt
  );
}

function isTemporaryInput(input: TemporaryCurrentSiteRuleInput): boolean {
  return (
    isNonEmptyString(input.id) &&
    isNonEmptyString(input.host) &&
    Number.isFinite(input.createdAt) &&
    Number.isFinite(input.expiresAt) &&
    input.expiresAt > input.createdAt
  );
}

function allowsV1LoopbackRouting(rules: readonly TemporaryRuleV1[]): boolean {
  return rules.some(
    (rule) => isChromeLoopbackHost(rule.host) && rule.rule.target.kind !== 'direct'
  );
}

function allowsV2LoopbackRouting(
  document: ProfileDocumentV2,
  rules: readonly TemporaryRuleV2[]
): boolean {
  return rules.some(
    (rule) =>
      isChromeLoopbackHost(rule.host) &&
      resolveProfileV2(document, rule.rule.target.profileId).profile.kind !== 'direct'
  );
}

function isV1Rule(value: unknown): value is Rule {
  if (!isRecord(value) || !isNonEmptyString(value.id) || typeof value.enabled !== 'boolean') {
    return false;
  }
  if (!isV1RouteTarget(value.target) || value.target.kind === 'system') {
    return false;
  }
  if (!isRecord(value.condition)) {
    return false;
  }
  switch (value.condition.type) {
    case 'host-equals':
    case 'host-suffix':
    case 'url-glob':
      return isNonEmptyString(value.condition.value);
    default:
      return false;
  }
}

function isV1RouteTarget(value: unknown): value is Rule['target'] {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.kind === 'direct' ||
    value.kind === 'system' ||
    (value.kind === 'proxy' && isNonEmptyString(value.proxyId))
  );
}

function isV2Rule(value: unknown): value is SwitchRuleV2 {
  if (!isRecord(value) || !isRecord(value.target)) {
    return false;
  }
  return (
    isNonEmptyString(value.id) &&
    typeof value.enabled === 'boolean' &&
    validateCondition(value.condition).ok &&
    isNonEmptyString(value.target.profileId)
  );
}

function compareTemporaryRules(left: TemporaryRule, right: TemporaryRule): number {
  if (left.createdAt !== right.createdAt) {
    return right.createdAt - left.createdAt;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function sameTemporaryRuleLocation(left: TemporaryRule, right: TemporaryRule): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.automaticProfileId === right.automaticProfileId &&
    JSON.stringify(left.rule.condition) === JSON.stringify(right.rule.condition)
  );
}

function sameTemporaryRules(
  left: readonly TemporaryRule[],
  right: readonly TemporaryRule[]
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

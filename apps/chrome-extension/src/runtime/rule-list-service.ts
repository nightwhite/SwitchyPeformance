import {
  isAutoSwitchRouteTargetV2,
  parseRuleList,
  ruleListSourceDigest,
  resolveProfileV2,
  type AutoSwitchProfileV2,
  type ConfigurationDocument,
  type ParsedRuleList,
  type ProfileDocumentV2,
  type RuleListProfileV2,
  type RuleListSource,
  type SwitchRuleV2
} from '@switchypeformance/contracts';

import { createRemoteTextSourceService } from './remote-text-source-service.ts';
import type { SourceFetcher } from './source-fetcher.ts';
import { ruleListSourceStatusId } from './source-status-id.ts';
import type { SourceStatusRepository } from './source-status-repository.ts';

export { ruleListSourceStatusId } from './source-status-id.ts';

const DEFAULT_MAX_RULE_LIST_BYTES = 2 * 1_024 * 1_024;
const DEFAULT_MAX_PARSED_CACHE_ENTRIES = 32;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface RuleListServiceDependencies {
  clock?: () => number;
  fetcher: Pick<SourceFetcher, 'fetch'>;
  maxParsedCacheEntries?: number;
  maxBytes?: number;
  parse?: typeof parseRuleList;
  statuses: Pick<
    SourceStatusRepository,
    'get' | 'saveContent' | 'saveFailure' | 'saveNotModified' | 'saveRuleListStats'
  >;
  timeoutMs?: number;
}

export interface RuleListService {
  refreshSource(document: ConfigurationDocument, sourceId: string): Promise<void>;
  refreshAndResolve<T extends ConfigurationDocument>(document: T): Promise<T>;
  resolveForApply<T extends ConfigurationDocument>(document: T): Promise<T>;
}

interface ActiveRuleList {
  profile: RuleListProfileV2;
  profileId: string;
  source: RuleListSource;
}

export function createRuleListService(dependencies: RuleListServiceDependencies): RuleListService {
  const remoteSources = createRemoteTextSourceService({
    contentKind: 'rule-list',
    fetcher: dependencies.fetcher,
    maxBytes: dependencies.maxBytes ?? DEFAULT_MAX_RULE_LIST_BYTES,
    statuses: dependencies.statuses,
    timeoutMs: dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ...(dependencies.clock === undefined ? {} : { clock: dependencies.clock })
  });
  const parse = dependencies.parse ?? parseRuleList;
  const maxParsedCacheEntries = parsedCacheLimit(dependencies.maxParsedCacheEntries);
  const parsedByDigest = new Map<string, ParsedRuleList>();

  return {
    async refreshSource(document, sourceId) {
      const source = ruleListSource(document, sourceId);
      if (!source || source.source.kind !== 'url') {
        throw new Error(`规则列表来源不存在或不可刷新：${sourceId}`);
      }
      await parsedRuleList(source, await refreshText(source));
    },
    async refreshAndResolve(document) {
      const active = activeRuleList(document);
      if (!active) {
        return document;
      }
      return resolveDocument(document, active, await refreshText(active.source));
    },
    async resolveForApply(document) {
      const active = activeRuleList(document);
      if (!active) {
        return document;
      }
      return resolveDocument(document, active, await resolveText(active.source));
    }
  };

  async function resolveText(source: RuleListSource): Promise<string> {
    if (source.source.kind === 'inline') {
      return source.source.text;
    }
    return remoteSources.resolveForApply(remoteSource(source));
  }

  async function refreshText(source: RuleListSource): Promise<string> {
    if (source.source.kind === 'inline') {
      return source.source.text;
    }
    return remoteSources.refresh(remoteSource(source));
  }

  async function resolveDocument<T extends ConfigurationDocument>(
    document: T,
    active: ActiveRuleList,
    text: string
  ): Promise<T> {
    if (document.schemaVersion !== 2) {
      return document;
    }
    const parsed = await parsedRuleList(active.source, text);
    const replacement = toAutoSwitchProfile(document, active, parsed);
    const resolved: ProfileDocumentV2 = {
      ...document,
      activeProfileId: active.profileId,
      profiles: document.profiles.map((profile) =>
        profile.id === active.profileId ? replacement : profile
      )
    };
    return resolved as T;
  }

  async function parsedRuleList(source: RuleListSource, text: string): Promise<ParsedRuleList> {
    const key = `${source.id}:${ruleListSourceDigest(text, source.format)}`;
    const cached = parsedByDigest.get(key);
    const resolved = cached ?? parse(text, source.format);
    cacheParsedRuleList(parsedByDigest, key, resolved, maxParsedCacheEntries);
    if (source.source.kind === 'url') {
      try {
        await dependencies.statuses.saveRuleListStats({
          ruleCount: resolved.rules.length,
          sourceId: ruleListSourceStatusId(source.id),
          warningCount: resolved.warnings.length
        });
      } catch {
        // Statistics are diagnostics only and must not block routing.
      }
    }
    return resolved;
  }
}

function parsedCacheLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_MAX_PARSED_CACHE_ENTRIES;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('规则列表解析缓存大小无效');
  }
  return value;
}

function cacheParsedRuleList(
  cache: Map<string, ParsedRuleList>,
  key: string,
  parsed: ParsedRuleList,
  maxEntries: number
): void {
  cache.delete(key);
  cache.set(key, parsed);
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    cache.delete(oldestKey);
  }
}

function activeRuleList(document: ConfigurationDocument): ActiveRuleList | undefined {
  if (document.schemaVersion !== 2) {
    return undefined;
  }
  const resolved = resolveProfileV2(document);
  const profile = resolved.profile;
  if (profile.kind !== 'rule-list') {
    return undefined;
  }
  const source = ruleListSource(document, profile.sourceId);
  if (!source) {
    throw new Error(`规则列表来源不存在：${profile.sourceId}`);
  }
  return { profile, profileId: resolved.profileId, source };
}

function ruleListSource(
  document: ConfigurationDocument,
  sourceId: string
): RuleListSource | undefined {
  return document.schemaVersion === 2
    ? document.ruleSources.find((candidate) => candidate.id === sourceId)
    : undefined;
}

function remoteSource(source: RuleListSource) {
  if (source.source.kind !== 'url') {
    throw new Error('内嵌规则列表不需要远程下载');
  }
  return {
    headers: source.source.headers,
    sourceId: ruleListSourceStatusId(source.id),
    url: source.source.url
  };
}

function toAutoSwitchProfile(
  document: ProfileDocumentV2,
  active: ActiveRuleList,
  parsed: ParsedRuleList
): AutoSwitchProfileV2 {
  const { fallback, rules } = rulesAndFallback(document, active.profile, active.source, parsed);
  return {
    id: active.profile.id,
    kind: 'auto-switch',
    name: active.profile.name,
    fallback,
    loopbackPolicy: 'direct',
    proxyFailurePolicy: 'direct',
    ruleSourceIds: [],
    rules,
    ...(active.profile.color === undefined ? {} : { color: active.profile.color }),
    ...(active.profile.note === undefined ? {} : { note: active.profile.note })
  };
}

function rulesAndFallback(
  document: ProfileDocumentV2,
  profile: RuleListProfileV2,
  source: RuleListSource,
  parsed: ParsedRuleList
): { fallback: RuleListProfileV2['fallback']; rules: readonly SwitchRuleV2[] } {
  const resultMode = parsed.resultProfilesEnabled;
  const defaultTarget = resultMode ? resultModeFallback(document, parsed) : profile.fallback;
  assertRouteTarget(document, defaultTarget.profileId, '规则列表默认目标');
  const entries = resultMode ? parsed.rules.slice(0, -1) : parsed.rules;

  return {
    fallback: defaultTarget,
    rules: entries.map((entry) => ({
      condition: entry.condition,
      enabled: true,
      id: `rule-list:${source.id}:${entry.line}`,
      target: entry.exclusive
        ? defaultTarget
        : resultMode
          ? targetForResultName(document, entry.resultProfileName, entry.line)
          : profile.matchTarget
    }))
  };
}

function resultModeFallback(
  document: ProfileDocumentV2,
  parsed: ParsedRuleList
): RuleListProfileV2['fallback'] {
  const last = parsed.rules.at(-1);
  if (
    !last ||
    last.exclusive ||
    last.condition.type !== 'host-wildcard' ||
    last.condition.pattern !== '*' ||
    !last.resultProfileName
  ) {
    throw new Error('带结果配置的规则列表必须以“* +默认配置”结束');
  }
  return targetForResultName(document, last.resultProfileName, last.line);
}

function targetForResultName(
  document: ProfileDocumentV2,
  name: string | undefined,
  line: number
): RuleListProfileV2['fallback'] {
  if (!name) {
    throw new Error(`规则列表第 ${line} 行缺少结果配置`);
  }
  const matches = document.profiles.filter(
    (profile) => profile.id === name || profile.name === name
  );
  if (matches.length === 0) {
    throw new Error(`规则列表第 ${line} 行引用的配置不存在：${name}`);
  }
  if (matches.length > 1) {
    throw new Error(`规则列表第 ${line} 行的配置名称不唯一：${name}`);
  }
  const profile = matches[0];
  if (!profile) {
    throw new Error(`规则列表第 ${line} 行引用的配置不存在：${name}`);
  }
  assertRouteTarget(document, profile.id, `规则列表第 ${line} 行的结果配置`);
  return { profileId: profile.id };
}

function assertRouteTarget(document: ProfileDocumentV2, profileId: string, label: string): void {
  if (!isAutoSwitchRouteTargetV2(document, profileId)) {
    throw new Error(`${label}不能被 Chrome PAC 路由：${profileId}`);
  }
}

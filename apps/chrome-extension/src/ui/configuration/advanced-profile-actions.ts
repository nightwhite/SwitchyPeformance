import {
  isAutoSwitchRouteTargetV2,
  isSourceRequestHeader,
  validateProfileDocumentV2,
  type PacProfileV2,
  type PacSource,
  type ProfileDocumentV2,
  type ProfileTarget,
  type RuleListProfileV2,
  type RuleListSource,
  type SourceRequestHeader,
  type UrlSource,
  type VirtualProfileV2
} from '@switchypeformance/contracts';

interface SourceSaveOptions {
  allowInsecureHttp: boolean;
}

export interface PacProfileUpdate extends SourceSaveOptions {
  source: PacSource;
}

export interface RuleListProfileUpdate extends SourceSaveOptions {
  fallback: ProfileTarget;
  matchTarget: ProfileTarget;
  source: RuleListSource;
}

export function updatePacProfile(
  document: ProfileDocumentV2,
  profileId: string,
  update: PacProfileUpdate
): ProfileDocumentV2 {
  const profile = requiredPacProfile(document, profileId);
  const source = normalizePacSource(update.source, update);
  return replaceProfile(document, { ...profile, source });
}

export function updateRuleListProfile(
  document: ProfileDocumentV2,
  profileId: string,
  update: RuleListProfileUpdate
): ProfileDocumentV2 {
  const profile = requiredRuleListProfile(document, profileId);
  if (update.source.id !== profile.sourceId) {
    throw new Error('规则列表来源 ID 不能在编辑时替换');
  }
  assertRuleListRouteTarget(document, update.matchTarget, '规则列表命中目标');
  assertRuleListRouteTarget(document, update.fallback, '规则列表默认目标');
  const source = normalizeRuleListSource(update.source, update);
  let sourceFound = false;
  const next: ProfileDocumentV2 = {
    ...document,
    profiles: document.profiles.map((candidate) =>
      candidate.id === profile.id
        ? { ...profile, fallback: update.fallback, matchTarget: update.matchTarget }
        : candidate
    ),
    ruleSources: document.ruleSources.map((candidate) => {
      if (candidate.id !== source.id) {
        return candidate;
      }
      sourceFound = true;
      return source;
    })
  };
  if (!sourceFound) {
    throw new Error('规则列表来源不存在');
  }
  assertValid(next);
  return next;
}

export function updateVirtualProfile(
  document: ProfileDocumentV2,
  profileId: string,
  target: ProfileTarget
): ProfileDocumentV2 {
  const profile = requiredVirtualProfile(document, profileId);
  if (target.profileId === profile.id) {
    throw new Error('虚拟配置不能指向自身');
  }
  return replaceProfile(document, { ...profile, target });
}

function normalizePacSource(source: PacSource, options: SourceSaveOptions): PacSource {
  const normalized = normalizeSource(source, options);
  if (normalized.kind === 'inline' && !normalized.text) {
    throw new Error('请填写 PAC 脚本内容');
  }
  return normalized;
}

function normalizeRuleListSource(
  source: RuleListSource,
  options: SourceSaveOptions
): RuleListSource {
  const id = source.id.trim();
  const name = source.name.trim();
  if (!id || !name) {
    throw new Error('请填写规则来源名称');
  }
  if (source.format !== 'auto-proxy' && source.format !== 'switchy') {
    throw new Error('规则列表格式无效');
  }
  return { id, name, format: source.format, source: normalizeSource(source.source, options) };
}

function normalizeSource(source: PacSource, options: SourceSaveOptions): PacSource {
  if (source.kind === 'inline') {
    return { kind: 'inline', text: source.text.trim() };
  }
  return normalizeUrlSource(source, options);
}

function normalizeUrlSource(source: UrlSource, options: SourceSaveOptions): UrlSource {
  const url = source.url.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('来源地址无效');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('来源地址只能使用 HTTPS 或 HTTP');
  }
  if (parsed.protocol === 'http:' && !options.allowInsecureHttp) {
    throw new Error('HTTP 来源需要明确确认');
  }
  if (parsed.username || parsed.password) {
    throw new Error('来源地址不能包含账号密码');
  }
  if (!Number.isInteger(source.refresh.refreshMinutes) || source.refresh.refreshMinutes < 1) {
    throw new Error('刷新间隔无效');
  }
  const headers = source.headers.map(normalizeHeader);
  return {
    kind: 'url',
    url,
    headers,
    refresh: {
      enabled: source.refresh.enabled,
      refreshMinutes: source.refresh.refreshMinutes
    }
  };
}

function normalizeHeader(header: SourceRequestHeader): SourceRequestHeader {
  const normalized = { name: header.name.trim(), value: header.value.trim() };
  if (!isSourceRequestHeader(normalized)) {
    throw new Error('自定义请求头无效');
  }
  return normalized;
}

function requiredPacProfile(document: ProfileDocumentV2, profileId: string): PacProfileV2 {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  if (!profile || profile.kind !== 'pac') {
    throw new Error('PAC 配置不存在');
  }
  return profile;
}

function requiredRuleListProfile(
  document: ProfileDocumentV2,
  profileId: string
): RuleListProfileV2 {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  if (!profile || profile.kind !== 'rule-list') {
    throw new Error('规则列表配置不存在');
  }
  return profile;
}

function requiredVirtualProfile(document: ProfileDocumentV2, profileId: string): VirtualProfileV2 {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  if (!profile || profile.kind !== 'virtual') {
    throw new Error('虚拟配置不存在');
  }
  return profile;
}

function replaceProfile(
  document: ProfileDocumentV2,
  replacement: PacProfileV2 | VirtualProfileV2
): ProfileDocumentV2 {
  const next: ProfileDocumentV2 = {
    ...document,
    profiles: document.profiles.map((candidate) =>
      candidate.id === replacement.id ? replacement : candidate
    )
  };
  assertValid(next);
  return next;
}

function assertValid(document: ProfileDocumentV2): void {
  const issue = validateProfileDocumentV2(document)[0];
  if (issue) {
    throw new Error(`配置无效：${issue.path}`);
  }
}

function assertRuleListRouteTarget(
  document: ProfileDocumentV2,
  target: ProfileTarget,
  label: string
): void {
  if (!isAutoSwitchRouteTargetV2(document, target.profileId)) {
    throw new Error(`${label}不能被 Chrome PAC 路由`);
  }
}

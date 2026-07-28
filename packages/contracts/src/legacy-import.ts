import {
  parseProfileDocument,
  type AutoSwitchProfile,
  type FixedProxyProfile,
  type Profile,
  type ProfileDocument,
  type ProxyEndpoint,
  type ProxyScheme,
  type RouteTarget,
  type Rule,
  type RuleCondition
} from './profile-document.ts';

export type ImportedConfigurationSource = 'switchypeformance' | 'legacy';

export type ImportedConfigurationResult =
  | {
      ok: true;
      source: ImportedConfigurationSource;
      value: ProfileDocument;
      warnings: readonly string[];
    }
  | { ok: false; error: string };

interface LegacyProfileInput {
  key: string;
  name: string;
  value: Record<string, unknown>;
}

interface FixedLegacyProfile {
  profile: LegacyProfileInput;
  proxy: ProxyEndpoint;
  fixedProfile: FixedProxyProfile;
}

/**
 * Imports only the public data shape of older configuration backups. It is a
 * clean-room migration path: credentials are intentionally neither read nor
 * written, and unsupported routing semantics are reported rather than guessed.
 */
export function importProfileDocument(input: unknown): ImportedConfigurationResult {
  const native = parseProfileDocument(input);
  if (native.ok) {
    return { ok: true, source: 'switchypeformance', value: native.value, warnings: [] };
  }

  return migrateLegacyBackup(input);
}

function migrateLegacyBackup(input: unknown): ImportedConfigurationResult {
  if (!isRecord(input)) {
    return unsupportedBackup();
  }

  const legacyProfiles: LegacyProfileInput[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (!key.startsWith('+') || !isRecord(value)) {
      continue;
    }
    const name = legacyProfileName(key, value);
    if (name) {
      legacyProfiles.push({ key, name, value });
    }
  }

  if (legacyProfiles.length === 0) {
    return unsupportedBackup();
  }

  const warnings: string[] = [];
  const usedProfileIds = new Set(['direct', 'system']);
  const usedProxyIds = new Set<string>();
  const profiles: Profile[] = [
    { id: 'direct', kind: 'direct', name: '直连' },
    { id: 'system', kind: 'system', name: '系统代理' }
  ];
  const proxies: ProxyEndpoint[] = [];
  const fixedByReference = new Map<string, FixedLegacyProfile>();
  const profileIdByReference = new Map<string, string>([
    ['direct', 'direct'],
    ['system', 'system']
  ]);

  for (const legacy of legacyProfiles) {
    if (legacy.value.profileType !== 'FixedProfile') {
      continue;
    }

    const endpoint = parseLegacyEndpoint(legacy.value, legacy.name, usedProxyIds);
    if (!endpoint) {
      warnings.push(`固定代理配置 ${legacy.name} 没有有效的代理地址，已跳过。`);
      continue;
    }

    const fixedProfile: FixedProxyProfile = {
      id: nextId('legacy-profile', legacy.name, usedProfileIds),
      kind: 'fixed-proxy',
      name: legacy.name,
      proxyId: endpoint.id
    };
    const fixed = { profile: legacy, proxy: endpoint, fixedProfile };
    profiles.push(fixedProfile);
    proxies.push(endpoint);
    registerReference(fixedByReference, profileIdByReference, fixed);
    if (hasLegacyCredentials(legacy.value)) {
      warnings.push(`已跳过 ${legacy.name} 的账号密码；请在导入后本地设置。`);
    }
  }

  const automaticProfiles = legacyProfiles.filter(
    (profile) => profile.value.profileType === 'SwitchProfile'
  );
  for (const legacy of automaticProfiles) {
    const automatic = migrateAutomaticProfile(legacy, fixedByReference, warnings, usedProfileIds);
    profiles.push(automatic);
    registerProfileIdReferences(profileIdByReference, legacy, automatic.id);
  }

  const supportedProfiles = legacyProfiles.filter(
    (profile) =>
      profile.value.profileType === 'FixedProfile' || profile.value.profileType === 'SwitchProfile'
  );
  for (const legacy of legacyProfiles) {
    if (!supportedProfiles.includes(legacy)) {
      warnings.push(`配置 ${legacy.name} 使用了不支持的类型，已跳过。`);
    }
  }

  const startupProfileName =
    typeof input.startupProfileName === 'string' ? input.startupProfileName : undefined;
  const firstAutomatic = automaticProfiles[0];
  const activeProfileId = startupProfileName
    ? profileIdByReference.get(referenceKey(startupProfileName))
    : firstAutomatic
      ? profileIdByReference.get(referenceKey(firstAutomatic.name))
      : 'direct';
  if (startupProfileName && !activeProfileId) {
    warnings.push(`未找到启动配置 ${startupProfileName}，已按直连模式导入。`);
  }

  const parsed = parseProfileDocument({
    schemaVersion: 1,
    activeProfileId: activeProfileId ?? 'direct',
    profiles,
    proxies,
    credentials: {}
  });
  if (!parsed.ok) {
    return unsupportedBackup();
  }

  return { ok: true, source: 'legacy', value: parsed.value, warnings };
}

function migrateAutomaticProfile(
  legacy: LegacyProfileInput,
  fixedByReference: ReadonlyMap<string, FixedLegacyProfile>,
  warnings: string[],
  usedProfileIds: Set<string>
): AutoSwitchProfile {
  const fallback = resolveFallback(
    legacy.value.defaultProfileName,
    legacy.name,
    fixedByReference,
    warnings
  );
  const rules = readLegacyRules(legacy.value.rules, legacy.name, fixedByReference, warnings);
  return {
    id: nextId('legacy-profile', legacy.name, usedProfileIds),
    kind: 'auto-switch',
    name: legacy.name,
    fallback,
    loopbackPolicy: 'direct',
    proxyFailurePolicy: 'direct',
    rules
  };
}

function readLegacyRules(
  input: unknown,
  profileName: string,
  fixedByReference: ReadonlyMap<string, FixedLegacyProfile>,
  warnings: string[]
): readonly Rule[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const rules: Rule[] = [];
  for (const [index, rawRule] of input.entries()) {
    if (!isRecord(rawRule)) {
      warnings.push(`配置 ${profileName} 的第 ${index + 1} 条规则格式错误，已跳过。`);
      continue;
    }
    const condition = migrateLegacyCondition(rawRule.condition);
    if (!condition) {
      warnings.push(`配置 ${profileName} 的第 ${index + 1} 条规则使用了不支持的条件，已跳过。`);
      continue;
    }
    const target = resolveRuleTarget(
      rawRule.profileName,
      profileName,
      index,
      fixedByReference,
      warnings
    );
    if (!target) {
      continue;
    }
    rules.push({
      id: `legacy-rule-${idToken(profileName)}-${index}`,
      enabled: true,
      condition,
      target
    });
  }
  return rules;
}

function migrateLegacyCondition(input: unknown): RuleCondition | undefined {
  if (!isRecord(input) || typeof input.pattern !== 'string' || !input.pattern.trim()) {
    return undefined;
  }
  const pattern = input.pattern.trim();
  if (input.conditionType !== 'HostWildcardCondition') {
    return undefined;
  }
  if (pattern.startsWith('*.') && isPlainHost(pattern.slice(2))) {
    return { type: 'host-suffix', value: pattern.slice(2).toLowerCase() };
  }
  if (isPlainHost(pattern)) {
    return { type: 'host-equals', value: pattern.toLowerCase() };
  }
  return undefined;
}

function resolveFallback(
  input: unknown,
  profileName: string,
  fixedByReference: ReadonlyMap<string, FixedLegacyProfile>,
  warnings: string[]
): RouteTarget {
  if (input === undefined || input === 'direct') {
    return { kind: 'direct' };
  }
  if (input === 'system') {
    warnings.push(`自动切换配置 ${profileName} 使用系统代理作为兜底，已按直连模式导入。`);
    return { kind: 'direct' };
  }
  if (typeof input === 'string') {
    const fixed = fixedByReference.get(referenceKey(input));
    if (fixed) {
      return { kind: 'proxy', proxyId: fixed.proxy.id };
    }
  }
  warnings.push(`自动切换配置 ${profileName} 的兜底目标未知，已按直连模式导入。`);
  return { kind: 'direct' };
}

function resolveRuleTarget(
  input: unknown,
  profileName: string,
  index: number,
  fixedByReference: ReadonlyMap<string, FixedLegacyProfile>,
  warnings: string[]
): RouteTarget | undefined {
  if (input === 'direct') {
    return { kind: 'direct' };
  }
  if (input === 'system') {
    warnings.push(`配置 ${profileName} 的第 ${index + 1} 条规则路由到系统代理，已跳过。`);
    return undefined;
  }
  if (typeof input === 'string') {
    const fixed = fixedByReference.get(referenceKey(input));
    if (fixed) {
      return { kind: 'proxy', proxyId: fixed.proxy.id };
    }
  }
  warnings.push(`配置 ${profileName} 的第 ${index + 1} 条规则引用了未知配置，已跳过。`);
  return undefined;
}

function parseLegacyEndpoint(
  profile: Record<string, unknown>,
  name: string,
  usedProxyIds: Set<string>
): ProxyEndpoint | undefined {
  const input = profile.fallbackProxy;
  if (!isRecord(input) || typeof input.host !== 'string' || !input.host.trim()) {
    return undefined;
  }
  if (!isProxyScheme(input.scheme) || !isPort(input.port)) {
    return undefined;
  }
  const bypassList = readLegacyBypassList(profile);
  return {
    id: nextId('legacy-proxy', name, usedProxyIds),
    name,
    scheme: input.scheme,
    host: input.host.trim(),
    port: input.port,
    ...(bypassList.length > 0 ? { bypassList } : {})
  };
}

function readLegacyBypassList(profile: Record<string, unknown>): readonly string[] {
  if (!Array.isArray(profile.bypassList)) {
    return [];
  }
  return profile.bypassList.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.pattern !== 'string' || !entry.pattern.trim()) {
      return [];
    }
    return [entry.pattern.trim()];
  });
}

function hasLegacyCredentials(profile: Record<string, unknown>): boolean {
  return isRecord(profile.auth) && Object.keys(profile.auth).length > 0;
}

function registerReference(
  fixedByReference: Map<string, FixedLegacyProfile>,
  profileIdByReference: Map<string, string>,
  fixed: FixedLegacyProfile
): void {
  for (const name of legacyReferenceNames(fixed.profile)) {
    fixedByReference.set(referenceKey(name), fixed);
    profileIdByReference.set(referenceKey(name), fixed.fixedProfile.id);
  }
}

function registerProfileIdReferences(
  profileIdByReference: Map<string, string>,
  profile: LegacyProfileInput,
  id: string
): void {
  for (const name of legacyReferenceNames(profile)) {
    profileIdByReference.set(referenceKey(name), id);
  }
}

function legacyReferenceNames(profile: LegacyProfileInput): readonly string[] {
  return [profile.name, profile.key.slice(1)];
}

function legacyProfileName(key: string, value: Record<string, unknown>): string | undefined {
  if (typeof value.name === 'string' && value.name.trim()) {
    return value.name.trim();
  }
  const derived = key.slice(1).trim();
  return derived || undefined;
}

function referenceKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function nextId(prefix: string, name: string, used: Set<string>): string {
  const base = `${prefix}-${idToken(name)}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function idToken(value: string): string {
  const token = value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return token || 'profile';
}

function isPlainHost(value: string): boolean {
  return /^[a-z0-9.-]+$/i.test(value) && !value.startsWith('.') && !value.endsWith('.');
}

function isProxyScheme(value: unknown): value is ProxyScheme {
  return value === 'http' || value === 'https' || value === 'socks4' || value === 'socks5';
}

function isPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function unsupportedBackup(): ImportedConfigurationResult {
  return {
    ok: false,
    error: '此文件不是受支持的 SwitchyPeformance 配置备份。'
  };
}

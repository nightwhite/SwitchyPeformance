import { getDomain } from 'tldts';

import type { RuleConditionV2 } from '@switchypeformance/contracts';

export const QUICK_RULE_CONDITION_TYPES = [
  'host-wildcard',
  'host-regex',
  'url-wildcard',
  'url-regex',
  'keyword'
] as const;

export type QuickRuleConditionType = (typeof QUICK_RULE_CONDITION_TYPES)[number];
export type QuickRuleCondition = Extract<
  RuleConditionV2,
  { type: QuickRuleConditionType }
>;

export interface QuickRuleSuggestion {
  conditions: Readonly<Record<QuickRuleConditionType, QuickRuleCondition>>;
  host: string;
  level: number;
  levelCount: number;
}

export function suggestQuickRules(urlValue: string, requestedLevel: number): QuickRuleSuggestion {
  const url = supportedUrl(urlValue);
  const host = url.hostname;
  const candidates = domainCandidates(host);
  const level = clampLevel(requestedLevel, candidates.length);
  const candidate = candidates[level] ?? host;
  const escaped = escapeRegex(candidate);
  const exactHost = !isDomainName(host);

  return {
    conditions: {
      'host-wildcard': {
        type: 'host-wildcard',
        pattern: exactHost ? candidate : `*.${candidate}`
      },
      'host-regex': {
        type: 'host-regex',
        pattern: exactHost ? `^${escaped}$` : `(^|\\.)${escaped}$`
      },
      'url-wildcard': {
        type: 'url-wildcard',
        pattern: exactHost ? `*://${candidate}/*` : `*://*.${candidate}/*`
      },
      'url-regex': {
        type: 'url-regex',
        pattern: exactHost ? `://${escaped}(:\\d+)?/` : `://([^/.]+\\.)*${escaped}(:\\d+)?/`
      },
      keyword: { type: 'keyword', value: candidate }
    },
    host,
    level,
    levelCount: candidates.length
  };
}

function supportedUrl(value: string): URL {
  const url = new URL(value);
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) {
    throw new Error('只能为 HTTP 或 HTTPS 页面添加规则');
  }
  return url;
}

function domainCandidates(host: string): readonly string[] {
  const baseDomain = getDomain(host, { allowPrivateDomains: true });
  if (!baseDomain || !host.endsWith(`.${baseDomain}`)) {
    return [host];
  }
  const prefix = host.slice(0, -(baseDomain.length + 1)).split('.').filter(Boolean);
  const candidates = [baseDomain];
  for (let index = prefix.length - 1; index >= 0; index -= 1) {
    candidates.push(`${prefix.slice(index).join('.')}.${baseDomain}`);
  }
  return candidates;
}

function clampLevel(level: number, levelCount: number): number {
  if (!Number.isFinite(level) || levelCount < 1) {
    return 0;
  }
  return Math.max(0, Math.min(Math.trunc(level), levelCount - 1));
}

function isDomainName(host: string): boolean {
  return host.includes('.') && !host.includes(':') && !/^\d+(?:\.\d+){3}$/.test(host);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

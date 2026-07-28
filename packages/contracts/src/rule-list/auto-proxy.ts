import { validateCondition } from '../config/condition-validation.ts';
import type { RuleConditionV2 } from '../config/conditions.ts';

import type { ParsedRuleListContent, ParsedRuleListRule, RuleListWarning } from './types.ts';

export function parseAutoProxy(text: string): ParsedRuleListContent {
  const decoded = decodeBase64RuleList(text);
  const rules: ParsedRuleListRule[] = [];
  const warnings: RuleListWarning[] = [];

  for (const [index, rawLine] of decoded.text.split(/\r?\n/).entries()) {
    const line = index + 1;
    const value = rawLine.trim();
    if (!value || value.startsWith('!') || (value.startsWith('[') && value.endsWith(']'))) {
      continue;
    }

    const rule = parseLine(value, line);
    if (!rule) {
      warnings.push({ code: 'unsupported-syntax', line });
      continue;
    }
    rules.push(rule);
  }

  return { decodedBase64: decoded.used, rules, warnings };
}

function parseLine(value: string, line: number): ParsedRuleListRule | undefined {
  const exclusive = value.startsWith('@@');
  const rawPattern = (exclusive ? value.slice(2) : value).trim();
  if (!rawPattern || rawPattern.includes('$') || hasExecutableSyntax(rawPattern)) {
    return undefined;
  }

  const condition =
    parseRegex(rawPattern) ??
    parseDomainAnchor(rawPattern) ??
    parseUrlAnchor(rawPattern) ??
    parseHostPattern(rawPattern) ??
    parseKeyword(rawPattern);
  if (!condition || !validateCondition(condition).ok) {
    return undefined;
  }
  return { condition, exclusive, line };
}

function parseRegex(value: string): RuleConditionV2 | undefined {
  if (!value.startsWith('/') || !value.endsWith('/') || value.length < 3) {
    return undefined;
  }
  return { type: 'url-regex', pattern: value.slice(1, -1) };
}

function parseDomainAnchor(value: string): RuleConditionV2 | undefined {
  if (!value.startsWith('||')) {
    return undefined;
  }
  const pattern = value.slice(2);
  const slash = pattern.indexOf('/');
  const caret = pattern.indexOf('^');
  const hostEnd = firstNonNegative(slash, caret);
  const hostPart = (hostEnd < 0 ? pattern : pattern.slice(0, hostEnd)).replace(/\^$/, '');
  if (!isHostLike(hostPart)) {
    return undefined;
  }
  if (slash < 0) {
    return { type: 'host-wildcard', pattern: `*.${hostPart}` };
  }
  const path = pattern.slice(slash).replaceAll('^', '*');
  return {
    type: 'url-wildcard',
    pattern: `*://*.${hostPart}${path.endsWith('*') ? path : `${path}*`}`
  };
}

function parseUrlAnchor(value: string): RuleConditionV2 | undefined {
  const raw = value.startsWith('|') ? value.slice(1) : value;
  if (!/^https?:\/\//i.test(raw) || /\s/.test(raw)) {
    return undefined;
  }
  return { type: 'url-wildcard', pattern: raw.endsWith('*') ? raw : `${raw}*` };
}

function parseHostPattern(value: string): RuleConditionV2 | undefined {
  if (!isHostLike(value)) {
    return undefined;
  }
  return { type: 'host-wildcard', pattern: value.startsWith('*.') ? value : `*.${value}` };
}

function parseKeyword(value: string): RuleConditionV2 | undefined {
  if (/\s|[{}();]/.test(value) || value.length > 512) {
    return undefined;
  }
  return { type: 'keyword', value };
}

function decodeBase64RuleList(text: string): { text: string; used: boolean } {
  const compact = text.replace(/\s/g, '');
  if (compact.length < 8 || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    return { text, used: false };
  }
  try {
    const binary = atob(compact);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return looksLikeRuleList(decoded) ? { text: decoded, used: true } : { text, used: false };
  } catch {
    return { text, used: false };
  }
}

function looksLikeRuleList(value: string): boolean {
  return value.includes('\n') && /(^|\n)(?:!|@@|\|\||\[)/.test(value);
}

function firstNonNegative(left: number, right: number): number {
  if (left < 0) {
    return right;
  }
  if (right < 0) {
    return left;
  }
  return Math.min(left, right);
}

function isHostLike(value: string): boolean {
  const normalized = value.startsWith('*.') ? value.slice(2) : value;
  return (
    normalized.length > 0 &&
    normalized.length <= 253 &&
    !normalized.includes('..') &&
    normalized
      .split('.')
      .every((part) => /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9])?$/.test(part))
  );
}

function hasExecutableSyntax(value: string): boolean {
  return /\b(?:function|return|var|let|const)\b/.test(value);
}

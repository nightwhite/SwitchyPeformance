import type { RuleListFormat } from '../config/sources.ts';

import { parseAutoProxy } from './auto-proxy.ts';
import { parseSwitchy } from './switchy.ts';
import type { ParsedRuleList } from './types.ts';

export type {
  ParsedRuleList,
  ParsedRuleListContent,
  ParsedRuleListRule,
  RuleListWarning,
  RuleListWarningCode
} from './types.ts';

export function parseRuleList(text: string, format: RuleListFormat): ParsedRuleList {
  if (typeof text !== 'string') {
    throw new Error('规则列表文本无效');
  }

  const parsed = format === 'auto-proxy' ? parseAutoProxy(text) : parseSwitchy(text);
  return {
    decodedBase64: parsed.decodedBase64 ?? false,
    format,
    resultProfilesEnabled: parsed.resultProfilesEnabled ?? false,
    rules: parsed.rules,
    sourceDigest: ruleListSourceDigest(text, format),
    warnings: parsed.warnings
  };
}

export function ruleListSourceDigest(text: string, format: RuleListFormat): string {
  if (typeof text !== 'string') {
    throw new Error('规则列表文本无效');
  }
  return sourceDigest(`${format}\u0000${text}`);
}

function sourceDigest(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

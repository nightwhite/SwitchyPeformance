export const RULE_LIST_FORMATS = ['auto-proxy', 'switchy'] as const;

export type RuleListFormat = (typeof RULE_LIST_FORMATS)[number];

export interface SourceRequestHeader {
  name: string;
  value: string;
}

export interface RefreshPolicy {
  enabled: boolean;
  refreshMinutes: number;
}

export interface UrlSource {
  kind: 'url';
  url: string;
  headers: readonly SourceRequestHeader[];
  refresh: RefreshPolicy;
}

export interface InlineSource {
  kind: 'inline';
  text: string;
}

export type PacSource = UrlSource | InlineSource;

export interface RuleListSource {
  id: string;
  name: string;
  format: RuleListFormat;
  source: UrlSource | InlineSource;
}

export function isRuleListFormat(value: unknown): value is RuleListFormat {
  return typeof value === 'string' && RULE_LIST_FORMATS.includes(value as RuleListFormat);
}

export function isSourceRequestHeader(value: unknown): value is SourceRequestHeader {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.value !== 'string') {
    return false;
  }

  return (
    HEADER_NAME.test(value.name) &&
    value.value.length > 0 &&
    !value.value.includes('\r') &&
    !value.value.includes('\n')
  );
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

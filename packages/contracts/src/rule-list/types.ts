import type { RuleConditionV2 } from '../config/conditions.ts';
import type { RuleListFormat } from '../config/sources.ts';

export interface ParsedRuleListRule {
  condition: RuleConditionV2;
  exclusive: boolean;
  line: number;
  resultProfileName?: string;
}

export type RuleListWarningCode =
  'invalid-condition' | 'missing-result-profile' | 'unsupported-syntax';

export interface RuleListWarning {
  code: RuleListWarningCode;
  line: number;
}

export interface ParsedRuleList {
  decodedBase64: boolean;
  format: RuleListFormat;
  resultProfilesEnabled: boolean;
  rules: readonly ParsedRuleListRule[];
  sourceDigest: string;
  warnings: readonly RuleListWarning[];
}

export interface ParsedRuleListContent {
  decodedBase64?: boolean;
  resultProfilesEnabled?: boolean;
  rules: readonly ParsedRuleListRule[];
  warnings: readonly RuleListWarning[];
}

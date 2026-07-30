import type { QuickRuleEntry } from '../../runtime/messages.ts';
import { buildCurrentSiteRule, type CurrentSiteScope } from '../popup/current-site-rule.ts';

import type { FailureResource } from './failure-remediation.ts';

export interface FailureRouteOption {
  label: string;
  value: string;
}

export function defaultFailureRuleTarget(
  options: readonly FailureRouteOption[],
  directValue: string
): string | undefined {
  return options.find((option) => option.value !== directValue)?.value ?? options[0]?.value;
}

export function selectedFailureRuleEntries(
  failures: readonly FailureResource[],
  selectedKeys: ReadonlySet<string>,
  scope: Extract<CurrentSiteScope, 'host' | 'domain'>
): readonly QuickRuleEntry[] {
  const entries: QuickRuleEntry[] = [];
  const seenConditions = new Set<string>();
  for (const failure of failures) {
    if (!selectedKeys.has(failure.key)) {
      continue;
    }
    try {
      const entry = buildCurrentSiteRule(failure.url, scope);
      const conditionKey = JSON.stringify(entry.condition);
      if (seenConditions.has(conditionKey)) {
        continue;
      }
      seenConditions.add(conditionKey);
      entries.push({ ...entry, scope });
    } catch {
      // A non-HTTP resource cannot be converted into a Chrome proxy rule.
    }
  }
  return entries;
}

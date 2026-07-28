import { getDomain } from 'tldts';

import {
  resolveProfileV2,
  type ConfigurationDocument,
  type RuleConditionV2
} from '@switchypeformance/contracts';

export type CurrentSiteScope = 'page' | 'host' | 'domain';

export interface CurrentSiteRule {
  condition: Extract<RuleConditionV2, { type: 'host-wildcard' | 'url-wildcard' }>;
  host: string;
}

export interface AutomaticProfileOption {
  id: string;
  label: string;
}

export function automaticProfileOptions(
  document: ConfigurationDocument
): readonly AutomaticProfileOption[] {
  return document.profiles
    .filter((profile) => profile.kind === 'auto-switch')
    .map((profile) => ({ id: profile.id, label: profile.name }));
}

export function defaultAutomaticProfileId(document: ConfigurationDocument): string | undefined {
  if (document.schemaVersion === 1) {
    const active = document.profiles.find((profile) => profile.id === document.activeProfileId);
    return active?.kind === 'auto-switch' ? active.id : automaticProfileOptions(document)[0]?.id;
  }

  try {
    const resolved = resolveProfileV2(document);
    if (resolved.profile.kind === 'auto-switch') {
      return resolved.profileId;
    }
  } catch {
    // A malformed stored configuration is handled by the background before this UI can save it.
  }
  return automaticProfileOptions(document)[0]?.id;
}

export function buildCurrentSiteRule(urlValue: string, scope: CurrentSiteScope): CurrentSiteRule {
  const url = supportedUrl(urlValue);
  const host = url.hostname;

  switch (scope) {
    case 'page':
      return {
        condition: { type: 'url-wildcard', pattern: `${url.origin}${url.pathname}*` },
        host
      };
    case 'host':
      return { condition: hostCondition(url), host };
    case 'domain': {
      const domain = getDomain(host, { allowPrivateDomains: true });
      return {
        condition: domain ? { type: 'host-wildcard', pattern: `*.${domain}` } : hostCondition(url),
        host
      };
    }
  }
}

function supportedUrl(value: string): URL {
  const url = new URL(value);
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) {
    throw new Error('只能为 HTTP 或 HTTPS 页面添加规则');
  }
  return url;
}

function hostCondition(url: URL): CurrentSiteRule['condition'] {
  return isValidHostWildcard(url.hostname)
    ? { type: 'host-wildcard', pattern: url.hostname }
    : { type: 'url-wildcard', pattern: `${url.origin}/*` };
}

function isValidHostWildcard(host: string): boolean {
  return !host.includes(':') && host.length > 0;
}

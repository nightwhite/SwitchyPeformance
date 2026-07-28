import type { ProfileDocumentV2 } from './config/document.ts';
import type { ProfileTarget } from './config/targets.ts';
import type { AutoSwitchProfile, ProfileDocument, RouteTarget } from './profile-document.ts';

export interface AddHostRuleInput {
  profileId: string;
  host: string;
  ruleId: string;
  target: RouteTarget;
}

export interface AddHostRuleV2Input {
  profileId: string;
  host: string;
  ruleId: string;
  target: ProfileTarget;
}

export function addHostRuleToAutoSwitch(
  document: ProfileDocument,
  input: AddHostRuleInput
): ProfileDocument {
  const profile = document.profiles.find((candidate) => candidate.id === input.profileId);
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('自动切换配置不存在');
  }
  const host = normalizeHost(input.host);
  const existingIndex = profile.rules.findIndex(
    (rule) => rule.condition.type === 'host-suffix' && rule.condition.value === host
  );
  const rules =
    existingIndex < 0
      ? [
          ...profile.rules,
          {
            condition: { type: 'host-suffix' as const, value: host },
            enabled: true,
            id: input.ruleId,
            target: input.target
          }
        ]
      : profile.rules.map((rule, index) =>
          index === existingIndex ? { ...rule, enabled: true, target: input.target } : rule
        );

  return replaceAutoSwitchProfile(document, {
    ...profile,
    loopbackPolicy:
      isLoopbackHost(host) && input.target.kind !== 'direct' ? 'use-rules' : profile.loopbackPolicy,
    rules
  });
}

export function addHostRuleToAutoSwitchV2(
  document: ProfileDocumentV2,
  input: AddHostRuleV2Input
): ProfileDocumentV2 {
  const profile = document.profiles.find((candidate) => candidate.id === input.profileId);
  if (!profile || profile.kind !== 'auto-switch') {
    throw new Error('自动切换配置不存在');
  }

  const host = normalizeHost(input.host);
  const pattern = `*.${host}`;
  const existingIndex = profile.rules.findIndex(
    (rule) => rule.condition.type === 'host-wildcard' && rule.condition.pattern === pattern
  );
  const rules =
    existingIndex < 0
      ? [
          ...profile.rules,
          {
            condition: { type: 'host-wildcard' as const, pattern },
            enabled: true,
            id: input.ruleId,
            target: input.target
          }
        ]
      : profile.rules.map((rule, index) =>
          index === existingIndex ? { ...rule, enabled: true, target: input.target } : rule
        );

  const replacement = {
    ...profile,
    loopbackPolicy:
      isLoopbackHost(host) && input.target.profileId !== 'direct'
        ? ('use-rules' as const)
        : profile.loopbackPolicy,
    rules
  };
  return {
    ...document,
    profiles: document.profiles.map((candidate) =>
      candidate.id === replacement.id ? replacement : candidate
    )
  };
}

function replaceAutoSwitchProfile(
  document: ProfileDocument,
  replacement: AutoSwitchProfile
): ProfileDocument {
  return {
    ...document,
    profiles: document.profiles.map((profile) =>
      profile.id === replacement.id ? replacement : profile
    )
  };
}

function normalizeHost(input: string): string {
  const host = input.trim().replace(/^\*\./, '').toLocaleLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(host) || host.includes('..')) {
    throw new Error('请输入主机名');
  }
  return host;
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || host.startsWith('127.');
}

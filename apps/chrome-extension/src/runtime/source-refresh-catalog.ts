import { resolveProfileV2, type ConfigurationDocument } from '@switchypeformance/contracts';

import { pacSourceStatusId, ruleListSourceStatusId } from './source-status-id.ts';
import type { RefreshableSource } from './source-refresh-scheduler.ts';

export interface RemoteSourceTarget extends RefreshableSource {
  ownerId: string;
}

export function remoteSourceTargets(
  document: ConfigurationDocument
): readonly RemoteSourceTarget[] {
  if (document.schemaVersion !== 2) {
    return [];
  }

  const pacSources = document.profiles.flatMap((profile) => {
    if (profile.kind !== 'pac' || profile.source.kind !== 'url') {
      return [];
    }
    return [
      {
        enabled: profile.source.refresh.enabled,
        id: pacSourceStatusId(profile.id),
        kind: 'pac' as const,
        name: profile.name,
        ownerId: profile.id,
        refreshMinutes: profile.source.refresh.refreshMinutes
      }
    ];
  });
  const ruleSources = document.ruleSources.flatMap((source) => {
    if (source.source.kind !== 'url') {
      return [];
    }
    return [
      {
        enabled: source.source.refresh.enabled,
        id: ruleListSourceStatusId(source.id),
        kind: 'rule-list' as const,
        name: source.name,
        ownerId: source.id,
        refreshMinutes: source.source.refresh.refreshMinutes
      }
    ];
  });
  return [...pacSources, ...ruleSources];
}

export function isActiveSourceTarget(
  document: ConfigurationDocument,
  target: RemoteSourceTarget
): boolean {
  if (document.schemaVersion !== 2) {
    return false;
  }
  const resolved = resolveProfileV2(document);
  if (resolved.profile.kind === 'pac' && resolved.profile.source.kind === 'url') {
    return target.kind === 'pac' && target.id === pacSourceStatusId(resolved.profileId);
  }
  if (resolved.profile.kind === 'rule-list') {
    return (
      target.kind === 'rule-list' && target.id === ruleListSourceStatusId(resolved.profile.sourceId)
    );
  }
  if (resolved.profile.kind === 'auto-switch') {
    return target.kind === 'rule-list' && resolved.profile.ruleSourceIds.includes(target.ownerId);
  }
  return false;
}

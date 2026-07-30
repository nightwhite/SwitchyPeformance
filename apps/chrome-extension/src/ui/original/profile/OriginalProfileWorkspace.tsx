import { useState } from 'react';

import type { ConfigurationDocument, ProfileDocumentV2, ProfileV2 } from '@switchypeformance/contracts';

import type { BackgroundState } from '../../../runtime/messages.ts';
import { pacSourceStatusId, ruleListSourceStatusId } from '../../../runtime/source-status-id.ts';
import { createId, requestBackgroundState } from '../../background-client.ts';
import {
  cloneProfile,
  planProfileDeletion
} from '../../configuration/profile-actions.ts';
import { ProfileEditor } from '../../pages/ProfileWorkspace.tsx';
import { DeleteProfileDialog } from './DeleteProfileDialog.tsx';
import { ProfileHeader } from './ProfileHeader.tsx';
import {
  renameOriginalProfile,
  replaceAndDeleteOriginalProfile,
  setOriginalProfileColor
} from './profile-actions.ts';

interface OriginalProfileWorkspaceProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onActivate(profileId: string): Promise<void>;
  onBackgroundState(state: BackgroundState): void;
  onOpenCreatedProfile(profile: ProfileV2): void;
  onOpenTool(): void;
  onReplace(document: ConfigurationDocument): Promise<BackgroundState>;
  profileId: string;
  sourceStatuses: BackgroundState['sourceStatuses'];
}

export function OriginalProfileWorkspace({
  busy,
  document,
  onActivate,
  onBackgroundState,
  onOpenCreatedProfile,
  onOpenTool,
  onReplace,
  profileId,
  sourceStatuses
}: OriginalProfileWorkspaceProps) {
  const profile = document.profiles.find((candidate) => candidate.id === profileId);
  const [deleting, setDeleting] = useState(false);
  const [refreshingSourceId, setRefreshingSourceId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  if (!profile) {
    return <section className="original-page-panel">这个配置已经不存在了。</section>;
  }

  const selectedProfile = profile;
  const deletionPlan = deleting ? planProfileDeletion(document, selectedProfile.id) : undefined;

  async function replace(action: () => ProfileDocumentV2): Promise<boolean> {
    try {
      setError(undefined);
      setNotice(undefined);
      await onReplace(action());
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法更新配置');
      return false;
    }
  }

  async function rename(name: string): Promise<void> {
    if (await replace(() => renameOriginalProfile(document, selectedProfile.id, name))) {
      setNotice('配置名称已加入待应用修改。');
    }
  }

  async function copy(): Promise<void> {
    const copiedId = createId('profile');
    const next = cloneProfile(document, selectedProfile.id, {
      id: copiedId,
      name: `${selectedProfile.name} 副本`,
      ruleId: (index) => createId(`rule-${index}`)
    });
    const copied = next.profiles.find((candidate) => candidate.id === copiedId);
    if (copied && (await replace(() => next))) {
      onOpenCreatedProfile(copied);
    }
  }

  async function remove(replacementProfileId: string): Promise<void> {
    if (
      await replace(() =>
        replaceAndDeleteOriginalProfile(document, selectedProfile.id, replacementProfileId)
      )
    ) {
      setDeleting(false);
      const replacement = document.profiles.find(
        (candidate) => candidate.id === replacementProfileId
      );
      if (replacement) {
        onOpenCreatedProfile(replacement);
      }
    }
  }

  async function refreshSource(sourceId: string, sourceName: string): Promise<void> {
    try {
      setError(undefined);
      setNotice(undefined);
      setRefreshingSourceId(sourceId);
      onBackgroundState(await requestBackgroundState({ type: 'source.refresh', sourceId }));
      setNotice(`已刷新 ${sourceName}。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法刷新来源');
    } finally {
      setRefreshingSourceId(undefined);
    }
  }

  return (
    <>
      <ProfileHeader
        busy={busy}
        onColorChange={async (color) => {
          await replace(() => setOriginalProfileColor(document, selectedProfile.id, color));
        }}
        onCopy={copy}
        onDelete={() => setDeleting(true)}
        onExport={() => exportProfile(selectedProfile)}
        onRename={rename}
        profile={selectedProfile}
      />
      {notice ? <p className="inline-notice original-profile-workspace-message">{notice}</p> : null}
      {error ? <p className="inline-error original-profile-workspace-message">{error}</p> : null}
      <ProfileEditor
        busy={busy}
        document={document}
        onOpenTool={onOpenTool}
        onRefreshSource={refreshSource}
        onReplace={replace}
        profile={selectedProfile}
        refreshingSourceId={refreshingSourceId}
        sourceStatuses={sourceStatuses}
      />
      {deleting && deletionPlan ? (
        <DeleteProfileDialog
          busy={busy}
          document={document}
          onClose={() => setDeleting(false)}
          onConfirm={remove}
          plan={deletionPlan}
          profileId={selectedProfile.id}
        />
      ) : null}
    </>
  );
}

function exportProfile(profile: ProfileV2): void {
  const content =
    profile.kind === 'pac' && profile.source.kind === 'inline'
      ? profile.source.text
      : JSON.stringify(profile, null, 2);
  const extension = profile.kind === 'pac' && profile.source.kind === 'inline' ? 'pac' : 'json';
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.download = `${profile.name}.${extension}`;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

import { Copy, Network, Pencil, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type {
  ConfigurationDocument,
  ProfileDocumentV2,
  ProfileTarget,
  ProfileV2
} from '@switchypeformance/contracts';

import type { BackgroundState } from '../../runtime/messages.ts';
import { pacSourceStatusId, ruleListSourceStatusId } from '../../runtime/source-status-id.ts';
import { createId, requestBackgroundState } from '../background-client.ts';
import type {
  PacProfileUpdate,
  RuleListProfileUpdate
} from '../configuration/advanced-profile-actions.ts';
import {
  updatePacProfile,
  updateRuleListProfile,
  updateVirtualProfile
} from '../configuration/advanced-profile-actions.ts';
import {
  cloneProfile,
  planProfileDeletion,
  renameProfile,
  replaceAndDeleteProfile
} from '../configuration/profile-actions.ts';
import { updateFixedProxyProfile } from '../configuration/proxy-server-actions.ts';
import { toUserFacingMessage } from '../error-message.ts';
import { profileKindLabel } from '../v2-labels.ts';
import { AutoDetectProfileEditor } from '../components/AutoDetectProfileEditor.tsx';
import { FixedProxyEditor } from '../components/FixedProxyEditor.tsx';
import { PacProfileEditor } from '../components/PacProfileEditor.tsx';
import { ProfileDeleteDialog } from '../components/ProfileDeleteDialog.tsx';
import { RuleListProfileEditor } from '../components/RuleListProfileEditor.tsx';
import { VirtualProfileEditor } from '../components/VirtualProfileEditor.tsx';
import { V2RulesPage } from './V2RulesPage.tsx';

interface ProfileWorkspaceProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onActivate(profileId: string): Promise<void>;
  onOpenProfile(profileId: string): void;
  onOpenTool(page: 'proxy-servers'): void;
  onReplace(document: ConfigurationDocument): Promise<BackgroundState>;
  onState(state: BackgroundState): void;
  profileId: string;
  sourceStatuses: BackgroundState['sourceStatuses'];
}

export function ProfileWorkspace({
  busy,
  document,
  onActivate,
  onOpenProfile,
  onOpenTool,
  onReplace,
  onState,
  profileId,
  sourceStatuses
}: ProfileWorkspaceProps) {
  const foundProfile = document.profiles.find((candidate) => candidate.id === profileId);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(foundProfile?.name ?? '');
  const [deleting, setDeleting] = useState(false);
  const [refreshingSourceId, setRefreshingSourceId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    setRenaming(false);
    setName(foundProfile?.name ?? '');
    setDeleting(false);
    setError(undefined);
    setNotice(undefined);
  }, [foundProfile?.name, profileId]);

  if (!foundProfile) {
    return <section className="page-panel empty-state">这个配置已经不存在了。</section>;
  }

  const profile = foundProfile;

  const builtIn = profile.id === 'direct' || profile.id === 'system';
  const active = profile.id === document.activeProfileId;
  const deletionPlan = deleting ? planProfileDeletion(document, profile.id) : undefined;

  async function replace(action: () => ProfileDocumentV2): Promise<boolean> {
    try {
      setError(undefined);
      setNotice(undefined);
      await onReplace(action());
      return true;
    } catch (cause) {
      setError(toUserFacingMessage(cause));
      return false;
    }
  }

  async function saveName(): Promise<void> {
    if (await replace(() => renameProfile(document, profile.id, name))) {
      setRenaming(false);
      setNotice('配置名称已保存。');
    }
  }

  async function copyProfile(): Promise<void> {
    const copiedId = createId('profile');
    if (
      await replace(() =>
        cloneProfile(document, profile.id, {
          id: copiedId,
          name: `${profile.name} 副本`,
          ruleId: () => createId('rule')
        })
      )
    ) {
      onOpenProfile(copiedId);
    }
  }

  async function deleteProfile(replacementProfileId: string): Promise<void> {
    if (await replace(() => replaceAndDeleteProfile(document, profile.id, replacementProfileId))) {
      onOpenProfile(replacementProfileId);
    }
  }

  async function refreshSource(sourceId: string, sourceName: string): Promise<void> {
    try {
      setError(undefined);
      setNotice(undefined);
      setRefreshingSourceId(sourceId);
      onState(await requestBackgroundState({ type: 'source.refresh', sourceId }));
      setNotice(`已刷新 ${sourceName}。`);
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    } finally {
      setRefreshingSourceId(undefined);
    }
  }

  return (
    <>
      <section className="profile-workspace-header">
        <div className="profile-workspace-title">
          <p>代理配置</p>
          {renaming ? (
            <span className="profile-name-editor">
              <input
                aria-label="配置名称"
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
              <button
                aria-label="保存配置名称"
                className="icon-action"
                disabled={busy || !name.trim()}
                onClick={() => void saveName()}
                title="保存名称"
                type="button"
              >
                <Save size={16} />
              </button>
              <button
                aria-label="取消修改配置名称"
                className="icon-action"
                disabled={busy}
                onClick={() => {
                  setName(profile.name);
                  setRenaming(false);
                }}
                title="取消"
                type="button"
              >
                <X size={16} />
              </button>
            </span>
          ) : (
            <strong>{profile.name}</strong>
          )}
          <span className="profile-workspace-kind">{profileKindLabel(profile.kind)}</span>
        </div>
        <div className="profile-workspace-actions">
          {active ? <span className="active-profile-badge">当前使用</span> : null}
          {!active ? (
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void onActivate(profile.id)}
              type="button"
            >
              切换到此配置
            </button>
          ) : null}
          {!builtIn ? (
            <>
              <button
                aria-label={`重命名 ${profile.name}`}
                className="icon-action"
                disabled={busy}
                onClick={() => setRenaming(true)}
                title="重命名"
                type="button"
              >
                <Pencil size={16} />
              </button>
              <button
                aria-label={`复制 ${profile.name}`}
                className="icon-action"
                disabled={busy}
                onClick={() => void copyProfile()}
                title="复制配置"
                type="button"
              >
                <Copy size={16} />
              </button>
              <button
                aria-label={`删除 ${profile.name}`}
                className="icon-danger"
                disabled={busy}
                onClick={() => setDeleting(true)}
                title="删除配置"
                type="button"
              >
                <Trash2 size={16} />
              </button>
            </>
          ) : null}
        </div>
      </section>
      {notice ? (
        <p className="inline-notice profile-workspace-message" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="inline-error profile-workspace-message" role="alert">
          {error}
        </p>
      ) : null}
      <ProfileEditor
        busy={busy}
        document={document}
        onOpenTool={onOpenTool}
        onReplace={replace}
        profile={profile}
        refreshingSourceId={refreshingSourceId}
        sourceStatuses={sourceStatuses}
        onRefreshSource={refreshSource}
      />
      {deleting && deletionPlan ? (
        <ProfileDeleteDialog
          busy={busy}
          document={document}
          onClose={() => setDeleting(false)}
          onConfirm={deleteProfile}
          plan={deletionPlan}
          profileId={profile.id}
        />
      ) : null}
    </>
  );
}

export function ProfileEditor({
  busy,
  document,
  onOpenTool,
  onRefreshSource,
  onReplace,
  profile,
  refreshingSourceId,
  sourceStatuses
}: {
  busy: boolean;
  document: ProfileDocumentV2;
  onOpenTool(page: 'proxy-servers'): void;
  onRefreshSource(sourceId: string, sourceName: string): Promise<void>;
  onReplace(action: () => ProfileDocumentV2): Promise<boolean>;
  profile: ProfileV2;
  refreshingSourceId: string | undefined;
  sourceStatuses: BackgroundState['sourceStatuses'];
}) {
  switch (profile.kind) {
    case 'direct':
    case 'system':
      return <BuiltinProfilePanel profile={profile} />;
    case 'fixed-proxy':
      return (
        <>
          <FixedProxyEditor
            busy={busy}
            document={document}
            onSave={async (update) => {
              await onReplace(() => updateFixedProxyProfile(document, profile.id, update));
            }}
            profile={profile}
          />
          <section className="page-panel profile-server-link">
            <div>
              <p className="panel-kicker">代理服务器</p>
              <h2>管理此配置使用的服务器</h2>
            </div>
            <button
              className="outline-button"
              onClick={() => onOpenTool('proxy-servers')}
              type="button"
            >
              <Network size={16} />
              管理代理服务器
            </button>
          </section>
        </>
      );
    case 'auto-switch':
      return (
        <V2RulesPage
          busy={busy}
          document={document}
          onReplace={async (next) => {
            if (next.schemaVersion !== 2) {
              throw new Error('规则编辑器返回了不受支持的配置版本');
            }
            if (!(await onReplace(() => next))) {
              throw new Error('配置没有保存');
            }
          }}
          selectedProfileId={profile.id}
        />
      );
    case 'pac': {
      const sourceId = profile.source.kind === 'url' ? pacSourceStatusId(profile.id) : undefined;
      return (
        <PacProfileEditor
          busy={busy || refreshingSourceId === sourceId}
          onSave={async (update: PacProfileUpdate) => {
            await onReplace(() => updatePacProfile(document, profile.id, update));
          }}
          profile={profile}
          sourceStatus={sourceStatuses.find((status) => status.sourceId === sourceId)}
          {...(sourceId === undefined
            ? {}
            : { onRefresh: () => onRefreshSource(sourceId, profile.name) })}
        />
      );
    }
    case 'auto-detect':
      return <AutoDetectProfileEditor profile={profile} />;
    case 'rule-list': {
      const source = document.ruleSources.find((candidate) => candidate.id === profile.sourceId);
      if (!source) {
        return <p className="inline-error">规则列表引用的来源不存在。</p>;
      }
      const sourceId = source.source.kind === 'url' ? ruleListSourceStatusId(source.id) : undefined;
      return (
        <RuleListProfileEditor
          busy={busy || refreshingSourceId === sourceId}
          document={document}
          onSave={async (update: RuleListProfileUpdate) => {
            await onReplace(() => updateRuleListProfile(document, profile.id, update));
          }}
          profile={profile}
          source={source}
          sourceStatus={sourceStatuses.find((status) => status.sourceId === sourceId)}
          {...(sourceId === undefined
            ? {}
            : { onRefresh: () => onRefreshSource(sourceId, source.name) })}
        />
      );
    }
    case 'virtual':
      return (
        <VirtualProfileEditor
          busy={busy}
          document={document}
          onSave={async (target: ProfileTarget) => {
            await onReplace(() => updateVirtualProfile(document, profile.id, target));
          }}
          profile={profile}
        />
      );
  }
}

function BuiltinProfilePanel({
  profile
}: {
  profile: Extract<ProfileV2, { kind: 'direct' | 'system' }>;
}) {
  return (
    <section className="page-panel builtin-profile-panel">
      <p className="panel-kicker">内置配置</p>
      <h2>
        {profile.kind === 'direct'
          ? '不使用代理，所有请求直接连接。'
          : '使用 Chrome 当前的系统代理设置。'}
      </h2>
    </section>
  );
}

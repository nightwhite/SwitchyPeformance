import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { createId } from '../background-client.ts';
import {
  CREATABLE_PROFILE_KINDS,
  cloneProfile,
  createProfile,
  moveProfile,
  planProfileDeletion,
  renameProfile,
  replaceAndDeleteProfile,
  type CreatableProfileKind
} from '../configuration/profile-actions.ts';
import { toUserFacingMessage } from '../error-message.ts';
import { profileKindLabel } from '../v2-labels.ts';
import { ProfileDeleteDialog } from '../components/ProfileDeleteDialog.tsx';

interface V2ProfilesPageProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onActivate(profileId: string): Promise<void>;
  onReplace(document: ProfileDocumentV2): Promise<unknown>;
}

export function V2ProfilesPage({ busy, document, onActivate, onReplace }: V2ProfilesPageProps) {
  const [createKind, setCreateKind] = useState<CreatableProfileKind>('auto-switch');
  const [createName, setCreateName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string }>();
  const [deletingProfileId, setDeletingProfileId] = useState<string>();
  const [error, setError] = useState<string>();
  const deletingPlan = deletingProfileId
    ? planProfileDeletion(document, deletingProfileId)
    : undefined;

  async function apply(action: () => ProfileDocumentV2): Promise<boolean> {
    try {
      setError(undefined);
      await onReplace(action());
      return true;
    } catch (cause) {
      setError(toUserFacingMessage(cause));
      return false;
    }
  }

  async function create(): Promise<void> {
    const saved = await apply(() =>
      createProfile(document, {
        id: createId('profile'),
        kind: createKind,
        name: createName
      })
    );
    if (saved) {
      setCreateName('');
    }
  }

  async function saveRename(profileId: string, name: string): Promise<void> {
    if (await apply(() => renameProfile(document, profileId, name))) {
      setEditing(undefined);
    }
  }

  async function deleteProfile(replacementProfileId: string): Promise<void> {
    if (
      await apply(() =>
        replaceAndDeleteProfile(document, deletingProfileId ?? '', replacementProfileId)
      )
    ) {
      setDeletingProfileId(undefined);
    }
  }

  function profileAtOffset(profileId: string, offset: number): string | undefined {
    const index = document.profiles.findIndex((profile) => profile.id === profileId);
    const target = document.profiles[index + offset];
    return target?.id;
  }

  return (
    <>
      <section className="page-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">新增配置</p>
            <h2>创建代理模式</h2>
          </div>
        </div>
        <div className="form-grid form-grid-profile-create">
          <label>
            类型
            <select
              disabled={busy}
              onChange={(event) => setCreateKind(event.target.value as CreatableProfileKind)}
              value={createKind}
            >
              {CREATABLE_PROFILE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {profileKindLabel(kind)}
                </option>
              ))}
            </select>
          </label>
          <label>
            名称
            <input
              disabled={busy}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="例如：工作自动切换"
              value={createName}
            />
          </label>
          <button
            className="primary-button form-command"
            disabled={busy || !createName.trim()}
            onClick={() => void create()}
            type="button"
          >
            <Plus size={16} />
            新增配置
          </button>
        </div>
        {error ? <p className="inline-error">{error}</p> : null}
      </section>
      <section className="page-panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">配置切换</p>
            <h2>选择当前代理配置</h2>
          </div>
        </div>
        <div className="data-table">
          <div className="table-row table-head profile-table-row">
            <span>名称</span>
            <span>类型</span>
            <span>状态</span>
            <span>操作</span>
          </div>
          {document.profiles.map((profile, index) => {
            const active = profile.id === document.activeProfileId;
            const builtIn = profile.id === 'direct' || profile.id === 'system';
            const isEditing = editing?.id === profile.id;
            return (
              <div className="table-row profile-table-row" key={profile.id}>
                {isEditing ? (
                  <span className="inline-name-editor">
                    <input
                      aria-label={`配置 ${profile.name} 的新名称`}
                      onChange={(event) =>
                        setEditing((current) =>
                          current ? { ...current, name: event.target.value } : current
                        )
                      }
                      value={editing.name}
                    />
                    <button
                      aria-label={`保存 ${profile.name} 的新名称`}
                      className="icon-action"
                      disabled={busy}
                      onClick={() => void saveRename(profile.id, editing.name)}
                      title="保存名称"
                      type="button"
                    >
                      <Save size={16} />
                    </button>
                    <button
                      aria-label={`取消修改 ${profile.name}`}
                      className="icon-action"
                      disabled={busy}
                      onClick={() => setEditing(undefined)}
                      title="取消"
                      type="button"
                    >
                      <X size={16} />
                    </button>
                  </span>
                ) : (
                  <strong>{profile.name}</strong>
                )}
                <span className="mono-chip">{profileKindLabel(profile.kind)}</span>
                <span>{active ? '当前使用' : '未启用'}</span>
                <span className="table-actions profile-actions">
                  <button
                    className="outline-button"
                    disabled={busy || active}
                    onClick={() => void onActivate(profile.id)}
                    type="button"
                  >
                    切换
                  </button>
                  {!builtIn ? (
                    <>
                      <button
                        aria-label={`重命名 ${profile.name}`}
                        className="icon-action"
                        disabled={busy}
                        onClick={() => setEditing({ id: profile.id, name: profile.name })}
                        title="重命名"
                        type="button"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        aria-label={`复制 ${profile.name}`}
                        className="icon-action"
                        disabled={busy}
                        onClick={() =>
                          void apply(() =>
                            cloneProfile(document, profile.id, {
                              id: createId('profile'),
                              name: `${profile.name} 副本`,
                              ruleId: () => createId('rule')
                            })
                          )
                        }
                        title="复制"
                        type="button"
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        aria-label={`上移 ${profile.name}`}
                        className="icon-action"
                        disabled={busy || index <= 2}
                        onClick={() => {
                          const before = profileAtOffset(profile.id, -1);
                          if (before) {
                            void apply(() => moveProfile(document, profile.id, before));
                          }
                        }}
                        title="上移"
                        type="button"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        aria-label={`下移 ${profile.name}`}
                        className="icon-action"
                        disabled={busy || index === document.profiles.length - 1}
                        onClick={() => {
                          const afterNext = profileAtOffset(profile.id, 2);
                          void apply(() => moveProfile(document, profile.id, afterNext));
                        }}
                        title="下移"
                        type="button"
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        aria-label={`删除 ${profile.name}`}
                        className="icon-danger"
                        disabled={busy}
                        onClick={() => setDeletingProfileId(profile.id)}
                        title="删除"
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      {deletingProfileId && deletingPlan ? (
        <ProfileDeleteDialog
          busy={busy}
          document={document}
          plan={deletingPlan}
          profileId={deletingProfileId}
          onClose={() => setDeletingProfileId(undefined)}
          onConfirm={deleteProfile}
        />
      ) : null}
    </>
  );
}

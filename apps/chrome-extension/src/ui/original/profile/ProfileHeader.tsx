import { Copy, Download, Pencil, Save, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import type { ProfileV2 } from '@switchypeformance/contracts';

import { profileKindLabel } from '../../v2-labels.ts';

interface ProfileHeaderProps {
  busy: boolean;
  onColorChange(color: string): Promise<void>;
  onCopy(): Promise<void>;
  onDelete(): void;
  onExport(): void;
  onRename(name: string): Promise<void>;
  profile: ProfileV2;
}

export function ProfileHeader({
  busy,
  onColorChange,
  onCopy,
  onDelete,
  onExport,
  onRename,
  profile
}: ProfileHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [error, setError] = useState<string>();
  const builtIn = profile.id === 'direct' || profile.id === 'system';

  async function rename(): Promise<void> {
    try {
      setError(undefined);
      await onRename(name);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法修改配置名称');
    }
  }

  async function copy(): Promise<void> {
    try {
      setError(undefined);
      await onCopy();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法复制配置');
    }
  }

  return (
    <header className="original-profile-header">
      <div className="original-profile-heading">
        <input
          aria-label={`设置 ${profile.name} 的颜色`}
          className="original-profile-color"
          disabled={busy}
          onChange={(event) => void onColorChange(event.target.value)}
          title="配置颜色"
          type="color"
          value={profile.color ?? '#3478b7'}
        />
        <div>
          <p>{profileKindLabel(profile.kind)}</p>
          {editing ? (
            <span className="original-profile-name-edit">
              <input
                aria-label="配置名称"
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
              <button aria-label="保存配置名称" className="icon-action" disabled={busy} onClick={() => void rename()} type="button">
                <Save size={16} />
              </button>
              <button
                aria-label="取消修改配置名称"
                className="icon-action"
                disabled={busy}
                onClick={() => {
                  setName(profile.name);
                  setEditing(false);
                }}
                type="button"
              >
                <X size={16} />
              </button>
            </span>
          ) : (
            <h1>{profile.name}</h1>
          )}
        </div>
      </div>
      <div className="original-profile-actions">
        <button className="outline-button" disabled={busy} onClick={onExport} type="button">
          <Download size={16} />
          导出
        </button>
        {!builtIn ? (
          <>
            <button aria-label={`重命名 ${profile.name}`} className="icon-action" disabled={busy} onClick={() => setEditing(true)} title="重命名" type="button">
              <Pencil size={16} />
            </button>
            <button aria-label={`复制 ${profile.name}`} className="icon-action" disabled={busy} onClick={() => void copy()} title="复制" type="button">
              <Copy size={16} />
            </button>
            <button aria-label={`删除 ${profile.name}`} className="icon-danger" disabled={busy} onClick={onDelete} title="删除" type="button">
              <Trash2 size={16} />
            </button>
          </>
        ) : null}
      </div>
      {error ? <p className="inline-error original-profile-header-error">{error}</p> : null}
    </header>
  );
}

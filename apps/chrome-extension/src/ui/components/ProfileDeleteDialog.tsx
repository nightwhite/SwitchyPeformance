import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import type { ProfileDeletionPlan } from '../configuration/profile-actions.ts';
import { profileName } from '../v2-labels.ts';

interface ProfileDeleteDialogProps {
  busy: boolean;
  document: ProfileDocumentV2;
  plan: ProfileDeletionPlan;
  profileId: string;
  onClose(): void;
  onConfirm(replacementProfileId: string): Promise<void>;
}

export function ProfileDeleteDialog({
  busy,
  document,
  plan,
  profileId,
  onClose,
  onConfirm
}: ProfileDeleteDialogProps) {
  const replacements = document.profiles.filter((profile) => profile.id !== profileId);
  const [replacementProfileId, setReplacementProfileId] = useState(replacements[0]?.id ?? 'direct');

  function referenceOwner(reference: (typeof plan.references)[number]): string {
    if (reference.ownerProfileId === 'active') {
      return '当前启用配置';
    }
    if (reference.ownerProfileId === 'settings') {
      return '启动配置';
    }
    return profileName(document, reference.ownerProfileId);
  }

  return (
    <div className="modal-scrim" role="presentation">
      <section aria-modal="true" className="modal-dialog" role="dialog" aria-label="删除代理配置">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">安全删除</p>
            <h2>删除 {profileName(document, profileId)}</h2>
          </div>
          <button
            aria-label="关闭删除对话框"
            className="icon-action"
            onClick={onClose}
            title="关闭"
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        {plan.references.length > 0 ? (
          <>
            <p className="modal-warning">
              <AlertTriangle size={16} />
              当前配置仍被 {plan.references.length} 处使用。删除时会把这些引用替换为下方配置。
            </p>
            <ul className="reference-list">
              {plan.references.map((reference) => (
                <li key={`${reference.ownerProfileId}:${reference.field}`}>
                  {referenceOwner(reference)} / {reference.field}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="inline-notice">没有其他配置引用它。</p>
        )}
        <label>
          替代配置
          <select
            disabled={busy}
            onChange={(event) => setReplacementProfileId(event.target.value)}
            value={replacementProfileId}
          >
            {replacements.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
        <div className="dialog-actions">
          <button className="outline-button" disabled={busy} onClick={onClose} type="button">
            取消
          </button>
          <button
            className="danger-outline"
            disabled={busy || replacements.length === 0}
            onClick={() => void onConfirm(replacementProfileId)}
            type="button"
          >
            <Trash2 size={16} />
            替换并删除
          </button>
        </div>
      </section>
    </div>
  );
}

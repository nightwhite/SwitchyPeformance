import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import type { ProfileDeletionPlan } from '../../configuration/profile-actions.ts';

interface DeleteProfileDialogProps {
  busy: boolean;
  document: ProfileDocumentV2;
  plan: ProfileDeletionPlan;
  profileId: string;
  onClose(): void;
  onConfirm(replacementProfileId: string): Promise<void>;
}

export function DeleteProfileDialog({
  busy,
  document,
  plan,
  profileId,
  onClose,
  onConfirm
}: DeleteProfileDialogProps) {
  const replacements = document.profiles.filter((profile) => profile.id !== profileId);
  const [replacementProfileId, setReplacementProfileId] = useState(replacements[0]?.id ?? 'direct');
  const [error, setError] = useState<string>();

  async function confirm(): Promise<void> {
    try {
      setError(undefined);
      await onConfirm(replacementProfileId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法删除配置');
    }
  }

  return (
    <div className="modal-scrim" role="presentation">
      <section aria-label="删除配置" aria-modal="true" className="modal-dialog" role="dialog">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">删除配置</p>
            <h2>删除 {document.profiles.find((profile) => profile.id === profileId)?.name}</h2>
          </div>
          <button
            aria-label="关闭删除配置窗口"
            className="icon-action"
            disabled={busy}
            onClick={onClose}
            title="关闭"
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        {plan.references.length > 0 ? (
          <p className="modal-warning">
            <AlertTriangle size={16} />
            这个配置仍被 {plan.references.length} 处使用，删除时会统一替换成下方配置。
          </p>
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
        {error ? <p className="inline-error">{error}</p> : null}
        <div className="dialog-actions">
          <button className="outline-button" disabled={busy} onClick={onClose} type="button">
            取消
          </button>
          <button
            className="danger-outline"
            disabled={busy || replacements.length === 0}
            onClick={() => void confirm()}
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

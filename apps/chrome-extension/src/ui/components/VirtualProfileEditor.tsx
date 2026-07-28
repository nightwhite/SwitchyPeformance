import { Save } from 'lucide-react';
import { useState } from 'react';

import type {
  ProfileDocumentV2,
  ProfileTarget,
  VirtualProfileV2
} from '@switchypeformance/contracts';

import { toUserFacingMessage } from '../error-message.ts';
import { ProfileTargetSelect } from './ProfileTargetSelect.tsx';

interface VirtualProfileEditorProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onSave(target: ProfileTarget): Promise<void>;
  profile: VirtualProfileV2;
}

export function VirtualProfileEditor({
  busy,
  document,
  onSave,
  profile
}: VirtualProfileEditorProps) {
  const [targetProfileId, setTargetProfileId] = useState(profile.target.profileId);
  const [error, setError] = useState<string>();

  async function save(): Promise<void> {
    try {
      setError(undefined);
      await onSave({ profileId: targetProfileId });
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  return (
    <section className="page-panel advanced-profile-editor virtual-profile-editor">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">虚拟配置</p>
          <h2>{profile.name}</h2>
        </div>
      </div>
      <div className="form-grid virtual-profile-grid">
        <ProfileTargetSelect
          disabled={busy}
          document={document}
          excludeProfileId={profile.id}
          label="实际使用的配置"
          onChange={setTargetProfileId}
          profileId={targetProfileId}
        />
        <button
          className="primary-button form-command"
          disabled={busy}
          onClick={() => void save()}
          type="button"
        >
          <Save size={16} />
          保存虚拟配置
        </button>
      </div>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

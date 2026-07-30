import type {
  ConfigurationDocument,
  ProfileDocumentV2,
  VirtualProfileV2
} from '@switchypeformance/contracts';

import { useState } from 'react';

import { ProfileTargetSelect } from '../../components/ProfileTargetSelect.tsx';
import { toUserFacingMessage } from '../../error-message.ts';
import { updateVirtualDraft } from './advanced-profile-draft.ts';

interface VirtualProfilePageProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onReplace(document: ConfigurationDocument): Promise<unknown>;
  profile: VirtualProfileV2;
}

export function VirtualProfilePage({
  busy,
  document,
  onReplace,
  profile
}: VirtualProfilePageProps) {
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  async function changeTarget(profileId: string): Promise<void> {
    try {
      setError(undefined);
      await onReplace(updateVirtualDraft(document, profile.id, { profileId }));
      setNotice('虚拟配置目标已加入待应用修改。');
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  return (
    <section className="original-page-panel original-advanced-profile-page">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">虚拟配置</p>
          <h2>虚拟配置目标</h2>
        </div>
      </div>
      <div className="original-virtual-target">
        <ProfileTargetSelect
          disabled={busy}
          document={document}
          excludeProfileId={profile.id}
          label="目标配置"
          onChange={(profileId) => void changeTarget(profileId)}
          profileId={profile.target.profileId}
        />
        <p className="field-help">虚拟配置只指向另一个配置，不会增加额外的代理连接。</p>
      </div>
      {notice ? <p className="inline-notice">{notice}</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}
    </section>
  );
}

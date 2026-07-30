import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';

import type {
  ConfigurationDocument,
  PacProfileV2,
  ProfileDocumentV2
} from '@switchypeformance/contracts';

import type { SourceStatus as SourceStatusRecord } from '../../../runtime/source-status-repository.ts';
import { SourceFields } from '../../components/SourceFields.tsx';
import { SourceStatus } from '../../components/SourceStatus.tsx';
import { sourceDraftFrom, sourceFromDraft } from '../../configuration/source-draft.ts';
import { toUserFacingMessage } from '../../error-message.ts';
import { updatePacDraft } from './advanced-profile-draft.ts';

interface PacProfilePageProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onRefresh?(): Promise<void>;
  onReplace(document: ConfigurationDocument): Promise<unknown>;
  profile: PacProfileV2;
  sourceStatus?: SourceStatusRecord | undefined;
}

export function PacProfilePage({
  busy,
  document,
  onRefresh,
  onReplace,
  profile,
  sourceStatus
}: PacProfilePageProps) {
  const [source, setSource] = useState(() => sourceDraftFrom(profile.source));
  const [allowInsecureHttp, setAllowInsecureHttp] = useState(() => allowsInsecureHttp(profile));
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    setSource(sourceDraftFrom(profile.source));
    setAllowInsecureHttp(allowsInsecureHttp(profile));
    setError(undefined);
    setNotice(undefined);
  }, [profile]);

  async function save(): Promise<void> {
    try {
      setError(undefined);
      await onReplace(
        updatePacDraft(document, profile.id, {
          allowInsecureHttp,
          source: sourceFromDraft(source)
        })
      );
      setNotice('PAC 来源已加入待应用修改。');
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  return (
    <section className="original-page-panel original-advanced-profile-page">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">PAC</p>
          <h2>PAC 脚本或地址</h2>
        </div>
      </div>
      <SourceFields
        allowInsecureHttp={allowInsecureHttp}
        disabled={busy}
        inlineLabel="PAC 脚本"
        onAllowInsecureHttpChange={setAllowInsecureHttp}
        onChange={setSource}
        showHeaders
        showRefresh
        value={source}
      />
      {profile.source.kind === 'url' && onRefresh ? (
        <SourceStatus busy={busy} onRefresh={onRefresh} policy={profile.source.refresh} status={sourceStatus} />
      ) : null}
      <div className="editor-actions">
        <button className="primary-button" disabled={busy} onClick={() => void save()} type="button">
          <Save size={16} />
          更新 PAC 草稿
        </button>
      </div>
      {notice ? <p className="inline-notice">{notice}</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}
    </section>
  );
}

function allowsInsecureHttp(profile: PacProfileV2): boolean {
  return profile.source.kind === 'url' && profile.source.url.trim().startsWith('http:');
}

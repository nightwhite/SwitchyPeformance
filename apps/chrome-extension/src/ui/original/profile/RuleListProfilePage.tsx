import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';

import type {
  ConfigurationDocument,
  ProfileDocumentV2,
  RuleListProfileV2,
  RuleListSource
} from '@switchypeformance/contracts';

import type { SourceStatus as SourceStatusRecord } from '../../../runtime/source-status-repository.ts';
import { ProfileTargetSelect } from '../../components/ProfileTargetSelect.tsx';
import { SourceFields } from '../../components/SourceFields.tsx';
import { SourceStatus } from '../../components/SourceStatus.tsx';
import { sourceDraftFrom, sourceFromDraft } from '../../configuration/source-draft.ts';
import { toUserFacingMessage } from '../../error-message.ts';
import { updateRuleListDraft } from './advanced-profile-draft.ts';

interface RuleListProfilePageProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onRefresh?(): Promise<void>;
  onReplace(document: ConfigurationDocument): Promise<unknown>;
  profile: RuleListProfileV2;
  source: RuleListSource;
  sourceStatus?: SourceStatusRecord | undefined;
}

export function RuleListProfilePage({
  busy,
  document,
  onRefresh,
  onReplace,
  profile,
  source,
  sourceStatus
}: RuleListProfilePageProps) {
  const [name, setName] = useState(source.name);
  const [format, setFormat] = useState(source.format);
  const [sourceDraft, setSourceDraft] = useState(() => sourceDraftFrom(source.source));
  const [matchTargetId, setMatchTargetId] = useState(profile.matchTarget.profileId);
  const [fallbackProfileId, setFallbackProfileId] = useState(profile.fallback.profileId);
  const [allowInsecureHttp, setAllowInsecureHttp] = useState(() => allowsInsecureHttp(source));
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    setName(source.name);
    setFormat(source.format);
    setSourceDraft(sourceDraftFrom(source.source));
    setMatchTargetId(profile.matchTarget.profileId);
    setFallbackProfileId(profile.fallback.profileId);
    setAllowInsecureHttp(allowsInsecureHttp(source));
    setError(undefined);
    setNotice(undefined);
  }, [profile, source]);

  async function save(): Promise<void> {
    try {
      setError(undefined);
      await onReplace(
        updateRuleListDraft(document, profile.id, {
          allowInsecureHttp,
          fallback: { profileId: fallbackProfileId },
          matchTarget: { profileId: matchTargetId },
          source: {
            format,
            id: source.id,
            name,
            source: sourceFromDraft(sourceDraft)
          }
        })
      );
      setNotice('规则列表已加入待应用修改。');
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  return (
    <section className="original-page-panel original-advanced-profile-page">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">规则列表</p>
          <h2>规则来源与目标</h2>
        </div>
        <span className="mono-chip">切换时编译</span>
      </div>
      <div className="original-rule-list-settings">
        <label>
          来源名称
          <input disabled={busy} onChange={(event) => setName(event.target.value)} value={name} />
        </label>
        <label>
          规则格式
          <select
            disabled={busy}
            onChange={(event) => setFormat(event.target.value as RuleListSource['format'])}
            value={format}
          >
            <option value="auto-proxy">AutoProxy</option>
            <option value="switchy">Switchy</option>
          </select>
        </label>
        <ProfileTargetSelect
          autoSwitchRouteTargetsOnly
          disabled={busy}
          document={document}
          excludeProfileId={profile.id}
          label="命中规则后使用"
          onChange={setMatchTargetId}
          profileId={matchTargetId}
        />
        <ProfileTargetSelect
          autoSwitchRouteTargetsOnly
          disabled={busy}
          document={document}
          excludeProfileId={profile.id}
          label="没有规则命中时"
          onChange={setFallbackProfileId}
          profileId={fallbackProfileId}
        />
      </div>
      <SourceFields
        allowInsecureHttp={allowInsecureHttp}
        disabled={busy}
        inlineLabel="规则列表文本"
        onAllowInsecureHttpChange={setAllowInsecureHttp}
        onChange={setSourceDraft}
        showHeaders
        showRefresh
        value={sourceDraft}
      />
      {source.source.kind === 'url' && onRefresh ? (
        <SourceStatus busy={busy} onRefresh={onRefresh} policy={source.source.refresh} status={sourceStatus} />
      ) : null}
      <div className="editor-actions">
        <button className="primary-button" disabled={busy} onClick={() => void save()} type="button">
          <Save size={16} />
          更新规则列表草稿
        </button>
      </div>
      {notice ? <p className="inline-notice">{notice}</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}
    </section>
  );
}

function allowsInsecureHttp(source: RuleListSource): boolean {
  return source.source.kind === 'url' && source.source.url.trim().startsWith('http:');
}

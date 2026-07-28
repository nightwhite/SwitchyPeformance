import { Save } from 'lucide-react';
import { useState } from 'react';

import type { AutoSwitchProfileV2, ProfileDocumentV2 } from '@switchypeformance/contracts';

import type { AutoSwitchSettingsUpdate } from '../configuration/rule-actions.ts';
import { toUserFacingMessage } from '../error-message.ts';
import { RuleTargetSelect } from './RuleTargetSelect.tsx';

interface AutoSwitchSettingsEditorProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onSave(update: AutoSwitchSettingsUpdate): Promise<void>;
  profile: AutoSwitchProfileV2;
}

export function AutoSwitchSettingsEditor({
  busy,
  document,
  onSave,
  profile
}: AutoSwitchSettingsEditorProps) {
  const [fallbackProfileId, setFallbackProfileId] = useState(profile.fallback.profileId);
  const [loopbackPolicy, setLoopbackPolicy] = useState(profile.loopbackPolicy);
  const [proxyFailurePolicy, setProxyFailurePolicy] = useState(profile.proxyFailurePolicy);
  const [error, setError] = useState<string>();

  async function save(): Promise<void> {
    try {
      setError(undefined);
      await onSave({
        fallback: { profileId: fallbackProfileId },
        loopbackPolicy,
        proxyFailurePolicy
      });
    } catch (cause) {
      setError(toUserFacingMessage(cause));
    }
  }

  return (
    <section className="page-panel auto-switch-settings">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">自动切换设置</p>
          <h2>{profile.name}</h2>
        </div>
      </div>
      <div className="form-grid auto-switch-settings-grid">
        <RuleTargetSelect
          disabled={busy}
          document={document}
          label="没有规则命中时"
          onChange={setFallbackProfileId}
          profileId={fallbackProfileId}
        />
        <label>
          本地地址
          <select
            disabled={busy}
            onChange={(event) =>
              setLoopbackPolicy(event.target.value === 'use-rules' ? 'use-rules' : 'direct')
            }
            value={loopbackPolicy}
          >
            <option value="direct">始终直连</option>
            <option value="use-rules">允许规则匹配</option>
          </select>
        </label>
        <label>
          代理连接失败时
          <select
            disabled={busy}
            onChange={(event) =>
              setProxyFailurePolicy(event.target.value === 'block' ? 'block' : 'direct')
            }
            value={proxyFailurePolicy}
          >
            <option value="direct">直连</option>
            <option value="block">阻断</option>
          </select>
        </label>
        <button
          className="primary-button form-command"
          disabled={busy}
          onClick={() => void save()}
          type="button"
        >
          <Save size={16} />
          保存设置
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

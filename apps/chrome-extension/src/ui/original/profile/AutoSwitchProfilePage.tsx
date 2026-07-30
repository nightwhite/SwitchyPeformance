import { useState } from 'react';

import type {
  AutoSwitchProfileV2,
  ConfigurationDocument,
  ProfileDocumentV2,
  SwitchRuleV2
} from '@switchypeformance/contracts';

import { createId } from '../../background-client.ts';
import { RuleEditorDialog, type RuleEditorDraft } from '../../components/RuleEditorDialog.tsx';
import { RuleTargetSelect } from '../../components/RuleTargetSelect.tsx';
import {
  addRule,
  cloneRule,
  moveRule,
  removeRule,
  resetRuleTargets,
  toggleRule,
  updateAutoSwitchSettings,
  updateRule
} from '../../configuration/rule-actions.ts';
import { toUserFacingMessage } from '../../error-message.ts';
import { AutoSwitchRuleTable } from './AutoSwitchRuleTable.tsx';
import { AutoSwitchSourceEditor } from './AutoSwitchSourceEditor.tsx';
import { setAutoSwitchRuleSourceIds } from './auto-switch-draft.ts';

interface AutoSwitchProfilePageProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onReplace(document: ConfigurationDocument): Promise<unknown>;
  profile: AutoSwitchProfileV2;
}

type RuleEditorState = { kind: 'create' } | { kind: 'edit'; ruleId: string };

export function AutoSwitchProfilePage({
  busy,
  document,
  onReplace,
  profile
}: AutoSwitchProfilePageProps) {
  const [editor, setEditor] = useState<RuleEditorState>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const editedRule =
    editor?.kind === 'edit' ? profile.rules.find((rule) => rule.id === editor.ruleId) : undefined;

  async function replace(action: () => ProfileDocumentV2, message?: string): Promise<boolean> {
    try {
      setError(undefined);
      await onReplace(action());
      if (message) {
        setNotice(message);
      }
      return true;
    } catch (cause) {
      setError(toUserFacingMessage(cause));
      return false;
    }
  }

  async function saveRule(draft: RuleEditorDraft): Promise<void> {
    if (editor?.kind === 'edit') {
      const existing = profile.rules.find((rule) => rule.id === editor.ruleId);
      if (!existing) {
        throw new Error('自动切换规则不存在');
      }
      const saved = await replace(
        () => updateRule(document, profile.id, { ...draft, id: existing.id }),
        '规则已加入待应用修改。'
      );
      if (saved) {
        setEditor(undefined);
      }
      return;
    }
    const saved = await replace(
      () => addRule(document, profile.id, { ...draft, id: createId('rule') }),
      '规则已加入待应用修改。'
    );
    if (saved) {
      setEditor(undefined);
    }
  }

  async function changeFallback(profileId: string): Promise<void> {
    await replace(
      () =>
        updateAutoSwitchSettings(document, profile.id, {
          fallback: { profileId },
          loopbackPolicy: profile.loopbackPolicy,
          proxyFailurePolicy: profile.proxyFailurePolicy
        }),
      '默认目标已加入待应用修改。'
    );
  }

  async function changeLoopback(value: AutoSwitchProfileV2['loopbackPolicy']): Promise<void> {
    await replace(
      () =>
        updateAutoSwitchSettings(document, profile.id, {
          fallback: profile.fallback,
          loopbackPolicy: value,
          proxyFailurePolicy: profile.proxyFailurePolicy
        }),
      '本地地址策略已加入待应用修改。'
    );
  }

  async function changeFailure(value: AutoSwitchProfileV2['proxyFailurePolicy']): Promise<void> {
    await replace(
      () =>
        updateAutoSwitchSettings(document, profile.id, {
          fallback: profile.fallback,
          loopbackPolicy: profile.loopbackPolicy,
          proxyFailurePolicy: value
        }),
      '失败策略已加入待应用修改。'
    );
  }

  async function remove(ruleId: string): Promise<void> {
    if (!window.confirm('要删除这条自动切换规则吗？')) {
      return;
    }
    await replace(() => removeRule(document, profile.id, ruleId), '规则已加入待应用修改。');
  }

  return (
    <section className="original-auto-switch-page">
      <section className="original-page-panel original-auto-switch-default">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">默认行为</p>
            <h2>自动切换设置</h2>
          </div>
        </div>
        <div className="original-auto-switch-settings">
          <RuleTargetSelect
            disabled={busy}
            document={document}
            label="没有规则命中时"
            onChange={(profileId) => void changeFallback(profileId)}
            profileId={profile.fallback.profileId}
          />
          <label>
            本地地址
            <select
              disabled={busy}
              onChange={(event) =>
                void changeLoopback(event.target.value === 'use-rules' ? 'use-rules' : 'direct')
              }
              value={profile.loopbackPolicy}
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
                void changeFailure(event.target.value === 'block' ? 'block' : 'direct')
              }
              value={profile.proxyFailurePolicy}
            >
              <option value="direct">直连</option>
              <option value="block">阻断</option>
            </select>
          </label>
        </div>
      </section>

      <AutoSwitchSourceEditor
        busy={busy}
        document={document}
        onChange={async (sourceIds) => {
          await replace(
            () => setAutoSwitchRuleSourceIds(document, profile.id, sourceIds),
            '规则来源已加入待应用修改。'
          );
        }}
        profile={profile}
      />

      <AutoSwitchRuleTable
        busy={busy}
        document={document}
        onAdd={() => setEditor({ kind: 'create' })}
        onClone={async (rule) => {
          await replace(
            () => cloneRule(document, profile.id, rule.id, createId('rule')),
            '规则副本已加入待应用修改。'
          );
        }}
        onEdit={(rule) => setEditor({ kind: 'edit', ruleId: rule.id })}
        onMove={async (ruleId, toIndex) => {
          await replace(
            () => moveRule(document, profile.id, ruleId, toIndex),
            '规则顺序已加入待应用修改。'
          );
        }}
        onRemove={remove}
        onReset={async () => {
          if (!window.confirm('要将所有规则目标改为当前默认目标吗？')) {
            return;
          }
          await replace(
            () => resetRuleTargets(document, profile.id),
            '所有规则目标已加入待应用修改。'
          );
        }}
        onToggle={async (ruleId, enabled) => {
          await replace(
            () => toggleRule(document, profile.id, ruleId, enabled),
            enabled ? '规则已启用，等待应用。' : '规则已停用，等待应用。'
          );
        }}
        profile={profile}
      />

      {notice ? <p className="inline-notice original-auto-switch-message">{notice}</p> : null}
      {error ? <p className="inline-error original-auto-switch-message">{error}</p> : null}
      {editor ? (
        <RuleEditorDialog
          busy={busy}
          document={document}
          key={editor.kind === 'edit' ? editor.ruleId : 'create'}
          onClose={() => setEditor(undefined)}
          onSave={saveRule}
          {...(editedRule ? { initialRule: editedRule } : {})}
        />
      ) : null}
    </section>
  );
}

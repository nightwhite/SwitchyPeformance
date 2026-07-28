import { Plus } from 'lucide-react';
import { useState } from 'react';

import type {
  AutoSwitchProfileV2,
  ConfigurationDocument,
  ProfileDocumentV2,
  SwitchRuleV2
} from '@switchypeformance/contracts';

import type { BackgroundState } from '../../runtime/messages.ts';
import { createId } from '../background-client.ts';
import { AutoSwitchSettingsEditor } from '../components/AutoSwitchSettingsEditor.tsx';
import { RuleEditorDialog, type RuleEditorDraft } from '../components/RuleEditorDialog.tsx';
import { VirtualRuleTable } from '../components/VirtualRuleTable.tsx';
import {
  addRule,
  moveRule,
  removeRule,
  toggleRule,
  updateAutoSwitchSettings,
  updateRule,
  type AutoSwitchSettingsUpdate
} from '../configuration/rule-actions.ts';
import { toUserFacingMessage } from '../error-message.ts';

interface V2RulesPageProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onReplace(document: ConfigurationDocument): Promise<BackgroundState>;
}

type RuleEditorState = { kind: 'create' } | { kind: 'edit'; ruleId: string };

export function V2RulesPage({ busy, document, onReplace }: V2RulesPageProps) {
  const automaticProfiles = document.profiles.filter(
    (profile): profile is AutoSwitchProfileV2 => profile.kind === 'auto-switch'
  );
  const [profileId, setProfileId] = useState(automaticProfiles[0]?.id ?? '');
  const [editor, setEditor] = useState<RuleEditorState>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const selected =
    automaticProfiles.find((profile) => profile.id === profileId) ?? automaticProfiles[0];
  const editedRule =
    editor?.kind === 'edit' ? selected?.rules.find((rule) => rule.id === editor.ruleId) : undefined;

  async function replaceConfiguration(action: () => ProfileDocumentV2): Promise<void> {
    try {
      setError(undefined);
      setNotice(undefined);
      await onReplace(action());
    } catch (cause) {
      setError(toUserFacingMessage(cause));
      throw cause;
    }
  }

  async function saveRule(draft: RuleEditorDraft): Promise<void> {
    if (!selected) {
      return;
    }
    if (editor?.kind === 'edit') {
      const existing = selected.rules.find((rule) => rule.id === editor.ruleId);
      if (!existing) {
        throw new Error('自动切换规则不存在');
      }
      await replaceConfiguration(() =>
        updateRule(document, selected.id, { ...draft, id: existing.id })
      );
      setNotice('规则已更新。');
      return;
    }
    await replaceConfiguration(() =>
      addRule(document, selected.id, { ...draft, id: createId('rule') })
    );
    setNotice('规则已添加。');
  }

  async function saveSettings(update: AutoSwitchSettingsUpdate): Promise<void> {
    if (!selected) {
      return;
    }
    await replaceConfiguration(() => updateAutoSwitchSettings(document, selected.id, update));
    setNotice('自动切换设置已更新。');
  }

  async function toggle(ruleId: string, enabled: boolean): Promise<void> {
    if (!selected) {
      return;
    }
    try {
      await replaceConfiguration(() => toggleRule(document, selected.id, ruleId, enabled));
      setNotice(enabled ? '规则已启用。' : '规则已停用。');
    } catch {
      // The page-level message is already set by replaceConfiguration.
    }
  }

  async function move(ruleId: string, toIndex: number): Promise<void> {
    if (!selected) {
      return;
    }
    try {
      await replaceConfiguration(() => moveRule(document, selected.id, ruleId, toIndex));
      setNotice('规则顺序已更新。');
    } catch {
      // The page-level message is already set by replaceConfiguration.
    }
  }

  async function remove(ruleId: string): Promise<void> {
    if (!selected || !window.confirm('要删除这条自动切换规则吗？')) {
      return;
    }
    try {
      await replaceConfiguration(() => removeRule(document, selected.id, ruleId));
      setNotice('规则已删除。');
    } catch {
      // The page-level message is already set by replaceConfiguration.
    }
  }

  if (!selected) {
    return <section className="page-panel empty-state">请先在代理配置中创建自动切换模式。</section>;
  }

  return (
    <>
      <section className="page-panel rule-toolbar">
        <label className="profile-select">
          自动切换配置
          <select
            disabled={busy}
            onChange={(event) => setProfileId(event.target.value)}
            value={selected.id}
          >
            {automaticProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
        <div className="toolbar-actions">
          <span className="mono-chip">{selected.rules.length.toLocaleString()} 条规则</span>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => setEditor({ kind: 'create' })}
            type="button"
          >
            <Plus size={16} />
            添加规则
          </button>
        </div>
      </section>
      {notice ? (
        <p className="inline-notice rule-page-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="inline-error rule-page-notice" role="alert">
          {error}
        </p>
      ) : null}
      <AutoSwitchSettingsEditor
        busy={busy}
        document={document}
        key={selected.id}
        onSave={saveSettings}
        profile={selected}
      />
      <VirtualRuleTable
        busy={busy}
        document={document}
        onEdit={(rule) => setEditor({ kind: 'edit', ruleId: rule.id })}
        onMove={move}
        onRemove={remove}
        onToggle={toggle}
        profile={selected}
      />
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
    </>
  );
}

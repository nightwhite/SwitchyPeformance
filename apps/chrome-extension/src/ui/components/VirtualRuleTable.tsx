import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import type {
  AutoSwitchProfileV2,
  ProfileDocumentV2,
  SwitchRuleV2
} from '@switchypeformance/contracts';

import { calculateVirtualWindow } from '../rule-virtualizer.ts';
import { conditionLabel, profileName } from '../v2-labels.ts';

const RULE_ROW_HEIGHT = 59;
const RULE_VIEWPORT_HEIGHT = 590;
const RULE_OVERSCAN = 5;

interface VirtualRuleTableProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onEdit(rule: SwitchRuleV2): void;
  onMove(ruleId: string, toIndex: number): Promise<void>;
  onRemove(ruleId: string): Promise<void>;
  onToggle(ruleId: string, enabled: boolean): Promise<void>;
  profile: AutoSwitchProfileV2;
}

interface RuleRecord {
  index: number;
  rule: SwitchRuleV2;
}

export function VirtualRuleTable({
  busy,
  document,
  onEdit,
  onMove,
  onRemove,
  onToggle,
  profile
}: VirtualRuleTableProps) {
  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredRecords = useMemo(
    () => (normalizedQuery ? filterRules(profile, document, normalizedQuery) : undefined),
    [document, normalizedQuery, profile]
  );
  const itemCount = filteredRecords?.length ?? profile.rules.length;
  const window = calculateVirtualWindow({
    itemCount,
    overscan: RULE_OVERSCAN,
    rowHeight: RULE_ROW_HEIGHT,
    scrollTop,
    viewportHeight: RULE_VIEWPORT_HEIGHT
  });

  return (
    <section className="page-panel rule-table-panel">
      <div className="rule-table-controls">
        <label className="rule-search">
          搜索规则
          <input
            onChange={(event) => {
              setQuery(event.target.value);
              setScrollTop(0);
            }}
            placeholder="匹配内容或目标配置"
            value={query}
          />
        </label>
        <span className="mono-chip">
          {itemCount.toLocaleString()} / {profile.rules.length.toLocaleString()} 条
        </span>
      </div>
      <div className="rule-table-heading">
        <span>序号</span>
        <span>状态</span>
        <span>匹配条件</span>
        <span>目标</span>
        <span>操作</span>
      </div>
      {itemCount === 0 ? (
        <div className="empty-state">没有匹配的规则</div>
      ) : (
        <div
          className="rule-table"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          style={{ height: RULE_VIEWPORT_HEIGHT }}
        >
          <div className="rule-virtual-spacer" style={{ height: window.totalHeight }}>
            <div
              className="rule-virtual-content"
              style={{ transform: `translateY(${window.offsetTop}px)` }}
            >
              {visibleRecords(profile, filteredRecords, window.start, window.end).map((record) => (
                <RuleRow
                  busy={busy}
                  document={document}
                  key={record.rule.id}
                  onEdit={onEdit}
                  onMove={onMove}
                  onRemove={onRemove}
                  onToggle={onToggle}
                  profile={profile}
                  record={record}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function RuleRow({
  busy,
  document,
  onEdit,
  onMove,
  onRemove,
  onToggle,
  profile,
  record
}: {
  busy: boolean;
  document: ProfileDocumentV2;
  onEdit(rule: SwitchRuleV2): void;
  onMove(ruleId: string, toIndex: number): Promise<void>;
  onRemove(ruleId: string): Promise<void>;
  onToggle(ruleId: string, enabled: boolean): Promise<void>;
  profile: AutoSwitchProfileV2;
  record: RuleRecord;
}) {
  const { index, rule } = record;
  const condition = conditionLabel(rule.condition);
  const target = profileName(document, rule.target.profileId);
  return (
    <div className="rule-row">
      <span>{index + 1}</span>
      <label className="rule-enabled-toggle">
        <input
          aria-label={`切换规则 ${index + 1}`}
          checked={rule.enabled}
          disabled={busy}
          onChange={(event) => void onToggle(rule.id, event.target.checked)}
          type="checkbox"
        />
        <span>{rule.enabled ? '启用' : '停用'}</span>
      </label>
      <strong className="rule-condition-value" title={condition}>
        {condition}
      </strong>
      <span className="rule-target-value" title={target}>
        {target}
      </span>
      <span className="rule-actions">
        <button
          aria-label={`编辑第 ${index + 1} 条规则`}
          className="icon-action"
          disabled={busy}
          onClick={() => onEdit(rule)}
          title="编辑规则"
          type="button"
        >
          <Pencil size={16} />
        </button>
        <button
          aria-label={`上移第 ${index + 1} 条规则`}
          className="icon-action"
          disabled={busy || index === 0}
          onClick={() => void onMove(rule.id, index - 1)}
          title="上移"
          type="button"
        >
          <ArrowUp size={16} />
        </button>
        <button
          aria-label={`下移第 ${index + 1} 条规则`}
          className="icon-action"
          disabled={busy || index === profile.rules.length - 1}
          onClick={() => void onMove(rule.id, index + 1)}
          title="下移"
          type="button"
        >
          <ArrowDown size={16} />
        </button>
        <button
          aria-label={`删除第 ${index + 1} 条规则`}
          className="icon-danger"
          disabled={busy}
          onClick={() => void onRemove(rule.id)}
          title="删除规则"
          type="button"
        >
          <Trash2 size={16} />
        </button>
      </span>
    </div>
  );
}

function filterRules(
  profile: AutoSwitchProfileV2,
  document: ProfileDocumentV2,
  normalizedQuery: string
): readonly RuleRecord[] {
  return profile.rules.flatMap((rule, index) => {
    const haystack =
      `${conditionLabel(rule.condition)} ${profileName(document, rule.target.profileId)}`.toLocaleLowerCase();
    return haystack.includes(normalizedQuery) ? [{ index, rule }] : [];
  });
}

function visibleRecords(
  profile: AutoSwitchProfileV2,
  filteredRecords: readonly RuleRecord[] | undefined,
  start: number,
  end: number
): readonly RuleRecord[] {
  if (filteredRecords) {
    return filteredRecords.slice(start, end);
  }
  return profile.rules.slice(start, end).flatMap((rule, offset) => {
    const index = start + offset;
    return rule ? [{ index, rule }] : [];
  });
}

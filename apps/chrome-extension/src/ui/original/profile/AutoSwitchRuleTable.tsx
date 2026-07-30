import { ArrowDown, ArrowUp, Copy, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';

import type {
  AutoSwitchProfileV2,
  ProfileDocumentV2,
  SwitchRuleV2
} from '@switchypeformance/contracts';

import { calculateVirtualWindow } from '../../rule-virtualizer.ts';
import { conditionLabel, profileName } from '../../v2-labels.ts';

const ROW_HEIGHT = 46;
const VIEWPORT_HEIGHT = 552;
const OVERSCAN = 8;

interface AutoSwitchRuleTableProps {
  busy: boolean;
  document: ProfileDocumentV2;
  onAdd(): void;
  onClone(rule: SwitchRuleV2): Promise<void>;
  onEdit(rule: SwitchRuleV2): void;
  onMove(ruleId: string, toIndex: number): Promise<void>;
  onRemove(ruleId: string): Promise<void>;
  onReset(): Promise<void>;
  onToggle(ruleId: string, enabled: boolean): Promise<void>;
  profile: AutoSwitchProfileV2;
}

export function AutoSwitchRuleTable({
  busy,
  document,
  onAdd,
  onClone,
  onEdit,
  onMove,
  onRemove,
  onReset,
  onToggle,
  profile
}: AutoSwitchRuleTableProps) {
  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [draggingRuleId, setDraggingRuleId] = useState<string>();
  const deferredQuery = useDeferredValue(query).trim().toLocaleLowerCase();
  const filteredIndexes = useMemo(
    () => (deferredQuery ? filterIndexes(profile, document, deferredQuery) : undefined),
    [deferredQuery, document, profile]
  );
  const itemCount = filteredIndexes?.length ?? profile.rules.length;
  const window = calculateVirtualWindow({
    itemCount,
    overscan: OVERSCAN,
    rowHeight: ROW_HEIGHT,
    scrollTop,
    viewportHeight: VIEWPORT_HEIGHT
  });
  const visible = visibleRules(profile, filteredIndexes, window.start, window.end);

  return (
    <section className="original-page-panel original-rule-table-panel">
      <div className="original-rule-toolbar">
        <label className="original-rule-search">
          <Search size={16} />
          <input
            aria-label="搜索规则"
            onChange={(event) => {
              setQuery(event.target.value);
              setScrollTop(0);
            }}
            placeholder="搜索域名、条件或目标配置"
            value={query}
          />
        </label>
        <span className="mono-chip">
          {itemCount.toLocaleString()} / {profile.rules.length.toLocaleString()} 条
        </span>
        <button className="primary-button" disabled={busy} onClick={onAdd} type="button">
          <Plus size={16} />
          添加规则
        </button>
        <button
          aria-label="将所有规则目标重置为默认目标"
          className="icon-action"
          disabled={busy || profile.rules.length === 0}
          onClick={() => void onReset()}
          title="重置所有规则目标"
          type="button"
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <div className="original-rule-heading" role="row">
        <span>顺序</span>
        <span>条件</span>
        <span>目标</span>
        <span>启用</span>
        <span>操作</span>
      </div>
      {itemCount === 0 ? (
        <div className="empty-state">没有匹配的规则</div>
      ) : (
        <div
          className="original-rule-scroll"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          style={{ height: VIEWPORT_HEIGHT }}
        >
          <div style={{ height: window.totalHeight }}>
            <div style={{ transform: `translateY(${window.offsetTop}px)` }}>
              {visible.map(({ index, rule }) => (
                <RuleRow
                  busy={busy}
                  document={document}
                  dragging={draggingRuleId === rule.id}
                  index={index}
                  key={rule.id}
                  onClone={onClone}
                  onDragEnd={() => setDraggingRuleId(undefined)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={() => setDraggingRuleId(rule.id)}
                  onDrop={async () => {
                    if (draggingRuleId && draggingRuleId !== rule.id) {
                      await onMove(draggingRuleId, index);
                    }
                    setDraggingRuleId(undefined);
                  }}
                  onEdit={onEdit}
                  onMove={onMove}
                  onRemove={onRemove}
                  onToggle={onToggle}
                  profile={profile}
                  rule={rule}
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
  dragging,
  index,
  onClone,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onEdit,
  onMove,
  onRemove,
  onToggle,
  profile,
  rule
}: {
  busy: boolean;
  document: ProfileDocumentV2;
  dragging: boolean;
  index: number;
  onClone(rule: SwitchRuleV2): Promise<void>;
  onDragEnd(): void;
  onDragOver(event: React.DragEvent<HTMLDivElement>): void;
  onDragStart(): void;
  onDrop(): Promise<void>;
  onEdit(rule: SwitchRuleV2): void;
  onMove(ruleId: string, toIndex: number): Promise<void>;
  onRemove(ruleId: string): Promise<void>;
  onToggle(ruleId: string, enabled: boolean): Promise<void>;
  profile: AutoSwitchProfileV2;
  rule: SwitchRuleV2;
}) {
  const condition = conditionLabel(rule.condition);
  const target = profileName(document, rule.target.profileId);
  return (
    <div
      className={dragging ? 'original-rule-row original-rule-row-dragging' : 'original-rule-row'}
      draggable={!busy}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={() => void onDrop()}
      role="row"
    >
      <span>{index + 1}</span>
      <strong title={condition}>{condition}</strong>
      <span title={target}>{target}</span>
      <label className="original-rule-enabled">
        <input
          aria-label={`切换第 ${index + 1} 条规则`}
          checked={rule.enabled}
          disabled={busy}
          onChange={(event) => void onToggle(rule.id, event.target.checked)}
          type="checkbox"
        />
      </label>
      <span className="original-rule-actions">
        <button
          aria-label={`复制第 ${index + 1} 条规则`}
          className="icon-action"
          disabled={busy}
          onClick={() => void onClone(rule)}
          title="复制规则"
          type="button"
        >
          <Copy size={15} />
        </button>
        <button
          aria-label={`编辑第 ${index + 1} 条规则`}
          className="icon-action"
          disabled={busy}
          onClick={() => onEdit(rule)}
          title="编辑规则"
          type="button"
        >
          <Pencil size={15} />
        </button>
        <button
          aria-label={`上移第 ${index + 1} 条规则`}
          className="icon-action"
          disabled={busy || index === 0}
          onClick={() => void onMove(rule.id, index - 1)}
          title="上移"
          type="button"
        >
          <ArrowUp size={15} />
        </button>
        <button
          aria-label={`下移第 ${index + 1} 条规则`}
          className="icon-action"
          disabled={busy || index === profile.rules.length - 1}
          onClick={() => void onMove(rule.id, index + 1)}
          title="下移"
          type="button"
        >
          <ArrowDown size={15} />
        </button>
        <button
          aria-label={`删除第 ${index + 1} 条规则`}
          className="icon-danger"
          disabled={busy}
          onClick={() => void onRemove(rule.id)}
          title="删除规则"
          type="button"
        >
          <Trash2 size={15} />
        </button>
      </span>
    </div>
  );
}

function filterIndexes(
  profile: AutoSwitchProfileV2,
  document: ProfileDocumentV2,
  query: string
): readonly number[] {
  const indexes: number[] = [];
  for (const [index, rule] of profile.rules.entries()) {
    const haystack = `${conditionLabel(rule.condition)} ${profileName(document, rule.target.profileId)}`.toLocaleLowerCase();
    if (haystack.includes(query)) {
      indexes.push(index);
    }
  }
  return indexes;
}

function visibleRules(
  profile: AutoSwitchProfileV2,
  filteredIndexes: readonly number[] | undefined,
  start: number,
  end: number
): readonly { index: number; rule: SwitchRuleV2 }[] {
  if (filteredIndexes) {
    return filteredIndexes.slice(start, end).flatMap((index) => {
      const rule = profile.rules[index];
      return rule ? [{ index, rule }] : [];
    });
  }
  return profile.rules.slice(start, end).flatMap((rule, offset) =>
    rule ? [{ index: start + offset, rule }] : []
  );
}

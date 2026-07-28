# 条件兼容性纠偏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将“始终命中”和“绕过模式”拆成不同的 V2 条件，并让主机层级按点号数量计算，从而避免导入后的规则语义变化。

**Architecture:** TypeScript 契约负责读取、校验和兼容旧的布尔 `bypass` 配置；Rust 路由核心与 PAC 编译器对同一条件产生相同结果。规则列表只把公开文本转换为这些明确的 V2 条件，不执行列表文本。

**Tech Stack:** TypeScript、React、Rust、WebAssembly、Vitest、Cargo test。

---

### Task 1: 建立失败契约测试

**Files:**

- Modify: `packages/contracts/src/config/condition-validation.test.ts`
- Modify: `packages/contracts/src/config/conditions.test.ts`
- Modify: `packages/contracts/src/config/document.test.ts`
- Modify: `packages/contracts/src/rule-list/parse.test.ts`
- Modify: `crates/routing-core/tests/v2_routing_plan_contract.rs`
- Modify: `apps/chrome-extension/src/ui/configuration/rule-condition-draft.test.ts`

- [x] **Step 1: 写出 `always`、模式化 `bypass` 和主机层级 0 的失败测试。**

```ts
expect(validateCondition({ type: 'always' })).toEqual({ ok: true });
expect(validateCondition({ type: 'bypass', pattern: '<local>' })).toEqual({ ok: true });
expect(validateCondition({ type: 'host-levels', min: 0, max: 0 })).toEqual({ ok: true });
```

```rust
// `intranet` 没有点号，HostLevels 0 必须命中。
V2RuleCondition::HostLevels { min: 0, max: Some(0) }
```

- [x] **Step 2: 运行定向测试，确认旧实现失败。**

Run: `pnpm vitest run packages/contracts/src/config/condition-validation.test.ts packages/contracts/src/rule-list/parse.test.ts && cargo test -p routing-core --test v2_routing_plan_contract`

Expected: FAIL；旧模型没有 `always`、把 `bypass` 当布尔值，且将无点主机误算为 1 层。

### Task 2: 修正 TypeScript 配置和规则列表解析

**Files:**

- Modify: `packages/contracts/src/config/conditions.ts`
- Modify: `packages/contracts/src/config/condition-validation.ts`
- Modify: `packages/contracts/src/config/document.ts`
- Modify: `packages/contracts/src/rule-list/switchy.ts`

- [x] **Step 1: 增加 `{ type: 'always' }` 和 `{ type: 'bypass'; pattern: string }`。**

旧 `{ type: 'bypass'; value: boolean }` 在读取时只转换为 `always` 或 `never`，不会写回原始形态。

- [x] **Step 2: 允许主机层级 0，并解析公开别名。**

规则列表支持 `True`、`False`、`Disabled`、`Bypass: <local>`、`HRegex`、`UWild`、`HWild`、`HostLevels: 0-2`、`Weekday: mon-fri`、`Time: 09:00-17:00`。不清晰或危险的输入保留行号警告并跳过。

- [x] **Step 3: 运行 TypeScript 定向测试。**

Run: `pnpm vitest run packages/contracts/src/config/condition-validation.test.ts packages/contracts/src/config/conditions.test.ts packages/contracts/src/rule-list/parse.test.ts`

Expected: PASS。

### Task 3: 对齐 Rust 路由、PAC 和中文编辑界面

**Files:**

- Modify: `crates/config-model/src/conditions.rs`
- Modify: `crates/routing-core/src/matcher.rs`
- Modify: `crates/routing-core/src/v2.rs`
- Modify: `crates/routing-core/tests/condition_contract.rs`
- Modify: `crates/routing-core/tests/v2_routing_plan_contract.rs`
- Modify: `crates/pac-compiler/src/v2/conditions.rs`
- Modify: `crates/pac-compiler/tests/v2_pac_contract.rs`
- Modify: `apps/chrome-extension/src/ui/configuration/rule-condition-draft.ts`
- Modify: `apps/chrome-extension/src/ui/components/RuleConditionEditor.tsx`
- Modify: `apps/chrome-extension/src/ui/v2-labels.ts`

- [x] **Step 1: 在 Rust 中将无点主机计算为 0 层，并实现 `<local>` 与主机通配符绕过匹配。**
- [x] **Step 2: 仅把精确主机和单一 `*.` 后缀写入索引；IP 段、内嵌 `*` 或 `?` 的主机通配符走预编译 PAC 分支。**
- [x] **Step 3: PAC 使用同一语义，`always` 直接生成 `true`，`bypass` 使用已生成的受限匹配函数。**
- [x] **Step 4: 中文规则编辑器显示“始终命中”和“绕过模式”，且主机层级允许 0。**
- [x] **Step 5: 运行 Rust、界面辅助函数和完整门禁。**

Run: `pnpm test`, `pnpm check`, `pnpm format:check`, `cargo fmt --check`, `pnpm build`.

Expected: PASS；所有生产文件小于 2,000 行。

**执行记录（2026-07-29）：** 先确认旧实现会拒绝 `always`、将 `bypass` 误当作布尔开关、并把无点主机算成 1 层；随后将旧布尔形态仅在读取时归一化为 `always` 或 `never`。主机层级改为按点号数计算，`<local>`、内嵌 `*`、`?` 等主机模式只走受限预编译分支，不污染精确/后缀索引。完整验证已通过：`pnpm test`（63 个文件、232 项测试）、`pnpm check`、`pnpm format:check`、`cargo fmt --check` 和 `pnpm build`；生产文件大小检查也在 `pnpm check` 内通过。

### Task 4: 提交检查点

- [x] **Step 1: 检查工作区并提交。**

```bash
git add packages/contracts/src crates apps/chrome-extension/src/ui docs/superpowers/plans
git commit -m "fix: preserve advanced rule condition semantics"
git push origin codex/zeroomega-v2-contracts
```

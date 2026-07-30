# ZeroOmega 原版体验重建 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不使用上游代码的前提下，让 SwitchyPeformance 的 Chrome 配置页和弹窗按 ZeroOmega 的用户操作路径工作，同时保留高性能路由和排查能力。

**Architecture:** 后台、配置合同和 Rust/WASM 路由器保持不变。选项页增加独立的本地草稿会话，所有配置编辑只修改草稿；用户点击“应用”时才一次性调用现有原子替换消息。React UI 重新按原版的侧栏、配置页、菜单弹窗组织，快速规则、临时规则、失败请求和右键菜单统一走公共规则建议服务。

**Tech Stack:** Chrome MV3、React 19、TypeScript、WXT、Vitest、Playwright、现有 Rust/WASM 路由引擎。

---

## 文件边界

| 路径 | 责任 |
| --- | --- |
| `apps/chrome-extension/src/ui/original/draft-session.ts` | 已应用配置与本地草稿的纯状态机 |
| `apps/chrome-extension/src/ui/original/use-draft-session.ts` | React 草稿会话钩子 |
| `apps/chrome-extension/src/ui/original/routes.ts` | 原版式 hash 路由和配置名解析 |
| `apps/chrome-extension/src/ui/original/OriginalOptionsApp.tsx` | 设置页工作区组合，不包含具体编辑器 |
| `apps/chrome-extension/src/ui/original/OriginalSidebar.tsx` | 左侧设置、配置、应用/放弃导航 |
| `apps/chrome-extension/src/ui/original/profile/*` | 配置页头、新建/删除/重命名模态框和各类型编辑器 |
| `apps/chrome-extension/src/ui/original/popup/*` | 弹窗菜单、默认目标下拉、快捷规则和失败请求界面模型 |
| `apps/chrome-extension/src/ui/original/original-options.css` | 原版式布局和响应式规则 |
| `apps/chrome-extension/entrypoints/options/OptionsApp.tsx` | 后台状态加载、草稿提交和页面挂载 |
| `apps/chrome-extension/entrypoints/popup/PopupApp.tsx` | 后台状态加载和原版式弹窗挂载 |

已有页面和编辑器可被拆分或迁移，但不继续往 `OptionsApp.tsx`、`PopupApp.tsx` 追加大段逻辑。每个源文件保持在 2,000 行以内。

## Task 1: 配置草稿状态机

**Files:**
- Create: `apps/chrome-extension/src/ui/original/draft-session.ts`
- Create: `apps/chrome-extension/src/ui/original/draft-session.test.ts`

- [x] **Step 1: 写失败测试，定义草稿不立即改变已应用配置。**

```ts
const session = createDraftSession(appliedDocument);
const next = session.replace({ ...appliedDocument, activeProfileId: 'system' });
expect(next.applied).toBe(appliedDocument);
expect(next.draft.activeProfileId).toBe('system');
expect(next.dirty).toBe(true);
```

- [x] **Step 2: 运行测试，确认模块尚不存在。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/original/draft-session.test.ts`

Expected: FAIL，提示无法解析 `draft-session.ts`。

- [x] **Step 3: 实现纯状态机。**

```ts
export interface DraftSession<T> {
  applied: T;
  draft: T;
  dirty: boolean;
}

export function createDraftSession<T>(applied: T): DraftSession<T>;
export function replaceDraft<T>(session: DraftSession<T>, draft: T): DraftSession<T>;
export function discardDraft<T>(session: DraftSession<T>): DraftSession<T>;
export function markDraftApplied<T>(session: DraftSession<T>, applied: T): DraftSession<T>;
```

`dirty` 用稳定的 JSON 比较计算；不修改输入对象。

- [x] **Step 4: 补充应用成功、放弃、后台配置变化三种测试。**

```ts
expect(discardDraft(changed).draft).toEqual(appliedDocument);
expect(markDraftApplied(changed, committed).dirty).toBe(false);
expect(rebaseCleanDraft(clean, newerApplied).draft).toBe(newerApplied);
```

- [x] **Step 5: 运行测试并提交。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/original/draft-session.test.ts`

Expected: PASS。

Commit: `git commit -m "feat: add options draft session"`

## Task 2: 原版路由和左侧栏

**Files:**
- Create: `apps/chrome-extension/src/ui/original/routes.ts`
- Create: `apps/chrome-extension/src/ui/original/routes.test.ts`
- Create: `apps/chrome-extension/src/ui/original/OriginalSidebar.tsx`
- Create: `apps/chrome-extension/src/ui/original/OriginalSidebar.test.tsx`
- Modify: `apps/chrome-extension/src/ui/options-routes.ts`

- [ ] **Step 1: 写失败测试，hash 可用配置名称打开页面。**

```ts
expect(resolveOriginalRoute('#!/profile/auto%20switch', document)).toEqual({
  kind: 'profile', profileId: 'automatic'
});
expect(originalProfileHash({ id: 'automatic', name: 'auto switch' })).toBe(
  '#!/profile/auto%20switch'
);
```

- [ ] **Step 2: 实现兼容路由。**

配置名是原版公开 URL，内部仍只使用 `profileId`。同时接受旧 `#/profile/<id>` 链接，避免现有书签失效。

- [ ] **Step 3: 写左栏渲染测试。**

```tsx
render(<OriginalSidebar document={document} dirty onApply={vi.fn()} onDiscard={vi.fn()} />);
expect(screen.getByRole('link', { name: '界面' })).toBeVisible();
expect(screen.getByRole('link', { name: '内置配置' })).toBeVisible();
expect(screen.getByRole('button', { name: '应用' })).toHaveClass('is-dirty');
```

- [ ] **Step 4: 实现侧栏。**

固定分组为“设置”“配置”“操作”；配置按内置、用户配置和新建配置顺序。应用和放弃永远在左栏下方；有草稿时应用按钮高亮，放弃按钮可用。

- [ ] **Step 5: 运行测试并提交。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/original/routes.test.ts apps/chrome-extension/src/ui/original/OriginalSidebar.test.tsx`

Expected: PASS。

Commit: `git commit -m "feat: add original style configuration navigation"`

## Task 3: 选项页草稿会话和应用/放弃

**Files:**
- Create: `apps/chrome-extension/src/ui/original/use-draft-session.ts`
- Create: `apps/chrome-extension/src/ui/original/OriginalOptionsApp.tsx`
- Create: `apps/chrome-extension/src/ui/original/OriginalOptionsApp.test.tsx`
- Modify: `apps/chrome-extension/entrypoints/options/OptionsApp.tsx`
- Modify: `apps/chrome-extension/src/ui/pages/V2OptionsApp.tsx`
- Modify: `apps/chrome-extension/src/ui/options-routes.test.ts`

- [ ] **Step 1: 写失败测试，编辑前后后台配置不变。**

```tsx
await user.click(screen.getByRole('button', { name: '新建配置' }));
await user.type(screen.getByLabelText('配置名称'), '工作代理');
await user.click(screen.getByRole('button', { name: '创建配置' }));
expect(sendBackgroundCommand).not.toHaveBeenCalledWith(
  expect.objectContaining({ type: 'configuration.replace' })
);
expect(screen.getByRole('button', { name: '应用' })).toHaveClass('is-dirty');
```

- [ ] **Step 2: 实现钩子并将 `OptionsApp` 改为双状态。**

```ts
const session = useDraftSession(backgroundState.configuration);
const apply = () => requestBackgroundState({ type: 'configuration.replace', document: session.draft });
const discard = () => session.discard();
```

应用成功后用后台返回的配置作为新的 `applied` 和 `draft`；失败时草稿保留并显示错误。只有弹窗切换模式和明确的导入提交可绕过草稿。

- [ ] **Step 3: 把配置编辑接口改为 `onDraftChange(nextDocument)`。**

`OriginalOptionsApp` 和配置编辑器不得自行发送 `configuration.replace`。保留 `onRefreshSource` 等只读/后台操作，但来源配置字段仍只修改草稿。

- [ ] **Step 4: 补充放弃和 URL 跳转保护测试。**

```ts
await user.click(screen.getByRole('button', { name: '放弃' }));
expect(screen.queryByText('工作代理')).not.toBeInTheDocument();
expect(window.confirm).toHaveBeenCalled();
```

- [ ] **Step 5: 运行测试并提交。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/original/OriginalOptionsApp.test.tsx apps/chrome-extension/src/ui/original/draft-session.test.ts`

Expected: PASS。

Commit: `git commit -m "feat: stage configuration changes before apply"`

## Task 4: 原版式配置页头和新建/删除流程

**Files:**
- Create: `apps/chrome-extension/src/ui/original/profile/ProfileHeader.tsx`
- Create: `apps/chrome-extension/src/ui/original/profile/NewProfileDialog.tsx`
- Create: `apps/chrome-extension/src/ui/original/profile/DeleteProfileDialog.tsx`
- Create: `apps/chrome-extension/src/ui/original/profile/profile-actions.ts`
- Create: `apps/chrome-extension/src/ui/original/profile/profile-actions.test.ts`
- Modify: `apps/chrome-extension/src/ui/pages/ProfileWorkspace.tsx`
- Modify: `apps/chrome-extension/src/ui/configuration/profile-actions.ts`

- [ ] **Step 1: 写失败测试，新建配置只创建草稿且进入其配置页。**

```ts
const result = createOriginalProfile(document, { kind: 'auto-switch', name: '自动分流' });
expect(result.document.profiles.at(-1)).toMatchObject({ kind: 'auto-switch', name: '自动分流' });
expect(result.profileId).toBeTruthy();
```

- [ ] **Step 2: 实现新建模态框。**

类型仅显示固定代理、自动切换、PAC、自动检测、规则列表和虚拟配置。创建后跳转到 `#!/profile/<name>`，但不修改 `activeProfileId`。

- [ ] **Step 3: 写删除替换和重命名测试。**

```ts
expect(replaceAndDeleteOriginalProfile(document, 'work', 'direct').profiles).not.toContainEqual(
  expect.objectContaining({ id: 'work' })
);
```

- [ ] **Step 4: 实现统一页头。**

页头包含颜色、配置名、导出规则/脚本（适用时）、重命名、删除。所有编辑通过 `onDraftChange` 更新；删除被引用时显示替换目标选择。

- [ ] **Step 5: 运行测试并提交。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/original/profile/profile-actions.test.ts`

Expected: PASS。

Commit: `git commit -m "feat: add original profile header and dialogs"`

## Task 5: 固定代理配置页

**Files:**
- Create: `apps/chrome-extension/src/ui/original/profile/FixedProfilePage.tsx`
- Create: `apps/chrome-extension/src/ui/original/profile/fixed-profile-draft.ts`
- Create: `apps/chrome-extension/src/ui/original/profile/fixed-profile-draft.test.ts`
- Modify: `apps/chrome-extension/src/ui/components/FixedProxyEditor.tsx`
- Modify: `apps/chrome-extension/src/ui/configuration/proxy-server-actions.ts`

- [ ] **Step 1: 写失败测试，默认和协议覆盖都留在草稿。**

```ts
const next = setFixedRoute(document, 'work', 'httpsProxyId', 'proxy-us');
expect(findFixed(next, 'work').routes).toMatchObject({ fallbackProxyId: 'proxy-hk', httpsProxyId: 'proxy-us' });
```

- [ ] **Step 2: 实现原版式代理表。**

显示默认、HTTP、HTTPS、FTP 行；每行可使用默认或选择代理。代理服务器可通过紧凑编辑器新增，并在草稿中同时写入 `proxyServers`。账号密码入口继续使用既有凭据服务，不在 UI 中暴露密码。

- [ ] **Step 3: 实现绕过列表和高级展开。**

默认只显示默认代理；有协议覆盖时自动展开。绕过列表文本按行处理，保留 `localhost`、IP/CIDR 和通配符。

- [ ] **Step 4: 运行测试并提交。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/original/profile/fixed-profile-draft.test.ts apps/chrome-extension/src/ui/configuration/proxy-server-actions.test.ts`

Expected: PASS。

Commit: `git commit -m "feat: rebuild fixed proxy configuration page"`

## Task 6: 自动切换配置页和大规则表

**Files:**
- Create: `apps/chrome-extension/src/ui/original/profile/AutoSwitchProfilePage.tsx`
- Create: `apps/chrome-extension/src/ui/original/profile/AutoSwitchRuleTable.tsx`
- Create: `apps/chrome-extension/src/ui/original/profile/AutoSwitchSourceEditor.tsx`
- Create: `apps/chrome-extension/src/ui/original/profile/auto-switch-draft.ts`
- Create: `apps/chrome-extension/src/ui/original/profile/auto-switch-draft.test.ts`
- Modify: `apps/chrome-extension/src/ui/components/AutoSwitchSettingsEditor.tsx`
- Modify: `apps/chrome-extension/src/ui/components/VirtualRuleTable.tsx`
- Modify: `apps/chrome-extension/src/ui/configuration/rule-actions.ts`

- [ ] **Step 1: 写失败测试，复制、移动和默认目标只改变草稿。**

```ts
expect(cloneOriginalRule(document, 'automatic', 'rule-1').rules).toHaveLength(2);
expect(moveOriginalRule(document, 'automatic', 'rule-2', 'up').rules[0]?.id).toBe('rule-2');
expect(setAutoSwitchFallback(document, 'automatic', 'work').fallback).toEqual({ profileId: 'work' });
```

- [ ] **Step 2: 实现原版式表格。**

列固定为排序、条件类型、匹配内容、目标、操作、备注。支持鼠标拖动和可访问的上移/下移按钮；仅渲染可见行但保留原版表格语义。

- [ ] **Step 3: 实现基础/高级条件、复制、删除、备注和重置。**

条件校验复用合同层 `validateCondition`。重置只将所有规则目标改为当前默认目标，弹出确认模态框。

- [ ] **Step 4: 实现规则文本模式和附加规则来源。**

文本模式切换前解析、显示行号错误；远程规则来源和手动刷新使用现有 `source.refresh`，但来源参数修改留在草稿。

- [ ] **Step 5: 运行测试和性能基准并提交。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/original/profile/auto-switch-draft.test.ts && pnpm benchmark:routing`

Expected: PASS；基准不低于当前提交的规则查找性能。

Commit: `git commit -m "feat: rebuild automatic switching profile page"`

## Task 7: PAC、规则列表、自动检测和虚拟配置页

**Files:**
- Create: `apps/chrome-extension/src/ui/original/profile/PacProfilePage.tsx`
- Create: `apps/chrome-extension/src/ui/original/profile/RuleListProfilePage.tsx`
- Create: `apps/chrome-extension/src/ui/original/profile/VirtualProfilePage.tsx`
- Create: `apps/chrome-extension/src/ui/original/profile/advanced-profile-draft.test.ts`
- Modify: `apps/chrome-extension/src/ui/components/PacProfileEditor.tsx`
- Modify: `apps/chrome-extension/src/ui/components/AutoDetectProfileEditor.tsx`
- Modify: `apps/chrome-extension/src/ui/components/VirtualProfileEditor.tsx`
- Modify: `apps/chrome-extension/src/ui/configuration/advanced-profile-actions.ts`

- [ ] **Step 1: 写失败测试，四种高级配置可通过草稿更新。**

```ts
expect(updatePacDraft(document, 'pac', { url: 'https://example.com/proxy.pac' }).profiles).toEqual(
  expect.arrayContaining([expect.objectContaining({ id: 'pac', kind: 'pac' })])
);
```

- [ ] **Step 2: 实现 PAC 和自动检测页。**

PAC 支持地址、内联脚本、请求头、手动刷新、更新时间、错误提示；自动检测配置提供检测地址和兜底行为。刷新不会擅自应用未保存的字段。

- [ ] **Step 3: 实现规则列表和虚拟配置页。**

规则列表支持匹配目标、默认目标、格式、来源、文本、刷新；虚拟配置只选择目标，并显示其最终指向。

- [ ] **Step 4: 运行测试并提交。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/original/profile/advanced-profile-draft.test.ts apps/chrome-extension/src/ui/configuration/advanced-profile-actions.test.ts`

Expected: PASS。

Commit: `git commit -m "feat: rebuild advanced profile pages"`

## Task 8: 设置、导入导出、主题和性能扩展归位

**Files:**
- Create: `apps/chrome-extension/src/ui/original/UiSettingsPage.tsx`
- Create: `apps/chrome-extension/src/ui/original/GeneralSettingsPage.tsx`
- Create: `apps/chrome-extension/src/ui/original/ImportExportPage.tsx`
- Create: `apps/chrome-extension/src/ui/original/ThemeSettingsPage.tsx`
- Modify: `apps/chrome-extension/src/ui/pages/SettingsPage.tsx`
- Modify: `apps/chrome-extension/src/ui/pages/DataPage.tsx`
- Modify: `apps/chrome-extension/src/ui/pages/DiagnosticsPage.tsx`

- [ ] **Step 1: 写失败测试，左栏“通用”能显示网络监控和排查入口。**

```tsx
await user.click(screen.getByRole('link', { name: '通用' }));
expect(screen.getByLabelText('记录网页网络时间线')).toBeVisible();
expect(screen.getByRole('link', { name: '打开详细排查' })).toBeVisible();
```

- [ ] **Step 2: 把现有设置内容归入原版四页。**

UI 页放语言、快捷键和刷新；通用页放网络监控、外部代理控制和性能参数；导入/导出页放 `.bak`、JSON、同步；主题页放浅色/深色/自定义颜色。日志仍可打开，但不成为常规配置主导航。

- [ ] **Step 3: 运行测试并提交。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/pages/SettingsPage.test.ts apps/chrome-extension/src/ui/ui-language.test.ts`

Expected: PASS。

Commit: `git commit -m "feat: align settings with original navigation"`

## Task 9: 原版式弹窗菜单模型

**Files:**
- Create: `apps/chrome-extension/src/ui/original/popup/menu-model.ts`
- Create: `apps/chrome-extension/src/ui/original/popup/menu-model.test.ts`
- Create: `apps/chrome-extension/src/ui/original/popup/OriginalPopupMenu.tsx`
- Modify: `apps/chrome-extension/entrypoints/popup/PopupApp.tsx`
- Modify: `apps/chrome-extension/src/ui/popup/popup-menu-model.ts`

- [ ] **Step 1: 写失败测试，弹窗菜单排序与原版一致。**

```ts
expect(originalPopupRows(document)).toEqual([
  expect.objectContaining({ profileId: 'direct', role: 'builtin' }),
  expect.objectContaining({ profileId: 'system', role: 'builtin' }),
  expect.objectContaining({ profileId: 'work', role: 'profile' })
]);
```

- [ ] **Step 2: 实现配置行模型。**

内置配置固定在顶部；隐藏配置不显示；固定、PAC、虚拟、自动切换、规则列表按原版顺序及名称排序；选中态与系统代理的“有效态”区分。

- [ ] **Step 3: 实现可选默认目标下拉。**

有默认目标的自动切换/规则列表/虚拟配置行显示 `[默认目标]` 和箭头。点击行只切换模式；箭头展开目标列表，选择后只修改默认目标并按设置刷新当前标签页。

- [ ] **Step 4: 运行测试并提交。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/original/popup/menu-model.test.ts apps/chrome-extension/src/ui/popup/popup-menu-model.test.ts`

Expected: PASS。

Commit: `git commit -m "feat: rebuild popup profile menu"`

## Task 10: 当前网站规则、临时规则和键盘操作

**Files:**
- Create: `apps/chrome-extension/src/ui/original/popup/QuickRuleForm.tsx`
- Create: `apps/chrome-extension/src/ui/original/popup/quick-rule-suggestion.ts`
- Create: `apps/chrome-extension/src/ui/original/popup/quick-rule-suggestion.test.ts`
- Create: `apps/chrome-extension/src/ui/original/popup/keyboard-shortcuts.ts`
- Create: `apps/chrome-extension/src/ui/original/popup/keyboard-shortcuts.test.ts`
- Modify: `apps/chrome-extension/src/ui/popup/current-site-rule.ts`
- Modify: `apps/chrome-extension/src/ui/popup/PopupRuleForm.tsx`
- Modify: `apps/chrome-extension/entrypoints/popup/PopupApp.tsx`

- [ ] **Step 1: 写失败测试，域名层级切换会生成原版五类建议。**

```ts
expect(suggestQuickRules('https://api.x.com/path', 0).hostWildcard).toBe('*.x.com');
expect(suggestQuickRules('https://api.x.com/path', 1).hostWildcard).toBe('*.api.x.com');
```

- [ ] **Step 2: 实现局部规则表单。**

表单包含条件类型、条件内容、层级切换、目标配置、取消、添加；永久规则只有当前自动切换可写时显示。临时规则为当前域名的下拉选择，不出现独立仪表盘表单。

- [ ] **Step 3: 实现快捷键。**

映射：上下/J/K 导航，0 直连，S 系统，1-9 自定义配置，A 添加永久规则，T 临时规则，O 打开选项，R 失败请求，? 显示快捷键提示。输入框聚焦时不拦截。

- [ ] **Step 4: 运行测试并提交。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/original/popup/quick-rule-suggestion.test.ts apps/chrome-extension/src/ui/original/popup/keyboard-shortcuts.test.ts`

Expected: PASS。

Commit: `git commit -m "feat: align popup quick rule interactions"`

## Task 11: 失败请求、网络排查和右键菜单统一入口

**Files:**
- Create: `apps/chrome-extension/src/ui/original/popup/FailureRequestPanel.tsx`
- Create: `apps/chrome-extension/src/ui/original/popup/failure-request-model.ts`
- Create: `apps/chrome-extension/src/ui/original/popup/failure-request-model.test.ts`
- Modify: `apps/chrome-extension/src/ui/components/FailureActionMenu.tsx`
- Modify: `apps/chrome-extension/src/ui/diagnostics/failure-remediation.ts`
- Modify: `apps/chrome-extension/src/runtime/quick-site-rule.ts`
- Modify: `apps/chrome-extension/src/runtime/quick-rule-context-menu.ts`
- Modify: `apps/chrome-extension/entrypoints/background.ts`

- [ ] **Step 1: 写失败测试，失败入口仅在有可操作失败时出现。**

```ts
expect(failurePanelState([])).toEqual({ visible: false });
expect(failurePanelState([failure('cdn.x.com')])).toMatchObject({ visible: true, count: 1 });
```

- [ ] **Step 2: 实现失败域名选择、永久/临时处理与详细排查入口。**

选中的域名使用和当前网站同一建议服务生成规则。重复无效的浏览器噪声错误会折叠，真实代理连接失败保留原因和时间。

- [ ] **Step 3: 让右键菜单使用同一目标和保存服务。**

页面、链接、框架、图片、视频、音频上下文均可创建规则；菜单显示目标配置名称，写入后日志记录来源。

- [ ] **Step 4: 运行测试并提交。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/original/popup/failure-request-model.test.ts apps/chrome-extension/src/runtime/quick-rule-context-menu.test.ts apps/chrome-extension/src/runtime/quick-site-rule.test.ts`

Expected: PASS。

Commit: `git commit -m "feat: unify failed request and context rule actions"`

## Task 12: 视觉、Chrome 端到端与性能验收

**Files:**
- Create: `apps/chrome-extension/e2e/original-options-flow.spec.ts`
- Create: `apps/chrome-extension/e2e/original-popup-flow.spec.ts`
- Modify: `apps/chrome-extension/e2e/options-layout.spec.ts`
- Modify: `apps/chrome-extension/e2e/popup-quick-rule.spec.ts`
- Modify: `apps/chrome-extension/entrypoints/options/style.css`
- Modify: `apps/chrome-extension/entrypoints/popup/style.css`
- Modify: `scripts/check-source-size.mjs` only if a new source root must be included

- [ ] **Step 1: 写选项页端到端失败测试。**

```ts
await page.getByRole('link', { name: '新建配置' }).click();
await page.getByLabel('配置名称').fill('原版流程测试');
await page.getByRole('button', { name: '创建配置' }).click();
await expect(page.getByRole('button', { name: '应用' })).toHaveClass(/is-dirty/);
await page.getByRole('button', { name: '放弃' }).click();
await expect(page.getByText('原版流程测试')).toHaveCount(0);
```

- [ ] **Step 2: 写弹窗端到端失败测试。**

```ts
await expect(popup.getByRole('button', { name: '直接连接' })).toBeVisible();
await popup.getByRole('button', { name: '添加规则' }).click();
await popup.getByLabel('规则条件类型').selectOption('host-wildcard');
await popup.getByRole('button', { name: '添加规则' }).click();
```

- [ ] **Step 3: 实现 CSS。**

以信息密度、列表菜单、Bootstrap 式层级、固定侧栏、页面宽度和弹窗 360px 为视觉契约；不使用当前仪表盘卡片设计。移动或窄窗口时只允许横向滚动，不缩小字体或裁切控件。

- [ ] **Step 4: 运行完整验证。**

Run:

```sh
pnpm format:check
pnpm check
pnpm test
pnpm build
pnpm test:e2e
pnpm benchmark:routing
git diff --check
```

Expected: 全部 PASS；10,000/50,000 规则基准不回退；截图中不存在截断文本、重叠控件、空白弹窗或仪表盘式主入口。

- [ ] **Step 5: 提交并推送。**

```sh
git add apps/chrome-extension docs
git commit -m "feat: reconstruct original ZeroOmega experience"
git push origin main
```

## 自检结论

- 规格中的设置外壳、草稿、配置类型、自动切换、弹窗、快捷规则、临时规则、失败请求、导入和性能验收分别由 Task 1-12 覆盖。
- 文件路径和消息名均使用当前仓库已有的 `ProfileDocumentV2`、`configuration.replace`、`source.refresh`、`profile.activate` 和 Playwright 基础设施。
- 没有使用上游组件、样式或资源；只有可观察的行为和布局层级作为目标。

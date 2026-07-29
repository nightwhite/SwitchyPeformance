# ZeroOmega 体验对齐 Phase 1 Implementation Plan

> **For agentic workers:** Execute inline in the current `SwitchyPeformance` directory. Do not use reference-project code, assets, translations, tests, or styles.

**Goal:** 把 SwitchyPeformance 的设置页和工具栏弹窗改回熟悉的 ZeroOmega 工作方式，同时保留现有高性能路由和排查能力。

**Architecture:** 保持 V2 配置、Rust/WASM 路由、Chrome MV3 后台命令不变。React 只重组界面入口：设置页按“配置树 -> 选中配置 -> 原地编辑”组织，弹窗按“先切换 -> 按需展开规则/临时规则/失败资源”组织。诊断能力保留为额外工具入口，不占用代理切换主流程。

**Tech Stack:** TypeScript、React 19、Chrome Manifest V3、WXT、Rust/WASM、Vitest、Playwright。

---

## 当前实施状态（2026-07-29）

- 已完成：配置深链、配置树、按配置类型原地编辑、自动切换规则原地编辑、弹窗菜单优先流程、当前网站规则表单、临时规则入口、失败资源入口。
- 已完成：新建配置后自动进入该配置；固定代理会原子创建服务器和可切换配置；删除配置时替换引用；删除被引用的代理服务器时可选择删除关联固定代理配置并修复规则引用。
- 已验证：类型检查、Rust 检查、328 个单元测试、全部 14 个 Chrome 端到端测试、10,000 条规则导航回归。
- 待后续：统一草稿的“应用/放弃”、弹窗内直接改自动切换默认目标、配置排序与更多原版快捷操作的逐项视觉对齐。

---

## 审计结论

| 用户动作           | ZeroOmega 的工作方式         | 当前版本的问题                                     | 本轮决定                                             |
| ------------------ | ---------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| 找到一个配置       | 左侧列表直接点配置名         | 先判断该去“配置”“代理服务器”还是“自动切换规则”页面 | 左侧改为内置模式和用户配置的连续列表                 |
| 编辑自动切换       | 配置页面内直接看到规则       | 规则被拆到另一个页面，用户失去上下文               | 选中自动切换配置后原地显示设置和虚拟规则表           |
| 新建模式           | 一个对话框选择模式并填写名称 | 配置和代理服务器分别新建                           | 一个新建入口，固定代理会同时创建代理服务器和固定配置 |
| 快速切换           | 弹窗首先是紧凑的配置菜单     | 弹窗先显示状态卡和多段表单                         | 弹窗默认只显示配置菜单，规则操作按需展开             |
| 加当前网站规则     | 点击“添加规则”后打开预填表单 | 所有规则选项默认同时露出                           | 保留主域/主机/当前页能力，但收进单独表单             |
| 临时规则与失败资源 | 作为当前站点下的快捷菜单     | 变成较重的独立面板                                 | 保留增强能力，改成当前站点菜单的二级动作             |
| 日志排查           | 不妨碍切换主流程             | 被提升为与配置并列的主导航                         | 保留为额外工具入口，且不改变配置编辑路径             |

## 不变边界

- 不复制参考项目的源码、图标、翻译、测试、CSS 或文案；只实现相同的用户行为。
- 不改动 Chrome 代理应用、PAC 编译、规则优先级和 WASM 路由实现。
- 规则列表继续虚拟渲染；新增界面不得把全部规则复制进 React 状态。
- 所有生产源码文件保持在 2,000 行以内。

## Task 1: 建立可深链的配置工作区路由

**Files:**

- Modify: `apps/chrome-extension/src/ui/options-routes.ts`
- Modify: `apps/chrome-extension/src/ui/options-routes.test.ts`
- Test: `apps/chrome-extension/src/ui/options-routes.test.ts`

- [ ] 写失败测试：`#/profile/work` 会解析为配置工作区，旧的 `#/rules` 和 `#/profiles` 仍可以打开对应的兼容入口。
- [ ] 运行：`pnpm vitest run apps/chrome-extension/src/ui/options-routes.test.ts`，确认测试因新路由不存在而失败。
- [ ] 增加独立的路由联合类型和纯解析函数，例如：

```ts
export type OptionRoute =
  { kind: 'profile'; profileId: string } | { kind: 'tool'; page: OptionPage };

export function routeFromOptionsHash(hash: string): OptionRoute {
  // 只解析 URL，不读取 React 或 Chrome 状态。
}
```

- [ ] 重新运行定向测试并确认通过。

## Task 2: 重建设置页左侧的配置树

**Files:**

- Create: `apps/chrome-extension/src/ui/pages/ProfileNavigation.tsx`
- Create: `apps/chrome-extension/src/ui/pages/profile-navigation.test.ts`
- Modify: `apps/chrome-extension/src/ui/pages/V2OptionsApp.tsx`
- Modify: `apps/chrome-extension/entrypoints/options/style.css`
- Test: `apps/chrome-extension/e2e/options-layout.spec.ts`

- [ ] 写失败测试：内置的直连和系统代理固定在配置列表顶部；用户配置按文档顺序显示；点击任何配置生成 `#/profile/<id>`。
- [ ] 运行：`pnpm vitest run apps/chrome-extension/src/ui/pages/profile-navigation.test.ts`，确认失败原因是导航模型尚不存在。
- [ ] 实现 `profileNavigationItems(document)` 纯函数，返回内置项、用户项和工具项；组件只负责渲染该模型。
- [ ] `V2OptionsApp` 使用该导航，不再把“代理配置”“代理服务器”“自动切换规则”拆成同一级入口。
- [ ] 侧栏底部保留“应用/放弃草稿”位置；在草稿事务任务完成前显示当前保存状态，不能伪造尚未实现的撤销能力。
- [ ] 运行定向测试、`pnpm check` 和设置页端到端测试。

## Task 3: 在配置工作区就地编辑所有配置类型

**Files:**

- Create: `apps/chrome-extension/src/ui/pages/ProfileWorkspace.tsx`
- Create: `apps/chrome-extension/src/ui/pages/profile-workspace.test.ts`
- Modify: `apps/chrome-extension/src/ui/pages/V2ProfilesPage.tsx`
- Modify: `apps/chrome-extension/src/ui/pages/V2RulesPage.tsx`
- Modify: `apps/chrome-extension/src/ui/pages/V2ProxyServersPage.tsx`
- Reuse: `FixedProxyEditor.tsx`, `AutoSwitchSettingsEditor.tsx`, `VirtualRuleTable.tsx`, `PacProfileEditor.tsx`, `RuleListProfileEditor.tsx`, `VirtualProfileEditor.tsx`

- [ ] 写失败测试：自动切换配置的工作区模型包含“规则设置”和“规则表”；固定代理配置的工作区模型包含协议路由和代理服务器入口。
- [ ] 运行定向测试，确认工作区模型不存在。
- [ ] 建立按 `profile.kind` 分发的工作区组件。公共标题栏只提供当前配置名称、启用、重命名、复制、删除和返回动作。
- [ ] 把现有规则、固定代理、PAC、规则列表和虚拟配置编辑器作为工作区内容复用，不复制它们的业务校验。
- [ ] 新建入口使用一个模式选择对话框；选择固定代理时调用现有的“代理服务器 + 固定配置”原子创建动作。
- [ ] 运行组件测试、完整类型检查和真实 Chrome 设置页回归。

## Task 4: 将设置更改改为草稿后统一应用

**Files:**

- Create: `apps/chrome-extension/src/ui/configuration/options-draft.ts`
- Create: `apps/chrome-extension/src/ui/configuration/options-draft.test.ts`
- Modify: `apps/chrome-extension/entrypoints/options/OptionsApp.tsx`
- Modify: `apps/chrome-extension/src/ui/pages/V2OptionsApp.tsx`

- [ ] 写失败测试：编辑工作区只更新草稿；点击应用才调用 `configuration.replace`；放弃会恢复后台当前文档。
- [ ] 运行定向测试，确认新草稿服务不存在。
- [ ] 用不可变文档草稿保存设置页改动；账号密码、订阅刷新和导入仍走各自的后台命令，并在界面中明确说明。
- [ ] 在侧栏底部显示“应用更改”和“放弃更改”，并且有改动时才允许操作。
- [ ] 运行完整单元测试、构建和 Chrome 端到端测试。

## Task 5: 重建工具栏弹窗为菜单优先工作流

**Files:**

- Create: `apps/chrome-extension/src/ui/popup/popup-menu-model.ts`
- Create: `apps/chrome-extension/src/ui/popup/popup-menu-model.test.ts`
- Modify: `apps/chrome-extension/entrypoints/popup/PopupApp.tsx`
- Modify: `apps/chrome-extension/entrypoints/popup/style.css`
- Modify: `apps/chrome-extension/e2e/popup-quick-rule.spec.ts`

- [ ] 写失败测试：默认弹窗模型只包含模式菜单；点击“添加当前网站规则”后才显示预填的条件表单；临时规则和失败资源是二级菜单。
- [ ] 运行定向测试，确认菜单状态模型不存在。
- [ ] 实现 `PopupView` 状态机：`menu`、`rule-form`、`temporary-menu`、`failure-list`。每个状态只渲染用户当前需要的内容。
- [ ] 默认菜单先显示直连、系统代理和用户配置；自动切换/虚拟配置可通过小箭头修改默认目标，不改变当前激活配置。
- [ ] 永久规则表单支持现有的主域、主机、当前页范围，预填当前网址；新增规则继续由后台原子命令保存并置顶。
- [ ] 失败资源按域名合并，支持选择永久/临时直连或代理规则和打开路由解释。
- [ ] 运行弹窗端到端测试和 10,000 条规则导航测试。

## Task 6: 补回原版高频辅助操作，并把增强能力放在正确位置

**Files:**

- Modify: `apps/chrome-extension/src/runtime/shortcut-service.ts`
- Modify: `apps/chrome-extension/src/runtime/quick-rule-context-menu.ts`
- Modify: `apps/chrome-extension/src/ui/pages/SettingsPage.tsx`
- Modify: `apps/chrome-extension/src/ui/pages/DiagnosticsPage.tsx`
- Test: 对应现有单元和端到端测试文件

- [ ] 保持当前的配置循环快捷键与右键快捷规则，但让其展示顺序与配置树一致。
- [ ] 把刷新页面、规则插入位置、网络监控、启动模式、外部接管处理放进“通用”设置，而不是分散在仪表盘页。
- [ ] 将诊断、日志导出和路由解释放进“工具”区域；不让它们改变正常切换的默认首屏。
- [ ] 运行完整测试、构建、安装包测试和真实 Chrome 回归。

## 验收线

1. 从设置页左栏可以直接打开任何配置，编辑自动切换时不需要离开配置上下文。
2. 弹窗第一屏是紧凑的配置选择，而不是状态仪表盘或常驻表单。
3. 当前网页规则、临时规则、失败资源修复都通过二级操作完成，新增永久规则在自动切换规则最前面。
4. 日志和路由解释仍存在，但不会干扰普通代理切换。
5. 10,000 条规则的导航不重新编译；规则页继续只渲染可见行。
6. 所有改动经过单元测试、类型检查、构建和 Chrome 扩展端到端测试。

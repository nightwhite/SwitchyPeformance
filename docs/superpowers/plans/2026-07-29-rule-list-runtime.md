# 规则列表运行时 Implementation Plan

**Goal:** 让 V2 规则列表配置可从内嵌文本或远程地址加载、按公开文本格式转换为有序 V2 规则，并在配置变更时编译为 Chrome PAC；网页加载时不读取或扫描订阅文本。

**Clean-room boundary:** 只依据公开格式说明和用户可见行为实现解析器；不复制参考项目代码、测试、翻译、资源或内部数据结构。

**Architecture:** `packages/contracts` 只负责纯文本解析，输出条件、排除语义、行号、可选结果配置名和非敏感警告。后台的 `rule-list-service` 负责取得文本、复用已验证缓存、解析、把活动 `rule-list` 配置替换为短暂的 `auto-switch` 文档，再交给现有 Rust/WASM PAC 编译器。原始配置与已缓存来源互不混写。

## 不变约束

- 规则文本只在保存、切换、手动刷新、定时刷新或用户点击排查时处理；绝不在 `FindProxyForURL` 的网页请求路径处理。
- 本地手工规则优先；订阅中按行顺序匹配；普通规则用“命中后使用”，`!`/`@@` 排除规则用“没有规则命中时”目标。
- 不执行订阅文本中的 JavaScript、表达式或任意 PAC；不能识别的行记录行号与原因并跳过。
- 远程地址沿用 ETag、超时、字节限制、同地址失败保留旧版本、换地址失败不复用旧版本的缓存语义。
- 单个规则列表最大 2 MiB；缓存文本不保存请求头中的密钥。

## Task 1: 纯规则列表解析器

**Files:**

- Create: `packages/contracts/src/rule-list/auto-proxy.ts`
- Create: `packages/contracts/src/rule-list/switchy.ts`
- Create: `packages/contracts/src/rule-list/parse.ts`
- Create: `packages/contracts/src/rule-list/parse.test.ts`
- Modify: `packages/contracts/src/index.ts`

- [x] 写覆盖 AutoProxy、Switchy、排除规则、结果配置、Base64 GFWList、非法行与稳定摘要的失败测试。
- [x] 运行新测试，确认解析器尚不存在时失败。
- [x] 实现纯 TypeScript 解析：支持公开的注释/头部、`||domain`、`@@`、主机和 URL 通配符、常用条件前缀、`@with result` 与 `+配置名`；未知或危险语法只产生警告。
- [x] 运行解析器测试与契约包类型检查。

## Task 2: 规则列表来源与短暂自动切换文档

**Files:**

- Create: `apps/chrome-extension/src/runtime/rule-list-service.ts`
- Create: `apps/chrome-extension/src/runtime/rule-list-service.test.ts`
- Modify: `apps/chrome-extension/src/runtime/source-fetcher.ts`
- Modify: `apps/chrome-extension/src/runtime/source-fetcher.test.ts`

- [x] 写失败测试：内嵌列表、同地址缓存、远程首次下载、失败回退、地址变更隔离、排除行与命中/默认目标、`@with result` 映射、虚拟入口。
- [x] 运行新测试，确认服务尚不存在时失败。
- [x] 在下载器中增加“PAC/规则列表”内容策略；规则列表允许常见文本和二进制下载 MIME，但仍按字节上限和 UTF-8 文本检查。
- [x] 实现来源解析和文档覆盖：仅活动规则列表触网或解析，替换内容只留在内存，`rule-list:<sourceId>` 与 PAC 缓存互相隔离。
- [x] 运行新服务测试。

## Task 3: 接入后台、排查和设置页

**Files:**

- Modify: `apps/chrome-extension/entrypoints/background.ts`
- Modify: `apps/chrome-extension/src/runtime/current-route.ts` or background route dispatch
- Modify: `apps/chrome-extension/src/ui/pages/V2ProfilesPage.tsx`
- Modify: `apps/chrome-extension/src/ui/configuration/advanced-profile-actions.ts`
- Modify: related tests

- [x] 写失败测试：激活规则列表会先编译短暂自动切换文档；下载失败不切换；路由排查使用同一短暂文档；规则列表编辑不允许选择 PAC 无法路由的目标。
- [x] 后台应用链按“临时规则 -> PAC 来源 -> 规则列表来源 -> WASM 编译 -> Chrome 设置”执行，且路由排查复用同一解析链。
- [x] 设置页去掉“待来源编译”的永久禁用状态；首次切换失败显示来源错误且保留当前代理。
- [x] 运行相关 UI/运行时测试与生产构建。

## Task 4: 完整验证、检查点与下一阶段接口

- [x] 运行 `pnpm test`、`pnpm check`、`pnpm format:check`、`cargo fmt --check`、`pnpm build`。
- [x] 检查新增文件都少于 2,000 行，且没有规则文本进入请求热路径。
- [ ] 提交并推送规则列表检查点。
- [ ] 后续 Task 21 用同一来源服务加 Chrome alarms、手动刷新和来源状态界面；不重新实现下载或解析逻辑。

## 执行记录（2026-07-29）

- 解析器与服务均先以缺失模块的失败测试开始；服务测试覆盖内嵌、远程、缓存、失败回退、地址隔离、结果配置和虚拟入口。
- 活动规则列表会在后台转换为内存中的自动切换配置，原配置、规则文本和缓存不会进入 Chrome PAC 的网页请求路径。
- `routing-document-pipeline` 和 `routing-application-service` 保证应用代理与路由排查使用同一份有效配置；来源失败会在 Chrome 设置写入之前中断，已有代理继续保留。
- 规则列表编辑只允许直连、固定代理及其可解析别名作为命中或默认目标；界面不再把规则列表永久禁用。
- 门禁结果：`pnpm test` 63 个文件、229 条测试通过；`pnpm check`、`pnpm format:check`、`cargo fmt --check`、`pnpm build` 均通过。生产构建生成 Chrome MV3 包，总大小 2.79 MB。

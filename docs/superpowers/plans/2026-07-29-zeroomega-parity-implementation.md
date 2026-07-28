# ZeroOmega 功能对齐与高性能重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不使用任何参考项目代码、资源、翻译或测试的前提下，完成一个只支持 Chrome 的高性能代理配置扩展；它覆盖 ZeroOmega 用户可见的核心工作流，同时把自动切换的规则编译移出网页加载路径，并提供更可用的日志与路由解释。

**Architecture:** 配置升级为版本化的 V2 文档：配置、代理服务器、规则来源、临时规则和运行设置各自有明确的数据结构。Rust/WASM 只在配置变更、订阅更新或临时规则变化时编译不可变路由计划；Chrome 在真正加载网页时只执行已生成的 PAC 或固定代理配置。React 界面只通过后台命令读写配置，避免页面直接改 Chrome 代理状态。

**Tech Stack:** TypeScript、React 19、Chrome Manifest V3、WXT、Rust、WebAssembly、Vitest、Cargo test、Playwright（Chrome 扩展端到端验证）。

---

## 目标边界

### 必须完成的用户能力

| 范围       | 目标行为                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------- |
| 配置类型   | 直连、系统、固定代理、PAC、自动检测、自动切换、规则列表、虚拟配置                                 |
| 代理       | HTTP、HTTPS、SOCKS4、SOCKS5；按协议分别设置代理；绕过规则；本地账号密码                           |
| 条件       | 主机通配符、主机正则、主机层级、IP/CIDR、网址通配符、网址正则、关键字、绕过、时段、星期、永不匹配 |
| 快捷操作   | 弹窗切换、当前网站永久规则、临时规则、失败资源规则、右键菜单、快捷键                              |
| 数据来源   | PAC 地址、PAC 文件、规则列表地址、规则列表文本、自动刷新、自定义请求头                            |
| 数据管理   | 导入、导出、旧备份迁移、在线恢复、Chrome 同步、Gist、WebDAV、冲突处理                             |
| 运行与排查 | 代理认证、外部代理状态、请求监控、失败说明、路由解释、性能指标、可导出日志                        |

### 明确不做的内容

- 不支持 Firefox，也不为 Firefox 写兼容层。
- 不安装原生程序、本地服务、守护进程、SQLite 数据库或任何本机辅助程序。
- 不把代理连接、DNS 代理或流量转发搬到扩展里；Chrome 和用户已有代理服务器负责连接。
- 不复制或改写 ZeroOmega、SwitchyOmega、Proxy SwitchyOmega 3 的代码、资源、文案、翻译、测试或构建文件。
- 不在网页每一次请求时让扩展扫描全部规则；自动切换只执行已编译结果。

### 不能破坏的性能规则

1. 配置变更时才重建路由计划；普通网页请求不能让服务工作线程扫描规则数组。
2. 主机精确匹配和主机后缀匹配必须先走索引；复杂条件保持用户原有顺序作为后备路径。
3. PAC 中不得对每个请求反复解析正则、订阅文本或 JSON。
4. 记录日志必须限量、去重、可关闭；监控默认不把所有成功请求永久保存。
5. 规则数为 10,000、50,000 时，设置页虚拟列表只渲染可见行；保存后编译一次，网页加载时不重新编译。
6. 需要 DNS 的 IP/CIDR PAC 条件必须在界面和路由解释中标明，因为它可能拖慢匹配；普通域名规则不调用 DNS。

### 当前差距基线

| 功能组     | 当前状态                        | 本计划结果                                          |
| ---------- | ------------------------------- | --------------------------------------------------- |
| 配置模型   | 4 种配置、3 种规则条件、V1 文档 | V2 文档、8 种配置、完整条件并可迁移 V1              |
| 固定代理   | 单个 `singleProxy`              | HTTP/HTTPS/FTP/默认代理、绕过和账号绑定             |
| 自动切换   | 主机精确、后缀、网址通配符      | 全部条件、规则来源、临时规则、明确解释              |
| 弹窗       | 选配置和简单永久规则            | 当前页规则、临时规则、失败资源、配置状态、快捷切换  |
| 导入       | 部分旧 JSON/`.bak`              | 分类型迁移、预览、警告、可回滚导入                  |
| 订阅与同步 | 未完成                          | PAC、规则列表、刷新、Chrome 同步、Gist、WebDAV      |
| 日志       | 失败请求和配置事件              | 限量请求时间线、按标签页诊断、路由和性能解释        |
| 测试       | 单元与构建检查                  | 单元、契约、Chrome 端到端、代理认证、负载和恢复测试 |

## 文件结构和责任划分

每个生产文件保持在 2,000 行以下；页面组件和后台职责拆开。下面列出的路径是后续任务的固定边界。

| 路径                                                         | 责任                                       |
| ------------------------------------------------------------ | ------------------------------------------ |
| `packages/contracts/src/config/targets.ts`                   | 配置目标、内置配置 ID、配置引用            |
| `packages/contracts/src/config/profiles.ts`                  | 八种配置类型和代理服务器映射               |
| `packages/contracts/src/config/conditions.ts`                | 条件联合类型和条件输入校验                 |
| `packages/contracts/src/config/sources.ts`                   | PAC/规则列表来源、刷新和请求头配置         |
| `packages/contracts/src/config/document.ts`                  | V2 文档、解析入口、共享默认值              |
| `packages/contracts/src/config/validate.ts`                  | 引用、循环、端口、条件和来源校验           |
| `packages/contracts/src/migrations/v1-to-v2.ts`              | 现有 V1 配置的无损升级                     |
| `packages/contracts/src/import/legacy-backup.ts`             | 独立实现的旧备份数据读取和迁移报告         |
| `crates/config-model/src/*.rs`                               | Rust 侧与 TypeScript 同步的标准化模型      |
| `crates/routing-core/src/*.rs`                               | 条件匹配、配置图解析、路由解释和索引       |
| `crates/pac-compiler/src/*.rs`                               | PAC 文本生成、代理协议映射和大小保护       |
| `apps/chrome-extension/src/runtime/configuration-service.ts` | 原子保存、校验、编译、应用和恢复           |
| `apps/chrome-extension/src/runtime/source-*.ts`              | 订阅获取、解析、定时刷新和状态保存         |
| `apps/chrome-extension/src/runtime/temporary-*.ts`           | 临时规则、过期和标签页范围                 |
| `apps/chrome-extension/src/runtime/network-*.ts`             | 请求监控、限量事件、标签页摘要和失败原因   |
| `apps/chrome-extension/src/runtime/messages/*.ts`            | 经过版本化的界面后台命令                   |
| `apps/chrome-extension/src/ui/pages/*.tsx`                   | 设置页各独立页面，避免巨型组件             |
| `apps/chrome-extension/src/ui/components/*.tsx`              | 配置编辑器、规则编辑器、来源状态和日志组件 |
| `apps/chrome-extension/e2e/*.spec.ts`                        | 真实 Chrome 扩展、固定代理和恢复流程验证   |

## 夜间持续推进循环

本次目标模式采用当前会话逐任务推进，不使用子代理。每一个勾选框都必须按这个循环处理，不能先堆一批代码再一起猜哪里错了。

1. 选择最靠前且依赖已经满足的未完成任务。
2. 先写失败测试，运行该测试并确认它确实失败。
3. 只实现让测试通过的最小代码；不顺便改无关模块。
4. 运行该任务的测试、`pnpm check`、`pnpm test`、`pnpm format:check`；改动 Rust 时再运行 `cargo fmt --check`。
5. 改动扩展运行时、权限或界面入口时，运行 `pnpm build`，并用加载后的 Chrome 扩展完成相应手动或 Playwright 验证。
6. 检查 `git status --short`，确认 `.reference/` 没有进入暂存区；提交一个可回滚的 Git 提交并推送。
7. 在本文件勾选完成项，记录实际测试命令和结果；然后继续下一项。

## 里程碑顺序

```text
M0 配置底座 ──> M1 路由引擎 ──> M2 配置管理界面
                                  └─> M3 弹窗、临时规则、右键操作
M1 + M2 ──> M4 PAC/规则列表/更新 ──> M5 监控、导入导出、同步
所有阶段 ──> M6 真实 Chrome、代理认证和性能验收
```

下面每个任务都可以单独提交、安装和验证。任务顺序不可颠倒：界面不能先于数据模型，订阅不能先于规则引擎，同步不能先于稳定的 V2 配置格式。

## M0：配置模型、迁移和配置生命周期

### Task 1: 建立 V2 配置公共类型

**Files:**

- Create: `packages/contracts/src/config/targets.ts`
- Create: `packages/contracts/src/config/profiles.ts`
- Create: `packages/contracts/src/config/conditions.ts`
- Create: `packages/contracts/src/config/sources.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/config/profiles.test.ts`
- Test: `packages/contracts/src/config/conditions.test.ts`

- [x] **Step 1: 写出失败的配置类型契约测试。**

```ts
import { describe, expect, it } from 'vitest';
import { BUILTIN_PROFILE_IDS, isProfileTarget } from './targets.ts';

describe('V2 配置目标', () => {
  it('只接受已声明的配置 ID 引用', () => {
    expect(BUILTIN_PROFILE_IDS).toEqual({ direct: 'direct', system: 'system' });
    expect(isProfileTarget({ profileId: 'work-proxy' })).toBe(true);
    expect(isProfileTarget({ kind: 'proxy', proxyId: 'old-shape' })).toBe(false);
  });
});
```

- [x] **Step 2: 运行测试确认失败。**

Run: `pnpm vitest run packages/contracts/src/config/profiles.test.ts packages/contracts/src/config/conditions.test.ts`

Expected: FAIL，原因是 `targets.ts` 和 V2 导出尚不存在。

- [x] **Step 3: 实现最小公共类型。**

```ts
export const BUILTIN_PROFILE_IDS = { direct: 'direct', system: 'system' } as const;

export interface ProfileTarget {
  profileId: string;
}

export type ProfileKind =
  | 'direct'
  | 'system'
  | 'fixed-proxy'
  | 'pac'
  | 'auto-detect'
  | 'auto-switch'
  | 'rule-list'
  | 'virtual';

export function isProfileTarget(value: unknown): value is ProfileTarget {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).profileId === 'string' &&
    (value as Record<string, unknown>).profileId.trim().length > 0
  );
}
```

在 `profiles.ts` 定义 `ProxyServer`、`FixedProxyProfile`、`PacProfile`、`AutoDetectProfile`、`AutoSwitchProfile`、`RuleListProfile`、`VirtualProfile`；固定代理的协议映射使用 `fallbackProxyId`、`httpProxyId`、`httpsProxyId`、`ftpProxyId`，而不是把四套地址塞进一个字符串。

- [x] **Step 4: 运行类型和单元测试。**

Run: `pnpm vitest run packages/contracts/src/config/profiles.test.ts packages/contracts/src/config/conditions.test.ts && pnpm check:ts`

Expected: PASS。

- [x] **Step 5: 提交公共类型。**

```bash
git add packages/contracts/src
git commit -m "feat: add v2 proxy configuration contracts"
```

**执行记录（2026-07-29）：** 先运行定向测试，6 项测试按预期因 V2 导出不存在而失败；实现后定向测试 6/6 通过，完整测试 24 个文件、62 项测试通过，`pnpm check` 和 `pnpm format:check` 通过。

### Task 2: 定义完整条件模型和确定性验证

**Files:**

- Modify: `packages/contracts/src/config/conditions.ts`
- Create: `packages/contracts/src/config/condition-validation.ts`
- Test: `packages/contracts/src/config/condition-validation.test.ts`

- [x] **Step 1: 写出失败测试，覆盖每种条件和错误输入。**

```ts
const accepted = [
  { type: 'host-wildcard', pattern: '*.example.com' },
  { type: 'host-regex', pattern: '(^|\\.)example\\.com$' },
  { type: 'host-levels', min: 2, max: 4 },
  { type: 'ip-cidr', address: '10.0.0.0', prefixLength: 8 },
  { type: 'url-wildcard', pattern: '*://example.com/*' },
  { type: 'url-regex', pattern: '^https://example\\.com/' },
  { type: 'keyword', value: 'example' },
  { type: 'bypass', value: true },
  { type: 'time-range', startMinute: 540, endMinute: 1020 },
  { type: 'weekday', days: [1, 2, 3, 4, 5] },
  { type: 'never' }
] as const;

for (const condition of accepted) {
  expect(validateCondition(condition)).toEqual({ ok: true });
}
expect(validateCondition({ type: 'ip-cidr', address: '10.0.0.1', prefixLength: 40 })).toMatchObject(
  { ok: false }
);
```

- [x] **Step 2: 运行失败测试。**

Run: `pnpm vitest run packages/contracts/src/config/condition-validation.test.ts`

Expected: FAIL，`validateCondition` 尚未存在。

- [x] **Step 3: 实现条件联合类型和校验函数。**

```ts
export type RuleCondition =
  | { type: 'host-wildcard'; pattern: string }
  | { type: 'host-regex'; pattern: string }
  | { type: 'host-levels'; min: number; max?: number }
  | { type: 'ip-cidr'; address: string; prefixLength: number }
  | { type: 'url-wildcard'; pattern: string }
  | { type: 'url-regex'; pattern: string }
  | { type: 'keyword'; value: string }
  | { type: 'bypass'; value: boolean }
  | { type: 'time-range'; startMinute: number; endMinute: number }
  | { type: 'weekday'; days: readonly number[] }
  | { type: 'never' };
```

校验必须拒绝空字符串、非法正则、非法 IPv4/IPv6 前缀、非 0-1439 的分钟值和不在 0-6 范围内的星期值。正则只做语法校验，不执行用户给的正则；执行留给 Rust 路由核心。

- [x] **Step 4: 运行测试与格式检查。**

Run: `pnpm vitest run packages/contracts/src/config/condition-validation.test.ts && pnpm format:check`

Expected: PASS。

- [x] **Step 5: 提交条件模型。**

```bash
git add packages/contracts/src/config
git commit -m "feat: define advanced routing conditions"
```

**执行记录（2026-07-29）：** 先运行验证测试，4 项测试按预期因 `validateCondition` 不存在而失败；实现后覆盖 11 种条件、IPv4/IPv6 CIDR、正则、时间和星期输入。完整测试 25 个文件、66 项测试通过，`pnpm check` 和 `pnpm format:check` 通过。

### Task 3: 实现 V2 文档解析、引用校验和循环检测

**Files:**

- Create: `packages/contracts/src/config/document.ts`
- Create: `packages/contracts/src/config/validate.ts`
- Modify: `packages/contracts/src/profile-document.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/config/document.test.ts`
- Test: `packages/contracts/src/config/validate.test.ts`

- [x] **Step 1: 为未知引用、虚拟配置循环和内置配置删除写失败测试。**

```ts
it('拒绝虚拟配置形成的循环', () => {
  const result = parseProfileDocumentV2({
    schemaVersion: 2,
    activeProfileId: 'a',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      { id: 'a', kind: 'virtual', name: 'A', target: { profileId: 'b' } },
      { id: 'b', kind: 'virtual', name: 'B', target: { profileId: 'a' } }
    ],
    proxyServers: [],
    ruleSources: [],
    settings: defaultRuntimeSettings()
  });
  expect(result).toMatchObject({ ok: false, issues: [{ code: 'profile-cycle' }] });
});
```

- [x] **Step 2: 运行失败测试。**

Run: `pnpm vitest run packages/contracts/src/config/document.test.ts packages/contracts/src/config/validate.test.ts`

Expected: FAIL，V2 解析器尚不存在。

- [x] **Step 3: 实现 V2 文档和校验边界。**

```ts
export interface ProfileDocumentV2 {
  schemaVersion: 2;
  activeProfileId: string;
  profiles: readonly Profile[];
  proxyServers: readonly ProxyServer[];
  ruleSources: readonly RuleSource[];
  settings: RuntimeSettings;
}

export type ProfileDocumentIssueCode =
  | 'invalid-document'
  | 'invalid-profile'
  | 'invalid-condition'
  | 'unknown-profile-reference'
  | 'unknown-proxy-reference'
  | 'unknown-source-reference'
  | 'profile-cycle'
  | 'reserved-profile-id';
```

`validateProfileGraph` 必须用深度优先遍历标出循环；只有 `direct` 和 `system` 可以使用保留 ID；删除前由同一校验器返回所有引用者，供界面决定替换、删除引用或取消。

- [x] **Step 4: 运行完整 contracts 测试。**

Run: `pnpm vitest run packages/contracts/src && pnpm check:ts`

Expected: PASS。

- [x] **Step 5: 提交 V2 文档。**

```bash
git add packages/contracts/src
git commit -m "feat: validate versioned profile documents"
```

**执行记录（2026-07-29）：** 先运行文档测试，5 项测试按预期因 `parseProfileDocumentV2` 不存在而失败；实现后覆盖有效文档、未知配置引用、未知代理/来源引用、内置模式缺失和虚拟配置循环。完整测试 26 个文件、71 项测试通过，`pnpm check` 和 `pnpm format:check` 通过。

### Task 4: 将现有 V1 配置安全迁移到 V2

**Files:**

- Create: `packages/contracts/src/migrations/v1-to-v2.ts`
- Modify: `packages/contracts/src/profile-document.ts`
- Modify: `packages/contracts/src/legacy-import.ts`
- Test: `packages/contracts/src/migrations/v1-to-v2.test.ts`
- Test: `packages/contracts/src/legacy-import.test.ts`

- [ ] **Step 1: 写出 V1 自动切换和固定代理迁移失败测试。**

```ts
it('将 V1 的代理目标迁移为固定配置目标，且保留规则顺序', () => {
  const result = migrateV1Document(v1Fixture);
  expect(result.value.schemaVersion).toBe(2);
  expect(result.value.profiles.find((profile) => profile.kind === 'auto-switch')).toMatchObject({
    rules: [{ target: { profileId: 'migrated-fixed-work' } }]
  });
});
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run packages/contracts/src/migrations/v1-to-v2.test.ts`

Expected: FAIL，`migrateV1Document` 尚未存在。

- [ ] **Step 3: 实现不丢失数据的迁移报告。**

```ts
export interface MigrationResult {
  value: ProfileDocumentV2;
  warnings: readonly string[];
}

export function migrateV1Document(input: ProfileDocument): MigrationResult {
  // 每个 V1 proxy 变成 ProxyServer；每个固定代理变成 FixedProxyProfile。
  // V1 direct/system 目标变为 profileId 引用；规则维持原数组顺序。
}
```

旧备份中无法精确表达的字段不得静默猜测：写入中文警告，导入预览必须显示。账号密码继续不从旧备份读取，避免把未知来源的密钥写入本地。

- [ ] **Step 4: 运行迁移和原有导入测试。**

Run: `pnpm vitest run packages/contracts/src/migrations/v1-to-v2.test.ts packages/contracts/src/legacy-import.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交迁移。**

```bash
git add packages/contracts/src
git commit -m "feat: migrate v1 configurations to v2"
```

### Task 5: 后台配置保存变为原子事务

**Files:**

- Create: `apps/chrome-extension/src/runtime/configuration-service.ts`
- Modify: `apps/chrome-extension/src/runtime/configuration-repository.ts`
- Modify: `apps/chrome-extension/src/runtime/apply-configuration.ts`
- Modify: `apps/chrome-extension/src/runtime/background-service.ts`
- Test: `apps/chrome-extension/src/runtime/configuration-service.test.ts`

- [ ] **Step 1: 写出“新配置编译失败时旧配置继续有效”的失败测试。**

```ts
it('编译失败时保留已应用配置', async () => {
  const service = createConfigurationService({ repository, compiler, applier });
  await service.replace(validDocument);
  compiler.compile.mockRejectedValueOnce(new Error('invalid regex'));
  await expect(service.replace(invalidDocument)).rejects.toThrow('invalid regex');
  expect(applier.apply).toHaveBeenLastCalledWith(validDocument, expect.anything());
  expect(await repository.read()).toEqual(validDocument);
});
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/configuration-service.test.ts`

Expected: FAIL，事务服务尚不存在。

- [ ] **Step 3: 实现保存顺序。**

```ts
export async function replaceConfiguration(candidate: unknown): Promise<BackgroundState> {
  const document = parseAndMigrate(candidate);
  const compiled = await compiler.compile(document);
  await applier.apply(document, compiled);
  await repository.write(document);
  return stateFrom(document, compiled);
}
```

编译、Chrome 应用、持久化三步任一失败时，恢复最后一个已应用的 Chrome 设置并保留旧持久化文档；诊断中写一条配置错误事件。

- [ ] **Step 4: 运行后台回归测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/configuration-service.test.ts apps/chrome-extension/src/runtime/apply-configuration.test.ts apps/chrome-extension/src/runtime/background-service.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交配置事务。**

```bash
git add apps/chrome-extension/src/runtime
git commit -m "feat: apply configuration changes atomically"
```

## M1：Rust/WASM 路由核心和 Chrome 代理映射

### Task 6: 在 Rust 中实现 V2 标准化和条件匹配器

**Files:**

- Create: `crates/config-model/src/conditions.rs`
- Create: `crates/config-model/src/profiles.rs`
- Modify: `crates/config-model/src/lib.rs`
- Create: `crates/routing-core/src/matcher.rs`
- Create: `crates/routing-core/src/model.rs`
- Modify: `crates/routing-core/src/lib.rs`
- Test: `crates/routing-core/tests/condition_contract.rs`

- [ ] **Step 1: 写出主机、网址、时间、星期和 IP/CIDR 的 Rust 失败测试。**

```rust
#[test]
fn host_suffix_matches_only_the_domain_or_a_subdomain() {
    assert!(matches_host_suffix("api.example.com", "example.com"));
    assert!(matches_host_suffix("example.com", "example.com"));
    assert!(!matches_host_suffix("notexample.com", "example.com"));
}

#[test]
fn time_range_wraps_across_midnight() {
    assert!(matches_time_range(23 * 60, 22 * 60, 2 * 60));
    assert!(matches_time_range(1 * 60, 22 * 60, 2 * 60));
    assert!(!matches_time_range(12 * 60, 22 * 60, 2 * 60));
}
```

- [ ] **Step 2: 运行失败测试。**

Run: `cargo test -p routing-core --test condition_contract`

Expected: FAIL，匹配模块尚不存在。

- [ ] **Step 3: 实现纯函数匹配器。**

```rust
pub struct RouteRequest<'a> {
    pub url: &'a str,
    pub host: &'a str,
    pub weekday: u8,
    pub minute_of_day: u16,
}

pub enum ConditionMatch {
    Match,
    NoMatch,
    RequiresPacDns,
}
```

主机、网址、关键字、时段和星期都在纯 Rust 中确定；IP/CIDR 在输入是字面 IP 时立即判断。对域名 IP/CIDR，返回 `RequiresPacDns`，由 PAC 生成器只在该条规则被执行到时产生 `isInNet`，并把风险回传到解释结果。

- [ ] **Step 4: 运行 Rust 格式与测试。**

Run: `cargo fmt --check && cargo test -p routing-core --test condition_contract`

Expected: PASS。

- [ ] **Step 5: 提交 Rust 条件核心。**

```bash
git add crates/config-model crates/routing-core
git commit -m "feat: add rust condition matcher"
```

### Task 7: 构建有序规则计划和主机索引

**Files:**

- Create: `crates/routing-core/src/plan.rs`
- Create: `crates/routing-core/src/index.rs`
- Modify: `crates/routing-core/src/lib.rs`
- Test: `crates/routing-core/tests/routing_plan_contract.rs`

- [ ] **Step 1: 写出规则顺序和索引不会改变结果的失败测试。**

```rust
#[test]
fn exact_and_suffix_indexes_preserve_first_matching_rule_order() {
    let plan = compile_plan(&fixture_with_overlapping_rules()).unwrap();
    assert_eq!(plan.explain("https://api.example.com/a").matched_rule_id.as_deref(), Some("rule-2"));
}

#[test]
fn complex_rule_before_indexed_rule_keeps_its_priority() {
    let plan = compile_plan(&fixture_with_regex_before_suffix()).unwrap();
    assert_eq!(plan.explain("https://api.example.com/a").matched_rule_id.as_deref(), Some("regex-first"));
}
```

- [ ] **Step 2: 运行失败测试。**

Run: `cargo test -p routing-core --test routing_plan_contract`

Expected: FAIL，`compile_plan` 尚未建立索引。

- [ ] **Step 3: 实现不改变顺序的索引策略。**

```rust
pub struct CompiledRoutingPlan {
    pub ordered_rules: Vec<CompiledRule>,
    pub exact_host_candidates: HashMap<String, Vec<usize>>,
    pub suffix_host_candidates: SuffixIndex,
    pub complex_rule_indices: Vec<usize>,
}
```

每个索引只缩小候选集合，最终按原始规则序号比较；不能因为规则可索引就越过排在前面的复杂规则。该约束保证高性能和用户配置语义同时成立。

- [ ] **Step 4: 运行路由核心测试。**

Run: `cargo test -p routing-core && cargo fmt --check`

Expected: PASS。

- [ ] **Step 5: 提交路由计划。**

```bash
git add crates/routing-core
git commit -m "feat: compile ordered indexed routing plans"
```

### Task 8: 扩展 PAC 编译器支持 V2 配置和所有代理协议

**Files:**

- Create: `crates/pac-compiler/src/proxy.rs`
- Create: `crates/pac-compiler/src/conditions.rs`
- Modify: `crates/pac-compiler/src/lib.rs`
- Test: `crates/pac-compiler/tests/v2_pac_contract.rs`
- Test: `crates/pac-compiler/tests/large_rule_contract.rs`

- [ ] **Step 1: 写出代理映射和失败兜底的失败测试。**

```rust
#[test]
fn emits_protocol_specific_proxy_chain_and_direct_fallback() {
    let pac = compile_pac(&v2_auto_switch_fixture()).unwrap().pac_script;
    assert!(pac.contains("PROXY http-proxy.example:8080"));
    assert!(pac.contains("HTTPS https-proxy.example:8443"));
    assert!(pac.contains("SOCKS5 socks.example:1080"));
    assert!(pac.contains("; DIRECT"));
}
```

- [ ] **Step 2: 运行失败测试。**

Run: `cargo test -p pac-compiler --test v2_pac_contract`

Expected: FAIL，V2 配置和多协议输出尚未支持。

- [ ] **Step 3: 生成可预测的 PAC。**

```rust
fn pac_proxy_token(server: &ProxyServer) -> String {
    match server.scheme.as_str() {
        "http" => format!("PROXY {}:{}", server.host, server.port),
        "https" => format!("HTTPS {}:{}", server.host, server.port),
        "socks4" => format!("SOCKS4 {}:{}", server.host, server.port),
        "socks5" => format!("SOCKS5 {}:{}", server.host, server.port),
        _ => unreachable!("validated ProxyServer scheme"),
    }
}
```

生成器必须输出内联索引和按顺序的后备条件；禁止把原始规则列表 JSON 塞入 PAC 后在请求时循环解析。输出包括 `compile_ms`、`pac_bytes`、`indexed_rule_count`、`complex_rule_count` 和 `dns_sensitive_rule_count`。

- [ ] **Step 4: 执行正常与大规则测试。**

Run: `cargo test -p pac-compiler --test v2_pac_contract --test large_rule_contract && cargo fmt --check`

Expected: PASS，50,000 条测试只验证编译和 PAC 大小，不将浏览器加载时间伪装为测量结果。

- [ ] **Step 5: 提交 PAC 编译器。**

```bash
git add crates/pac-compiler
git commit -m "feat: compile v2 profiles into optimized pac"
```

### Task 9: 处理固定代理、PAC、自动检测和虚拟配置的 Chrome 设置

**Files:**

- Modify: `apps/chrome-extension/src/runtime/proxy-setting.ts`
- Modify: `apps/chrome-extension/src/runtime/chrome-proxy.ts`
- Create: `apps/chrome-extension/src/runtime/profile-resolution.ts`
- Test: `apps/chrome-extension/src/runtime/proxy-setting-v2.test.ts`
- Test: `apps/chrome-extension/src/runtime/profile-resolution.test.ts`

- [ ] **Step 1: 写出各配置类型对应 Chrome 模式的失败测试。**

```ts
expect(proxySettingFor(document, 'direct')).toEqual({ mode: 'direct' });
expect(proxySettingFor(document, 'system')).toEqual({ mode: 'system' });
expect(proxySettingFor(document, 'auto-detect')).toEqual({ mode: 'auto_detect' });
expect(proxySettingFor(document, 'fixed')).toMatchObject({
  mode: 'fixed_servers',
  rules: { proxyForHttp: expect.anything(), proxyForHttps: expect.anything() }
});
expect(proxySettingFor(document, 'pac')).toMatchObject({ mode: 'pac_script' });
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/proxy-setting-v2.test.ts apps/chrome-extension/src/runtime/profile-resolution.test.ts`

Expected: FAIL，当前只支持单一固定代理和四种配置。

- [ ] **Step 3: 实现配置解析与 Chrome 映射。**

```ts
export function resolveProfileTarget(document: ProfileDocumentV2, target: ProfileTarget): Profile {
  // 跟随 virtual 配置；发现循环时抛出已验证的 profile-cycle 错误。
}

export function proxySettingFor(
  document: ProfileDocumentV2,
  profileId: string
): ChromeProxySetting {
  // direct -> direct；system -> system；auto-detect -> auto_detect；
  // fixed -> fixed_servers；pac / auto-switch / rule-list -> pac_script。
}
```

PAC 网址使用 `pac_url`；脚本与自动切换使用 `pac_script`；虚拟配置只在解析阶段存在，不能直接传给 Chrome。固定代理绕过列表始终加上本机回环地址，除非用户在“高级设置”明确开启回环规则覆盖。

- [ ] **Step 4: 运行代理设置回归测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/proxy-setting*.test.ts apps/chrome-extension/src/runtime/profile-resolution.test.ts && pnpm check`

Expected: PASS。

- [ ] **Step 5: 提交 Chrome 映射。**

```bash
git add apps/chrome-extension/src/runtime
git commit -m "feat: apply all v2 profile modes in chrome"
```

### Task 10: 公开 WASM 路由解释和编译性能数据

**Files:**

- Modify: `crates/routing-wasm/src/lib.rs`
- Modify: `apps/chrome-extension/src/runtime/wasm-compiler.ts`
- Modify: `apps/chrome-extension/src/runtime/route-explainer.ts`
- Test: `crates/routing-wasm/tests/wasm_contract.rs`
- Test: `apps/chrome-extension/src/runtime/route-explainer.test.ts`

- [ ] **Step 1: 写出解释结果必须包含命中配置、规则和性能数据的失败测试。**

```ts
expect(explainRoute(compiled, 'https://x.com/i/api/1.1')).toMatchObject({
  activeProfileId: 'auto',
  resolvedProfileId: 'proxy-us',
  matchedRuleId: 'x-rule',
  decision: 'proxy',
  compilation: { indexedRuleCount: expect.any(Number) }
});
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/route-explainer.test.ts && cargo test -p routing-wasm --test wasm_contract`

Expected: FAIL，当前解释结果没有 V2 解析路径和完整指标。

- [ ] **Step 3: 实现稳定的解释数据。**

```ts
export interface RouteExplanation {
  activeProfileId: string;
  resolvedProfileId: string;
  matchedRuleId?: string;
  decision: 'direct' | 'system' | 'proxy' | 'pac' | 'auto-detect';
  reason: string;
  warnings: readonly string[];
  compilation: CompilationMetrics;
}
```

错误和警告使用结构化代码，由界面翻译成中文；不要把 Rust 错误字符串直接展示给用户。

- [ ] **Step 4: 构建 WASM 并运行全量测试。**

Run: `pnpm build:wasm && pnpm test`

Expected: PASS。

- [ ] **Step 5: 提交路由解释。**

```bash
git add crates/routing-wasm apps/chrome-extension/src/runtime
git commit -m "feat: expose v2 route explanations"
```

## M2：配置管理、编辑器和完整规则界面

### Task 11: 拆分设置页并建立配置管理页面框架

**Files:**

- Create: `apps/chrome-extension/src/ui/pages/OverviewPage.tsx`
- Create: `apps/chrome-extension/src/ui/pages/ProfileListPage.tsx`
- Create: `apps/chrome-extension/src/ui/pages/ProxyServersPage.tsx`
- Create: `apps/chrome-extension/src/ui/pages/RulesPage.tsx`
- Create: `apps/chrome-extension/src/ui/pages/DiagnosticsPage.tsx`
- Create: `apps/chrome-extension/src/ui/pages/DataPage.tsx`
- Create: `apps/chrome-extension/src/ui/pages/SettingsPage.tsx`
- Create: `apps/chrome-extension/src/ui/pages/routes.ts`
- Modify: `apps/chrome-extension/entrypoints/options/OptionsApp.tsx`
- Modify: `apps/chrome-extension/entrypoints/options/style.css`
- Test: `apps/chrome-extension/src/ui/options-routes.test.ts`

- [ ] **Step 1: 写出 hash 路由和窄屏不裁切的失败测试。**

```ts
expect(pageFromHash('#/profiles')).toBe('profiles');
expect(pageFromHash('#/unknown')).toBe('overview');
expect(optionsViewportStyle()).toMatchObject({ minWidth: '760px', overflowX: 'auto' });
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/options-routes.test.ts`

Expected: FAIL，当前页面路由和样式集中在单个组件中。

- [ ] **Step 3: 拆分页面并保留完整宽度。**

```tsx
export const OPTION_PAGES = [
  'overview',
  'profiles',
  'proxy-servers',
  'rules',
  'diagnostics',
  'data',
  'settings'
] as const;

export function OptionsApp() {
  const page = pageFromHash(window.location.hash);
  return <OptionsLayout page={page} />;
}
```

设置页的工作区最小宽度为 760px；当窗口更窄时显示横向滚动条，不能把内容压缩成截图中无法操作的细条。所有用户可见文本为中文，图标按钮必须有 `title` 和可访问名称。

- [ ] **Step 4: 运行界面测试与生产构建。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/options-routes.test.ts && pnpm build`

Expected: PASS。

- [ ] **Step 5: 提交设置页结构。**

```bash
git add apps/chrome-extension/entrypoints/options apps/chrome-extension/src/ui/pages
git commit -m "refactor: split options pages by responsibility"
```

### Task 12: 实现配置新增、重命名、复制、排序和安全删除

**Files:**

- Create: `apps/chrome-extension/src/ui/configuration/profile-actions.ts`
- Create: `apps/chrome-extension/src/ui/components/ProfileDeleteDialog.tsx`
- Create: `apps/chrome-extension/src/ui/components/ProfileList.tsx`
- Modify: `apps/chrome-extension/src/runtime/messages.ts`
- Modify: `apps/chrome-extension/src/runtime/background-service.ts`
- Modify: `apps/chrome-extension/src/ui/pages/ProfileListPage.tsx`
- Test: `apps/chrome-extension/src/ui/configuration/profile-actions.test.ts`
- Test: `apps/chrome-extension/src/runtime/profile-command.test.ts`

- [ ] **Step 1: 写出删除被引用配置时必须先选择替代项的失败测试。**

```ts
const result = planProfileDeletion(document, 'proxy-us');
expect(result).toMatchObject({
  allowed: false,
  references: [{ ownerProfileId: 'auto', field: 'rules[0].target' }]
});
expect(
  replaceAndDeleteProfile(document, 'proxy-us', 'direct').profiles.some((p) => p.id === 'proxy-us')
).toBe(false);
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/configuration/profile-actions.test.ts apps/chrome-extension/src/runtime/profile-command.test.ts`

Expected: FAIL，当前删除逻辑只处理少数代理引用。

- [ ] **Step 3: 实现后台命令和编辑动作。**

```ts
export type ProfileCommand =
  | { type: 'profile.create'; kind: ProfileKind; name: string }
  | { type: 'profile.rename'; profileId: string; name: string }
  | { type: 'profile.clone'; profileId: string; newName: string }
  | { type: 'profile.move'; profileId: string; beforeProfileId?: string }
  | { type: 'profile.delete'; profileId: string; replacementProfileId?: string };
```

内置直连和系统配置不能删除或重命名。克隆保留代理和规则引用但生成新配置 ID、规则 ID；删除弹窗显示所有引用者，不允许悄悄产生断链。

- [ ] **Step 4: 运行测试、检查与构建。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/configuration/profile-actions.test.ts apps/chrome-extension/src/runtime/profile-command.test.ts && pnpm check && pnpm build`

Expected: PASS。

- [ ] **Step 5: 提交配置生命周期界面。**

```bash
git add apps/chrome-extension/src/ui apps/chrome-extension/src/runtime
git commit -m "feat: manage profiles safely"
```

### Task 13: 实现完整固定代理服务器编辑器和认证绑定

**Files:**

- Create: `apps/chrome-extension/src/ui/components/ProxyServerForm.tsx`
- Create: `apps/chrome-extension/src/ui/components/FixedProxyEditor.tsx`
- Modify: `apps/chrome-extension/src/ui/pages/ProxyServersPage.tsx`
- Modify: `apps/chrome-extension/src/runtime/credential-repository.ts`
- Modify: `apps/chrome-extension/src/runtime/proxy-credential-binding.ts`
- Test: `apps/chrome-extension/src/ui/components/FixedProxyEditor.test.tsx`
- Test: `apps/chrome-extension/src/runtime/proxy-credential-binding.test.ts`

- [ ] **Step 1: 写出协议分别选择、绕过项和删除服务器受引用保护的失败测试。**

```ts
expect(updateFixedProfile(profile, { httpsProxyId: 'proxy-https' })).toMatchObject({
  routes: { fallbackProxyId: 'proxy-http', httpsProxyId: 'proxy-https' }
});
expect(removeProxyServer(document, 'proxy-http')).toMatchObject({
  ok: false,
  referencedBy: ['fixed-work']
});
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/components/FixedProxyEditor.test.tsx apps/chrome-extension/src/runtime/proxy-credential-binding.test.ts`

Expected: FAIL，当前模型没有协议路由映射。

- [ ] **Step 3: 实现编辑器和凭据隔离。**

```ts
export interface ProxyRoutes {
  fallbackProxyId: string;
  httpProxyId?: string;
  httpsProxyId?: string;
  ftpProxyId?: string;
}
```

账号密码只保存在 `chrome.storage.local` 的凭据仓库，配置导出、Chrome 同步、Gist 和 WebDAV 都不包含密码。代理服务器被删除时，界面显示引用的固定配置并要求先替换或删除这些引用。

- [ ] **Step 4: 运行认证与界面测试。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/components/FixedProxyEditor.test.tsx apps/chrome-extension/src/runtime/proxy-auth.test.ts apps/chrome-extension/src/runtime/proxy-credential-binding.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交代理编辑器。**

```bash
git add apps/chrome-extension/src/ui apps/chrome-extension/src/runtime
git commit -m "feat: edit protocol-specific proxy servers"
```

### Task 14: 实现自动切换规则编辑器、完整条件和虚拟列表

**Files:**

- Create: `apps/chrome-extension/src/ui/components/RuleConditionEditor.tsx`
- Create: `apps/chrome-extension/src/ui/components/RuleTargetSelect.tsx`
- Create: `apps/chrome-extension/src/ui/components/VirtualRuleTable.tsx`
- Create: `apps/chrome-extension/src/ui/configuration/rule-actions.ts`
- Modify: `apps/chrome-extension/src/ui/pages/RulesPage.tsx`
- Modify: `apps/chrome-extension/src/ui/rule-virtualizer.ts`
- Test: `apps/chrome-extension/src/ui/configuration/rule-actions.test.ts`
- Test: `apps/chrome-extension/src/ui/components/RuleConditionEditor.test.tsx`
- Test: `apps/chrome-extension/src/ui/rule-virtualizer.test.ts`

- [ ] **Step 1: 写出新增高级条件、禁用规则和 50,000 行窗口计算的失败测试。**

```ts
expect(
  addRule(document, 'auto', {
    condition: { type: 'url-regex', pattern: '^https://x\\.com/' },
    target: { profileId: 'proxy-us' }
  }).profiles
).toHaveLength(document.profiles.length);

expect(
  calculateVirtualWindow({
    scrollTop: 2_950_000,
    rowHeight: 59,
    viewportHeight: 590,
    count: 50_000,
    overscan: 5
  })
).toMatchObject({ start: expect.any(Number), end: expect.any(Number) });
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/configuration/rule-actions.test.ts apps/chrome-extension/src/ui/components/RuleConditionEditor.test.tsx apps/chrome-extension/src/ui/rule-virtualizer.test.ts`

Expected: FAIL，当前规则类型和编辑器只覆盖三种条件。

- [ ] **Step 3: 实现规则编辑操作。**

```ts
export type RuleEdit =
  | { type: 'insert'; index: number; rule: SwitchRule }
  | { type: 'update'; ruleId: string; patch: Partial<SwitchRule> }
  | { type: 'move'; ruleId: string; toIndex: number }
  | { type: 'toggle'; ruleId: string; enabled: boolean }
  | { type: 'remove'; ruleId: string };
```

复杂条件表单在用户输入时显示本地校验，但只有点击保存才提交一次完整配置。规则表只渲染可见行；排序和拖动必须按稳定 ID 操作，不能用数组下标作为 React key。

- [ ] **Step 4: 运行 UI、路由和生产构建测试。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/configuration/rule-actions.test.ts apps/chrome-extension/src/ui/components/RuleConditionEditor.test.tsx apps/chrome-extension/src/ui/rule-virtualizer.test.ts && pnpm build`

Expected: PASS。

- [ ] **Step 5: 提交规则编辑器。**

```bash
git add apps/chrome-extension/src/ui
git commit -m "feat: edit advanced auto-switch rules efficiently"
```

### Task 15: 实现 PAC、自动检测、规则列表和虚拟配置编辑器

**Files:**

- Create: `apps/chrome-extension/src/ui/components/PacProfileEditor.tsx`
- Create: `apps/chrome-extension/src/ui/components/RuleListProfileEditor.tsx`
- Create: `apps/chrome-extension/src/ui/components/VirtualProfileEditor.tsx`
- Create: `apps/chrome-extension/src/ui/components/AutoDetectProfileEditor.tsx`
- Modify: `apps/chrome-extension/src/ui/pages/ProfileListPage.tsx`
- Test: `apps/chrome-extension/src/ui/components/PacProfileEditor.test.tsx`
- Test: `apps/chrome-extension/src/ui/components/RuleListProfileEditor.test.tsx`
- Test: `apps/chrome-extension/src/ui/components/VirtualProfileEditor.test.tsx`

- [ ] **Step 1: 写出各配置编辑器保存合法最小配置的失败测试。**

```ts
expect(createPacProfile({ name: '公司 PAC', url: 'https://config.example/pac' })).toMatchObject({
  kind: 'pac',
  source: { kind: 'url', url: 'https://config.example/pac' }
});
expect(createVirtualProfile({ name: '别名', targetProfileId: 'proxy-us' })).toMatchObject({
  kind: 'virtual'
});
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/components/PacProfileEditor.test.tsx apps/chrome-extension/src/ui/components/RuleListProfileEditor.test.tsx apps/chrome-extension/src/ui/components/VirtualProfileEditor.test.tsx`

Expected: FAIL，四类配置没有编辑器。

- [ ] **Step 3: 实现四类配置表单。**

```ts
export interface PacProfile extends BaseProfile {
  kind: 'pac';
  source: PacSource;
}

export interface RuleListProfile extends BaseProfile {
  kind: 'rule-list';
  sourceId: string;
  matchProfileId: string;
  fallback: ProfileTarget;
}
```

PAC 和规则列表网址必须使用 `https:` 或用户明确确认的 `http:`；来源设置包括手动刷新、刷新间隔、自定义请求头和上次成功/错误状态。虚拟配置只能选择非自身的目标，最终由配置图校验器拒绝循环。

- [ ] **Step 4: 运行页面测试和构建。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/components/PacProfileEditor.test.tsx apps/chrome-extension/src/ui/components/RuleListProfileEditor.test.tsx apps/chrome-extension/src/ui/components/VirtualProfileEditor.test.tsx && pnpm build`

Expected: PASS。

- [ ] **Step 5: 提交高级配置编辑器。**

```bash
git add apps/chrome-extension/src/ui
git commit -m "feat: edit pac rule-list virtual and auto-detect profiles"
```

## M3：弹窗、临时规则、右键和快捷键

### Task 16: 重建弹窗的当前网站规则工作流

**Files:**

- Create: `apps/chrome-extension/src/ui/popup/current-tab.ts`
- Create: `apps/chrome-extension/src/ui/popup/current-site-rule.ts`
- Modify: `apps/chrome-extension/entrypoints/popup/PopupApp.tsx`
- Modify: `apps/chrome-extension/entrypoints/popup/style.css`
- Modify: `apps/chrome-extension/src/runtime/messages.ts`
- Test: `apps/chrome-extension/src/ui/popup/current-site-rule.test.ts`
- Test: `apps/chrome-extension/src/ui/popup/current-tab.test.ts`

- [ ] **Step 1: 写出当前页面、当前主机、当前域名三种快捷规则的失败测试。**

```ts
expect(buildCurrentSiteRule('https://sub.example.com/path?q=1', 'domain')).toEqual({
  condition: { type: 'host-wildcard', pattern: '*.example.com' }
});
expect(buildCurrentSiteRule('https://sub.example.com/path?q=1', 'host')).toEqual({
  condition: { type: 'host-wildcard', pattern: 'sub.example.com' }
});
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/popup/current-site-rule.test.ts apps/chrome-extension/src/ui/popup/current-tab.test.ts`

Expected: FAIL，当前弹窗只能添加一种固定主机规则。

- [ ] **Step 3: 实现弹窗数据和操作。**

```ts
export type CurrentSiteScope = 'page' | 'host' | 'domain';

export function buildCurrentSiteRule(
  url: string,
  scope: CurrentSiteScope
): Pick<SwitchRule, 'condition'> {
  // page 使用 url-wildcard；host 使用 host-wildcard；domain 使用可控的注册域解析器。
}
```

弹窗必须显示当前有效配置、解析后的实际配置、当前站点命中的规则、可选目标、永久添加和临时添加。`chrome://`、扩展页面、文件页面和没有 URL 的标签页禁用相关按钮并写明原因。

- [ ] **Step 4: 运行弹窗测试和构建。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/popup/current-site-rule.test.ts apps/chrome-extension/src/ui/popup/current-tab.test.ts && pnpm build`

Expected: PASS。

- [ ] **Step 5: 提交当前站点工作流。**

```bash
git add apps/chrome-extension/entrypoints/popup apps/chrome-extension/src/ui/popup apps/chrome-extension/src/runtime/messages.ts
git commit -m "feat: add current-site proxy rule workflow"
```

### Task 17: 实现临时规则和临时规则管理器

**Files:**

- Create: `apps/chrome-extension/src/runtime/temporary-rule-repository.ts`
- Create: `apps/chrome-extension/src/runtime/temporary-rule-service.ts`
- Create: `apps/chrome-extension/src/ui/pages/TemporaryRulesPage.tsx`
- Create: `apps/chrome-extension/src/ui/components/TemporaryRuleForm.tsx`
- Modify: `apps/chrome-extension/src/runtime/messages.ts`
- Modify: `apps/chrome-extension/src/runtime/background-service.ts`
- Modify: `apps/chrome-extension/entrypoints/popup/PopupApp.tsx`
- Test: `apps/chrome-extension/src/runtime/temporary-rule-service.test.ts`
- Test: `apps/chrome-extension/src/ui/components/TemporaryRuleForm.test.tsx`

- [ ] **Step 1: 写出临时规则到期、标签页范围和持久规则不受影响的失败测试。**

```ts
it('只把未过期且当前标签页匹配的临时规则加入编译计划', () => {
  const active = activeTemporaryRules(rules, { now: 1_000, tabId: 42 });
  expect(active.map((rule) => rule.id)).toEqual(['tab-42-live', 'global-live']);
});
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/temporary-rule-service.test.ts apps/chrome-extension/src/ui/components/TemporaryRuleForm.test.tsx`

Expected: FAIL，临时规则仓库和操作不存在。

- [ ] **Step 3: 实现临时规则模型和过期处理。**

```ts
export interface TemporaryRule extends SwitchRule {
  scope: { kind: 'global' } | { kind: 'tab'; tabId: number };
  expiresAt: number;
  createdAt: number;
}
```

临时规则存于 `chrome.storage.session`；浏览器完全关闭后消失。后台在每次读取、定时闹钟和标签关闭时清理过期或失效的规则，并只在临时规则集合实际变化时重新编译。

- [ ] **Step 4: 运行后台、界面和构建验证。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/temporary-rule-service.test.ts apps/chrome-extension/src/ui/components/TemporaryRuleForm.test.tsx && pnpm build`

Expected: PASS。

- [ ] **Step 5: 提交临时规则。**

```bash
git add apps/chrome-extension/src/runtime apps/chrome-extension/src/ui apps/chrome-extension/entrypoints/popup
git commit -m "feat: manage expiring temporary routing rules"
```

### Task 18: 补齐右键菜单、快捷切换和刷新策略

**Files:**

- Create: `apps/chrome-extension/src/runtime/shortcut-service.ts`
- Modify: `apps/chrome-extension/src/runtime/quick-rule-context-menu.ts`
- Modify: `apps/chrome-extension/entrypoints/background.ts`
- Modify: `apps/chrome-extension/src/runtime/messages.ts`
- Modify: `apps/chrome-extension/src/ui/pages/SettingsPage.tsx`
- Test: `apps/chrome-extension/src/runtime/shortcut-service.test.ts`
- Test: `apps/chrome-extension/src/runtime/quick-rule-context-menu.test.ts`

- [ ] **Step 1: 写出网页、链接、图片和框架右键规则目标的失败测试。**

```ts
expect(
  contextTargetFromClick({ pageUrl: 'https://app.example/a', linkUrl: 'https://cdn.example/x.js' })
).toEqual({ url: 'https://cdn.example/x.js', source: 'link' });
expect(nextProfileId(['direct', 'system', 'work'], 'system')).toBe('work');
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/shortcut-service.test.ts apps/chrome-extension/src/runtime/quick-rule-context-menu.test.ts`

Expected: FAIL，当前只支持部分页面右键规则。

- [ ] **Step 3: 实现菜单和设置。**

```ts
export interface ShortcutSettings {
  cycleProfileIds: readonly string[];
  reloadAfterProfileChange: boolean;
  ruleInsertPosition: 'first' | 'last';
}
```

为页面、选中链接、图片、音视频和框架建立菜单；目标 URL 解析失败时禁用操作。设置页控制切换后是否刷新当前标签页、规则插入开头或末尾以及快捷循环顺序。

- [ ] **Step 4: 运行菜单、快捷键和构建测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/shortcut-service.test.ts apps/chrome-extension/src/runtime/quick-rule-context-menu.test.ts && pnpm build`

Expected: PASS。

- [ ] **Step 5: 提交快捷操作。**

```bash
git add apps/chrome-extension/src/runtime apps/chrome-extension/src/ui/pages/SettingsPage.tsx apps/chrome-extension/entrypoints/background.ts
git commit -m "feat: add shortcut and context-menu controls"
```

## M4：PAC、规则列表和安全刷新

### Task 19: 解析 PAC 来源并应用更新后的 PAC

**Files:**

- Create: `apps/chrome-extension/src/runtime/source-fetcher.ts`
- Create: `apps/chrome-extension/src/runtime/pac-source-service.ts`
- Create: `apps/chrome-extension/src/runtime/source-status-repository.ts`
- Modify: `apps/chrome-extension/src/runtime/background-service.ts`
- Test: `apps/chrome-extension/src/runtime/source-fetcher.test.ts`
- Test: `apps/chrome-extension/src/runtime/pac-source-service.test.ts`

- [ ] **Step 1: 写出 ETag、请求头、超时和更新失败时保留旧 PAC 的失败测试。**

```ts
await service.refresh('pac-company');
expect(fetcher.fetch).toHaveBeenCalledWith(
  expect.objectContaining({
    headers: { Authorization: 'Bearer token', 'If-None-Match': 'old-tag' }
  })
);
expect(repository.readActivePac('pac-company')).toBe(previousPac);
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/source-fetcher.test.ts apps/chrome-extension/src/runtime/pac-source-service.test.ts`

Expected: FAIL，PAC 来源服务不存在。

- [ ] **Step 3: 实现受限制的来源获取。**

```ts
export interface FetchRuleSourceRequest {
  url: string;
  headers: Readonly<Record<string, string>>;
  timeoutMs: number;
  maxBytes: number;
  etag?: string;
}
```

使用 `AbortController` 超时，限制响应字节数，拒绝非文本 PAC，保存 ETag 和最后成功版本。抓取或校验失败时保留已应用 PAC，记录一条来源错误而不是把浏览器切为失效配置。

- [ ] **Step 4: 运行测试与构建。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/source-fetcher.test.ts apps/chrome-extension/src/runtime/pac-source-service.test.ts && pnpm build`

Expected: PASS。

- [ ] **Step 5: 提交 PAC 刷新。**

```bash
git add apps/chrome-extension/src/runtime
git commit -m "feat: refresh pac sources safely"
```

### Task 20: 解析规则列表并编译为路由规则

**Files:**

- Create: `packages/contracts/src/rule-list/auto-proxy.ts`
- Create: `packages/contracts/src/rule-list/switchy.ts`
- Create: `packages/contracts/src/rule-list/parse.ts`
- Create: `apps/chrome-extension/src/runtime/rule-list-service.ts`
- Test: `packages/contracts/src/rule-list/parse.test.ts`
- Test: `apps/chrome-extension/src/runtime/rule-list-service.test.ts`

- [ ] **Step 1: 写出 AutoProxy、Switchy 和无效行报告的失败测试。**

```ts
const result = parseRuleList('||example.com\n@@||direct.example.com', 'auto-proxy');
expect(result.rules).toEqual([
  expect.objectContaining({ condition: { type: 'host-wildcard', pattern: '*.example.com' } }),
  expect.objectContaining({ condition: { type: 'bypass', value: true } })
]);
expect(result.warnings).toEqual([]);
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run packages/contracts/src/rule-list/parse.test.ts apps/chrome-extension/src/runtime/rule-list-service.test.ts`

Expected: FAIL，规则列表解析器不存在。

- [ ] **Step 3: 实现独立的规则列表格式转换。**

```ts
export type RuleListFormat = 'auto-proxy' | 'switchy';

export interface ParsedRuleList {
  rules: readonly RuleSourceRule[];
  warnings: readonly RuleListWarning[];
  sourceDigest: string;
}
```

只实现公开文本格式；未支持的语法保留行号、原因和原文长度，不执行任意脚本。解析完成后由 `rule-list-service` 与本地规则合并，保留“本地规则优先、订阅规则随后、兜底最后”的明确顺序。

- [ ] **Step 4: 运行解析与编译回归测试。**

Run: `pnpm vitest run packages/contracts/src/rule-list/parse.test.ts apps/chrome-extension/src/runtime/rule-list-service.test.ts && pnpm test`

Expected: PASS。

- [ ] **Step 5: 提交规则列表。**

```bash
git add packages/contracts/src/rule-list apps/chrome-extension/src/runtime/rule-list-service.ts
git commit -m "feat: parse supported rule-list formats"
```

### Task 21: 实现定时刷新、手动刷新和来源状态界面

**Files:**

- Create: `apps/chrome-extension/src/runtime/source-refresh-scheduler.ts`
- Create: `apps/chrome-extension/src/ui/components/SourceStatus.tsx`
- Modify: `apps/chrome-extension/src/runtime/background-service.ts`
- Modify: `apps/chrome-extension/src/ui/components/PacProfileEditor.tsx`
- Modify: `apps/chrome-extension/src/ui/components/RuleListProfileEditor.tsx`
- Test: `apps/chrome-extension/src/runtime/source-refresh-scheduler.test.ts`
- Test: `apps/chrome-extension/src/ui/components/SourceStatus.test.tsx`

- [ ] **Step 1: 写出只调度启用且到期来源的失败测试。**

```ts
expect(sourcesDueForRefresh(sources, 1_000_000).map((source) => source.id)).toEqual([
  'daily-source'
]);
expect(nextAlarmAt({ refreshMinutes: 60, lastSuccessAt: 900_000 })).toBe(960_000);
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/source-refresh-scheduler.test.ts apps/chrome-extension/src/ui/components/SourceStatus.test.tsx`

Expected: FAIL，调度器和状态组件不存在。

- [ ] **Step 3: 实现调度和中文状态。**

```ts
export interface RefreshPolicy {
  enabled: boolean;
  refreshMinutes: number;
}
```

使用 `chrome.alarms` 触发而不是长期 `setInterval`；服务工作线程重启时重新计算闹钟。状态组件显示上次成功、上次错误、下载大小、规则数、下次刷新和“立即刷新”按钮。

- [ ] **Step 4: 运行来源和构建验证。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/source-refresh-scheduler.test.ts apps/chrome-extension/src/ui/components/SourceStatus.test.tsx && pnpm build`

Expected: PASS。

- [ ] **Step 5: 提交刷新调度。**

```bash
git add apps/chrome-extension/src/runtime apps/chrome-extension/src/ui/components
git commit -m "feat: schedule and display source refreshes"
```

## M5：网络监控、失败处理、导入导出和同步

### Task 22: 建立可关闭且限量的网络监控

**Files:**

- Create: `apps/chrome-extension/src/runtime/network-monitor.ts`
- Create: `apps/chrome-extension/src/runtime/network-event-repository.ts`
- Create: `apps/chrome-extension/src/runtime/tab-network-summary.ts`
- Modify: `apps/chrome-extension/entrypoints/background.ts`
- Modify: `apps/chrome-extension/src/runtime/messages.ts`
- Test: `apps/chrome-extension/src/runtime/network-monitor.test.ts`
- Test: `apps/chrome-extension/src/runtime/tab-network-summary.test.ts`

- [ ] **Step 1: 写出事件采样、去重、上限和关闭监控不写入事件的失败测试。**

```ts
const monitor = createNetworkMonitor({ enabled: false, repository });
monitor.onCompleted(completedEvent);
expect(repository.append).not.toHaveBeenCalled();

expect(capEvents(Array.from({ length: 5_100 }, eventFactory), 5_000)).toHaveLength(5_000);
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/network-monitor.test.ts apps/chrome-extension/src/runtime/tab-network-summary.test.ts`

Expected: FAIL，当前只有失败记录器。

- [ ] **Step 3: 实现请求时间线。**

```ts
export type NetworkPhase = 'started' | 'headers' | 'redirected' | 'completed' | 'failed';

export interface NetworkEvent {
  requestId: string;
  tabId: number;
  phase: NetworkPhase;
  url: string;
  timestamp: number;
  statusCode?: number;
  error?: string;
}
```

默认关闭完整监控，只保留失败与配置事件。开启后每个标签页最多保留 500 条、全局最多 5,000 条或 4 MB，超出先淘汰最旧记录。URL 中的敏感查询参数在保存前按白名单脱敏。

- [ ] **Step 4: 运行监控回归测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/network-monitor.test.ts apps/chrome-extension/src/runtime/tab-network-summary.test.ts apps/chrome-extension/src/runtime/network-failure-recorder.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交监控底座。**

```bash
git add apps/chrome-extension/src/runtime apps/chrome-extension/entrypoints/background.ts
git commit -m "feat: record bounded network diagnostics"
```

### Task 23: 在日志和弹窗中提供失败资源的正确修复操作

**Files:**

- Create: `apps/chrome-extension/src/ui/diagnostics/failure-remediation.ts`
- Create: `apps/chrome-extension/src/ui/components/FailureActionMenu.tsx`
- Modify: `apps/chrome-extension/src/ui/pages/DiagnosticsPage.tsx`
- Modify: `apps/chrome-extension/entrypoints/popup/PopupApp.tsx`
- Test: `apps/chrome-extension/src/ui/diagnostics/failure-remediation.test.ts`
- Test: `apps/chrome-extension/src/ui/components/FailureActionMenu.test.tsx`

- [ ] **Step 1: 写出“失败不等于必须走代理”的失败测试。**

```ts
expect(
  remediationOptions({ error: 'net::ERR_PROXY_CONNECTION_FAILED', host: 'cdn.example' })
).toContainEqual({ action: 'add-direct-rule', label: '将此域名设为直连' });
expect(
  remediationOptions({ error: 'net::ERR_CONNECTION_TIMED_OUT', host: 'api.example' })
).toContainEqual({ action: 'inspect-route', label: '查看路由判断' });
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/diagnostics/failure-remediation.test.ts apps/chrome-extension/src/ui/components/FailureActionMenu.test.tsx`

Expected: FAIL，当前失败资源只偏向加入自动切换。

- [ ] **Step 3: 实现可解释动作。**

```ts
export type FailureAction =
  | 'add-proxy-rule'
  | 'add-direct-rule'
  | 'add-temporary-proxy-rule'
  | 'add-temporary-direct-rule'
  | 'inspect-route';
```

动作菜单先显示当前命中的配置和规则，再显示可选操作；自动切换目标由用户选择，不能偷偷固定为第一个自动配置。localhost、127.0.0.1 和 `::1` 始终提示当前回环策略；如果被拦截，日志必须有对应的规则解释。

- [ ] **Step 4: 运行失败操作和生产构建。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/diagnostics/failure-remediation.test.ts apps/chrome-extension/src/ui/components/FailureActionMenu.test.tsx && pnpm build`

Expected: PASS。

- [ ] **Step 5: 提交失败修复工作流。**

```bash
git add apps/chrome-extension/src/ui
git commit -m "feat: provide explicit failure remediation actions"
```

### Task 24: 完成导入、导出、预览和恢复

**Files:**

- Create: `apps/chrome-extension/src/runtime/configuration-export.ts`
- Create: `apps/chrome-extension/src/runtime/configuration-import-service.ts`
- Create: `apps/chrome-extension/src/ui/components/ImportPreview.tsx`
- Modify: `apps/chrome-extension/src/ui/pages/DataPage.tsx`
- Modify: `apps/chrome-extension/src/runtime/messages.ts`
- Test: `apps/chrome-extension/src/runtime/configuration-import-service.test.ts`
- Test: `apps/chrome-extension/src/ui/components/ImportPreview.test.tsx`

- [ ] **Step 1: 写出导出不包含密码、导入先预览且取消不改配置的失败测试。**

```ts
expect(JSON.stringify(exportConfiguration(document))).not.toContain('secret-password');
await service.preview(legacyBackup);
expect(await repository.read()).toEqual(originalDocument);
await service.commitPreview();
expect(await repository.read()).toMatchObject({ schemaVersion: 2 });
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/configuration-import-service.test.ts apps/chrome-extension/src/ui/components/ImportPreview.test.tsx`

Expected: FAIL，当前导入直接替换且预览信息不足。

- [ ] **Step 3: 实现两阶段导入。**

```ts
export interface ImportPreview {
  document: ProfileDocumentV2;
  source: 'switchypeformance-v2' | 'switchypeformance-v1' | 'legacy';
  warnings: readonly string[];
  counts: { profiles: number; proxyServers: number; rules: number; skipped: number };
}
```

支持 `.json` 与 `.bak` 文件名，但按内容解析，不把文件后缀当作格式。导入确认时使用 Task 5 的原子事务；导出仅含可移植配置和来源状态，不含本地账号密码、网络日志或临时规则。

- [ ] **Step 4: 运行导入导出和全量测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/configuration-import-service.test.ts apps/chrome-extension/src/ui/components/ImportPreview.test.tsx && pnpm test`

Expected: PASS。

- [ ] **Step 5: 提交数据迁移界面。**

```bash
git add apps/chrome-extension/src/runtime apps/chrome-extension/src/ui
git commit -m "feat: preview and safely import configurations"
```

### Task 25: 实现外部代理检测、重置和启动配置

**Files:**

- Create: `apps/chrome-extension/src/runtime/external-proxy-state.ts`
- Create: `apps/chrome-extension/src/runtime/startup-profile-service.ts`
- Modify: `apps/chrome-extension/src/runtime/chrome-proxy.ts`
- Modify: `apps/chrome-extension/src/ui/pages/SettingsPage.tsx`
- Test: `apps/chrome-extension/src/runtime/external-proxy-state.test.ts`
- Test: `apps/chrome-extension/src/runtime/startup-profile-service.test.ts`

- [ ] **Step 1: 写出扩展未控制代理时不会覆盖外部设置的失败测试。**

```ts
expect(decideExternalProxyConflict({ controlledBy: 'other_extension' }, settings)).toEqual({
  action: 'show-conflict'
});
expect(decideExternalProxyConflict({ controlledBy: 'this_extension' }, settings)).toEqual({
  action: 'apply-startup-profile'
});
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/external-proxy-state.test.ts apps/chrome-extension/src/runtime/startup-profile-service.test.ts`

Expected: FAIL，外部控制和启动策略没有独立模块。

- [ ] **Step 3: 实现控制权和重置策略。**

```ts
export interface StartupSettings {
  startupProfileId: string;
  onExternalConflict: 'warn' | 'leave-unchanged' | 'reapply';
}
```

设置页显示“Chrome 代理由谁控制”；重置仅清除本扩展写入的配置和本扩展 `storage` 键，不删除用户系统代理。外部扩展接管时不产生“未知后台命令”之类错误，而是显示明确冲突状态。

- [ ] **Step 4: 运行代理状态与构建检查。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/external-proxy-state.test.ts apps/chrome-extension/src/runtime/startup-profile-service.test.ts && pnpm build`

Expected: PASS。

- [ ] **Step 5: 提交运行控制。**

```bash
git add apps/chrome-extension/src/runtime apps/chrome-extension/src/ui/pages/SettingsPage.tsx
git commit -m "feat: manage startup and external proxy control"
```

### Task 26: 实现 Chrome 同步、Gist 和 WebDAV 同步

**Files:**

- Create: `packages/contracts/src/sync/sync-types.ts`
- Create: `apps/chrome-extension/src/runtime/sync/chrome-sync.ts`
- Create: `apps/chrome-extension/src/runtime/sync/gist-sync.ts`
- Create: `apps/chrome-extension/src/runtime/sync/webdav-sync.ts`
- Create: `apps/chrome-extension/src/runtime/sync/conflict-resolution.ts`
- Create: `apps/chrome-extension/src/ui/pages/SyncPage.tsx`
- Modify: `apps/chrome-extension/src/runtime/messages.ts`
- Test: `apps/chrome-extension/src/runtime/sync/conflict-resolution.test.ts`
- Test: `apps/chrome-extension/src/runtime/sync/chrome-sync.test.ts`
- Test: `apps/chrome-extension/src/runtime/sync/webdav-sync.test.ts`

- [ ] **Step 1: 写出版本冲突绝不静默覆盖本地配置的失败测试。**

```ts
expect(resolveSyncConflict({ localRevision: 8, remoteRevision: 9, sameDigest: false })).toEqual({
  action: 'require-user-choice'
});
expect(resolveSyncConflict({ localRevision: 8, remoteRevision: 8, sameDigest: true })).toEqual({
  action: 'no-op'
});
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/sync/conflict-resolution.test.ts apps/chrome-extension/src/runtime/sync/chrome-sync.test.ts apps/chrome-extension/src/runtime/sync/webdav-sync.test.ts`

Expected: FAIL，同步模块不存在。

- [ ] **Step 3: 实现可验证的同步包。**

```ts
export interface SyncEnvelope {
  schemaVersion: 2;
  revision: number;
  updatedAt: number;
  digest: string;
  document: ProfileDocumentV2;
}
```

Chrome 同步按分片和摘要处理配额；Gist 与 WebDAV 使用用户输入的令牌或账号密码，只保存在本地凭据仓库，永不放入配置导出。所有远程内容先走导入预览和校验，冲突时必须让用户选择“保留本地”“使用远端”或“导出两份后再决定”。

- [ ] **Step 4: 运行同步测试、完整检查与构建。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/sync && pnpm check && pnpm build`

Expected: PASS。

- [ ] **Step 5: 提交同步功能。**

```bash
git add packages/contracts/src/sync apps/chrome-extension/src/runtime/sync apps/chrome-extension/src/ui/pages/SyncPage.tsx
git commit -m "feat: synchronize configurations with conflict protection"
```

## M6：视觉完成度、真实 Chrome 和性能验收

### Task 27: 统一中文 UI、可访问性和多尺寸布局

**Files:**

- Create: `apps/chrome-extension/src/ui/components/AppLayout.tsx`
- Create: `apps/chrome-extension/src/ui/components/EmptyState.tsx`
- Create: `apps/chrome-extension/src/ui/components/ErrorState.tsx`
- Modify: `apps/chrome-extension/entrypoints/options/style.css`
- Modify: `apps/chrome-extension/entrypoints/popup/style.css`
- Test: `apps/chrome-extension/src/ui/ui-language.test.ts`
- Test: `apps/chrome-extension/e2e/options-layout.spec.ts`

- [ ] **Step 1: 写出所有页面显示中文文案、弹窗最小宽度和设置页横向滚动的失败测试。**

```ts
expect(visibleUiText()).not.toMatch(/\b(Add|Delete|Unknown|Failed|Options)\b/);
expect(popupDimensions()).toEqual({ minWidth: 360, maxWidth: 440 });
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/ui-language.test.ts && pnpm playwright test apps/chrome-extension/e2e/options-layout.spec.ts`

Expected: FAIL，新的页面和布局验收尚未建立。

- [ ] **Step 3: 实现共享布局和可访问性约束。**

```css
.options-app {
  min-width: 760px;
  min-height: 100vh;
}

.popup-shell {
  width: min(420px, calc(100vw - 24px));
  min-width: 360px;
}
```

所有文字使用中文；错误由错误码转为用户能看懂的句子；图标按钮带 `title`、`aria-label`；不把主要操作藏在没有说明的图标中。布局只允许页面级横向滚动，不能把侧边栏和主内容叠成一条细线。

- [ ] **Step 4: 运行视觉和构建验证。**

Run: `pnpm test && pnpm build && pnpm playwright test apps/chrome-extension/e2e/options-layout.spec.ts`

Expected: PASS。

- [ ] **Step 5: 提交 UI 完成度。**

```bash
git add apps/chrome-extension/src/ui apps/chrome-extension/entrypoints
git commit -m "feat: polish Chinese extension interface"
```

### Task 28: 建立真实 Chrome、代理认证和性能回归测试

**Files:**

- Create: `apps/chrome-extension/e2e/extension-fixture.ts`
- Create: `apps/chrome-extension/e2e/proxy-routing.spec.ts`
- Create: `apps/chrome-extension/e2e/proxy-auth.spec.ts`
- Create: `apps/chrome-extension/e2e/recovery.spec.ts`
- Create: `scripts/benchmark-routing.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Test: `apps/chrome-extension/e2e/proxy-routing.spec.ts`

- [ ] **Step 1: 写出本地 HTTP 代理夹具、认证失败和 10,000/50,000 条规则基准的失败测试。**

```ts
test('10,000 条规则的配置只在保存时编译一次', async ({ extension }) => {
  await extension.replaceConfiguration(fixtureWithRules(10_000));
  const metrics = await extension.getCompilationMetrics();
  expect(metrics.compileCount).toBe(1);
  await extension.openTab('https://fixture.example/resource');
  expect(await extension.getCompilationMetrics()).toMatchObject({ compileCount: 1 });
});
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm playwright test apps/chrome-extension/e2e/proxy-routing.spec.ts apps/chrome-extension/e2e/proxy-auth.spec.ts apps/chrome-extension/e2e/recovery.spec.ts`

Expected: FAIL，Playwright 夹具和真实扩展测试尚未建立。

- [ ] **Step 3: 实现端到端夹具和基准脚本。**

```js
// scripts/benchmark-routing.mjs
const sizes = [100, 1_000, 10_000, 50_000];
for (const size of sizes) {
  const result = await benchmarkCompilation(size);
  process.stdout.write(`${size},${result.compileMs},${result.pacBytes}\n`);
}
```

夹具只使用本机测试 HTTP 服务和测试代理，不请求真实用户站点。端到端测试必须覆盖：固定 HTTP 代理、SOCKS 代理配置、认证挑战、自动切换命中、回环不代理、配置编译失败恢复、服务工作线程重启恢复和弹窗快速加规则。

- [ ] **Step 4: 运行完整发布门禁。**

Run: `pnpm format:check && pnpm check && pnpm test && cargo fmt --check && pnpm build && pnpm playwright test && node scripts/benchmark-routing.mjs`

Expected: 所有检查 PASS；基准脚本输出四行 CSV 数据。真实 x.com、Instagram 等外部网站仅在用户已提供可用代理后做手动验证，不把网络波动误判为扩展性能结果。

- [ ] **Step 5: 提交测试和基准。**

```bash
git add apps/chrome-extension/e2e scripts/benchmark-routing.mjs package.json README.md
git commit -m "test: verify chrome routing recovery and performance"
```

### Task 29: 完成发布审查、MIT 边界和可安装包

**Files:**

- Create: `docs/release-checklist.md`
- Modify: `README.md`
- Modify: `docs/architecture/clean-room-policy.md`
- Modify: `.gitignore`
- Test: `scripts/check-source-size.mjs`

- [ ] **Step 1: 写出参考目录不能被 Git 暂存的失败检查。**

```js
assert.equal(isIgnored('.reference/zeroomega-audit/omega-pac/src/profiles.coffee'), true);
assert.equal(sourceFilesOverLimit().length, 0);
```

- [ ] **Step 2: 运行失败检查。**

Run: `node scripts/check-source-size.mjs && git check-ignore -q .reference/zeroomega-audit/omega-pac/src/profiles.coffee`

Expected: 如果忽略规则或大小限制损坏则 FAIL；修复后两个命令成功。

- [ ] **Step 3: 写出发布清单。**

```markdown
- [ ] `pnpm format:check` 已通过
- [ ] `pnpm check` 已通过
- [ ] `pnpm test` 已通过
- [ ] `pnpm build` 已通过
- [ ] `pnpm playwright test` 已通过
- [ ] `.reference/` 未被 Git 跟踪
- [ ] 导出包不含代理密码、同步令牌和日志
- [ ] Chrome 解压安装成功，配置页、弹窗和右键菜单可用
```

README 必须标明：这是预发布还是稳定版、Chrome 版本要求、纯扩展限制、如何加载 `.output/chrome-mv3`、如何导出备份以及已验证的性能数据。MIT 许可证和净室规则必须保留。

- [ ] **Step 4: 执行发布门禁。**

Run: `pnpm format:check && pnpm check && pnpm test && pnpm build && git status --short && git ls-files .reference`

Expected: 前四项 PASS；`git ls-files .reference` 没有输出；工作区只剩本次发布文档变更。

- [ ] **Step 5: 提交发布文档。**

```bash
git add README.md docs .gitignore scripts/check-source-size.mjs
git commit -m "docs: document clean-room release verification"
```

## 每个里程碑的验收门槛

| 里程碑 | 必须能实际完成的事情                                                    |
| ------ | ----------------------------------------------------------------------- |
| M0     | 导入现有配置后能自动升级 V2；坏配置不会覆盖当前代理设置                 |
| M1     | 八种配置可被解析；10,000 条规则只在保存时编译；路由解释说得清当前结果   |
| M2     | 可创建、编辑、复制、删除、排序所有配置；高级规则和大列表可操作          |
| M3     | 当前网站、失败资源、右键菜单和临时规则都能指定目标配置                  |
| M4     | PAC/规则列表可手动或定时刷新，失败时继续使用上次成功版本                |
| M5     | 可查看有上限的请求记录、正确区分失败修复方式、预览导入和处理同步冲突    |
| M6     | Chrome 扩展真实运行、代理认证与恢复流程可测、性能数据可复现、可安全发布 |

## 自检结果

### 覆盖检查

- 八种配置类型：Task 1、3、9、15。
- 固定代理多协议、绕过和认证：Task 1、9、13、28。
- 十一种条件：Task 2、6、8、14。
- 弹窗快捷加规则、临时规则、右键与快捷切换：Task 16、17、18。
- PAC、规则列表、自定义请求头和刷新：Task 15、19、20、21。
- 导入、导出、在线恢复和同步：Task 4、24、26。
- 网络监控、失败解释、路由解释和性能：Task 10、22、23、28。
- 中文 UI、多尺寸和可访问性：Task 11、27。
- MIT 净室边界、文件大小、构建和发布：Task 29。

### 占位文本检查

本计划没有未定义的后续工作标记；每一项都列出了具体路径、测试命令、最小接口或数据结构，以及独立提交命令。

### 类型一致性检查

- V2 的规则目标统一为 `ProfileTarget`，字段固定为 `profileId`。
- `RuleCondition` 的条件类型在 contracts、Rust 和编辑器中使用同一组名称。
- `ProfileDocumentV2` 是导入、同步、配置事务、路由编译和导出唯一的持久化配置形状。
- `TemporaryRule` 扩展 `SwitchRule`，不会复制另一套条件或目标模型。
- `CompilationMetrics` 由 WASM 编译器产生，路由解释和性能页面只读该结果。

## 推进纪律

完整功能对齐不是一夜里堆出大量未验证代码就能算完成。目标模式会按本计划连续推进：每个小任务先测再改、每个阶段都保持可构建可安装、每次提交都可回退。只有 M6 的真实 Chrome 与代理测试通过，才可以说性能和稳定性完成验证。

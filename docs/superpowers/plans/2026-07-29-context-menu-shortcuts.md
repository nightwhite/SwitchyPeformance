# 右键规则与快捷切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让扩展把右键点击的网页、链接、媒体和框架正确加入自动切换，并能通过可配置的循环顺序快捷切换配置、按设置刷新当前页。

**Architecture:** URL 选择和配置循环都写成无 Chrome 全局对象的纯函数，用单元测试固定行为。后台只将 Chrome 的右键事件、快捷键事件和标签页刷新接到这些函数；配置保存继续走原子配置服务，不进入网页请求路径。

**Tech Stack:** TypeScript、Chrome Manifest V3、WXT、Vitest、React 19。

---

## 文件边界

| 路径                                        | 责任                                |
| ------------------------------------------- | ----------------------------------- |
| `src/runtime/quick-rule-context-menu.ts`    | 菜单 ID 与右键 URL 的安全选择       |
| `src/runtime/shortcut-service.ts`           | 配置循环顺序、下一个配置、是否刷新  |
| `packages/contracts/src/config/document.ts` | V2 快捷循环配置的兼容解析           |
| `packages/contracts/src/config/validate.ts` | 自定义循环配置引用校验              |
| `entrypoints/background.ts`                 | Chrome 菜单、快捷键、标签页刷新接线 |
| `wxt.config.ts`                             | Chrome 快捷键清单声明               |
| `src/ui/pages/V2OptionsApp.tsx`             | 运行参数中的循环顺序编辑            |

### Task 1: 固定右键 URL 选择行为

**Files:**

- Modify: `apps/chrome-extension/src/runtime/quick-rule-context-menu.test.ts`
- Modify: `apps/chrome-extension/src/runtime/quick-rule-context-menu.ts`

- [x] **Step 1: 写失败测试。**

```ts
expect(contextTargetFromClick({ linkUrl: 'https://cdn.example/file.js' })).toEqual({
  source: 'link',
  url: 'https://cdn.example/file.js'
});
expect(contextTargetFromClick({ mediaType: 'image', srcUrl: 'https://img.example/a.png' })).toEqual(
  { source: 'media', url: 'https://img.example/a.png' }
);
expect(
  contextTargetFromClick({ frameUrl: 'https://frame.example/', pageUrl: 'https://app.example/' })
).toEqual({ source: 'frame', url: 'https://frame.example/' });
expect(contextTargetFromClick({ linkUrl: 'javascript:void 0' })).toBeUndefined();
```

- [x] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/quick-rule-context-menu.test.ts`

Expected: FAIL，因为 `contextTargetFromClick` 尚不存在。

- [x] **Step 3: 最小实现。**

只接受有主机名的 `http:` 和 `https:` URL。媒体优先于链接，链接优先于框架，框架优先于页面；无效候选继续检查下一种候选，不能把 `chrome:`、`file:`、`data:` 或 `javascript:` 写入规则。

- [x] **Step 4: 重新运行测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/quick-rule-context-menu.test.ts`

Expected: PASS。

### Task 2: 固定快捷循环和刷新决策

**Files:**

- Create: `apps/chrome-extension/src/runtime/shortcut-service.ts`
- Create: `apps/chrome-extension/src/runtime/shortcut-service.test.ts`

- [x] **Step 1: 写失败测试。**

```ts
expect(nextProfileId(['direct', 'system', 'work'], 'system')).toBe('work');
expect(nextProfileId(['direct', 'system', 'work'], 'work')).toBe('direct');
expect(nextProfileId([], 'direct')).toBeUndefined();
expect(profileCycleIds(v2DocumentWithShortcutIds(['work', 'direct']))).toEqual([
  'work',
  'direct',
  'system'
]);
expect(shouldReloadAfterProfileChange(v2DocumentWithReload(true))).toBe(true);
```

- [x] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/shortcut-service.test.ts`

Expected: FAIL，因为快捷服务尚不存在。

- [x] **Step 3: 最小实现。**

V1 按 `profiles` 原顺序循环。V2 的 `shortcutProfileIds` 为空时按 `profiles` 原顺序循环；非空时优先按该有序列表，再把未列出的配置按原顺序补在末尾。当前激活配置不在列表里时，返回列表第一项；V2 的刷新开关为真时才请求刷新。

- [x] **Step 4: 重新运行测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/shortcut-service.test.ts`

Expected: PASS。

### Task 3: 保存并校验 V2 快捷顺序

**Files:**

- Modify: `packages/contracts/src/config/document.ts`
- Modify: `packages/contracts/src/config/validate.ts`
- Modify: `packages/contracts/src/config/document.test.ts`

- [x] **Step 1: 写失败测试。**

```ts
expect(
  parseProfileDocumentV2({
    ...document,
    settings: { ...document.settings, shortcutProfileIds: ['work'] }
  })
).toMatchObject({ ok: true });
expect(
  parseProfileDocumentV2({
    ...document,
    settings: { ...document.settings, shortcutProfileIds: ['missing'] }
  })
).toMatchObject({
  ok: false,
  issues: expect.arrayContaining([{ code: 'unknown-shortcut-profile' }])
});
```

- [x] **Step 2: 运行失败测试。**

Run: `pnpm vitest run packages/contracts/src/config/document.test.ts`

Expected: FAIL，因为快捷顺序尚未解析或校验。

- [x] **Step 3: 最小实现。**

`shortcutProfileIds` 保持可选，缺失时视为默认原顺序，确保已保存的 V2 配置和导入文件能继续读取。非空列表必须全为非空字符串、没有重复项、且都引用已存在的配置。

- [x] **Step 4: 重新运行 contracts 测试。**

Run: `pnpm vitest run packages/contracts/src/config/document.test.ts && pnpm check:ts`

Expected: PASS。

### Task 4: 接上 Chrome 菜单、快捷键和刷新

**Files:**

- Modify: `apps/chrome-extension/wxt.config.ts`
- Modify: `apps/chrome-extension/entrypoints/background.ts`
- Modify: `apps/chrome-extension/src/runtime/quick-rule-context-menu.test.ts`
- Modify: `apps/chrome-extension/src/runtime/shortcut-service.test.ts`

- [x] **Step 1: 写接线函数的失败测试。**

```ts
expect(quickRuleMenuContexts).toEqual(['page', 'frame', 'link', 'image', 'video', 'audio']);
expect(profileSwitchRefreshTabId({ id: 42, url: 'https://app.example/' }, true)).toBe(42);
expect(profileSwitchRefreshTabId(undefined, true)).toBeUndefined();
```

- [x] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/quick-rule-context-menu.test.ts apps/chrome-extension/src/runtime/shortcut-service.test.ts`

Expected: FAIL，因为菜单上下文与刷新选择函数尚不存在。

- [x] **Step 3: 最小实现。**

清单声明 `switch-profile-next`，建议快捷键使用 `Alt+Shift+Right`，用户仍可在 Chrome 扩展快捷键页修改。背景为所有菜单项注册网页、框架、链接和媒体上下文，点击时从 `OnClickData` 提取安全 URL。切换后仅在 V2 设置开启且标签页 ID 有效时调用 `chrome.tabs.reload(id)`；刷新失败只写诊断，不回滚已成功切换的配置。

- [x] **Step 4: 重新运行目标测试和构建。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/quick-rule-context-menu.test.ts apps/chrome-extension/src/runtime/shortcut-service.test.ts && pnpm build`

Expected: PASS。

### Task 5: 提供 V2 设置页顺序编辑

**Files:**

- Create: `apps/chrome-extension/src/ui/pages/v2-shortcut-order.ts`
- Create: `apps/chrome-extension/src/ui/pages/v2-shortcut-order.test.ts`
- Modify: `apps/chrome-extension/src/ui/pages/V2OptionsApp.tsx`

- [x] **Step 1: 写失败测试。**

```ts
expect(moveShortcutProfile(['direct', 'work', 'auto'], 'work', 'up')).toEqual([
  'work',
  'direct',
  'auto'
]);
expect(moveShortcutProfile(['direct'], 'direct', 'down')).toEqual(['direct']);
```

- [x] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/pages/v2-shortcut-order.test.ts`

Expected: FAIL，因为排序辅助函数尚不存在。

- [x] **Step 3: 最小实现。**

运行参数页显示“快捷切换顺序”，用上移/下移图标按钮排序。首次修改把默认的全部配置顺序写入 `shortcutProfileIds`，避免保存空数组的歧义；配置删除后的数据一致性继续由替换校验保护。

- [x] **Step 4: 运行界面和完整质量检查。**

Run: `pnpm test && pnpm check:ts && pnpm format:check && cargo fmt --check && pnpm build`

Expected: PASS。

- [x] **Step 5: 提交。**

```bash
git add packages/contracts/src apps/chrome-extension/src apps/chrome-extension/entrypoints apps/chrome-extension/wxt.config.ts docs/superpowers/plans/2026-07-29-context-menu-shortcuts.md
git commit -m "feat: add shortcut and context-menu controls"
```

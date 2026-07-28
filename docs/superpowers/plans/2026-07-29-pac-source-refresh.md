# PAC 安全刷新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 远程 PAC 在配置切换时使用已经验证的本地缓存；首次加载或地址变更时受限下载，下载失败不替换当前 Chrome 代理设置。

**Architecture:** 远程 PAC 的配置仍只保存来源地址、请求头和刷新策略；正文与 ETag 存在 `chrome.storage.local` 的独立来源状态仓库。应用配置前，PAC 来源服务把活动远程 PAC 覆盖成内嵌缓存文本；无缓存时才发起下载。下载、缓存和 Chrome 应用是三段独立责任，任何下载失败都不会把 Chrome 改成空 PAC。

**Tech Stack:** TypeScript、Chrome Manifest V3 service worker、Fetch API、AbortController、chrome.storage.local、Vitest。

---

## 边界和限制

- 不安装本机服务，不使用 SQLite，不新增 `unlimitedStorage` 权限。
- 每份 PAC 最大 1 MiB；超过限制直接拒绝，避免耗尽 Chrome 的本地扩展存储。
- 只接受 `http:` / `https:` 远程来源，且只接受常见 PAC 文本 MIME 类型或没有 MIME 类型的响应。
- 缓存记录只保存 PAC 文本、URL、ETag、最后修改时间、字节数和时间，不复制请求头中的密钥。
- 远程地址变化时不复用旧地址的正文；同地址刷新失败时继续使用旧正文。
- 后台重新应用缓存不访问网络，普通网页请求更不会访问网络或扫描规则。

## 文件边界

| 路径                                               | 责任                                   |
| -------------------------------------------------- | -------------------------------------- |
| `src/runtime/source-fetcher.ts`                    | 超时、请求头、ETag、MIME 和字节限制    |
| `src/runtime/source-status-repository.ts`          | 来源正文与成功/失败状态的持久化        |
| `src/runtime/pac-source-service.ts`                | 缓存命中、首次下载、失效恢复和文档覆盖 |
| `src/runtime/chrome-repositories.ts`               | 将来源状态接到 `chrome.storage.local`  |
| `entrypoints/background.ts`                        | 在应用 Chrome 代理前解析活动 PAC       |
| `src/ui/configuration/advanced-profile-actions.ts` | 允许 PAC 使用自定义请求头              |
| `src/ui/components/PacProfileEditor.tsx`           | 显示可编辑的 PAC 请求头                |
| `src/runtime/*test.ts`                             | 下载、缓存、回退和配置应用契约         |

### Task 1: 写受限文本下载器

**Files:**

- Create: `apps/chrome-extension/src/runtime/source-fetcher.ts`
- Create: `apps/chrome-extension/src/runtime/source-fetcher.test.ts`

- [x] **Step 1: 写失败测试。**

```ts
const result = await fetcher.fetch({
  url: 'https://pac.example.test/proxy.pac',
  headers: [{ name: 'Authorization', value: 'Bearer token' }],
  etag: 'old-tag',
  maxBytes: 128,
  timeoutMs: 500
});
expect(fetch).toHaveBeenCalledWith(
  'https://pac.example.test/proxy.pac',
  expect.objectContaining({
    headers: expect.objectContaining({
      Authorization: 'Bearer token',
      'If-None-Match': 'old-tag'
    })
  })
);
expect(result).toMatchObject({ kind: 'content', text: expect.stringContaining('FindProxyForURL') });
```

还要覆盖 304、非文本 MIME、超时和超过 `maxBytes`。

- [x] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/source-fetcher.test.ts`

Expected: FAIL，因为下载器不存在。

- [x] **Step 3: 最小实现。**

实现 `createSourceFetcher`。使用 `AbortController` 和一次性定时器；请求头不能覆盖用户声明的同名字段，只有用户未给 ETag 时才追加 `If-None-Match`。通过流式读取累加 `Uint8Array` 字节数，超过上限立即取消。接受 `text/*`、`application/javascript`、`application/ecmascript`、`application/x-javascript-config`、`application/x-ns-proxy-autoconfig` 和无 MIME；正文必须非空。

- [x] **Step 4: 重新运行测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/source-fetcher.test.ts`

Expected: PASS。

### Task 2: 保存 PAC 成功版本和失败状态

**Files:**

- Create: `apps/chrome-extension/src/runtime/source-status-repository.ts`
- Create: `apps/chrome-extension/src/runtime/source-status-repository.test.ts`
- Modify: `apps/chrome-extension/src/runtime/chrome-repositories.ts`

- [x] **Step 1: 写失败测试。**

```ts
await repository.saveContent({
  sourceId: 'pac:company',
  url: 'https://pac.example.test/proxy.pac',
  text: 'function FindProxyForURL(){return "DIRECT";}',
  byteLength: 51,
  fetchedAt: 1_000,
  etag: 'tag-1'
});
await repository.saveFailure('pac:company', '下载超时', 2_000);
expect(await repository.get('pac:company')).toMatchObject({
  text: expect.stringContaining('FindProxyForURL'),
  etag: 'tag-1',
  lastError: '下载超时'
});
```

- [x] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/source-status-repository.test.ts`

Expected: FAIL，因为状态仓库不存在。

- [x] **Step 3: 最小实现。**

状态仓库用单一记录映射保存，并串行化读改写。成功写入替换正文、URL、ETag、最后修改时间、字节数和成功时间，同时清除旧错误；失败只更新错误时间和文本，保留原正文。

- [x] **Step 4: 重新运行测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/source-status-repository.test.ts`

Expected: PASS。

### Task 3: 将活动远程 PAC 覆盖为缓存内容

**Files:**

- Create: `apps/chrome-extension/src/runtime/pac-source-service.ts`
- Create: `apps/chrome-extension/src/runtime/pac-source-service.test.ts`
- Modify: `apps/chrome-extension/src/runtime/chrome-repositories.ts`

- [x] **Step 1: 写失败测试。**

```ts
const resolved = await service.resolveForApply(remotePacDocument());
expect(fetcher.fetch).toHaveBeenCalledTimes(1);
expect(activePacSource(resolved)).toEqual({
  kind: 'inline',
  text: 'function FindProxyForURL(){return "DIRECT";}'
});

fetcher.fetch.mockRejectedValueOnce(new Error('网络超时'));
const fallback = await service.refreshAndResolve(remotePacDocument());
expect(activePacSource(fallback)).toEqual({
  kind: 'inline',
  text: 'function FindProxyForURL(){return "DIRECT";}'
});
expect((await repository.get('pac:company'))?.lastError).toBe('网络超时');
```

另行覆盖 304 保留正文、地址变更不能用旧正文、非活动 PAC 不下载、虚拟配置指向 PAC 时仍正确覆盖最终 PAC。

- [x] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/pac-source-service.test.ts`

Expected: FAIL，因为 PAC 服务不存在。

- [x] **Step 3: 最小实现。**

`resolveForApply` 在活动配置不是 PAC、PAC 是内嵌文本或缓存 URL 不一致时分别跳过、直接返回或首次下载。缓存 URL 一致时只覆盖为缓存正文，不触网。显式 `refreshAndResolve` 用 ETag 下载；失败时有同 URL 正文则保存错误并返回旧正文，没有同 URL 正文则抛出错误，交给现有原子配置服务保留旧 Chrome 配置。

- [x] **Step 4: 重新运行测试。**

Run: `pnpm vitest run apps/chrome-extension/src/runtime/pac-source-service.test.ts`

Expected: PASS。

### Task 4: 接到配置应用和 PAC 编辑器

**Files:**

- Modify: `apps/chrome-extension/entrypoints/background.ts`
- Modify: `apps/chrome-extension/src/ui/configuration/advanced-profile-actions.ts`
- Modify: `apps/chrome-extension/src/ui/configuration/advanced-profile-actions.test.ts`
- Modify: `apps/chrome-extension/src/ui/components/PacProfileEditor.tsx`

- [x] **Step 1: 写失败测试。**

```ts
const updated = updatePacProfile(document, 'pac', {
  allowInsecureHttp: false,
  source: {
    kind: 'url',
    url: 'https://pac.example.test/private.pac',
    headers: [{ name: 'Authorization', value: 'Bearer token' }],
    refresh: { enabled: true, refreshMinutes: 60 }
  }
});
expect(activePac(updated).source.headers).toEqual([
  { name: 'Authorization', value: 'Bearer token' }
]);
```

- [x] **Step 2: 运行失败测试。**

Run: `pnpm vitest run apps/chrome-extension/src/ui/configuration/advanced-profile-actions.test.ts apps/chrome-extension/src/runtime/pac-source-service.test.ts`

Expected: FAIL，因为 PAC 编辑仍拒绝自定义请求头或后台没有调用 PAC 服务。

- [x] **Step 3: 最小实现。**

背景的 `apply` 依赖先完成临时规则覆盖，再完成 PAC 缓存覆盖，最后调用现有 `applyConfiguration`。更新 PAC 配置时允许已经通过来源字段校验的请求头；PAC 编辑器始终显示请求头输入。远程 PAC 第一次切换没有缓存且下载失败时，原子配置服务不保存候选配置且 Chrome 保持旧代理设置。

- [x] **Step 4: 完整验证。**

Run: `pnpm test && pnpm check:ts && pnpm format:check && cargo fmt --check && pnpm build`

Expected: PASS。

- [ ] **Step 5: 提交。**

```bash
git add apps/chrome-extension/src/runtime apps/chrome-extension/src/ui apps/chrome-extension/entrypoints
git commit -m "feat: refresh pac sources safely"
```

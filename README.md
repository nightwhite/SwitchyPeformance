# SwitchyPeformance

SwitchyPeformance 是只支持 Chrome 的代理配置扩展。它把复杂自动切换规则在保存时编译好，网页加载时由 Chrome 直接执行已生成的路由规则，并提供可操作的排查日志。

当前版本是 `0.1.0` 预发布版。项目采用 MIT 协议，独立实现；不包含、导入、打包或改写 ZeroOmega、SwitchyOmega 或其他代理扩展的代码、资源、翻译、测试或构建产物。

## 能做什么

- 直连、系统代理、固定代理、PAC、自动检测、自动切换、规则列表和虚拟配置。
- HTTP、HTTPS、SOCKS4、SOCKS5 代理；HTTP 代理账号密码只保存在本机 Chrome 存储中。
- 主机、网址、正则、IP/CIDR、关键字、时间和星期等自动切换条件。
- 弹窗快速添加当前页、主机或主域规则；临时全局规则；右键菜单和快捷切换。
- 规则列表和 PAC 来源刷新；导入、导出、`.bak` 迁移；Chrome 同步、Gist、WebDAV 和冲突处理。
- 请求失败记录、路由解释、代理认证提示和直接加入规则的修复操作。

## 运行边界

- 不安装原生程序、后台守护进程、SQLite、本地服务或辅助工具。
- 扩展不负责连接、加速或转发代理流量。Chrome 连接用户填写的 HTTP/SOCKS 代理，因此代理握手速度取决于 Chrome、网络和代理服务器本身。
- 自动切换只在配置保存、订阅刷新或临时规则变化时重新编译；普通网页请求不会让后台逐条扫描规则。
- Chrome 的代理设置是浏览器级设置。临时规则会影响普通窗口中的全部网页，不能伪装成只影响一个标签页的功能。
- `localhost`、`127.*` 等回环地址默认直连；只有用户明确允许“使用规则”时才可能参与自动切换。

## 要求

- Chrome 120 或更新版本。
- 开发或构建时需要 Node.js 22.17+、pnpm 9.15+、Rust 和 `wasm-bindgen`。
- 使用扩展本身不需要安装 Node.js、Rust 或任何本地服务。

## 安装

从源码构建并以开发者模式加载：

```bash
pnpm install
pnpm build
```

打开 `chrome://extensions`，开启开发者模式，选择“加载已解压的扩展程序”，然后选择 `apps/chrome-extension/.output/chrome-mv3`。

生成可分发压缩包：

```bash
pnpm package:chrome
```

该命令会生成 Chrome 的解压安装包。Chrome 不能直接加载 ZIP，需要先解压再按上面的方式加载。

## 备份与恢复

在设置页打开“导入与导出”：

1. 点击“导出 JSON”生成配置备份。
2. 选择 JSON 或 `.bak` 备份文件。
3. 先确认导入预览，再应用配置。

备份不会包含代理账号密码、同步令牌、日志或下载缓存。导入后需要在当前 Chrome 中重新填写代理账号密码。

## 性能基准

运行下面的命令可在本机复测 WASM 路由编译；输出三列依次是规则数、编译毫秒数和生成 PAC 的字节数。

```bash
pnpm benchmark:routing
```

2026-07-29 在开发机上的一次基准结果：

| 规则数 |   编译时间 |    PAC 大小 |
| -----: | ---------: | ----------: |
|    100 |   9.051 ms |     4,365 B |
|  1,000 |   6.989 ms |    34,965 B |
| 10,000 |  50.446 ms |   358,965 B |
| 50,000 | 311.385 ms | 1,878,965 B |

这些数字衡量的是保存配置时的编译，不是网页加载延迟。真实 Chrome 回归还会验证 HTTP、SOCKS5、认证、回环保护、重启恢复和 10,000 条规则导航不重新编译。

## 验证

```bash
pnpm check
pnpm test
pnpm build
pnpm test:e2e
pnpm benchmark:routing
pnpm package:chrome
```

第一次运行端到端测试前，需要安装测试用 Chromium：

```bash
pnpm exec playwright install chromium
```

详细发布门禁见[发布检查清单](docs/release-checklist.md)。

## 净室边界

被 Git 忽略的 `.reference/` 目录仅用于临时、本地且不发布的参考资料。它不参与构建，也不能提交或复制进产品。详见[净室开发规范](docs/architecture/clean-room-policy.md)。

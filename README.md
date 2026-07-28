# SwitchyPeformance

SwitchyPeformance 是仅面向 Chrome 的代理配置管理扩展，重点是快速路由、可预测行为和可排查的日志。

这是一个独立实现的 MIT 项目。项目不会包含、导入、打包或从 ZeroOmega、SwitchyOmega 或其他代理扩展中派生任何代码、资源、翻译、测试或构建产物。

## 产品原则

- 不安装原生程序、后台守护进程、本地服务或单独的辅助工具。
- 代理连接由 Chrome 负责；扩展只负责配置和路由选择。
- 只要 Chrome 允许，路由判断就不进入网页加载的关键路径。
- 复杂配置只在保存时编译成优化的 PAC 程序，不会在每次加载网页时反复解析规则。
- 排查日志只保存数量受限的失败和配置事件，不记录成功请求。
- 每个生产代码文件不超过 2,000 行，共用逻辑放入可复用模块。

## 技术栈

- 扩展界面使用 TypeScript 和 React。
- 配置校验、匹配索引和 PAC 编译使用 Rust 编译出的 WebAssembly。
- 使用 Chrome Manifest V3 服务工作线程和 Chrome 代理 API。
- 使用 pnpm 工作区、Vitest、Cargo 测试和 Chrome 生产构建。

## 当前状态

当前开发版本支持直连、系统代理、固定代理和自动切换配置；本地代理账号密码；优化的 PAC 编译；排查日志；路由检查；旧版 JSON/`.bak` 导入；以及来自弹窗、排查日志和右键菜单的快捷规则。

执行 `pnpm build` 后，在 Chrome 扩展程序的开发者模式中加载 `apps/chrome-extension/.output/chrome-mv3` 目录。浏览器级稳定性验证完成前，它仍属于预发布版本。

## 参考边界

被 Git 忽略的 `.reference/` 目录仅用于临时、本地且不发布的参考资料。该目录下的内容不得提交或复制到本项目中。详见[净室开发规范](docs/architecture/clean-room-policy.md)。

# Chrome 临时规则边界

## 结论

SwitchyPeformance 是纯 Chrome MV3 扩展，不能安全实现“只影响一个标签页”的代理临时规则。

Chrome 的 `chrome.proxy.settings` 是浏览器级设置，范围只有普通窗口和无痕窗口。自动切换使用的 PAC 入口是 `FindProxyForURL(url, host)`，参数中没有标签页编号、窗口编号或页面身份。因此，任何把标签页编号写进临时规则的实现，最终都会退化为全局规则，或者在标签页切换时反复改全局代理设置；后者会导致其他页面请求被错误切换，不能采用。

## 可实现的语义

临时规则采用以下明确语义：

| 项目     | 语义                                                       |
| -------- | ---------------------------------------------------------- |
| 作用范围 | 所有普通窗口标签页                                         |
| 生命周期 | `chrome.storage.session`；浏览器重启、扩展重载或更新后消失 |
| 到期     | 由 `chrome.alarms` 清理；任意后台操作也会顺手清理          |
| 优先级   | 新建临时规则优先于永久自动切换规则；后创建的临时规则优先   |
| 持久配置 | 永不修改 `chrome.storage.local` 中的用户配置               |
| 路由编译 | 只在临时规则集合实际变化、到期或删除时重新生成 PAC         |

界面必须把它写成“临时全局规则”，不能使用“当前标签页”或“仅此页面”等误导性措辞。

## 数据流

```text
弹窗 / 设置页
   | 临时规则命令
   v
TemporaryRuleService
   | chrome.storage.session
   v
临时规则集合 ----> 覆盖到内存中的自动切换配置 ----> PAC 编译 ----> Chrome 代理设置
                         ^
                         |
                 永久配置（chrome.storage.local，保持不变）
```

`route.explain` 也必须使用覆盖后的内存配置，确保弹窗显示的命中规则与 Chrome 实际运行的 PAC 一致。

## 依据

2026-07-29 复核 Chrome 官方扩展文档：`chrome.proxy.settings` 的 PAC 示例只有 `FindProxyForURL(url, host)`；`chrome.storage.session` 适用于浏览器会话内数据；MV3 service worker 的延迟任务应使用 `chrome.alarms`。这些接口都不提供每标签页代理路由能力。

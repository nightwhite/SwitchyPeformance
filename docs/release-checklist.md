# 发布检查清单

## 代码与许可

- [ ] `LICENSE` 仍为 MIT，README 明确说明独立实现边界。
- [ ] `git ls-files .reference` 没有输出。
- [ ] `git check-ignore -q .reference/zeroomega-audit/omega-pac/src/profiles.coffee` 成功。
- [ ] `node scripts/check-source-size.mjs` 成功，生产源码没有超过 2,000 行。
- [ ] 导出配置、同步包和日志中不包含代理密码或同步令牌。

## 自动验证

- [ ] `pnpm format:check` 成功。
- [ ] `pnpm check` 成功。
- [ ] `pnpm test` 成功。
- [ ] `cargo fmt --all -- --check` 成功。
- [ ] `pnpm build` 成功。
- [ ] `pnpm test:e2e` 成功。
- [ ] `pnpm benchmark:routing` 输出 100、1,000、10,000、50,000 四行 CSV 数据。

## Chrome 安装验证

- [ ] `pnpm package:chrome` 生成可解压的 Chrome 安装包。
- [ ] 在 Chrome 120+ 的开发者模式加载 `apps/chrome-extension/.output/chrome-mv3`。
- [ ] 设置页、弹窗、右键菜单和快捷切换均可打开。
- [ ] HTTP、SOCKS5、账号密码、自动切换和回环直连的真实 Chrome 回归通过。
- [ ] 导出后导入预览正常，代理账号密码没有出现在备份文件中。

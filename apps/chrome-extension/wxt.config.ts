import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'SwitchyPeformance',
    description: '为 HTTP、HTTPS 和 SOCKS 代理提供快速的本地路由。',
    minimum_chrome_version: '120',
    permissions: [
      'alarms',
      'contextMenus',
      'proxy',
      'storage',
      'tabs',
      'webRequest',
      'webRequestAuthProvider'
    ],
    host_permissions: ['<all_urls>'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
    }
  }
});

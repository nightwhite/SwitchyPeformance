import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'SwitchyPeformance',
    description: 'Fast local routing for HTTP, HTTPS, and SOCKS proxies.',
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
    host_permissions: ['<all_urls>']
  }
});
